/**
 * Segue Detection — identifies continuous musical events where songs flow
 * directly into each other without a break. These "segue chains" should be
 * treated as single visual events with smooth palette transitions rather
 * than hard visual resets.
 */

import type { SetlistEntry } from '../data/types';
import { BAND_CONFIG } from '../data/band-config';

export interface SegueChain {
  /** Index of first song in the chain */
  startIndex: number;
  /** Indices of all songs in the chain */
  songIndices: number[];
  /** Track IDs in the chain */
  trackIds: string[];
  /** Whether this is a sacred segue (well-known pairing) */
  sacred: boolean;
}

/** Well-known segue pairings that deserve special visual treatment (from band config) */
const SACRED_SEGUES: string[][] = BAND_CONFIG.sacredSegues;

/**
 * Detect segue chains from the setlist.
 * A segue chain is a sequence of 2+ songs where each flows into the next.
 */
export function detectSegueChains(songs: SetlistEntry[]): SegueChain[] {
  const chains: SegueChain[] = [];
  let currentChain: number[] = [];

  for (let i = 0; i < songs.length; i++) {
    if (currentChain.length === 0) {
      currentChain.push(i);
    }

    // Check if this song segues into the next
    const seguesInto = songs[i].segueInto === true ||
      (typeof songs[i].segueInto === 'string' && songs[i].segueInto);

    if (seguesInto && i + 1 < songs.length) {
      currentChain.push(i + 1);
    } else {
      // Chain broken — save if 2+ songs
      if (currentChain.length >= 2) {
        const trackIds = currentChain.map(idx => songs[idx].trackId);
        const titles = currentChain.map(idx => songs[idx].title);
        const sacred = isSacredSegue(titles);
        chains.push({
          startIndex: currentChain[0],
          songIndices: [...currentChain],
          trackIds,
          sacred,
        });
      }
      currentChain = [];
    }
  }

  // Handle chain at end of setlist
  if (currentChain.length >= 2) {
    const trackIds = currentChain.map(idx => songs[idx].trackId);
    const titles = currentChain.map(idx => songs[idx].title);
    chains.push({
      startIndex: currentChain[0],
      songIndices: [...currentChain],
      trackIds,
      sacred: isSacredSegue(titles),
    });
  }

  return chains;
}

/** Check if a sequence of titles matches any known sacred segue */
function isSacredSegue(titles: string[]): boolean {
  return SACRED_SEGUES.some(sacred => {
    if (sacred.length > titles.length) return false;
    for (let start = 0; start <= titles.length - sacred.length; start++) {
      const match = sacred.every((s, i) =>
        titles[start + i].toLowerCase().includes(s.toLowerCase()) ||
        s.toLowerCase().includes(titles[start + i].toLowerCase())
      );
      if (match) return true;
    }
    return false;
  });
}

/**
 * For a given song index, return its segue context.
 * Used by the visual system to determine transition behavior.
 */
export function getSegueContext(
  songIndex: number,
  chains: SegueChain[],
): {
  inChain: boolean;
  chain: SegueChain | null;
  position: 'start' | 'middle' | 'end' | 'solo';
  sacred: boolean;
} {
  for (const chain of chains) {
    const posInChain = chain.songIndices.indexOf(songIndex);
    if (posInChain !== -1) {
      let position: 'start' | 'middle' | 'end' | 'solo';
      if (posInChain === 0) position = 'start';
      else if (posInChain === chain.songIndices.length - 1) position = 'end';
      else position = 'middle';

      return { inChain: true, chain, position, sacred: chain.sacred };
    }
  }
  return { inChain: false, chain: null, position: 'solo', sacred: false };
}

/**
 * Compute a blended palette for segue transitions.
 * As one song flows into the next, the color palette smoothly morphs.
 */
export function blendPalettes(
  fromPalette: { primary: number; secondary: number },
  toPalette: { primary: number; secondary: number },
  progress: number,
): { primary: number; secondary: number } {
  const blendHue = (a: number, b: number, t: number): number => {
    let diff = b - a;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return ((a + diff * t) % 360 + 360) % 360;
  };

  return {
    primary: blendHue(fromPalette.primary, toPalette.primary, progress),
    secondary: blendHue(fromPalette.secondary, toPalette.secondary, progress),
  };
}
