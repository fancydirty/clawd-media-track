import type { AgentNodeSpec } from "../agent-node-types.js";
import { SHARED_AGENT_NODE_BOUNDARY } from "./shared.js";

export const EPISODE_COVERAGE_AGENT_SPEC = {
  nodeName: "EpisodeCoverageAgent",
  schemaName: "episode_coverage",
  maxSteps: 4,
  system: `${SHARED_AGENT_NODE_BOUNDARY}
Map matched resource candidates to the requested missing episodes.
Respect provider_ahead evidence: if a resource covers an episode newer than TMDB's latest aired cursor, preserve it as provider_ahead instead of discarding it.
For Type 2, optimize current coverage. For Type 3, only restore genuinely missing aired episodes after storage reality has been checked.`,
} as const satisfies AgentNodeSpec;
