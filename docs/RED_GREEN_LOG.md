# 红绿灯测试记录

## 领域规则

- 红灯命令：`npm test`
- 红灯结果：失败；`activity`、`voting`、`normalization` 领域模块尚不存在，测试无法加载。
- 绿灯结果：`6 passed`；名称归一化、活动阶段边界、完整排序校验和 Borda 计票全部通过。

## 请求校验

- 红灯命令：`npm test`
- 红灯结果：失败；输入契约模块尚不存在。
- 绿灯结果：新增认证、截止时间、排序唯一性和危险确认测试后 `10 passed`。

## PostgreSQL 约束

- 红灯命令：`npm test`
- 红灯结果：失败；PostgreSQL 测试运行时尚未安装。
- 绿灯结果：`13 passed`；验证并发申领恰好一人成功、活动内候选唯一、每人每场一票，以及级联清空保留用户与 Session。

## 浏览器主流程

- 红灯命令：`npm run test:e2e`
- 红灯结果：`4 passed, 2 failed`；功能断言通过，桌面和手机视觉基准尚不存在。
- 绿灯结果：人工检查首次截图后建立基准；桌面与手机共 `6 passed`，覆盖无密码警示、无横向溢出和按钮排序保存。

## 密码与 Session

- 红灯命令：`npm test`
- 红灯结果：失败；可独立测试的认证规则模块尚不存在。
- 绿灯结果：`16 passed`；密码哈希、错误密码、无密码语义和 Session 精确过期边界通过。

## 密码补设与注册跳转

- 红灯命令：`npm test -- --run tests/validation.test.ts`
- 红灯结果：`2 failed, 3 passed`；注册密码策略和密码修改输入契约尚不存在。
- 绿灯结果：`5 passed`；注册密码可留空但非空时至少 6 位，新密码至少 6 位且两次输入一致。
- 浏览器回归：覆盖注册后返回登录状态、无密码账号设置密码，以及设置后切换到需原密码的修改入口。

## 活动日期、幂等创建与候选表单

- 红灯命令：`npm test -- --run tests/validation.test.ts tests/database.integration.test.ts`
- 红灯结果：`2 failed, 8 passed`；活动名称仍为必填，数据库尚无活动日期和幂等键。
- 绿灯结果：`10 passed`；活动名称可空并由日期生成默认名，同一创建请求只能生成一条活动。
- 浏览器回归：活动结束前，候选清单直接显示“拖动”把手和个人排序；征集期间新增候选会追加到现有顺序末尾。异步添加候选后安全清空表单，不再访问失效的 `event.currentTarget`。

## 征集期持续排序

- 红灯命令：`npm test -- --run tests/domain.test.ts`
- 红灯结果：失败；`mergeRankingOrder` 尚不存在，无法在保留既有顺序的同时补入新候选。
- 绿灯结果：`7 passed`；保留仍有效的既有顺序，移除已删除候选，并将新候选稳定追加到末尾；活动结束前均可保存完整排序。
- 手机回归红灯：新增候选出现后，左右控制按钮把候选标题挤成零宽，桌面通过但手机用例失败。
- 手机回归绿灯：排序卡片改为两行响应式布局，完整桌面与手机 E2E `14 passed`。

## 冠军重点显示

- 红灯命令：`npx playwright test e2e/app.spec.ts -g "截止后的第一名显示皇冠并重点加粗" --project=chromium-desktop`
- 红灯结果：失败；结果页不存在 `.winner` 冠军行，也没有皇冠和专属字重。
- 绿灯结果：`1 passed`；第一名显示皇冠章、暖金色冠军卡片和 900 字重标题。

## 单活动管理员删除

- 红灯命令：`npx playwright test e2e/app.spec.ts -g "只有活动管理员能确认删除当前活动" --project=chromium-desktop`
- 红灯结果：失败；管理员页面不存在“删除这个活动”入口。
- 绿灯结果：定向 E2E `2 passed`、校验与数据库集成测试 `10 passed`；全站清空接口和入口已移除，仅当前活动管理员能在精确确认后删除该活动，并级联删除它的候选和选票。

## 手机端拖拽与页面滚动

