<?php

use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

/*
 * Замыкания в роутах не использовать: `php artisan route:cache` на них падает,
 * а кеш маршрутов собирается при сборке релиза (см. bin/build-release.sh).
 * Только ссылки на контроллеры.
 */

Route::get('/health', HealthController::class);
