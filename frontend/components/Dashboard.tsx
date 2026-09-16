"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import {
  loadCategories,
  loadPosts,
  removeCategory,
  removePost,
  saveCategory,
  savePost,
  searchPosts,
  type Category,
  type PasswordPayload,
  type Post,
  type PostPayload,
  type PostType,
  type TextPayload,
} from "@/lib/vault";
import { buildCategoryTree, descendantIds } from "@/lib/tree";
import { CategorySidebar } from "./CategorySidebar";
import { CopyButton } from "./CopyButton";
import { PostEditor } from "./PostEditor";
import s from "./ui.module.css";
import v from "./vault.module.css";

/** null — все записи, "none" — без категории, число — конкретная категория. */
type Filter = null | "none" | number;

type Editing = { post: Post | null } | null;

export function Dashboard() {
  const { user, dek, lock, signOut } = useSession();

  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState<Filter>(null);
  const [expanded, setExpanded] = useState<Set<number>>(readExpanded);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    if (!dek) return;

    try {
      const [posts, categories] = await Promise.all([
        loadPosts(dek),
        loadCategories(dek),
      ]);

      setPosts(posts.posts);
      setCategories(categories.categories);

      // Сеть недоступна — не ошибка: показываем кеш и говорим об этом
      setOffline(!posts.synced || !categories.synced);
      setError(null);
    } catch {
      setError("Не удалось загрузить записи");
    } finally {
      setLoading(false);
    }
  }, [dek]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tree = useMemo(() => buildCategoryTree(categories), [categories]);

  const visible = useMemo(() => {
    // Выбор категории показывает всю ветку: иначе родительский узел выглядел
    // бы пустым, хотя записи лежат в его подкатегориях.
    const branch =
      typeof filter === "number" ? descendantIds(tree, filter) : null;

    const byCategory = posts.filter((post) => {
      if (filter === null) return true;
      if (filter === "none") return post.categoryId === null;

      return post.categoryId !== null && branch!.has(post.categoryId);
    });

    return searchPosts(byCategory, query);
  }, [posts, tree, filter, query]);

  async function handleSave(input: {
    id?: number;
    type: PostType;
    categoryId: number | null;
    payload: PostPayload;
  }) {
    if (!dek) return;
    await savePost(dek, input);
    setEditing(null);
    await refresh();
  }

  async function handleDelete(id: number) {
    await removePost(id);
    setEditing(null);
    await refresh();
  }

  function handleToggle(id: number) {
    const next = new Set(expanded);
    if (!next.delete(id)) next.add(id);

    setExpanded(next);
    writeExpanded(next);
  }

  async function handleCategorySave(input: {
    id?: number;
    name: string;
    parentId?: number | null;
  }) {
    if (!dek) return;
    await saveCategory(dek, input);
    await refresh();
  }

  async function handleCategoryDelete(id: number) {
    await removeCategory(id);
    if (filter === id) setFilter(null);
    await refresh();
  }

  return (
    <>
      <header className={s.bar}>
        <strong>Litoreya</strong>
        <div className={s.barActions}>
          <Link href="/profile/" className={s.linkButton}>
            {user?.email}
          </Link>
          <button type="button" className={s.linkButton} onClick={lock}>
            Заблокировать
          </button>
          <button type="button" className={s.linkButton} onClick={signOut}>
            Выйти
          </button>
        </div>
      </header>

      {offline && (
        <p className={s.notice} role="status">
          Нет связи с сервером. Записи открываются из локальной копии;
          изменения станут доступны, когда связь вернётся.
        </p>
      )}

      <div className={v.layout}>
        <CategorySidebar
          offline={offline}
          tree={tree}
          posts={posts}
          active={filter}
          expanded={expanded}
          onToggle={handleToggle}
          onSelect={(next) => {
            setFilter(next);
            setEditing(null);
          }}
          onSave={handleCategorySave}
          onDelete={handleCategoryDelete}
        />

        <section>
          {editing ? (
            <PostEditor
              post={editing.post}
              tree={tree}
              offline={offline}
              onSave={handleSave}
              onDelete={handleDelete}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <>
              <div className={v.toolbar}>
                <input
                  className={`${s.input} ${v.search}`}
                  type="search"
                  placeholder="Поиск по записям"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  type="button"
                  className={s.button}
                  disabled={offline}
                  title={offline ? "Нужна связь с сервером" : undefined}
                  onClick={() => setEditing({ post: null })}
                >
                  + Запись
                </button>
              </div>

              {error && <p className={s.alert}>{error}</p>}

              {loading ? (
                <p className={s.muted}>Расшифровка…</p>
              ) : visible.length === 0 ? (
                <p className={v.empty}>
                  {posts.length === 0
                    ? "Пока пусто. Создайте первую запись — она зашифруется в браузере."
                    : "Ничего не найдено."}
                </p>
              ) : (
                <div className={v.list}>
                  {visible.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onOpen={() => setEditing({ post })}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function PostCard({ post, onOpen }: { post: Post; onOpen(): void }) {
  const payload = post.payload;

  // Пароль в превью не попадает никогда
  const subtitle = post.broken
    ? "не расшифровывается"
    : post.type === "password"
      ? [(payload as PasswordPayload).username, (payload as PasswordPayload).url]
          .filter(Boolean)
          .join(" · ")
      : (payload as TextPayload).body.replace(/\s+/g, " ").slice(0, 90);

  // Копировать можно только то, что расшифровалось
  const secret =
    post.type === "password" && !post.broken
      ? (payload as PasswordPayload)
      : null;

  return (
    <div className={v.card}>
      {/*
        Карточка перестала быть одной кнопкой: кнопку нельзя вложить в кнопку.
        Открытие записи висит на внутренней кнопке, копирование — рядом с ней.
      */}
      <button type="button" className={v.cardOpen} onClick={onOpen}>
        <span className={v.cardTop}>
          <span className={v.cardTitle}>
            {post.broken ? "— недоступно —" : payload.title || "Без заголовка"}
          </span>
          <span className={v.badge}>
            {post.type === "password" ? "пароль" : "текст"}
          </span>
        </span>
        {subtitle && <span className={v.cardMeta}>{subtitle}</span>}
      </button>

      {secret && (
        <div className={v.cardActions}>
          <CopyButton value={secret.username} label="Логин" />
          <CopyButton value={secret.password} label="Пароль" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- хранилище

/**
 * Развёрнутые ветки переживают перезагрузку вкладки.
 *
 * Это единственное, что приложение кладёт в localStorage. От него осознанно
 * отказались для мастер-ключа (см. lib/keyvault.ts), и запрет здесь не
 * ослабляется: наружу уходят только номера категорий — ни названий, ни ключей.
 * Любая ошибка чтения означает лишь свёрнутое дерево, поэтому она глушится.
 *
 * Читается прямо в инициализаторе useState. Расхождения при гидратации это не
 * даёт: пререндер отдаёт экран загрузки, а дашборд монтируется только после
 * того, как сессия разрешилась, — то есть уже в браузере.
 */
const EXPANDED_KEY = "litoreya:categories:expanded";

function readExpanded(): Set<number> {
  if (typeof window === "undefined") return new Set();

  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (!raw) return new Set();

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();

    return new Set(parsed.filter((id): id is number => typeof id === "number"));
  } catch {
    return new Set();
  }
}

function writeExpanded(expanded: Set<number>): void {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
  } catch {
    // Приватный режим или переполненная квота — дерево просто не запомнится
  }
}
