"use client";

import { useState, type FormEvent } from "react";
import {
  emptyPayload,
  type Category,
  type PasswordPayload,
  type Post,
  type PostPayload,
  type PostType,
  type TextPayload,
} from "@/lib/vault";
import { PasswordField } from "./PasswordField";
import s from "./ui.module.css";
import v from "./vault.module.css";

export function PostEditor({
  post,
  categories,
  onSave,
  onDelete,
  onCancel,
}: {
  post: Post | null;
  categories: Category[];
  onSave(input: {
    id?: number;
    type: PostType;
    categoryId: number | null;
    payload: PostPayload;
  }): Promise<void>;
  onDelete(id: number): Promise<void>;
  onCancel(): void;
}) {
  const [type, setType] = useState<PostType>(post?.type ?? "password");
  const [categoryId, setCategoryId] = useState<number | null>(
    post?.categoryId ?? null,
  );
  const [payload, setPayload] = useState<PostPayload>(
    post?.payload ?? emptyPayload("password"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Смена типа переносит заголовок, остальное у форм не пересекается. */
  function switchType(next: PostType) {
    if (next === type) return;
    setType(next);
    setPayload({ ...emptyPayload(next), title: payload.title });
  }

  function patch(fields: Partial<PasswordPayload & TextPayload>) {
    setPayload((current) => ({ ...current, ...fields }) as PostPayload);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await onSave({ id: post?.id, type, categoryId, payload });
    } catch {
      setError("Не удалось сохранить запись");
      setBusy(false);
    }
  }

  async function remove() {
    if (!post) return;
    if (!confirm("Удалить запись? Восстановить её будет нельзя.")) return;

    setBusy(true);
    try {
      await onDelete(post.id);
    } catch {
      setError("Не удалось удалить запись");
      setBusy(false);
    }
  }

  const password = payload as PasswordPayload;
  const text = payload as TextPayload;

  return (
    <div>
      <div className={v.editorHead}>
        <button type="button" className={s.linkButton} onClick={onCancel}>
          ← К списку
        </button>

        {!post && (
          <div className={v.typeSwitch}>
            <button
              type="button"
              className={v.typeOption}
              aria-pressed={type === "password"}
              onClick={() => switchType("password")}
            >
              Пароль
            </button>
            <button
              type="button"
              className={v.typeOption}
              aria-pressed={type === "text"}
              onClick={() => switchType("text")}
            >
              Заметка
            </button>
          </div>
        )}
      </div>

      <form className={s.form} onSubmit={submit}>
        {error && <p className={s.alert}>{error}</p>}

        {post?.broken && (
          <p className={s.alert}>
            Запись не расшифровывается. Сохранение перезапишет её содержимое.
          </p>
        )}

        <div className={s.field}>
          <label className={s.label} htmlFor="post-title">
            Заголовок
          </label>
          <input
            id="post-title"
            className={s.input}
            required
            autoFocus
            value={payload.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </div>

        {type === "password" ? (
          <>
            <div className={s.field}>
              <label className={s.label} htmlFor="post-username">
                Логин
              </label>
              <input
                id="post-username"
                className={s.input}
                autoComplete="off"
                value={password.username}
                onChange={(e) => patch({ username: e.target.value })}
              />
            </div>

            <PasswordField
              value={password.password}
              onChange={(next) => patch({ password: next })}
            />

            <div className={s.field}>
              <label className={s.label} htmlFor="post-url">
                Адрес
              </label>
              <input
                id="post-url"
                className={s.input}
                inputMode="url"
                placeholder="https://"
                value={password.url}
                onChange={(e) => patch({ url: e.target.value })}
              />
            </div>

            <div className={s.field}>
              <label className={s.label} htmlFor="post-note">
                Заметка
              </label>
              <textarea
                id="post-note"
                className={v.textarea}
                value={password.note}
                onChange={(e) => patch({ note: e.target.value })}
              />
            </div>
          </>
        ) : (
          <div className={s.field}>
            <label className={s.label} htmlFor="post-body">
              Текст
            </label>
            <textarea
              id="post-body"
              className={v.textarea}
              value={text.body}
              onChange={(e) => patch({ body: e.target.value })}
            />
          </div>
        )}

        <div className={s.field}>
          <label className={s.label} htmlFor="post-category">
            Категория
          </label>
          <select
            id="post-category"
            className={s.input}
            value={categoryId ?? ""}
            onChange={(e) =>
              setCategoryId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">Без категории</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className={v.actions}>
          <button className={s.button} type="submit" disabled={busy}>
            {busy ? "Шифрование…" : "Сохранить"}
          </button>

          <span className={v.spacer} />

          {post && (
            <button
              type="button"
              className={`${s.linkButton} ${v.danger}`}
              onClick={remove}
              disabled={busy}
            >
              Удалить
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
