import { describe, expect, it } from "vitest";
import {
  buildCategoryTree,
  descendantIds,
  findNode,
  flattenAll,
  flattenVisible,
  subtreeHeight,
  type CategoryNode,
} from "./tree";
import type { Category } from "./vault";

function category(
  id: number,
  parentId: number | null = null,
  position = 0,
): Category {
  return { id, parentId, position, name: `к${id}` };
}

/** Дерево в виде "id(дети)" — чтобы утверждения читались целиком. */
function shape(nodes: CategoryNode[]): string {
  return nodes
    .map((n) => (n.children.length ? `${n.id}(${shape(n.children)})` : String(n.id)))
    .join(",");
}

describe("buildCategoryTree", () => {
  it("вкладывает детей в родителей", () => {
    const tree = buildCategoryTree([
      category(1),
      category(2, 1),
      category(3, 2),
      category(4),
    ]);

    expect(shape(tree)).toBe("1(2(3)),4");
  });

  it("проставляет уровень от нуля", () => {
    const tree = buildCategoryTree([category(1), category(2, 1), category(3, 2)]);

    expect(flattenAll(tree).map((n) => n.depth)).toEqual([0, 1, 2]);
  });

  it("сортирует по position, затем по id", () => {
    const tree = buildCategoryTree([
      category(3, null, 5),
      category(1, null, 9),
      category(2, null, 5),
    ]);

    expect(shape(tree)).toBe("2,3,1");
  });

  it("сортирует детей внутри ветки", () => {
    const tree = buildCategoryTree([
      category(1),
      category(3, 1, 2),
      category(2, 1, 7),
    ]);

    expect(shape(tree)).toBe("1(3,2)");
  });

  it("сироту делает корневой, а не теряет", () => {
    const tree = buildCategoryTree([category(1), category(2, 404)]);

    expect(shape(tree)).toBe("1,2");
  });

  it("сохраняет ветку, висящую на сироте", () => {
    const tree = buildCategoryTree([category(2, 404), category(3, 2)]);

    expect(shape(tree)).toBe("2(3)");
  });

  it("не зацикливается на категории, ссылающейся сама на себя", () => {
    const tree = buildCategoryTree([category(1, 1)]);

    expect(shape(tree)).toBe("1");
  });

  it("не зацикливается на взаимной ссылке", () => {
    const tree = buildCategoryTree([category(1, 2), category(2, 1)]);

    // Обе становятся корневыми: важно, что обе на месте и обход завершился.
    expect(flattenAll(tree)).toHaveLength(2);
  });

  it("не зацикливается на длинном цикле", () => {
    const tree = buildCategoryTree([
      category(1, 3),
      category(2, 1),
      category(3, 2),
    ]);

    expect(flattenAll(tree)).toHaveLength(3);
  });

  it("не трогает исходный массив", () => {
    const input = [category(2, 1), category(1)];
    const copy = structuredClone(input);

    buildCategoryTree(input);

    expect(input).toEqual(copy);
  });
});

describe("flattenVisible", () => {
  const tree = buildCategoryTree([
    category(1),
    category(2, 1),
    category(3, 2),
    category(4),
  ]);

  it("скрывает потомков свёрнутого узла", () => {
    expect(flattenVisible(tree, new Set()).map((n) => n.id)).toEqual([1, 4]);
  });

  it("раскрывает только развёрнутую ветку", () => {
    expect(flattenVisible(tree, new Set([1])).map((n) => n.id)).toEqual([1, 2, 4]);
  });

  it("раскрывает вложенность целиком", () => {
    expect(flattenVisible(tree, new Set([1, 2])).map((n) => n.id)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("развёрнутый лист ничего не добавляет", () => {
    expect(flattenVisible(tree, new Set([4])).map((n) => n.id)).toEqual([1, 4]);
  });
});

describe("descendantIds", () => {
  const tree = buildCategoryTree([
    category(1),
    category(2, 1),
    category(3, 2),
    category(4),
  ]);

  it("включает саму категорию и всех потомков", () => {
    expect([...descendantIds(tree, 1)].sort()).toEqual([1, 2, 3]);
  });

  it("у листа — только он сам", () => {
    expect([...descendantIds(tree, 4)]).toEqual([4]);
  });

  it("для неизвестного id возвращает его самого", () => {
    expect([...descendantIds(tree, 404)]).toEqual([404]);
  });
});

describe("subtreeHeight", () => {
  const tree = buildCategoryTree([
    category(1),
    category(2, 1),
    category(3, 2),
    category(4, 1),
  ]);

  it("у листа единица", () => {
    expect(subtreeHeight(findNode(tree, 3)!)).toBe(1);
  });

  it("считает самую длинную ветку, а не первую", () => {
    expect(subtreeHeight(findNode(tree, 1)!)).toBe(3);
  });
});
