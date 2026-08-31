<?php

use App\Http\Controllers\Auth\KeyphraseController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\Auth\SessionController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\PostController;
use Illuminate\Support\Facades\Route;

/*
 * Замыкания в роутах не использовать: `php artisan route:cache` на них падает,
 * а кеш маршрутов собирается при сборке релиза (см. bin/build-release.sh).
 * Только ссылки на контроллеры.
 *
 * CSRF-маршрут Sanctum живёт по /api/csrf-cookie — префикс переопределён
 * в config/sanctum.php, чтобы .htaccess на хостинге обходился одним правилом.
 */

Route::get('/health', HealthController::class);

// Вход и регистрация — под троттлингом: это единственные эндпоинты, где перебор
// имеет смысл. Лимитер определён в AppServiceProvider.
Route::middleware('throttle:auth')->group(function () {
    Route::post('/auth/register', RegisterController::class);
    Route::post('/auth/login', [LoginController::class, 'store']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/me', SessionController::class);
    Route::post('/auth/logout', [LoginController::class, 'destroy']);
    Route::put('/auth/keyphrase', KeyphraseController::class);

    Route::apiResource('categories', CategoryController::class)->except('show');
    Route::apiResource('posts', PostController::class);
});
