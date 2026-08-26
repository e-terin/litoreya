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

const BASE = "/api";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const hasBody = init.body !== undefined;

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    // Сессионная кука должна уходить с каждым запросом
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const payload = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message =
      (payload as { message?: string } | undefined)?.message ??
      `HTTP ${response.status}`;
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}

export type Health = {
  status: "ok" | "degraded";
  php: string;
  laravel: string;
  database: "up" | "down";
  time: string;
};

export const getHealth = () => apiFetch<Health>("/health");
