import { beforeAll, describe, expect, it } from "vitest";
import {
  createEnvelope,
  decryptPayload,
  encryptPayload,
  EnvelopeMismatchError,
  generateRecoveryCode,
  normalizeKeyphrase,
  normalizeRecoveryCode,
  PAYLOAD_VERSION,
  rewrapForNewKeyphrase,
  toBase64,
  unlockWithKeyphrase,
  unlockWithRecoveryCode,
  WrongKeyphraseError,
  type CryptoEnvelope,
} from "./crypto";

/*
 * Чек-лист из docs/crypto-design.md §7. Модуль пишется первым и покрывается
 * тестами до появления UI: ошибка здесь не чинится патчем, она чинится
 * перешифровкой данных всех пользователей.
 *
 * PBKDF2 намеренно медленный (600k итераций), поэтому конверт создаётся один раз
 * на весь набор, а не в каждом тесте.
 */

const PHRASE = "правильная лошадь батарейка скрепка";

let envelope: CryptoEnvelope;
let recoveryCode: string;

beforeAll(async () => {
  const created = await createEnvelope(PHRASE);
  envelope = created.envelope;
  recoveryCode = created.recoveryCode;
}, 60_000);

describe("конверт", () => {
  it("объявляет параметры KDF, которые примет сервер", () => {
    expect(envelope.kdf_algo).toBe("PBKDF2-SHA256");
    expect(envelope.kdf_iterations).toBeGreaterThanOrEqual(600_000);
  });

  it("содержит обёртки нужного размера", () => {
    // 32 байта ключа + 16 байт тега AES-GCM
    expect(atob(envelope.wrapped_dek).length).toBe(48);
    expect(atob(envelope.recovery_dek).length).toBe(48);
    expect(atob(envelope.kdf_salt).length).toBe(16);
    expect(atob(envelope.wrapped_dek_iv).length).toBe(12);
  });

  it("не содержит ключевую фразу ни в каком виде", () => {
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain(PHRASE);
    expect(serialized).not.toContain(toBase64(new TextEncoder().encode(PHRASE)));
  });

  it("выдаёт разные соли для фразы и recovery-кода", () => {
    expect(envelope.kdf_salt).not.toBe(envelope.recovery_salt);
    expect(envelope.wrapped_dek).not.toBe(envelope.recovery_dek);
  });
});

describe("разблокировка", () => {
  it("возвращает неизвлекаемый ключ", async () => {
    const dek = await unlockWithKeyphrase(PHRASE, envelope);

    // Ключ, который можно экспортировать, украдёт любая XSS
    expect(dek.extractable).toBe(false);
  });

  it("отвергает неверную фразу", async () => {
    await expect(unlockWithKeyphrase("не та фраза", envelope)).rejects.toThrow(
      WrongKeyphraseError,
    );
  });

  it("recovery-код разворачивает тот же самый ключ", async () => {
    const viaPhrase = await unlockWithKeyphrase(PHRASE, envelope);
    const viaCode = await unlockWithRecoveryCode(recoveryCode, envelope);

    // Ключи неизвлекаемы, поэтому сравниваем по поведению: то, что зашифровано
    // одним, должно читаться другим
    const encrypted = await encryptPayload(viaPhrase, { secret: "омлет" });
    await expect(decryptPayload(viaCode, encrypted)).resolves.toEqual({
      secret: "омлет",
    });
  });

  it("принимает recovery-код, переписанный от руки", async () => {
    const mangled = recoveryCode.toLowerCase().replace(/-/g, " ");

    await expect(
      unlockWithRecoveryCode(mangled, envelope),
    ).resolves.toBeDefined();
  });

  /**
   * Верификатор ловит не неверную фразу (её ловит сам AES-GCM), а случай, когда
   * обёртка развернулась, но ключ не соответствует данным — см. §5.3.
   */
  it("сообщает о рассинхроне конверта, а не о неверной фразе", async () => {
    const other = await createEnvelope(PHRASE);

    const frankenstein: CryptoEnvelope = {
      ...other.envelope,
      // Верификатор от другого DEK: unwrap пройдёт, проверка — нет
      verifier: envelope.verifier,
      verifier_iv: envelope.verifier_iv,
    };

    await expect(unlockWithKeyphrase(PHRASE, frankenstein)).rejects.toThrow(
      EnvelopeMismatchError,
    );
  }, 60_000);
});

