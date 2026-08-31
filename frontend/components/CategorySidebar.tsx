"use client";

import { useState } from "react";
import type { Category, Post } from "@/lib/vault";
import s from "./ui.module.css";
import v from "./vault.module.css";

type Filter = null | "none" | number;

export function CategorySidebar({
  categories,
  posts,
  active,
  onSelect,
  onSave,
  onDelete,
}: {
  categories: Category[];
  posts: Post[];
  active: Filter;
  onSelect(filter: Filter): void;
  onSave(input: { id?: number; name: string }): Promise<void>;
  onDelete(id: number): Promise<void>;
}) {
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState("");

  const uncategorized = posts.filter((p) => p.categoryId === null).length;
  const countIn = (id: number) => posts.filter((p) => p.categoryId === id).length;

  async function commit() {
    const name = draft.trim();
    if (!name) return cancel();

    await onSave(editingId === "new" ? { name } : { id: editingId as number, name });
    cancel();
  }

  function cancel() {
    setEditingId(null);
    setDraft("");
  }

  async function remove(category: Category) {
    const count = countIn(category.id);
    const warning = count
      ? `Удалить категорию «${category.name}»? ${count} записей останутся, но потеряют категорию.`
      : `Удалить категорию «${category.name}»?`;

    if (confirm(warning)) await onDelete(category.id);
  }

  return (
    <nav className={v.sidebar}>
      <p className={v.sidebarTitle}>Категории</p>

      <button
        type="button"
        className={v.categoryItem}
        aria-current={active === null}
        onClick={() => onSelect(null)}
      >
        <span className={v.categoryName}>Все записи</span>
        <span className={v.count}>{posts.length}</span>
      </button>

      <button
        type="button"
        className={v.categoryItem}
        aria-current={active === "none"}
        onClick={() => onSelect("none")}
      >
        <span className={v.categoryName}>Без категории</span>
        <span className={v.count}>{uncategorized}</span>
      </button>

      {categories.map((category) =>
        editingId === category.id ? (
          <CategoryInput
            key={category.id}
            value={draft}
            onChange={setDraft}
            onCommit={commit}
            onCancel={cancel}
          />
        ) : (
          <div className={v.categoryRow} key={category.id}>
            <button
              type="button"
              className={v.categoryItem}
              aria-current={active === category.id}
              onClick={() => onSelect(category.id)}
            >
              <span className={v.categoryName}>{category.name}</span>
              <span className={v.count}>{countIn(category.id)}</span>
            </button>

            <button
              type="button"
              className={v.iconButton}
              title="Переименовать"
              onClick={() => {
                setEditingId(category.id);
                setDraft(category.name);
              }}
            >
              ✎
            </button>
            <button
              type="button"
              className={v.iconButton}
              title="Удалить"
              onClick={() => remove(category)}
            >
              ×
            </button>
          </div>
        ),
      )}

      {editingId === "new" ? (
        <CategoryInput
          value={draft}
          onChange={setDraft}
          onCommit={commit}
          onCancel={cancel}
        />
      ) : (
        <button
          type="button"
          className={v.categoryItem}
          onClick={() => {
            setEditingId("new");
            setDraft("");
          }}
        >
          <span className={s.muted}>+ Категория</span>
        </button>
      )}
    </nav>
  );
}

function CategoryInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange(next: string): void;
  onCommit(): void;
  onCancel(): void;
}) {
  return (
    <input
      className={s.input}
      autoFocus
      value={value}
      placeholder="Название"
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit();
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}
