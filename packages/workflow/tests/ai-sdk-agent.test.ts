import { describe, expect, it } from "vitest";
import {
  AGENT_NODE_SPECS,
  createXiaomiMimoProviderConfig,
  runAgentNode,
  VercelAiAgentNodes,
  type ResourceCandidate,
  type ResourceSnapshot,
} from "../src/index.js";

describe("VercelAiAgentNodes", () => {
  it("uses the Singapore Token Plan model id and api-key header by default", () => {
    const config = createXiaomiMimoProviderConfig({ apiKey: "secret" });

    expect(config.modelId).toBe("mimo-v2.5-pro");
    expect(config.providerSettings).toMatchObject({
      baseURL: "https://token-plan-sgp.xiaomimimo.com/v1",
      headers: {
        "api-key": "secret",
      },
    });
    expect(config.providerSettings).not.toHaveProperty("apiKey");
  });

  it("defines specialist node specs from the real workflow lessons", () => {
    expect(AGENT_NODE_SPECS.KeywordAgent.system).toContain("PanSou can reject obvious keywords");
    expect(AGENT_NODE_SPECS.CandidateMatchAgent.system).toContain("wrong target");
    expect(AGENT_NODE_SPECS.EpisodeCoverageAgent.system).toContain("provider_ahead");
    expect(AGENT_NODE_SPECS.QualitySelectionAgent.system).toContain("Type 1");
    expect(AGENT_NODE_SPECS.PackageRecognitionAgent.system).toContain("multi-season");
    expect(AGENT_NODE_SPECS.ResourceDiscoveryAgent.system).toContain("read-only searchResources");
  });

  it("runs a node with read-only tools, maxSteps, and audit trace", async () => {
    const result = await runAgentNode({
      spec: AGENT_NODE_SPECS.ResourceDiscoveryAgent,
      input: {
        title: "Show",
        initialKeyword: "Show 4K",
      },
      tools: {
        searchResources: {
          readOnly: true,
          description: "Search fake resource snapshots.",
          inputSchema: AGENT_NODE_SPECS.ResourceDiscoveryAgent.toolInputSchemas.searchResources,
          execute: async ({ keyword }) => ({
            snapshotId: "snapshot_1",
            keyword,
            candidateCount: 1,
          }),
        },
      },
      executor: async (request) => {
        expect(request.maxSteps).toBeGreaterThanOrEqual(4);
        const searchResult = await request.tools!.searchResources!.execute({ keyword: "Show S01" });
        expect(searchResult).toMatchObject({
          snapshotId: "snapshot_1",
        });
        return {
          selectedSnapshotId: "snapshot_1",
          searchedKeywords: ["Show S01"],
          rejectedSnapshotIds: [],
          confidence: "high",
          reason: "Alias search found the target.",
        };
      },
    });

    expect(result.output).toMatchObject({
      selectedSnapshotId: "snapshot_1",
      searchedKeywords: ["Show S01"],
    });
    expect(result.trace.map((event) => event.type)).toEqual([
      "node_start",
      "tool_call",
      "tool_result",
      "node_finish",
    ]);
  });

  it("discovers resources through the read-only search tool", async () => {
    const snapshots: ResourceSnapshot[] = [
      {
        id: "snapshot_1",
        provider: "fake",
        keyword: "Show Alias",
        candidates: [
          {
            id: "snapshot_1_candidate_1",
            snapshotId: "snapshot_1",
            index: 0,
            title: "Show Alias S01E01 4K",
            type: "115",
            source: "fake",
            episodeHints: ["S01E01"],
            qualityHints: ["4K"],
            providerPayload: {},
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const agent = new VercelAiAgentNodes({
      generateStructuredOutput: async (request) => {
        expect(request.schemaName).toBe("resource_discovery");
        expect(request.system).toBe(AGENT_NODE_SPECS.ResourceDiscoveryAgent.system);
        expect(request.tools!.searchResources!.readOnly).toBe(true);
        const searchResult = await request.tools!.searchResources!.execute({ keyword: "Show Alias" });
        expect(searchResult).toMatchObject({
          snapshotId: "snapshot_1",
          candidateCount: 1,
        });
        return {
          selectedSnapshotId: "snapshot_1",
          searchedKeywords: ["Show Alias"],
          rejectedSnapshotIds: [],
          confidence: "high",
          reason: "Alias search returned the target.",
        };
      },
    });

    await expect(
      agent.discoverResources({
        title: "Show",
        aliases: ["Show Alias"],
        missingEpisodes: ["S01E01"],
        initialKeyword: "Show 4K",
        searchResources: async ({ keyword }) => {
          if (keyword !== "Show Alias") {
            throw new Error("unexpected keyword");
          }
          return snapshots[0]!;
        },
      }),
    ).resolves.toMatchObject({
      snapshot: {
        id: "snapshot_1",
      },
      decision: {
        selectedSnapshotId: "snapshot_1",
      },
    });
  });

  it("turns structured keyword output into keyword agent results", async () => {
    const agent = new VercelAiAgentNodes({
      generateStructuredOutput: async (request) => {
        expect(request.schemaName).toBe("keyword_generation");
        expect(request.system).toBe(AGENT_NODE_SPECS.KeywordAgent.system);
        expect(request.maxSteps).toBe(AGENT_NODE_SPECS.KeywordAgent.maxSteps);
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

  it("turns structured candidate match output into a target-resource judgment", async () => {
    const candidates: ResourceCandidate[] = [
      {
        id: "snapshot_1_candidate_1",
        snapshotId: "snapshot_1",
        index: 0,
        title: "Different Show S01E01 4K",
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
        title: "Show S01E01 4K",
        type: "115",
        source: "fake",
        episodeHints: ["S01E01"],
        qualityHints: ["4K"],
        providerPayload: {},
      },
    ];
    const agent = new VercelAiAgentNodes({
      generateStructuredOutput: async (request) => {
        expect(request.schemaName).toBe("candidate_match");
        expect(request.prompt).toContain("Different Show");
        return {
          matchedCandidateIds: ["snapshot_1_candidate_2"],
          rejectedCandidateIds: ["snapshot_1_candidate_1"],
          uncertainCandidateIds: [],
          confidence: "high",
          reason: "The second candidate is the target title.",
        };
      },
    });

    await expect(
      agent.matchCandidates({
        snapshotId: "snapshot_1",
        title: "Show",
        aliases: ["The Show"],
        candidates,
      }),
    ).resolves.toEqual({
      node: "vercel_ai_candidate_match",
      snapshotId: "snapshot_1",
      matchedCandidateIds: ["snapshot_1_candidate_2"],
      rejectedCandidateIds: ["snapshot_1_candidate_1"],
      uncertainCandidateIds: [],
      confidence: "high",
      reason: "The second candidate is the target title.",
    });
  });

  it("turns structured package recognition output into a bounded file mapping decision", async () => {
    const agent = new VercelAiAgentNodes({
      generateStructuredOutput: async (request) => {
        expect(request.schemaName).toBe("package_recognition");
        expect(request.prompt).toContain("provider_1");
        return {
          fileMappings: [
            {
              providerFileId: "provider_1",
              seasonNumber: 1,
              episodeNumber: 1,
              confidence: "medium",
              reason: "The parent package and filename indicate the first episode.",
            },
          ],
          rejectedProviderFileIds: [],
          confidence: "medium",
          reason: "One ambiguous package file was mapped.",
        };
      },
    });

    await expect(
      agent.recognizePackage({
        title: "Show",
        year: 2024,
        files: [
          {
            path: "Show Pack/Disc A/Episode 01.mkv",
            providerFileId: "provider_1",
            sizeBytes: 100,
          },
        ],
        parserEvidence: [
          {
            path: "Show Pack/Disc A/Episode 01.mkv",
            providerFileId: "provider_1",
            parsedSeasonNumber: null,
            parsedEpisodeNumber: 1,
            confidence: "medium",
            evidence: ["filename_episode"],
          },
        ],
      }),
    ).resolves.toEqual({
      node: "vercel_ai_package_recognition",
      fileMappings: [
        {
          providerFileId: "provider_1",
          seasonNumber: 1,
          episodeNumber: 1,
          confidence: "medium",
          reason: "The parent package and filename indicate the first episode.",
        },
      ],
      rejectedProviderFileIds: [],
      confidence: "medium",
      reason: "One ambiguous package file was mapped.",
    });
  });
});

describe("VercelAiAgentNodes.planAcquisition", () => {
  it("plans acquisition through the read-only search tool and observed snapshots", async () => {
    const snapshot: ResourceSnapshot = {
      id: "snapshot_1",
      provider: "fake",
      keyword: "Show 4K",
      candidates: [
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
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const agent = new VercelAiAgentNodes({
      generateStructuredOutput: async (request) => {
        expect(request.schemaName).toBe("acquisition_planning");
        expect(request.prompt).toContain("failureEvidence");
        const observed = await request.tools!.searchResources!.execute({ keyword: "Show 4K" });
        expect(observed).toMatchObject({ snapshotId: "snapshot_1", candidateCount: 1 });
        return {
          selectedSnapshotId: "snapshot_1",
          searchedKeywords: ["Show 4K"],
          candidateDispositions: [
            {
              candidateId: "snapshot_1_candidate_1",
              disposition: "selected",
              episodes: ["S01E01"],
              reason: "Exact missing episode.",
            },
          ],
          confidence: "high",
          reason: "Initial keyword was enough.",
        };
      },
    });

    const result = await agent.planAcquisition({
      title: "Show",
      aliases: [],
      seasonNumber: 1,
      qualityPreference: "4K",
      missingEpisodes: ["S01E01"],
      latestAiredEpisode: 1,
      initialKeyword: "Show 4K",
      failureEvidence: [],
      searchResources: async () => snapshot,
    });

    expect(result.plan.node).toBe("vercel_ai_acquisition_planning");
    expect(result.plan.selectedSnapshotId).toBe("snapshot_1");
    expect(result.snapshots).toEqual([snapshot]);
  });

  it("surfaces provider errors to the model as tool results instead of throwing", async () => {
    const agent = new VercelAiAgentNodes({
      generateStructuredOutput: async (request) => {
        const observed = await request.tools!.searchResources!.execute({ keyword: "Show 4K" });
        expect(observed).toEqual({ keyword: "Show 4K", error: "provider 400" });
        return {
          selectedSnapshotId: null,
          searchedKeywords: ["Show 4K"],
          candidateDispositions: [],
          confidence: "low",
          reason: "Provider failed for every keyword tried.",
        };
      },
    });

    const result = await agent.planAcquisition({
      title: "Show",
      aliases: [],
      seasonNumber: 1,
      qualityPreference: "4K",
      missingEpisodes: ["S01E01"],
      latestAiredEpisode: 1,
      initialKeyword: "Show 4K",
      failureEvidence: [],
      searchResources: async () => {
        throw new Error("provider 400");
      },
    });

    expect(result.plan.selectedSnapshotId).toBeNull();
    expect(result.snapshots).toEqual([]);
  });
});
