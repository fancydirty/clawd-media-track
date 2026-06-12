# Project Status & Handoff（2026-06-13）

> 本文档是跨上下文/跨会话的接续锚点。继续开发前先读这里，再按需读关联文档。
> 维护规则：每完成一个切片更新本文档的进度与待办两节。

## 这个仓库是什么

把 `clawd-media-track` agent skill（SKILL.md + references/，Python 参考实现）改造成 workflow 产品：
**确定性 workflow 拥有全部副作用（115 转存/搬移/删除/验证/数据库），agent 只作为无状态结构化判断节点（强智能、窄权限）。**

核心文档：
- 产品架构：`docs/workflow-product-architecture.md`
- 内核设计：`docs/superpowers/specs/2026-06-11-media-track-workflow-kernel-design.md`
- 实施计划（按日期）：`docs/superpowers/plans/*.md`（每份带状态日志）

## 当前架构（全部 live 验证过）

### Agent 节点（仅 2 个，`packages/workflow/src/agent-nodes/`）
1. **AcquisitionPlanningAgent**：完整获取判断（关键词策略/目标匹配/集数映射/选择）为一次连贯 deliberation；
   read-only `searchResources` tool loop；输入为多季 seasons 数组 + 缺集清单 + 失败证据。
   输出合同由 `plan-validation.ts` 强制：快照本轮观测、disposition 全覆盖（防证据截断）、
   选中必映射真实缺集（no just-in-case）、季集合校验。空选择 = 诚实的 no_coverage。
2. **PackageRecognitionAgent**：文件→季/集语义映射，两处使用：包归一化辅助 + **删除前去重确认**
   （解析器会"认错"压制组数字，删除必须 agent 确认映射）。可标记 `foreignWorkProviderFileIds`
   （El Camino 类包内异作品 → 人工复核警告，绝不映射）。

Agent 唤起原则：**workflow 唤起，agent 不委派 agent**。触发信号全部机械可测：
未映射视频文件 / 重复映射冲突（硬阻断）/ 低置信。规范命名的资源全程零 agent 调用。

### Workflow 内核（`packages/workflow/src/workflow.ts`）
- **统一 staging**（用户拍板）：一切转存先进 staging 目录（show 目录或 storageParent 之下，
  绝不在 season 目录内——防隔离泄漏）→ `listTree` 快照 → 归一化计划 → `moveFiles` 按季分发
  → 被拒/越界季文件留 staging 隔离。flatten 已退出获取主路径。
- 失败证据闭环：转存没落文件 → 失败证据 → 重新调用 planning agent（maxPlanningPasses=2），
  **绝无机械 fallback/通配符选资源**（产品红线）。
- 状态机：succeeded / partial / no_coverage（有真实证据才允许；搜索全错=基础设施失败抛错）。
- 三种工作流：`runType2Initialization`（单季初始化）、`runType3Monitoring`（巡检修复，先盘存量）、
  `runSeriesInitialization`（获取全剧：跨季需求集，完结季 completed/在更季 active/未覆盖留缺口）。
- 去重：确定性嫌疑分组 → agent 确认映射 → 保大删小 → 重读验证（`dedup.ts`）。
- 目录：find-or-create（同名复用），规范形 `Title (Year)/Season N` 由 workflow 自建。

### 产品层
- 队列/worker：type2 队列 + series 队列（S1 为幂等锁，audit 携带 seasons 元数据）+ Type 3 调度
  sweep（每 active 季一个预约守护 run）。web 路由 `/api/workflows/run-next`（链式 type2→series）、
  `/api/workflows/run-type3`，秘钥 `MEDIA_TRACK_WORKER_SECRET`。
- 命令层：`queueTrackingInitialization` / `queueSeriesInitialization` / `requestTracking*`。
- TMDB：`prepareTrackingTarget`（单季）/ `prepareSeriesTarget`（全剧一次 details 调用）。

### 前端（apps/web，Next 16）
- Spotify 设计语言（`apps/web/DESIGN.md`，来自 VoltAgent/awesome-design-md）。
- `cacheComponents: true`（PPR 默认）：静态壳 + Suspense 动态洞；**SQLite 读取等非 fetch 动态源
  必须 `await connection()` 声明请求时**，否则 build 报 prerender 错。
