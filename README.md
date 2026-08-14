# 轻账 Web

一个本地优先、面向商业化演进的专业记账工作台。后端使用 NestJS 模块化单体架构，前端使用 React + TypeScript 的独立多页面工作区，AI 由受限账本工具驱动。

完整的用户功能、数据规则、接口、部署能力和未实现边界请查看 [功能说明.md](./功能说明.md)。

## 技术架构

- 后端：NestJS 11、TypeScript、模块化 Controller/Service/Infrastructure 分层。
- 前端：React 19、Vite、TypeScript、Ant Design 6，统一使用 Ant Design 设计令牌和响应式应用框架。
- 数据交互：TanStack Query；账目工作区使用 Ant Design Table 的服务端分页、排序、筛选与多选能力。
- 表单与反馈：Ant Design Form、Drawer、App 消息上下文与图标组件。
- 图表与 AI 界面：Ant Design Charts；Ant Design X Conversations、Bubble、Sender；支持 Markdown 渲染和路由级代码拆分。
- 数据：PostgreSQL 17、Prisma ORM、版本化迁移、审计日志；正式数据与容器生命周期分离。
- 认证：用户名密码注册登录、PostgreSQL 持久会话、HttpOnly Cookie 和逐用户数据隔离。
- AI：Pi SDK 仅位于 AI 基础设施层，通过账本工具访问领域能力。

## 已实现

- 日、周、月、年支出总计；周周期为周一至周日。
- 日、周、月、年的一级分类与二级分类金额、占比饼图。
- 历史统计入口可跳转任意日期或年份，并同步查看对应日、周、月、年统计。
- 账目明细按月份筛选并以每页 20 条分页展示。
- 明细支持项目、备注、分类搜索以及一级分类筛选。
- 支持在明细中直接编辑账目；删除使用独立确认窗口并自动重算统计。
- 汇总卡片可直接联动对应周期的分类占比，侧栏会同步标记当前工作区域。
- 近 14 日、8 周、12 月支出趋势。
- 账目新增、查询、修改、删除 REST 接口。
- `/dashboard`、`/transactions`、`/analytics`、`/ai`、`/management`、`/settings` 独立工作区。
- `/finance` 资产与负债工作区：账户余额、账户转账、贷款/分期计划、按期还款和提前结清。
- 桌面端侧栏与全局顶栏；移动端底部导航和中央记账入口。
- 新增、编辑账目使用右侧 Drawer，取消不会触发表单必填校验。
- URL 保存账目筛选、服务端分页/排序、多选、筛选保存和 CSV 导出。
- 分析页同时展示一级与二级分类饼图、环比、每日支出日历和大额支出；日历按月切换，点击日期可查看当天账目，跨年范围由趋势图统一汇总。
- AI 独立多轮对话工作区、Markdown 渲染和待确认操作栏。
- 自然语言记账和账本问答。
- AI 可查询资产负债，并提出新增/修改账户、转账、负债计划、还款和提前结清操作；写入前仍需确认。
- 首次启动自动导入当前 `记账.xlsx` 对应的 10 笔初始数据。
- 新项目和“一级分类 + 二级分类”组合自动去重加入字典。
- 注册、登录和退出；登录会话在服务端不设过期时间，浏览器 Cookie 采用十年期限并可由退出操作立即吊销。
- 账目、分类、预算、AI 模型配置和 AI 对话按用户隔离；首个注册用户自动接管升级前已有数据。

## 启动

开发模式会同时启动 NestJS API 和 Vite 前端：

```powershell
npm run dev
```

生产模式先构建，再启动：

```powershell
npm run build
npm start
```

然后打开 <http://127.0.0.1:3218>。

本地开发需要先启动 PostgreSQL，并执行数据库迁移：

```powershell
docker compose up -d postgres
npm run db:migrate
npm run dev
```

连接信息由项目根目录的 `.env` 提供。所有账目、账户、分类、预算、标签和 AI 模型配置都写入 PostgreSQL；`data` 目录仅保存 Pi SDK 生成的模型运行配置等文件。

## Pi 集成

应用使用 `@earendil-works/pi-coding-agent` SDK 作为 Agent 内核。模型、Base URL 和 API Key 均在网页的“AI 设置”中配置并保存到 PostgreSQL，无需额外登录 Agent。

Pi 在应用里只能使用以下账本工具，不具备文件或命令工具：

