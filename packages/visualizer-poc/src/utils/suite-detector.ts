/**
 * Suite Detection — identify multi-song suites from sacred segue chains.
 *
 * In a Grateful Dead show, certain songs always flow into each other:
 *   Help on the Way > Slipknot! > Franklin's Tower
 *   Scarlet Begonias > Fire on the Mountain
 *   China Cat Sunflower > I Know You Rider
 *   Playing in the Band > Uncle John's Band
 *
 * When we're inside a suite, the visuals should NOT hard-reset between songs:
 *   - Palette evolves smoothly (no reset)
 *   - Shader mode carries forward (suppress first scene change)
 *   - Overlay rotation continues (no pool reset)
 *   - Visual density ramps organically through the suite arc
 *
 * Detection uses sacredSegues chains from band-config.ts.
 */

import { BAND_CONFIG } from "../data/band-config";

export interface SuiteInfo {
  /** Whether this song is part of a multi-song suite */
  inSuite: boolean;
  /** Unique ID for the suite (first song title, lowercased) */
  suiteId: string | null;
  /** 0-based position within the suite */
  suitePosition: number;
  /** Total songs in this suite */
  suiteTotalSongs: number;
  /** Progress through the suite (0-1) */
  suiteProgress: number;
  /** Whether this is the first song in the suite */
  isSuiteStart: boolean;
  /** Whether this is the last song in the suite */
  isSuiteEnd: boolean;
}

const NO_SUITE: SuiteInfo = {
  inSuite: false,
  suiteId: null,
  suitePosition: 0,
  suiteTotalSongs: 0,
  suiteProgress: 0,
  isSuiteStart: false,
  isSuiteEnd: false,
};

/**
 * Build a lookup of song title → suite chains it belongs to.
 * Cached at module scope for performance.
 */
function buildSuiteLookup(): Map<string, string[][]> {
  const lookup = new Map<string, string[][]>();
  for (const chain of BAND_CONFIG.sacredSegues) {
    if (chain.length < 2) continue;
    for (const title of chain) {
      const key = title.toLowerCase();
      const existing = lookup.get(key) ?? [];
      existing.push(chain);
      lookup.set(key, existing);
    }
  }
  return lookup;
}

const SUITE_LOOKUP = buildSuiteLookup();

/**
 * Detect if a song is part of a suite given the setlist context.
 *
 * Looks at consecutive songs around the current position and matches
 * against known sacred segue chains.
 *
 * @param songTitles - Full setlist titles in order
 * @param currentIndex - Index of the current song in the setlist
 */
export function detectSuite(
  songTitles: string[],
  currentIndex: number,
): SuiteInfo {
  if (currentIndex < 0 || currentIndex >= songTitles.length) return NO_SUITE;

  const currentTitle = songTitles[currentIndex].toLowerCase();
  const chains = SUITE_LOOKUP.get(currentTitle);
  if (!chains) return NO_SUITE;

  // Find the longest matching chain that actually appears consecutively in the setlist
  let bestMatch: { chain: string[]; startIdx: number; matchLen: number } | null = null;

  for (const chain of chains) {
    // Find where in the chain the current song sits
    for (let chainPos = 0; chainPos < chain.length; chainPos++) {
      if (chain[chainPos].toLowerCase() !== currentTitle) continue;

      // Check if consecutive songs in the setlist match the chain
      const setlistStart = currentIndex - chainPos;
      if (setlistStart < 0) continue;

      let matchLen = 0;
      for (let i = 0; i < chain.length; i++) {
        const setlistIdx = setlistStart + i;
        if (setlistIdx >= songTitles.length) break;
        if (songTitles[setlistIdx].toLowerCase() !== chain[i].toLowerCase()) break;
        matchLen++;
      }

      // Need at least 2 consecutive matches including the current song
      if (matchLen >= 2 && matchLen > (bestMatch?.matchLen ?? 0)) {
        // Verify current song is within the matched portion
        const posInMatch = currentIndex - setlistStart;
        if (posInMatch >= 0 && posInMatch < matchLen) {
          bestMatch = { chain, startIdx: setlistStart, matchLen };
        }
      }
    }
  }

  if (!bestMatch) return NO_SUITE;

  const posInSuite = currentIndex - bestMatch.startIdx;
  const suiteLen = bestMatch.matchLen;

  return {
    inSuite: true,
    suiteId: bestMatch.chain[0].toLowerCase(),
    suitePosition: posInSuite,
    suiteTotalSongs: suiteLen,
    suiteProgress: suiteLen > 1 ? posInSuite / (suiteLen - 1) : 0,
    isSuiteStart: posInSuite === 0,
    isSuiteEnd: posInSuite === suiteLen - 1,
  };
}
