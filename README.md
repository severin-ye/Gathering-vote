# 今晚投什么？

一个面向熟人聚会的移动端排序投票网站。用户用真名登录、共同添加候选项，并各自维护一份完整排序；截止后系统用 Borda 积分给出结果。

创建活动时选择聚会日期，名称可以留空；留空时系统使用“YYYY年M月D日”作为活动名称。创建请求带有幂等键，双击或网络重试不会产生重复活动。

## 本地运行

需要 Node.js 20+ 和 PostgreSQL 15+。

```powershell
Copy-Item .env.example .env.local
# 编辑 .env.local，填入可用的 DATABASE_URL
npm ci
npm run db:migrate
npm run dev
```

然后访问 [http://localhost:3000](http://localhost:3000)。

## 验证

```powershell
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:e2e
npm run build
```

单元测试覆盖活动状态、计票、认证和输入契约；数据库集成测试使用 PGlite 执行真实 PostgreSQL migration；Playwright 同时验证桌面和移动端关键流程。

## 部署到 Vercel

1. 创建托管 PostgreSQL 数据库并复制连接字符串。
2. 在 Vercel 项目中设置 `DATABASE_URL`。
3. 在受信任环境运行一次 `npm run db:migrate`。
4. 将仓库导入 Vercel；框架选择 Next.js，构建命令使用 `npm run build`。

`DATABASE_URL` 不应提交到 Git。生产环境的 Session Cookie 会自动启用 `Secure`。

Vercel、普通 Linux 服务器、Nginx、systemd、备份和回滚的完整步骤见 [部署交接文档](docs/DEPLOYMENT_HANDOFF.md)。

## 产品边界

- 用户名全站唯一，建议使用真名。
- 密码可以为空；无密码账户能够被任何知道用户名的人登录，但登录后可以为账号设置密码。
- 已设置密码的用户可以在登录后输入原密码并修改密码。
- 注册完成后不会自动登录，而是返回登录表单。
- 活动管理员可解除身份，其他人才可重新申领。
- 活动创建后即可用拖拽把手维护个人排序；征集期间新增的候选会自动追加到现有排序末尾。
- 任一当前活动管理员可以清空全部活动；账号、密码和 Session 不会被删除。
- 当前版本不包含密码找回、匿名投票、邀请系统或数据恢复。
