"use client";

import { useEffect, useState } from "react";
import { decryptPayload, encryptPayload } from "@/lib/crypto";
import { useSession } from "@/lib/session";
import s from "./ui.module.css";

/**
 * Заглушка фазы 3. Пока показывает, что мастер-ключ действительно рабочий:
 * шифрует и расшифровывает пробное значение, не обращаясь к серверу.
 */
export function Dashboard() {
  const { user, dek, lock, signOut } = useSession();
  const [check, setCheck] = useState<string>("проверка…");

  useEffect(() => {
    if (!dek) return;

    (async () => {
      try {
        const probe = { probe: "round-trip", at: Date.now() };
        const encrypted = await encryptPayload(dek, probe);
        const decrypted = await decryptPayload<typeof probe>(dek, encrypted);

        setCheck(
          decrypted.at === probe.at
            ? `ключ рабочий · шифротекст ${encrypted.ciphertext.length} симв.`
            : "ключ не совпадает",
        );
      } catch {
        setCheck("ошибка шифрования");
      }
    })();
  }, [dek]);

  return (
    <>
      <header className={s.bar}>
        <strong>Litoreya</strong>
        <div className={s.barActions}>
          <span className={s.muted}>{user?.email}</span>
          <button type="button" className={s.linkButton} onClick={lock}>
            Заблокировать
          </button>
          <button type="button" className={s.linkButton} onClick={signOut}>
            Выйти
          </button>
        </div>
      </header>

      <main className={s.page}>
        <h1 className={s.brand}>Дашборд</h1>
        <p className={s.tagline}>
          Список записей появится в фазе 3. Ключ разблокирован и готов к работе.
        </p>

        <div className={s.warning}>
          <p>
            <strong>Самопроверка ключа:</strong> {check}
          </p>
          <p>
            Мастер-ключ хранится в IndexedDB как неизвлекаемый CryptoKey и
            стирается сам после 15 минут бездействия.
          </p>
        </div>
      </main>
    </>
  );
}
