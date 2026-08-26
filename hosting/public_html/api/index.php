<?php

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Код приложения лежит ВНЕ веб-корня — на shared хостинге это единственный способ
// не отдать .env и исходники наружу, когда document root нельзя переставить.
//
// Относительный путь одинаков локально и на хостинге:
//   ~/public_html/api/index.php  →  ~/laravel
// поэтому файл не требует правки при деплое.
$laravel = __DIR__ . '/../../laravel';

// Symfony вычисляет базовый путь запроса из SCRIPT_NAME. Так как front controller
// физически лежит в /api/, Laravel получил бы путь "health" вместо "api/health"
// и не нашёл бы маршрут — при том, что в dev-режиме (DocumentRoot = backend/public)
// путь приходит полным.
//
// Приводим окружение к виду «front controller в корне»: тогда routes/api.php
// остаётся со стандартным префиксом api, а пути совпадают в обеих средах.
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['PHP_SELF'] = '/index.php';

if (file_exists($maintenance = $laravel . '/storage/framework/maintenance.php')) {
    require $maintenance;
}

require $laravel . '/vendor/autoload.php';

/** @var \Illuminate\Foundation\Application $app */
$app = require_once $laravel . '/bootstrap/app.php';

// Иначе public_path() указывал бы на ~/laravel/public, которого в вебе нет
$app->usePublicPath(__DIR__);

$app->handleRequest(Request::capture());
