import {
  type AgentDecision,
  type CandidateMatchDecision,
  type ResourceCandidate,
  type ResourceSnapshot,
  type TransferAttempt,
  type TransferStatus,
  type VerifiedFile,
} from "./domain.js";
import type {
  PackageRecognitionDecision,
  PackageRecognitionInput,
} from "./package-normalizer.js";
import type {
  AgentNodes,
  ResourceDiscoveryInput,
  ResourceDiscoveryResult,
  ResourceProvider,
  StorageExecutor,
} from "./ports.js";

const FIXED_CREATED_AT = "2026-01-01T00:00:00.000Z";

export interface CandidateFixture {
  title: string;
  episodeHints: string[];
  qualityHints?: string[];
  source?: string;
  providerPayload?: Record<string, unknown>;
}

export interface TransferOutcome {
  status: TransferStatus;
  providerMessage: string;
  files: VerifiedFile[];
}

export interface FakeAgentNodesOptions {
  packageRecognition?: PackageRecognitionDecision;
}

export class FakeResourceProvider implements ResourceProvider {
  private readonly keywordResults: Record<string, CandidateFixture[]>;
  private readonly keywordErrors: Record<string, string>;
  private nextSnapshotNumber = 1;

  constructor(input: { keywordResults: Record<string, CandidateFixture[]>; keywordErrors?: Record<string, string> }) {
    this.keywordResults = input.keywordResults;
    this.keywordErrors = input.keywordErrors ?? {};
  }

  async search(input: { keyword: string }): Promise<ResourceSnapshot> {
    const error = this.keywordErrors[input.keyword];
    if (error !== undefined) {
      throw new Error(error);
    }

    const snapshotId = `snapshot_${this.nextSnapshotNumber}`;
    this.nextSnapshotNumber += 1;
    const fixtures = this.keywordResults[input.keyword] ?? [];
    const candidates: ResourceCandidate[] = fixtures.map((fixture, index) => ({
      id: `${snapshotId}_candidate_${index + 1}`,
      snapshotId,
      index,
      title: fixture.title,
      type: "115",
      source: fixture.source ?? "fake",
      episodeHints: [...fixture.episodeHints],
      qualityHints: [...(fixture.qualityHints ?? [])],
      providerPayload: { ...(fixture.providerPayload ?? {}) },
    }));

    return {
      id: snapshotId,
      provider: "fake",
      keyword: input.keyword,
      candidates,
      createdAt: FIXED_CREATED_AT,
    };
  }
}

export class FakeStorageExecutor implements StorageExecutor {
  private readonly directories: Map<string, VerifiedFile[]>;
  private readonly transferOutcomes: Record<string, TransferOutcome>;
  private readonly nestedDirectories: Set<string>;
  private nextDirectoryNumber = 1;
  private nextTransferNumber = 1;

  constructor(input: {
    directories?: Record<string, VerifiedFile[]>;
    transferOutcomes?: Record<string, TransferOutcome>;
    nestedDirectories?: Set<string>;
  } = {}) {
    this.directories = new Map(
      Object.entries(input.directories ?? {}).map(([directoryId, files]) => [
        directoryId,
        files.map((file) => ({ ...file })),
      ]),
    );
    this.transferOutcomes = cloneTransferOutcomes(input.transferOutcomes ?? {});
    this.nestedDirectories = new Set(input.nestedDirectories ?? []);
  }

  async createDirectory(input: { name: string; parentId: string }): Promise<string> {
    const directoryId = `${input.parentId}_${input.name}_${this.nextDirectoryNumber}`;
    this.nextDirectoryNumber += 1;
    this.directories.set(directoryId, []);
    return directoryId;
  }

  async listVideoFiles(directoryId: string): Promise<VerifiedFile[]> {
    return this.filesFor(directoryId).map((file) => ({ ...file }));
  }

  async transfer(input: {
    workflowRunId: string;
    directoryId: string;
    candidate: ResourceCandidate;
  }): Promise<TransferAttempt> {
    const outcome = this.transferOutcomes[input.candidate.id] ?? {
      status: "failed",
      providerMessage: "no fake transfer outcome configured",
      files: [],
    };
    const materializedFileIds = outcome.files.map((file) => file.id);

    if (outcome.status === "succeeded") {
      const files = this.filesFor(input.directoryId);
      files.push(...outcome.files.map((file) => ({ ...file, storageDirectoryId: input.directoryId })));
    }

    const attempt: TransferAttempt = {
      id: `transfer_${this.nextTransferNumber}`,
      workflowRunId: input.workflowRunId,
      candidateId: input.candidate.id,
      status: outcome.status,
      providerMessage: outcome.providerMessage,
      materializedFileIds,
    };
    this.nextTransferNumber += 1;
    return attempt;
  }

