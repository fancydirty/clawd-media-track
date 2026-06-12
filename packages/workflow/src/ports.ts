import type {
  AgentDecision,
  CandidateMatchDecision,
  ResourceDiscoveryDecision,
  ResourceCandidate,
  ResourceSnapshot,
  TransferAttempt,
  VerifiedFile,
} from "./domain.js";
import type { AgentNodeTraceEvent } from "./agent-node-runtime.js";
import type {
  PackageRecognitionDecision,
  PackageRecognitionInput,
} from "./package-normalizer.js";

export interface ResourceProvider {
  search(input: { keyword: string }): Promise<ResourceSnapshot>;
}

export interface StorageExecutor {
  createDirectory(input: { name: string; parentId: string }): Promise<string>;
  listVideoFiles(directoryId: string): Promise<VerifiedFile[]>;
  transfer(input: {
    workflowRunId: string;
    directoryId: string;
    candidate: ResourceCandidate;
  }): Promise<TransferAttempt>;
  flattenDirectory(directoryId: string): Promise<{ moved: string[]; removed: string[] }>;
  deleteFiles(input: { directoryId: string; fileIds: string[] }): Promise<{ deleted: string[] }>;
}

export interface ResourceDiscoveryInput {
  title: string;
  aliases: string[];
  missingEpisodes: string[];
  initialKeyword: string;
  searchResources(input: { keyword: string }): Promise<ResourceSnapshot>;
}

export interface ResourceDiscoveryResult {
  snapshot: ResourceSnapshot;
  snapshots: ResourceSnapshot[];
  decision: ResourceDiscoveryDecision;
  trace: AgentNodeTraceEvent[];
}

export interface AgentNodes {
  generateKeywords(input: {
    title: string;
    aliases: string[];
    missingEpisodes: string[];
    previousErrors: string[];
  }): Promise<{ keywords: string[]; reason: string }>;
  discoverResources(input: ResourceDiscoveryInput): Promise<ResourceDiscoveryResult>;
  matchCandidates(input: {
    snapshotId: string;
    title: string;
    aliases: string[];
    candidates: ResourceCandidate[];
  }): Promise<CandidateMatchDecision>;
  selectEpisodeCoverage(input: {
    snapshotId: string;
    candidates: ResourceCandidate[];
    missingEpisodes: string[];
    latestAiredEpisode: number;
  }): Promise<AgentDecision>;
  recognizePackage(input: PackageRecognitionInput): Promise<PackageRecognitionDecision>;
}
