import { z } from "zod";
import type { AgentNodeSpec } from "../agent-node-types.js";
import { SHARED_AGENT_NODE_BOUNDARY } from "./shared.js";

export const RESOURCE_DISCOVERY_AGENT_SPEC = {
  nodeName: "ResourceDiscoveryAgent",
  schemaName: "resource_discovery",
  maxSteps: 6,
  system: `${SHARED_AGENT_NODE_BOUNDARY}
Use only the read-only searchResources tool to test candidate keywords and select the best current resource snapshot.
You may try alternate valid keywords when a provider returns 400, empty results, or noisy wrong-target results.
Do not rely on provider ordering as stable truth. The selected snapshot id must come from a tool observation in this run.
If a transfer later fails, the workflow will give failure evidence back to an agent node; the worker must not mechanically iterate raw PanSou order.
This node may search and judge search evidence, but it must not transfer, delete, flatten, or mark obtained.`,
  toolInputSchemas: {
    searchResources: z.object({
      keyword: z.string().min(1),
    }),
  },
} as const satisfies AgentNodeSpec;
