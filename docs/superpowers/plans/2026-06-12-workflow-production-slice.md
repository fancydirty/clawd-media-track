# Workflow Production Slice: Dedup, Type 3 Worker, Canonical Directories

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three gaps blocking unattended production use: duplicate cleanup after overlap-friendly acquisition, a scheduled Type 3 entrypoint, and workflow-owned canonical landing directories.

**Architecture:** All three are deterministic workflow responsibilities. Dedup follows skill Rules 1-6 (flatten first, group by episode, ALWAYS keep larger, delete only from a verified snapshot, re-verify after). The Type 3 worker iterates persisted tracked seasons with idempotent reservations. Canonical `Title (Year)/Season N` creation becomes the workflow's first step so the flatten safety rule is satisfied by construction.

**Tech Stack:** existing TypeScript kernel, Vitest, no new deps.

---

### Task A: Deterministic Dedup Step

**Files:** Create `packages/workflow/src/dedup.ts`, `packages/workflow/tests/dedup.test.ts`; modify `workflow.ts`, `index.ts`, type2/type3 tests.

Contract `buildDedupPlan(input: { files: VerifiedFile[] })`:
- group by `episodeCode`; groups with >1 file → keep the LARGEST `sizeBytes` (tie: keep first by id order), others → delete
- returns `{ duplicateGroups: Record<episodeCode, fileIds[]>, deleteFileIds: string[], keepFileIds: string[] }`
- never returns the sole file of an episode in deleteFileIds (structural)

Workflow integration (both Type 2 and Type 3), after flatten + final list:
- `plan = buildDedupPlan({files})`; if `deleteFileIds.length > 0` → audit `dedup_plan_created` → `storage.deleteFiles({directoryId, fileIds})` → re-list → assert no group >1 (else audit `dedup_verification_failed`, status stays honest) → audit `dedup_verified`
- reconcile episode states from the POST-dedup listing
- no-op when no duplicates (audit nothing or `dedup_noop` not required)

Note: files whose episode cannot be parsed are invisible to the executor today; agent-assisted name rescue is a separate follow-up slice, not this task.

Steps: failing unit tests (keep-larger incl. the 生命树 lesson: old 1.2GB beats new 0.8GB; tie; single files untouched) → implement dedup.ts → failing workflow test (Type 3 with duplicate E13 from overlapping packs → smaller deleted, episode still obtained, audits present) → wire workflow.ts → full suite → commit.

### Task B: Scheduled Type 3 Worker

**Files:** Create `packages/workflow/tests/type3-worker.test.ts`; modify `worker.ts`, `index.ts`, `apps/web/app/api/workflows/` (new `run-type3/route.ts` mirroring run-next), `apps/web/lib/workflow-runtime.ts`.

Contract `runScheduledType3Monitoring(input: { repository, resourceProvider, storage, agents, now?, staleActiveRunTimeoutMs?, maxSeasons? })`:
- `listTrackedSeasonStates()`; for each season with `status === "active"` and episodes present:
  - `reserveWorkflowRun({ kind: "type3_monitor", status running snapshot, blockIfEpisodeStatesExist: false, staleActiveRunStartedBefore })`
  - `already_active` → record `{trackedSeasonId, status: "skipped_active"}`
  - reserved → `runType3MonitoringAndPersist` with keyword `${title} ${qualityPreference}`; failure → persist failed snapshot (mirror type2 worker catch) and continue to next season
- returns per-season outcomes `{ trackedSeasonId, status: "ran" | "skipped_active" | "failed", workflowStatus?, errorMessage? }[]`
- web route POST /api/workflows/run-type3 guarded by MEDIA_TRACK_WORKER_SECRET, same adapter wiring as run-next

Steps: failing worker tests (repairs a season with missing episodes; skips seasons already current → workflowStatus succeeded noop; skips active reservation; isolates one season's failure) → implement → route + runtime function `runScheduledType3()` → full suite → commit.

### Task C: Canonical Landing Directory Creation

**Files:** modify `workflow.ts`, `runner.ts`, `worker.ts`, `commands.ts` (thread-through), `tmdb-provider.ts` (storageDirectoryId optional), `apps/web/lib/workflow-runtime.ts`, `.env.example`; tests across type2/runner/worker/commands.

Contract:
- `TrackedSeason.storageDirectoryId === ""` means "not yet created"
- `runType2Initialization` gains optional `storageParentDirectoryId`; when season.storageDirectoryId is empty: create `${title} (${year})` under parent, then `Season ${n}` under it, audit `landing_directory_created` (both cids), proceed with updated season
- empty id + no parent → throw `MEDIA_TRACK_STORAGE_PARENT_REQUIRED`
- `WorkflowResult` gains `season: TrackedSeason` (the possibly-updated one); runner persists `result.season`
- worker `runQueuedType2Workflow` + web runtime pass `storageParentDirectoryId` from env `MEDIA_TRACK_TV_PARENT_CID` (falls back to `MEDIA_TRACK_115_TEST_ROOT_CID`)
- `prepareTrackingTarget` accepts optional storageDirectoryId (default "")
- Type 3 with empty storageDirectoryId → no_coverage-style guard: throw (tracking not initialized)

Steps: failing type2 test (empty id → two createDirectory calls with canonical names, season persisted with new cid, transfers land there) → implement → thread runner/worker/commands/web → update .env.example → full suite + build:web → commit.

### Final: full verification

`npm test && npm run typecheck && npm run build:workflow && npm run build:web`, docs note in architecture doc (dedup + scheduler + directory ownership), commit.
