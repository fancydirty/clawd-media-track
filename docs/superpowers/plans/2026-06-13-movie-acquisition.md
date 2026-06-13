# 电影获取工作流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在前端点击某部电影后，后台搜索 pansou → agent 找对电影（防翻拍混淆）→ 转存到 115 `Movies/Title (Year)/` → 验证单视频文件入库，媒体库"电影"分类可主动获取。

**Architecture:** 电影是一次性获取（type1 语义，无追踪）。复用现有 title + 单条"季"锚点做持久化与 UI（零新仓库/UI 代码），但用**专属的 `runMovieAcquisition` 工作流**处理与剧集不同的部分：电影目录布局、单视频选择、防翻拍标题校验。系列电影各论各——每部电影是独立搜索候选，无批量获取。

**Tech Stack:** TypeScript（workflow 包，strict + exactOptionalPropertyTypes）、Vitest TDD、Next 16（apps/web）、115 storage executor、TMDB metadata、PanSou 资源、Vercel AI agent 节点。

---

## 关键设计抉择（实现前请 review）

**电影怎么建模持久化？** 两条路：

- **A（推荐）—— 电影 = title + 单条"季"锚点。** `title.type="movie"`，持久化一条 `TrackedSeason`（seasonNumber=1, totalEpisodes=1, status=`completed`, latestAiredSource=`manual`），其"集" `M01` 即影片本身。**复用全部现有基础设施**：仓库、媒体库海报墙（已按 type 分类）、通知（`buildMovieReport` 已存在）、`importForeignWorkAsMovie` 的移动+改名逻辑。Type 3 sweep 自然跳过它（status≠active）。唯一"装"的地方是 totalEpisodes=1 这个锚点——但它不暴露给用户，用户看到的是"已入库"。
- **B —— 全新 `TrackedMovie` 平行类型。** 语义最干净，但要复制仓库方法、海报墙、通知聚合、reserve 锁等一大堆。违背 YAGNI，工作量数倍于 A。

**推荐 A**：差异真正在"工作流 + agent + 目录布局"，那几块新建；持久化/UI 没必要平行。下面的任务按 A 写。**若你要 B，告诉我，我重排计划。**

**边界（你定的）**：电影已上映但暂无资源 → 退化为 no_coverage（像缺集），下次重试即可，仍不引入追踪循环。

---

## File Structure

- **Create** `packages/workflow/src/movie-workflow.ts` — `runMovieAcquisition`（搜索→agent→转存→Movies 目录→验证单视频）。
- **Create** `packages/workflow/src/movie-plan-validation.ts` — `validateMoviePlan`（单选择、无集覆盖校验）。
- **Modify** `packages/workflow/src/ports.ts` — `AcquisitionPlanningInput` 加 `mediaType` + 可选 `movieTitle`；`AgentNodes.planMovieAcquisition`（或复用 planAcquisition 带 movie 上下文——见 Task 2 抉择）。
- **Modify** `packages/workflow/src/agent-nodes/acquisition-planning-agent.ts` — 电影判断 prompt（防翻拍标题匹配 + 单视频 + 最高质量）。
- **Modify** `packages/workflow/src/commands.ts` — `queueMovieAcquisition`（reserve 单"季"锚点，复用 title 锁）。
- **Modify** `packages/workflow/src/runner.ts` — `runMovieAcquisitionAndPersist`。
- **Modify** `packages/workflow/src/worker.ts` — `runQueuedMovieAcquisition`（claim kind `movie_init`）。
- **Modify** `packages/workflow/src/domain.ts` — `WorkflowKind` 加 `"movie_init"`；电影"季"锚点 helper。
- **Modify** `apps/web/lib/workflow-runtime.ts` — `parseMediaCandidateId`（认 `tmdb_movie_<id>`）、电影分支 queue、worker 入口接 `runQueuedMovieAcquisition`。
- **Modify** `apps/web/app/page.tsx` + `apps/web/app/actions.ts` — 电影候选已用 `RequestTrackButton`，确认 action 走电影分支。
- **Tests**：`movie-plan-validation.test.ts`、`movie-workflow.test.ts`（用 Fake provider/storage/agents）、`commands` 电影 reserve 测试。

---

## Tasks

### Task 1: WorkflowKind + 电影"季"锚点

**Files:** Modify `packages/workflow/src/domain.ts`；Test `packages/workflow/tests/movie-anchor.test.ts`

