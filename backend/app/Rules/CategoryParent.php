<?php

namespace App\Rules;

use App\Models\Category;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Родитель категории: проверки, которых не делает Rule::exists.
 *
 * Принадлежность родителя пользователю проверяет exists в CategoryRequest.
 * Здесь остаётся то, что видно только на всём дереве целиком:
 *
 *   1. категория не может быть родителем самой себе;
 *   2. нельзя переехать внутрь собственного потомка — получился бы цикл,
 *      и ветка выпала бы из выдачи, оставшись в базе;
 *   3. глубина дерева ограничена MAX_DEPTH.
 *
 * Дерево читается одним запросом и обходится в PHP: у пользователя категорий
 * единицы-десятки, а рекурсивный CTE здесь труднее и читать, и тестировать.
 */
class CategoryParent implements ValidationRule
{
    /**
     * Продублировано в frontend/lib/tree.ts. Значения обязаны совпадать:
     * расхождение проявится не ошибкой, а 422 на форме, которая по клиентским
     * правилам выглядит допустимой.
     */
    public const MAX_DEPTH = 5;

    /** @var array<int, int|null> id => parent_id */
    private array $parents;

    /** @var array<int, list<int>> parent_id => id[] */
    private array $children = [];

    /**
     * @param  int  $userId  владелец дерева
     * @param  int|null  $categoryId  редактируемая категория; null при создании
     */
    public function __construct(
        private readonly int $userId,
        private readonly ?int $categoryId = null,
    ) {
        $this->parents = Category::query()
            ->where('user_id', $this->userId)
            ->pluck('parent_id', 'id')
            ->map(fn ($parent) => $parent === null ? null : (int) $parent)
            ->all();

        foreach ($this->parents as $id => $parent) {
            $this->children[$parent ?? 0][] = (int) $id;
        }
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null || $value === '') {
            return; // корневая категория — проверять нечего
        }

        $parentId = (int) $value;

        // Чужой или несуществующий родитель — это забота Rule::exists,
        // второе сообщение об одной ошибке пользователю не нужно.
        if (! array_key_exists($parentId, $this->parents)) {
            return;
        }

        if ($this->categoryId !== null) {
            if ($parentId === $this->categoryId) {
                $fail('Категория не может быть вложена сама в себя.');

                return;
            }

            if ($this->isDescendant($parentId, $this->categoryId)) {
                $fail('Категорию нельзя перенести внутрь собственной подкатегории.');

                return;
            }
        }

        $depth = $this->depthOf($parentId) + $this->heightOf($this->categoryId);

        if ($depth > self::MAX_DEPTH) {
            $fail('Слишком глубокая вложенность: не больше '.self::MAX_DEPTH.' уровней.');
        }
    }

    /** Является ли $id потомком $ancestorId. */
    private function isDescendant(int $id, int $ancestorId): bool
    {
        foreach ($this->ancestorsOf($id) as $current) {
            if ($current === $ancestorId) {
                return true;
            }
        }

        return false;
    }

    /** Номер уровня: у корневой категории 1. */
    private function depthOf(int $id): int
    {
        return 1 + count($this->ancestorsOf($id));
    }

    /**
     * Цепочка предков снизу вверх.
     *
     * Счётчик шагов — защита от цикла, уже лежащего в базе: без него битые
     * данные увели бы валидацию в бесконечный цикл, то есть в 500 на запросе,
     * который всего лишь пытается их починить.
     *
     * @return list<int>
     */
    private function ancestorsOf(int $id): array
    {
        $chain = [];
        $current = $this->parents[$id] ?? null;
        $limit = count($this->parents);

        while ($current !== null && count($chain) <= $limit) {
            $chain[] = $current;
            $current = $this->parents[$current] ?? null;
        }

        return $chain;
    }

    /** Высота поддерева: у категории без детей 1. При создании тоже 1. */
    private function heightOf(?int $id): int
    {
        if ($id === null) {
            return 1;
        }

        $height = 1;

        foreach ($this->children[$id] ?? [] as $child) {
            // Цикл в данных сюда не дотянется: isDescendant отсекает его раньше,
            // а до сохранения дерево всегда ацикличное.
            $height = max($height, 1 + $this->heightOf($child));
        }

        return $height;
    }
}
