#!/usr/bin/env bash
#
# Собирает deploy/public_html — каталог, который на shared хостинге кладётся
# в ~/public_html как есть.
#
# Тот же артефакт используется локально в prod-like режиме, поэтому расхождение
# между «как собрали» и «как задеплоили» невозможно по построению.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DOCKER_RUN=(docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$ROOT:/work" -w /work)

echo "==> Сборка фронтенда (статический экспорт)"
"${DOCKER_RUN[@]}" node:20 sh -c "cd frontend && npm install && npm run build"

if [ ! -d frontend/out ]; then
    echo "ОШИБКА: frontend/out не создан. Проверь, что next.config задаёт output: 'export'." >&2
    exit 1
fi

echo "==> Сборка deploy/public_html"
rm -rf deploy/public_html
mkdir -p deploy/public_html

# Статика Next.js
cp -r frontend/out/. deploy/public_html/
# Поверх — .htaccess и front controller API (каталог hosting/ версионируется)
cp -r hosting/public_html/. deploy/public_html/

echo "==> Готово: deploy/public_html"
echo "    Локальная проверка: make prodlike  →  http://localhost:8081"
