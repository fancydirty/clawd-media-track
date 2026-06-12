# Title-Level Series Initialization & Staging Unification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps. This plan spans multiple context windows — it is the source of truth for continuation.

**Goal:** "获取全剧" end-to-end as product: title-level need set across seasons (completed + ongoing), heterogeneous resources (season packs / complete packs / mixed packs / single episodes) absorbed by ONE path: every transfer lands in staging → package normalization distributes into canonical `Title (Year)/Season N` → per-season dedup → per-season persistence (completed seasons `completed`, airing season `active` for Type 3). Plus notifications tab (date-grouped digest feed), El Camino foreign-work flagging, and live validation with a real airing US multi-season show.

**User decisions locked:** 统一走 staging（单集资源也走，不直落 Season 目录）；不预建空季目录；剧目录必须 find-or-create 复用（修同名重复 bug）；通知页 = 按日期分隔的日报式 feed（先调研 awesome-design-md/GitHub 轮子）；live 测试资源需自行搜索（美剧、多季、最新季在更）。

## Phase S1: directory find-or-create + fake storage coherence
- `Storage115Executor.createDirectory`: list parent first, reuse existing same-name directory id (idempotent). `FakeStorageExecutor.createDirectory`: same semantics keyed (parentId, name) — fixes `Title (Year)` duplication when seasons initialize at different times.
- Fake coherence: `listTree` must also surface files living in `directories[dirId]` (VerifiedFile → {path: name, providerFileId: id, sizeBytes}; merged with configured packageTrees). `moveFiles` must relocate VerifiedFile entries across `directories` by id as well. (Today fake transfer materializes into `directories`, but listTree only reads `packageTrees` — staging flow needs them coherent.)

## Phase S2: multi-season planning contract
- `AcquisitionPlanningInput`: replace `seasonNumber`/`latestAiredEpisode` with `seasons: Array<{seasonNumber,totalEpisodes,latestAiredEpisode}>` (Type2/3 pass one-element array). Update spec prompt: multi-season need set; candidates may cover multiple seasons (complete packs, mixed packs) — map all covered episode codes.
- `validateAcquisitionPlan`: `seasonNumber` → `seasonNumbers: number[]` membership check. `deriveAgentDecision` providerAhead split needs per-season latestAired — pass seasons array.
- FakeAgentNodes.planAcquisition unchanged logic (episodeHints already carry full codes).

## Phase S3: staging-unified acquisition core
- Rewrite `acquireMissingEpisodes`: per selected candidate → `createDirectory(name: staging-<runId>-<index>, parent: showDirectoryId)` → transfer into staging → after pass: for each staging, `listTree` → `buildAgentAssistedPackageNormalizationPlan` (seasons from workflow) → find-or-create `Season N` dirs under show dir → `moveFiles` per season → compute still-missing from per-season `listVideoFiles`. Rejected files stay in staging (audit `package_files_rejected`).
- Type 2/3 stop calling `flattenDirectory` (normalization subsumes it). Workflow needs `showDirectoryId` — Type2: from ensureLandingDirectory (which now returns/records show dir too); Type3: derive via season dir's parent? Simpler: staging dirs under `storageParentDirectoryId` when show dir unknown (Type3 input gains optional showDirectoryId/storageParentDirectoryId; fall back to season dir parent not available → require storageParentDirectoryId for staging; worker/web thread it — already have env).
- Unparseable transferred file → stays in staging → episode not obtained → existing failure-evidence loop handles retry honestly. Duplicate-mapping conflicts → recognition agent (existing).
- Update type2/type3/worker/commands tests for new flow (no flatten; staging dirs; transfer outcomes still keyed by candidate id but files now land in staging then move).

## Phase S4: runSeriesInitialization (title-level)
- Input: title, seasons[] metadata, storageParentDirectoryId, providers/agents/storage, runId, qualityPreference, maxPlanningPasses.
- Need set = per-season aired episodes. Reuses S3 core with multi-season seasons array. Per-season dedup (agent-confirmed) after moves. Per-season reconcile; season.status completed when latestAired==total else active. Persist per-season snapshots kind `type1_package_init` (reuse) or new `series_init` — keep `type1_package_init`.
- Existing `runSeriesPackageInitialization` (staging-only normalizer of an EXISTING pack dir) remains as inner utility; series init = acquisition + that machinery.

## Phase S5: product layer
- `prepareSeriesTarget(tmdbId)` (tmdb-provider): title + all seasons metadata (loop seasons 1..N from details).
- Command `queueSeriesInitialization` (reservation per season? reserve season 1 as the lock + audit keyword) — simpler: reserve ALL season runs upfront (`<runId>_s<n>` each kind type1_package_init, status queued on season 1 only as the claimable). Pragmatic: single queued run on the title's FIRST season carries `series_init` audit data (tmdbId, seasonCount); worker claims it and runs runSeriesInitialization for the whole title.
- Worker: `runQueuedSeriesInitialization` mirroring type2 worker (claim kind type1_package_init queued runs).
- Web: candidate card gains second action "获取全剧" for multi-season tv (server action → queueSeriesInitialization); existing per-season button stays.
- Detail route shows seasons of the title (list each tracked season).

## Phase S6: notifications tab (日报 feed)
- Research first: awesome-design-md (linear.app changelog aesthetics) + GitHub activity-feed/changelog patterns; pick date-grouped timeline: sticky date headers (今天/昨天/6月12日), per-day deterministic summary line ("3 部剧更新，12 集入库"), entries = notification cards (kind icon + title + body + time), Spotify tokens.
- Backend: `WorkflowRepository.listNotifications({limit, before?})` (in-memory + sqlite: notifications ordered by createdAt desc, join run kind/title). Type 3 digest = computed at read time by date grouping (no stored digest yet; NotificationAgent future).
- Web: nav "通知" tab → `/notifications` route (Suspense + skeleton), date grouping server-side.
- NOTE: workflow notifications currently use FIXED_CREATED_AT placeholder — switch to real now() injection (workflow inputs gain now?: () => string; runner passes real time) so the feed has true dates. Update tests using fixed now.

## Phase S7: El Camino foreign-work flag
- packageRecognitionSchema + PackageRecognitionDecision gain optional `foreignWorkProviderFileIds: string[]` (files judged to belong to a DIFFERENT title). Spec prompt: classify rejected files; do not map them. Plan warnings include "可能属于其他作品" entries; series-init notification body mentions count. No auto-import (future interactive flow).

## Phase S8: live validation
- Find target: US drama, multi-season, latest season airing 2026-06, rich PanSou results. Try 黑袍纠察队 (The Boys S5 2026) first via PanSou + TMDB (tv id 76479); fallbacks: search PanSou for airing US shows. Then `scripts/live-series-init.mjs --tmdb <id>` full chain in test root. Also re-verify mixed-pack handling (the candidate pool likely has S1-4 packs + S5 partials — the whole point).
- Verify: per-season dirs, ongoing season active + Type 3 sweep picks it up, notifications feed shows the run.

## Status log (update as phases complete)
- [ ] S1 ... [ ] S8
