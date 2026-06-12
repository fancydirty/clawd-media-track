# Media Track Workflow Kernel Design

Status: draft for user review.

This spec defines the first implementation slice for turning
`clawd-media-track` from an agent skill into a GUI-backed workflow product.

It is intentionally narrower than the full product. The first goal is not a
beautiful media browser. The first goal is a tested workflow kernel that
preserves the proven effects of the current skill while replacing the prompt-led
execution shape with deterministic orchestration and bounded agent judgment.

## Goal

Build a P0 workflow kernel that can model Type 2 tracking initialization and
Type 3 missing-episode repair with mock providers, durable state, structured
agent decisions, and verification-first side effects.

The end-user product goal remains:

```text
user clicks get/track
-> system works in the background
-> verified episodes land in 115
-> user receives a simple result
```

## Non-Goals

P0 will not build:

- a full Next.js GUI
- public user accounts
- production 115 credential storage
- real TMDB/PanSou/115 integrations
- recommendation or discovery browsing
- email or WeChat delivery
- a player or media library
- a full migration from the existing Python skill

P0 will also not preserve current Python method names, module layout, CLI shape,
or prompt checklist flow. It preserves observed workflow effects.

## North Star

The current skill and live runs proved the target effects:

- create deterministic media and season landing directories
- snapshot resource candidates before selection
- choose resources from evidence, not vibes
- transfer only selected resources
- verify physical video files after transfer
- flatten only final landing directories
- deduplicate from a stable snapshot
- mark episodes obtained only after files exist
- repair database and storage mismatch during Type 3
- record enough audit detail to explain success or failure

The product should make these rules structural instead of rhetorical.

## Architecture

P0 should introduce a small TypeScript workflow package alongside the existing
Python skill. The package does not call real external services yet. It defines
the product workflow semantics and tests them against fixtures.

Proposed package boundary:

```text
packages/workflow
```

Inside it, the kernel owns deterministic orchestration:

```text
WorkflowRun
-> MetadataProvider
-> ResourceProvider
-> AgentDecision
-> StorageExecutor
-> FileVerifier
-> EpisodeState update
-> Notification event
```

The existing Python skill remains a reference implementation. It should not be
rewired or deleted in P0.

## Core Principle

Use strong agent intelligence with narrow workflow authority.

Agent nodes are allowed to:

- generate search keyword candidates
- judge whether candidate titles match the target
- map resources to missing episodes
- compare quality and coverage
- explain uncertainty
- recommend duplicate deletions from a verified file snapshot

Agent nodes are not allowed to:

- create folders
- transfer resources
- delete files
- mark database rows obtained
- mutate workflow state directly

The workflow validates every model output before applying side effects.

## Workflow Types In Scope

### Type 2 Tracking Initialization

Input:

- media title metadata
- tracked season
- total episode count from metadata
- latest aired episode cursor from metadata
- resource candidates
- mock storage state

Expected behavior:

1. create or reuse tracked season state
2. create deterministic landing directory records
3. search resources through the provider abstraction
4. ask agent nodes to select covering candidates
5. execute selected snapshot-scoped candidate transfers through the storage
   abstraction
6. verify materialized videos
7. flatten final landing directory when needed
8. deduplicate when duplicates exist
9. mark only verified episodes obtained
10. keep unaired/unavailable episodes visible but not treated as ordinary gaps
11. emit a user-facing result event

### Type 3 Missing-Episode Repair

Input:

- existing tracked season state
- total episode count from metadata
- latest aired episode cursor from metadata
- actionable missing episodes
- current target-directory file snapshot
- resource candidates
- mock storage state

Expected behavior:

1. sync metadata and episode state
2. compare database state with current storage files
3. treat absent verified files as repairable missing episodes
4. search only for uncovered actionable gaps
5. select exact missing-episode resources when available
6. transfer selected resources
7. verify target directory changed as expected
8. recover when a transfer result does not materialize files
9. flatten and deduplicate safely
10. mark restored episodes obtained after verification
11. emit a notification event

