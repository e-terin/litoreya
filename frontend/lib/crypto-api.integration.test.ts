import { describe, expect, it } from "vitest";
import {
  createEnvelope,
  rewrapForNewKeyphrase,
  unlockWithKeyphrase,
  unlockWithRecoveryCode,
  encryptPayload,
  decryptPayload,
  type CryptoEnvelope,
} from "./crypto";

/*
 * Интеграция крипто-модуля с живым API.
 *
 * Юнит-тесты проверяют схему саму по себе, серверные — валидацию саму по себе.
 * Здесь проверяется стык: совпадают ли размеры обёрток, формат base64 и
 * ограничения KDF с тем, что реально принимает сервер. Это место, где
 * расхождение обнаруживается позже всего и больнее всего.
 *
 * Запуск: LITOREYA_API=http://localhost:8081 npm run test:integration
 */

const API = process.env.LITOREYA_API;

/** Минимальный cookie jar: в Node fetch их сам не хранит. */
class Jar {
  private cookies = new Map<string, string>();

  absorb(response: Response): void {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  csrf(): string {
    return decodeURIComponent(this.cookies.get("XSRF-TOKEN") ?? "");
  }
}

async function call(
  jar: Jar,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Origin: API!,
      Referer: `${API}/`,
      Cookie: jar.header(),
      "X-XSRF-TOKEN": jar.csrf(),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });

  jar.absorb(response);
  const text = await response.text();

  return { status: response.status, data: text ? JSON.parse(text) : null };
}

async function freshJar(): Promise<Jar> {
  const jar = new Jar();
  jar.absorb(await fetch(`${API}/api/csrf-cookie`, { headers: { Origin: API! } }));
  return jar;
}

