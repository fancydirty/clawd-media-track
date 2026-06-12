# Acquisition Planning Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three serial agent nodes (ResourceDiscovery → CandidateMatch → EpisodeCoverage) with one `AcquisitionPlanningAgent` that owns the whole semantic acquisition judgment inside a deterministic workflow harness, plus output-contract validators, a first-class `no_coverage` outcome, and a bounded failure-evidence re-planning loop.

**Architecture:** The skill's defensive rules split three ways: (1) rules dissolved by the architecture (step order, evidence gathering, transfer binding, verification — all workflow code, no prompts needed); (2) rules that become thin validators at the model output boundary (snapshot scoping, disposition totality, no-just-in-case mapping); (3) irreducible semantic judgment that lives in the planning agent's system prompt (wrong-target rejection, season strictness, black-box gate, keyword recovery). The workflow invokes the single planning node — possibly multiple times with accumulated failure evidence — and owns every side effect. Mechanical candidate selection (by hints, by order, by regex) is forbidden in workflow code.

**Tech Stack:** TypeScript, Vitest, Vercel AI SDK v6 (`generateText` + `Output.object` + tool loop), zod v4, existing `@media-track/workflow` package.

**Non-goals (follow-up plans):** DedupAgent semantic file→episode mapping node; Type 3 worker/cron entrypoint; multi-season package flows beyond the existing package normalizer.

**Migration strategy:** additive-first. Tasks 1–2 add new code beside the old pipeline (suite stays green). Task 3 switches `workflow.ts` to the new node. Task 4 deletes the old nodes/specs/schemas. Task 5 adds the live smoke harness. Task 6 aligns docs and runs final verification.

---

## File Structure

- Create: `packages/workflow/src/plan-validation.ts` — output-contract validators + `deriveAgentDecision` (model boundary, no I/O)
- Create: `packages/workflow/src/agent-nodes/acquisition-planning-agent.ts` — node spec (system prompt + tool input schema)
- Create: `packages/workflow/src/acquisition-planning-smoke.ts` — live smoke harness (no storage executor)
- Create: `scripts/agent-planning-smoke.mjs` — CLI to fire the smoke against real Mimo + PanSou
- Create: `packages/workflow/tests/plan-validation.test.ts`
- Create: `packages/workflow/tests/acquisition-planning-smoke.test.ts`
- Modify: `packages/workflow/src/domain.ts` — add `AcquisitionPlan`, `CandidateDisposition`, `AcquisitionFailureEvidence`, extend `WorkflowStatus`; later delete `CandidateMatchDecision`/`ResourceDiscoveryDecision`
- Modify: `packages/workflow/src/ports.ts` — add `planAcquisition` to `AgentNodes`; later delete the four old methods
- Modify: `packages/workflow/src/fakes.ts` — `FakeAgentNodes.planAcquisition`; later delete old fake methods
- Modify: `packages/workflow/src/ai-sdk-agent.ts` — `VercelAiAgentNodes.planAcquisition`; later delete old methods + schemas
- Modify: `packages/workflow/src/workflow.ts` — shared acquisition core with failure-evidence loop + `no_coverage`
- Modify: `packages/workflow/src/agent-node-types.ts`, `agent-node-specs.ts` — register new node; later drop old names
- Delete (Task 4): `agent-nodes/keyword-agent.ts`, `agent-nodes/resource-discovery-agent.ts`, `agent-nodes/candidate-match-agent.ts`, `agent-nodes/episode-coverage-agent.ts`, `agent-nodes/quality-selection-agent.ts`
- Modify: `packages/workflow/src/index.ts`, `.env.example`, `docs/superpowers/specs/2026-06-11-media-track-workflow-kernel-design.md`, `docs/workflow-product-architecture.md`

---

### Task 1: Plan Validation Module And Domain Types

**Files:**
- Modify: `packages/workflow/src/domain.ts`
- Create: `packages/workflow/src/plan-validation.ts`
- Create: `packages/workflow/tests/plan-validation.test.ts`
- Modify: `packages/workflow/src/index.ts`

- [ ] **Step 1: Add domain types**

In `packages/workflow/src/domain.ts`:

Replace the `WorkflowStatus` line:

```ts
export type WorkflowStatus = "queued" | "running" | "succeeded" | "failed" | "partial" | "no_coverage";
```

Export the currently-private `episodePartsFromCode` (change `function episodePartsFromCode` to `export function episodePartsFromCode`).

Append after `ResourceDiscoveryDecision`:

```ts
export type CandidateDispositionKind = "selected" | "rejected" | "uncertain";

export interface CandidateDisposition {
  candidateId: string;
  disposition: CandidateDispositionKind;
  /** Episode codes this candidate covers; required non-empty for "selected". */
  episodes: string[];
  reason: string;
}

export interface AcquisitionPlan {
  node: string;
  /** Snapshot id observed in this planning run, or null when nothing covers the need. */
  selectedSnapshotId: string | null;
  searchedKeywords: string[];
  candidateDispositions: CandidateDisposition[];
  confidence: Confidence;
  reason: string;
}

export interface AcquisitionFailureEvidence {
  candidateId: string;
  candidateTitle: string;
  transferStatus: TransferStatus;
  providerMessage: string;
  episodesStillMissing: string[];
}
```

- [ ] **Step 2: Write failing validation tests**

