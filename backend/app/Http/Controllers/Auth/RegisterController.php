<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class RegisterController extends Controller
{
    /**
     * Регистрация. Клиент присылает пароль (для аутентификации на сервере) и
     * готовый крипто-конверт, собранный у себя в браузере.
     *
     * Ключевая фраза и recovery-код на сервер не приходят — только обёртки,
     * из которых без них ничего не извлечь.
     */
    public function __invoke(RegisterRequest $request): JsonResponse
    {
        $user = DB::transaction(fn () => User::create([
            'name' => $request->validated('name'),
            'email' => $request->validated('email'),
            'password' => $request->validated('password'),
            ...$request->envelope(),
        ]));

        // Сразу логиним: разделять регистрацию и вход незачем, а лишний ввод
        // пароля на этом шаге только мешает.
        Auth::login($user);
        $request->session()->regenerate();

        return response()->json([
            'user' => $user,
            'crypto' => $user->cryptoEnvelope(),
        ], 201);
    }
}
