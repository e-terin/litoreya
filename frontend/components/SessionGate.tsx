"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { AuthScreen } from "./AuthScreen";
import { RecoveryCodeScreen } from "./RecoveryCodeScreen";
import { UnlockScreen } from "./UnlockScreen";
import s from "./ui.module.css";

/**
 * Развилка по состоянию сессии, общая для всех маршрутов.
 *
 * Маршрутов стало два, и охрана обязана быть на обоих: по прямой ссылке на
 * внутреннюю страницу может прийти кто угодно в любом состоянии. Держать эту
 * логику копией в каждом page.tsx — значит однажды поправить одну копию.
 *
 * Аутентификация и разблокировка независимы: залогиненный пользователь может
 * быть заперт — после auto-lock или возврата в приложение на следующий день.
 */
export function SessionGate({
  children,
  /**
   * Что показать незалогиненному. На главной это форма входа; на внутренних
   * страницах показывать её бессмысленно — там нечего открывать, поэтому
   * уводим на главную.
   */
  anonymous = "auth",
}: {
  children: ReactNode;
  anonymous?: "auth" | "redirect";
}) {
  const { status, pendingRecoveryCode } = useSession();
  const router = useRouter();

  const redirecting = status === "anonymous" && anonymous === "redirect";

  useEffect(() => {
    if (redirecting) router.replace("/");
  }, [redirecting, router]);

  if (status === "loading" || redirecting) {
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

  return <>{children}</>;
}