Create `packages/workflow/tests/plan-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  deriveAgentDecision,
  validateAcquisitionPlan,
  type AcquisitionPlan,
  type ResourceSnapshot,
} from "../src/index.js";

function snapshotFixture(): ResourceSnapshot {
  return {
    id: "snapshot_1",
    provider: "fake",
    keyword: "翘楚 4K",
    candidates: [
      {
        id: "snapshot_1_candidate_1",
        snapshotId: "snapshot_1",
        index: 0,
        title: "翘楚 S01E13 4K",
        type: "115",
        source: "fake",
        episodeHints: ["S01E13"],
        qualityHints: ["4K"],
        providerPayload: {},
      },
      {
        id: "snapshot_1_candidate_2",
        snapshotId: "snapshot_1",
        index: 1,
        title: "无关资源",
        type: "115",
        source: "fake",
        episodeHints: [],
        qualityHints: [],
        providerPayload: {},
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function planFixture(overrides: Partial<AcquisitionPlan> = {}): AcquisitionPlan {
  return {
    node: "test_planning",
    selectedSnapshotId: "snapshot_1",
    searchedKeywords: ["翘楚 4K"],
    candidateDispositions: [
      {
        candidateId: "snapshot_1_candidate_1",
        disposition: "selected",
        episodes: ["S01E13"],
        reason: "Exact missing episode.",
      },
      {
        candidateId: "snapshot_1_candidate_2",
        disposition: "rejected",
        episodes: [],
        reason: "Wrong target.",
      },
    ],
    confidence: "high",
    reason: "Found exact coverage.",
    ...overrides,
  };
}

describe("validateAcquisitionPlan", () => {
  it("accepts a total, covering plan and returns ordered selected candidates", () => {
    const result = validateAcquisitionPlan({
      plan: planFixture(),
      snapshots: [snapshotFixture()],
      missingEpisodes: ["S01E13"],
      seasonNumber: 1,
    });

    expect(result.selectedSnapshot?.id).toBe("snapshot_1");
    expect(result.selectedCandidates).toHaveLength(1);
    expect(result.selectedCandidates[0]?.candidate.id).toBe("snapshot_1_candidate_1");
    expect(result.selectedCandidates[0]?.episodes).toEqual(["S01E13"]);
  });

  it("rejects a plan whose selected snapshot was not observed in this run", () => {
    expect(() =>
      validateAcquisitionPlan({
        plan: planFixture({ selectedSnapshotId: "snapshot_unseen" }),
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/not observed/);
  });

  it("rejects a plan that does not account for every candidate in the selected snapshot", () => {
    const plan = planFixture();
    plan.candidateDispositions = [plan.candidateDispositions[0]!];

    expect(() =>
      validateAcquisitionPlan({
        plan,
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/every candidate/);
  });

  it("rejects duplicate dispositions for one candidate", () => {
    const plan = planFixture();
    plan.candidateDispositions = [
      ...plan.candidateDispositions,
      { candidateId: "snapshot_1_candidate_1", disposition: "rejected", episodes: [], reason: "dup" },
    ];

    expect(() =>
      validateAcquisitionPlan({
        plan,
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/more than one disposition/);
  });

  it("rejects a selected candidate that maps to no actionable missing episode", () => {
    const plan = planFixture();
    plan.candidateDispositions[0]!.episodes = ["S01E01"];

    expect(() =>
      validateAcquisitionPlan({
        plan,
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/missing episode/);
  });

  it("rejects a selected candidate with an empty episode mapping", () => {
    const plan = planFixture();
    plan.candidateDispositions[0]!.episodes = [];

    expect(() =>
      validateAcquisitionPlan({
        plan,
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/empty episode mapping/);
  });

  it("rejects episode codes from a different season", () => {
    const plan = planFixture();
    plan.candidateDispositions[0]!.episodes = ["S02E13", "S01E13"];

    expect(() =>
      validateAcquisitionPlan({
        plan,
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/season/);
  });

  it("allows provider-ahead episodes to ride along with a missing-episode mapping", () => {
    const plan = planFixture();
    plan.candidateDispositions[0]!.episodes = ["S01E13", "S01E14"];

    const result = validateAcquisitionPlan({
      plan,
      snapshots: [snapshotFixture()],
      missingEpisodes: ["S01E13"],
      seasonNumber: 1,
    });

    expect(result.selectedCandidates[0]?.episodes).toEqual(["S01E13", "S01E14"]);
  });

  it("accepts a no-coverage plan and forbids selected dispositions inside it", () => {
    const noCoverage = validateAcquisitionPlan({
      plan: planFixture({
        selectedSnapshotId: null,
        candidateDispositions: [
          { candidateId: "snapshot_1_candidate_1", disposition: "rejected", episodes: [], reason: "expired" },
        ],
      }),
      snapshots: [snapshotFixture()],
      missingEpisodes: ["S01E13"],
      seasonNumber: 1,
    });
    expect(noCoverage.selectedSnapshot).toBeNull();
    expect(noCoverage.selectedCandidates).toEqual([]);

    expect(() =>
      validateAcquisitionPlan({
        plan: planFixture({ selectedSnapshotId: null }),
        snapshots: [snapshotFixture()],
        missingEpisodes: ["S01E13"],
        seasonNumber: 1,
      }),
    ).toThrowError(/no-coverage/);
  });
});

describe("deriveAgentDecision", () => {
  it("derives a persistable AgentDecision split by latest aired episode", () => {
    const plan = planFixture();
    plan.candidateDispositions[0]!.episodes = ["S01E13", "S01E15"];

    const decision = deriveAgentDecision({
      plan,
      missingEpisodes: ["S01E13"],
      latestAiredEpisode: 14,
    });

    expect(decision).toEqual({
      node: "test_planning",
      snapshotId: "snapshot_1",
      selectedCandidateIds: ["snapshot_1_candidate_1"],
      episodeMapping: { snapshot_1_candidate_1: ["S01E13"] },
      providerAheadEpisodeMapping: { snapshot_1_candidate_1: ["S01E15"] },
      rejectedCandidateIds: ["snapshot_1_candidate_2"],
      confidence: "high",
      reason: "Found exact coverage.",
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- packages/workflow/tests/plan-validation.test.ts`
Expected: FAIL — `validateAcquisitionPlan` is not exported.

- [ ] **Step 4: Implement plan-validation**

Create `packages/workflow/src/plan-validation.ts`:

