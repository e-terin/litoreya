/**
 * Единственная точка обращения к API.
 *
 * Весь транспорт изолирован здесь намеренно: сейчас аутентификация построена на
 * cookie-сессии Sanctum (один домен), но если фронт когда-нибудь переедет на
 * отдельный домен, переход на Bearer-токены затронет только этот файл.
 *
 * Путь всегда относительный — в обоих режимах браузер видит один origin:
 * в dev его обеспечивает rewrite в next.config.ts, в проде — Apache.
 */

import type { CryptoEnvelope, KeyphraseWrapper } from "./crypto";

const BASE = "/api";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Первое сообщение по полю — форме обычно нужно именно оно. */
  errorFor(field: string): string | undefined {
    return this.errors[field]?.[0];
  }
}

// ---------------------------------------------------------------- CSRF

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^|; )${name}=([^;]*)`));
  // Значение куки URL-кодировано, Laravel ждёт заголовок в исходном виде
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Sanctum отдаёт XSRF-TOKEN обычной (не HttpOnly) кукой, чтобы JS мог вернуть
 * её значение заголовком. Кука живёт столько же, сколько сессия, поэтому
 * запрашиваем её только когда она отсутствует.
 */
async function ensureCsrfCookie(): Promise<void> {
  if (readCookie("XSRF-TOKEN")) return;

  await fetch(`${BASE}/csrf-cookie`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
}

// ---------------------------------------------------------------- транспорт

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const mutating = method !== "GET";

  if (mutating) await ensureCsrfCookie();

  const csrf = readCookie("XSRF-TOKEN");

  const response = await fetch(`${BASE}${path}`, {
    method,
    // Сессионная кука должна уходить с каждым запросом
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(csrf ? { "X-XSRF-TOKEN": csrf } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => undefined);

  if (!response.ok) {
    const data = payload as
      | { message?: string; errors?: Record<string, string[]> }
      | undefined;

    throw new ApiError(
      response.status,
      data?.message ?? `HTTP ${response.status}`,
      data?.errors ?? {},
    );
  }

  return payload as T;
}

// ---------------------------------------------------------------- типы

export type User = {
  id: number;
  name: string;
  email: string;
};

export type Session = {
  user: User;
  crypto: CryptoEnvelope;
};

export type Health = {
  status: "ok" | "degraded";
  php: string;
  laravel: string;
  database: "up" | "down";
  time: string;
};

// ---------------------------------------------------------------- эндпоинты

export const getHealth = () => request<Health>("GET", "/health");

export const me = () => request<Session>("GET", "/auth/me");

export const login = (email: string, password: string) =>
  request<Session>("POST", "/auth/login", { email, password });

/**
 * Конверт собирается вызывающим кодом заранее: ключевая фраза не должна
 * оказаться в этом модуле даже как аргумент.
 */
export const register = (input: {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  crypto: CryptoEnvelope;
}) => request<Session>("POST", "/auth/register", input);

export const logout = () => request<void>("POST", "/auth/logout", {});

export const updateKeyphrase = (
  currentPassword: string,
  wrapper: KeyphraseWrapper,
) =>
  request<{ crypto: CryptoEnvelope }>("PUT", "/auth/keyphrase", {
    current_password: currentPassword,
    crypto: wrapper,
  });

/**
 * Смена пароля аккаунта. Данных не касается: пароль доказывает серверу, кто ты,
 * а расшифровывает ключевая фраза.
 *
 * password_confirmation дублирует пароль: сервер требует confirmed, а сверку
 * повтора уже сделала форма — второе поле до этого модуля не доезжает.
 */
export const updatePassword = (currentPassword: string, password: string) =>
  request<{ message: string }>("PUT", "/auth/password", {
    current_password: currentPassword,
    password,
    password_confirmation: password,
  });

// ---------------------------------------------------------------- записи

/**
 * Записи в том виде, в каком их знает сервер: служебные поля плюс блоб.
 * Ни заголовка, ни содержимого здесь нет — они внутри ciphertext.
 */
export type EncryptedRecord = {
  id: number;
  iv: string;
  ciphertext: string;
  payload_version: number;
  created_at: string;
  updated_at: string;
};

export type PostRecord = EncryptedRecord & {
  type: "text" | "password";
  category_id: number | null;
  deleted_at: string | null;
};

export type CategoryRecord = EncryptedRecord & {
  position: number;
  /** Дерево. Открытое поле: сервер видит форму, но не названия. */
  parent_id: number | null;
};

type Envelope<T> = { data: T };

export const listPosts = () =>
  request<Envelope<PostRecord[]>>("GET", "/posts").then((r) => r.data);

export const createPost = (body: Record<string, unknown>) =>
  request<Envelope<PostRecord>>("POST", "/posts", body).then((r) => r.data);

export const updatePost = (id: number, body: Record<string, unknown>) =>
  request<Envelope<PostRecord>>("PUT", `/posts/${id}`, body).then((r) => r.data);

export const deletePost = (id: number) =>
  request<void>("DELETE", `/posts/${id}`);

export const listCategories = () =>
  request<Envelope<CategoryRecord[]>>("GET", "/categories").then((r) => r.data);

export const createCategory = (body: Record<string, unknown>) =>
  request<Envelope<CategoryRecord>>("POST", "/categories", body).then(
    (r) => r.data,
  );

export const updateCategory = (id: number, body: Record<string, unknown>) =>
  request<Envelope<CategoryRecord>>("PUT", `/categories/${id}`, body).then(
    (r) => r.data,
  );

export const deleteCategory = (id: number) =>
  request<void>("DELETE", `/categories/${id}`);
