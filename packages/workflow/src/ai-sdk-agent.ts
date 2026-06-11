import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output } from "ai";
import { z } from "zod";
import type {
  AgentDecision,
  Confidence,
  ResourceCandidate,
} from "./domain.js";
import type { AgentNodes } from "./ports.js";

const DEFAULT_PROVIDER_NAME = "xiaomi-mimo";
const DEFAULT_MODEL_ID = "2.5-pro";

const keywordGenerationSchema = z.object({
  keywords: z.array(z.string()).min(1),
  reason: z.string(),
});

const episodeCoverageSchema = z.object({
  selectedCandidateIds: z.array(z.string()),
  episodeMapping: z.record(z.string(), z.array(z.string())),
  providerAheadEpisodeMapping: z.record(z.string(), z.array(z.string())),
  rejectedCandidateIds: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  reason: z.string(),
});

type KeywordGenerationOutput = z.infer<typeof keywordGenerationSchema>;
type EpisodeCoverageOutput = z.infer<typeof episodeCoverageSchema>;
type StructuredOutput = KeywordGenerationOutput | EpisodeCoverageOutput;

export interface StructuredOutputRequest {
  schemaName: "keyword_generation" | "episode_coverage";
  system: string;
  prompt: string;
}

export type GenerateStructuredOutput = (request: StructuredOutputRequest) => Promise<StructuredOutput>;

export interface VercelAiAgentNodesOptions {
  apiKey?: string;
  baseURL?: string;
  modelId?: string;
  providerName?: string;
  generateStructuredOutput?: GenerateStructuredOutput;
}

export class VercelAiAgentNodes implements AgentNodes {
  private readonly generateStructuredOutput: GenerateStructuredOutput;

  constructor(options: VercelAiAgentNodesOptions = {}) {
    this.generateStructuredOutput =
      options.generateStructuredOutput ?? createAiSdkStructuredGenerator(options);
  }

  async generateKeywords(input: {
    title: string;
    aliases: string[];
    missingEpisodes: string[];
    previousErrors: string[];
  }): Promise<{ keywords: string[]; reason: string }> {
    const output = keywordGenerationSchema.parse(
      await this.generateStructuredOutput({
        schemaName: "keyword_generation",
        system:
          "You generate concise media search keywords for a deterministic acquisition workflow. Return only structured data.",
        prompt: JSON.stringify(
          {
            title: input.title,
            aliases: input.aliases,
            missingEpisodes: input.missingEpisodes,
            previousErrors: input.previousErrors,
          },
          null,
          2,
        ),
      }),
    );

    return {
      keywords: output.keywords,
      reason: output.reason,
    };
  }

  async selectEpisodeCoverage(input: {
    snapshotId: string;
    candidates: ResourceCandidate[];
    missingEpisodes: string[];
    latestAiredEpisode: number;
  }): Promise<AgentDecision> {
    const output = episodeCoverageSchema.parse(
      await this.generateStructuredOutput({
        schemaName: "episode_coverage",
        system:
          "You select resource candidates for a deterministic media workflow. Choose only candidate ids from the provided snapshot.",
        prompt: JSON.stringify(
          {
            snapshotId: input.snapshotId,
            missingEpisodes: input.missingEpisodes,
            latestAiredEpisode: input.latestAiredEpisode,
            candidates: input.candidates.map((candidate) => ({
              id: candidate.id,
              title: candidate.title,
              type: candidate.type,
              source: candidate.source,
              episodeHints: candidate.episodeHints,
              qualityHints: candidate.qualityHints,
            })),
          },
          null,
          2,
        ),
      }),
    );

    return {
      node: "vercel_ai_episode_coverage",
      snapshotId: input.snapshotId,
      selectedCandidateIds: output.selectedCandidateIds,
      episodeMapping: output.episodeMapping,
      providerAheadEpisodeMapping: output.providerAheadEpisodeMapping,
      rejectedCandidateIds: output.rejectedCandidateIds,
      confidence: output.confidence as Confidence,
      reason: output.reason,
    };
  }
}

export function createXiaomiMimoAgentNodesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): VercelAiAgentNodes {
  const options: VercelAiAgentNodesOptions = {};
  if (env.XIAOMI_MIMO_API_KEY !== undefined) {
    options.apiKey = env.XIAOMI_MIMO_API_KEY;
  }
  if (env.XIAOMI_MIMO_BASE_URL !== undefined) {
    options.baseURL = env.XIAOMI_MIMO_BASE_URL;
  }
  if (env.XIAOMI_MIMO_MODEL_ID !== undefined) {
    options.modelId = env.XIAOMI_MIMO_MODEL_ID;
  }
  return new VercelAiAgentNodes(options);
}

function createAiSdkStructuredGenerator(options: VercelAiAgentNodesOptions): GenerateStructuredOutput {
  const providerSettings: Parameters<typeof createOpenAICompatible>[0] = {
    name: options.providerName ?? DEFAULT_PROVIDER_NAME,
    baseURL: options.baseURL ?? "https://token-plan-sgp.xiaomimimo.com/v1",
  };
  if (options.apiKey !== undefined) {
    providerSettings.apiKey = options.apiKey;
  }
  const provider = createOpenAICompatible(providerSettings);
  const model = provider(options.modelId ?? DEFAULT_MODEL_ID);

  return async (request) => {
    if (request.schemaName === "keyword_generation") {
      const { output } = await generateText({
        model,
        system: request.system,
        prompt: request.prompt,
        output: Output.object({
          schema: keywordGenerationSchema,
          name: "keyword_generation",
        }),
      });
      return output;
    }

    const { output } = await generateText({
      model,
      system: request.system,
      prompt: request.prompt,
      output: Output.object({
        schema: episodeCoverageSchema,
        name: "episode_coverage",
      }),
    });
    return output;
  };
}