- TMDB 分层缓存：追踪状态 → `SqliteMediaSearchCache`（6h TTL，`lib/tmdb-cache.ts`）→ live TMDB。
- 路由：`/`（搜索+媒体库 tab）、`/show/[tmdbId]/[seasonNumber]`（详情集数网格，Link 预取）、
  `/notifications`（日报 feed：Linear changelog 模式——日期 eyebrow/今天昨天/日摘要行/发丝线/kind 徽章）。
- 候选卡片双动作：获取本季（RequestTrackButton）+ 获取全剧（RequestSeriesButton）。

## Live 验证记录（115 test root cid=3351918746607287913）

| 验证 | 结果 |
|---|---|
| Mimo 结构化输出 + tool loop | 通过（需手动 JSON 提取，见"坑"） |
| Type 2 翘楚 | 15 集 4K，关键词恢复含真实 502 |
| Type 3 修复（删 E07/E15）+ no-op | 修复成功；no-op 0.3s already_current |
| 绝命毒师 214G 全集包归一化 | 62 集 5 季，纪录片+El Camino 正确隔离 |
| **获取全剧（黑袍纠察队 tmdb 76479）** | 774s succeeded：agent 12 关键词后组合 S1-4 全季包(208G)+S5 全 8 集包覆盖 40/40；live 去重清重复 |

test root 现有产物：翘楚 (2026)/S1、绝命毒师 (2008)/S1-5、黑袍纠察队 (2019)/S1-5、若干 staging 残留（可删）。
生产目录 `clawd-media`（cid 3339812358359874597）**绝对不碰**。

## 环境事实（.env 已配齐，gitignored）

- `XIAOMI_MIMO_API_KEY` 已在 .env；模型 `mimo-v2.5-pro`；端点不支持 response_format。
- `MEDIA_TRACK_115_TEST_ROOT_CID=3351918746607287913`；guard：默认 240 次调用预算 + 1.2s 间隔，
  env 可调（`MEDIA_TRACK_115_MAX_API_CALLS` / `MEDIA_TRACK_115_MIN_DELAY_MS`）。
- live 适配开关：`MEDIA_TRACK_WORKFLOW_ADAPTER=pansou`、`MEDIA_TRACK_STORAGE_ADAPTER=115`、
  `MEDIA_TRACK_AGENT_ADAPTER=vercel-ai`（live provider/storage 时策略强制 vercel-ai）。
- 目录父级：`MEDIA_TRACK_TV_PARENT_CID`（生产用 TV_SHOWS_CID，开发回落 test root）。

## 踩坑教训（防重蹈）

1. **Mimo 无 response_format** → `ai-sdk-agent.ts` 用 schema 嵌入 prompt + 手动 JSON 提取 +
   一轮修复对话（`extractJsonText`）。换端点前别删这层。
2. **PanSou 快照 id 是内容哈希**：相同结果集（尤其空集）跨搜索同 id → 入库前必须去重
   （已在 acquireMissingEpisodes 累积点处理）。
3. **115 category/get 不回显查询目录自身 cid** → 路径叶子用请求 cid 兜底
   （pan115-cookie-client.ts），flatten 安全检查依赖此。
4. **文件名解析器会"认错"**（压制组数字→集数）：删除类操作必须 agent 确认；解析结果只是证据。
5. **staging 不能放 season 目录内**：真实执行器 listVideoFiles 递归，隔离区可解析文件会泄漏成"已获取"。
6. 包归一化"有未映射文件就清零全部 action"是死锁（真实包必带特典）——已改为隔离+继续，
   重复映射仍硬阻断。
7. PPR 下 `new Date()`/SQLite 读取需 `await connection()`。
8. 测试经验：FakeResourceProvider 快照 id 顺序递增（`snapshot_N_candidate_M`）；
   FakeAgentNodes.planAcquisition 是最小覆盖选择 + 跳过失败标题；workflow 调用现在都需要
   `storageParentDirectoryId`。

## 常用命令

