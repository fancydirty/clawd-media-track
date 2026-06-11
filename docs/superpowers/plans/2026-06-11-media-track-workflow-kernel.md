# Media Track Workflow Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested TypeScript workflow kernel that models Type 2 tracking initialization and Type 3 missing-episode repair with fake providers, structured agent decisions, and verification-first state transitions.

**Architecture:** Add an isolated `packages/workflow` TypeScript package beside the existing Python skill. The kernel owns deterministic workflow state and side effects through ports; agent nodes are typed interfaces with fake implementations in P0. No real TMDB, PanSou, 115, database, or live LLM calls are introduced in this milestone.

**Tech Stack:** TypeScript, Vitest, Node ESM, in-memory fakes. Future live agent adapter should default to Vercel AI SDK v6 `generateText` with `Output.object()` because the product direction is TypeScript/Next.js; P0 intentionally has no AI SDK runtime dependency.

**Execution note:** This plan was executed on branch
`codex/workflow-kernel-p0`. The final implementation intentionally diverges
from early snippets where review found sharper invariants. In particular,
candidate transfer is now bound to `ResourceSnapshot`-scoped candidate ids such
as `snapshot_1_candidate_1`, and workflow code validates every
candidate-id-bearing field in an `AgentDecision` before side effects. Treat the
checked-in code and the companion design spec as the final contract; this plan
remains the historical task breakdown.

---

## Files

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `packages/workflow/src/domain.ts`
- Create: `packages/workflow/src/ports.ts`
- Create: `packages/workflow/src/fakes.ts`
- Create: `packages/workflow/src/workflow.ts`
- Create: `packages/workflow/src/index.ts`
- Create: `packages/workflow/tests/type2-init.test.ts`
- Create: `packages/workflow/tests/type3-monitor.test.ts`
- Create: `packages/workflow/tests/invariants.test.ts`
- Modify: `.gitignore` if `node_modules/` or coverage output are not ignored.

## Task 1: TypeScript Test Harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Create package configuration**

Create `package.json`:

```json
{
  "name": "media-track",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["packages/**/*.ts", "vitest.config.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
    environment: "node",
  },
});
```

Ensure `.gitignore` contains:

```gitignore
node_modules/
dist/
coverage/
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created, dependencies install successfully.

- [ ] **Step 3: Run empty test suite**

Run:

```bash
npm test -- --passWithNoTests
npm run typecheck
```

Expected: both commands succeed.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: add workflow TypeScript test harness"
```

## Task 2: Domain Model And Episode Semantics

**Files:**
- Create: `packages/workflow/src/domain.ts`
- Create: `packages/workflow/src/index.ts`
- Test: `packages/workflow/tests/invariants.test.ts`

- [ ] **Step 1: Write failing domain tests**

Create `packages/workflow/tests/invariants.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createEpisodeStates,
  episodeCode,
  reconcileVerifiedFiles,
  type TrackedSeason,
  type VerifiedFile,
} from "../src/index.js";

describe("episode state semantics", () => {
  it("creates visible future episodes without making them obtained", () => {
    const episodes = createEpisodeStates({
      trackedSeasonId: "season_1",
      seasonNumber: 1,
      totalEpisodes: 24,
      latestAiredEpisode: 14,
    });

    expect(episodes).toHaveLength(24);
    expect(episodes[0]).toMatchObject({
      episodeCode: "S01E01",
      airStatus: "aired",
      obtained: false,
      metadataStatus: "confirmed",
    });
    expect(episodes[13]).toMatchObject({
      episodeCode: "S01E14",
      airStatus: "aired",
      obtained: false,
      metadataStatus: "confirmed",
    });
    expect(episodes[14]).toMatchObject({
      episodeCode: "S01E15",
      airStatus: "unaired",
      obtained: false,
      metadataStatus: "confirmed",
    });
  });

  it("records verified files ahead of TMDB as provider ahead", () => {
    const season: TrackedSeason = {
      id: "season_1",
      mediaTitleId: "title_1",
      seasonNumber: 1,
      status: "active",
      qualityPreference: "4K",
      storageDirectoryId: "dir_1",
      totalEpisodes: 24,
      latestAiredEpisode: 20,
      latestAiredSource: "metadata",
    };
    const episodes = createEpisodeStates({
      trackedSeasonId: season.id,
      seasonNumber: season.seasonNumber,
      totalEpisodes: season.totalEpisodes,
      latestAiredEpisode: season.latestAiredEpisode,
    });
    const files: VerifiedFile[] = [
      {
        id: "file_21",
        storageDirectoryId: "dir_1",
        name: "Show.S01E21.mkv",
        sizeBytes: 100,
        episodeCode: "S01E21",
        providerFileId: "provider_21",
      },
    ];

    const reconciled = reconcileVerifiedFiles({
      season,
      episodes,
      files,
    });

    expect(reconciled.find((episode) => episode.episodeCode === "S01E21")).toMatchObject({
      obtained: true,
      metadataStatus: "provider_ahead",
      verifiedFileIds: ["file_21"],
    });
  });

  it("formats episode codes consistently", () => {
    expect(episodeCode(1, 1)).toBe("S01E01");
    expect(episodeCode(12, 34)).toBe("S12E34");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- packages/workflow/tests/invariants.test.ts
```

Expected: FAIL because `packages/workflow/src/index.ts` does not exist.

- [ ] **Step 3: Implement domain model**

Create `packages/workflow/src/domain.ts`:

```ts
export type MediaType = "movie" | "tv" | "anime";
export type SeasonStatus = "active" | "completed";
export type LatestAiredSource = "metadata" | "manual" | "unknown";
export type AirStatus = "aired" | "unaired" | "unknown";
export type MetadataStatus = "confirmed" | "provider_ahead" | "storage_only";
export type WorkflowKind = "type2_init" | "type3_monitor";
export type WorkflowStatus = "queued" | "running" | "succeeded" | "failed" | "partial";
export type ResourceType = "115" | "magnet" | "manual";
export type TransferStatus = "succeeded" | "failed" | "no_target_change";
export type Confidence = "low" | "medium" | "high";

export interface MediaTitle {
  id: string;
  tmdbId: number;
  type: MediaType;
  title: string;
  originalTitle: string;
  year: number;
  aliases: string[];
}

export interface TrackedSeason {
  id: string;
  mediaTitleId: string;
  seasonNumber: number;
  status: SeasonStatus;
  qualityPreference: string;
  storageDirectoryId: string;
  totalEpisodes: number;
  latestAiredEpisode: number;
  latestAiredSource: LatestAiredSource;
}

export interface EpisodeState {
  trackedSeasonId: string;
  episodeCode: string;
  airDate: string | null;
  title: string;
  airStatus: AirStatus;
  obtained: boolean;
  metadataStatus: MetadataStatus;
  verifiedFileIds: string[];
}

export interface WorkflowRun {
  id: string;
  kind: WorkflowKind;
  status: WorkflowStatus;
  trackedSeasonId: string;
  startedAt: string;
  finishedAt: string | null;
  auditEvents: AuditEvent[];
}

export interface AuditEvent {
  type: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface ResourceCandidate {
  id: string;
  snapshotId: string;
  index: number;
  title: string;
  type: ResourceType;
  source: string;
  episodeHints: string[];
  qualityHints: string[];
  providerPayload: Record<string, unknown>;
}

export interface ResourceSnapshot {
  id: string;
  provider: string;
  keyword: string;
  candidates: ResourceCandidate[];
  createdAt: string;
}

export interface AgentDecision {
  node: string;
  snapshotId: string;
  selectedCandidateIds: string[];
  episodeMapping: Record<string, string[]>;
  providerAheadEpisodeMapping: Record<string, string[]>;
  rejectedCandidateIds: string[];
  confidence: Confidence;
  reason: string;
}

export interface TransferAttempt {
  id: string;
  workflowRunId: string;
  candidateId: string;
  status: TransferStatus;
  providerMessage: string;
  materializedFileIds: string[];
}

export interface VerifiedFile {
  id: string;
  storageDirectoryId: string;
  name: string;
  sizeBytes: number;
  episodeCode: string;
  providerFileId: string;
}

export interface NotificationEvent {
  id: string;
  workflowRunId: string;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
}

export function episodeCode(seasonNumber: number, episodeNumber: number): string {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

export function episodeNumberFromCode(code: string): number {
  const match = /^S\d{2}E(\d{2,})$/.exec(code);
  if (!match) {
    throw new Error(`Invalid episode code: ${code}`);
  }
  return Number(match[1]);
}

export function createEpisodeStates(input: {
  trackedSeasonId: string;
  seasonNumber: number;
  totalEpisodes: number;
  latestAiredEpisode: number;
}): EpisodeState[] {
  return Array.from({ length: input.totalEpisodes }, (_, index) => {
    const episodeNumber = index + 1;
    return {
      trackedSeasonId: input.trackedSeasonId,
      episodeCode: episodeCode(input.seasonNumber, episodeNumber),
      airDate: null,
      title: `Episode ${episodeNumber}`,
      airStatus: episodeNumber <= input.latestAiredEpisode ? "aired" : "unaired",
      obtained: false,
      metadataStatus: "confirmed",
      verifiedFileIds: [],
    };
  });
}

export function reconcileVerifiedFiles(input: {
  season: TrackedSeason;
  episodes: EpisodeState[];
  files: VerifiedFile[];
}): EpisodeState[] {
  const byCode = new Map(input.episodes.map((episode) => [episode.episodeCode, { ...episode }]));

  for (const file of input.files) {
    const existing = byCode.get(file.episodeCode);
    const episodeNumber = episodeNumberFromCode(file.episodeCode);
    const metadataStatus: MetadataStatus =
      existing?.metadataStatus ?? (episodeNumber > input.season.latestAiredEpisode ? "provider_ahead" : "storage_only");
    const next: EpisodeState = existing ?? {
      trackedSeasonId: input.season.id,
      episodeCode: file.episodeCode,
      airDate: null,
      title: file.episodeCode,
      airStatus: episodeNumber <= input.season.latestAiredEpisode ? "aired" : "unknown",
      obtained: false,
      metadataStatus,
      verifiedFileIds: [],
    };

    byCode.set(file.episodeCode, {
      ...next,
      obtained: true,
      metadataStatus: episodeNumber > input.season.latestAiredEpisode ? "provider_ahead" : next.metadataStatus,
      verifiedFileIds: Array.from(new Set([...next.verifiedFileIds, file.id])),
    });
  }

  return Array.from(byCode.values()).sort((a, b) => a.episodeCode.localeCompare(b.episodeCode));
}
```

Create `packages/workflow/src/index.ts`:

```ts
export * from "./domain.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- packages/workflow/tests/invariants.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/workflow/src/domain.ts packages/workflow/src/index.ts packages/workflow/tests/invariants.test.ts
git commit -m "feat: add workflow domain model"
```