- `ledger_list_transactions`：查询最近账目。
- `ledger_get_summary`：查询日、周、月、年汇总及分类占比。
- `ledger_list_dictionaries`：查询项目和分类字典。
- `ledger_propose_create`：提出新增账目建议。
- `ledger_propose_update`：提出修改建议。
- `ledger_propose_delete`：提出删除建议。
- `ledger_get_finance_overview`：查询账户余额、负债和近期应还。
- `ledger_propose_account_create`：提出新增账户建议。
- `ledger_propose_account_update`：提出账户改名、设为默认或启停建议。
- `ledger_propose_transfer`：提出账户间转账建议，不计入收支。
- `ledger_propose_liability_create`：提出贷款或分期计划建议。
- `ledger_propose_liability_payment`：提出按期还款建议，本金不计入支出。
- `ledger_propose_liability_settlement`：提出提前结清建议并取消未来分期。

三个变更工具都只生成待确认操作；只有用户在网页点击“确认执行”后，后端才会写入数据库。

## 配置 Pi

网页“设置 → AI 模型”使用配置列表选择默认模型：

- **自定义模型配置**：填写 Provider ID、Model ID、Base URL、API 类型和 API Key，由应用生成 Pi `models.json` 格式的配置并交给 Pi SDK 加载。

应用不会读取或回退使用所谓“环境默认模型”；AI Agent 只能使用你在网页中创建并选为默认的模型配置。

支持的 Pi API 类型包括 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 和 Google Generative AI。无论使用哪一种配置，所有模型请求和账本工具调用都由 Pi SDK 执行，不存在另一套直连 API 的运行模式。

AI 模型配置列表保存在 PostgreSQL，网页接口只返回“是否已配置”，不会返回完整 API Key。Pi SDK 为每名用户生成独立的 `data/pi-models-<用户ID>.json`。账目新增、修改和删除始终需要网页确认。

Pi 的回答会在网页中安全渲染常用 Markdown，包括标题、强调、列表、引用、链接、代码块和表格；原始 HTML 不会直接执行。

## 检查

```powershell
npm test
```

## Docker 部署

Compose 会启动 `web` 与 `postgres` 两个服务。PostgreSQL 数据持久化在固定命名卷 `qing-zhang-postgres-data`，其中也包含用户、密码哈希和持久登录会话；宿主机 `data` 目录挂载到 `/app/data` 保存各用户的 Agent 模型运行文件。运行目录可通过 `QING_ZHANG_DATA_DIR` 调整（数据库卷名保持固定）。因此重建或升级 Web 容器不会删除账户、账目、AI 配置、对话或登录会话：

```powershell
docker compose up -d
```

升级前可以使用 Compose 内置的一次性备份工具。备份会写入宿主机 `backups` 目录，可通过 `QING_ZHANG_BACKUP_DIR` 修改：

```powershell
docker compose run --rm backup
```

备份文件采用 PostgreSQL 自定义格式，可通过 `pg_restore` 校验和恢复。镜像 tar 包不包含数据库卷，因此跨机器迁移时需同时携带该备份文件以及 `data`、`pi` 目录。切勿执行 `docker compose down -v`、`docker volume rm qing-zhang-postgres-data` 或带 `--volumes` 的清理命令。

默认访问 <http://127.0.0.1:3218>。如需更换宿主机端口：

```powershell
$env:QING_ZHANG_PORT=8080
docker compose up -d
```

首次打开请注册账户。升级前已有的账目、分类、预算、AI 配置和对话会自动归属给第一个注册账户；之后注册的账户使用独立数据空间。直接通过 HTTP 访问时保持 `COOKIE_SECURE=0`，配置 HTTPS 反向代理后将其改为 `1`。

导入离线镜像包后可直接使用 Compose 启动：

```powershell
docker load -i qing-zhang-stack_2.0.0_linux-amd64.tar
docker compose up -d --no-build
```

Web 容器会自动处理 Linux bind mount 的目录权限，随后降权为 `node` 用户，执行 `prisma migrate deploy` 并启动 NestJS。数据库密码保存在被 Git 忽略的 `.env`，不要写入镜像或提交到仓库。

如需单独运行 Web 镜像，必须另外提供可访问的 PostgreSQL 连接：

```powershell
docker run -d --name qing-zhang --restart unless-stopped -p 3218:3218 -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/qing_zhang" -v "${PWD}/data:/app/data" qing-zhang-web:2.0.0
```

镜像构建上下文会排除本地数据库、日志和 AI 密钥；这些数据只通过宿主机目录挂载进入容器。