```ts
import {
  episodePartsFromCode,
  type AcquisitionPlan,
  type AgentDecision,
  type ResourceCandidate,
  type ResourceSnapshot,
} from "./domain.js";

export interface SelectedTransferCandidate {
  candidate: ResourceCandidate;
  episodes: string[];
}

export interface ValidatedAcquisitionPlan {
  selectedSnapshot: ResourceSnapshot | null;
  selectedCandidates: SelectedTransferCandidate[];
}

/**
 * Output contract for the planning agent. The agent is free to judge; this
 * gate makes structurally bad judgments impossible to execute:
 * - the selected snapshot must have been observed in this planning run
 * - the plan must give exactly one disposition for EVERY candidate in the
 *   selected snapshot (silent omission of evidence is rejected)
 * - every selected candidate must map to at least one actionable missing
 *   episode (no just-in-case transfers)
 * - episode codes must belong to the tracked season
 */
export function validateAcquisitionPlan(input: {
  plan: AcquisitionPlan;
  snapshots: ResourceSnapshot[];
  missingEpisodes: string[];
  seasonNumber: number;
}): ValidatedAcquisitionPlan {
  const { plan } = input;
  const observedCandidates = new Map<string, ResourceCandidate>();
  for (const snapshot of input.snapshots) {
    for (const candidate of snapshot.candidates) {
      observedCandidates.set(candidate.id, candidate);
    }
  }

  const seen = new Set<string>();
  for (const disposition of plan.candidateDispositions) {
    if (seen.has(disposition.candidateId)) {
      throw new Error(`Acquisition plan gave more than one disposition for ${disposition.candidateId}`);
    }
    seen.add(disposition.candidateId);
    if (!observedCandidates.has(disposition.candidateId)) {
      throw new Error(
        `Acquisition plan referenced candidate ${disposition.candidateId} that was not observed in this run`,
      );
    }
  }

  if (plan.selectedSnapshotId === null) {
    const selected = plan.candidateDispositions.filter((d) => d.disposition === "selected");
    if (selected.length > 0) {
      throw new Error("A no-coverage acquisition plan must not contain selected dispositions");
    }
    return { selectedSnapshot: null, selectedCandidates: [] };
  }

  const selectedSnapshot = input.snapshots.find((snapshot) => snapshot.id === plan.selectedSnapshotId);
  if (selectedSnapshot === undefined) {
    throw new Error(`Acquisition plan selected snapshot ${plan.selectedSnapshotId} that was not observed in this run`);
  }

  const snapshotCandidateIds = new Set(selectedSnapshot.candidates.map((candidate) => candidate.id));
  for (const disposition of plan.candidateDispositions) {
    if (!snapshotCandidateIds.has(disposition.candidateId)) {
      throw new Error(
        `Acquisition plan disposition for ${disposition.candidateId} is outside the selected snapshot ${selectedSnapshot.id}`,
      );
    }
  }
  const missingDispositions = selectedSnapshot.candidates.filter((candidate) => !seen.has(candidate.id));
  if (missingDispositions.length > 0) {
    throw new Error(
      `Acquisition plan must give a disposition for every candidate in the selected snapshot; missing: ${missingDispositions
        .map((candidate) => candidate.id)
        .join(", ")}`,
    );
  }

  const missing = new Set(input.missingEpisodes);
  const selectedCandidates: SelectedTransferCandidate[] = [];
  for (const candidate of selectedSnapshot.candidates) {
    const disposition = plan.candidateDispositions.find((d) => d.candidateId === candidate.id);
    if (disposition === undefined || disposition.disposition !== "selected") {
      continue;
    }
    if (disposition.episodes.length === 0) {
      throw new Error(`Selected candidate ${candidate.id} has an empty episode mapping`);
    }
    for (const code of disposition.episodes) {
      const parts = episodePartsFromCode(code);
      if (parts.seasonNumber !== input.seasonNumber) {
        throw new Error(
          `Selected candidate ${candidate.id} maps episode ${code} from a different season than season ${input.seasonNumber}`,
        );
      }
    }
    if (!disposition.episodes.some((code) => missing.has(code))) {
      throw new Error(
        `Selected candidate ${candidate.id} does not map to any actionable missing episode (no just-in-case transfers)`,
      );
    }
    selectedCandidates.push({ candidate, episodes: [...disposition.episodes] });
  }

  return { selectedSnapshot, selectedCandidates };
}

export function deriveAgentDecision(input: {
  plan: AcquisitionPlan;
  missingEpisodes: string[];
  latestAiredEpisode: number;
}): AgentDecision {
  const { plan } = input;
  if (plan.selectedSnapshotId === null) {
    throw new Error("Cannot derive an AgentDecision from a no-coverage plan");
  }
  const missing = new Set(input.missingEpisodes);
  const selected = plan.candidateDispositions.filter((d) => d.disposition === "selected");
  const episodeMapping: Record<string, string[]> = {};
  const providerAheadEpisodeMapping: Record<string, string[]> = {};
  for (const disposition of selected) {
    const missingCovered = disposition.episodes.filter((code) => missing.has(code));
    if (missingCovered.length > 0) {
      episodeMapping[disposition.candidateId] = missingCovered;
    }
    const providerAhead = disposition.episodes.filter(
      (code) => episodePartsFromCode(code).episodeNumber > input.latestAiredEpisode,
    );
    if (providerAhead.length > 0) {
      providerAheadEpisodeMapping[disposition.candidateId] = providerAhead;
    }
  }

  return {
    node: plan.node,
    snapshotId: plan.selectedSnapshotId,
    selectedCandidateIds: selected.map((d) => d.candidateId),
    episodeMapping,
    providerAheadEpisodeMapping,
    rejectedCandidateIds: plan.candidateDispositions
      .filter((d) => d.disposition === "rejected")
      .map((d) => d.candidateId),
    confidence: plan.confidence,
    reason: plan.reason,
  };
}
```

Add to `packages/workflow/src/index.ts` after the `./workflow.js` export line:

```ts
export * from "./plan-validation.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- packages/workflow/tests/plan-validation.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/workflow/src/domain.ts packages/workflow/src/plan-validation.ts packages/workflow/src/index.ts packages/workflow/tests/plan-validation.test.ts
git commit -m "feat: add acquisition plan validation contract"
```

### Task 2: planAcquisition Port, Fake, Spec, And AI SDK Adapter (Additive)

**Files:**
- Modify: `packages/workflow/src/ports.ts`
- Modify: `packages/workflow/src/agent-node-types.ts`
- Create: `packages/workflow/src/agent-nodes/acquisition-planning-agent.ts`
- Modify: `packages/workflow/src/agent-node-specs.ts`
- Modify: `packages/workflow/src/fakes.ts`
- Modify: `packages/workflow/src/ai-sdk-agent.ts`
- Modify: `packages/workflow/tests/invariants.test.ts` (append)
- Modify: `packages/workflow/tests/ai-sdk-agent.test.ts` (append)

Old methods stay in place during this task; everything is additive so the suite stays green.

- [ ] **Step 1: Write failing fake-agent tests**

Append to `packages/workflow/tests/invariants.test.ts` (imports merge with existing):

```ts
describe("FakeAgentNodes.planAcquisition", () => {
  it("selects a minimal covering set with full dispositions", async () => {
    const provider = new FakeResourceProvider({
      keywordResults: {
        "翘楚 4K": [
          { title: "翘楚 S01E13 primary", episodeHints: ["S01E13"] },
          { title: "翘楚 S01E13 fallback", episodeHints: ["S01E13"] },
          { title: "翘楚 S01E14 fallback", episodeHints: ["S01E14"] },
        ],
      },
    });
    const agent = new FakeAgentNodes();

    const result = await agent.planAcquisition({
      title: "翘楚",
      aliases: ["Ashes to Crown"],
      seasonNumber: 1,
      qualityPreference: "4K",
      missingEpisodes: ["S01E13", "S01E14"],
      latestAiredEpisode: 14,
      initialKeyword: "翘楚 4K",
      failureEvidence: [],
      searchResources: ({ keyword }) => provider.search({ keyword }),
    });

    expect(result.plan.selectedSnapshotId).toBe("snapshot_1");
    expect(result.plan.candidateDispositions).toHaveLength(3);
    const selected = result.plan.candidateDispositions.filter((d) => d.disposition === "selected");
    expect(selected.map((d) => d.candidateId)).toEqual(["snapshot_1_candidate_1", "snapshot_1_candidate_3"]);
    expect(result.snapshots).toHaveLength(1);
  });

  it("avoids candidates named in failure evidence on a re-planning pass", async () => {
    const provider = new FakeResourceProvider({
      keywordResults: {
        "翘楚 4K": [
          { title: "翘楚 S01E13 primary", episodeHints: ["S01E13"] },
          { title: "翘楚 S01E13 fallback", episodeHints: ["S01E13"] },
        ],
      },
    });
    const agent = new FakeAgentNodes();

    const result = await agent.planAcquisition({
      title: "翘楚",
      aliases: [],
      seasonNumber: 1,
      qualityPreference: "4K",
      missingEpisodes: ["S01E13"],
      latestAiredEpisode: 14,
      initialKeyword: "翘楚 4K",
      failureEvidence: [
        {
          candidateId: "snapshot_0_candidate_1",
          candidateTitle: "翘楚 S01E13 primary",
          transferStatus: "no_target_change",
          providerMessage: "already transferred elsewhere",
          episodesStillMissing: ["S01E13"],
        },
      ],
      searchResources: ({ keyword }) => provider.search({ keyword }),
    });

    const selected = result.plan.candidateDispositions.filter((d) => d.disposition === "selected");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.candidateId).toBe("snapshot_1_candidate_2");
  });

  it("recovers from keyword errors and returns a no-coverage plan when nothing covers", async () => {
    const provider = new FakeResourceProvider({
      keywordErrors: { "翘楚 4K": "provider 400" },
      keywordResults: { "翘楚": [] },
    });
    const agent = new FakeAgentNodes();

    const result = await agent.planAcquisition({
      title: "翘楚",
      aliases: [],
      seasonNumber: 1,
      qualityPreference: "4K",
      missingEpisodes: ["S01E13"],
      latestAiredEpisode: 14,
      initialKeyword: "翘楚 4K",
      failureEvidence: [],
      searchResources: ({ keyword }) => provider.search({ keyword }),
    });

    expect(result.plan.selectedSnapshotId).toBeNull();
    expect(result.plan.searchedKeywords).toContain("翘楚 4K");
    expect(
      result.trace.some(
        (event) =>
          event.type === "tool_result" &&
          typeof event.output === "object" &&
          event.output !== null &&
          "error" in event.output,
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- packages/workflow/tests/invariants.test.ts`
Expected: FAIL — `planAcquisition` does not exist.

