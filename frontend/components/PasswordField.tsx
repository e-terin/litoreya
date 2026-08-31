"use client";

import { useEffect, useRef, useState } from "react";
import {
  CLIPBOARD_CLEAR_MS,
  copyWithAutoClear,
  DEFAULT_PASSWORD_OPTIONS,
  generatePassword,
  passwordEntropyBits,
  type PasswordOptions,
} from "@/lib/password";
import s from "./ui.module.css";
import v from "./vault.module.css";

/**
 * Поле пароля: показ по требованию, копирование с автоочисткой буфера и
 * встроенный генератор.
 */
export function PasswordField({
  value,
  onChange,
}: {
  value: string;
  onChange(next: string): void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [options, setOptions] = useState<PasswordOptions>(DEFAULT_PASSWORD_OPTIONS);
  const cancelClear = useRef<(() => void) | null>(null);

  // Отменяем отложенную очистку, если компонент исчез раньше срока
  useEffect(() => () => cancelClear.current?.(), []);

  function copy() {
    cancelClear.current?.();
    cancelClear.current = copyWithAutoClear(value, () => setCopied(false));

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const bits = passwordEntropyBits(value);

  return (
    <div className={s.field}>
      <label className={s.label} htmlFor="post-password">
        Пароль
      </label>

      <div className={v.secretRow}>
        <input
          id="post-password"
          className={`${s.input} ${v.secretInput}`}
          type={revealed ? "text" : "password"}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className={v.smallButton}
          onClick={() => setRevealed((r) => !r)}
        >
          {revealed ? "Скрыть" : "Показать"}
        </button>
        <button
          type="button"
          className={v.smallButton}
          onClick={copy}
          disabled={!value}
        >
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>

      <p className={s.hint}>
        {value ? `≈ ${bits} бит стойкости. ` : ""}
        Буфер обмена очищается через {CLIPBOARD_CLEAR_MS / 1000} с.{" "}
        <button
          type="button"
          className={s.linkButton}
          onClick={() => setShowGenerator((g) => !g)}
        >
          {showGenerator ? "скрыть генератор" : "сгенерировать"}
        </button>
      </p>

      {showGenerator && (
        <div className={v.generator}>
          <div className={v.generatorRow}>
            <label>
              Длина
              <input
                type="range"
                min={8}
                max={64}
                value={options.length}
                onChange={(e) =>
                  setOptions({ ...options, length: Number(e.target.value) })
                }
              />
              <span className={v.strength}>{options.length}</span>
            </label>

            <label>
              <input
                type="checkbox"
                checked={options.digits}
                onChange={(e) =>
                  setOptions({ ...options, digits: e.target.checked })
                }
              />
              цифры
            </label>

            <label>
              <input
                type="checkbox"
                checked={options.symbols}
                onChange={(e) =>
                  setOptions({ ...options, symbols: e.target.checked })
                }
              />
              символы
            </label>
          </div>

          <button
            type="button"
            className={v.smallButton}
            onClick={() => {
              onChange(generatePassword(options));
              setRevealed(true);
            }}
          >
            Сгенерировать пароль
          </button>
        </div>
      )}
    </div>
  );
}