  async flattenDirectory(directoryId: string): Promise<{ moved: string[]; removed: string[] }> {
    if (!this.nestedDirectories.has(directoryId)) {
      return { moved: [], removed: [] };
    }

    return {
      moved: this.filesFor(directoryId).map((file) => file.id),
      removed: [`${directoryId}_nested`],
    };
  }

  async deleteFiles(input: { directoryId: string; fileIds: string[] }): Promise<{ deleted: string[] }> {
    const fileIds = new Set(input.fileIds);
    const files = this.filesFor(input.directoryId);
    const deleted = files.filter((file) => fileIds.has(file.id)).map((file) => file.id);
    this.directories.set(
      input.directoryId,
      files.filter((file) => !fileIds.has(file.id)),
    );
    return { deleted };
  }

  private filesFor(directoryId: string): VerifiedFile[] {
    const existing = this.directories.get(directoryId);
    if (existing !== undefined) {
      return existing;
    }

    const files: VerifiedFile[] = [];
    this.directories.set(directoryId, files);
    return files;
  }
}

export class FakeAgentNodes implements AgentNodes {
  private readonly packageRecognition: PackageRecognitionDecision | undefined;

  constructor(options: FakeAgentNodesOptions = {}) {
    this.packageRecognition = options.packageRecognition;
  }

  async generateKeywords(input: {
    title: string;
    aliases: string[];
    missingEpisodes: string[];
    previousErrors: string[];
  }): Promise<{ keywords: string[]; reason: string }> {
    return {
      keywords: [input.title, ...input.aliases, `${input.title} 4K`],
      reason:
        input.previousErrors.length > 0
          ? "Generated keywords after prior fake errors."
          : "Generated baseline fake keywords.",
    };
  }

  async discoverResources(input: ResourceDiscoveryInput): Promise<ResourceDiscoveryResult> {
    const keywordPlan = await this.generateKeywords({
      title: input.title,
      aliases: input.aliases,
      missingEpisodes: input.missingEpisodes,
      previousErrors: [],
    });
    const snapshots: ResourceSnapshot[] = [];
    const searchedKeywords: string[] = [];
    const rejectedSnapshotIds: string[] = [];
    const trace: ResourceDiscoveryResult["trace"] = [
      {
        type: "node_start",
        nodeName: "ResourceDiscoveryAgent",
        schemaName: "resource_discovery",
        maxSteps: 6,
      },
    ];
    let lastEmptySnapshot: ResourceSnapshot | null = null;
    let lastError: unknown = null;

    for (const keyword of uniqueKeywords([input.initialKeyword, ...keywordPlan.keywords])) {
      searchedKeywords.push(keyword);
      trace.push({
        type: "tool_call",
        nodeName: "ResourceDiscoveryAgent",
        toolName: "searchResources",
        input: { keyword },
      });
      try {
        const snapshot = await input.searchResources({ keyword });
        snapshots.push(snapshot);
        trace.push({
          type: "tool_result",
          nodeName: "ResourceDiscoveryAgent",
          toolName: "searchResources",
          output: {
            snapshotId: snapshot.id,
            keyword: snapshot.keyword,
            candidateCount: snapshot.candidates.length,
          },
        });

        if (snapshot.candidates.length > 0) {
          trace.push({
            type: "node_finish",
            nodeName: "ResourceDiscoveryAgent",
            schemaName: "resource_discovery",
          });
          return {
            snapshot,
            snapshots,
            decision: {
              node: "fake_resource_discovery",
              selectedSnapshotId: snapshot.id,
              searchedKeywords,
              rejectedSnapshotIds,
              confidence: "high",
              reason: "Fake discovery selected the first non-empty resource snapshot.",
            },
            trace,
          };
        }

        lastEmptySnapshot = snapshot;
        rejectedSnapshotIds.push(snapshot.id);
      } catch (error) {
        lastError = error;
        trace.push({
          type: "tool_result",
          nodeName: "ResourceDiscoveryAgent",
          toolName: "searchResources",
          output: {
            keyword,
            error: errorMessage(error),
          },
        });
      }
    }

    trace.push({
      type: "node_finish",
      nodeName: "ResourceDiscoveryAgent",
      schemaName: "resource_discovery",
    });

    if (lastError !== null) {
      throw lastError instanceof Error
        ? lastError
        : new Error(`Resource discovery failed before a usable resource snapshot could be created: ${String(lastError)}`);
    }

    if (lastEmptySnapshot !== null) {
      return {
        snapshot: lastEmptySnapshot,
        snapshots,
        decision: {
          node: "fake_resource_discovery",
          selectedSnapshotId: lastEmptySnapshot.id,
          searchedKeywords,
          rejectedSnapshotIds,
          confidence: "low",
          reason: "Fake discovery found only empty snapshots.",
        },
        trace,
      };
    }

    throw new Error("Resource discovery failed before a resource snapshot could be created");
  }