## Task 3: Ports And Fake Adapters

**Files:**
- Create: `packages/workflow/src/ports.ts`
- Create: `packages/workflow/src/fakes.ts`
- Modify: `packages/workflow/src/index.ts`
- Test: `packages/workflow/tests/invariants.test.ts`

- [ ] **Step 1: Add failing fake adapter tests**

Append to `packages/workflow/tests/invariants.test.ts`:

```ts
import {
  FakeAgentNodes,
  FakeResourceProvider,
  FakeStorageExecutor,
} from "../src/index.js";

describe("fake adapters", () => {
  it("keeps resource candidate ordering stable in snapshots", async () => {
    const provider = new FakeResourceProvider({
      keywordResults: {
        "翘楚 4K": [
          { title: "翘楚 S01E13 4K", episodeHints: ["S01E13"] },
          { title: "翘楚 S01E14 4K", episodeHints: ["S01E14"] },
        ],
      },
    });

    const snapshot = await provider.search({ keyword: "翘楚 4K" });

    expect(snapshot.candidates.map((candidate) => candidate.index)).toEqual([0, 1]);
    expect(snapshot.candidates.map((candidate) => candidate.episodeHints)).toEqual([["S01E13"], ["S01E14"]]);
  });

  it("can simulate a transfer with no target directory change", async () => {
    const storage = new FakeStorageExecutor({
      directories: { dir_1: [] },
      transferOutcomes: {
        candidate_1: {
          status: "no_target_change",
          providerMessage: "already transferred elsewhere",
          files: [],
        },
      },
    });

    const attempt = await storage.transfer({
      workflowRunId: "run_1",
      directoryId: "dir_1",
      candidateId: "candidate_1",
    });
    const files = await storage.listVideoFiles("dir_1");

    expect(attempt.status).toBe("no_target_change");
    expect(files).toEqual([]);
  });

  it("fake agent selects candidates that cover missing episodes", async () => {
    const agent = new FakeAgentNodes();
    const decision = await agent.selectEpisodeCoverage({
      snapshotId: "snapshot_1",
      candidates: [
        {
          id: "candidate_1",
          snapshotId: "snapshot_1",
          index: 0,
          title: "翘楚 S01E13",
          type: "115",
          source: "fake",
          episodeHints: ["S01E13"],
          qualityHints: ["4K"],
          providerPayload: {},
        },
      ],
      missingEpisodes: ["S01E13"],
      latestAiredEpisode: 14,
    });

    expect(decision.selectedCandidateIds).toEqual(["candidate_1"]);
    expect(decision.episodeMapping).toEqual({ candidate_1: ["S01E13"] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- packages/workflow/tests/invariants.test.ts
```

Expected: FAIL because fakes and ports do not exist.

- [ ] **Step 3: Implement ports**

Create `packages/workflow/src/ports.ts`:

```ts
import type {
  AgentDecision,
  ResourceCandidate,
  ResourceSnapshot,
  TransferAttempt,
  VerifiedFile,
} from "./domain.js";

export interface ResourceProvider {
  search(input: { keyword: string }): Promise<ResourceSnapshot>;
}

export interface StorageExecutor {
  createDirectory(input: { name: string; parentId: string }): Promise<string>;
  listVideoFiles(directoryId: string): Promise<VerifiedFile[]>;
  transfer(input: {
    workflowRunId: string;
    directoryId: string;
    candidateId: string;
  }): Promise<TransferAttempt>;
  flattenDirectory(directoryId: string): Promise<{ moved: string[]; removed: string[] }>;
  deleteFiles(input: { directoryId: string; fileIds: string[] }): Promise<{ deleted: string[] }>;
}

export interface AgentNodes {
  generateKeywords(input: {
    title: string;
    aliases: string[];
    missingEpisodes: string[];
    previousErrors: string[];
  }): Promise<{ keywords: string[]; reason: string }>;
  selectEpisodeCoverage(input: {
    snapshotId: string;
    candidates: ResourceCandidate[];
    missingEpisodes: string[];
    latestAiredEpisode: number;
  }): Promise<AgentDecision>;
}
```

- [ ] **Step 4: Implement fakes**

Create `packages/workflow/src/fakes.ts`:

