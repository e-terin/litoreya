<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdatePasswordRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class PasswordController extends Controller
{
    /**
     * Смена пароля аккаунта.
     *
     * Данные это не затрагивает вовсе: пароль доказывает серверу, кто ты, а
     * расшифровывает ключевая фраза. Перешифровывать нечего.
     *
     * Остальные сессии завершаются: если пароль меняют из-за утечки, то смысл
     * операции именно в том, чтобы выгнать того, кто уже вошёл.
     */
    public function __invoke(UpdatePasswordRequest $request): JsonResponse
    {
        $user = $request->user();

        DB::transaction(function () use ($request, $user) {
            // Каст 'password' => 'hashed' на модели хеширует сам
            $user->update(['password' => $request->validated('password')]);

            // Строго до удаления: иначе свежий идентификатор попадёт под
            // удаление вместе с остальными, и мы выгоним самих себя
            $request->session()->regenerate();

            $this->endOtherSessions($user->id, $request->session()->getId());
        });

        return response()->json(['message' => 'Пароль изменён']);
    }

    /**
     * Чужие сессии удаляются прямо из таблицы, а не через logoutOtherDevices().
     *
     * Тот полагается на сверку хеша в AuthenticateSession при следующем запросе:
     * сессия умирает не в момент смены пароля, а когда её владелец что-то
     * сделает. Здесь она умирает сразу, и это проверяется тестом.
     *
     * Работает только с SESSION_DRIVER=database — он задан в обеих средах.
     */
    private function endOtherSessions(int $userId, string $keepSessionId): void
    {
        if (config('session.driver') !== 'database') {
            return;
        }

        DB::table(config('session.table', 'sessions'))
            ->where('user_id', $userId)
            ->where('id', '!=', $keepSessionId)
            ->delete();
    }
}
