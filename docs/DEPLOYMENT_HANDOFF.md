# Gathering-vote 部署交接文档

## 0. CI/CD 自动部署（当前生产方式）

生产环境通过 GitHub Actions 自动部署：`git push origin main` 后无需任何手动操作。

```text
push 到 main
  ↓
Test job：lint + typecheck + 单元测试（PGlite）
  ↓ 全过
Build and deploy job：
  CI 上 npm ci + next build（standalone 产物）
  ↓
  打包 standalone + .next/static + drizzle/ 迁移文件
  ↓ scp 到服务器 /srv/gathering-vote/releases/<sha>.tar.gz
  SSH 触发服务器 scripts/deploy.sh
  ↓
  解压 → 迁移前 pg_dump 备份 → drizzle-kit migrate
  → 切换 current 软链 → systemctl restart → 健康检查 → 清理旧版本
```

**为什么这样设计**：生产服务器内存仅 1.6GB，`npm ci` + `next build` 峰值会 OOM（曾把机器打满到 CPU 100%）。因此构建放在 CI runner（资源充足），服务器只接收 standalone 产物并重启，几乎零负载。服务器上**不做** `npm ci` / `next build` / `git`。

**关键组成**

- `next.config.ts` 开 `output: "standalone"`，构建出自包含 `server.js` + 精简 `node_modules`。
- 发布目录：`/srv/gathering-vote/releases/<sha>/`，软链 `/srv/gathering-vote/current` 指向当前版本，保留最近 3 个版本便于回滚。
- systemd 运行 `node /srv/gathering-vote/current/server.js`（`PORT=3000`、`HOSTNAME=127.0.0.1`），Caddy 把 `gathering-vote.wrui.me` 反代到 `127.0.0.1:3000`。
- 迁移工具：`/srv/gathering-vote/db-tools/`（一次性安装 `drizzle-kit` + `drizzle-orm` + `postgres` + `dotenv`），deploy.sh 把 `drizzle.config.ts` + `drizzle/` 复制到其 `work/` 子目录后执行 `drizzle-kit migrate`。
- 国际网络：服务器 git 与 npm 均配置走本机 `http://127.0.0.1:8080` 代理。

**GitHub Secrets**（仓库 Settings → Secrets and variables → Actions）

| Secret | 说明 |
| --- | --- |
| `ALIYUN_HOST` | 服务器 IP |
| `ALIYUN_PORT` | SSH 端口 |
| `ALIYUN_USER` | `deploy`（非 root，仅有 `systemctl restart/status gathering-vote.service` 的窄 sudo） |
| `ALIYUN_SSH_KEY` | GitHub Actions 专用私钥 |
| `ALIYUN_KNOWN_HOSTS` | 服务器主机公钥记录 |

**回滚**：将 `current` 软链指回上一个 release 后 `sudo systemctl restart gathering-vote.service` 即可。数据库迁移无自动降级，需用 `/srv/gathering-vote/backups/` 里的 `pg_dump` 备份恢复。

**手动重新部署**：在 Actions 页面选择最近一次运行点 "Re-run all jobs"，或用 `workflow_dispatch` 手动触发。

---

## 1. 项目概况

Gathering-vote 是一个 Next.js 15、TypeScript、PostgreSQL 和 Drizzle ORM 应用。应用服务器无本地持久化状态，用户、Session、活动、候选和选票均保存在 PostgreSQL 中。

- Node.js：20 或更高版本
- PostgreSQL：15 或更高版本
- 默认应用端口：`3000`
- 唯一必需环境变量：`DATABASE_URL`
- 数据库迁移目录：`drizzle/`
- 健康检查入口：`GET /api/auth/me`，未登录时也应返回 HTTP 200

## 2. 上线前准备

1. 准备一个 PostgreSQL 数据库和独立的低权限应用账号。
2. 准备 HTTPS 域名。生产环境 Session Cookie 带有 `Secure`，不能只通过 HTTP 提供正式服务。
3. 将下面格式的连接串保存到部署平台的 Secret 中，不要提交到 Git：

```text
DATABASE_URL=postgres://用户名:密码@数据库地址:5432/gathering_vote?sslmode=require
```

4. 在每次数据库迁移前执行备份：

```bash
pg_dump "$DATABASE_URL" --format=custom --file="gathering-vote-$(date +%Y%m%d-%H%M%S).dump"
```

## 3. 推荐方案：Vercel + 托管 PostgreSQL

1. 在 Vercel 导入 GitHub 仓库 `severin-ye/Gathering-vote`。
2. Framework Preset 选择 Next.js，Node.js 版本选择 20。
3. 在 Production、Preview 和 Development 环境中分别设置对应的 `DATABASE_URL`。生产和预览环境不要共用数据库。
4. 首次上线或出现新 migration 时，在可信终端执行：

```bash
npm ci
DATABASE_URL='生产连接串' npm run db:migrate
```

5. 让 Vercel 执行默认构建命令：

```bash
npm run build
```

6. 部署后检查：

```bash
curl -i https://你的域名/api/auth/me
```

预期为 HTTP 200，响应体包含 `"user":null` 或当前登录用户信息。

## 4. 普通 Linux 服务器部署

