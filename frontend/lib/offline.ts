/**
 * Офлайн-кеш записей и категорий.
 *
 * Здесь лежит ровно то, что отдаёт сервер, — шифротекст. Расшифровка остаётся
 * за vault.ts и происходит на лету, поэтому открытый текст не оказывается
 * на диске ни на секунду. Кража базы браузера даёт ровно столько же, сколько
 * кража базы сервера: блобы без ключа.
 *
 * Ключ от них живёт в KeyVault и стирается по auto-lock. Кеш переживает
 * блокировку намеренно: заново качать записи ради разблокировки незачем,
 * прочитать их всё равно нельзя.
 */

import type { CategoryRecord, PostRecord, Session } from "./api";
import { done, openDatabase, promisify, STORE_META, STORE_RECORDS } from "./idb";

type Kind = "post" | "category";

/** Составной ключ: в одном хранилище лежат оба вида записей. */
type CachedRecord = {
  key: string;
  kind: Kind;
  record: PostRecord | CategoryRecord;
};

type SyncMeta = {
  id: "sync";
  /**
   * updated_at самой свежей записи, которую мы видели.
   *
   * Берём отметку сервера, а не собственные часы: расхождение времени между
   * браузером и хостингом на пару минут означало бы пропущенные изменения,
   * причём молча.
   */
  postsUpdatedSince: string | null;
};

const keyOf = (kind: Kind, id: number) => `${kind}:${id}`;

/**
 * Снимок сессии: кто вошёл и крипто-конверт.
 *
 * Нужен для запуска без сети. GET /auth/me офлайн падает, и без снимка
 * приложение считало бы пользователя анонимным — то есть офлайн-перезагрузка
 * выкидывала бы на форму входа поверх полного кеша записей.
 *
 * Секретов здесь нет: конверт и так лежит на сервере, он бесполезен без
 * ключевой фразы. Стирается при выходе вместе с остальным кешем.
 */
type SessionSnapshot = { id: "session"; session: Session };

export async function saveSession(session: Session): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(STORE_META, "readwrite");

  tx.objectStore(STORE_META).put({ id: "session", session } satisfies SessionSnapshot);

  await done(tx);
  db.close();
}

export async function readSession(): Promise<Session | null> {
  const db = await openDatabase();
  const tx = db.transaction(STORE_META, "readonly");
  const snapshot = await promisify<SessionSnapshot | undefined>(
    tx.objectStore(STORE_META).get("session"),
  );
  db.close();

  return snapshot?.session ?? null;
}

export async function readCached<T extends PostRecord | CategoryRecord>(
  kind: Kind,
): Promise<T[]> {
  const db = await openDatabase();
  const tx = db.transaction(STORE_RECORDS, "readonly");

  const all = await promisify<CachedRecord[]>(
    tx.objectStore(STORE_RECORDS).getAll(),
  );
  db.close();

  return all.filter((r) => r.kind === kind).map((r) => r.record as T);
}

/**
 * Применяет ответ сервера к кешу: изменённые обновляются, удалённые исчезают.
 *
 * Удалённые приходят в той же выдаче с проставленным deleted_at — иначе
 * офлайн-клиент никогда не узнал бы, что записи больше нет.
 */
export async function mergePosts(changed: PostRecord[]): Promise<void> {
  if (changed.length === 0) return;

  const db = await openDatabase();
  const tx = db.transaction([STORE_RECORDS, STORE_META], "readwrite");
  const records = tx.objectStore(STORE_RECORDS);

  let newest: string | null = null;

  for (const record of changed) {
    if (record.deleted_at) {
      records.delete(keyOf("post", record.id));
    } else {
      records.put({ key: keyOf("post", record.id), kind: "post", record });
    }

    // Отметку двигаем и по удалённым: иначе они приезжали бы в каждой выдаче
    if (!newest || record.updated_at > newest) newest = record.updated_at;
  }

  if (newest) {
    const meta = tx.objectStore(STORE_META);
    const current = await promisify<SyncMeta | undefined>(meta.get("sync"));

    if (!current?.postsUpdatedSince || newest > current.postsUpdatedSince) {
      meta.put({ id: "sync", postsUpdatedSince: newest } satisfies SyncMeta);
    }
  }

  await done(tx);
  db.close();
}

/**
 * Категории заменяются целиком.
 *
 * У них нет ни soft delete, ни updated_since: инкрементально синхронизировать
 * нечего, а список короткий. Замена целиком — единственный способ узнать
 * об удалённой категории.
 */
export async function replaceCategories(list: CategoryRecord[]): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(STORE_RECORDS, "readwrite");
  const store = tx.objectStore(STORE_RECORDS);

  const existing = await promisify<CachedRecord[]>(store.getAll());
  for (const stale of existing) {
    if (stale.kind === "category") store.delete(stale.key);
  }

  for (const record of list) {
    store.put({ key: keyOf("category", record.id), kind: "category", record });
  }

  await done(tx);
  db.close();
}

export async function lastPostSync(): Promise<string | null> {
  const db = await openDatabase();
  const tx = db.transaction(STORE_META, "readonly");
  const meta = await promisify<SyncMeta | undefined>(
    tx.objectStore(STORE_META).get("sync"),
  );
  db.close();

  return meta?.postsUpdatedSince ?? null;
}

/** Выход из аккаунта: чужие данные в браузере оставлять нельзя. */
export async function clearCache(): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction([STORE_RECORDS, STORE_META], "readwrite");

  tx.objectStore(STORE_RECORDS).clear();
  tx.objectStore(STORE_META).clear();

  await done(tx);
  db.close();
}
