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

## 待办（按价值排序）

1. **系列初始化前 reconcile 存量**：runSeriesInitialization/Type2 目前不盘点 season 目录已有内容，
   幂等重跑会重复转存（115 秒传无带宽代价但浪费 API 调用，靠去重收敛）。应像 Type 3 一样先
   listVideoFiles 各季、把已有集从需求集剔除。Live 黑袍第二轮暴露。
2. **通知投递渠道**：日报数据源已就绪（listNotifications + /notifications 页）；缺推送
   （webhook/Telegram/邮件，选型未定）。Type 3 sweep 后的 digest 汇总文案可考虑 NotificationAgent
   （模板够用前不急）。
3. **El Camino 交互式入库**：foreignWorkProviderFileIds 已标记并出警告；缺"提示用户→确认→
   作为电影单独入库"的 UI/命令流。
4. **115 连接流程产品化**：现在是 .env 手填 cookie；产品形态见架构文档"115 Account Connection
   Strategy"（开发期 Cookie Manager 扩展 → 一方扩展配对 → web 原生 QR）。
5. **前端视觉走查**：agent-browser/playwright 过一遍三个页面（重设计后没做过截图级检查）；
   库页目前只展示第一个追踪季，应列全部（listTrackedSeasonStates 已有数据）。
6. **未解析文件名曝光**：执行器对解析不出集数的视频文件不可见（不进 VerifiedFile）——
   它们无法被验证/标记/去重。需把未解析文件以独立形态曝光并接 PackageRecognition 救援。
7. 杂项：staging 空目录清理策略；`.media-track-live-*.sqlite` 本地试验库可删；
   Postgres 迁移（远期，repository 合同已就位）；多语言关键词策略持续打磨。

## Git 状态

分支 `codex/workflow-kernel-p0`（master 未合并）。今天两大弧线共 ~35 commits：
planning-agent 重构（7dfe4b0..0528da3）→ 生产化三件套+前端（49508bd..a05ac6d）→
标题级系列初始化 S1-S8（0ab9283..d3965ce）。工作树干净。
