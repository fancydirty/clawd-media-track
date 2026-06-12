# Web Persistence And Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the web product surface from demo-only state to SQLite-backed tracking requests, queued workflow runs, and a background worker tick.

**Architecture:** Keep Next.js pages as Server Components that read from a lazy server runtime. Server Actions perform short mutations only: resolve a candidate, reserve a queued workflow run, and return UI state. Long Type2 work runs outside the browser request through a worker function that claims queued runs and calls the existing workflow runner with injected adapters.

**Tech Stack:** TypeScript, Vitest, Next.js App Router, SQLite via `node:sqlite`, existing workflow package ports and fake/live adapters.

---

### Task 1: Repository Read/Claim Contract

**Files:**
- Modify: `packages/workflow/src/repository.ts`
- Modify: `packages/workflow/src/sqlite.ts`
- Modify: `packages/workflow/tests/repository.test.ts`
- Modify: `packages/workflow/tests/sqlite-repository.test.ts`

- [x] Add repository methods for `listTrackedSeasonStates()` and `claimNextQueuedWorkflowRun(...)`.
- [x] Test in-memory and SQLite implementations.
- [x] Verify `npm test -- packages/workflow/tests/repository.test.ts packages/workflow/tests/sqlite-repository.test.ts`.

### Task 2: Queue-Only Tracking Command

**Files:**
- Modify: `packages/workflow/src/commands.ts`
- Modify: `packages/workflow/tests/commands.test.ts`

- [x] Add `queueTrackingInitialization(...)` that reserves a `queued` Type2 run and does not search resources or touch storage.
- [x] Keep existing `requestTrackingInitialization(...)` for immediate runner tests/CLI compatibility.
- [x] Verify `npm test -- packages/workflow/tests/commands.test.ts`.

### Task 3: Background Worker Tick

**Files:**
- Create: `packages/workflow/src/worker.ts`
- Modify: `packages/workflow/src/index.ts`
- Create: `packages/workflow/tests/worker.test.ts`

- [x] Add `runQueuedType2Workflow(...)` that claims one queued Type2 run, executes existing runner, persists result, and marks failures.
- [x] Verify `npm test -- packages/workflow/tests/worker.test.ts`.

### Task 4: Web Runtime Uses SQLite And Server Action Queues

**Files:**
- Create: `apps/web/lib/workflow-runtime.ts`
- Modify: `apps/web/lib/search-page.ts`
- Modify: `apps/web/app/actions.ts`
- Modify: `apps/web/components/request-track-button.tsx`
- Modify: `.env.example`

- [x] Add lazy SQLite repository getter and adapter getters.
- [x] Replace demo repository reads with SQLite-backed reads seeded only when empty in demo mode.
- [x] Make `requestTrackingAction(...)` call the queue-only command and return UI statuses.
- [x] Keep live adapters behind explicit env switches.

### Task 5: Web Verification

**Files:**
- Modify: `apps/web/app/page.tsx` only if status copy needs adjustment.

- [x] Run `npm test`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build:web`.
- [x] Restart local dev server and browser-check search, queued request, library, and no console errors.
