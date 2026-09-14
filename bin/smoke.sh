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