## Episode State Model

Ongoing shows need three related but different episode concepts.

1. Total episodes
   - Usually comes from TMDB `number_of_episodes`.
   - This defines the season shape and UI grid length when known.

2. Latest aired episode cursor
   - Usually comes from TMDB `last_episode_to_air`.
   - This defines the default range the workflow expects to obtain:
     `S01E01` through `S01E<latest>`.
   - TMDB can be stale or wrong, so this is an external signal, not absolute
     truth.

3. Verified obtained episodes
   - Comes from target-directory file verification.
   - This is the strongest local truth about what the user can actually watch.

The UI can later render these states differently:

- future or not-yet-actionable episodes: lower visual weight
- aired and obtained episodes: full visual weight
- aired but missing episodes: visible gap / retry state
- verified files ahead of TMDB: obtained but metadata-pending state

The workflow kernel should expose enough state for the UI to make that decision.
The UI should not have to infer it from filenames.

The future episode grid component should receive explicit episode state props
from the backend. It should not compute product truth locally. A later UI can
map those props to visual density:

```text
unaired / unknown           -> quiet, low-density cell
aired + obtained            -> full, confident cell
aired + missing             -> visible gap / retry cell
obtained + provider_ahead   -> full cell with metadata-pending nuance
```

## Data Model

P0 can use in-memory repositories backed by typed objects. It should still model
the production database shape so later Postgres migration is straightforward.

Required entities:

### `MediaTitle`

Fields:

- `id`
- `tmdbId`
- `type`: `movie | tv | anime`
- `title`
- `originalTitle`
- `year`
- `aliases`

### `TrackedSeason`

Fields:

- `id`
- `mediaTitleId`
- `seasonNumber`
- `status`: `active | completed`
- `qualityPreference`
- `storageDirectoryId`
- `totalEpisodes`
- `latestAiredEpisode`
- `latestAiredSource`: `metadata | manual | unknown`

### `EpisodeState`

Fields:

- `trackedSeasonId`
- `episodeCode`
- `airDate`
- `title`
- `airStatus`: `aired | unaired | unknown`
- `obtained`
- `metadataStatus`: `confirmed | provider_ahead | storage_only`
- `verifiedFileIds`

### `WorkflowRun`

Fields:

- `id`
- `kind`: `type2_init | type3_monitor`
- `status`: `queued | running | succeeded | failed | partial`
- `trackedSeasonId`
- `startedAt`
- `finishedAt`
- `auditEvents`

### `ResourceSnapshot`

Fields:

- `id`
- `provider`
- `keyword`
- `candidates`
- `createdAt`

### `ResourceCandidate`

Fields:

- `id`
- `snapshotId`
- `index`
- `title`
- `type`: `115 | magnet | manual`
- `source`
- `episodeHints`
- `qualityHints`
- `providerPayload`

### `AgentDecision`

Fields:

- `node`
- `snapshotId`
- `selectedCandidateIds`
- `episodeMapping`
- `providerAheadEpisodeMapping`
- `rejectedCandidateIds`
- `confidence`
- `reason`

### `TransferAttempt`

Fields:

- `id`
- `workflowRunId`
- `candidateId`
- `status`: `succeeded | failed | no_target_change`
- `providerMessage`
- `materializedFileIds`

### `VerifiedFile`

Fields:

- `id`
- `storageDirectoryId`
- `name`
- `sizeBytes`
- `episodeCode`
- `providerFileId`

### `NotificationEvent`

Fields:

- `id`
- `workflowRunId`
- `kind`
- `title`
- `body`
- `createdAt`

## Provider Interfaces

P0 providers are mocks. Their interfaces should look like production.

### `MetadataProvider`

Responsibilities:

- return media details
- return season episodes
- expose currently aired episodes

### `ResourceProvider`

Responsibilities:

- return `ResourceSnapshot`
- keep candidate ordering stable inside a snapshot
- scope candidate ids to one `ResourceSnapshot`
- create fresh candidate ids for each fresh search result
- simulate provider errors and empty results

### `StorageExecutor`

Responsibilities:

- create landing directory records
- execute snapshot-scoped transfer requests
- list current files
- flatten final landing directories
- delete duplicate files only from a verified delete plan

P0 should include scenarios for:

- successful materialization
- nested transfer output requiring flatten
- duplicate episode files requiring delete recommendation
- transfer success with no target directory change
- provider search error followed by fallback keyword success

## Agent Node Contracts

P0 uses deterministic fake agents, not live LLM calls. The contracts should be
the same shape a real structured-output model will later use.

### `KeywordAgent`

Input:

- media title
- aliases
- season number
- missing episodes
- previous provider errors

Output:

- ordered keyword candidates
- reason

### `CandidateMatchAgent`

Input:

- media title
- aliases
- candidate titles

Output:

- matched candidate ids
- rejected candidate ids
- uncertainty list

### `EpisodeCoverageAgent`

Input:

- missing episodes
- latest aired episode cursor
- matched candidates

Output:

- selected candidate ids
- episode mapping
- provider-ahead episode mapping
- coverage gaps
- confidence

### `DedupAgent`

Input:

- verified file snapshot

Output:

- duplicate groups
- candidate delete ids
- reason

## Invariants

P0 tests must lock these invariants:

1. A workflow never marks an episode obtained before a verified file exists.
2. A transfer attempt that reports success but materializes no target file does
   not mark anything obtained.
3. Type 3 can repair a database/storage mismatch caused by external deletion.
4. The TMDB latest aired cursor defines the default actionable range, but
   verified storage/provider evidence can create metadata-pending obtained
   episodes ahead of TMDB.
5. Candidate selection uses snapshot candidate ids, not freshly searched data.
   Every candidate-id-bearing field in an agent decision must refer to the
   current `ResourceSnapshot`; old result indexes or stale candidate ids cannot
   cross a new search boundary.
6. Flattening only targets final landing directories.
7. Duplicate deletion only uses a verified file snapshot.
8. Provider errors are audit events, not silent failures.
9. The user-facing result hides provider complexity but audit events preserve it.
10. Before Type 3 transfers a missing episode, it first checks whether the
    target directory already contains that episode and marks it obtained if so.

## P0 Acceptance Scenarios

### Scenario 1: Type 2 Initializes Current Coverage

Given a 24-episode ongoing show with currently aired episodes `S01E01-S01E14`,
and resource candidates covering `S01E01-S01E14`,
when Type 2 initialization runs,
then it creates tracking state, verifies 14 files, marks `S01E01-S01E14`
obtained, does not search or transfer future unaired episodes, and emits a
"tracking initialized" notification.

P0 policy: TMDB's latest aired cursor is the default actionable range. Future
episodes may exist as metadata, but they do not become ordinary missing episodes
until the metadata cursor or provider/storage evidence makes them actionable.

### Scenario 2: Type 3 Repairs Manual Deletion

Given database state says `S01E01-S01E14` were obtained,
and storage currently contains only `S01E01-S01E12`,
when Type 3 reconciliation runs,
then it treats `S01E13-S01E14` as missing, transfers exact resources, verifies
the files, marks them obtained again, and emits a "2 episodes restored"
notification.

### Scenario 3: Transfer Does Not Materialize Files

Given a candidate transfer returns provider message "already transferred" but
adds no file to the target directory,
when the workflow verifies the directory,
then it records `no_target_change`, does not mark the episode obtained, and only
continues to another candidate if that candidate was selected by the agent from
the current snapshot or by a fresh agent pass that includes the failure evidence.

### Scenario 4: Provider Search Needs Keyword Recovery

Given the obvious keyword returns a provider error or empty result,
when the workflow asks `KeywordAgent` for alternatives,
then it searches bounded alternatives, rejects wrong-target results, and only
transfers candidates whose titles match the target and missing episodes.

