"use client";

import { useState, type CSSProperties } from "react";
import {
  descendantIds,
  findNode,
  flattenAll,
  flattenVisible,
  MAX_DEPTH,
  subtreeHeight,
  type CategoryNode,
} from "@/lib/tree";
import type { Post } from "@/lib/vault";
import s from "./ui.module.css";
import v from "./vault.module.css";

type Filter = null | "none" | number;

/** Что редактируем: новую подкатегорию под parentId или существующую. */
type Editing = { kind: "new"; parentId: number | null } | { kind: "edit"; id: number };

export function CategorySidebar({
  tree,
  posts,
  active,
  expanded,
  offline,
  onToggle,
  onSelect,
  onSave,
  onDelete,
}: {
  tree: CategoryNode[];
  posts: Post[];
  active: Filter;
  expanded: Set<number>;
  /** Без связи категории можно только просматривать. */
  offline: boolean;
  onToggle(id: number): void;
  onSelect(filter: Filter): void;
  onSave(input: { id?: number; name: string; parentId?: number | null }): Promise<void>;
  onDelete(id: number): Promise<void>;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState("");
  const [draftParent, setDraftParent] = useState<number | null>(null);

  const rows = flattenVisible(tree, expanded);
  const uncategorized = posts.filter((p) => p.categoryId === null).length;

  /** Счёт по ветке — ровно то, что покажет клик по категории. */
  const countIn = (node: CategoryNode) => {
    const branch = descendantIds(tree, node.id);

    return posts.filter((p) => p.categoryId !== null && branch.has(p.categoryId))
      .length;
  };

  async function commit() {
    const name = draft.trim();
    if (!name || !editing) return cancel();

    await onSave(
      editing.kind === "new"
        ? { name, parentId: editing.parentId }
        : { id: editing.id, name, parentId: draftParent },
    );

    cancel();
  }

  function cancel() {
    setEditing(null);
    setDraft("");
    setDraftParent(null);
  }

  /**
   * Куда категорию можно перенести: не в себя, не в собственного потомка и не
   * туда, где её поддерево вылезет за предел глубины. Те же три условия
   * проверяет сервер — здесь они лишь убирают заведомо отвергаемые варианты.
   */
  function parentOptions(id: number): CategoryNode[] {
    const node = findNode(tree, id);
    if (!node) return [];

    const forbidden = descendantIds(tree, id);
    const height = subtreeHeight(node);

    return flattenAll(tree).filter(
      (candidate) =>
        !forbidden.has(candidate.id) &&
        candidate.depth + 1 + height <= MAX_DEPTH,
    );
  }

  async function remove(node: CategoryNode) {
    const affected = countIn(node);
    const parts = [`Удалить категорию «${node.name}»?`];

    if (node.children.length) {
      parts.push(
        `${node.children.length} подкатегорий поднимутся на уровень выше.`,
      );
    }
    if (affected) {
      parts.push(`${affected} записей останутся, но потеряют категорию.`);
    }

    if (confirm(parts.join(" "))) await onDelete(node.id);
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

      {rows.map((node) => {
        const open = expanded.has(node.id);

        return editing?.kind === "edit" && editing.id === node.id ? (
          <CategoryEdit
            key={node.id}
            depth={node.depth}
            value={draft}
            onChange={setDraft}
            parentId={draftParent}
            onParentChange={setDraftParent}
            options={parentOptions(node.id)}
            onCommit={commit}
            onCancel={cancel}
          />
        ) : (
          <div
            className={v.categoryRow}
            key={node.id}
            style={{ "--depth": node.depth } as CSSProperties}
          >
            {node.children.length > 0 ? (
              <button
                type="button"
                className={v.chevron}
                aria-expanded={open}
                aria-label={open ? "Свернуть ветку" : "Развернуть ветку"}
                onClick={() => onToggle(node.id)}
              >
                {open ? "▾" : "▸"}
              </button>
            ) : (
              // Распорка вместо шеврона: иначе названия листьев и веток
              // не выстраиваются в одну колонку.
              <span className={v.chevronSpacer} aria-hidden="true" />
            )}

            <button
              type="button"
              className={v.categoryItem}
              aria-current={active === node.id}
              onClick={() => onSelect(node.id)}
            >
              <span className={v.categoryName}>{node.name}</span>
              <span className={v.count}>{countIn(node)}</span>
            </button>

            {node.depth + 1 < MAX_DEPTH && !offline && (
              <button
                type="button"
                className={v.iconButton}
                title="Подкатегория"
                onClick={() => {
                  if (!expanded.has(node.id)) onToggle(node.id);
                  setEditing({ kind: "new", parentId: node.id });
                  setDraft("");
                }}
              >
                +
              </button>
            )}
            <button
              type="button"
              className={v.iconButton}
              title="Переименовать"
              hidden={offline}
              onClick={() => {
                setEditing({ kind: "edit", id: node.id });
                setDraft(node.name);
                setDraftParent(node.parentId);
              }}
            >
              ✎
            </button>
            <button
              type="button"
              className={v.iconButton}
              title="Удалить"
              hidden={offline}
              onClick={() => remove(node)}
            >
              ×
            </button>
          </div>
        );
      })}

      {offline ? null : editing?.kind === "new" ? (
        <CategoryInput
          depth={
            editing.parentId === null
              ? 0
              : (rows.find((n) => n.id === editing.parentId)?.depth ?? 0) + 1
          }
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
            setEditing({ kind: "new", parentId: null });
            setDraft("");
          }}
        >
          <span className={s.muted}>+ Категория</span>
        </button>
      )}
    </nav>
  );
}

/**
 * Правка существующей категории: имя и родитель.
 *
 * Коммит по blur здесь не годится — переход фокуса в соседний select засчитался
 * бы за окончание правки. Поэтому подтверждение явное, а blur срабатывает,
 * только если фокус ушёл за пределы строки целиком.
 */
function CategoryEdit({
  depth,
  value,
  onChange,
  parentId,
  onParentChange,
  options,
  onCommit,
  onCancel,
}: {
  depth: number;
  value: string;
  onChange(next: string): void;
  parentId: number | null;
  onParentChange(next: number | null): void;
  options: CategoryNode[];
  onCommit(): void;
  onCancel(): void;
}) {
  return (
    <div
      className={v.categoryEdit}
      style={{ "--depth": depth } as CSSProperties}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCommit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit();
        if (e.key === "Escape") onCancel();
      }}
    >
      <input
        className={`${s.input} ${v.categoryEditName}`}
        autoFocus
        value={value}
        placeholder="Название"
        onChange={(e) => onChange(e.target.value)}
      />
      <select
        className={`${s.input} ${v.categoryEditParent}`}
        aria-label="Родительская категория"
        value={parentId ?? ""}
        onChange={(e) =>
          onParentChange(e.target.value ? Number(e.target.value) : null)
        }
      >
        <option value="">— верхний уровень —</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {"\u00a0\u00a0".repeat(option.depth) + option.name}
          </option>
        ))}
      </select>
      <button type="button" className={v.iconButton} title="Сохранить" onClick={onCommit}>
        ✓
      </button>
    </div>
  );
}

function CategoryInput({
  depth,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  depth: number;
  value: string;
  onChange(next: string): void;
  onCommit(): void;
  onCancel(): void;
}) {
  return (
    <input
      className={`${s.input} ${v.categoryInput}`}
      style={{ "--depth": depth } as CSSProperties}
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