describe("нормализация ключевой фразы", () => {
  /**
   * Главная практическая ловушка: одна и та же на вид фраза в NFC и NFD даёт
   * разные байты, разный ключ и невоспроизводимую ошибку входа с телефона.
   */
  it("даёт одинаковый ключ для NFC и NFD", async () => {
    const nfc = "ёлка йогурт".normalize("NFC");
    const nfd = "ёлка йогурт".normalize("NFD");

    expect(nfc).not.toBe(nfd); // байты действительно разные
    expect(normalizeKeyphrase(nfc)).toBe(normalizeKeyphrase(nfd));

    const created = await createEnvelope(nfc);
    await expect(
      unlockWithKeyphrase(nfd, created.envelope),
    ).resolves.toBeDefined();
  }, 60_000);

  it("игнорирует пробелы по краям", () => {
    expect(normalizeKeyphrase("  фраза  ")).toBe("фраза");
  });
});

describe("recovery-код", () => {
  it("не содержит символов, которые путают при переписывании", () => {
    expect(generateRecoveryCode().replace(/-/g, "")).not.toMatch(/[ILOU]/);
  });

  it("каждый раз разный", () => {
    const codes = new Set(Array.from({ length: 50 }, generateRecoveryCode));
    expect(codes.size).toBe(50);
  });

  it("терпим к регистру и разделителям", () => {
    const code = generateRecoveryCode();
    expect(normalizeRecoveryCode(code.toLowerCase())).toBe(
      normalizeRecoveryCode(code),
    );
  });
});

describe("смена ключевой фразы", () => {
  it("переписывает обёртку, не трогая данные", async () => {
    const dek = await unlockWithKeyphrase(PHRASE, envelope);
    const encrypted = await encryptPayload(dek, { note: "до смены фразы" });

    const wrapper = await rewrapForNewKeyphrase(PHRASE, "совсем другая фраза", envelope);
    const updated: CryptoEnvelope = { ...envelope, ...wrapper };

    const dekAfter = await unlockWithKeyphrase("совсем другая фраза", updated);

    // Старый шифротекст читается новой фразой — значит DEK тот же
    await expect(decryptPayload(dekAfter, encrypted)).resolves.toEqual({
      note: "до смены фразы",
    });
  }, 60_000);

  it("делает старую фразу нерабочей", async () => {
    const wrapper = await rewrapForNewKeyphrase(PHRASE, "новая фраза номер два", envelope);
    const updated: CryptoEnvelope = { ...envelope, ...wrapper };

    await expect(unlockWithKeyphrase(PHRASE, updated)).rejects.toThrow(
      WrongKeyphraseError,
    );
  }, 60_000);

  it("оставляет verifier и recovery-обёртку нетронутыми", async () => {
    const wrapper = await rewrapForNewKeyphrase(PHRASE, "третья фраза здесь", envelope);

    // Они привязаны к DEK, а DEK не менялся
    expect(wrapper).not.toHaveProperty("verifier");
    expect(wrapper).not.toHaveProperty("recovery_dek");
  }, 60_000);
});

describe("шифрование постов", () => {
  it("возвращает исходный объект после round-trip", async () => {
    const dek = await unlockWithKeyphrase(PHRASE, envelope);
    const post = {
      title: "Пароль от почты",
      body: "hunter2",
      tags: ["почта", "важное"],
    };

    const encrypted = await encryptPayload(dek, post);
    await expect(decryptPayload(dek, encrypted)).resolves.toEqual(post);
  });

  it("прячет заголовок внутрь шифротекста", async () => {
    const dek = await unlockWithKeyphrase(PHRASE, envelope);
    const encrypted = await encryptPayload(dek, { title: "Совершенно секретно" });

    expect(JSON.stringify(encrypted)).not.toContain("Совершенно секретно");
  });

  it("проставляет версию формата", async () => {
    const dek = await unlockWithKeyphrase(PHRASE, envelope);
    const encrypted = await encryptPayload(dek, {});

    // Мигрировать формат сможет только клиент — серверная миграция до
    // содержимого не достаёт
    expect(encrypted.payload_version).toBe(PAYLOAD_VERSION);
  });

  /**
   * Повтор IV при одном ключе разрушает AES-GCM целиком, а не частично.
   */
  it("никогда не повторяет IV", async () => {
    const dek = await unlockWithKeyphrase(PHRASE, envelope);

    const ivs = await Promise.all(
      Array.from({ length: 100 }, () =>
        encryptPayload(dek, { same: "payload" }).then((p) => p.iv),
      ),
    );

    expect(new Set(ivs).size).toBe(100);
  });

  it("не расшифровывается чужим ключом", async () => {
    const dek = await unlockWithKeyphrase(PHRASE, envelope);
    const other = await createEnvelope("чужая фраза целиком");

    const encrypted = await encryptPayload(dek, { secret: "нельзя читать" });

    await expect(decryptPayload(other.dek, encrypted)).rejects.toThrow();
  }, 60_000);
});
