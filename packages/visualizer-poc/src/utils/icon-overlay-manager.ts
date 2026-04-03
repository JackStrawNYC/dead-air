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

  // ── Batch 2 ──
  {
    id: "jerry-guitar",
    tags: ["dead_culture", "intense", "contemplative"],
    variants: [
      "assets/dead-icons/jerry-guitar-v1.png",
      "assets/dead-icons/jerry-guitar-v2.png",
      "assets/dead-icons/jerry-guitar-v3.png",
    ],
  },
  {
    id: "wall-of-sound",
    tags: ["dead_culture", "intense", "festival"],
    variants: [
      "assets/dead-icons/wall-of-sound-v1.png",
      "assets/dead-icons/wall-of-sound-v2.png",
    ],
  },
  {
    id: "tiedye",
    tags: ["dead_culture", "psychedelic", "festival", "organic"],
    variants: [
      "assets/dead-icons/tiedye-v1.png",
      "assets/dead-icons/tiedye-v2.png",
      "assets/dead-icons/tiedye-v3.png",
    ],
  },
  {
    id: "vw-bus",
    tags: ["dead_culture", "festival", "organic"],
    variants: [
      "assets/dead-icons/vw-bus-v1.png",
      "assets/dead-icons/vw-bus-v2.png",
    ],
  },
  {
    id: "mushrooms",
    tags: ["psychedelic", "organic", "cosmic"],
    variants: [
      "assets/dead-icons/mushrooms-v1.png",
      "assets/dead-icons/mushrooms-v2.png",
      "assets/dead-icons/mushrooms-v3.png",
    ],
  },
  {
    id: "uncle-sam",
    tags: ["dead_culture", "intense", "celebration"],
    variants: [
      "assets/dead-icons/uncle-sam-v1.png",
      "assets/dead-icons/uncle-sam-v2.png",
    ],
  },
  {
    id: "skeleton-tophat",
    tags: ["dead_culture", "celebration", "contemplative"],
    variants: [
      "assets/dead-icons/skeleton-tophat-v1.png",
      "assets/dead-icons/skeleton-tophat-v2.png",
      "assets/dead-icons/skeleton-tophat-v3.png",
    ],
  },
  {
    id: "scarlet-fire",
    tags: ["dead_culture", "intense", "psychedelic"],
    variants: [
      "assets/dead-icons/scarlet-fire-v1.png",
      "assets/dead-icons/scarlet-fire-v2.png",
      "assets/dead-icons/scarlet-fire-v3.png",
    ],
  },
  {
    id: "cosmic-eye",
    tags: ["cosmic", "psychedelic", "contemplative"],
    variants: [
      "assets/dead-icons/cosmic-eye-v1.png",
      "assets/dead-icons/cosmic-eye-v2.png",
    ],
  },
  {
    id: "aoxomoxoa",
    tags: ["dead_culture", "psychedelic", "cosmic"],
    variants: [
      "assets/dead-icons/aoxomoxoa-v1.png",
      "assets/dead-icons/aoxomoxoa-v2.png",
      "assets/dead-icons/aoxomoxoa-v3.png",
    ],
  },
  {
    id: "drums",
    tags: ["dead_culture", "intense", "organic"],
    variants: [
      "assets/dead-icons/drums-v1.png",
      "assets/dead-icons/drums-v2.png",
    ],
  },
  {
    id: "skeleton-band-full",
    tags: ["dead_culture", "celebration", "festival"],
    variants: [
      "assets/dead-icons/skeleton-band-full-v1.png",
      "assets/dead-icons/skeleton-band-full-v2.png",
    ],
  },
  {
    id: "jester",
    tags: ["dead_culture", "psychedelic", "cosmic"],
    variants: [
      "assets/dead-icons/jester-v1.png",
      "assets/dead-icons/jester-v2.png",
    ],
  },
  {
    id: "owl",
    tags: ["cosmic", "contemplative", "organic"],
    variants: [
      "assets/dead-icons/owl-v1.png",
      "assets/dead-icons/owl-v2.png",
    ],
  },
  {
    id: "lightning-storm",
    tags: ["dead_culture", "intense", "cosmic"],
    variants: [
      "assets/dead-icons/lightning-storm-v1.png",
      "assets/dead-icons/lightning-storm-v2.png",
    ],
  },
  {
    id: "sugaree",
    tags: ["dead_culture", "contemplative", "tender"],
    variants: [
      "assets/dead-icons/sugaree-v1.png",
      "assets/dead-icons/sugaree-v2.png",
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
  const WINDOW_FRAMES = 1800; // 60 seconds per icon — matches getIconForFrame
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
 * Section type → icon presence.
 * Icons are the visual hero during structured parts.
 * Shader breathes during jams/solos/space.
 *
 * sectionType encoding: 0=intro, 1=verse, 2=chorus, 3=bridge, 4=solo, 5=jam, 6=outro, 7=space
 */
function sectionIconPresence(sectionType: number): number {
  if (sectionType < 0.5) return 0.70;  // intro
  if (sectionType < 1.5) return 0.85;  // verse: Dead imagery clearly visible
  if (sectionType < 2.5) return 0.95;  // chorus: icons prominent at peaks
  if (sectionType < 3.5) return 0.75;  // bridge
  if (sectionType < 4.5) return 0.65;  // solo: shader forward, icons present
  if (sectionType < 5.5) return 0.55;  // jam: shader dominant, icons ghostly
  if (sectionType < 6.5) return 0.65;  // outro
  return 0.40;                          // space: minimal
}

/**
 * Get the current icon path and target opacity for a given frame.
 * Opacity driven by section type: imagery during structure, shader during jams.
 */
export function getIconForFrame(
  schedule: string[],
  frame: number,
  energy: number,
  sectionType?: number,
  climaxPhase?: number,
): { iconPath: string; opacity: number } {
  if (schedule.length === 0) return { iconPath: "", opacity: 0 };

  const WINDOW_FRAMES = 1800; // 60 seconds per icon — unhurried, iconic presence
  const FADE_IN_FRAMES = 300;  // 10s smooth fade-in
  const FADE_OUT_FRAMES = 300; // 10s smooth fade-out (gentle crossfade)

  const windowIdx = Math.min(
    schedule.length - 1,
    Math.floor(frame / WINDOW_FRAMES),
  );
  const frameInWindow = frame - windowIdx * WINDOW_FRAMES;

  // Section-aware base opacity
  const sectionPresence = sectionIconPresence(sectionType ?? 1); // default to verse

  // Climax: icons recede, shader owns the peak moment
  const climaxBoost = (climaxPhase !== undefined && climaxPhase >= 2 && climaxPhase <= 3)
    ? 0.15 : 0;

  // Energy modulation within the section presence range
  const energyMod = 0.85 + energy * 0.15;

  const baseOpacity = Math.min(1.0, (sectionPresence + climaxBoost) * energyMod);

  // Smooth eased fade-in and fade-out for organic transitions
  const fadeInT = Math.min(1.0, frameInWindow / FADE_IN_FRAMES);
  const fadeIn = fadeInT * fadeInT * (3 - 2 * fadeInT); // smoothstep
  const framesLeft = WINDOW_FRAMES - frameInWindow;
  const isLastWindow = windowIdx >= schedule.length - 1;
  const fadeOutT = isLastWindow ? 1.0 : Math.min(1.0, framesLeft / FADE_OUT_FRAMES);
  const fadeOut = fadeOutT * fadeOutT * (3 - 2 * fadeOutT); // smoothstep

  return {
    iconPath: schedule[windowIdx],
    opacity: baseOpacity * fadeIn * fadeOut,
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
