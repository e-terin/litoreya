<?php

namespace App\Http\Controllers;

use App\Http\Requests\PostRequest;
use App\Models\Post;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * CRUD записей.
 *
 * Все запросы строятся от $request->user()->posts(): принадлежность
 * обеспечивается формой запроса, а не отдельной проверкой, которую можно забыть.
 *
 * Контроллер не знает, что лежит в записях, и знать не может — для него это
 * строка base64.
 */
class PostController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = $request->user()->posts();

        // Инкрементальный синк: отдаём и удалённые, иначе офлайн-клиент не
        // узнает, что запись пропала
        if ($since = $request->query('updated_since')) {
            $query->changedSince($since);
        }

        if ($request->has('category_id')) {
            $categoryId = $request->query('category_id');
            $categoryId === 'none'
                ? $query->whereNull('category_id')
                : $query->where('category_id', $categoryId);
        }

        return response()->json([
            'data' => $query->latest('updated_at')->get(),
        ]);
    }

    public function store(PostRequest $request): JsonResponse
    {
        $post = $request->user()->posts()->create($request->validated());

        return response()->json(['data' => $post], 201);
    }

    public function show(Request $request, int $post): JsonResponse
    {
        return response()->json([
            'data' => $request->user()->posts()->findOrFail($post),
        ]);
    }

    public function update(PostRequest $request, int $post): JsonResponse
    {
        $model = $request->user()->posts()->findOrFail($post);
        $model->update($request->validated());

        return response()->json(['data' => $model]);
    }

    public function destroy(Request $request, int $post): JsonResponse
    {
        $request->user()->posts()->findOrFail($post)->delete();

        return response()->json(null, 204);
    }
}