- [ ] **Step 1: 失败测试** — `movieAnchorSeason({titleId, qualityPreference, storageDirectoryId})` 返回 seasonNumber=1, totalEpisodes=1, status=`completed`, latestAiredSource=`manual`，id=`${titleId}_movie`。
- [ ] **Step 2: 跑测试确认 RED**（函数不存在）。
- [ ] **Step 3: 实现** `movieAnchorSeason` + `WorkflowKind` 加 `"movie_init"`。
- [ ] **Step 4: GREEN** + 全量 `npm test`。
- [ ] **Step 5: commit** `feat(movie): workflow kind + movie season anchor`。

### Task 2: 电影 planning agent 契约 + prompt

**抉择**：复用 `planAcquisition`（input 加 `mediaType:"movie"` + `movieTitle`，输出复用但 disposition 不带 episodes）还是新建 `planMovieAcquisition`。**推荐新建** `planMovieAcquisition`——电影判断维度（防翻拍标题匹配、单视频、质量）与集映射本质不同，硬塞一个 agent 会让 prompt 精分（违背 agent 设计原则：禁机械套用）。

**Files:** Modify `ports.ts`（`AgentNodes.planMovieAcquisition`、`MoviePlanningInput/Result` 类型）、`agent-nodes/acquisition-planning-agent.ts`（导出 `MOVIE_PLANNING_AGENT_SPEC`）、`fakes.ts`（`FakeAgentNodes.planMovieAcquisition`）。

- [ ] **Step 1:** 定义 `MoviePlanningInput { movieTitle; year; tmdbId; keyword; searchedSnapshots }` 与 `MoviePlanningResult { selectedSnapshotId; selectedCandidateId; quality; singleVideoConfirmed; rejected: {id,reason}[] }`。
- [ ] **Step 2:** `MOVIE_PLANNING_AGENT_SPEC.system` 首版（防翻拍是重点）：

```
You are choosing ONE resource that is exactly the target movie.
Hard rules (evidence-first, every decision cites the candidate):
- IDENTITY: the candidate must be THIS movie — same work, not a remake,
  sequel, or same-IP different film. Cross-check the title AND year against
  the target ({movieTitle} ({year})). Reject "蝙蝠侠：黑暗骑士崛起" when the
  target is "蝙蝠侠：黑暗骑士". When unsure, reject and say why.
- SINGLE VIDEO: a movie is one file. Reject packs, collections, multi-part,
  or season/episode-structured resources.
- QUALITY: among confirmed single-file matches, prefer the highest quality
  (4K/UHD > 1080p > 720p) stated transparently in the title.
- NO DISCOVERY TRANSFERS: title + size are the evidence; never transfer to
  inspect. Empty selection = honest no_coverage.
```

- [ ] **Step 3:** `FakeAgentNodes.planMovieAcquisition` 返回最小覆盖选择（最大候选）。
- [ ] **Step 4:** typecheck + 全量测试。
- [ ] **Step 5: commit** `feat(movie): planning agent contract + prompt`。

### Task 3: 电影 plan 校验器

**Files:** Create `packages/workflow/src/movie-plan-validation.ts`；Test `movie-plan-validation.test.ts`。硬规则转校验器（设计原则）。

- [ ] **Step 1: 失败测试**：选中候选必须在快照中观测到（防证据截断）；恰好一个选择；空选择=honest no_coverage（返回 null，不报错）；拒绝 episodes 字段（电影不该有）。
- [ ] **Step 2: RED**。
- [ ] **Step 3:** 实现 `validateMoviePlan({plan, snapshots}) → {selectedCandidate|null}`：快照观测校验 + 单选择，不查集覆盖。
- [ ] **Step 4: GREEN**。
- [ ] **Step 5: commit** `feat(movie): plan validation`。

### Task 4: runMovieAcquisition 工作流内核

**Files:** Create `packages/workflow/src/movie-workflow.ts`；Test `movie-workflow.test.ts`（Fake provider/storage/agents）。复用：staging 转存、`importForeignWorkAsMovie` 的 move+rename、dedup。

