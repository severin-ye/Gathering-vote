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

## 生产部署（CI/CD）

生产环境通过 GitHub Actions 自动部署到阿里云服务器：`git push origin main` 即可。流水线先跑 lint / typecheck / 单元测试，全过后在 CI 上构建 Next.js standalone 产物，上传到服务器解压、迁移数据库、切换软链并重启。服务器配置较低，构建全部在 CI 完成。详见 [部署交接文档](docs/DEPLOYMENT_HANDOFF.md) 第 0 节。

## 部署到 Vercel（备选）

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
- 两个截止时间必须晚于当前时间；时间设置会建议候选添加截止至少距当前 2 小时、至少比排序截止早 6 小时，以及排序截止日期至少比活动日期早一天。这里的“早一天”按日历日期计算，例如 26 日的活动在 25 日 23:00 截止也符合建议；建议不满足时可确认继续保存。
- 活动创建后即可用拖拽把手维护个人排序；征集期间新增的候选会自动追加到现有排序末尾。
- 活动进行期间会实时汇总所有已保存的完整排序，按 Borda 分数显示当前排名、准确分数和横向柱状图；个人排序保存状态刷新后仍会保留，只有顺序发生变化时才隐藏。
- 每场活动有独立参加名单；用户参加后才能添加候选和保存排序。名单区分“已排序”和“未排序”，升级时会自动把历史选票的用户回填为已参加，不改写既有活动、候选或选票。
- 账号使用独立 UUID 关联历史数据，用户可以在“账号管理”中修改真名或密码；修改真名不会改变其活动、候选、选票和 Session 归属。
- 每位用户可以为其他参加者设置仅自己可见的私人备注；有备注时显示为“备注（对方当前用户名）”。
- 每场活动仅其当前管理员可以删除；删除会级联移除该活动的候选和选票，不影响其他活动、账号、密码和 Session。
- 当前版本不包含密码找回、匿名投票、邀请系统或数据恢复。
