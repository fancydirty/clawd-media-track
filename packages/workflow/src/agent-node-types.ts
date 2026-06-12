import type { z } from "zod";

export type AgentNodeName =
  | "KeywordAgent"
  | "ResourceDiscoveryAgent"
  | "CandidateMatchAgent"
  | "EpisodeCoverageAgent"
  | "QualitySelectionAgent"
  | "PackageRecognitionAgent";

export interface AgentNodeSpec {
  nodeName: AgentNodeName;
  schemaName:
    | "keyword_generation"
    | "resource_discovery"
    | "candidate_match"
    | "episode_coverage"
    | "quality_selection"
    | "package_recognition";
  maxSteps: number;
  system: string;
  toolInputSchemas?: Record<string, z.ZodType>;
}
