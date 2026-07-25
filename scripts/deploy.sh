#!/usr/bin/env bash
#
# 生产部署脚本，由 GitHub Actions 通过 SSH 触发：
#   DEPLOY_SHA=<commit> /srv/gathering-vote/app/scripts/deploy.sh
#
# 部署触发该工作流的精确 commit，保证 Actions 页面显示的版本与服务器一致。

set -Eeuo pipefail
umask 002

APP_DIR="/srv/gathering-vote/app"
ENV_FILE="/etc/gathering-vote.env"
BACKUP_DIR="/srv/gathering-vote/backups"
BRANCH="main"
SERVICE_NAME="gathering-vote.service"
HEALTH_URL="http://127.0.0.1:3000/api/auth/me"

cd "$APP_DIR"

# 只提取 DATABASE_URL；不继承 ENV_FILE 里的 NODE_ENV=production，
# 否则 npm ci 会跳过 devDependencies（drizzle-kit、构建依赖会缺失）。
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
if [[ -z "$DATABASE_URL" ]]; then
  echo "Error: DATABASE_URL not found in $ENV_FILE" >&2
  exit 1
fi
export DATABASE_URL
# 不手动设置 NODE_ENV：npm ci 用 --include=dev 保证 devDependencies
# （drizzle-kit、构建依赖）安装；next build 会自行使用 production，
# 手动设成 development 会导致 /404 预渲染报错。
export CI=1

echo "========================================"
echo "Deploy started at $(date --iso-8601=seconds)"
echo "Target commit: ${DEPLOY_SHA:-origin/$BRANCH}"
echo "========================================"

# --- 拉取并校验目标 commit ---
git fetch --prune origin "$BRANCH"

if [[ -n "${DEPLOY_SHA:-}" ]]; then
  git cat-file -e "${DEPLOY_SHA}^{commit}"
  if ! git merge-base --is-ancestor "$DEPLOY_SHA" "origin/$BRANCH"; then
    echo "Error: $DEPLOY_SHA is not on origin/$BRANCH" >&2
    exit 1
  fi
  git checkout -B "$BRANCH" "$DEPLOY_SHA"
else
  git checkout -B "$BRANCH" "origin/$BRANCH"
fi

echo "Checked out: $(git rev-parse HEAD)"

# --- 依赖 ---
npm ci --include=dev

# --- 迁移前备份（失败仅告警，不阻断部署）---
BACKUP_FILE="$BACKUP_DIR/gathering-vote-$(date +%Y%m%d-%H%M%S).dump"
if ! pg_dump "$DATABASE_URL" --format=custom --file="$BACKUP_FILE"; then
  echo "WARNING: database backup failed, continuing without a fresh backup" >&2
fi

# --- 数据库迁移 ---
npm run db:migrate

# --- 构建 ---
npm run build

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

sudo systemctl --no-pager --full status "$SERVICE_NAME" || true

echo "========================================"
echo "Deploy completed successfully"
echo "Commit: $(git rev-parse HEAD)"
echo "========================================"