describe.skipIf(!API)("крипто-модуль против живого API", () => {
  it("конверт, собранный клиентом, принимается сервером", async () => {
    const jar = await freshJar();
    const phrase = "долгая фраза из нескольких слов";
    const { envelope, recoveryCode } = await createEnvelope(phrase);

    const email = `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

    const registered = await call(jar, "POST", "/api/auth/register", {
      name: "Integration",
      email,
      password: "correct-horse-battery",
      password_confirmation: "correct-horse-battery",
      crypto: envelope,
    });

    // Размеры и формат должны сойтись с Base64Bytes на сервере
    expect(registered.status, JSON.stringify(registered.data)).toBe(201);

    // Конверт вернулся неизменным — сервер обращается с ним как с блобом
    expect(registered.data.crypto).toEqual({
      ...envelope,
      kdf_iterations: envelope.kdf_iterations,
    });

    // И он действительно разворачивается тем, чем должен
    const returned = registered.data.crypto as CryptoEnvelope;
    await expect(unlockWithKeyphrase(phrase, returned)).resolves.toBeDefined();
    await expect(
      unlockWithRecoveryCode(recoveryCode, returned),
    ).resolves.toBeDefined();
  }, 120_000);

  it("данные, зашифрованные до перелогина, читаются после него", async () => {
    const phrase = "вторая долгая фраза для теста";
    const email = `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

    const jar = await freshJar();
    const { envelope, dek } = await createEnvelope(phrase);

    await call(jar, "POST", "/api/auth/register", {
      name: "Integration",
      email,
      password: "correct-horse-battery",
      password_confirmation: "correct-horse-battery",
      crypto: envelope,
    });

    const secret = { title: "Пароль от банка", body: "hunter2" };
    const encrypted = await encryptPayload(dek, secret);

    await call(jar, "POST", "/api/auth/logout", {});

    // Новая сессия, конверт приходит с сервера
    const fresh = await freshJar();
    const loggedIn = await call(fresh, "POST", "/api/auth/login", {
      email,
      password: "correct-horse-battery",
    });
    expect(loggedIn.status).toBe(200);

    const dekAfter = await unlockWithKeyphrase(phrase, loggedIn.data.crypto);
    await expect(decryptPayload(dekAfter, encrypted)).resolves.toEqual(secret);
  }, 120_000);

  it("смена ключевой фразы проходит через API и не трогает данные", async () => {
    const phrase = "третья фраза до смены";
    const newPhrase = "четвёртая фраза после смены";
    const email = `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

    const jar = await freshJar();
    const { envelope, dek } = await createEnvelope(phrase);

    await call(jar, "POST", "/api/auth/register", {
      name: "Integration",
      email,
      password: "correct-horse-battery",
      password_confirmation: "correct-horse-battery",
      crypto: envelope,
    });

    const encrypted = await encryptPayload(dek, { note: "написано до смены" });

    const wrapper = await rewrapForNewKeyphrase(phrase, newPhrase, envelope);
    const updated = await call(jar, "PUT", "/api/auth/keyphrase", {
      current_password: "correct-horse-battery",
      crypto: wrapper,
    });

    expect(updated.status, JSON.stringify(updated.data)).toBe(200);

    const after = updated.data.crypto as CryptoEnvelope;

    // Старый шифротекст читается новой фразой — DEK не менялся
    const dekAfter = await unlockWithKeyphrase(newPhrase, after);
    await expect(decryptPayload(dekAfter, encrypted)).resolves.toEqual({
      note: "написано до смены",
    });

    // Старая фраза больше не подходит
    await expect(unlockWithKeyphrase(phrase, after)).rejects.toThrow();
  }, 180_000);

  /**
   * Главное проверяемое свойство проекта: то, что сервер хранит, не содержит
   * открытого текста — включая заголовок.
   */
  it("сохранённая запись не содержит открытого текста нигде в ответе сервера", async () => {
    const phrase = "фраза для проверки постов";
    const email = `posts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

    const jar = await freshJar();
    const { envelope, dek } = await createEnvelope(phrase);

    await call(jar, "POST", "/api/auth/register", {
      name: "Integration",
      email,
      password: "correct-horse-battery",
      password_confirmation: "correct-horse-battery",
      crypto: envelope,
    });

    const secret = {
      title: "Совершенно секретный заголовок",
      username: "ivan",
      password: "hunter2-очень-секретно",
      url: "https://bank.example",
      note: "кодовое слово омлет",
    };

    const encrypted = await encryptPayload(dek, secret);
    const created = await call(jar, "POST", "/api/posts", {
      ...encrypted,
      type: "password",
      category_id: null,
    });

    expect(created.status, JSON.stringify(created.data)).toBe(201);

    // Ни одно значение из открытого текста не должно встречаться в том,
    // что вернул сервер
    const listed = await call(jar, "GET", "/api/posts");
    const raw = JSON.stringify(listed.data);

    for (const value of Object.values(secret)) {
      expect(raw).not.toContain(value);
    }

    // И при этом запись читается обратно целиком
    const record = listed.data.data[0];
    await expect(decryptPayload(dek, record)).resolves.toEqual(secret);
  }, 120_000);

  it("чужие записи недоступны", async () => {
    const password = "correct-horse-battery";

    const owner = await freshJar();
    const { envelope: ownerEnvelope, dek } = await createEnvelope("фраза владельца записи");
    await call(owner, "POST", "/api/auth/register", {
      name: "Owner",
      email: `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password,
      password_confirmation: password,
      crypto: ownerEnvelope,
    });

    const encrypted = await encryptPayload(dek, { title: "Моё", body: "личное" });
    const created = await call(owner, "POST", "/api/posts", {
      ...encrypted,
      type: "text",
      category_id: null,
    });
    const postId = created.data.data.id;

    const stranger = await freshJar();
    const { envelope: strangerEnvelope } = await createEnvelope("фраза постороннего лица");
    await call(stranger, "POST", "/api/auth/register", {
      name: "Stranger",
      email: `stranger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password,
      password_confirmation: password,
      crypto: strangerEnvelope,
    });

    // 404, а не 403: код ответа не должен подсказывать, что такой id существует
    const read = await call(stranger, "GET", `/api/posts/${postId}`);
    expect(read.status).toBe(404);

    const list = await call(stranger, "GET", "/api/posts");
    expect(list.data.data).toHaveLength(0);
  }, 180_000);

  it("категория переживает круг через сервер", async () => {
    const email = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const jar = await freshJar();
    const { envelope, dek } = await createEnvelope("фраза для проверки категорий");

    await call(jar, "POST", "/api/auth/register", {
      name: "Integration",
      email,
      password: "correct-horse-battery",
      password_confirmation: "correct-horse-battery",
      crypto: envelope,
    });

    const encrypted = await encryptPayload(dek, { name: "Финансы" });
    const created = await call(jar, "POST", "/api/categories", {
      ...encrypted,
      position: 0,
    });

    expect(created.status).toBe(201);
    expect(JSON.stringify(created.data)).not.toContain("Финансы");

    const listed = await call(jar, "GET", "/api/categories");
    await expect(decryptPayload(dek, listed.data.data[0])).resolves.toEqual({
      name: "Финансы",
    });
  }, 120_000);

  it("сервер отвергает ослабленные параметры KDF", async () => {
    const jar = await freshJar();
    const { envelope } = await createEnvelope("пятая фраза для проверки");

    const response = await call(jar, "POST", "/api/auth/register", {
      name: "Integration",
      email: `weak-${Date.now()}@example.com`,
      password: "correct-horse-battery",
      password_confirmation: "correct-horse-battery",
      crypto: { ...envelope, kdf_iterations: 1000 },
    });

    expect(response.status).toBe(422);
    expect(response.data.errors).toHaveProperty("crypto.kdf_iterations");
  }, 120_000);
});