```bash
npm test && npm run typecheck            # 164 tests, 全绿基线
npm run build:workflow && npm run build:web
npm run dev:web                          # 看产品形态
node scripts/agent-planning-smoke.mjs --title "X" ...      # 只读 agent 规划冒烟
node scripts/live-type2-smoke.mjs --tmdb <id> --season 1   # 单季全链
node scripts/live-type3-smoke.mjs --tmdb <id> --dir <cid>  # 巡检修复
node scripts/live-series-init.mjs --tmdb <id>              # 获取全剧全链
node scripts/live-package-init.mjs --tmdb <id> --staging <cid>  # 既有包归一化
curl -X POST localhost:3000/api/workflows/run-next         # 跑队列（dev）
```

## 2026-06-12/13 第二轮清待办（d49f3c9..e7bda59）

1. **获取前 reconcile 存量**（d49f3c9）：Type2/系列初始化先 find-or-create 各季目录并
   listVideoFiles，已落集从需求集剔除；audit `existing_content_reconciled`。
   Live 验证：黑袍全剧重跑 24s（首跑 774s）、零规划、零转存。
2. **未解析文件曝光 + 救援**（6936e37）：端口加 `listUnparsedVideoFiles` + `renameFile`
   （115 走 `files/batch_rename`，live 已验证改名+还原）。两层修复：
   - 归一化 moveFiles 后，凡文件名与 plan 集数映射不一致（agent 识别的怪名、"第N集"季盲名）
     一律改名为规范 `Title.SxxEyy.ext`——路径上下文随 move 消亡，身份必须写进文件名。
   - 季目录列举带救援：未解析视频触发识别 agent 一次确认→改名永久确定；未确认的不动，
     出 `unparsed_files_present` 警告。
3. **库页列全部追踪季 + 视觉走查**（5dd7ca1）：全部追踪网格（按剧分组、季状态徽章、进度、
   深链）；聚光灯优先 active 季；通知面板改读真实 feed（原是硬编码 demo 文案）。
   走查发现并修复：/notifications 与 /show 没有侧边栏却用 app-shell 网格被挤进 264px 列
   ——抽 AppSidebar 共享组件三页挂载。系列持久化通知改为只写首季记录（原先每季一份重复）。
4. **El Camino 确认入库流**（e7bda59）：plan 结构化 `foreignWorkFiles`；
   audit `foreign_work_detected` + 一等 feed 通知（kind 同名，"去处理"链接）；
   `importForeignWorkAsMovie` 命令（用户定名/年份→find-or-create Movies 目录→move→单视频
   规范改名）；`/foreign-work/[runId]` 确认页（隔离文件清单+表单+server action）。
   电影父目录 env `MEDIA_TRACK_MOVIES_PARENT_CID`（回落 test root）。
   package-init 顺带修复：通知改真实时间戳（原 FIXED_CREATED_AT）、只写首季。

新增踩坑教训：
9. **app-shell 网格页面必须带 sidebar**：`grid-template-columns: 264px 1fr` 下无 sidebar
   的 main 会落进窄列。新页面用 `<AppSidebar active=...>`。
10. **fake 三层文件状态**：FakeStorageExecutor 现有 directories（VerifiedFile）/
    unparsedFiles（无集数标识视频）/ packageTrees（staging 树）三层；moveFiles 三层都搬，
    renameFile 解析新名后在 unparsed↔verified 间晋升。写测试先想清文件该放哪层。

## 2026-06-13 第三轮：前端 IA 重构 + TMDB + 推送 + 扫码（f8f6b20..7b33e12）

计划文档：`docs/superpowers/plans/2026-06-13-frontend-ia-tmdb-push-qrlogin.md`（S1-S7 全完成）。
调研：`docs/research/2026-06-13-overseerr-ia-patterns.md`（源码级，驱动页面结构）。

