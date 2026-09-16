#!/usr/bin/env bash
#
# Дым-тест раскладки. Он же диагностика: каждая проверка привязана к конкретной
# причине отказа, чтобы не гадать по симптому.
#
# Использование:  bin/smoke.sh https://<домен>
#                 bin/smoke.sh http://localhost:8081     (prod-like)
#
set -uo pipefail

BASE="${1:?укажи базовый URL}"
FAILED=0

check() { # описание ожидание фактическое
    if [ "$2" = "$3" ]; then
        printf '  ok    %-52s %s\n' "$1" "$3"
    else
        printf '  ПЛОХО %-52s %s (ждали %s)\n' "$1" "$3" "$2"
        FAILED=1
    fi
}

code() { curl -sk -o /dev/null -w '%{http_code}' "$@"; }
ctype() { curl -sk -o /dev/null -w '%{content_type}' "$@" | cut -d';' -f1; }

echo "Дым-тест: $BASE"

# Корень должен отдать SPA. JSON-404 здесь означает, что DirectoryIndex не
# приехал из .htaccess и Apache взял index.php.
check "GET /  (SPA)" "200" "$(code "$BASE/")"
check "GET /  тип содержимого" "text/html" "$(ctype "$BASE/")"

# HTML вместо JSON означает, что правило ^api не отработало: нет mod_rewrite,
# нет AllowOverride, либо порядок блоков в .htaccess нарушен.
check "GET /api/health" "200" "$(code "$BASE/api/health")"
check "GET /api/health тип" "application/json" "$(ctype "$BASE/api/health")"

health=$(curl -sk "$BASE/api/health")
case "$health" in
    *'"status":"ok"'*) printf '  ok    %-52s %s\n' "здоровье стека" "status=ok" ;;
    *) printf '  ПЛОХО %-52s %s\n' "здоровье стека" "$health"; FAILED=1 ;;
esac

# Сессионная кука и CSRF. Без Secure вход по https молча не заработает.
cookies=$(curl -skI "$BASE/api/csrf-cookie" | tr -d '\r' | grep -i '^set-cookie:')
case "$cookies" in
    *XSRF-TOKEN*) printf '  ok    %-52s\n' "выдаётся XSRF-TOKEN" ;;
    *) printf '  ПЛОХО %-52s\n' "выдаётся XSRF-TOKEN"; FAILED=1 ;;
esac

if [ "${BASE#https}" != "$BASE" ]; then
    # Атрибуты Set-Cookie регистронезависимы, и Symfony печатает их строчными:
    # `; secure`. Сравнение с «Secure» давало ложный провал на исправном стенде.
    #
    # Проверяем каждую куку по отдельности, а не факт «где-то встретилось»:
    # одной куки без флага достаточно, чтобы сессия уехала в открытый http.
    if [ -z "$cookies" ]; then
        printf '  ПЛОХО %-52s %s\n' "куки помечены Secure" "кук нет вовсе"
        FAILED=1
    else
        bad=$(printf '%s\n' "$cookies" | tr 'A-Z' 'a-z' | grep -vc '; secure')
        if [ "$bad" -eq 0 ]; then
            printf '  ok    %-52s\n' "куки помечены Secure"
        else
            printf '  ПЛОХО %-52s без флага: %s → SESSION_SECURE_COOKIE\n' \
                "куки помечены Secure" "$bad"
            FAILED=1
        fi
    fi
fi

# Отсутствующий чанк обязан давать 404. Если 200 text/html — у пользователя с
# открытой вкладкой после релиза будет ChunkLoadError.
check "GET /_next/... несуществующий чанк" "404" "$(code "$BASE/_next/static/chunks/нет-такого.js")"

# 500 здесь означает петлю внутренних редиректов в SPA-fallback.
check "GET /deep/link  (SPA-fallback)" "200" "$(code "$BASE/deep/link")"

# PWA. Отсутствие любого из файлов не ломает сайт, но молча отключает офлайн —
# проявится не ошибкой, а жалобой «в метро ничего не открывается».
#
# Проверяем ТИП и СОДЕРЖИМОЕ, а не код ответа: SPA-fallback на отсутствующий
# путь честно отдаёт index.html со статусом 200, и проверка по коду показывала
# бы установленный PWA там, где его нет вовсе.
# Оба типа валидны для JS, и хостинги расходятся: у нас text/javascript,
# на shared — application/javascript. Важно лишь, что это не text/html,
# то есть не подсунутая fallback'ом страница.
sw_type=$(ctype "$BASE/sw.js")
case "$sw_type" in
    text/javascript|application/javascript)
        printf '  ok    %-52s %s\n' "GET /sw.js тип" "$sw_type" ;;
    *)
        printf '  ПЛОХО %-52s %s (ждали javascript)\n' "GET /sw.js тип" "$sw_type"
        FAILED=1 ;;
