<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        // health: '/up' убран намеренно. Этот маршрут лежит вне /api, а .htaccess
        // отдаёт Laravel только /api/*, — запрос ушёл бы в SPA-fallback и вернул
        // HTML со статусом 200. Мониторинг на нём вечно рапортовал бы «здоров».
        // Проверка живости: GET /api/health (HealthController).
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Sanctum в cookie-режиме: фронт и API на одном домене, поэтому сессия
        // в HttpOnly-куке, а не Bearer-токен в localStorage — XSS её не украдёт.
        $middleware->statefulApi();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