- [ ] **Step 3: Add port types**

In `packages/workflow/src/ports.ts`, extend the domain type import with `AcquisitionFailureEvidence` and `AcquisitionPlan`, then add above `AgentNodes`:

```ts
export interface AcquisitionPlanningInput {
  title: string;
  aliases: string[];
  seasonNumber: number;
  qualityPreference: string;
  missingEpisodes: string[];
  latestAiredEpisode: number;
  initialKeyword: string;
  failureEvidence: AcquisitionFailureEvidence[];
  searchResources(input: { keyword: string }): Promise<ResourceSnapshot>;
}

export interface AcquisitionPlanningResult {
  plan: AcquisitionPlan;
  snapshots: ResourceSnapshot[];
  trace: AgentNodeTraceEvent[];
}
```

and add to the `AgentNodes` interface (keep the old methods for now):

```ts
  planAcquisition(input: AcquisitionPlanningInput): Promise<AcquisitionPlanningResult>;
```

- [ ] **Step 4: Register node name and spec**

In `packages/workflow/src/agent-node-types.ts` add `"AcquisitionPlanningAgent"` to `AgentNodeName` and `"acquisition_planning"` to the `schemaName` union.

Create `packages/workflow/src/agent-nodes/acquisition-planning-agent.ts`:

```ts
import { z } from "zod";
import type { AgentNodeSpec } from "../agent-node-types.js";
import { SHARED_AGENT_NODE_BOUNDARY } from "./shared.js";

export const ACQUISITION_PLANNING_AGENT_SPEC = {
  nodeName: "AcquisitionPlanningAgent",
  schemaName: "acquisition_planning",
  maxSteps: 12,
  system: `${SHARED_AGENT_NODE_BOUNDARY}
You own the complete acquisition judgment for one tracked season: search strategy, target matching, episode mapping, and resource selection are one deliberation, not separate filters.

Search strategy:
- Start from the provided initialKeyword, then try alternates when results are missing, empty, or noisy: aliases, original titles, traditional/simplified variants, source-material names, quality suffixes like "4K", media-type prefixes like "电视剧".
- A provider error or empty result for one keyword is evidence, not the end. The searchResources tool returns {keyword, error} on failure; read it and adapt.
- Do not assume provider ordering is stable. Judge only ids observed in this run.

Judgment rules (apply simultaneously over the full candidate evidence):
- Wrong-target rejection: a candidate must clearly refer to the target title; reject lookalikes that only matched keyword noise.
- Season strictness: for season 1 a title without explicit season markers may match; for season 2+ the title must explicitly indicate the tracked season, otherwise reject.
- Episode mapping honesty: map a candidate to episodes only when its title clearly indicates them. If a title explicitly limits its range (e.g. "更新至03集") it does not cover episodes beyond that range. If coverage is unclear, mark the candidate "uncertain" — never "selected".
- No just-in-case: never select a candidate that does not clearly cover at least one missing episode. "Transfer to see what is inside" is forbidden.
- Transparency gate: prefer candidates whose titles state episode/quality/size details. Select an opaque bundle only when no transparent candidate covers the need, and say so in its reason.
- Low-overlap preference: prefer exact-episode or small-range resources over massive packs when both cover the need; if you still choose a pack, justify the tradeoff in its reason.
- Failure evidence: candidates listed in failureEvidence did not materialize files. Do not select the same dead resource again; choose alternates or search differently.

Output contract:
- Select at most one snapshotId, and it must come from a searchResources observation in this run.
- Give exactly one disposition (selected / rejected / uncertain) for EVERY candidate in the selected snapshot. Silent omission is a contract violation.
- Each selected candidate must list the episode codes it covers (format S01E05) including any episodes ahead of the latest aired cursor.
- If nothing covers the missing episodes after a reasonable search effort, return selectedSnapshotId null with your reasoning. "Not found yet" is a valid, honest outcome.`,
  toolInputSchemas: {
    searchResources: z.object({
      keyword: z.string().min(1),
    }),
  },
} as const satisfies AgentNodeSpec;
```

In `packages/workflow/src/agent-node-specs.ts` import it and add `AcquisitionPlanningAgent: ACQUISITION_PLANNING_AGENT_SPEC,` to `AGENT_NODE_SPECS`.

- [ ] **Step 5: Implement FakeAgentNodes.planAcquisition**

In `packages/workflow/src/fakes.ts`, add imports for `AcquisitionPlan`, `CandidateDisposition`, `AcquisitionFailureEvidence` from domain and `AcquisitionPlanningInput`, `AcquisitionPlanningResult` from ports, then add this method to `FakeAgentNodes`:

```ts
  async planAcquisition(input: AcquisitionPlanningInput): Promise<AcquisitionPlanningResult> {
    const failedTitles = new Set(input.failureEvidence.map((evidence) => evidence.candidateTitle));
    const keywords = uniqueKeywords([
      input.initialKeyword,
      input.title,
      ...input.aliases,
      `${input.title} 4K`,
    ]);
    const snapshots: ResourceSnapshot[] = [];
    const searchedKeywords: string[] = [];
    const trace: AcquisitionPlanningResult["trace"] = [
      {
        type: "node_start",
        nodeName: "AcquisitionPlanningAgent",
        schemaName: "acquisition_planning",
        maxSteps: 12,
      },
    ];

    for (const keyword of keywords) {
      searchedKeywords.push(keyword);
      trace.push({ type: "tool_call", nodeName: "AcquisitionPlanningAgent", toolName: "searchResources", input: { keyword } });
      let snapshot: ResourceSnapshot;
      try {
        snapshot = await input.searchResources({ keyword });
      } catch (error) {
        trace.push({
          type: "tool_result",
          nodeName: "AcquisitionPlanningAgent",
          toolName: "searchResources",
          output: { keyword, error: errorMessage(error) },
        });
        continue;
      }
      snapshots.push(snapshot);
      trace.push({
        type: "tool_result",
        nodeName: "AcquisitionPlanningAgent",
        toolName: "searchResources",
        output: { snapshotId: snapshot.id, keyword: snapshot.keyword, candidateCount: snapshot.candidates.length },
      });
      if (snapshot.candidates.length === 0) {
        continue;
      }

      const dispositions = minimalCoveringDispositions({
        candidates: snapshot.candidates,
        missingEpisodes: input.missingEpisodes,
        failedTitles,
      });
      trace.push({ type: "node_finish", nodeName: "AcquisitionPlanningAgent", schemaName: "acquisition_planning" });
      const hasSelection = dispositions.some((d) => d.disposition === "selected");
      return {
        plan: {
          node: "fake_acquisition_planning",
          selectedSnapshotId: hasSelection ? snapshot.id : null,
          searchedKeywords,
          candidateDispositions: hasSelection
            ? dispositions
            : dispositions.map((d) => ({ ...d, episodes: [] })),
          confidence: hasSelection ? "high" : "low",
          reason: hasSelection
            ? "Fake planning selected a minimal covering set by episode hints."
            : "Fake planning found no candidate covering the missing episodes.",
        },
        snapshots,
        trace,
      };
    }

    trace.push({ type: "node_finish", nodeName: "AcquisitionPlanningAgent", schemaName: "acquisition_planning" });
    return {
      plan: {
        node: "fake_acquisition_planning",
        selectedSnapshotId: null,
        searchedKeywords,
        candidateDispositions: [],
        confidence: "low",
        reason: "Fake planning exhausted keywords without a non-empty snapshot.",
      },
      snapshots,
      trace,
    };
  }
```