```ts
import type {
  AgentDecision,
  ResourceCandidate,
  ResourceSnapshot,
  TransferAttempt,
  TransferStatus,
  VerifiedFile,
} from "./domain.js";
import type { AgentNodes, ResourceProvider, StorageExecutor } from "./ports.js";

interface CandidateFixture {
  title: string;
  episodeHints: string[];
  qualityHints?: string[];
  source?: string;
}

interface TransferOutcome {
  status: TransferStatus;
  providerMessage: string;
  files: VerifiedFile[];
}

export class FakeResourceProvider implements ResourceProvider {
  constructor(
    private readonly config: {
      keywordResults: Record<string, CandidateFixture[]>;
      keywordErrors?: Record<string, string>;
    },
  ) {}

  async search(input: { keyword: string }): Promise<ResourceSnapshot> {
    const error = this.config.keywordErrors?.[input.keyword];
    if (error) {
      throw new Error(error);
    }

    const snapshotId = `snapshot_${input.keyword.replace(/\s+/g, "_")}`;
    const fixtures = this.config.keywordResults[input.keyword] ?? [];
    const candidates: ResourceCandidate[] = fixtures.map((fixture, index) => ({
      id: `candidate_${index + 1}`,
      snapshotId,
      index,
      title: fixture.title,
      type: "115",
      source: fixture.source ?? "fake",
      episodeHints: fixture.episodeHints,
      qualityHints: fixture.qualityHints ?? [],
      providerPayload: { keyword: input.keyword },
    }));

    return {
      id: snapshotId,
      provider: "fake",
      keyword: input.keyword,
      candidates,
      createdAt: "2026-06-11T00:00:00.000Z",
    };
  }
}

export class FakeStorageExecutor implements StorageExecutor {
  public readonly directories: Record<string, VerifiedFile[]>;
  private nextDirectory = 1;

  constructor(
    private readonly config: {
      directories?: Record<string, VerifiedFile[]>;
      transferOutcomes?: Record<string, TransferOutcome>;
      nestedDirectories?: Set<string>;
    } = {},
  ) {
    this.directories = { ...(config.directories ?? {}) };
  }

  async createDirectory(input: { name: string; parentId: string }): Promise<string> {
    const id = `dir_${this.nextDirectory++}_${input.name.replace(/\s+/g, "_")}`;
    this.directories[id] = [];
    return id;
  }

  async listVideoFiles(directoryId: string): Promise<VerifiedFile[]> {
    return [...(this.directories[directoryId] ?? [])];
  }

  async transfer(input: {
    workflowRunId: string;
    directoryId: string;
    candidateId: string;
  }): Promise<TransferAttempt> {
    const outcome = this.config.transferOutcomes?.[input.candidateId] ?? {
      status: "failed" as const,
      providerMessage: "no fake outcome configured",
      files: [],
    };

    if (outcome.status === "succeeded") {
      this.directories[input.directoryId] = [
        ...(this.directories[input.directoryId] ?? []),
        ...outcome.files,
      ];
    }

    return {
      id: `attempt_${input.workflowRunId}_${input.candidateId}`,
      workflowRunId: input.workflowRunId,
      candidateId: input.candidateId,
      status: outcome.status,
      providerMessage: outcome.providerMessage,
      materializedFileIds: outcome.files.map((file) => file.id),
    };
  }

  async flattenDirectory(directoryId: string): Promise<{ moved: string[]; removed: string[] }> {
    if (!this.config.nestedDirectories?.has(directoryId)) {
      return { moved: [], removed: [] };
    }
    return { moved: this.directories[directoryId]?.map((file) => file.id) ?? [], removed: [`nested_${directoryId}`] };
  }

  async deleteFiles(input: { directoryId: string; fileIds: string[] }): Promise<{ deleted: string[] }> {
    const current = this.directories[input.directoryId] ?? [];
    this.directories[input.directoryId] = current.filter((file) => !input.fileIds.includes(file.id));
    return { deleted: input.fileIds };
  }
}

export class FakeAgentNodes implements AgentNodes {
  async generateKeywords(input: {
    title: string;
    aliases: string[];
    missingEpisodes: string[];
    previousErrors: string[];
  }): Promise<{ keywords: string[]; reason: string }> {
    return {
      keywords: [input.title, ...input.aliases, `${input.title} 4K`],
      reason: input.previousErrors.length > 0 ? "retry with aliases and quality hint" : "default title first",
    };
  }

  async selectEpisodeCoverage(input: {
    snapshotId: string;
    candidates: ResourceCandidate[];
    missingEpisodes: string[];
    latestAiredEpisode: number;
  }): Promise<AgentDecision> {
    const selected = input.candidates.filter((candidate) =>
      candidate.episodeHints.some((episode) => input.missingEpisodes.includes(episode)),
    );

    return {
      node: "EpisodeCoverageAgent",
      snapshotId: input.snapshotId,
      selectedCandidateIds: selected.map((candidate) => candidate.id),
      episodeMapping: Object.fromEntries(
        selected.map((candidate) => [
          candidate.id,
          candidate.episodeHints.filter((episode) => input.missingEpisodes.includes(episode)),
        ]),
      ),
      providerAheadEpisodeMapping: Object.fromEntries(
        selected.map((candidate) => [
          candidate.id,
          candidate.episodeHints.filter((episode) => Number(episode.slice(-2)) > input.latestAiredEpisode),
        ]),
      ),
      rejectedCandidateIds: input.candidates
        .filter((candidate) => !selected.includes(candidate))
        .map((candidate) => candidate.id),
      confidence: selected.length > 0 ? "high" : "low",
      reason: "fake agent selected candidates with matching episode hints",
    };
  }
}
```

Modify `packages/workflow/src/index.ts`:

```ts
export * from "./domain.js";
export * from "./ports.js";
export * from "./fakes.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -- packages/workflow/tests/invariants.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/workflow/src/ports.ts packages/workflow/src/fakes.ts packages/workflow/src/index.ts packages/workflow/tests/invariants.test.ts
git commit -m "feat: add workflow ports and fakes"
```

## Task 4: Type 2 Initialization Workflow

**Files:**
- Create: `packages/workflow/src/workflow.ts`
- Modify: `packages/workflow/src/index.ts`
- Test: `packages/workflow/tests/type2-init.test.ts`

- [ ] **Step 1: Write failing Type 2 test**

