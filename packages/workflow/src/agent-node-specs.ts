import type { AgentNodeName, AgentNodeSpec } from "./agent-node-types.js";
import { ACQUISITION_PLANNING_AGENT_SPEC } from "./agent-nodes/acquisition-planning-agent.js";
import { CANDIDATE_MATCH_AGENT_SPEC } from "./agent-nodes/candidate-match-agent.js";
import { EPISODE_COVERAGE_AGENT_SPEC } from "./agent-nodes/episode-coverage-agent.js";
import { KEYWORD_AGENT_SPEC } from "./agent-nodes/keyword-agent.js";
import { PACKAGE_RECOGNITION_AGENT_SPEC } from "./agent-nodes/package-recognition-agent.js";
import { QUALITY_SELECTION_AGENT_SPEC } from "./agent-nodes/quality-selection-agent.js";
import { RESOURCE_DISCOVERY_AGENT_SPEC } from "./agent-nodes/resource-discovery-agent.js";

export type { AgentNodeName, AgentNodeSpec } from "./agent-node-types.js";

export const AGENT_NODE_SPECS = {
  AcquisitionPlanningAgent: ACQUISITION_PLANNING_AGENT_SPEC,
  KeywordAgent: KEYWORD_AGENT_SPEC,
  ResourceDiscoveryAgent: RESOURCE_DISCOVERY_AGENT_SPEC,
  CandidateMatchAgent: CANDIDATE_MATCH_AGENT_SPEC,
  EpisodeCoverageAgent: EPISODE_COVERAGE_AGENT_SPEC,
  QualitySelectionAgent: QUALITY_SELECTION_AGENT_SPEC,
  PackageRecognitionAgent: PACKAGE_RECOGNITION_AGENT_SPEC,
} as const satisfies Record<AgentNodeName, AgentNodeSpec>;
