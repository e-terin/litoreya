<?php

namespace App\Http\Controllers;

use App\Http\Requests\CategoryRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CategoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $request->user()->categories()->orderBy('position')->orderBy('id')->get(),
        ]);
    }

    public function store(CategoryRequest $request): JsonResponse
    {
        $category = $request->user()->categories()->create($request->validated());

        return response()->json(['data' => $category], 201);
    }

    public function update(CategoryRequest $request, int $category): JsonResponse
    {
        $model = $request->user()->categories()->findOrFail($category);
        $model->update($request->validated());

        return response()->json(['data' => $model]);
    }

    /**
     * Удаление категории не трогает ни записи, ни подкатегории.
     *
     * Записи: внешний ключ обнуляется (nullOnDelete), пост становится «без
     * категории». Каскад здесь был бы разрушительным — пользователь потерял бы
     * данные, которые не собирался удалять, и восстановить их нельзя.
     *
     * Подкатегории: поднимаются на уровень выше, к родителю удаляемой. То же
     * правило, что и для записей — исчезает ровно то, что попросили удалить.
     * Полагаться на nullOnDelete нельзя: он сделал бы корневой всю ветку,
     * оторвав её от места, где пользователь её оставил.
     */
    public function destroy(Request $request, int $category): JsonResponse
    {
        $model = $request->user()->categories()->findOrFail($category);

        DB::transaction(function () use ($model) {
            $model->children()->update(['parent_id' => $model->parent_id]);
            $model->delete();
        });

        return response()->json(null, 204);
    }
}
