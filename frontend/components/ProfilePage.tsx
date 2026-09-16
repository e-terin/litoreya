"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { EnvelopeMismatchError, WrongKeyphraseError } from "@/lib/crypto";
import { useSession } from "@/lib/session";
import { SecretInput } from "./SecretInput";
import s from "./ui.module.css";

type Tab = "account" | "security";

export function ProfilePage() {
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>("security");

  return (
    <>
      <header className={s.bar}>
        <Link href="/" className={s.linkButton}>
          ← Litoreya
        </Link>
        <span className={s.muted}>{user?.email}</span>
      </header>

      <div className={s.page}>
        <h1 className={s.brand}>Профиль</h1>

        <div className={s.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "account"}
            className={s.tab}
            onClick={() => setTab("account")}
          >
            Аккаунт
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "security"}
            className={s.tab}
            onClick={() => setTab("security")}
          >
            Безопасность
          </button>
        </div>

        {tab === "account" ? (
          <dl className={s.summary}>
            <dt className={s.label}>Имя</dt>
            <dd>{user?.name}</dd>
            <dt className={s.label}>Почта</dt>
            <dd>{user?.email}</dd>
          </dl>
        ) : (
          <div className={s.sections}>
            <PasswordForm />
            <KeyphraseForm />
          </div>
        )}
      </div>
    </>
  );
}

function PasswordForm() {
  const { changePassword } = useSession();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();

    if (next !== repeat) {
      setErrors({ password: "Пароли не совпадают" });
      return;
    }

    setBusy(true);
    setErrors({});
    setDone(false);

    try {
      await changePassword(current, next);

      setCurrent("");
      setNext("");
      setRepeat("");
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors({
          current_password: e.errorFor("current_password") ?? "",
          password: e.errorFor("password") ?? "",
          form: e.status === 429 ? "Слишком много попыток. Подождите минуту." : "",
        });
      } else {
        setErrors({ form: "Не удалось сменить пароль" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className={s.sectionTitle}>Пароль</h2>
      <p className={s.hint}>
        Пароль открывает доступ к аккаунту, но не к данным — их расшифровывает
        ключевая фраза. Остальные сессии будут завершены.
      </p>

      <form className={s.form} onSubmit={submit}>
        {errors.form && <p className={s.alert}>{errors.form}</p>}
        {done && <p className={s.notice}>Пароль изменён. Другие сессии завершены.</p>}

        <div className={s.field}>
          <label className={s.label} htmlFor="current-password">
            Текущий пароль
          </label>
          <SecretInput
            id="current-password"
            autoComplete="current-password"
            required
            value={current}
            aria-invalid={!!errors.current_password}
            onChange={(e) => setCurrent(e.target.value)}
          />
          {errors.current_password && (
            <p className={s.fieldError}>{errors.current_password}</p>
          )}
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor="new-password">
            Новый пароль
          </label>
          <SecretInput
            id="new-password"
            autoComplete="new-password"
            required
            value={next}
            aria-invalid={!!errors.password}
            onChange={(e) => setNext(e.target.value)}
          />
          {errors.password ? (
            <p className={s.fieldError}>{errors.password}</p>
          ) : (
            <p className={s.hint}>Не короче 10 символов.</p>
          )}
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor="repeat-password">
            Новый пароль ещё раз
          </label>
          <SecretInput
            id="repeat-password"
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </div>

        <button className={s.button} type="submit" disabled={busy}>
          {busy ? "Сохранение…" : "Сменить пароль"}
        </button>
      </form>
    </section>
  );
}

function KeyphraseForm() {
  const { changeKeyphrase } = useSession();

  const [password, setPassword] = useState("");
  const [oldPhrase, setOldPhrase] = useState("");
  const [newPhrase, setNewPhrase] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();

    if (newPhrase !== repeat) {
      setErrors({ keyphrase: "Фразы не совпадают" });
      return;
    }

    setBusy(true);
    setErrors({});
    setDone(false);

    try {
      await changeKeyphrase({
        currentPassword: password,
        oldKeyphrase: oldPhrase,
        newKeyphrase: newPhrase,
      });

      setPassword("");
      setOldPhrase("");
      setNewPhrase("");
      setRepeat("");
      setDone(true);
    } catch (e) {
      if (e instanceof WrongKeyphraseError) {
        setErrors({ old_keyphrase: "Неверная текущая ключевая фраза" });
      } else if (e instanceof EnvelopeMismatchError) {
        setErrors({ form: e.message });
      } else if (e instanceof ApiError) {
        setErrors({
          current_password: e.errorFor("current_password") ?? "",
          form: e.status === 429 ? "Слишком много попыток. Подождите минуту." : "",
        });
      } else {
        setErrors({ form: "Не удалось сменить ключевую фразу" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className={s.sectionTitle}>Ключевая фраза</h2>
      <p className={s.hint}>
        Переписывается только обёртка мастер-ключа — записи не перешифровываются
        и на сервер не уходят. Код восстановления остаётся прежним: он обёрнут
        независимо от фразы.
      </p>

      <form className={s.form} onSubmit={submit}>
        {errors.form && <p className={s.alert}>{errors.form}</p>}
        {done && <p className={s.notice}>Ключевая фраза изменена.</p>}

        <div className={s.field}>
          <label className={s.label} htmlFor="keyphrase-password">
            Пароль аккаунта
          </label>
          <SecretInput
            id="keyphrase-password"
            autoComplete="current-password"
            required
            value={password}
            aria-invalid={!!errors.current_password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errors.current_password && (
            <p className={s.fieldError}>{errors.current_password}</p>
          )}
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor="old-keyphrase">
            Текущая ключевая фраза
          </label>
          <SecretInput
            id="old-keyphrase"
            autoComplete="off"
            required
            value={oldPhrase}
            aria-invalid={!!errors.old_keyphrase}
            onChange={(e) => setOldPhrase(e.target.value)}
          />
          {errors.old_keyphrase ? (
            <p className={s.fieldError}>{errors.old_keyphrase}</p>
          ) : (
            <p className={s.hint}>
              Нужна технически: мастер-ключ хранится неизвлекаемым, и заново
              обернуть его можно, только развернув старой фразой.
            </p>
          )}
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor="new-keyphrase">
            Новая ключевая фраза
          </label>
          <SecretInput
            id="new-keyphrase"
            autoComplete="off"
            required
            value={newPhrase}
            aria-invalid={!!errors.keyphrase}
            onChange={(e) => setNewPhrase(e.target.value)}
          />
          <p className={s.hint}>
            Надёжнее длинная фраза из нескольких случайных слов, чем короткая
            со спецсимволами.
          </p>
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor="repeat-keyphrase">
            Новая фраза ещё раз
          </label>
          <SecretInput
            id="repeat-keyphrase"
            autoComplete="off"
            required
            value={repeat}
            aria-invalid={!!errors.keyphrase}
            onChange={(e) => setRepeat(e.target.value)}
          />
          {errors.keyphrase && <p className={s.fieldError}>{errors.keyphrase}</p>}
        </div>

        <div className={s.warning}>
          <p>
            <strong>Забытую фразу восстановить невозможно.</strong> Сервер её не
            знает. Если новую фразу забыть, останется только код восстановления.
          </p>
        </div>

        <button className={s.button} type="submit" disabled={busy}>
          {busy ? "Перешифровка ключа…" : "Сменить ключевую фразу"}
        </button>
      </form>
    </section>
  );
}