And add this helper at module level (below `uniqueKeywords`):

```ts
function minimalCoveringDispositions(input: {
  candidates: ResourceCandidate[];
  missingEpisodes: string[];
  failedTitles: Set<string>;
}): CandidateDisposition[] {
  const missing = new Set(input.missingEpisodes);
  const chosen = new Map<string, ResourceCandidate>();
  const coveredByChosen = new Set<string>();
  for (const episode of input.missingEpisodes) {
    if (coveredByChosen.has(episode)) {
      continue;
    }
    const candidate = input.candidates.find(
      (item) => item.episodeHints.includes(episode) && !input.failedTitles.has(item.title),
    );
    if (candidate === undefined) {
      continue;
    }
    chosen.set(candidate.id, candidate);
    for (const hint of candidate.episodeHints) {
      if (missing.has(hint)) {
        coveredByChosen.add(hint);
      }
    }
  }

  return input.candidates.map((candidate) => {
    if (chosen.has(candidate.id)) {
      return {
        candidateId: candidate.id,
        disposition: "selected" as const,
        episodes: [...candidate.episodeHints],
        reason: "Fake selection: episode hints cover missing episodes.",
      };
    }
    if (input.failedTitles.has(candidate.title)) {
      return {
        candidateId: candidate.id,
        disposition: "rejected" as const,
        episodes: [],
        reason: "Fake rejection: failure evidence names this resource.",
      };
    }
    return {
      candidateId: candidate.id,
      disposition: candidate.episodeHints.some((hint) => missing.has(hint))
        ? ("rejected" as const)
        : ("rejected" as const),
      episodes: [],
      reason: "Fake rejection: not needed for minimal coverage.",
    };
  });
}
```

- [ ] **Step 6: Implement VercelAiAgentNodes.planAcquisition**

In `packages/workflow/src/ai-sdk-agent.ts` add the schema (next to the other schemas):

```ts
const acquisitionPlanningSchema = z.object({
  selectedSnapshotId: z.string().nullable(),
  searchedKeywords: z.array(z.string()),
  candidateDispositions: z.array(
    z.object({
      candidateId: z.string(),
      disposition: z.enum(["selected", "rejected", "uncertain"]),
      episodes: z.array(z.string()),
      reason: z.string(),
    }),
  ),
  confidence: z.enum(["low", "medium", "high"]),
  reason: z.string(),
});
type AcquisitionPlanningOutput = z.infer<typeof acquisitionPlanningSchema>;
```

Add `AcquisitionPlanningOutput` to the `StructuredOutput` union and `"acquisition_planning"` to `schemaFor`. Then add the method to `VercelAiAgentNodes`:

```ts
  async planAcquisition(input: AcquisitionPlanningInput): Promise<AcquisitionPlanningResult> {
    const snapshots: ResourceSnapshot[] = [];
    const result = await runAgentNode({
      spec: AGENT_NODE_SPECS.AcquisitionPlanningAgent,
      input: {
        title: input.title,
        aliases: input.aliases,
        seasonNumber: input.seasonNumber,
        qualityPreference: input.qualityPreference,
        missingEpisodes: input.missingEpisodes,
        latestAiredEpisode: input.latestAiredEpisode,
        initialKeyword: input.initialKeyword,
        failureEvidence: input.failureEvidence,
      },
      tools: {
        searchResources: {
          readOnly: true,
          description:
            "Search the resource provider with one keyword. Read-only. Returns the full persisted ResourceSnapshot; judge from this complete evidence. Returns {keyword, error} when the provider fails.",
          inputSchema: AGENT_NODE_SPECS.AcquisitionPlanningAgent.toolInputSchemas.searchResources,
          execute: async ({ keyword }) => {
            try {
              const snapshot = await input.searchResources({ keyword });
              snapshots.push(snapshot);
              return {
                snapshotId: snapshot.id,
                provider: snapshot.provider,
                keyword: snapshot.keyword,
                candidateCount: snapshot.candidates.length,
                candidates: snapshot.candidates.map((candidate) => ({
                  id: candidate.id,
                  title: candidate.title,
                  type: candidate.type,
                  source: candidate.source,
                  episodeHints: candidate.episodeHints,
                  qualityHints: candidate.qualityHints,
                })),
              };
            } catch (error) {
              return { keyword, error: error instanceof Error ? error.message : String(error) };
            }
          },
        },
      },
      executor: this.generateStructuredOutput,
    });
    const output = acquisitionPlanningSchema.parse(result.output);

    return {
      plan: {
        node: "vercel_ai_acquisition_planning",
        selectedSnapshotId: output.selectedSnapshotId,
        searchedKeywords: output.searchedKeywords,
        candidateDispositions: output.candidateDispositions,
        confidence: output.confidence as Confidence,
        reason: output.reason,
      },
      snapshots,
      trace: result.trace,
    };
  }
```

Import `AcquisitionPlanningInput`/`AcquisitionPlanningResult` from ports.

- [ ] **Step 7: Add an adapter test**

Append to `packages/workflow/tests/ai-sdk-agent.test.ts`:

```ts
  it("plans acquisition through the read-only search tool and observed snapshots", async () => {
    const snapshot: ResourceSnapshot = {
      id: "snapshot_1",
      provider: "fake",
      keyword: "Show 4K",
      candidates: [
        {
          id: "snapshot_1_candidate_1",
          snapshotId: "snapshot_1",
          index: 0,
          title: "Show S01E01 4K",
          type: "115",
          source: "fake",
          episodeHints: ["S01E01"],
          qualityHints: ["4K"],
          providerPayload: {},
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const agent = new VercelAiAgentNodes({
      generateStructuredOutput: async (request) => {
        expect(request.schemaName).toBe("acquisition_planning");
        expect(request.prompt).toContain("failureEvidence");
        const observed = await request.tools!.searchResources!.execute({ keyword: "Show 4K" });
        expect(observed).toMatchObject({ snapshotId: "snapshot_1", candidateCount: 1 });
        return {
          selectedSnapshotId: "snapshot_1",
          searchedKeywords: ["Show 4K"],
          candidateDispositions: [
            {
              candidateId: "snapshot_1_candidate_1",
              disposition: "selected",
              episodes: ["S01E01"],
              reason: "Exact missing episode.",
            },
          ],
          confidence: "high",
          reason: "Initial keyword was enough.",
        };
      },
    });

    const result = await agent.planAcquisition({
      title: "Show",
      aliases: [],
      seasonNumber: 1,
      qualityPreference: "4K",
      missingEpisodes: ["S01E01"],
      latestAiredEpisode: 1,
      initialKeyword: "Show 4K",
      failureEvidence: [],
      searchResources: async () => snapshot,
    });

    expect(result.plan.node).toBe("vercel_ai_acquisition_planning");
    expect(result.plan.selectedSnapshotId).toBe("snapshot_1");
    expect(result.snapshots).toEqual([snapshot]);
  });
```

