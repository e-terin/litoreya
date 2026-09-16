"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "./api";
import {
  createEnvelope,
  rewrapForNewKeyphrase,
  unlockWithKeyphrase,
  unlockWithRecoveryCode,
  type CryptoEnvelope,
} from "./crypto";
import { keyVault } from "./keyvault";
import { clearCache, readSession, saveSession } from "./offline";

/*
 * Состояние сессии складывается из двух независимых вещей:
 *
 *   аутентификация — сессионная кука, знает сервер;
 *   разблокировка  — мастер-ключ в KeyVault, сервер о ней не знает вовсе.
 *
 * Отсюда четыре состояния, а не два: можно быть залогиненным, но запертым —
 * например, после auto-lock или перезагрузки вкладки на другой день.
 */
export type SessionStatus = "loading" | "anonymous" | "locked" | "unlocked";

type SessionValue = {
  status: SessionStatus;
  user: api.User | null;
  dek: CryptoKey | null;
  /** Показывается один раз после регистрации и больше нигде не хранится. */
  pendingRecoveryCode: string | null;

  signIn(email: string, password: string): Promise<void>;
  signUp(input: {
    name: string;
    email: string;
    password: string;
    keyphrase: string;
  }): Promise<void>;
  unlock(keyphrase: string): Promise<void>;
  unlockWithRecovery(code: string): Promise<void>;
  acknowledgeRecoveryCode(): void;
  lock(): Promise<void>;
  signOut(): Promise<void>;

  changePassword(currentPassword: string, password: string): Promise<void>;
  changeKeyphrase(input: {
    currentPassword: string;
    oldKeyphrase: string;
    newKeyphrase: string;
  }): Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<api.User | null>(null);
  const [envelope, setEnvelope] = useState<CryptoEnvelope | null>(null);
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const [pendingRecoveryCode, setPendingRecoveryCode] = useState<string | null>(
    null,
  );

  /** Восстановление состояния при загрузке: сессия жива? ключ ещё в хранилище? */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let session: api.Session | null = null;

      try {
        session = await api.me();
        await saveSession(session);
      } catch (e) {
        if (cancelled) return;

        if (e instanceof api.ApiError) {
          // Сервер ответил — значит сессии действительно нет.
          // 401 здесь обычное состояние, а не ошибка.
          await keyVault.clear();
          await clearCache().catch(() => undefined);
          setStatus("anonymous");

          return;
        }

        // Сети нет. Ответа сервера мы не получили, поэтому судить о сессии
        // не можем и НЕ стираем ключ: офлайн-перезагрузка иначе выкидывала бы
        // на форму входа поверх полного кеша записей.
        session = await readSession();

        if (!session) {
          // Офлайн и без снимка — показать нечего
          setStatus("anonymous");

          return;
        }
      }

      if (cancelled) return;

      setUser(session.user);
      setEnvelope(session.crypto);

      const stored = await keyVault.get();
      if (cancelled) return;

      setDek(stored);
      setStatus(stored ? "unlocked" : "locked");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Продлеваем срок жизни ключа, пока пользователь что-то делает. */
  useEffect(() => {
    if (status !== "unlocked") return;

    const onActivity = () => void keyVault.touch();
    const events = ["pointerdown", "keydown"] as const;

    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () =>
      events.forEach((e) => window.removeEventListener(e, onActivity));
  }, [status]);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await api.login(email, password);
    await saveSession(session);

    setUser(session.user);
    setEnvelope(session.crypto);

    // Ключ мог остаться от прошлой сессии в этом же браузере
    const stored = await keyVault.get();
    setDek(stored);
    setStatus(stored ? "unlocked" : "locked");
  }, []);

  const signUp = useCallback<SessionValue["signUp"]>(async (input) => {
    // Конверт собирается ДО обращения к серверу: если регистрация не удастся,
    // ключевая фраза всё равно никуда не уходила
    const { envelope: created, recoveryCode, dek: freshDek } =
      await createEnvelope(input.keyphrase);

    const session = await api.register({
      name: input.name,
      email: input.email,
      password: input.password,
      password_confirmation: input.password,
      crypto: created,
    });

    await keyVault.store(freshDek);
    await saveSession(session);

    setUser(session.user);
    setEnvelope(session.crypto);
    setDek(freshDek);
    setPendingRecoveryCode(recoveryCode);
    setStatus("unlocked");
  }, []);

  const unlock = useCallback(
    async (keyphrase: string) => {
      if (!envelope) throw new Error("Нет крипто-конверта");

      const key = await unlockWithKeyphrase(keyphrase, envelope);
      await keyVault.store(key);

      setDek(key);
      setStatus("unlocked");
    },
    [envelope],
  );

  const unlockWithRecovery = useCallback(
    async (code: string) => {
      if (!envelope) throw new Error("Нет крипто-конверта");

      const key = await unlockWithRecoveryCode(code, envelope);
      await keyVault.store(key);

      setDek(key);
      setStatus("unlocked");
    },
    [envelope],
  );

  const changePassword = useCallback(
    async (currentPassword: string, password: string) => {
      await api.updatePassword(currentPassword, password);
      // Крипто-конверт не затрагивается: пароль и ключевая фраза независимы
    },
    [],
  );

  /**
   * Смена ключевой фразы: DEK прежний, меняется только его обёртка.
   *
   * Старая фраза нужна не для подтверждения личности, а технически: ключ из
   * KeyVault неизвлекаемый, а wrapKey работает только с extractable-ключом
   * (docs/crypto-design.md §5.2). Поэтому DEK разворачивается заново.
   */
  const changeKeyphrase = useCallback<SessionValue["changeKeyphrase"]>(
    async ({ currentPassword, oldKeyphrase, newKeyphrase }) => {
      if (!envelope) throw new Error("Нет крипто-конверта");

      const wrapper = await rewrapForNewKeyphrase(
        oldKeyphrase,
        newKeyphrase,
        envelope,
      );

      const { crypto: updated } = await api.updateKeyphrase(
        currentPassword,
        wrapper,
      );

      // Обязательно: без этого «Заблокировать» в той же вкладке пошло бы
      // разблокировать по устаревшей обёртке, и новая фраза не подошла бы
      setEnvelope(updated);

      // KeyVault не трогаем — там лежит тот же самый DEK
    },
    [envelope],
  );

  const lock = useCallback(async () => {
    await keyVault.clear();
    setDek(null);
    setStatus("locked");
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    // Ключ стираем в любом случае: сервер до него не дотягивается
    await keyVault.clear();
    // И офлайн-копию: чужие блобы в браузере после выхода оставлять незачем
    await clearCache().catch(() => undefined);

    setUser(null);
    setEnvelope(null);
    setDek(null);
    setPendingRecoveryCode(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      dek,
      pendingRecoveryCode,
      signIn,
      signUp,
      unlock,
      unlockWithRecovery,
      acknowledgeRecoveryCode: () => setPendingRecoveryCode(null),
      lock,
      signOut,
      changePassword,
      changeKeyphrase,
    }),
    [status, user, dek, pendingRecoveryCode, signIn, signUp, unlock, unlockWithRecovery, lock, signOut, changePassword, changeKeyphrase],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession вне SessionProvider");
  return value;
}
