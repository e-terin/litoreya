<?php

namespace App\Http\Controllers;

use App\Http\Requests\CategoryRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
     * Удаление категории не трогает записи: внешний ключ обнуляется
     * (nullOnDelete), и посты становятся «без категории».
     *
     * Каскадное удаление здесь было бы разрушительным — пользователь потерял бы
     * данные, которые не собирался удалять, и восстановить их нельзя.
     */
    public function destroy(Request $request, int $category): JsonResponse
    {
        $request->user()->categories()->findOrFail($category)->delete();

        return response()->json(null, 204);
    }
}
