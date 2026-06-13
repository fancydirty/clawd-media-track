import { describe, expect, it } from "vitest";
import {
  FakeAgentNodes,
  FakeResourceProvider,
  FakeStorageExecutor,
  InMemoryWorkflowRepository,
  queueMovieAcquisition,
  runQueuedMovieAcquisition,
  type MediaTitle,
} from "../src/index.js";

const fixedNow = () => "2026-06-13T00:00:00.000Z";

function movieTitle(): MediaTitle {
  return {
    id: "tmdb_movie_872585",
    tmdbId: 872585,
    type: "movie",
    title: "奥本海默",
    originalTitle: "Oppenheimer",
    year: 2023,
    aliases: ["Oppenheimer"],
  };
}

describe("movie acquisition command + worker", () => {
  it("queues a movie and blocks a duplicate while active (title lock)", async () => {
    const repository = new InMemoryWorkflowRepository();
    const first = await queueMovieAcquisition({
      title: movieTitle(),
      keyword: "奥本海默 4K",
      repository,
      createWorkflowRunId: () => "run_movie_1",
      now: fixedNow,
    });
    expect(first.status).toBe("queued");
    const second = await queueMovieAcquisition({
      title: movieTitle(),
      keyword: "奥本海默 4K",
      repository,
      createWorkflowRunId: () => "run_movie_2",
      now: fixedNow,
    });
    expect(second.status).toBe("already_running");
  });

  it("worker claims, runs, and persists a completed movie acquisition", async () => {
    const repository = new InMemoryWorkflowRepository();
    await queueMovieAcquisition({
      title: movieTitle(),
      keyword: "奥本海默 4K",
      repository,
      createWorkflowRunId: () => "run_movie",
      now: fixedNow,
    });
    const storage = new FakeStorageExecutor({
      transferOutcomes: {
        snapshot_1_candidate_1: {
          status: "succeeded",
          providerMessage: "",
          files: [
            {
              id: "oppen_v",
              storageDirectoryId: "x",
              name: "Oppenheimer.2023.mkv",
              sizeBytes: 8_000_000_000,
              episodeCode: "S01E01",
              providerFileId: "oppen_v",
            },
          ],
        },
      },
    });

    const result = await runQueuedMovieAcquisition({
      repository,
      resourceProvider: new FakeResourceProvider({
        keywordResults: { "奥本海默 4K": [{ title: "奥本海默 2023 4K", episodeHints: [], qualityHints: ["4K"] }] },
      }),
      storage,
      agents: new FakeAgentNodes(),
      stagingParentDirectoryId: "movies_root",
      moviesParentDirectoryId: "movies_root",
      now: fixedNow,
    });

    expect(result.status).toBe("ran");
    const saved = await repository.getWorkflowRunSnapshot("run_movie");
    expect(saved?.workflowRun.kind).toBe("movie_init");
    expect(saved?.workflowRun.status).toBe("succeeded");
    expect(saved?.title.type).toBe("movie");
  });
});
