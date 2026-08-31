<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateKeyphraseRequest;
use Illuminate\Http\JsonResponse;

class KeyphraseController extends Controller
{
    /**
     * Смена ключевой фразы — перезапись обёртки мастер-ключа.
     *
     * Посты не читаются и не изменяются: DEK прежний, меняется только то, чем он
     * обёрнут. Сервер участвует ровно в объёме «сохранить новые 80 байт».
     *
     * Важно: это НЕ ротация ключа данных. Тот, кто уже извлёк DEK старой фразой,
     * сохраняет доступ (docs/crypto-design.md §6).
     */
    public function __invoke(UpdateKeyphraseRequest $request): JsonResponse
    {
        $user = $request->user();

        $user->update($request->validated()['crypto']);

        return response()->json([
            'crypto' => $user->fresh()->cryptoEnvelope(),
        ]);
    }
}
