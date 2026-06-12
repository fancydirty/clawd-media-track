import type { z } from "zod";
import type { AgentNodeSpec } from "./agent-node-types.js";

export type AgentNodeTraceEvent =
  | {
      type: "node_start";
      nodeName: string;
      schemaName: string;
      maxSteps: number;
    }
  | {
      type: "tool_call";
      nodeName: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: "tool_result";
      nodeName: string;
      toolName: string;
      output: unknown;
    }
  | {
      type: "node_finish";
      nodeName: string;
      schemaName: string;
    };

export interface AgentNodeToolDefinition<TInput = unknown, TOutput = unknown> {
  readOnly: true;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute(input: TInput): Promise<TOutput>;
}

export type AgentNodeToolSet = Record<string, AgentNodeToolDefinition<any, any>>;

export interface AgentNodeExecutionRequest {
  nodeName: string;
  schemaName: AgentNodeSpec["schemaName"];
  system: string;
  prompt: string;
  maxSteps: number;
  tools?: AgentNodeToolSet;
}

export type AgentNodeExecutor<TOutput> = (request: AgentNodeExecutionRequest) => Promise<TOutput>;

export async function runAgentNode<TOutput>(input: {
  spec: AgentNodeSpec;
  input: unknown;
  tools?: AgentNodeToolSet;
  executor: AgentNodeExecutor<TOutput>;
}): Promise<{ output: TOutput; trace: AgentNodeTraceEvent[] }> {
  const trace: AgentNodeTraceEvent[] = [
    {
      type: "node_start",
      nodeName: input.spec.nodeName,
      schemaName: input.spec.schemaName,
      maxSteps: input.spec.maxSteps,
    },
  ];
  const tools =
    input.tools === undefined ? undefined : wrapTools(input.spec.nodeName, input.tools, trace);
  const request: AgentNodeExecutionRequest = {
    nodeName: input.spec.nodeName,
    schemaName: input.spec.schemaName,
    system: input.spec.system,
    prompt: JSON.stringify(input.input, null, 2),
    maxSteps: input.spec.maxSteps,
    ...(tools === undefined ? {} : { tools }),
  };
  const output = await input.executor(request);
  trace.push({
    type: "node_finish",
    nodeName: input.spec.nodeName,
    schemaName: input.spec.schemaName,
  });
  return { output, trace };
}

function wrapTools(
  nodeName: string,
  tools: AgentNodeToolSet,
  trace: AgentNodeTraceEvent[],
): AgentNodeToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, definition]) => [
      toolName,
      {
        ...definition,
        execute: async (toolInput: unknown) => {
          trace.push({
            type: "tool_call",
            nodeName,
            toolName,
            input: toolInput,
          });
          const output = await definition.execute(toolInput);
          trace.push({
            type: "tool_result",
            nodeName,
            toolName,
            output,
          });
          return output;
        },
      },
    ]),
  );
}
