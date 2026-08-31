/**
 * Крипто-ядро. Реализация схемы из docs/crypto-design.md.
 *
 * Инвариант, который обязан соблюдать любой код здесь: ключевая фраза,
 * recovery-код и открытый текст постов не покидают этот модуль и не попадают
 * ни в сеть, ни в логи, ни в сообщения об ошибках.
 *
 * Посты шифруются мастер-ключом DEK, а фраза защищает только его обёртку.
 * Поэтому смена фразы стоит 48 байт вместо перешифровки всех данных.
 */

// ---------------------------------------------------------------- параметры

export const KDF_ALGO = "PBKDF2-SHA256";

/** Должно совпадать с CryptoEnvelopeRules::MIN_KDF_ITERATIONS на бэкенде. */
export const KDF_ITERATIONS = 600_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const DEK_BITS = 256;

/** Константа для канарейки. Менять нельзя — сломает вход существующим людям. */
const VERIFIER_PLAINTEXT = "litoreya-v1";

/** Версия формата открытого текста поста. См. crypto-design.md §2.3. */
export const PAYLOAD_VERSION = 1;

// ---------------------------------------------------------------- типы

/** То, что хранится на сервере. Расшифровать это без фразы невозможно. */
export type CryptoEnvelope = {
  kdf_algo: string;
  kdf_iterations: number;
  kdf_salt: string;
  wrapped_dek: string;
  wrapped_dek_iv: string;
  recovery_salt: string;
  recovery_dek: string;
  recovery_dek_iv: string;
  verifier: string;
  verifier_iv: string;
};

/** Обёртка мастер-ключа новой фразой — всё, что меняется при смене фразы. */
export type KeyphraseWrapper = Pick<
  CryptoEnvelope,
  "kdf_algo" | "kdf_iterations" | "kdf_salt" | "wrapped_dek" | "wrapped_dek_iv"
>;

export type EncryptedPayload = {
  iv: string;
  ciphertext: string;
  payload_version: number;
};

export class WrongKeyphraseError extends Error {
  constructor() {
    super("Неверная ключевая фраза");
    this.name = "WrongKeyphraseError";
  }
}

/**
 * Обёртка развернулась, но получившийся DEK не тот, которым зашифрованы данные.
 * Признак рассинхрона в БД, а не ошибки пользователя (crypto-design.md §5.3).
 */
export class EnvelopeMismatchError extends Error {
  constructor() {
    super("Крипто-конверт повреждён: ключ не соответствует данным");
    this.name = "EnvelopeMismatchError";
  }
}

// ---------------------------------------------------------------- base64

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------- нормализация

/**
 * Приведение ключевой фразы к каноническому виду.
 *
 * NFKC обязателен: фраза будет на кириллице, а разные платформы и мобильные
 * клавиатуры дают разные Unicode-нормализации визуально одной строки. Без этого
 * фраза, введённая с телефона, не подойдёт к ключу, созданному на десктопе,
 * и воспроизвести проблему будет практически нечем.
 *
 * trim — потому что автокоррекция охотно добавляет пробел в конец.
 *
 * Применяется одинаково при создании и при проверке — здесь и нигде больше.
 */
export function normalizeKeyphrase(phrase: string): string {
  return phrase.normalize("NFKC").trim();
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Recovery-код записывается на бумагу, поэтому нормализация терпима к тому,
 * как его перепишут: регистр, дефисы, пробелы и путаница O/0, I/L/1.
 */
export function normalizeRecoveryCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

/**
 * 160 бит энтропии в алфавите Crockford base32 — без символов, которые путают
 * при переписывании от руки (I, L, O, U).
 */
export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));

  let bits = 0;
  let value = 0;
  let out = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  return out.match(/.{1,4}/g)!.join("-");
}

// ---------------------------------------------------------------- ключи

async function deriveKEK(
  secret: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: DEK_BITS },
    // KEK сам неизвлекаем: он нужен только чтобы обернуть и развернуть DEK
    false,
    ["wrapKey", "unwrapKey"],
  );
}

async function wrapDEK(
  dek: CryptoKey,
  kek: CryptoKey,
): Promise<{ wrapped: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, {
    name: "AES-GCM",
    iv,
  });

  return { wrapped: toBase64(wrapped), iv: toBase64(iv) };
}

/**
 * Всегда возвращает НЕизвлекаемый ключ: такой CryptoKey нельзя прочитать из JS,
 * только использовать. Это то, что делает безопасным его хранение в IndexedDB —
 * XSS сможет расшифровать данные, пока жива сессия, но не унесёт ключ наружу.
 */
async function unwrapDEK(
  wrapped: string,
  iv: string,
  kek: CryptoKey,
  extractable = false,
): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey(
      "raw",
      fromBase64(wrapped) as BufferSource,
      kek,
      { name: "AES-GCM", iv: fromBase64(iv) as BufferSource },
      { name: "AES-GCM", length: DEK_BITS },
      extractable,
      ["encrypt", "decrypt"],
    );
  } catch {
    // AES-GCM самопроверяем: неверный KEK не даёт мусор, а роняет расшифровку
    throw new WrongKeyphraseError();
  }
}

async function makeVerifier(
  dek: CryptoKey,
): Promise<{ verifier: string; verifier_iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    dek,
    new TextEncoder().encode(VERIFIER_PLAINTEXT),
  );

  return { verifier: toBase64(ciphertext), verifier_iv: toBase64(iv) };
}

