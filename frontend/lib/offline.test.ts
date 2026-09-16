import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { CategoryRecord, PostRecord } from "./api";
import {
  clearCache,
  lastPostSync,
  mergePosts,
  readCached,
  replaceCategories,
} from "./offline";

function post(id: number, updatedAt: string, deletedAt: string | null = null) {
  return {
    id,
    iv: "aXY=",
    ciphertext: "Y2lwaGVy",
    payload_version: 1,
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: deletedAt,
    type: "text",
    category_id: null,
  } as PostRecord;
}

function category(id: number) {
  return {
    id,
    iv: "aXY=",
    ciphertext: "Y2lwaGVy",
    payload_version: 1,
    created_at: "2026-01-01T00:00:00+00:00",
    updated_at: "2026-01-01T00:00:00+00:00",
    position: 0,
    parent_id: null,
  } as CategoryRecord;
}

const ids = async (kind: "post" | "category") =>
  (await readCached(kind)).map((r) => r.id).sort((a, b) => a - b);

describe("офлайн-кеш записей", () => {
  beforeEach(async () => {
    await clearCache();
  });

  it("сохраняет пришедшие записи", async () => {
    await mergePosts([post(1, "2026-01-01T10:00:00+00:00")]);

    expect(await ids("post")).toEqual([1]);
  });

  it("обновляет существующую запись, а не плодит копию", async () => {
    await mergePosts([post(1, "2026-01-01T10:00:00+00:00")]);
    await mergePosts([post(1, "2026-01-02T10:00:00+00:00")]);

    const cached = await readCached<PostRecord>("post");
    expect(cached).toHaveLength(1);
    expect(cached[0].updated_at).toBe("2026-01-02T10:00:00+00:00");
  });

  it("убирает удалённую запись из кеша", async () => {
    await mergePosts([post(1, "2026-01-01T10:00:00+00:00")]);
    await mergePosts([
      post(1, "2026-01-02T10:00:00+00:00", "2026-01-02T10:00:00+00:00"),
    ]);

    expect(await ids("post")).toEqual([]);
  });

  it("не трогает записи, которых не было в выдаче", async () => {
    await mergePosts([
      post(1, "2026-01-01T10:00:00+00:00"),
      post(2, "2026-01-01T10:00:00+00:00"),
    ]);
    await mergePosts([post(2, "2026-01-03T10:00:00+00:00")]);

    expect(await ids("post")).toEqual([1, 2]);
  });
});

describe("отметка синхронизации", () => {
  beforeEach(async () => {
    await clearCache();
  });

  it("пустая, пока ничего не приходило", async () => {
    expect(await lastPostSync()).toBeNull();
  });

  it("равна самой свежей отметке из выдачи", async () => {
    await mergePosts([
      post(1, "2026-01-01T10:00:00+00:00"),
      post(2, "2026-01-05T10:00:00+00:00"),
      post(3, "2026-01-03T10:00:00+00:00"),
    ]);

    expect(await lastPostSync()).toBe("2026-01-05T10:00:00+00:00");
  });

  /** Иначе удалённые приезжали бы в каждой последующей выдаче. */
  it("двигается и по удалённой записи", async () => {
    await mergePosts([
      post(1, "2026-01-09T10:00:00+00:00", "2026-01-09T10:00:00+00:00"),
    ]);

    expect(await lastPostSync()).toBe("2026-01-09T10:00:00+00:00");
  });

  it("не откатывается назад на более старой выдаче", async () => {
    await mergePosts([post(1, "2026-01-05T10:00:00+00:00")]);
    await mergePosts([post(2, "2026-01-02T10:00:00+00:00")]);

    expect(await lastPostSync()).toBe("2026-01-05T10:00:00+00:00");
  });
});

describe("категории", () => {
  beforeEach(async () => {
    await clearCache();
  });

  /** Инкрементального синка у категорий нет: удалённую видно только так. */
  it("заменяются целиком", async () => {
    await replaceCategories([category(1), category(2)]);
    await replaceCategories([category(2), category(3)]);

    expect(await ids("category")).toEqual([2, 3]);
  });

  it("не задевают записи", async () => {
    await mergePosts([post(7, "2026-01-01T10:00:00+00:00")]);
    await replaceCategories([category(1)]);

    expect(await ids("post")).toEqual([7]);
  });
});

describe("очистка", () => {
  it("стирает и записи, и отметку синхронизации", async () => {
    await mergePosts([post(1, "2026-01-01T10:00:00+00:00")]);
    await replaceCategories([category(1)]);

    await clearCache();

    expect(await ids("post")).toEqual([]);
    expect(await ids("category")).toEqual([]);
    expect(await lastPostSync()).toBeNull();
  });
});
