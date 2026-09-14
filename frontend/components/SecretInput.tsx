"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import s from "./ui.module.css";

/**
 * Поле для секрета с кнопкой показа.
 *
 * Отдельный компонент, а не пара «инпут + кнопка» на каждом экране: полей шесть,
 * и все они живут внутри <form>, где кнопка без type="button" сабмитила бы форму.
 *
 * Показ опционально управляется снаружи. Пара revealed/onRevealedChange нужна
 * там, где раскрыть поле должен не только клик по глазику, — например генератор
 * пароля показывает то, что сгенерировал.
 */
export function SecretInput({
  revealed,
  onRevealedChange,
  defaultRevealed = false,
  className,
  ...rest
}: Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  revealed?: boolean;
  onRevealedChange?(next: boolean): void;
  defaultRevealed?: boolean;
}) {
  const [own, setOwn] = useState(defaultRevealed);
  const shown = revealed ?? own;
  const action = shown ? "Скрыть" : "Показать";

  return (
    <div className={s.secretWrap}>
      <input
        {...rest}
        className={[s.input, s.inputWithEye, className].filter(Boolean).join(" ")}
        type={shown ? "text" : "password"}
      />
      <button
        type="button"
        className={s.eyeButton}
        aria-label={action}
        aria-pressed={shown}
        title={action}
        onClick={() => {
          setOwn(!shown);
          onRevealedChange?.(!shown);
        }}
      >
        <EyeIcon crossed={shown} />
      </button>
    </div>
  );
}

/**
 * Иконка показывает действие, а не состояние: скрытое поле — просто глаз
 * («показать»), раскрытое — перечёркнутый («скрыть»).
 *
 * Инлайновый SVG, а не библиотека иконок: в зависимостях фронта только
 * next/react/react-dom, и ради двух глифов пакет не окупается.
 */
function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M1.8 12S5.4 5.2 12 5.2 22.2 12 22.2 12 18.6 18.8 12 18.8 1.8 12 1.8 12Z" />
      <circle cx="12" cy="12" r="3.2" />
      {crossed && <path d="M4.5 19.5 19.5 4.5" />}
    </svg>
  );
}