async function assertVerifier(
  dek: CryptoKey,
  envelope: CryptoEnvelope,
): Promise<void> {
  let plaintext: ArrayBuffer;

  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.verifier_iv) as BufferSource },
      dek,
      fromBase64(envelope.verifier) as BufferSource,
    );
  } catch {
    throw new EnvelopeMismatchError();
  }

  if (new TextDecoder().decode(plaintext) !== VERIFIER_PLAINTEXT) {
    throw new EnvelopeMismatchError();
  }
}

// ---------------------------------------------------------------- операции

/**
 * Регистрация: создаёт мастер-ключ и две его обёртки — под ключевой фразой и
 * под recovery-кодом.
 *
 * Recovery-код возвращается ровно один раз и нигде не сохраняется: показать
 * его пользователю — единственная возможность.
 */
export async function createEnvelope(keyphrase: string): Promise<{
  envelope: CryptoEnvelope;
  recoveryCode: string;
  dek: CryptoKey;
}> {
  const phrase = normalizeKeyphrase(keyphrase);
  const recoveryCode = generateRecoveryCode();

  const kdfSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const recoverySalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const [kek, recoveryKek] = await Promise.all([
    deriveKEK(phrase, kdfSalt, KDF_ITERATIONS),
    deriveKEK(normalizeRecoveryCode(recoveryCode), recoverySalt, KDF_ITERATIONS),
  ]);

  // Извлекаемый — иначе wrapKey бросит InvalidAccessError (crypto-design.md §5.2)
  const extractableDek = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: DEK_BITS },
    true,
    ["encrypt", "decrypt"],
  );

  const [phraseWrap, recoveryWrap, verifier] = await Promise.all([
    wrapDEK(extractableDek, kek),
    wrapDEK(extractableDek, recoveryKek),
    makeVerifier(extractableDek),
  ]);

  const envelope: CryptoEnvelope = {
    kdf_algo: KDF_ALGO,
    kdf_iterations: KDF_ITERATIONS,
    kdf_salt: toBase64(kdfSalt),
    wrapped_dek: phraseWrap.wrapped,
    wrapped_dek_iv: phraseWrap.iv,
    recovery_salt: toBase64(recoverySalt),
    recovery_dek: recoveryWrap.wrapped,
    recovery_dek_iv: recoveryWrap.iv,
    ...verifier,
  };

  // Извлекаемую версию отбрасываем и разворачиваем заново — в работу уходит
  // только неизвлекаемый ключ
  const dek = await unwrapDEK(envelope.wrapped_dek, envelope.wrapped_dek_iv, kek);

  return { envelope, recoveryCode, dek };
}

/** Вход: разворачивает мастер-ключ ключевой фразой. */
export async function unlockWithKeyphrase(
  keyphrase: string,
  envelope: CryptoEnvelope,
): Promise<CryptoKey> {
  const kek = await deriveKEK(
    normalizeKeyphrase(keyphrase),
    fromBase64(envelope.kdf_salt),
    envelope.kdf_iterations,
  );

  const dek = await unwrapDEK(envelope.wrapped_dek, envelope.wrapped_dek_iv, kek);
  await assertVerifier(dek, envelope);

  return dek;
}

/** Восстановление доступа по коду, выданному при регистрации. */
export async function unlockWithRecoveryCode(
  recoveryCode: string,
  envelope: CryptoEnvelope,
): Promise<CryptoKey> {
  const kek = await deriveKEK(
    normalizeRecoveryCode(recoveryCode),
    fromBase64(envelope.recovery_salt),
    envelope.kdf_iterations,
  );

  const dek = await unwrapDEK(envelope.recovery_dek, envelope.recovery_dek_iv, kek);
  await assertVerifier(dek, envelope);

  return dek;
}

/**
 * Смена ключевой фразы: DEK разворачивается старой фразой и заново оборачивается
 * новой. Посты не читаются и не изменяются.
 *
 * Требует старую фразу не только ради UX: ключ из KeyVault неизвлекаем, а
 * wrapKey работает только с extractable-ключом (crypto-design.md §5.2).
 */
export async function rewrapForNewKeyphrase(
  oldKeyphrase: string,
  newKeyphrase: string,
  envelope: CryptoEnvelope,
): Promise<KeyphraseWrapper> {
  const oldKek = await deriveKEK(
    normalizeKeyphrase(oldKeyphrase),
    fromBase64(envelope.kdf_salt),
    envelope.kdf_iterations,
  );

  const dek = await unwrapDEK(
    envelope.wrapped_dek,
    envelope.wrapped_dek_iv,
    oldKek,
    true, // временно извлекаемый — только чтобы обернуть заново
  );

  await assertVerifier(dek, envelope);

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const kek = await deriveKEK(normalizeKeyphrase(newKeyphrase), salt, KDF_ITERATIONS);
  const { wrapped, iv } = await wrapDEK(dek, kek);

  return {
    kdf_algo: KDF_ALGO,
    kdf_iterations: KDF_ITERATIONS,
    kdf_salt: toBase64(salt),
    wrapped_dek: wrapped,
    wrapped_dek_iv: iv,
  };
}

// ---------------------------------------------------------------- данные

/**
 * Шифрует содержимое поста. Заголовок тоже внутри шифротекста — сервер не должен
 * видеть даже его.
 */
export async function encryptPayload(
  dek: CryptoKey,
  payload: unknown,
): Promise<EncryptedPayload> {
  // Новый IV на каждое сохранение: повтор IV при одном ключе разрушает AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    dek,
    new TextEncoder().encode(JSON.stringify(payload)),
  );

  return {
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    payload_version: PAYLOAD_VERSION,
  };
}

export async function decryptPayload<T>(
  dek: CryptoKey,
  payload: Pick<EncryptedPayload, "iv" | "ciphertext">,
): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(payload.iv) as BufferSource },
    dek,
    fromBase64(payload.ciphertext) as BufferSource,
  );

  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
