#!/usr/bin/env bash
#
# Откат на предыдущий релиз.
#
# Пересобирать кеши не нужно: у каждого релиза свой bootstrap/cache, собранный
# на сервере с тем же .env. Достаточно переключить симлинк.
#
# ЧЕГО ЭТОТ СКРИПТ НЕ ДЕЛАЕТ: не откатывает миграции. down() почти никогда не
# корректен для данных. Если релиз содержал разрушительную миграцию —
# восстанавливать из shared/backups/<ts>.sql.gz вручную.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ -f .env ] && set -a && . ./.env && set +a

: "${DEPLOY_HOST:?не задан DEPLOY_HOST в .env}"
: "${DEPLOY_PATH:?не задан DEPLOY_PATH в .env}"
: "${DEPLOY_URL:?не задан DEPLOY_URL в .env}"

echo "==> Релизы на сервере"
ssh "$DEPLOY_HOST" "ls -1t $DEPLOY_PATH/releases | head -5; echo '---'; readlink $DEPLOY_PATH/current"

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
    TARGET=$(ssh "$DEPLOY_HOST" "cd $DEPLOY_PATH && current=\$(basename \$(readlink current)) && ls -1t releases | grep -v \"^\$current\$\" | head -1")
    [ -n "$TARGET" ] || { echo "Не на что откатываться: предыдущий релиз не найден." >&2; exit 1; }
fi

echo
read -rp "Откатить на $TARGET? [y/N] " answer
[ "$answer" = "y" ] || { echo "Отменено."; exit 0; }

ssh "$DEPLOY_HOST" bash -seu <<REMOTE_SCRIPT
cd "$DEPLOY_PATH"
[ -d "releases/$TARGET" ] || { echo "ОШИБКА: релиза $TARGET нет" >&2; exit 1; }
ln -s "releases/$TARGET" current.tmp
mv -Tf current.tmp current
REMOTE_SCRIPT

echo "==> Дым-тест"
"$ROOT/bin/smoke.sh" "$DEPLOY_URL"

echo
echo "Откат на $TARGET выполнен."
echo "Помни: схема БД осталась от нового релиза. Если миграция была"
echo "разрушительной, восстанавливай из shared/backups/."
