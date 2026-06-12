# Series Package Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Wire the (currently orphaned) package normalizer into a real workflow: a complete-series pack lands in a staging directory, gets tree-snapshotted, normalized into canonical `Title (Year)/Season N/` via deterministic parse + conditional agent recognition, moved, verified per season, and persisted as N tracked seasons. Then validate live against the real 214G Breaking Bad pack already sitting in the 115 test root (`pack-explore-breaking-bad-*` = cid 3449811722020323062, TMDB tv/1396, 5 seasons).

**Agent invocation principle (user-confirmed):** the workflow — never the planning agent — decides when the recognition agent runs. Triggers are mechanically detectable: deterministic plan confidence "low" (today's trigger in `buildAgentAssistedPackageNormalizationPlan`), driven by unparsed video files / duplicate mappings / season-episode conflicts. Well-named packs complete with zero agent calls; rejected files (documentary, El Camino movie, posters) stay in staging and are audited, never guessed.

---

### Task P1: StorageExecutor tree snapshot + move primitives

**Files:** `ports.ts`, `fakes.ts`, `storage-115-executor.ts`, `pan115-cookie-client.ts`(no change expected — listItems/moveItems exist), tests.

- `StorageExecutor.listTree(input: { directoryId: string; maxDepth?: number }): Promise<PackageTreeFile[]>` — recursive walk preserving relative paths (`pack/Season S01(2008) 4K/file.mkv`), all files (normalizer filters video itself), guard-budgeted, default maxDepth 6.
- `StorageExecutor.moveFiles(input: { fileIds: string[]; targetDirectoryId: string }): Promise<{ moved: string[] }>` — write-scope-asserted on target, uses moveItems.
- FakeStorageExecutor: constructor gains `packageTrees?: Record<string, Array<PackageTreeFile & { episodeCode?: string }>>`; listTree returns them; moveFiles relocates matching tree files into the target directory's VerifiedFile list (fixture-declared episodeCode is the ground truth; files without one are invisible to listVideoFiles — mirrors real executor).
- TDD: fake tests (tree returned, moves materialize for verification) + 115 executor tests (listTree walks nested dirs via FakePan115Api, respects maxDepth; moveFiles asserts scope and calls moveItems).

### Task P2: runSeriesPackageInitialization workflow + persistence

**Files:** `workflow.ts` (or new `package-init.ts`), `runner.ts`, `domain.ts` (WorkflowKind + "type1_package_init"), `index.ts`, tests.

Contract `runSeriesPackageInitialization(input)`:
- input: `{ title: MediaTitle; seasons: Array<{seasonNumber,totalEpisodes,latestAiredEpisode}>; stagingDirectoryId; storageParentDirectoryId; storage; agents; workflowRunId?; qualityPreference? }`
- steps: listTree(staging) → `buildAgentAssistedPackageNormalizationPlan({title, year, files, totalSeasons, agents})` → audit `package_plan_created` (actions/rejected/warnings; agent involvement visible) → create `Title (Year)` + per-season `Season N` dirs (only seasons present in plan actions) → group actions by season → moveFiles per season → per-season listVideoFiles → reconcile episode states (per-season TrackedSeason `\${title.id}_s\${n}` w/ storageDirectoryId) → audit per-season verification.
- result: `{ status, seasons: Array<{season, episodes, obtainedEpisodes}>, rejectedFiles, warnings, notification, auditEvents }`; status succeeded only when every input season verified fully (completed series: obtained == total); partial otherwise; rejected files NEVER moved or deleted — they remain in staging, listed in the notification body.
- `runSeriesPackageInitializationAndPersist`: one workflowRun id per season (`\${runId}_s\${n}`), kind `type1_package_init`, persists each season snapshot via repository.
- TDD fixture mirrors the real pack: 5 season folders with SxxExx files + a documentary mkv (unparsable) + a movie mkv → expect: all episodes planned, doc+movie in rejectedFiles, dirs created canonically, episode states obtained per season. Plus an agent-assist fixture: bare-number anime naming (deterministic low) → FakeAgentNodes packageRecognition mapping drives the plan.

### Task P3: live validation script + run

- `scripts/live-package-init.mjs`: args `--tmdb 1396 --staging <cid> --seasons 5`; seasons metadata via TMDB provider (prepareTrackingTarget per season for totals); storage = protected executor; agents = Mimo; repository = fresh sqlite `.media-track-live-package.sqlite`; prints plan summary (actions count per season, rejected files), then executes and prints per-season verification + final tree of `绝命毒师 (2008)/`.
- Expected live outcome: 62 episodes moved into Season 1..5, documentary + El Camino + jpg/nfo remain in staging, zero deletions.

### Final: full suite + typecheck + builds green; commit per task; update memory.
