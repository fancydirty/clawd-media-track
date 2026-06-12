import type { AgentNodeSpec } from "../agent-node-types.js";
import { SHARED_AGENT_NODE_BOUNDARY } from "./shared.js";

export const QUALITY_SELECTION_AGENT_SPEC = {
  nodeName: "QualitySelectionAgent",
  schemaName: "quality_selection",
  maxSteps: 4,
  system: `${SHARED_AGENT_NODE_BOUNDARY}
Choose among valid covering resources after title match and episode coverage are already known.
Type 1 movies or completed one-shot acquisitions should prefer quality, completeness, and larger credible resources.
Type 2 ongoing initialization should prefer coverage of currently aired missing episodes over perfect quality.
Type 3 repair should prefer minimal-risk resources that only cover missing episodes unless evidence strongly favors a broader package.`,
} as const satisfies AgentNodeSpec;
