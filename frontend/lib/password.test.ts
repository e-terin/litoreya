import { describe, expect, it } from "vitest";
import {
  DEFAULT_PASSWORD_OPTIONS,
  generatePassword,
  passwordEntropyBits,
} from "./password";

describe("генератор паролей", () => {
  it("соблюдает заданную длину", () => {
    expect(generatePassword({ length: 32, digits: true, symbols: true })).toHaveLength(32);
    expect(generatePassword({ length: 12, digits: false, symbols: false })).toHaveLength(12);
  });

  it("не опускается ниже разумного минимума", () => {
    expect(generatePassword({ length: 2, digits: true, symbols: true }).length).toBe(8);
  });

  /**
   * Без явной гарантии «включить цифры» иногда не давало бы ни одной цифры —
   * особенно на коротких паролях.
   */
  it("действительно включает выбранные группы символов", () => {
    for (let i = 0; i < 30; i++) {
      const password = generatePassword({ length: 10, digits: true, symbols: true });

      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[2-9]/);
      expect(password).toMatch(/[!@#$%^&*\-_=+?]/);
    }
  });

  it("не добавляет символы отключённых групп", () => {
    for (let i = 0; i < 30; i++) {
      const password = generatePassword({ length: 16, digits: false, symbols: false });
      expect(password).toMatch(/^[a-zA-Z]+$/);
    }
  });

  it("исключает символы, которые путаются при чтении", () => {
    for (let i = 0; i < 50; i++) {
      // l, I, O, 0, 1 — источник ошибок при переписывании вручную
      expect(generatePassword()).not.toMatch(/[lIO01]/);
    }
  });

  it("не повторяется", () => {
    const generated = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(generated.size).toBe(200);
  });

  /**
   * Обязательные символы добавляются в начало и должны перемешиваться: иначе
   * первые позиции предсказуемы по типу символа.
   */
  it("распределяет обязательные символы по всей длине", () => {
    const positions = new Set<number>();

    for (let i = 0; i < 200; i++) {
      const index = generatePassword({ length: 10, digits: true, symbols: false })
        .search(/[2-9]/);
      positions.add(index);
    }

    expect(positions.size).toBeGreaterThan(5);
  });

  it("даёт стойкий пароль при настройках по умолчанию", () => {
    expect(passwordEntropyBits(generatePassword(DEFAULT_PASSWORD_OPTIONS))).toBeGreaterThan(100);
  });
});
