"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import s from "./ui.module.css";

type Mode = "login" | "register";

export function AuthScreen() {
  const { signIn, signUp } = useSession();
  const [mode, setMode] = useState<Mode>("login");

  return (
    <main className={s.screen}>
      <div className={s.panel}>
        <h1 className={s.brand}>Litoreya</h1>
        <p className={s.tagline}>Хранилище зашифрованной информации</p>

        <div className={s.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={s.tab}
            onClick={() => setMode("login")}
          >
            Вход
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={s.tab}
            onClick={() => setMode("register")}
          >
            Регистрация
          </button>
        </div>

        {mode === "login" ? (
          <LoginForm onSubmit={signIn} />
        ) : (
          <RegisterForm onSubmit={signUp} />
        )}
      </div>
    </main>
  );
}

function LoginForm({
  onSubmit,
}: {
  onSubmit(email: string, password: string): Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await onSubmit(email, password);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.errorFor("email") ?? e.message)
          : "Не удалось войти",
      );
      setBusy(false);
    }
  }

  return (
    <form className={s.form} onSubmit={handle}>
      {error && <p className={s.alert}>{error}</p>}

      <div className={s.field}>
        <label className={s.label} htmlFor="login-email">
          Email
        </label>
        <input
          id="login-email"
          className={s.input}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="login-password">
          Пароль
        </label>
        <input
          id="login-password"
          className={s.input}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button className={s.button} type="submit" disabled={busy}>
        {busy ? "Вход…" : "Войти"}
      </button>

      <p className={s.hint}>
        Ключевая фраза понадобится на следующем шаге — она расшифровывает данные
        и на сервер не отправляется.
      </p>
    </form>
  );
}

function RegisterForm({
  onSubmit,
}: {
  onSubmit(input: {
    name: string;
    email: string;
    password: string;
    keyphrase: string;
  }): Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keyphrase, setKeyphrase] = useState("");
  const [keyphraseRepeat, setKeyphraseRepeat] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function handle(event: FormEvent) {
    event.preventDefault();

    if (keyphrase !== keyphraseRepeat) {
      setErrors({ keyphrase: "Ключевые фразы не совпадают" });
      return;
    }

    setBusy(true);
    setErrors({});

    try {
      await onSubmit({ name, email, password, keyphrase });
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors({
          form: e.errors && Object.keys(e.errors).length ? "" : e.message,
          name: e.errorFor("name") ?? "",
          email: e.errorFor("email") ?? "",
          password: e.errorFor("password") ?? "",
        });
      } else {
        setErrors({ form: "Не удалось зарегистрироваться" });
      }
      setBusy(false);
    }
  }

  return (
    <form className={s.form} onSubmit={handle}>
      {errors.form && <p className={s.alert}>{errors.form}</p>}

      <div className={s.field}>
        <label className={s.label} htmlFor="reg-name">
          Имя
        </label>
        <input
          id="reg-name"
          className={s.input}
          required
          value={name}
          aria-invalid={!!errors.name}
          onChange={(e) => setName(e.target.value)}
        />
        {errors.name && <p className={s.fieldError}>{errors.name}</p>}
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="reg-email">
          Email
        </label>
        <input
          id="reg-email"
          className={s.input}
          type="email"
          autoComplete="username"
          required
          value={email}
          aria-invalid={!!errors.email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {errors.email && <p className={s.fieldError}>{errors.email}</p>}
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="reg-password">
          Пароль
        </label>
        <input
          id="reg-password"
          className={s.input}
          type="password"
          autoComplete="new-password"
          required
          value={password}
          aria-invalid={!!errors.password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {errors.password ? (
          <p className={s.fieldError}>{errors.password}</p>
        ) : (
          <p className={s.hint}>
            Не короче 10 символов. Открывает доступ к аккаунту, но не к данным.
          </p>
        )}
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="reg-keyphrase">
          Ключевая фраза
        </label>
        <input
          id="reg-keyphrase"
          className={s.input}
          type="password"
          autoComplete="new-password"
          required
          value={keyphrase}
          aria-invalid={!!errors.keyphrase}
          onChange={(e) => setKeyphrase(e.target.value)}
        />
        <p className={s.hint}>
          Шифрует ваши записи и на сервер не передаётся. Надёжнее длинная фраза
          из нескольких случайных слов, чем короткая со спецсимволами.
        </p>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="reg-keyphrase-repeat">
          Ключевая фраза ещё раз
        </label>
        <input
          id="reg-keyphrase-repeat"
          className={s.input}
          type="password"
          autoComplete="new-password"
          required
          value={keyphraseRepeat}
          aria-invalid={!!errors.keyphrase}
          onChange={(e) => setKeyphraseRepeat(e.target.value)}
        />
        {errors.keyphrase && <p className={s.fieldError}>{errors.keyphrase}</p>}
      </div>

      <div className={s.warning}>
        <p>
          <strong>Ключевую фразу невозможно восстановить.</strong> Мы её не
          храним и не видим — забытая фраза означает безвозвратную потерю всех
          записей.
        </p>
        <p>После регистрации вы получите код восстановления. Сохраните его.</p>
      </div>

      <label className={s.checkbox}>
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
        />
        <span>Я понимаю, что при утере фразы данные восстановить нельзя</span>
      </label>

      <button className={s.button} type="submit" disabled={busy || !understood}>
        {busy ? "Создание ключей…" : "Зарегистрироваться"}
      </button>
    </form>
  );
}
