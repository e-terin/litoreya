"use client";

import { useState, type FormEvent } from "react";
import { EnvelopeMismatchError, WrongKeyphraseError } from "@/lib/crypto";
import { useSession } from "@/lib/session";
import s from "./ui.module.css";

/**
 * Разблокировка. Сессия уже есть — не хватает мастер-ключа, который сервер
 * выдать не может: он не знает ни ключевую фразу, ни recovery-код.
 *
 * Проверка идёт целиком в браузере, без сетевых запросов.
 */
export function UnlockScreen() {
  const { user, unlock, unlockWithRecovery, signOut } = useSession();
  const [useRecovery, setUseRecovery] = useState(false);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await (useRecovery ? unlockWithRecovery(secret) : unlock(secret));
    } catch (e) {
      if (e instanceof WrongKeyphraseError) {
        setError(
          useRecovery ? "Код восстановления не подходит" : "Неверная ключевая фраза",
        );
      } else if (e instanceof EnvelopeMismatchError) {
        setError(e.message);
      } else {
        setError("Не удалось расшифровать ключ");
      }
      setBusy(false);
    }
  }

  return (
    <main className={s.screen}>
      <div className={s.panel}>
        <h1 className={s.brand}>Разблокировка</h1>
        <p className={s.tagline}>{user?.email}</p>

        <form className={s.form} onSubmit={handle}>
          {error && <p className={s.alert}>{error}</p>}

          <div className={s.field}>
            <label className={s.label} htmlFor="unlock-secret">
              {useRecovery ? "Код восстановления" : "Ключевая фраза"}
            </label>
            <input
              id="unlock-secret"
              className={s.input}
              type={useRecovery ? "text" : "password"}
              autoComplete={useRecovery ? "off" : "current-password"}
              autoFocus
              required
              value={secret}
              aria-invalid={!!error}
              onChange={(e) => setSecret(e.target.value)}
            />
            <p className={s.hint}>
              {useRecovery
                ? "Регистр и дефисы не важны."
                : "Проверяется в браузере — на сервер не отправляется."}
            </p>
          </div>

          <button className={s.button} type="submit" disabled={busy}>
            {busy ? "Расшифровка ключа…" : "Разблокировать"}
          </button>

          <button
            type="button"
            className={s.linkButton}
            onClick={() => {
              setUseRecovery((v) => !v);
              setSecret("");
              setError(null);
            }}
          >
            {useRecovery
              ? "Ввести ключевую фразу"
              : "Забыли фразу? Использовать код восстановления"}
          </button>

          <button type="button" className={s.linkButton} onClick={signOut}>
            Выйти из аккаунта
          </button>
        </form>
      </div>
    </main>
  );
}
