"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { CategorySidebar } from "./CategorySidebar";
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
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!dek) return;

    try {
      const [loadedPosts, loadedCategories] = await Promise.all([
        loadPosts(dek),
        loadCategories(dek),
      ]);

      setPosts(loadedPosts);
      setCategories(loadedCategories);
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

  const visible = useMemo(() => {
    const byCategory = posts.filter((post) => {
      if (filter === null) return true;
      if (filter === "none") return post.categoryId === null;
      return post.categoryId === filter;
    });

    return searchPosts(byCategory, query);
  }, [posts, filter, query]);

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

  async function handleCategorySave(input: { id?: number; name: string }) {
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
          <span className={s.muted}>{user?.email}</span>
          <button type="button" className={s.linkButton} onClick={lock}>
            Заблокировать
          </button>
          <button type="button" className={s.linkButton} onClick={signOut}>
            Выйти
          </button>
        </div>
      </header>

      <div className={v.layout}>
        <CategorySidebar
          categories={categories}
          posts={posts}
          active={filter}
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
              categories={categories}
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

  return (
    <button type="button" className={v.card} onClick={onOpen}>
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
  );
}
