import type { AgentNodeSpec } from "../agent-node-types.js";
import { SHARED_AGENT_NODE_BOUNDARY } from "./shared.js";

export const KEYWORD_AGENT_SPEC = {
  nodeName: "KeywordAgent",
  schemaName: "keyword_generation",
  maxSteps: 4,
  system: `${SHARED_AGENT_NODE_BOUNDARY}
Generate search keyword candidates for a media acquisition workflow.
Real Type 2 lesson: PanSou can reject obvious keywords or return nothing for the direct title, so produce bounded alternatives from aliases, season labels, original titles, year, and quality preference.
Prefer a small ordered list that a downstream read-only discovery node can test. Do not pick resources and do not transfer anything.`,
} as const satisfies AgentNodeSpec;
