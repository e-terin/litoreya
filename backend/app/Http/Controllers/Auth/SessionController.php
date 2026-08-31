<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SessionController extends Controller
{
    /**
     * Текущий пользователь и его крипто-конверт.
     *
     * Конверт отдаётся и здесь, а не только при входе: сессия переживает
     * перезагрузку вкладки, а ключ в KeyVault может быть уже сброшен по auto-lock —
     * тогда клиенту нужно заново развернуть DEK, не заставляя вводить пароль.
     */
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'user' => $user,
            'crypto' => $user->cryptoEnvelope(),
        ]);
    }
}
