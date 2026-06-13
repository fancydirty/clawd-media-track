import { describe, expect, it } from "vitest";
import { classifyMediaType } from "../src/index.js";

describe("classifyMediaType", () => {
  it("classifies a Japanese animation series as anime", () => {
    expect(
      classifyMediaType({ baseType: "tv", genreIds: [16, 10765], originCountries: ["JP"] }),
    ).toBe("anime");
  });

  it("classifies a Japanese animated movie as anime", () => {
    expect(classifyMediaType({ baseType: "movie", genreIds: [16], originCountries: ["JP"] })).toBe(
      "anime",
    );
  });

  it("keeps a Western animation as its base type (not anime)", () => {
    expect(classifyMediaType({ baseType: "tv", genreIds: [16], originCountries: ["US"] })).toBe("tv");
  });

  it("keeps a live-action Japanese series as tv (animation genre required)", () => {
    expect(classifyMediaType({ baseType: "tv", genreIds: [18], originCountries: ["JP"] })).toBe("tv");
  });

  it("falls back to the base type when genre/origin are unknown", () => {
    expect(classifyMediaType({ baseType: "movie", genreIds: [], originCountries: [] })).toBe("movie");
  });
});
