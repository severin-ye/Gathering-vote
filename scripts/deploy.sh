#!/usr/bin/env bash
#
# 生产部署脚本，由 GitHub Actions 通过 SSH 触发：
#   DEPLOY_SHA=<commit> bash /srv/gathering-vote/deploy.sh
#
# CI 已完成构建并把 standalone 产物上传到 releases/<sha>.tar.gz。
# 本脚本只做轻量操作：解压、数据库迁移、切换软链、重启、健康检查。
# 服务器不执行 npm ci / next build，避免小内存实例 OOM。

set -Eeuo pipefail
umask 002

APP_ROOT="/srv/gathering-vote"
RELEASES_DIR="$APP_ROOT/releases"
ENV_FILE="/etc/gathering-vote.env"
BACKUP_DIR="$APP_ROOT/backups"
DB_TOOLS="$APP_ROOT/db-tools"
CURRENT_LINK="$APP_ROOT/current"
SERVICE_NAME="gathering-vote.service"
HEALTH_URL="http://127.0.0.1:3000/api/auth/me"
KEEP_RELEASES=3

if [[ -z "${DEPLOY_SHA:-}" ]]; then
  echo "Error: DEPLOY_SHA is required" >&2
  exit 1
fi

TARBALL="$RELEASES_DIR/$DEPLOY_SHA.tar.gz"
RELEASE_DIR="$RELEASES_DIR/$DEPLOY_SHA"

echo "========================================"
echo "Deploy started at $(date --iso-8601=seconds)"
echo "Target commit: $DEPLOY_SHA"
echo "========================================"

# --- 只提取 DATABASE_URL（不向构建环境注入 NODE_ENV）---
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
if [[ -z "$DATABASE_URL" ]]; then
  echo "Error: DATABASE_URL not found in $ENV_FILE" >&2
  exit 1
fi

# --- 解压 CI 上传的产物 ---
if [[ ! -f "$TARBALL" ]]; then
  echo "Error: release tarball not found: $TARBALL" >&2
  exit 1
fi
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf "$TARBALL" -C "$RELEASE_DIR"
echo "Extracted to $RELEASE_DIR"

# --- 迁移前备份（失败仅告警）---
BACKUP_FILE="$BACKUP_DIR/gathering-vote-$(date +%Y%m%d-%H%M%S).dump"
if ! pg_dump "$DATABASE_URL" --format=custom --file="$BACKUP_FILE"; then
  echo "WARNING: database backup failed, continuing without a fresh backup" >&2
fi

# --- 数据库迁移（drizzle-kit，轻量）---
# drizzle.config.ts 需 import drizzle-kit / dotenv，release 目录没有这些依赖，
# 因此复制到 db-tools 的子目录运行，让 Node 向上解析到 db-tools/node_modules。
echo "Running database migrations..."
MIGRATE_WORK="$DB_TOOLS/work"
rm -rf "$MIGRATE_WORK"
mkdir -p "$MIGRATE_WORK"
cp "$RELEASE_DIR/drizzle.config.ts" "$MIGRATE_WORK/"
cp -r "$RELEASE_DIR/drizzle" "$MIGRATE_WORK/"
( cd "$MIGRATE_WORK" && DATABASE_URL="$DATABASE_URL" "$DB_TOOLS/node_modules/.bin/drizzle-kit" migrate )

# --- 原子切换当前版本 ---
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
echo "Current release -> $RELEASE_DIR"

# --- 重启并验证 ---
sudo systemctl restart "$SERVICE_NAME"

for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "$HEALTH_URL"; then
    echo "Health check passed: $HEALTH_URL"
    break
  fi
  if [[ "$i" == "30" ]]; then
    echo "Error: health check failed after restart" >&2
    sudo systemctl --no-pager --full status "$SERVICE_NAME" || true
    exit 1
  fi
  sleep 1
done

# --- 清理旧版本，保留最近 KEEP_RELEASES 个 ---
cd "$RELEASES_DIR"
# 按修改时间倒序列出目录，跳过当前版本，删除超出保留数量的
ls -1dt */ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
  old="${old%/}"
  [[ "$old" == "$DEPLOY_SHA" ]] && continue
  echo "Removing old release: $old"
  rm -rf "${RELEASES_DIR:?}/$old" "${RELEASES_DIR:?}/$old.tar.gz"
done

echo "========================================"
echo "Deploy completed successfully"
echo "Commit: $DEPLOY_SHA"
echo "========================================"