  async matchCandidates(input: {
    snapshotId: string;
    title: string;
    aliases: string[];
    candidates: ResourceCandidate[];
  }): Promise<CandidateMatchDecision> {
    const matchedCandidateIds = input.candidates.map((candidate) => candidate.id);
    return {
      node: "fake_candidate_match",
      snapshotId: input.snapshotId,
      matchedCandidateIds,
      rejectedCandidateIds: [],
      uncertainCandidateIds: [],
      confidence: matchedCandidateIds.length > 0 ? "high" : "low",
      reason: "Fake agent treats all snapshot candidates as target-resource matches.",
    };
  }

  async selectEpisodeCoverage(input: {
    snapshotId: string;
    candidates: ResourceCandidate[];
    missingEpisodes: string[];
    latestAiredEpisode: number;
  }): Promise<AgentDecision> {
    const missing = new Set(input.missingEpisodes);
    const selectedCandidates = input.candidates.filter((candidate) =>
      candidate.episodeHints.some((episodeHint) => missing.has(episodeHint)),
    );
    const selectedCandidateIds = selectedCandidates.map((candidate) => candidate.id);
    const selectedIds = new Set(selectedCandidateIds);
    const episodeMapping = Object.fromEntries(
      selectedCandidates.map((candidate) => [
        candidate.id,
        candidate.episodeHints.filter((episodeHint) => missing.has(episodeHint)),
      ]),
    );
    const providerAheadEntries: Array<[string, string[]]> = [];
    for (const candidate of selectedCandidates) {
      const episodeHints = candidate.episodeHints.filter((episodeHint) =>
        isProviderAheadEpisode(episodeHint, input.latestAiredEpisode),
      );
      if (episodeHints.length > 0) {
        providerAheadEntries.push([candidate.id, episodeHints]);
      }
    }
    const providerAheadEpisodeMapping = Object.fromEntries(providerAheadEntries);

    return {
      node: "fake_episode_coverage",
      snapshotId: input.snapshotId,
      selectedCandidateIds,
      episodeMapping,
      providerAheadEpisodeMapping,
      rejectedCandidateIds: input.candidates
        .filter((candidate) => !selectedIds.has(candidate.id))
        .map((candidate) => candidate.id),
      confidence: selectedCandidateIds.length > 0 ? "high" : "low",
      reason:
        selectedCandidateIds.length > 0
          ? "Selected fake candidates covering missing episodes."
          : "No fake candidates covered missing episodes.",
    };
  }

  async recognizePackage(input: PackageRecognitionInput): Promise<PackageRecognitionDecision> {
    return (
      this.packageRecognition ?? {
        node: "fake_package_recognition",
        fileMappings: [],
        rejectedProviderFileIds: input.files.map((file) => file.providerFileId),
        confidence: "low",
        reason: "No fake package recognition mapping configured.",
      }
    );
  }
}

function isProviderAheadEpisode(episodeCode: string, latestAiredEpisode: number): boolean {
  try {
    const match = /^S\d{2}E(\d{2,})$/.exec(episodeCode);
    return match !== null && Number(match[1]) > latestAiredEpisode;
  } catch {
    return false;
  }
}

function uniqueKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cloneTransferOutcomes(transferOutcomes: Record<string, TransferOutcome>): Record<string, TransferOutcome> {
  return Object.fromEntries(
    Object.entries(transferOutcomes).map(([candidateId, outcome]) => [
      candidateId,
      {
        ...outcome,
        files: outcome.files.map((file) => ({ ...file })),
      },
    ]),
  );
}
