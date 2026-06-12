# Search Product Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo-only dashboard with a search-first product surface that can render TMDB candidates, tracking action state, a tracked library tab, and Suspense-ready loading states.

**Architecture:** Keep the browser as a thin UI shell. Add a workflow read model that maps metadata/search results and repository truth into UI-friendly cards, then have the Next App Router page render Search and Library tabs from server-side data. Server Actions remain responsible for mutations and dedupe.

**Tech Stack:** TypeScript, Vitest, Next.js App Router, React Server Components, Server Actions, existing `@media-track/workflow` package.

---

### Task 1: Preserve Current Package Recognition Slice

**Files:**
- Verify existing changes in `packages/workflow/src/package-normalizer.ts`
- Verify existing tests in `packages/workflow/tests/package-normalizer.test.ts`

- [x] Run `npm test -- packages/workflow/tests/package-normalizer.test.ts packages/workflow/tests/ai-sdk-agent.test.ts`
- [x] Run `npm run typecheck`

### Task 2: Add Search Product Read Model

**Files:**
- Create: `packages/workflow/tests/search-view.test.ts`
- Create: `packages/workflow/src/search-view.ts`
- Modify: `packages/workflow/src/index.ts`

- [x] Write failing tests for keyword-empty state, candidate card metadata, already-tracked state, active-run state, and metadata-cache hit.
- [x] Run `npm test -- packages/workflow/tests/search-view.test.ts` and confirm RED.
- [x] Implement minimal `getSearchPageView(...)` and supporting in-memory metadata search provider/cache.
- [x] Export the module from `packages/workflow/src/index.ts`.
- [x] Run the focused test and confirm GREEN.

### Task 3: Add Web Search Data Facade

**Files:**
- Create: `apps/web/lib/search-page.ts`
- Modify: `apps/web/app/actions.ts`

- [x] Write failing tests if the facade is pure enough to test in workflow package; otherwise keep facade thin and cover via page build.
- [x] Implement a server-only facade that returns deterministic P0 search results for `searchParams.q`.
- [x] Keep live TMDB behind the existing `TmdbMetadataProvider` boundary for later env-backed use.
- [x] Preserve `requestTrackingAction()` while adding a selection-shaped action result.

### Task 4: Replace Demo Homepage With Search + Library Tabs

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/globals.css`
- Create/modify client components under `apps/web/components/`

- [x] Render a search-first first viewport with a clear keyword input.
- [x] Render candidate cards below the search form only after `q` exists.
- [x] Render tracked library state in a second tab using existing demo/tracked status data.
- [x] Use code-native controls and clear action states: can request, already tracked, active workflow.

### Task 5: Add Suspense Loading States And Verify

**Files:**
- Modify: `apps/web/app/page.tsx`
- Create: `apps/web/app/loading.tsx` if useful

- [x] Wrap candidate and library regions in Suspense boundaries.
- [x] Add skeleton rows/cards that match the final layout.
- [x] Run `npm test`, `npm run typecheck`, and `npm run build:web`.
- [x] Run the local web app and validate app load, search state, tab navigation, and action button behavior in the browser.