### Scenario 5: Nested Transfer Output Is Flattened Safely

Given a transfer materializes videos inside a nested folder under the final
landing directory,
when verification and flattening run,
then files move to the final landing directory and no protected root/category
directory is flattened.

### Scenario 6: Provider Is Ahead of TMDB

Given TMDB says the latest aired episode is `S01E20`,
and the selected provider resource materializes both `S01E20` and `S01E21`,
when the workflow verifies files,
then it marks `S01E20` obtained, records `S01E21` as obtained with
`metadataStatus=provider_ahead`, and does not lose that file just because TMDB
has not caught up yet.

When a later metadata sync includes `S01E21`,
then the workflow reconciles the existing verified file into the normal episode
state without transferring it again.

### Scenario 7: Type 3 Finds File Before Searching

Given `sync_all` reports `S01E21` missing,
and the target directory already contains a verified `S01E21` file,
when Type 3 runs,
then it marks `S01E21` obtained and exits without searching or transferring a
new resource for that episode.

## Testing Strategy

P0 should be test-first.

Use unit tests for:

- entity state transitions
- resource snapshot identity
- agent decision validation
- transfer result handling
- file verification and episode mapping

Use workflow tests for:

- full Type 2 initialization
- full Type 3 repair
- provider error recovery
- no-target-change recovery through agent-selected candidates from the same resource snapshot
- provider-ahead verified files
- pre-search storage reconciliation

## Implemented P0 Contract Notes

The TypeScript kernel implemented in this slice intentionally preserves effects
rather than old skill mechanics.

`WorkflowResult` exposes:

- `status`
- `episodes`
- `obtainedEpisodes`
- `providerAheadEpisodes`
- `transferAttempts`
- `decisions`
- `notification`
- `notifications`
- `auditEvents`

The workflow validates agent decisions before side effects. The validation is
snapshot-scoped: `selectedCandidateIds`, `rejectedCandidateIds`,
`episodeMapping`, and `providerAheadEpisodeMapping` must all reference
candidates from the current `ResourceSnapshot`.

This replaces the old prompt-level reliance on transfer indexes. If a provider
is searched again, the workflow gets a new snapshot and new candidate ids. A
decision from an older search cannot be reused against the new result ordering.
- transfer no-target-change recovery
- flatten and dedup boundaries

No production workflow code should be written before a failing test exists for
that behavior.

## Initial File Plan

The implementation plan should create:

```text
package.json
tsconfig.json
vitest.config.ts
packages/workflow/src/domain.ts
packages/workflow/src/ports.ts
packages/workflow/src/fakes.ts
packages/workflow/src/workflow.ts
packages/workflow/src/index.ts
packages/workflow/tests/type2-init.test.ts
packages/workflow/tests/type3-monitor.test.ts
packages/workflow/tests/invariants.test.ts
```

This keeps the first code slice isolated from the existing Python skill.

## Open Decisions Locked For P0

- Runtime: TypeScript package inside this repo.
- Test runner: Vitest.
- Providers: fake providers only.
- UI: no UI in P0.
- Database: in-memory repositories with production-shaped entities.
- Real LLM calls: no live LLM calls in P0.
- Real 115/TMDB/PanSou: no live integrations in P0.

## Later Phases

After P0 passes:

1. Add Postgres schema and repository implementations.
2. Add Next.js App Router shell that reads workflow state.
3. Add TMDB metadata provider.
4. Add PanSou resource provider.
5. Add 115 executor and account connection flow.
6. Add notification delivery.
7. Replace deterministic fake agents with structured-output LLM nodes.

## Review Notes

This spec deliberately starts from the workflow kernel because it is the
smallest slice that can prove the product's real value. A GUI without this
kernel would be decorative. Real providers without this kernel would recreate
the current skill's prompt-led fragility.

The first milestone is therefore:

```text
mocked workflow, real semantics, strong tests
```
