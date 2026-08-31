"use client";

import { AuthScreen } from "@/components/AuthScreen";
import { Dashboard } from "@/components/Dashboard";
import { RecoveryCodeScreen } from "@/components/RecoveryCodeScreen";
import { UnlockScreen } from "@/components/UnlockScreen";
import { useSession } from "@/lib/session";
import s from "@/components/ui.module.css";

/**
 * Маршрутизация по состоянию сессии.
 *
 * Аутентификация и разблокировка независимы: залогиненный пользователь может
 * быть заперт — после auto-lock или возврата в приложение на следующий день.
 */
export default function Page() {
  const { status, pendingRecoveryCode } = useSession();

  if (status === "loading") {
    return (
      <main className={s.screen}>
        <p className={s.muted}>Загрузка…</p>
      </main>
    );
  }

  if (status === "anonymous") return <AuthScreen />;

  // Показывается сразу после регистрации и ровно один раз
  if (pendingRecoveryCode) return <RecoveryCodeScreen />;

  if (status === "locked") return <UnlockScreen />;

  return <Dashboard />;
}