1. **标题级 IA**（f8f6b20）：媒体库 = 海报墙（右上 mini 状态徽章 绿✓全入库/靛·追更/琥珀·缺集）；
   `/show/[tmdbId]` 单一规范标题页（backdrop hero + 海报 + 聚合徽章 + overview + 季行内列表：
   per-季徽章/进度/已追踪季 `<details>` 展开集 chips/未追踪季"获取本季"按钮 + 顶部"获取全剧/剩余"）；
   旧 per-季路由 redirect；搜索结果带真海报 + "已在库"徽章，与库页汇聚同一标题页。
   **获取剩余** = series init 只传未追踪季数组（锁自然挂数组首季；reconcile 保证重叠无害）。
   MediaTitle 持久化 posterPath/backdropPath/overview（JSON payload 免迁移）；旧标题海报
   经 6h 缓存的 series-target 懒补。next.config 加载仓库根 .env；`MEDIA_TRACK_SEARCH_PROVIDER=tmdb`
   已开，搜索/标题页/海报墙全部 live 实测通过（黑袍/V世代/恶魔）。
2. **推送渠道**（a8ebd81）：notify.ts NotifyChannel + Bark/Server酱Turbo/企微机器人/通用 webhook
   四 adapter（fetch 注入可测）；env `MEDIA_TRACK_PUSH_BARK_KEY/_SERVERCHAN_SENDKEY/
   _WECOM_WEBHOOK/_WEBHOOK_URL`；worker 入口跑完按时间水位推送本次新通知，失败只记日志。
3. **115 扫码登录**（7b33e12）：Pan115QrLoginClient 三步流（默认 alipaymini，长轮询缺 status=等待）；
   repository 加 getSetting/setSetting（sqlite app_settings 表）；扫码确认后 cookie+meta 落库并
   立即生效（执行器每次从 process.env 现建），worker 入口 hydrate（DB 赢过 .env 兜底）；
   `/settings` 页（状态徽章 + 客户端类型下拉 + 官方 QR PNG 代理）+ `/api/115/qrcode{,/status,/confirm,/image}`；
   侧边栏健康卡链接 /settings。Live 实测到真实二维码渲染+轮询；**手机扫码确认一步待用户验收**。

新增踩坑教训：
11. **管道吞 exit code**：`npm test | tail` 的退出码是 tail 的——提交前用
    `npm test > /dev/null && echo GREEN` 之类确认真实状态（这轮曾因此带挂测试提交过一次）。
12. Next 只自动加载 app 目录 .env；本仓配置全在根 .env，由 next.config.ts 启动时注入
    （`??=` 不覆盖已有 env）。

4. **搜索语义打磨**（4f377dc，用户走查反馈）：卡片动作状态驱动——已库"查看详情"/
   未追踪单季"获取"/未追踪多季"获取所有季"+选季下拉（"获取全剧"措辞废弃）；meta 干掉集数与
   TMDB id，改"共 N 季"+具体入库情况（全 N 季已获取 / 第 X、Y 季已获取 / 第 Z 季追更中）；
   标题页侧边栏不再假装在媒体库（active=none），返回控件 history-aware；单季剧隐藏顶部主按钮。

## 待办（按价值排序）

1. **115 扫码全链验收**：用户手机扫 /settings 二维码确认 → cookie 入库 → 跑一次 worker
   验证 DB cookie 生效。注意风控：不要反复重登（锁到次日零点）。
2. **推送渠道配置**：.env 填 `MEDIA_TRACK_PUSH_BARK_KEY` 等任一渠道后即生效；
   日报式 digest 汇总（现在是逐条推）可后续优化。
3. 杂项：staging 空目录清理策略；Postgres 迁移（远期，repository 合同已就位；本机 OrbStack
   可用，已有 postgres:17-alpine 镜像）；多语言关键词策略持续打磨；
   `.claude/launch.json` 已配 preview dev server（live series DB + 关 demo seed）；
   电影类内容的搜索/获取（现在 hub/wall 只做 tv）。

## Git 状态

分支 `codex/workflow-kernel-p0`（master 未合并）。弧线：
planning-agent 重构（7dfe4b0..0528da3）→ 生产化三件套+前端（49508bd..a05ac6d）→
标题级系列初始化 S1-S8（0ab9283..d3965ce）→ 第二轮清待办（d49f3c9..e7bda59）→
第三轮 IA/TMDB/推送/扫码（f8f6b20..7b33e12）。工作树干净。
