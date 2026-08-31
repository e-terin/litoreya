<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class LoginController extends Controller
{
    /**
     * Вход по паролю. В ответ уходит крипто-конверт, но данные пользователя
     * остаются нечитаемыми: чтобы развернуть мастер-ключ, клиенту нужна ключевая
     * фраза, которой у сервера нет.
     */
    public function store(LoginRequest $request): JsonResponse
    {
        $credentials = $request->only('email', 'password');

        if (! Auth::attempt($credentials, $request->boolean('remember'))) {
            // Единое сообщение на неверный email и неверный пароль — иначе форма
            // превращается в оракул для проверки существования аккаунтов.
            throw ValidationException::withMessages([
                'email' => __('auth.failed'),
            ]);
        }

        $request->session()->regenerate();

        $user = $request->user();

        return response()->json([
            'user' => $user,
            'crypto' => $user->cryptoEnvelope(),
        ]);
    }

    /**
     * Выход. Сессия уничтожается полностью; ключ на клиенте стирается отдельно
     * средствами KeyVault — сервер к нему доступа не имеет.
     */
    public function destroy(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Выход выполнен']);
    }
}