esac
check "GET /manifest.webmanifest тип" "application/manifest+json" \
    "$(ctype "$BASE/manifest.webmanifest")"
check "GET /icon-192.png тип" "image/png" "$(ctype "$BASE/icon-192.png")"

sw=$(curl -sk "$BASE/sw.js")

# Тот ли это файл. Заодно отсекает страницу, подсунутую fallback'ом.
case "$sw" in
    *"litoreya-\${RELEASE}"*) printf '  ok    %-52s\n' "sw.js — наш воркер" ;;
    *) printf '  ПЛОХО %-52s\n' "sw.js — наш воркер"; FAILED=1 ;;
esac

# Незаменённые плейсхолдеры: релиз — обновление оболочки не приедет никогда;
# ассеты — офлайн не заработает после первого же визита.
case "$sw" in
    *__RELEASE__*|*__ASSETS__*)
        printf '  ПЛОХО %-52s\n' "в sw.js подставлены релиз и ассеты"; FAILED=1 ;;
    *) printf '  ok    %-52s\n' "в sw.js подставлены релиз и ассеты" ;;
esac

# Залипший в кеше воркер означает, что новая версия приложения не приедет
# к пользователю вообще: браузер будет отдавать старый файл из HTTP-кеша.
sw_cache=$(curl -skI "$BASE/sw.js" | tr -d '\r' | grep -i '^cache-control:' | tr 'A-Z' 'a-z')

# max-age здесь — предупреждение, а не провал, и это осознанно.
#
# На боевом хостинге перед Apache стоит nginx, и статику (.js, .png) он отдаёт
# сам: до .htaccess запрос не доходит, наши заголовки не применяются вовсе.
# Починить это из репозитория нельзя — только настройками хостинга.
#
# Обновления воркера это не ломает: регистрация в components/ServiceWorker.tsx
# идёт с updateViaCache: "none", а при нём браузер не спрашивает HTTP-кеш для
# файла воркера. Если эту опцию когда-нибудь уберут, предупреждение станет
# настоящей проблемой — тогда воркер будет обновляться раз в сутки.
case "$sw_cache" in
    *no-store*)
        printf '  ok    %-52s\n' "sw.js не кешируется" ;;
    *max-age*)
        printf '  ПРЕДУПР %-50s %s\n' \
            "sw.js кешируется сервером" "$(printf '%s' "$sw_cache" | tr '\n' ' ')"
        printf '        %s\n' "статику отдаёт nginx мимо .htaccess; спасает updateViaCache: none" ;;
    *)
        printf '  ПЛОХО %-52s %s\n' "sw.js не кешируется" "${sw_cache:-заголовка нет}"
        FAILED=1 ;;
esac

# Секреты не должны быть доступны ни при каких условиях.
#
# Проверяем СОДЕРЖИМОЕ, а не код ответа: у SPA-fallback путь без файла честно
# отдаёт index.html со статусом 200, и проверка по коду показывала бы утечку там,
# где её нет. Значение имеет только одно — вернулся ли настоящий файл.
leak() { # путь сигнатура-настоящего-файла
    body=$(curl -sk "$BASE$1")
    if printf '%s' "$body" | grep -qF "$2"; then
        printf '  ПЛОХО %-52s УТЕЧКА\n' "закрыт $1"
        FAILED=1
    else
        printf '  ok    %-52s не отдаётся\n' "закрыт $1"
    fi
}

leak /.env                      "APP_KEY"
leak /composer.json             "laravel/framework"
leak /artisan                   "#!/usr/bin/env php"
leak /storage/logs/laravel.log  "production.ERROR"
leak /.git/config               "[core]"

echo
if [ "$FAILED" -eq 0 ]; then
    echo "Дым-тест пройден."
    echo
    echo "Осталось проверить вручную в браузере — curl'ом это не доказывается,"
    echo "потому что Sanctum в cookie-режиме зависит от связки Origin/Referer:"
    echo "  регистрация → recovery-код → создать запись → перезагрузка →"
    echo "  разблокировка фразой → выход → повторный вход"
else
    echo "Есть провалы. Причина каждой проверки указана рядом."
fi

exit "$FAILED"
