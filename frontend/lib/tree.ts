/**
 * Дерево категорий: построение и обходы.
 *
 * Логика вынесена из компонентов сознательно. Компонентных тестов в проекте
 * нет (vitest запущен в node-окружении и собирает только lib/**), так что это
 * единственное место, где построение дерева, сироты, циклы и свёрнутые ветки
 * проверяются автоматически, а не глазами.
 */
import type { Category } from "./vault";

/**
 * Продублировано в App\Rules\CategoryParent::MAX_DEPTH. Значения обязаны
 * совпадать: расхождение проявится не ошибкой, а 422 на форме, которая по
 * клиентским правилам выглядит допустимой.
 */
export const MAX_DEPTH = 5;

export type CategoryNode = Category & {
  /** Уровень: у корневой категории 0. */
  depth: number;
  children: CategoryNode[];
};

/**
 * Плоский список с сервера — в дерево.
 *
 * Устойчив к тому, чего быть не должно: сирота (родителя нет в списке) и
 * участник цикла становятся корневыми, но не исчезают и не уводят обход в
 * бесконечность. Одна кривая строка в базе не должна гасить весь дашборд —
 * ровно то же правило, по которому нерасшифрованная запись помечается, а не
 * роняет список.
 */
export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const ordered = [...categories].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  );

  const nodes = new Map<number, CategoryNode>(
    ordered.map((category) => [category.id, { ...category, depth: 0, children: [] }]),
  );

  const roots: CategoryNode[] = [];

  for (const node of nodes.values()) {
    const parent = resolveParent(node, nodes);

    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  assignDepth(roots, 0);

  return roots;
}

/** Строки меню в порядке вывода: потомки свёрнутого узла пропускаются. */
export function flattenVisible(
  nodes: CategoryNode[],
  expanded: Set<number>,
): CategoryNode[] {
  const out: CategoryNode[] = [];

  const walk = (list: CategoryNode[]) => {
    for (const node of list) {
      out.push(node);
      if (node.children.length > 0 && expanded.has(node.id)) walk(node.children);
    }
  };

  walk(nodes);

  return out;
}

/** Всё дерево одной лентой — для выпадающего списка, где сворачивать нечего. */
export function flattenAll(nodes: CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = [];

  const walk = (list: CategoryNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };

  walk(nodes);

  return out;
}

/**
 * Идентификаторы ветки, включая её саму.
 *
 * Клик по родительской категории показывает записи всей ветки, иначе
 * родительские узлы выглядели бы пустыми при непустых потомках.
 */
export function descendantIds(nodes: CategoryNode[], id: number): Set<number> {
  const root = find(nodes, id);
  const ids = new Set<number>([id]);

  if (!root) return ids;

  const walk = (node: CategoryNode) => {
    ids.add(node.id);
    node.children.forEach(walk);
  };

  walk(root);

  return ids;
}

/**
 * Высота поддерева: у категории без детей 1.
 *
 * Повторяет CategoryParent::heightOf на сервере — чтобы интерфейс не предлагал
 * переносы, которые всё равно вернутся с 422.
 */
export function subtreeHeight(node: CategoryNode): number {
  return node.children.length === 0
    ? 1
    : 1 + Math.max(...node.children.map(subtreeHeight));
}

/** Узел по идентификатору — или null, если его в дереве нет. */
export function findNode(nodes: CategoryNode[], id: number): CategoryNode | null {
  return find(nodes, id);
}

function find(nodes: CategoryNode[], id: number): CategoryNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;

    const found = find(node.children, id);
    if (found) return found;
  }

  return null;
}

/**
 * Родитель, которому узел действительно принадлежит, — или null, если
 * подвесить его некуда: родителя нет в списке, узел ссылается сам на себя
 * или цепочка предков замыкается в цикл.
 */
function resolveParent(
  node: CategoryNode,
  nodes: Map<number, CategoryNode>,
): CategoryNode | null {
  if (node.parentId === null) return null;

  const parent = nodes.get(node.parentId);
  if (!parent || parent.id === node.id) return null;

  // Шагов не больше, чем узлов: страховка на случай, если условие выхода
  // когда-нибудь окажется недостаточным.
  let current = parent;

  for (let step = 0; step <= nodes.size; step++) {
    if (current.id === node.id) return null; // цикл
    if (current.parentId === null) return parent;

    const next = nodes.get(current.parentId);
    if (!next) return parent; // ветка висит на сироте, но сама цела

    current = next;
  }

  return null;
}

function assignDepth(list: CategoryNode[], depth: number): void {
  for (const node of list) {
    node.depth = depth;
    assignDepth(node.children, depth + 1);
  }
}
