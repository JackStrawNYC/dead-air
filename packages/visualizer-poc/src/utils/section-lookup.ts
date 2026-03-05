/**
 * Section Lookup — O(log n) binary search for current section.
 *
 * Replaces duplicated linear-scan section lookups in:
 *   - climax-state.ts
 *   - SceneRouter.tsx
 *   - AudioReactiveCanvas.tsx
 */

import type { SectionBoundary } from "../data/types";

export interface SectionInfo {
  /** Index of the current section (0-based) */
  sectionIndex: number;
  /** The section boundary object, or null if no sections */
  section: SectionBoundary | null;
  /** Progress within the current section (0-1) */
  sectionProgress: number;
}

/**
 * Binary search for the section containing the given frame index.
 *
 * Handles edge cases:
 *   - Empty sections array → index 0, null section, progress 0
 *   - Frame before first section → clamps to first section, progress 0
 *   - Frame after last section → clamps to last section, progress 1
 */
export function findCurrentSection(
  sections: SectionBoundary[],
  frameIdx: number,
): SectionInfo {
  if (sections.length === 0) {
    return { sectionIndex: 0, section: null, sectionProgress: 0 };
  }

  // Before first section
  if (frameIdx < sections[0].frameStart) {
    return { sectionIndex: 0, section: sections[0], sectionProgress: 0 };
  }

  // After last section
  const last = sections[sections.length - 1];
  if (frameIdx >= last.frameEnd) {
    return { sectionIndex: sections.length - 1, section: last, sectionProgress: 1 };
  }

  // Binary search
  let lo = 0;
  let hi = sections.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const s = sections[mid];
    if (frameIdx < s.frameStart) {
      hi = mid - 1;
    } else if (frameIdx >= s.frameEnd) {
      lo = mid + 1;
    } else {
      // Found it
      const sectionLen = s.frameEnd - s.frameStart;
      const progress = sectionLen > 0
        ? (frameIdx - s.frameStart) / sectionLen
        : 0;
      return { sectionIndex: mid, section: s, sectionProgress: progress };
    }
  }

  // Fallback: between sections (gap) — use the nearest
  const idx = Math.min(lo, sections.length - 1);
  return { sectionIndex: idx, section: sections[idx], sectionProgress: 0 };
}
