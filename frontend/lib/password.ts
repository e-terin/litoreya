/**
 * Генератор паролей и работа с буфером обмена.
 */

const LOWER = "abcdefghijkmnopqrstuvwxyz"; // без l
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // без I, O
const DIGITS = "23456789"; // без 0, 1
const SYMBOLS = "!@#$%^&*-_=+?";

export type PasswordOptions = {
  length: number;
  digits: boolean;
  symbols: boolean;
};

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  digits: true,
  symbols: true,
};

/**
 * Случайный индекс без смещения.
 *
 * Наивное `random % alphabet.length` даёт неравномерное распределение, когда
 * длина алфавита не делит 256 нацело: первые символы выпадают чаще. Отбрасываем
 * хвост диапазона.
 */
function randomIndex(bound: number): number {
  const limit = Math.floor(256 / bound) * bound;
  const buffer = new Uint8Array(1);

  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return value % bound;
}

export function generatePassword(
  options: PasswordOptions = DEFAULT_PASSWORD_OPTIONS,
): string {
  // Символы, которые путаются при чтении вслух и при переписывании, исключены
  // из алфавитов выше
  const groups = [LOWER, UPPER];
  if (options.digits) groups.push(DIGITS);
  if (options.symbols) groups.push(SYMBOLS);

  const alphabet = groups.join("");
  const length = Math.max(8, Math.min(128, options.length));

  // Гарантируем по одному символу из каждой группы, иначе «включить цифры»
  // иногда не даёт ни одной цифры
  const required = groups.map((group) => group[randomIndex(group.length)]);

  const rest = Array.from(
    { length: length - required.length },
    () => alphabet[randomIndex(alphabet.length)],
  );

  const chars = [...required, ...rest];

  // Перемешивание Фишера—Йетса: без него обязательные символы всегда в начале
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

/** Грубая оценка стойкости в битах — для индикатора, не для гарантий. */
export function passwordEntropyBits(password: string): number {
  let alphabet = 0;
  if (/[a-z]/.test(password)) alphabet += 26;
  if (/[A-Z]/.test(password)) alphabet += 26;
  if (/[0-9]/.test(password)) alphabet += 10;
  if (/[^a-zA-Z0-9]/.test(password)) alphabet += 20;

  return alphabet ? Math.round(password.length * Math.log2(alphabet)) : 0;
}

export const CLIPBOARD_CLEAR_MS = 30_000;

/**
 * Копирует пароль и через полминуты затирает буфер.
 *
 * Буфер обмена доступен другим приложениям и переживает закрытие вкладки —
 * пароль, оставленный там навсегда, сводит на нет смысл его шифрования.
 *
 * Затирание не гарантировано: менеджеры буфера могут сохранить историю, а
 * вкладку могут закрыть раньше. Это снижение риска, а не защита.
 */
export function copyWithAutoClear(
  value: string,
  onCleared?: () => void,
): () => void {
  void navigator.clipboard.writeText(value);

  const timer = setTimeout(async () => {
    try {
      // Затираем, только если в буфере всё ещё наш пароль: иначе затрём то,
      // что пользователь скопировал после нас
      const current = await navigator.clipboard.readText();
      if (current === value) await navigator.clipboard.writeText("");
    } catch {
      // Чтение буфера может быть запрещено — тогда просто затираем
      await navigator.clipboard.writeText("").catch(() => undefined);
    }
    onCleared?.();
  }, CLIPBOARD_CLEAR_MS);

  return () => clearTimeout(timer);
}