Create `packages/workflow/tests/type2-init.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FakeAgentNodes,
  FakeResourceProvider,
  FakeStorageExecutor,
  runType2Initialization,
  type MediaTitle,
  type TrackedSeason,
} from "../src/index.js";

describe("runType2Initialization", () => {
  it("initializes tracking and marks only verified current episodes obtained", async () => {
    const title: MediaTitle = {
      id: "title_qiaochu",
      tmdbId: 289271,
      type: "tv",
      title: "翘楚",
      originalTitle: "翘楚",
      year: 2026,
      aliases: ["Ashes to Crown"],
    };
    const season: TrackedSeason = {
      id: "season_qiaochu_1",
      mediaTitleId: title.id,
      seasonNumber: 1,
      status: "active",
      qualityPreference: "4K",
      storageDirectoryId: "dir_qiaochu_s1",
      totalEpisodes: 24,
      latestAiredEpisode: 14,
      latestAiredSource: "metadata",
    };

    const resourceProvider = new FakeResourceProvider({
      keywordResults: {
        "翘楚 4K": Array.from({ length: 14 }, (_, index) => ({
          title: `翘楚 S01E${String(index + 1).padStart(2, "0")} 4K`,
          episodeHints: [`S01E${String(index + 1).padStart(2, "0")}`],
          qualityHints: ["4K"],
        })),
      },
    });
    const storage = new FakeStorageExecutor({
      directories: { dir_qiaochu_s1: [] },
      transferOutcomes: Object.fromEntries(
        Array.from({ length: 14 }, (_, index) => {
          const episode = `S01E${String(index + 1).padStart(2, "0")}`;
          const candidateId = `candidate_${index + 1}`;
          return [
            candidateId,
            {
              status: "succeeded",
              providerMessage: "",
              files: [
                {
                  id: `file_${episode}`,
                  storageDirectoryId: "dir_qiaochu_s1",
                  name: `翘楚.${episode}.mkv`,
                  sizeBytes: 1_000_000_000,
                  episodeCode: episode,
                  providerFileId: `provider_${episode}`,
                },
              ],
            },
          ];
        }),
      ),
    });

    const result = await runType2Initialization({
      title,
      season,
      keyword: "翘楚 4K",
      resourceProvider,
      storage,
      agents: new FakeAgentNodes(),
    });

    expect(result.status).toBe("succeeded");
    expect(result.obtainedEpisodes).toEqual(Array.from({ length: 14 }, (_, index) => `S01E${String(index + 1).padStart(2, "0")}`));
    expect(result.episodes.filter((episode) => episode.obtained)).toHaveLength(14);
    expect(result.episodes.find((episode) => episode.episodeCode === "S01E15")).toMatchObject({
      obtained: false,
      airStatus: "unaired",
    });
    expect(result.notification.body).toContain("14 episodes obtained");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- packages/workflow/tests/type2-init.test.ts
```

Expected: FAIL because `runType2Initialization` does not exist.

- [ ] **Step 3: Implement minimal Type 2 workflow**

Create `packages/workflow/src/workflow.ts`:

```ts
import {
  createEpisodeStates,
  reconcileVerifiedFiles,
  type AgentDecision,
  type EpisodeState,
  type MediaTitle,
  type NotificationEvent,
  type TrackedSeason,
  type TransferAttempt,
  type WorkflowStatus,
} from "./domain.js";
import type { AgentNodes, ResourceProvider, StorageExecutor } from "./ports.js";

export interface WorkflowResult {
  status: WorkflowStatus;
  episodes: EpisodeState[];
  obtainedEpisodes: string[];
  transferAttempts: TransferAttempt[];
  decisions: AgentDecision[];
  notification: NotificationEvent;
  auditEvents: { type: string; message: string; data?: Record<string, unknown> }[];
}

export async function runType2Initialization(input: {
  title: MediaTitle;
  season: TrackedSeason;
  keyword: string;
  resourceProvider: ResourceProvider;
  storage: StorageExecutor;
  agents: AgentNodes;
}): Promise<WorkflowResult> {
  const auditEvents: WorkflowResult["auditEvents"] = [];
  let episodes = createEpisodeStates({
    trackedSeasonId: input.season.id,
    seasonNumber: input.season.seasonNumber,
    totalEpisodes: input.season.totalEpisodes,
    latestAiredEpisode: input.season.latestAiredEpisode,
  });
  const actionableMissing = episodes
    .filter((episode) => episode.airStatus === "aired" && !episode.obtained)
    .map((episode) => episode.episodeCode);

  const snapshot = await input.resourceProvider.search({ keyword: input.keyword });
  auditEvents.push({
    type: "resource_snapshot",
    message: `Resource snapshot created with ${snapshot.candidates.length} candidates`,
    data: { snapshotId: snapshot.id, keyword: snapshot.keyword },
  });

  const decision = await input.agents.selectEpisodeCoverage({
    snapshotId: snapshot.id,
    candidates: snapshot.candidates,
    missingEpisodes: actionableMissing,
    latestAiredEpisode: input.season.latestAiredEpisode,
  });

  const attempts: TransferAttempt[] = [];
  for (const candidateId of decision.selectedCandidateIds) {
    attempts.push(
      await input.storage.transfer({
        workflowRunId: "run_type2",
        directoryId: input.season.storageDirectoryId,
        candidateId,
      }),
    );
  }

  await input.storage.flattenDirectory(input.season.storageDirectoryId);
  const verifiedFiles = await input.storage.listVideoFiles(input.season.storageDirectoryId);
  episodes = reconcileVerifiedFiles({
    season: input.season,
    episodes,
    files: verifiedFiles,
  });

  const obtainedEpisodes = episodes
    .filter((episode) => episode.obtained)
    .map((episode) => episode.episodeCode);

  return {
    status: "succeeded",
    episodes,
    obtainedEpisodes,
    transferAttempts: attempts,
    decisions: [decision],
    notification: {
      id: "notification_type2",
      workflowRunId: "run_type2",
      kind: "tracking_initialized",
      title: `${input.title.title} tracking initialized`,
      body: `${obtainedEpisodes.length} episodes obtained`,
      createdAt: "2026-06-11T00:00:00.000Z",
    },
    auditEvents,
  };
}
```