> **注意**：本节描述的"在服务器上 npm ci + next build"方式已被 [第 0 节 CI/CD](#0-cicd-自动部署当前生产方式) 取代。生产服务器内存较小，不应再在服务器上构建。本节仅供参考，或用于无 CI 的环境。

以下示例适用于 Ubuntu 24.04、Nginx、systemd 和独立 PostgreSQL。将路径和域名替换为实际值。

### 4.1 安装与构建

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin gathering-vote
sudo mkdir -p /srv/gathering-vote
sudo chown gathering-vote:gathering-vote /srv/gathering-vote
sudo -u gathering-vote git clone https://github.com/severin-ye/Gathering-vote.git /srv/gathering-vote/app
cd /srv/gathering-vote/app
sudo -u gathering-vote npm ci
```

将生产环境变量写入 `/etc/gathering-vote.env`：

```text
NODE_ENV=production
DATABASE_URL=postgres://用户名:密码@数据库地址:5432/gathering_vote?sslmode=require
```

保护 Secret：

```bash
sudo chown root:gathering-vote /etc/gathering-vote.env
sudo chmod 640 /etc/gathering-vote.env
```

执行迁移和构建：

```bash
cd /srv/gathering-vote/app
set -a
. /etc/gathering-vote.env
set +a
sudo -u gathering-vote --preserve-env=DATABASE_URL,NODE_ENV npm run db:migrate
sudo -u gathering-vote --preserve-env=DATABASE_URL,NODE_ENV npm run build
```

### 4.2 systemd 服务

创建 `/etc/systemd/system/gathering-vote.service`：

```ini
[Unit]
Description=Gathering-vote Next.js application
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=gathering-vote
Group=gathering-vote
WorkingDirectory=/srv/gathering-vote/app
EnvironmentFile=/etc/gathering-vote.env
ExecStart=/usr/bin/npm run start -- -p 3000
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gathering-vote
sudo systemctl status gathering-vote
curl -i http://127.0.0.1:3000/api/auth/me
```

### 4.3 Nginx 与 HTTPS

创建 `/etc/nginx/sites-available/gathering-vote`：

```nginx
server {
    listen 80;
    server_name vote.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/gathering-vote /etc/nginx/sites-enabled/gathering-vote
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d vote.example.com
```

## 5. 更新流程

> **注意**：日常更新已由 [第 0 节 CI/CD](#0-cicd-自动部署当前生产方式) 自动完成（`git push origin main` 即可）。下面的手动流程仅作参考或应急使用。

```bash
cd /srv/gathering-vote/app
sudo -u gathering-vote git fetch --all --prune
sudo -u gathering-vote git checkout main
sudo -u gathering-vote git pull --ff-only
sudo -u gathering-vote npm ci

set -a
. /etc/gathering-vote.env
set +a
pg_dump "$DATABASE_URL" --format=custom --file="/安全备份目录/gathering-vote-$(date +%Y%m%d-%H%M%S).dump"
sudo -u gathering-vote --preserve-env=DATABASE_URL,NODE_ENV npm run db:migrate
sudo -u gathering-vote --preserve-env=DATABASE_URL,NODE_ENV npm run build
sudo systemctl restart gathering-vote
```

更新后执行第 7 节的验收清单。

## 6. 回滚

应用代码可以回滚到上一个已知可用的 Git commit：

```bash
cd /srv/gathering-vote/app
sudo -u gathering-vote git checkout <已知可用的commit>
sudo -u gathering-vote npm ci
sudo -u gathering-vote --preserve-env=DATABASE_URL,NODE_ENV npm run build
sudo systemctl restart gathering-vote
```

Drizzle migration 当前没有自动降级命令。若新 migration 已改变数据库结构，应先停止应用，再使用上线前的 `pg_dump` 备份恢复到独立数据库，验证后切换 `DATABASE_URL`。不要在未备份时手工删除表或列。

## 7. 上线验收清单

```bash
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:e2e
npm run build
```

人工验收：

- 注册完成后返回登录页。
- 无密码账号可以登录，也能在登录后设置密码。
- 创建活动时日期必选、名称可空，重复点击不会创建两条活动。
- 多名用户并发申领管理员时只有一人成功。
- 活动结束前可以添加候选并保存完整排序。
- 截止后结果才公开，第一名显示皇冠和冠军高亮。
- 只有当前活动管理员能删除该活动；删除后其他活动、用户、密码和 Session 保留。
- 手机页面无横向滚动，键盘可以操作排序按钮。

## 8. 运维与安全注意事项

- `DATABASE_URL`、数据库备份和 `.env.local` 禁止提交到 Git。
- 本地开发数据保存在 Docker volume `gathering-vote-postgres-data`；仓库内的 `.local-data/` 仅供本机备份使用，已被 `.gitignore` 整体排除。
- 数据库需要自动备份，并定期实际演练恢复。
- 生产环境必须启用 HTTPS，否则安全 Cookie 无法正常工作。
- 删除活动无法从应用内撤销，操作前应确认已有数据库备份。
- 日志不得记录 Cookie、数据库连接串或用户密码。
- 当 migration、Node.js 主版本或 PostgreSQL 主版本变化时，先在预发布环境完成完整验收。
