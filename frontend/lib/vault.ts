/**
 * Слой между зашифрованными записями сервера и интерфейсом.
 *
 * Всё, что попадает наружу отсюда, уже расшифровано; всё, что уходит на сервер,
 * уже зашифровано. UI не должен видеть ни ciphertext, ни мастер-ключ в сыром виде.
 */

import * as api from "./api";
import { decryptPayload, encryptPayload } from "./crypto";
import * as offline from "./offline";

// ---------------------------------------------------------------- содержимое

export type PostType = "text" | "password";

/** Заметка. Заголовок внутри шифротекста — сервер не должен видеть и его. */
export type TextPayload = {
  title: string;
  body: string;
};

export type PasswordPayload = {
  title: string;
  username: string;
  password: string;
  url: string;
  note: string;
};

export type PostPayload = TextPayload | PasswordPayload;

export type CategoryPayload = {
  name: string;
};

export function emptyPayload(type: PostType): PostPayload {
  return type === "text"
    ? { title: "", body: "" }
    : { title: "", username: "", password: "", url: "", note: "" };
}

export function isPassword(
  type: PostType,
  payload: PostPayload,
): payload is PasswordPayload {
  return type === "password";
}

// ---------------------------------------------------------------- модели UI

export type Post = {
  id: number;
  type: PostType;
  categoryId: number | null;
  updatedAt: string;
  payload: PostPayload;
  /** Расшифровать не удалось — запись показывается, но не открывается. */
  broken?: boolean;
};

export type Category = {
  id: number;
  position: number;
  parentId: number | null;
  name: string;
  broken?: boolean;
};

// ---------------------------------------------------------------- чтение

/**
 * Одна нечитаемая запись не должна ронять весь дашборд.
 *
 * Такое возможно при рассинхроне ключей или повреждении данных: показать
 * остальное и пометить проблемную полезнее, чем пустой экран с ошибкой.
 */
async function decryptOrMark<T>(
  dek: CryptoKey,
  record: api.EncryptedRecord,
  onOk: (payload: T) => unknown,
  onFail: () => unknown,
): Promise<unknown> {
  try {
    return onOk(await decryptPayload<T>(dek, record));
  } catch {
    return onFail();
  }
}

/**
 * Записи: сначала синхронизируемся с сервером, потом расшифровываем из кеша.
 *
 * Источник истины для интерфейса — локальный кеш, а не ответ сервера. Так
 * путь без сети ничем не отличается от пути с сетью: отличается только то,
 * удалось ли перед этим обновить кеш.
 *
 * Сетевая ошибка здесь не ошибка: это офлайн. Возвращаем, что есть, и
 * сообщаем вызывающему коду через synced.
 */
export async function loadPosts(
  dek: CryptoKey,
): Promise<{ posts: Post[]; synced: boolean }> {
  let synced = true;

  try {
    const since = await offline.lastPostSync();
    await offline.mergePosts(await api.listPosts(since));
  } catch {
    synced = false;
  }

  const records = await offline.readCached<api.PostRecord>("post");

  const posts = await Promise.all(
    records.map(
      (record) =>
        decryptOrMark<PostPayload>(
          dek,
          record,
          (payload) => ({
            id: record.id,
            type: record.type,
            categoryId: record.category_id,
            updatedAt: record.updated_at,
            payload,
          }),
          () => ({
            id: record.id,
            type: record.type,
            categoryId: record.category_id,
            updatedAt: record.updated_at,
            payload: emptyPayload(record.type),
            broken: true,
          }),
        ) as Promise<Post>,
    ),
  );

  return { posts, synced };
}

export async function loadCategories(
  dek: CryptoKey,
): Promise<{ categories: Category[]; synced: boolean }> {
  let synced = true;

  try {
    await offline.replaceCategories(await api.listCategories());
  } catch {
    synced = false;
  }

  const records = await offline.readCached<api.CategoryRecord>("category");

  const categories = await Promise.all(
    records.map(
      (record) =>
        decryptOrMark<CategoryPayload>(
          dek,
          record,
          (payload) => ({
            id: record.id,
            position: record.position,
            parentId: record.parent_id,
            name: payload.name,
          }),
          // parentId нужен и здесь: без него нерасшифрованная категория
          // выпала бы из своего места, и вся ветка под ней осиротела бы
          () => ({
            id: record.id,
            position: record.position,
            parentId: record.parent_id,
            name: "— не расшифровано —",
            broken: true,
          }),
        ) as Promise<Category>,
    ),
  );

  return { categories, synced };
}

// ---------------------------------------------------------------- запись

export async function savePost(
  dek: CryptoKey,
  input: {
    id?: number;
    type: PostType;
    categoryId: number | null;
    payload: PostPayload;
  },
): Promise<void> {
  const encrypted = await encryptPayload(dek, input.payload);

  const body = {
    ...encrypted,
    type: input.type,
    category_id: input.categoryId,
  };

  if (input.id) await api.updatePost(input.id, body);
  else await api.createPost(body);
}

export async function saveCategory(
  dek: CryptoKey,
  input: { id?: number; name: string; position?: number; parentId?: number | null },
): Promise<void> {
  const encrypted = await encryptPayload(dek, { name: input.name });

  const body = {
    ...encrypted,
    position: input.position ?? 0,
    parent_id: input.parentId ?? null,
  };

  if (input.id) await api.updateCategory(input.id, body);
  else await api.createCategory(body);
}

export const removePost = api.deletePost;
export const removeCategory = api.deleteCategory;

// ---------------------------------------------------------------- поиск

/**
 * Поиск только на клиенте и только по расшифрованному.
 *
 * Серверный поиск потребовал бы слепых индексов и утечки частотности слов —
 * см. crypto-design.md. Пока записей немного, фильтрация в памяти честнее.
 */
export function searchPosts(posts: Post[], query: string): Post[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return posts;

  return posts.filter((post) => {
    const p = post.payload;
    // Пароль в поиск не включается намеренно
    const haystack = [
      p.title,
      "body" in p ? p.body : "",
      "username" in p ? p.username : "",
      "url" in p ? p.url : "",
      "note" in p ? p.note : "",
    ]
      .join("\n")
      .toLowerCase();

    return haystack.includes(needle);
  });
}
