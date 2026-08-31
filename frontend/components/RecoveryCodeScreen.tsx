"use client";

import { useState } from "react";
import { useSession } from "@/lib/session";
import s from "./ui.module.css";

/**
 * Код восстановления показывается ровно один раз: он нигде не сохраняется,
 * ни на сервере, ни в браузере. Это вторая обёртка того же мастер-ключа —
 * единственный путь к данным, если ключевая фраза забыта.
 */
export function RecoveryCodeScreen() {
  const { pendingRecoveryCode, acknowledgeRecoveryCode } = useSession();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!pendingRecoveryCode) return null;

  async function copy() {
    await navigator.clipboard.writeText(pendingRecoveryCode!);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className={s.screen}>
      <div className={s.panel}>
        <h1 className={s.brand}>Код восстановления</h1>
        <p className={s.tagline}>Показывается один раз</p>

        <div className={s.form}>
          <p className={s.code}>{pendingRecoveryCode}</p>

          <div className={s.warning}>
            <p>
              Запишите код и держите его отдельно от устройства. Он открывает
              доступ к вашим записям, если вы забудете ключевую фразу.
            </p>
            <p>
              Мы не храним его копию. Закрыв этот экран, вы больше не сможете его
              увидеть.
            </p>
          </div>

          <button type="button" className={s.linkButton} onClick={copy}>
            {copied ? "Скопировано" : "Скопировать в буфер"}
          </button>

          <label className={s.checkbox}>
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
            />
            <span>Я сохранил код в надёжном месте</span>
          </label>

          <button
            type="button"
            className={s.button}
            disabled={!saved}
            onClick={acknowledgeRecoveryCode}
          >
            Продолжить
          </button>
        </div>
      </div>
    </main>
  );
}
