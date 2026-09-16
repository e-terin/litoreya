#!/usr/bin/env bash
#
# Собирает иммутабельный релиз в deploy/litoreya/releases/<timestamp>/ и
# переключает на него локальный симлинк current — то есть воспроизводит
# раскладку хостинга:
#
#   deploy/
#       webroot   -> litoreya/current/public     (аналог папки домена)
#       litoreya/
#           current -> releases/<ts>
#           releases/<ts>/{app,config,vendor,...,public/}
#           shared/{.env,storage/}
#
# Тот же артефакт заливается на хостинг: расхождение «как собрали» и «как
# задеплоили» невозможно по построению.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d-%H%M%S)"
DEPLOY="$ROOT/deploy"
APP="$DEPLOY/litoreya"
RELEASE="$APP/releases/$STAMP"
SHARED="$APP/shared"
REL_IN_CONTAINER="deploy/litoreya/releases/$STAMP"

DOCKER_RUN=(docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$ROOT:/work" -w /work)

fail() { echo "ОШИБКА: $1" >&2; exit 1; }

# ---------------------------------------------------------------- фронтенд

echo "==> Фронтенд: статический экспорт"
# npm ci, а не install: сборка релиза обязана быть воспроизводимой
"${DOCKER_RUN[@]}" node:20 sh -c "cd frontend && npm ci && npm run build"
[ -d frontend/out ] || fail "frontend/out не создан — проверь output: 'export' в next.config.ts"

# ---------------------------------------------------------------- общие данные

# shared/ создаётся до релиза: симлинк .env должен разрешаться уже на этапе
# сборки, иначе artisan не запустится
mkdir -p "$SHARED/storage/framework/"{cache,sessions,views} \
         "$SHARED/storage/logs" "$SHARED/storage/app" \
         "$SHARED/backups" \
         "$APP/releases"

# Локальный shared/.env для prod-like. На хостинге он создаётся вручную из
# hosting/env.production.example и сюда никогда не заливается.
[ -f "$SHARED/.env" ] || cp backend/.env "$SHARED/.env"

# ---------------------------------------------------------------- дерево релиза

echo "==> Сборка релиза $STAMP"
mkdir -p "$RELEASE"

# vendor ставится заново, без dev. storage общий между релизами.
# bootstrap/cache исключается: там может лежать config.php с абсолютными путями
# сборочной машины и её APP_KEY — на хостинге такой кеш даёт 500 без записи
# в лог, потому что путь до лога тоже берётся из него.
rsync -a --quiet \
    --exclude='.env*' \
    --exclude='vendor/' \
    --exclude='storage/' \
    --exclude='bootstrap/cache/' \
    --exclude='tests/' \
    --exclude='phpunit.xml' \
    --exclude='node_modules/' \
    --exclude='.git*' \
    --exclude='package*.json' \
    --exclude='vite.config.js' \
    --exclude='resources/js/' \
    --exclude='resources/css/' \
    backend/ "$RELEASE/"

mkdir -p "$RELEASE/bootstrap/cache"

# Симлинки на общие данные. Только относительные: абсолютные сломают локальный
# prod-like (внутри контейнера дерево лежит по другому пути) и переезд хостинга.
ln -s ../../shared/.env "$RELEASE/.env"
ln -s ../../shared/storage "$RELEASE/storage"

echo "==> Бэкенд: зависимости без dev"
# Внутри релиза, а НЕ в backend/: иначе composer вырезал бы dev-зависимости из
# рабочего дерева и локальные тесты ломались бы после каждой сборки.
"${DOCKER_RUN[@]}" litoreya-php:8.2 sh -c \
    "cd '$REL_IN_CONTAINER' && composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction --no-scripts"

# Манифест пакетов: без него Laravel не увидит Sanctum. Файлы packages.php и
# services.php содержат только имена классов, абсолютных путей в них нет —
# поэтому их безопасно везти на хостинг, в отличие от config.php.
"${DOCKER_RUN[@]}" litoreya-php:8.2 sh -c \
    "cd '$REL_IN_CONTAINER' && php artisan package:discover --ansi"

# ---------------------------------------------------------------- веб-корень

# Статика Next кладётся ПОВЕРХ backend/public: у неё свой favicon.ico
cp -r frontend/out/. "$RELEASE/public/"
cp hosting/next-assets.htaccess "$RELEASE/public/_next/.htaccess"

# Отметка релиза внутрь service worker. Без неё файл не меняется от релиза к
# релизу: браузер сравнивает воркер побайтово, не увидит новой версии — и
# пользователь навсегда останется на оболочке, закешированной в первый раз.
sed -i "s/__RELEASE__/$STAMP/" "$RELEASE/public/sw.js"

# Список ассетов для предзагрузки. Без него офлайн не работает после первого
# же визита: чанки скачиваются раньше, чем воркер берёт управление, и в кеш
# не попадают — остаётся разметка без скриптов, то есть вечное «Загрузка…».
ASSETS="$(cd "$RELEASE/public" && find _next/static -type f \( -name '*.js' -o -name '*.css' \) \
    | sed 's|^|/|' | sort | tr '\n' ' ' | sed 's/ $//')"
[ -n "$ASSETS" ] || fail "не нашёл ассетов _next/static для предзагрузки"
sed -i "s|__ASSETS__|$ASSETS|" "$RELEASE/public/sw.js"

# ---------------------------------------------------------------- проверки

echo "==> Проверки релиза"

[ -e "$RELEASE/public/index.php" ]  || fail "нет public/index.php"
[ -s "$RELEASE/public/index.html" ] || fail "нет public/index.html — фронт не собрался"
[ -d "$RELEASE/public/_next" ]      || fail "нет public/_next"
[ -s "$RELEASE/public/sw.js" ]      || fail "нет public/sw.js"
[ -s "$RELEASE/public/manifest.webmanifest" ] || fail "нет манифеста PWA"

# Незаменённый плейсхолдер означает, что все релизы для браузера выглядят
# одинаково и обновление оболочки никогда не приедет
! grep -q '__RELEASE__' "$RELEASE/public/sw.js" \
    || fail "в sw.js остался плейсхолдер __RELEASE__"

! grep -q '__ASSETS__' "$RELEASE/public/sw.js" \
    || fail "в sw.js остался плейсхолдер __ASSETS__ — офлайн не заработает"

# Каждая ссылка из разметки обязана быть в списке предзагрузки. Пропущенный
# чанк не ломает сайт онлайн и проявляется только офлайн — вечным экраном
# «Загрузка…», потому что пререндеренную разметку некому оживить.
( cd "$RELEASE/public" && python3 - <<'PYCHECK'
import re, pathlib, sys

assets = set(re.search(r'const ASSETS = "([^"]*)"', pathlib.Path("sw.js").read_text()).group(1).split())
missing = []

for page in pathlib.Path(".").glob("**/index.html"):
    refs = set(re.findall(r'/_next/static/[A-Za-z0-9._/-]+\.(?:js|css)', page.read_text()))
    missing += [f"{page}: {r}" for r in sorted(refs - assets)]

if missing:
    print("ассеты вне предзагрузки:", *missing, sep="\n  ", file=sys.stderr)
    sys.exit(1)
PYCHECK
) || fail "разметка ссылается на ассеты, которых нет в предзагрузке sw.js"
[ -e "$RELEASE/public/.htaccess" ]  || fail "нет public/.htaccess"
[ -d "$RELEASE/vendor" ]            || fail "нет vendor/"
[ -f "$RELEASE/bootstrap/cache/packages.php" ] || fail "манифест пакетов не собран"

# Каталог public/api сломал бы правило ^api → index.php: часть запросов ушла бы
# в статику, и заметить это можно было бы очень нескоро
[ ! -e "$RELEASE/public/api" ] || fail "public/api существует — правило ^api уведёт запросы в статику"

# .env попадает только симлинком на shared; настоящий файл в релизе — авария
[ -L "$RELEASE/.env" ] || fail ".env в релизе не симлинк"
[ ! -e "$RELEASE/public/.env" ] || fail ".env оказался в веб-корне"
[ ! -e "$RELEASE/public/storage" ] || fail "storage оказался в веб-корне"

# Единственный по-настоящему опасный файл кеша: в нём абсолютные пути сборочной
# машины и её APP_KEY
[ ! -f "$RELEASE/bootstrap/cache/config.php" ] || fail "config.php в релизе — уехало чужое окружение"

# Костыль удалён вместе с кастомным front controller; если строка вернулась,
# значит кто-то восстановил старую раскладку
! grep -q 'SCRIPT_NAME' "$RELEASE/public/index.php" \
    || fail "public/index.php не стоковый (содержит подмену SCRIPT_NAME)"

! grep -q 'Redirect Trailing Slashes' "$RELEASE/public/.htaccess" \
    || fail ".htaccess содержит стоковый 301 со срезанием слеша — конфликтует с trailingSlash"

# ---------------------------------------------------------------- переключение

# Атомарно: ln -sfn это unlink+symlink с окном, когда current не существует
ln -s "releases/$STAMP" "$APP/current.tmp"
mv -Tf "$APP/current.tmp" "$APP/current"

# Аналог папки домена: на хостинге она называется по имени сайта и ставится
# вручную один раз, здесь — нейтральным именем. Роль одинакова: симлинк на
# public/ текущего релиза.
[ -L "$DEPLOY/webroot" ] || ln -s litoreya/current/public "$DEPLOY/webroot"

# Держим 5 релизов. Предыдущий не удаляем сразу — realpath cache живёт ~120 с,
# и часть воркеров ещё какое-то время разрешает current в старый каталог.
ls -1dt "$APP/releases/"*/ 2>/dev/null | tail -n +6 | xargs -r rm -rf

echo "==> Готово: $REL_IN_CONTAINER"
echo "    Локальная проверка:  make prodlike  →  http://localhost:8081"
echo "    Заливка на хостинг:  make deploy"