- [ ] **Step 8: Run tests**

Run: `npm test -- packages/workflow/tests/invariants.test.ts packages/workflow/tests/ai-sdk-agent.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/workflow/src packages/workflow/tests
git commit -m "feat: add acquisition planning agent node (additive)"
```

### Task 3: Workflow Core Rewrite — Failure-Evidence Loop And no_coverage

**Files:**
- Modify: `packages/workflow/src/workflow.ts` (full rewrite of the acquisition path)
- Modify: `packages/workflow/tests/type2-init.test.ts`
- Modify: `packages/workflow/tests/type3-monitor.test.ts`

- [ ] **Step 1: Add/adjust failing workflow tests**

In `packages/workflow/tests/type3-monitor.test.ts`, rewrite the fallback test so recovery happens via a second planning pass (storage outcomes keyed to second-snapshot ids), and add a no_coverage test:

```ts
  it("repairs deletion via a failure-evidence re-planning pass, never mechanical fallback", async () => {
    // setup identical to the existing repair test, but transfer outcomes are:
    // snapshot_1_candidate_1 (primary E13): no_target_change
    // snapshot_1_candidate_3 (E14): succeeded
    // snapshot_2_candidate_2 (fallback E13, second search): succeeded
    // assert:
    expect(result.transferAttempts.map((attempt) => attempt.status)).toEqual([
      "no_target_change",
      "succeeded",
      "succeeded",
    ]);
    expect(result.decisions).toHaveLength(2);
    expect(result.resourceSnapshots.map((snapshot) => snapshot.id)).toEqual(["snapshot_1", "snapshot_2"]);
    expect(result.obtainedEpisodes).toEqual(expect.arrayContaining(["S01E13", "S01E14"]));
    expect(result.status).toBe("succeeded");
  });

  it("returns no_coverage with an honest notification when nothing covers the gap", async () => {
    // provider returns only wrong-episode candidates for every keyword
    expect(result.status).toBe("no_coverage");
    expect(result.transferAttempts).toEqual([]);
    expect(result.notification.kind).toBe("no_coverage");
    expect(result.notification.body).toContain("no covering resource found yet");
    expect(result.auditEvents.map((event) => event.type)).toContain("acquisition_no_coverage");
  });
```

(The executing engineer writes the full fixtures following the existing `qiaochuFixture()` pattern in that file; transfer outcome keys above are exact.)

In `packages/workflow/tests/type2-init.test.ts`, keep existing scenarios; update the keyword-recovery test to assert `acquisition_plan_created` is present in audit events instead of `resource_discovery_decision_created` / `candidate_match_decision_created` (keep the `keyword_search_failed` assertion).

- [ ] **Step 2: Run to verify failures**

Run: `npm test -- packages/workflow/tests/type3-monitor.test.ts packages/workflow/tests/type2-init.test.ts`
Expected: FAIL (new assertions).

- [ ] **Step 3: Rewrite workflow.ts acquisition core**

Replace `searchResourceSnapshot`, `matchSnapshotCandidates`, `assertDecisionUsesSnapshot`, `assertCandidateMatchUsesSnapshot`, and the per-type transfer loops with one shared core. Keep `WorkflowResult` shape, the Type 3 pre-search reconcile + `already_current` no-op path, flatten/reconcile, and `collectProviderAheadEpisodes` exactly as they are.

```ts
const DEFAULT_MAX_PLANNING_PASSES = 2;

interface AcquisitionOutcome {
  resourceSnapshots: ResourceSnapshot[];
  decisions: AgentDecision[];
  transferAttempts: TransferAttempt[];
}

async function acquireMissingEpisodes(input: {
  title: MediaTitle;
  season: TrackedSeason;
  keyword: string;
  missingEpisodes: string[];
  resourceProvider: ResourceProvider;
  storage: StorageExecutor;
  agents: AgentNodes;
  workflowRunId: string;
  auditEvents: AuditEvent[];
  maxPlanningPasses: number;
}): Promise<AcquisitionOutcome> {
  const resourceSnapshots: ResourceSnapshot[] = [];
  const decisions: AgentDecision[] = [];
  const transferAttempts: TransferAttempt[] = [];
  let stillMissing = [...input.missingEpisodes];
  let failureEvidence: AcquisitionFailureEvidence[] = [];

  for (let pass = 1; pass <= input.maxPlanningPasses && stillMissing.length > 0; pass += 1) {
    const planning = await input.agents.planAcquisition({
      title: input.title.title,
      aliases: input.title.aliases,
      seasonNumber: input.season.seasonNumber,
      qualityPreference: input.season.qualityPreference,
      missingEpisodes: stillMissing,
      latestAiredEpisode: input.season.latestAiredEpisode,
      initialKeyword: input.keyword,
      failureEvidence,
      searchResources: async ({ keyword }) => input.resourceProvider.search({ keyword }),
    });
    resourceSnapshots.push(...planning.snapshots);
    recordPlanningAudit({ auditEvents: input.auditEvents, planning, pass });

    const validated = validateAcquisitionPlan({
      plan: planning.plan,
      snapshots: planning.snapshots,
      missingEpisodes: stillMissing,
      seasonNumber: input.season.seasonNumber,
    });

    if (validated.selectedSnapshot === null || validated.selectedCandidates.length === 0) {
      input.auditEvents.push({
        type: "acquisition_no_coverage",
        message: `Planning pass ${pass} found no covering resource`,
        data: { pass, reason: planning.plan.reason, stillMissing },
      });
      break;
    }

    decisions.push(
      deriveAgentDecision({
        plan: planning.plan,
        missingEpisodes: stillMissing,
        latestAiredEpisode: input.season.latestAiredEpisode,
      }),
    );

    const passAttempts: TransferAttempt[] = [];
    for (const selected of validated.selectedCandidates) {
      const attempt = await input.storage.transfer({
        workflowRunId: input.workflowRunId,
        directoryId: input.season.storageDirectoryId,
        candidate: selected.candidate,
      });
      passAttempts.push(attempt);
      transferAttempts.push(attempt);
    }

    const filesAfterPass = await input.storage.listVideoFiles(input.season.storageDirectoryId);
    const obtainedCodes = new Set(filesAfterPass.map((file) => file.episodeCode));
    stillMissing = stillMissing.filter((code) => !obtainedCodes.has(code));

    if (stillMissing.length > 0) {
      failureEvidence = buildFailureEvidence({
        selectedCandidates: validated.selectedCandidates,
        attempts: passAttempts,
        stillMissing,
      });
      input.auditEvents.push({
        type: "acquisition_pass_incomplete",
        message: `Planning pass ${pass} left ${stillMissing.length} episodes missing`,
        data: { pass, stillMissing, failureEvidence },
      });
    }
  }

  return { resourceSnapshots, decisions, transferAttempts };
}

function buildFailureEvidence(input: {
  selectedCandidates: SelectedTransferCandidate[];
  attempts: TransferAttempt[];
  stillMissing: string[];
}): AcquisitionFailureEvidence[] {
  const stillMissing = new Set(input.stillMissing);
  return input.selectedCandidates.flatMap((selected, index) => {
    const attempt = input.attempts[index];
    if (attempt === undefined) {
      return [];
    }
    const episodesStillMissing = selected.episodes.filter((code) => stillMissing.has(code));
    if (attempt.status === "succeeded" && episodesStillMissing.length === 0) {
      return [];
    }
    if (episodesStillMissing.length === 0) {
      return [];
    }
    return [
      {
        candidateId: selected.candidate.id,
        candidateTitle: selected.candidate.title,
        transferStatus: attempt.status,
        providerMessage: attempt.providerMessage,
        episodesStillMissing,
      },
    ];
  });
}

function recordPlanningAudit(input: {
  auditEvents: AuditEvent[];
  planning: AcquisitionPlanningResult;
  pass: number;
}): void {
  input.auditEvents.push({
    type: "acquisition_plan_created",
    message: `Planning pass ${input.pass} produced plan from ${input.planning.plan.node}`,
    data: {
      pass: input.pass,
      plan: input.planning.plan,
      trace: input.planning.trace,
    },
  });
  for (const event of input.planning.trace) {
    if (event.type !== "tool_result" || !isSearchErrorOutput(event.output)) {
      continue;
    }
    input.auditEvents.push({
      type: "keyword_search_failed",
      message: `Search keyword failed: ${event.output.keyword}`,
      data: { keyword: event.output.keyword, error: event.output.error },
    });
  }
  for (const snapshot of input.planning.snapshots) {
    input.auditEvents.push({
      type: "resource_snapshot_created",
      message: `Created resource snapshot ${snapshot.id}`,
      data: { snapshotId: snapshot.id, keyword: snapshot.keyword, candidateCount: snapshot.candidates.length },
    });
    if (snapshot.candidates.length === 0) {
      input.auditEvents.push({
        type: "keyword_search_empty",
        message: `Search keyword returned no candidates: ${snapshot.keyword}`,
        data: { keyword: snapshot.keyword },
      });
    }
  }
}

function resolveAcquisitionStatus(input: {
  missingBefore: string[];
  stillMissingAfter: string[];
}): WorkflowStatus {
  if (input.stillMissingAfter.length === 0) {
    return "succeeded";
  }
  if (input.stillMissingAfter.length < input.missingBefore.length) {
    return "partial";
  }
  return "no_coverage";
}
```

