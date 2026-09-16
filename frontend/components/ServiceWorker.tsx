"use client";

import { useEffect, useState } from "react";
import s from "./ui.module.css";

/**
 * Регистрация service worker и предложение обновиться.
 *
 * Новая версия не применяется сама: перезагрузка посреди редактирования
 * потеряла бы набранное, а черновиков в приложении нет. Поэтому ждём кнопки.
 */
export function ServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          // Сам файл воркера не должен приезжать из HTTP-кеша: иначе браузер
          // неделю не заметит, что вышла новая версия
          updateViaCache: "none",
        });

        if (cancelled) return;

        // Воркер уже ждёт — вкладку открыли после того, как он скачался
        if (registration.waiting) setWaiting(registration.waiting);

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            // controller === null означает первую установку: предлагать
            // «обновить» тому, кто только что открыл приложение, незачем
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaiting(installing);
            }
          });
        });
      } catch {
        // Без воркера приложение работает, только без офлайна
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!waiting) return null;

  return (
    <div className={s.updateBar} role="status">
      <span>Доступна новая версия.</span>
      <button
        type="button"
        className={s.linkButton}
        onClick={() => {
          // Перезагружаемся, когда новый воркер реально взял управление,
          // а не сразу: иначе страница успеет перезагрузиться на старом
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => location.reload(),
            { once: true },
          );

          waiting.postMessage("skip-waiting");
        }}
      >
        Обновить
      </button>
    </div>
  );
}