Modify `packages/workflow/src/index.ts`:

```ts
export * from "./domain.js";
export * from "./ports.js";
export * from "./fakes.js";
export * from "./workflow.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- packages/workflow/tests/type2-init.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/workflow/src/workflow.ts packages/workflow/src/index.ts packages/workflow/tests/type2-init.test.ts
git commit -m "feat: add type2 initialization workflow"
```

## Task 5: Type 3 Repair And No-Target-Change Recovery

**Files:**
- Modify: `packages/workflow/src/workflow.ts`
- Test: `packages/workflow/tests/type3-monitor.test.ts`

- [ ] **Step 1: Write failing Type 3 test**

Create `packages/workflow/tests/type3-monitor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createEpisodeStates,
  FakeAgentNodes,
  FakeResourceProvider,
  FakeStorageExecutor,
  reconcileVerifiedFiles,
  runType3Monitoring,
  type MediaTitle,
  type TrackedSeason,
  type VerifiedFile,
} from "../src/index.js";

function qiaochuFixture() {
  const title: MediaTitle = {
    id: "title_qiaochu",
    tmdbId: 289271,
    type: "tv",
    title: "翘楚",
    originalTitle: "翘楚",
    year: 2026,
    aliases: ["Ashes to Crown"],
  };
  const season: TrackedSeason = {
    id: "season_qiaochu_1",
    mediaTitleId: title.id,
    seasonNumber: 1,
    status: "active",
    qualityPreference: "4K",
    storageDirectoryId: "dir_qiaochu_s1",
    totalEpisodes: 24,
    latestAiredEpisode: 14,
    latestAiredSource: "metadata",
  };
  return { title, season };
}

describe("runType3Monitoring", () => {
  it("repairs externally deleted episodes and uses fallback when primary transfer does not materialize", async () => {
    const { title, season } = qiaochuFixture();
    const existingFiles: VerifiedFile[] = Array.from({ length: 12 }, (_, index) => {
      const episode = `S01E${String(index + 1).padStart(2, "0")}`;
      return {
        id: `file_${episode}`,
        storageDirectoryId: season.storageDirectoryId,
        name: `翘楚.${episode}.mkv`,
        sizeBytes: 1_000_000_000,
        episodeCode: episode,
        providerFileId: `provider_${episode}`,
      };
    });
    const initialEpisodes = reconcileVerifiedFiles({
      season,
      episodes: createEpisodeStates({
        trackedSeasonId: season.id,
        seasonNumber: season.seasonNumber,
        totalEpisodes: season.totalEpisodes,
        latestAiredEpisode: season.latestAiredEpisode,
      }),
      files: [
        ...existingFiles,
        {
          id: "missing_old_13",
          storageDirectoryId: season.storageDirectoryId,
          name: "old.S01E13.mkv",
          sizeBytes: 1,
          episodeCode: "S01E13",
          providerFileId: "old_13",
        },
        {
          id: "missing_old_14",
          storageDirectoryId: season.storageDirectoryId,
          name: "old.S01E14.mkv",
          sizeBytes: 1,
          episodeCode: "S01E14",
          providerFileId: "old_14",
        },
      ],
    });
    const storage = new FakeStorageExecutor({
      directories: { [season.storageDirectoryId]: existingFiles },
      transferOutcomes: {
        candidate_1: {
          status: "no_target_change",
          providerMessage: "already transferred elsewhere",
          files: [],
        },
        candidate_2: {
          status: "succeeded",
          providerMessage: "",
          files: [
            {
              id: "restored_13",
              storageDirectoryId: season.storageDirectoryId,
              name: "翘楚.S01E13.restored.mkv",
              sizeBytes: 5_000_000_000,
              episodeCode: "S01E13",
              providerFileId: "restored_provider_13",
            },
          ],
        },
        candidate_3: {
          status: "succeeded",
          providerMessage: "",
          files: [
            {
              id: "restored_14",
              storageDirectoryId: season.storageDirectoryId,
              name: "翘楚.S01E14.restored.mkv",
              sizeBytes: 5_000_000_000,
              episodeCode: "S01E14",
              providerFileId: "restored_provider_14",
            },
          ],
        },
      },
    });
    const resourceProvider = new FakeResourceProvider({
      keywordResults: {
        "翘楚 4K": [
          { title: "翘楚 S01E13 primary", episodeHints: ["S01E13"] },
          { title: "翘楚 S01E13 fallback", episodeHints: ["S01E13"] },
          { title: "翘楚 S01E14 fallback", episodeHints: ["S01E14"] },
        ],
      },
    });

    const result = await runType3Monitoring({
      title,
      season,
      episodes: initialEpisodes,
      keyword: "翘楚 4K",
      resourceProvider,
      storage,
      agents: new FakeAgentNodes(),
    });

    expect(result.status).toBe("succeeded");
    expect(result.transferAttempts.map((attempt) => attempt.status)).toEqual([
      "no_target_change",
      "succeeded",
      "succeeded",
    ]);
    expect(result.obtainedEpisodes).toContain("S01E13");
    expect(result.obtainedEpisodes).toContain("S01E14");
    expect(result.notification.body).toContain("2 episodes restored");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- packages/workflow/tests/type3-monitor.test.ts
```