`runType2Initialization` becomes: build episodes → compute `missingEpisodes` → if non-empty call `acquireMissingEpisodes` (with `maxPlanningPasses: input.maxPlanningPasses ?? DEFAULT_MAX_PLANNING_PASSES`) → flatten → list → reconcile → status via `resolveAcquisitionStatus` (where `stillMissingAfter` = aired-and-not-obtained after reconcile) → notification:

```ts
  const notification: NotificationEvent =
    status === "no_coverage"
      ? {
          id: `notification_${workflowRunId}`,
          workflowRunId,
          kind: "no_coverage",
          title: `${input.title.title} no covering resource yet`,
          body: `no covering resource found yet; ${obtainedEpisodes.length} episodes obtained`,
          createdAt: FIXED_CREATED_AT,
        }
      : {
          id: `notification_${workflowRunId}`,
          workflowRunId,
          kind: "tracking_initialized",
          title: `${input.title.title} tracking initialized`,
          body: `${obtainedEpisodes.length} episodes obtained`,
          createdAt: FIXED_CREATED_AT,
        };
```

`runType3Monitoring`: unchanged pre-search reconcile and `already_current` no-op; then the same shared core; `restored` = `missingBefore` minus still-missing-after; notification `kind: "episodes_restored"`, body `` `${restored.length} episodes restored` `` (or the no_coverage variant with body `no covering resource found yet; 0 episodes restored`). Both runners accept optional `maxPlanningPasses?: number`.

Add `runType2Initialization`/`runType3Monitoring` input field `maxPlanningPasses?: number`.

Imports change accordingly (`validateAcquisitionPlan`, `deriveAgentDecision`, `SelectedTransferCandidate` from `./plan-validation.js`; `AcquisitionPlanningResult` from `./ports.js`; `AcquisitionFailureEvidence` from `./domain.js`). Keep `isSearchErrorOutput` as-is.

- [ ] **Step 4: Run the workflow tests**

Run: `npm test -- packages/workflow/tests/type2-init.test.ts packages/workflow/tests/type3-monitor.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite; fix downstream test expectations**

Run: `npm test && npm run typecheck`

Known downstream deltas to fix the same way:
- any test asserting `resource_discovery_decision_created` / `candidate_match_decision_created` audit events now expects `acquisition_plan_created`
- `result.resourceSnapshots` now contains every searched snapshot (selected one included), in search order
- `result.decisions` contains one derived `AgentDecision` per planning pass that selected candidates
- worker/runner/commands/tracking tests use `FakeAgentNodes` + single-candidate fixtures, so snapshot numbering and outcomes keyed `snapshot_N_candidate_1` are unchanged

Expected: PASS after those adjustments.

- [ ] **Step 6: Commit**

```bash
git add packages/workflow/src/workflow.ts packages/workflow/tests
git commit -m "feat: harness acquisition through planning agent with failure-evidence loop"
```

### Task 4: Delete The Old Pipeline

**Files:**
- Modify: `packages/workflow/src/ports.ts`, `domain.ts`, `fakes.ts`, `ai-sdk-agent.ts`, `agent-node-types.ts`, `agent-node-specs.ts`
- Delete: `packages/workflow/src/agent-nodes/keyword-agent.ts`, `resource-discovery-agent.ts`, `candidate-match-agent.ts`, `episode-coverage-agent.ts`, `quality-selection-agent.ts`
- Modify: `packages/workflow/tests/ai-sdk-agent.test.ts`, `invariants.test.ts`

- [ ] **Step 1: Remove old port methods and types**

- `ports.ts`: delete `generateKeywords`, `discoverResources`, `matchCandidates`, `selectEpisodeCoverage` from `AgentNodes`; delete `ResourceDiscoveryInput`, `ResourceDiscoveryResult`; drop now-unused imports.
- `domain.ts`: delete `CandidateMatchDecision`, `ResourceDiscoveryDecision`.
- `fakes.ts`: delete the four old methods and `isProviderAheadEpisode`; keep `uniqueKeywords`, `errorMessage`.
- `ai-sdk-agent.ts`: delete the four old methods and `keywordGenerationSchema`, `episodeCoverageSchema`, `candidateMatchSchema`, `resourceDiscoverySchema`, `qualitySelectionSchema`; shrink `StructuredOutput` union and `schemaFor` to `acquisition_planning` + `package_recognition`.
- `agent-node-types.ts`: `AgentNodeName = "AcquisitionPlanningAgent" | "PackageRecognitionAgent"`, `schemaName: "acquisition_planning" | "package_recognition"`.
- `agent-node-specs.ts`: registry keeps only the two specs.
- Delete the five orphan spec files.

- [ ] **Step 2: Rewrite tests that exercised the old pipeline**

- `ai-sdk-agent.test.ts`: drop the keyword/coverage/candidate-match/discovery cases; keep provider-config, spec-content (update to the two remaining specs: assert `AGENT_NODE_SPECS.AcquisitionPlanningAgent.system` contains `"No just-in-case"` and `"read-only"`), runAgentNode trace test (retarget at `AcquisitionPlanningAgent`), planAcquisition test, package recognition test.
- `invariants.test.ts`: drop the old `selectEpisodeCoverage` fake test; keep the rest.

- [ ] **Step 3: Full suite**

Run: `npm test && npm run typecheck`
Expected: PASS. Also run `npm run build:workflow` to confirm dist builds.

- [ ] **Step 4: Commit**

```bash
git add -A packages/workflow
git commit -m "refactor: remove serial agent node pipeline"
```

### Task 5: Live Smoke Harness

**Files:**
- Create: `packages/workflow/src/acquisition-planning-smoke.ts`
- Create: `packages/workflow/tests/acquisition-planning-smoke.test.ts`
- Create: `scripts/agent-planning-smoke.mjs`
- Modify: `packages/workflow/src/index.ts`, `.env.example`

- [ ] **Step 1: Write failing smoke tests**

`packages/workflow/tests/acquisition-planning-smoke.test.ts`: with `FakeAgentNodes` + `FakeResourceProvider` (one covering candidate) expect `status: "plan_valid"` and `selectedCandidateTitles` non-empty; with an `agents` stub whose `planAcquisition` rejects expect `status: "agent_error"`; with a stub returning a plan that violates totality expect `status: "plan_invalid"` and a `validationError` message.

- [ ] **Step 2: Implement**

`packages/workflow/src/acquisition-planning-smoke.ts`:

```ts
import type { AcquisitionPlan } from "./domain.js";
import type { AgentNodeTraceEvent } from "./agent-node-runtime.js";
import { validateAcquisitionPlan } from "./plan-validation.js";
import type { AgentNodes, ResourceProvider } from "./ports.js";

