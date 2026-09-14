"use client";

import { useEffect, useRef, useState } from "react";
import { copyWithAutoClear } from "@/lib/password";
import v from "./vault.module.css";

/**
 * Копирование значения в буфер с автоочисткой.
 *
 * Логика вынесена из PasswordField, потому что копировать нужно уже из трёх
 * мест: поля пароля, поля логина и карточки в списке. Отложенная очистка
 * обязана отменяться вместе с компонентом — иначе таймер переживёт закрытие
 * редактора и затрёт буфер, в котором к тому моменту лежит чужое.
 */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const cancelClear = useRef<(() => void) | null>(null);
  const resetLabel = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      cancelClear.current?.();
      if (resetLabel.current) clearTimeout(resetLabel.current);
    },
    [],
  );

  return (
    <button
      type="button"
      className={className ?? v.smallButton}
      disabled={!value}
      title={`Скопировать: ${label.toLowerCase()}`}
      onClick={(e) => {
        // Кнопка живёт внутри карточки, открывающей запись. Сейчас она сосед
        // кнопки открытия, а не её потомок, но клик гасится на случай, если
        // обработчик переедет на саму карточку.
        e.stopPropagation();

        cancelClear.current?.();
        cancelClear.current = copyWithAutoClear(value, () => setCopied(false));

        setCopied(true);
        if (resetLabel.current) clearTimeout(resetLabel.current);
        resetLabel.current = setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Скопировано" : label}
    </button>
  );
}
