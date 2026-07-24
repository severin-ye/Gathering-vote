# Gathering-vote 部署交接文档

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
- “清空所有活动”会保留用户、密码和 Session。
- 手机页面无横向滚动，键盘可以操作排序按钮。

## 8. 运维与安全注意事项

- `DATABASE_URL`、数据库备份和 `.env.local` 禁止提交到 Git。
- 数据库需要自动备份，并定期实际演练恢复。
- 生产环境必须启用 HTTPS，否则安全 Cookie 无法正常工作。
- 执行“清空所有活动”无法从应用内撤销，操作前应确认已有数据库备份。
- 日志不得记录 Cookie、数据库连接串或用户密码。
- 当 migration、Node.js 主版本或 PostgreSQL 主版本变化时，先在预发布环境完成完整验收。