export interface AcquisitionPlanningSmokeResult {
  status: "plan_valid" | "plan_invalid" | "agent_error";
  plan: AcquisitionPlan | null;
  snapshots: Array<{ id: string; keyword: string; candidateCount: number }>;
  selectedCandidateTitles: string[];
  validationError: string | null;
  agentError: string | null;
  trace: AgentNodeTraceEvent[];
}

/**
 * Read-only smoke harness: exercises the live planning agent against a real
 * resource provider. Executes NO storage side effects, ever.
 */
export async function runAcquisitionPlanningSmoke(input: {
  title: string;
  aliases: string[];
  seasonNumber: number;
  qualityPreference: string;
  missingEpisodes: string[];
  latestAiredEpisode: number;
  initialKeyword: string;
  agents: AgentNodes;
  resourceProvider: ResourceProvider;
}): Promise<AcquisitionPlanningSmokeResult> {
  try {
    const planning = await input.agents.planAcquisition({
      title: input.title,
      aliases: input.aliases,
      seasonNumber: input.seasonNumber,
      qualityPreference: input.qualityPreference,
      missingEpisodes: input.missingEpisodes,
      latestAiredEpisode: input.latestAiredEpisode,
      initialKeyword: input.initialKeyword,
      failureEvidence: [],
      searchResources: async ({ keyword }) => input.resourceProvider.search({ keyword }),
    });
    const snapshots = planning.snapshots.map((snapshot) => ({
      id: snapshot.id,
      keyword: snapshot.keyword,
      candidateCount: snapshot.candidates.length,
    }));
    try {
      const validated = validateAcquisitionPlan({
        plan: planning.plan,
        snapshots: planning.snapshots,
        missingEpisodes: input.missingEpisodes,
        seasonNumber: input.seasonNumber,
      });
      return {
        status: "plan_valid",
        plan: planning.plan,
        snapshots,
        selectedCandidateTitles: validated.selectedCandidates.map((selected) => selected.candidate.title),
        validationError: null,
        agentError: null,
        trace: planning.trace,
      };
    } catch (error) {
      return {
        status: "plan_invalid",
        plan: planning.plan,
        snapshots,
        selectedCandidateTitles: [],
        validationError: error instanceof Error ? error.message : String(error),
        agentError: null,
        trace: planning.trace,
      };
    }
  } catch (error) {
    return {
      status: "agent_error",
      plan: null,
      snapshots: [],
      selectedCandidateTitles: [],
      validationError: null,
      agentError: error instanceof Error ? error.message : String(error),
      trace: [],
    };
  }
}
```

Export from `index.ts`. CLI `scripts/agent-planning-smoke.mjs`: parse `.env` by hand (KEY=value, strip surrounding quotes, ignore comments), require `XIAOMI_MIMO_API_KEY` + `PANSOU_BASE_URL`, import `../packages/workflow/dist/index.js`, build `createXiaomiMimoAgentNodesFromEnv(process.env)` + `createPanSouResourceProviderFromEnv()`, accept `--title --keyword --season --missing S01E15,S01E16 --latest 14 --alias a,b`, run the smoke, print JSON (plan + snapshots + selected titles + trace tool calls), exit non-zero on `agent_error`. Remind in output that this run is read-only.

`.env.example`: set `XIAOMI_MIMO_MODEL_ID=mimo-v2.5-pro` with comment `# default in code; confirm the model id your token plan exposes`.

- [ ] **Step 3: Run tests and build**

Run: `npm test -- packages/workflow/tests/acquisition-planning-smoke.test.ts && npm run build:workflow && node scripts/agent-planning-smoke.mjs --help`
Expected: tests PASS; CLI prints usage (no key needed for --help).

- [ ] **Step 4: Commit**

```bash
git add packages/workflow scripts/agent-planning-smoke.mjs .env.example
git commit -m "feat: add live acquisition planning smoke harness"
```

### Task 6: Docs Alignment And Final Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-06-11-media-track-workflow-kernel-design.md` (Agent Node Contracts section)
- Modify: `docs/workflow-product-architecture.md` (Agent as Stateless Judgment Nodes / Specialist Nodes sections)

- [ ] **Step 1: Update docs**

Replace the per-node contract descriptions with the `AcquisitionPlanningAgent` contract (input incl. failureEvidence; disposition-totality output; validators; bounded re-planning loop; `no_coverage` as honest outcome). State the three-bucket rule: dissolved-by-architecture / boundary validators / prompt-owned semantics. Note `PackageRecognitionAgent` unchanged and DedupAgent as follow-up.

- [ ] **Step 2: Full verification**

Run: `npm test && npm run typecheck && npm run build:workflow`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: align agent workflow design with planning agent"
```

### Task 7 (blocked on user): Fire The Live Smoke

Needs `XIAOMI_MIMO_API_KEY` in `.env`. Then:

```bash
npm run build:workflow
node scripts/agent-planning-smoke.mjs --title "翘楚" --keyword "翘楚 4K" --season 1 --missing S01E15 --latest 14 --alias "Ashes to Crown"
```

Inspect: did `generateText` + `Output.object` + tool loop work on the Mimo endpoint; did the model search, return a total disposition, and pass validation. If the endpoint rejects structured output, fall back strategies (in order): JSON-mode prompt + `Output.object` off + manual zod parse inside `createAiSdkStructuredGenerator`; or a final no-tools summarization step after the tool loop.
