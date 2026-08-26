<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Health-check. Нужен не только для мониторинга: после деплоя на shared хостинг
 * это первая проверка, что .htaccess, front controller и подключение к БД собрались
 * в рабочую цепочку.
 */
class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $database = $this->databaseStatus();

        return response()->json([
            'status' => $database === 'up' ? 'ok' : 'degraded',
            'php' => PHP_VERSION,
            'laravel' => app()->version(),
            'database' => $database,
            'time' => now()->toIso8601String(),
        ], $database === 'up' ? 200 : 503);
    }

    private function databaseStatus(): string
    {
        try {
            DB::connection()->getPdo();

            return 'up';
        } catch (Throwable) {
            // Детали наружу не отдаём — в них попадают хост и имя БД
            return 'down';
        }
    }
}
