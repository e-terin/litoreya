#!/usr/bin/env bash
#
# Заливает последний собранный релиз на хостинг и атомарно переключает на него.
#
# Порядок намеренный: сначала копирование, потом симлинки, потом бэкап БД,
# потом кеши и миграции — и только в самом конце переключение current. Всё, что
# может упасть, падает до того, как боевой домен начинает смотреть на новый код.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ -f .env ] && set -a && . ./.env && set +a

: "${DEPLOY_HOST:?не задан DEPLOY_HOST в .env — пользователь@хост для ssh}"
: "${DEPLOY_PATH:?не задан DEPLOY_PATH в .env (например litoreya)}"
: "${DEPLOY_URL:?не задан DEPLOY_URL в .env — базовый адрес сайта для дым-теста}"
DEPLOY_PHP="${DEPLOY_PHP:-php}"

ASSUME_YES=0
[ "${1:-}" = "-y" ] && ASSUME_YES=1

RELEASES="$ROOT/deploy/litoreya/releases"
STAMP="$(ls -1t "$RELEASES" 2>/dev/null | head -1)"
[ -n "$STAMP" ] || { echo "Нет собранных релизов. Сначала: make release" >&2; exit 1; }

REMOTE="$DEPLOY_PATH/releases/$STAMP"

echo "Релиз:  $STAMP"
echo "Хост:   $DEPLOY_HOST"
echo "Путь:   $REMOTE"
echo "PHP:    $DEPLOY_PHP"
echo

if [ "$ASSUME_YES" -eq 0 ]; then
    read -rp "Залить и переключить? Миграции необратимы. [y/N] " answer
    [ "$answer" = "y" ] || { echo "Отменено."; exit 0; }
fi

# ---------------------------------------------------------------- заливка

echo "==> Копирование релиза"
# -a сохраняет симлинки как симлинки: .env и storage ведут на ../../shared/,
# который на сервере уже существует
rsync -az --delete --info=stats1 \
    "$RELEASES/$STAMP/" "$DEPLOY_HOST:$REMOTE/"

# ---------------------------------------------------------------- сервер

echo "==> Подготовка на сервере"
ssh "$DEPLOY_HOST" bash -seu <<REMOTE_SCRIPT
cd "$REMOTE"

# Симлинки на общие данные должны разрешаться — иначе config:cache не найдёт .env
[ -e .env ]    || { echo "ОШИБКА: .env не разрешается, нет shared/.env" >&2; exit 1; }
[ -d storage ] || { echo "ОШИБКА: storage не разрешается" >&2; exit 1; }
chmod -R u+w bootstrap/cache

echo "--> Бэкап базы"
mkdir -p "$DEPLOY_PATH/shared/backups"
DB_NAME=\$(grep -E '^DB_DATABASE=' .env | cut -d= -f2-)
DB_USER=\$(grep -E '^DB_USERNAME=' .env | cut -d= -f2-)
DB_PASS=\$(grep -E '^DB_PASSWORD=' .env | cut -d= -f2-)
mysqldump -u"\$DB_USER" -p"\$DB_PASS" "\$DB_NAME" 2>/dev/null \
    | gzip > "$DEPLOY_PATH/shared/backups/$STAMP.sql.gz" \
    || echo "ВНИМАНИЕ: бэкап не сделан, проверь доступы"

echo "--> Кеши конфигурации"
# Именно здесь, а не на сборке: только тут одновременно есть прод-.env и
# правильные абсолютные пути. Кеш, собранный локально, указывал бы в никуда.
$DEPLOY_PHP artisan config:cache
$DEPLOY_PHP artisan route:cache
$DEPLOY_PHP artisan event:cache

echo "--> Миграции"
$DEPLOY_PHP artisan migrate --force

echo "--> Проверка бутстрапа"
$DEPLOY_PHP artisan about --only=environment
REMOTE_SCRIPT

# ---------------------------------------------------------------- переключение

echo "==> Переключение current"
ssh "$DEPLOY_HOST" bash -seu <<REMOTE_SCRIPT
cd "$DEPLOY_PATH"
# ln -sfn это unlink+symlink с окном, когда current не существует.
# mv -Tf — rename(2), атомарный. Флаг -T обязателен: без него ln -sf создал бы
# current/current внутри старого релиза.
ln -s "releases/$STAMP" current.tmp
mv -Tf current.tmp current
REMOTE_SCRIPT

# ---------------------------------------------------------------- проверка

echo "==> Дым-тест"
"$ROOT/bin/smoke.sh" "$DEPLOY_URL" || {
    echo
    echo "Дым-тест не прошёл. Откат:  make rollback" >&2
    exit 1
}

echo
echo "Готово. Релиз $STAMP активен."
echo "Предыдущие релизы оставлены: realpath cache живёт ~120 с, и часть воркеров"
echo "ещё какое-то время разрешает current в старый каталог."