Expected: FAIL because `runType3Monitoring` does not exist.

- [ ] **Step 3: Implement Type 3 workflow**

Append to `packages/workflow/src/workflow.ts`:

```ts
export async function runType3Monitoring(input: {
  title: MediaTitle;
  season: TrackedSeason;
  episodes: EpisodeState[];
  keyword: string;
  resourceProvider: ResourceProvider;
  storage: StorageExecutor;
  agents: AgentNodes;
}): Promise<WorkflowResult> {
  const auditEvents: WorkflowResult["auditEvents"] = [];
  const currentFiles = await input.storage.listVideoFiles(input.season.storageDirectoryId);
  let episodes = reconcileVerifiedFiles({
    season: input.season,
    episodes: input.episodes.map((episode) => ({
      ...episode,
      obtained: currentFiles.some((file) => file.episodeCode === episode.episodeCode),
      verifiedFileIds: currentFiles.filter((file) => file.episodeCode === episode.episodeCode).map((file) => file.id),
    })),
    files: currentFiles,
  });
  const actionableMissing = episodes
    .filter((episode) => episode.airStatus === "aired" && !episode.obtained)
    .map((episode) => episode.episodeCode);

  if (actionableMissing.length === 0) {
    return {
      status: "succeeded",
      episodes,
      obtainedEpisodes: episodes.filter((episode) => episode.obtained).map((episode) => episode.episodeCode),
      transferAttempts: [],
      decisions: [],
      notification: {
        id: "notification_type3_noop",
        workflowRunId: "run_type3",
        kind: "already_current",
        title: `${input.title.title} already current`,
        body: "0 episodes restored",
        createdAt: "2026-06-11T00:00:00.000Z",
      },
      auditEvents,
    };
  }

  const snapshot = await input.resourceProvider.search({ keyword: input.keyword });
  const decision = await input.agents.selectEpisodeCoverage({
    snapshotId: snapshot.id,
    candidates: snapshot.candidates,
    missingEpisodes: actionableMissing,
    latestAiredEpisode: input.season.latestAiredEpisode,
  });

  const attempts: TransferAttempt[] = [];
  const restored = new Set<string>();

  for (const candidateId of decision.selectedCandidateIds) {
    const attempt = await input.storage.transfer({
      workflowRunId: "run_type3",
      directoryId: input.season.storageDirectoryId,
      candidateId,
    });
    attempts.push(attempt);

    const filesAfterAttempt = await input.storage.listVideoFiles(input.season.storageDirectoryId);
    const restoredAfterAttempt = filesAfterAttempt
      .filter((file) => actionableMissing.includes(file.episodeCode))
      .map((file) => file.episodeCode);
    for (const episodeCode of restoredAfterAttempt) {
      restored.add(episodeCode);
    }
  }

  if (restored.size < actionableMissing.length) {
    const stillMissing = actionableMissing.filter((episodeCode) => !restored.has(episodeCode));
    const fallbackCandidates = snapshot.candidates.filter((candidate) =>
      candidate.episodeHints.some((episodeCode) => stillMissing.includes(episodeCode)) &&
      !decision.selectedCandidateIds.includes(candidate.id),
    );

    for (const candidate of fallbackCandidates) {
      const attempt = await input.storage.transfer({
        workflowRunId: "run_type3",
        directoryId: input.season.storageDirectoryId,
        candidateId: candidate.id,
      });
      attempts.push(attempt);
      const filesAfterAttempt = await input.storage.listVideoFiles(input.season.storageDirectoryId);
      for (const file of filesAfterAttempt) {
        if (stillMissing.includes(file.episodeCode)) {
          restored.add(file.episodeCode);
        }
      }
    }
  }

  await input.storage.flattenDirectory(input.season.storageDirectoryId);
  const finalFiles = await input.storage.listVideoFiles(input.season.storageDirectoryId);
  episodes = reconcileVerifiedFiles({
    season: input.season,
    episodes,
    files: finalFiles,
  });

  const obtainedEpisodes = episodes.filter((episode) => episode.obtained).map((episode) => episode.episodeCode);

  return {
    status: "succeeded",
    episodes,
    obtainedEpisodes,
    transferAttempts: attempts,
    decisions: [decision],
    notification: {
      id: "notification_type3",
      workflowRunId: "run_type3",
      kind: "episodes_restored",
      title: `${input.title.title} episodes restored`,
      body: `${restored.size} episodes restored`,
      createdAt: "2026-06-11T00:00:00.000Z",
    },
    auditEvents,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- packages/workflow/tests/type3-monitor.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/workflow/src/workflow.ts packages/workflow/tests/type3-monitor.test.ts
git commit -m "feat: add type3 repair workflow"
```

## Task 6: Provider-Ahead And Pre-Search Verification Boundaries

**Files:**
- Modify: `packages/workflow/tests/type3-monitor.test.ts`
- Modify: `packages/workflow/src/workflow.ts` if tests expose gaps

- [ ] **Step 1: Add failing provider-ahead test**

Append to `packages/workflow/tests/type3-monitor.test.ts`:

