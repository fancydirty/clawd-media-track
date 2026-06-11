import { describe, expect, it } from "vitest";
import {
  VercelAiAgentNodes,
  type ResourceCandidate,
} from "../src/index.js";

describe("VercelAiAgentNodes", () => {
  it("turns structured keyword output into keyword agent results", async () => {
    const agent = new VercelAiAgentNodes({
      generateStructuredOutput: async (request) => {
        expect(request.schemaName).toBe("keyword_generation");
        expect(request.prompt).toContain("Show");
        return {
          keywords: ["Show 4K", "Show S01"],
          reason: "Use title plus quality and season hints.",
        };
      },
    });

    await expect(
      agent.generateKeywords({
        title: "Show",
        aliases: ["The Show"],
        missingEpisodes: ["S01E01"],
        previousErrors: [],
      }),
    ).resolves.toEqual({
      keywords: ["Show 4K", "Show S01"],
      reason: "Use title plus quality and season hints.",
    });
  });

  it("turns structured episode coverage output into an agent decision", async () => {
    const candidates: ResourceCandidate[] = [
      {
        id: "snapshot_1_candidate_1",
        snapshotId: "snapshot_1",
        index: 0,
        title: "Show S01E01 4K",
        type: "115",
        source: "fake",
        episodeHints: ["S01E01"],
        qualityHints: ["4K"],
        providerPayload: {},
      },
      {
        id: "snapshot_1_candidate_2",
        snapshotId: "snapshot_1",
        index: 1,
        title: "Unrelated",
        type: "115",
        source: "fake",
        episodeHints: [],
        qualityHints: [],
        providerPayload: {},
      },
    ];
    const agent = new VercelAiAgentNodes({
      generateStructuredOutput: async (request) => {
        expect(request.schemaName).toBe("episode_coverage");
        expect(request.prompt).toContain("snapshot_1_candidate_1");
        return {
          selectedCandidateIds: ["snapshot_1_candidate_1"],
          episodeMapping: {
            snapshot_1_candidate_1: ["S01E01"],
          },
          providerAheadEpisodeMapping: {},
          rejectedCandidateIds: ["snapshot_1_candidate_2"],
          confidence: "high",
          reason: "The first candidate covers the missing episode.",
        };
      },
    });

    await expect(
      agent.selectEpisodeCoverage({
        snapshotId: "snapshot_1",
        candidates,
        missingEpisodes: ["S01E01"],
        latestAiredEpisode: 1,
      }),
    ).resolves.toEqual({
      node: "vercel_ai_episode_coverage",
      snapshotId: "snapshot_1",
      selectedCandidateIds: ["snapshot_1_candidate_1"],
      episodeMapping: {
        snapshot_1_candidate_1: ["S01E01"],
      },
      providerAheadEpisodeMapping: {},
      rejectedCandidateIds: ["snapshot_1_candidate_2"],
      confidence: "high",
      reason: "The first candidate covers the missing episode.",
    });
  });
});