- 红灯命令：`npx playwright test e2e/app.spec.ts -g "用户可以进入活动、用按钮排序并保存唯一选票" --project=chromium-mobile`
- 红灯结果：失败；整个 `.sortable` 横条的 `touch-action` 为 `none`，会拦截手机上下滚动。
- 绿灯结果：`1 passed`；候选横条使用 `pan-y` 保留页面滚动，仅拖动按钮使用 `touch-action: none` 触发排序。

## 截止时间建议

- 红灯命令：`npm test -- --run tests/domain.test.ts`
- 红灯结果：`3 failed, 7 passed`；尚不存在按日历日期和 6 小时间隔生成建议的领域规则。
- 绿灯结果：`10 passed`；排序截止按日历日期判断是否至少早一天，候选添加截止按实际时间判断是否至少早 6 小时。
- 手机浏览器回归：`1 passed`；“再想想”不提交，“确定保存”允许忽略建议并保存原设置。

## 截止时间下限与三类提醒

- 红灯命令：`npm test -- --run tests/domain.test.ts tests/validation.test.ts`
- 红灯结果：`2 failed, 16 passed`；候选截止距当前不足 2 小时没有建议，且服务端仍接受过去的截止时间。
- 绿灯结果：`18 passed`；两个截止时间必须晚于当前时间，候选截止不足 2 小时会加入建议。按日历日期验证边界：26 日活动在 25 日 23:00 排序截止符合“早一天”，不会触发该问题。
- 浏览器回归：桌面与手机 `2 passed`；只渲染实际问题，并按出现顺序连续显示“问题 1、问题 2”；日期控件带当前时间下限，移动端提醒弹窗可滚动且按钮可操作。

## 实时汇总与持久保存状态

- 红灯命令：`npx playwright test e2e/app.spec.ts --grep "用户可以进入活动" --project=chromium-desktop`
- 红灯结果：`1 failed`；活动进行期间不存在“当前大家的排序”区域。
- 绿灯结果：`1 passed`；进行中的活动按所有已保存选票实时显示 Borda 排名、分数和横向柱状图。
- 保存状态回归：保存后刷新仍显示“已保存这份排序 ✓”；本地顺序改变后状态消失，防止把未保存改动误认为已经保存。

## 参加池与历史选票回填

- 红灯命令：`npm test -- --run tests/database.integration.test.ts`；`npx playwright test e2e/app.spec.ts --grep "参加后才能" --project=chromium-desktop`
- 红灯结果：数据库迁移文件不存在；页面也不存在“参加与排序状态”区域。
- 绿灯结果：迁移测试 `5 passed`，确认历史选票用户被回填为参加者，同时原选票和排序项数量保持不变；定向浏览器测试 `1 passed`，确认未参加者不能添加候选或排序，参加后立即解锁。
- 名单规则：只有包含当前全部候选的完整选票才显示“已排序”；新增候选导致旧排序暂不完整时显示“未排序”，用户重新保存完整排序后恢复。

## 参加入口布局

- 红灯命令：`npx playwright test e2e/app.spec.ts --grep "参加后才能" --project=chromium-desktop`
- 红灯结果：`1 failed`；活动标题区没有参加入口，参加名单也不在实时汇总卡内部。
- 绿灯结果：桌面与手机 `2 passed`；“参加活动”改为管理员按钮旁的入席小方章，人员状态并入当前排名卡顶部，不再占用独立纸卡。

## 账号改名与私人备注

- 红灯命令：`npm test -- --run tests/validation.test.ts tests/database.integration.test.ts`；`npx playwright test e2e/app.spec.ts --grep "账号管理可以" --project=chromium-desktop`
- 红灯结果：账号更新契约、私人备注表和账号管理入口均不存在。
- 绿灯结果：账号名仍受全站唯一约束，但历史关联继续使用稳定 UUID；私人备注以“查看者 + 被备注者”联合主键保存，只对创建备注的人生效。
- 浏览器回归：账号管理支持只改名、只改密码或同时修改；参加名单和管理员名称按“备注（原名称）”显示，并可在名单内编辑或清除备注。
- 完整门禁：`28 passed` 单元/数据库测试，桌面与手机 E2E `22 passed`，类型检查、零警告 Lint 和生产构建全部通过；无测试跳过。
- 本地迁移保全：迁移前已在 Git 忽略的 `.local-data` 创建 PostgreSQL 备份；迁移前后账号、活动、候选、选票、排序项和参加记录数量逐项一致。

任何测试跳过均不视为绿灯。