```ts
  it("records provider-ahead files without waiting for TMDB to catch up", async () => {
    const { title, season } = qiaochuFixture();
    const aheadSeason = { ...season, latestAiredEpisode: 20 };
    const storage = new FakeStorageExecutor({
      directories: { [aheadSeason.storageDirectoryId]: [] },
      transferOutcomes: {
        candidate_1: {
          status: "succeeded",
          providerMessage: "",
          files: [
            {
              id: "file_20",
              storageDirectoryId: aheadSeason.storageDirectoryId,
              name: "翘楚.S01E20.mkv",
              sizeBytes: 1_000_000_000,
              episodeCode: "S01E20",
              providerFileId: "provider_20",
            },
            {
              id: "file_21",
              storageDirectoryId: aheadSeason.storageDirectoryId,
              name: "翘楚.S01E21.mkv",
              sizeBytes: 1_000_000_000,
              episodeCode: "S01E21",
              providerFileId: "provider_21",
            },
          ],
        },
      },
    });
    const resourceProvider = new FakeResourceProvider({
      keywordResults: {
        "翘楚 4K": [
          { title: "翘楚 S01E20-S01E21 4K", episodeHints: ["S01E20", "S01E21"] },
        ],
      },
    });
    const initialEpisodes = createEpisodeStates({
      trackedSeasonId: aheadSeason.id,
      seasonNumber: aheadSeason.seasonNumber,
      totalEpisodes: aheadSeason.totalEpisodes,
      latestAiredEpisode: aheadSeason.latestAiredEpisode,
    });

    const result = await runType3Monitoring({
      title,
      season: aheadSeason,
      episodes: initialEpisodes,
      keyword: "翘楚 4K",
      resourceProvider,
      storage,
      agents: new FakeAgentNodes(),
    });

    expect(result.episodes.find((episode) => episode.episodeCode === "S01E21")).toMatchObject({
      obtained: true,
      metadataStatus: "provider_ahead",
    });
    expect(result.providerAheadEpisodes).toEqual(["S01E21"]);
  });
```

- [ ] **Step 2: Add failing pre-search verification test**

Append to `packages/workflow/tests/type3-monitor.test.ts`:

```ts
  it("marks an episode obtained without searching when the target directory already has it", async () => {
    const { title, season } = qiaochuFixture();
    const currentFiles = Array.from({ length: 13 }, (_, index) => {
      const episode = `S01E${String(index + 1).padStart(2, "0")}`;
      return {
        id: `file_${episode}`,
        storageDirectoryId: season.storageDirectoryId,
        name: `翘楚.${episode}.mkv`,
        sizeBytes: 1_000_000_000,
        episodeCode: episode,
        providerFileId: `provider_${episode}`,
      };
    });
    const initialEpisodes = reconcileVerifiedFiles({
      season,
      episodes: createEpisodeStates({
        trackedSeasonId: season.id,
        seasonNumber: season.seasonNumber,
        totalEpisodes: season.totalEpisodes,
        latestAiredEpisode: 13,
      }),
      files: currentFiles.slice(0, 12),
    });
    const storage = new FakeStorageExecutor({
      directories: { [season.storageDirectoryId]: currentFiles },
    });
    const resourceProvider = new FakeResourceProvider({
      keywordErrors: { "翘楚 4K": "search should not be called" },
      keywordResults: {},
    });

    const result = await runType3Monitoring({
      title,
      season: { ...season, latestAiredEpisode: 13 },
      episodes: initialEpisodes,
      keyword: "翘楚 4K",
      resourceProvider,
      storage,
      agents: new FakeAgentNodes(),
    });

    expect(result.transferAttempts).toEqual([]);
    expect(result.episodes.find((episode) => episode.episodeCode === "S01E13")).toMatchObject({
      obtained: true,
    });
  });
```

- [ ] **Step 3: Run tests to verify the provider-ahead assertion fails**

Run:

```bash
npm test -- packages/workflow/tests/type3-monitor.test.ts
```

Expected: FAIL because `WorkflowResult` does not expose `providerAheadEpisodes`.

- [ ] **Step 4: Add provider-ahead summary to workflow results**

Modify `WorkflowResult` in `packages/workflow/src/workflow.ts`:

Add:

```ts
providerAheadEpisodes: string[];
```

In each `WorkflowResult` return path, compute:

```ts
const providerAheadEpisodes = episodes
  .filter((episode) => episode.obtained && episode.metadataStatus === "provider_ahead")
  .map((episode) => episode.episodeCode);
```

Then include `providerAheadEpisodes` in the returned object.

- [ ] **Step 5: Run full workflow tests**

Run:

```bash
npm test -- packages/workflow/tests/type3-monitor.test.ts packages/workflow/tests/invariants.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/workflow/src/workflow.ts packages/workflow/tests/type3-monitor.test.ts
git commit -m "feat: handle provider-ahead episode state"
```

## Task 7: Full Verification And Documentation Note

**Files:**
- Modify: `docs/superpowers/specs/2026-06-11-media-track-workflow-kernel-design.md`
- Modify: `docs/workflow-product-architecture.md` only if implementation discoveries contradict docs.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test
npm run typecheck
./.venv/bin/python -m pytest
```

Expected:

- Vitest suite passes.
- TypeScript typecheck passes.
- Existing Python suite still passes.

- [ ] **Step 2: Update docs if implementation changed terminology**

If implementation introduced different names than the spec, update the spec to match actual exported types.

Do not add new product scope.

- [ ] **Step 3: Final git status review**

Run:

```bash
git status --short
```

Expected: only intended files are modified or untracked.

- [ ] **Step 4: Commit docs alignment**

```bash
git add docs/superpowers/specs/2026-06-11-media-track-workflow-kernel-design.md docs/workflow-product-architecture.md
git commit -m "docs: align workflow kernel design"
```
