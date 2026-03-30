/**
 * Icon overlay manager — selects and rotates image icons per song.
 *
 * Picks icons based on song identity mood keywords, rotates on a
 * 20-second cadence with seeded randomness for deterministic renders.
 * Uses noise dissolve for transitions (handled by ShaderOverlayQuad GLSL).
 */

import { seededLCG } from "./seededRandom";
import type { SongIdentity } from "../data/song-identities";

// ── Icon catalog ──
// Maps icon ID to file paths (variants). Show seed picks which variant.

export interface IconEntry {
  id: string;
  /** Mood tags this icon matches (for song identity routing) */
  tags: string[];
  /** File paths relative to public/ */
  variants: string[];
}

const ICON_CATALOG: IconEntry[] = [
  {
    id: "stealie",
    tags: ["dead_culture", "psychedelic", "cosmic", "intense"],
    variants: [
      "assets/dead-icons/stealie-v1.png",
      "assets/dead-icons/stealie-v2.png",
      "assets/dead-icons/stealie-v3.png",
      "assets/dead-icons/stealie-v4.png",
      "assets/dead-icons/stealie-v5.png",
    ],
  },
  {
    id: "bears",
    tags: ["dead_culture", "festival", "organic", "celebration"],
    variants: [
      "assets/dead-icons/bears-v1.png",
      "assets/dead-icons/bears-v2.png",
      "assets/dead-icons/bears-v3.png",
      "assets/dead-icons/bears-v4.png",
      "assets/dead-icons/bears-v5.png",
    ],
  },
  {
    id: "skeleton",
    tags: ["dead_culture", "intense", "contemplative"],
    variants: [
      "assets/dead-icons/skeleton-v1.png",
      "assets/dead-icons/skeleton-v2.png",
      "assets/dead-icons/skeleton-v3.png",
      "assets/dead-icons/skeleton-v4.png",
      "assets/dead-icons/skeleton-v5.png",
    ],
  },
  {
    id: "roses",
    tags: ["dead_culture", "organic", "contemplative", "tender"],
    variants: [
      "assets/dead-icons/roses-v1.png",
      "assets/dead-icons/roses-v2.png",
      "assets/dead-icons/roses-v3.png",
      "assets/dead-icons/roses-v4.png",
    ],
  },
  {
    id: "terrapin",
    tags: ["dead_culture", "cosmic", "contemplative", "organic"],
    variants: [
      "assets/dead-icons/terrapin-v1.png",
      "assets/dead-icons/terrapin-v2.png",
      "assets/dead-icons/terrapin-v3.png",
      "assets/dead-icons/terrapin-v4.png",
    ],
  },
  {
    id: "bolt",
    tags: ["dead_culture", "intense", "psychedelic"],
    variants: [
      "assets/dead-icons/bolt-v1.png",
      "assets/dead-icons/bolt-v2.png",
      "assets/dead-icons/bolt-v3.png",
    ],
  },
  {
    id: "cosmic-character",
    tags: ["dead_culture", "psychedelic", "cosmic", "festival"],
    variants: [
      "assets/dead-icons/cosmic-character-v1.png",
      "assets/dead-icons/cosmic-character-v2.png",
      "assets/dead-icons/cosmic-character-v3.png",
    ],
  },
  {
    id: "darkstar",
    tags: ["cosmic", "psychedelic", "contemplative"],
    variants: [
      "assets/dead-icons/darkstar-v1.png",
      "assets/dead-icons/darkstar-v2.png",
      "assets/dead-icons/darkstar-v3.png",
    ],
  },
  {
    id: "mystical",
    tags: ["cosmic", "psychedelic", "contemplative"],
    variants: [
      "assets/dead-icons/mystical-v1.png",
      "assets/dead-icons/mystical-v2.png",
      "assets/dead-icons/mystical-v3.png",
    ],
  },
  {
    id: "bertha",
    tags: ["dead_culture", "intense", "celebration"],
    variants: [
      "assets/dead-icons/bertha-v1.png",
      "assets/dead-icons/bertha-v2.png",
      "assets/dead-icons/bertha-v3.png",
    ],
  },
];

/**
 * Build a per-song icon rotation schedule.
 * Returns an array of icon file paths, one per rotation window.
 *
 * @param songIdentity — curated identity for mood matching
 * @param durationFrames — total song duration in frames (30fps)
 * @param showSeed — deterministic seed
 * @param trackId — for seed salting
 */
export function buildIconSchedule(
  songIdentity: SongIdentity | undefined,
  durationFrames: number,
  showSeed: number,
  trackId: string,
): string[] {
  const WINDOW_FRAMES = 600; // 20 seconds per icon
  const windowCount = Math.max(1, Math.ceil(durationFrames / WINDOW_FRAMES));

  // Score icons by mood keyword overlap with song identity
  const moodKeywords = songIdentity?.moodKeywords ?? [];
  const scoredIcons = ICON_CATALOG.map((icon) => {
    let score = 1; // base score: every icon is a candidate
    for (const tag of icon.tags) {
      if (moodKeywords.includes(tag)) score += 2;
    }
    // Dead culture icons always get a boost
    if (icon.tags.includes("dead_culture")) score += 1;
    return { icon, score };
  });

  // Sort by score descending
  scoredIcons.sort((a, b) => b.score - a.score);

  // Pick top icons, cycling through them for the schedule
  const rng = seededLCG(showSeed + hashStr(trackId));
  const schedule: string[] = [];

  for (let w = 0; w < windowCount; w++) {
    // Cycle through top-scored icons, with seeded variant selection
    const iconIdx = w % scoredIcons.length;
    const icon = scoredIcons[iconIdx].icon;
    const variantIdx = Math.floor(rng() * icon.variants.length);
    schedule.push(icon.variants[variantIdx]);
  }

  return schedule;
}

/**
 * Get the current icon path and target opacity for a given frame.
 * Handles smooth transitions between rotation windows.
 */
export function getIconForFrame(
  schedule: string[],
  frame: number,
  energy: number,
): { iconPath: string; opacity: number } {
  if (schedule.length === 0) return { iconPath: "", opacity: 0 };

  const WINDOW_FRAMES = 600; // 20 seconds
  const TRANSITION_FRAMES = 90; // 3 second dissolve

  const windowIdx = Math.min(
    schedule.length - 1,
    Math.floor(frame / WINDOW_FRAMES),
  );
  const frameInWindow = frame - windowIdx * WINDOW_FRAMES;

  // Base opacity: energy-scaled (quiet = subtle, loud = visible)
  // Range: 0.15 (quiet) to 0.55 (loud) — never dominant, always atmospheric
  const baseOpacity = 0.15 + energy * 0.40;

  // Dissolve in at start of window
  let transitionFactor = 1.0;
  if (frameInWindow < TRANSITION_FRAMES) {
    transitionFactor = frameInWindow / TRANSITION_FRAMES;
  }
  // Dissolve out at end of window (if not last window)
  const framesLeft = WINDOW_FRAMES - frameInWindow;
  if (windowIdx < schedule.length - 1 && framesLeft < TRANSITION_FRAMES) {
    transitionFactor = Math.min(transitionFactor, framesLeft / TRANSITION_FRAMES);
  }

  return {
    iconPath: schedule[windowIdx],
    opacity: baseOpacity * transitionFactor,
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