- [ ] **Step 1: 失败测试**：给定一个匹配电影的 fake 候选 + transfer 产出单视频 → 结果 status=`acquired`、Movies 目录有一个规范命名 `Title (Year).ext`、notification.report 用 `buildMovieReport`。第二测试：无匹配候选 → no_coverage。
- [ ] **Step 2: RED**。
- [ ] **Step 3:** 实现流程：find-or-create `Movies/Title (Year)` → staging 转存选中候选 → listTree 快照 → 移动单视频到电影目录 → 单视频改名规范 → dedup（同片留最大）→ 验证恰好一个视频。失败证据闭环（maxPlanningPasses=2，无机械 fallback）。
- [ ] **Step 4: GREEN** + 全量测试。
- [ ] **Step 5: commit** `feat(movie): acquisition workflow kernel`。

### Task 5: 命令 + worker + runner

**Files:** Modify `commands.ts`（`queueMovieAcquisition` reserve movie 锚点 + title 锁）、`runner.ts`（`runMovieAcquisitionAndPersist`）、`worker.ts`（`runQueuedMovieAcquisition` claim `movie_init`）。Test：reserve 幂等 + 队列 claim。

- [ ] **Step 1: 失败测试**：`queueMovieAcquisition` 两次同片 → 第二次 already_running（title 锁）；worker claim 后跑 `runMovieAcquisition` 并持久化 status completed。
- [ ] **Step 2: RED → Step 3 实现 → Step 4 GREEN**。
- [ ] **Step 5: commit** `feat(movie): command + worker + runner`。

### Task 6: web 接线（前端 → 命令）

**Files:** Modify `apps/web/lib/workflow-runtime.ts`（`parseMediaCandidateId` 认 `tmdb_movie_<id>`；电影分支调 `queueMovieAcquisition`；`runNextQueuedWorkflow` 链上 `runQueuedMovieAcquisition`）、`apps/web/app/actions.ts`（`requestTrackAction` 电影分支）、`apps/web/app/page.tsx`（确认电影候选 `RequestTrackButton` 走通）。

- [ ] **Step 1:** `parseMediaCandidateId` 单测（tv/movie/非法）。
- [ ] **Step 2: 实现** 解析 + 电影 queue 分支 + worker 链。
- [ ] **Step 3:** web typecheck。
- [ ] **Step 4: 预览验证**（preview）：搜一部电影 → 点"获取" → 媒体库出现"获取中"占位（active run）→ 队列脚本/手动 run-next 后变"已入库"卡片。**注意**：会触发真实 pansou/115，仅用 115 test root。
- [ ] **Step 5: commit** `feat(movie): wire frontend → movie acquisition`。

### Task 7: Live 验证（用户在场）

- [ ] 先只读 `pan115` 列 `Movies` 父目录（`MEDIA_TRACK_MOVIES_PARENT_CID`，无则 test root）看现状，别 DDOS（默认调用预算/间隔已配）。
- [ ] 跑一部小体积电影全链（如某独立电影 tmdb id），确认 `Movies/Title (Year)/Title (Year).ext` 落盘 + 媒体库电影卡 + 通知 `已获取入库`。
- [ ] **绝不碰 clawd-media（cid 3339812358359874597）**；只用 test root 3351918746607287913。
- [ ] 防翻拍冒烟：搜一个有翻拍/同名的片（如某经典重拍），确认 agent 选对年份/版本，选错则迭代 prompt。

---

## 动漫的对照说明（不在本 plan 实现，单列以免遗漏）

动漫的获取**完全复用电视剧链路**（有季/集），无需新工作流——anime 判定（T4）已让 `title.type=anime`。动漫真正要单独做的是**落盘与展示分离**：
- 115 目录：独立 `Anime` 父目录（env `MEDIA_TRACK_ANIME_PARENT_CID`），而非 TV_SHOWS 下。需在 `ensureLandingDirectory`/storageParent 选择处按 `title.type==="anime"` 路由父目录。
- 前端：媒体库"动漫"分类已就位（T4 + 现有海报墙按 type 分组）。
这块建议作为 T3 之后的小切片（仅父目录路由 + 验证），不与电影工作流耦合。

---

## Self-Review

- **Spec 覆盖**：电影证据先行（Task 2 prompt + Task 7 防翻拰冒烟）、单视频（Task 2/3/4）、系列各论各（天然——每片独立候选，无批量）、Movies 目录布局（Task 4）、live 测试目录约束（Task 7）。✓
- **类型一致**：`movie_init` kind 贯穿 domain/commands/worker；`MoviePlanningInput/Result` 在 ports 定义、agent/fakes/validation/workflow 一致引用。
- **未决**：关键设计抉择 A vs B 待用户确认；动漫父目录路由单列为后续切片。
