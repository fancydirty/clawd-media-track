import type { MediaType } from "./domain.js";

/** TMDB genre id for "Animation" (shared by tv and movie). */
const ANIMATION_GENRE_ID = 16;

/**
 * Refine a base TMDB type ("tv"/"movie") into "anime" when the work is
 * Japanese animation — animation genre AND a Japanese origin. Western/other
 * animation stays on its base type, so the library's 动漫 shelf means what a
 * Chinese audience expects (日漫), not "anything animated".
 */
export function classifyMediaType(input: {
  baseType: Extract<MediaType, "tv" | "movie">;
  genreIds: number[];
  originCountries: string[];
}): MediaType {
  const isAnimation = input.genreIds.includes(ANIMATION_GENRE_ID);
  const isJapanese = input.originCountries.includes("JP");
  if (isAnimation && isJapanese) {
    return "anime";
  }
  return input.baseType;
}
