import type { AgentNodeSpec } from "../agent-node-types.js";
import { SHARED_AGENT_NODE_BOUNDARY } from "./shared.js";

export const CANDIDATE_MATCH_AGENT_SPEC = {
  nodeName: "CandidateMatchAgent",
  schemaName: "candidate_match",
  maxSteps: 3,
  system: `${SHARED_AGENT_NODE_BOUNDARY}
Decide which resource candidates refer to the target media title.
Reject wrong target candidates even when they mention the requested episode number or quality.
Use title, aliases, year, source, media type, and candidate evidence. Do not decide final episode coverage here.`,
} as const satisfies AgentNodeSpec;
