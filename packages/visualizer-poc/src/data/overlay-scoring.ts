/**
 * Overlay Scoring — per-overlay relevance scoring for rotation windows.
 *
 * Scores overlays based on energy match, texture routing, song identity,
 * stem section type, show arc, era, and contextual bonuses.
 *
 * Extracted from overlay-rotation.ts for focused responsibility.
 */

import type { OverlayEntry, OverlayPhaseHint } from "./types";
import type { SongIdentity } from "./song-identities";
import type { ShowArcModifiers } from "./show-arc";
import type { StemSectionType } from "../utils/stem-features";
import { BAND_CONFIG } from "./band-config";
import type { SemanticProfile } from "../utils/semantic-router";

// ─── Texture × Category routing (Dead-authentic) ───

const AMBIENT_WASH = new Set(["atmospheric", "nature"]);
const COSMIC_SACRED = new Set(["sacred"]);
const ENERGY_REACTIVE = new Set(["reactive", "geometric", "distortion"]);
const DEAD_FAMILY = new Set(["character"]);
const SHOW_NARRATIVE = new Set(["artifact", "info", "hud"]);

type TextureGroup = "wash" | "sacred" | "reactive" | "family" | "narrative";

const TEXTURE_GROUP_SCORE: Record<string, Record<TextureGroup, number>> = {
  ambient:  { wash: +0.25, sacred: +0.45, reactive: -0.30, family: +0.05, narrative: -0.50 },
  sparse:   { wash: +0.20, sacred: +0.25, reactive: -0.20, family: +0.10, narrative: -0.40 },
  melodic:  { wash: +0.10, sacred: +0.05, reactive:  0.00, family: +0.25, narrative: +0.10 },
  building: { wash: +0.05, sacred: +0.10, reactive: +0.15, family: +0.20, narrative: -0.05 },
  rhythmic: { wash:  0.00, sacred:  0.00, reactive: +0.20, family: +0.30, narrative: -0.15 },
  peak:     { wash: -0.05, sacred: +0.10, reactive: +0.25, family: +0.35, narrative: -0.35 },
};

const TAG_TEXTURE_BONUS: Record<string, Partial<Record<string, number>>> = {
  cosmic:         { ambient: +0.15, sparse: +0.10, peak: -0.05 },
  psychedelic:    { ambient: +0.05, melodic: +0.05, building: +0.10, rhythmic: +0.10, peak: +0.10 },
  festival:       { rhythmic: +0.15, peak: +0.20, melodic: +0.05, ambient: -0.15 },
  contemplative:  { ambient: +0.10, sparse: +0.15, melodic: +0.05, peak: -0.15 },
  [BAND_CONFIG.overlayTags.culture]: { ambient: +0.05, sparse: +0.05, melodic: +0.10, rhythmic: +0.10, peak: +0.15 },
  intense:        { peak: +0.15, rhythmic: +0.10, building: +0.05, ambient: -0.20, sparse: -0.15 },
  organic:        { ambient: +0.05, sparse: +0.05, melodic: +0.05 },
  mechanical:     { ambient: -0.15, sparse: -0.10, rhythmic: +0.05, peak: -0.10 },
  retro:          { ambient: -0.10, melodic: +0.05, sparse: -0.05 },
  aquatic:        { ambient: +0.05, sparse: +0.10, peak: -0.10 },
};

const SCENE_OVERLAY_BIAS = BAND_CONFIG.sceneOverlayBias;

const SET2_ADJUSTMENTS: Record<TextureGroup, number> = {
  sacred:    +0.10,
  wash:      +0.05,
  narrative: -0.15,
  reactive:   0.00,
  family:    -0.05,
};

const POST_PEAK_GRACE: Record<TextureGroup, number> = {
  sacred:    +0.20,
  wash:      +0.10,
  family:    +0.05,
  reactive:  -0.25,
  narrative: -0.30,
};

const DRUMS_SPACE_ADJUSTMENTS: Record<TextureGroup, number> = {
  sacred:    +0.40,
  wash:      +0.15,
  reactive:  -0.30,
  family:    -0.35,
  narrative: -0.50,
};

const POST_PEAK_TAG_BONUS: Record<string, number> = {
  contemplative: +0.10,
  intense:       -0.15,
};

/** Score penalty for overlays used in the previous window */
const REPEAT_PENALTY = 0.6;
/** Score bonus for overlays from a short previous window */
const CARRYOVER_BONUS = 0.2;
/** Windows shorter than this get carryover instead of repeat-penalty */
const MIN_WINDOW_FOR_ROTATION = 900;

/** Resolve an overlay's category to a texture group */
function resolveTextureGroup(category: string): TextureGroup | null {
  if (AMBIENT_WASH.has(category)) return "wash";
  if (COSMIC_SACRED.has(category)) return "sacred";
  if (ENERGY_REACTIVE.has(category)) return "reactive";
  if (DEAD_FAMILY.has(category)) return "family";
  if (SHOW_NARRATIVE.has(category)) return "narrative";
  return null;
}

/** Context needed for scoring an overlay within a rotation window */
export interface ScoringContext {
  windowEnergy: string;
  windowTexture: string | null;
  isDropout: boolean;
  previousWindowOverlays: Set<string>;
  previousWindowFrames: number;
  previousWindowEnergy: string | null;
  setNumber: number;
  isDrumsSpace: boolean;
  stemSectionType?: StemSectionType;
  mode?: string;
  songIdentity?: SongIdentity;
  showArcModifiers?: ShowArcModifiers;
  energyHints?: Record<string, OverlayPhaseHint>;
  /** Semantic profile from CLAP analysis for category bias */
  semanticProfile?: SemanticProfile;
}

/**
 * Score an overlay's relevance for a given rotation window.
 * Higher score = more appropriate for the current audio/visual context.
 */
export function scoreOverlayForWindow(
  entry: OverlayEntry,
  ctx: ScoringContext,
  rng: () => number,
): number {
  let score = 0.5;

  // Tier bonus
  if (entry.tier === "A") score += 0.15;

  // Energy band match
  if (entry.energyBand !== "any") {
    if (entry.energyBand === ctx.windowEnergy) {
      score += 0.3;
    } else {
      const rank: Record<string, number> = { low: 0, mid: 1, high: 2 };
      const dist = Math.abs(rank[entry.energyBand] - rank[ctx.windowEnergy]);
      score -= dist * 0.15;
    }
  }

  // Per-song energy phase hint
  const phaseHint = ctx.energyHints?.[entry.name];
  if (phaseHint) {
    if (phaseHint === ctx.windowEnergy) {
      score += 0.35;
    } else {
      const rank: Record<string, number> = { low: 0, mid: 1, high: 2 };
      const dist = Math.abs(rank[phaseHint] - rank[ctx.windowEnergy]);
      score -= dist * 0.20;
    }
  }

  // Weight preference by energy
  if (ctx.windowEnergy === "low" && entry.weight === 1) score += 0.2;
  if (ctx.windowEnergy === "high" && entry.weight >= 2) score += 0.15;
  if (ctx.windowEnergy === "low" && entry.weight === 3) score -= 0.25;

  // Character overlays slightly penalized at low energy — shader leads, icons support
  if (ctx.windowEnergy === "low" && entry.category === "character") {
    score -= 0.10;
  }

  // Dropout windows: prefer atmospheric/sacred layers
  if (ctx.isDropout) {
    if (entry.layer <= 2) score += 0.4;
    else score -= 0.3;
  }

  // Texture × category routing
  if (ctx.windowTexture) {
    const group = resolveTextureGroup(entry.category);
    if (group) {
      score += TEXTURE_GROUP_SCORE[ctx.windowTexture]?.[group] ?? 0;

      // Tag-based texture bonus
      if (entry.tags) {
        for (const tag of entry.tags) {
          score += TAG_TEXTURE_BONUS[tag]?.[ctx.windowTexture] ?? 0;
        }
      }

      // Set II deepening
      if (ctx.setNumber >= 2) {
        score += SET2_ADJUSTMENTS[group];
      }

      // Drums/Space
      if (ctx.isDrumsSpace) {
        score += DRUMS_SPACE_ADJUSTMENTS[group];
      }

      // Stem-section scoring
      if (ctx.stemSectionType) {
        const stemGroup = resolveTextureGroup(entry.category);
        if (stemGroup) {
          if (ctx.stemSectionType === "vocal") {
            if (stemGroup === "wash") score += 0.10;
            if (stemGroup === "sacred") score += 0.15;
            if (stemGroup === "family") score -= 0.15;
            if (stemGroup === "reactive") score -= 0.10;
          } else if (ctx.stemSectionType === "solo") {
            if (stemGroup === "family") score += 0.20;
            if (stemGroup === "wash") score -= 0.10;
          } else if (ctx.stemSectionType === "jam") {
            if (stemGroup === "reactive") score += 0.15;
            if (stemGroup === "wash") score += 0.10;
            if (stemGroup === "sacred") score -= 0.10;
          } else if (ctx.stemSectionType === "quiet") {
            if (stemGroup === "sacred") score += 0.20;
            if (stemGroup === "wash") score += 0.15;
            if (stemGroup === "reactive") score -= 0.20;
            if (stemGroup === "family") score -= 0.15;
          } else if (ctx.stemSectionType === "instrumental") {
            if (stemGroup === "reactive") score += 0.08;
            if (stemGroup === "wash") score += 0.05;
          }
        }
      }

      // Post-peak grace
      if (ctx.previousWindowEnergy === "high" && (ctx.windowEnergy === "low" || ctx.windowEnergy === "mid")) {
        score += POST_PEAK_GRACE[group];
        if (entry.tags) {
          for (const tag of entry.tags) {
            score += POST_PEAK_TAG_BONUS[tag] ?? 0;
          }
        }
      }
    }
  }

  // Scene-specific overlay bias
  score += SCENE_OVERLAY_BIAS[ctx.mode ?? ""]?.[entry.name] ?? 0;

  // Song identity overlay boost/suppress
  if (ctx.songIdentity) {
    if (ctx.songIdentity.overlayBoost?.includes(entry.name)) {
      score += 0.50;
    }
    if (ctx.songIdentity.overlaySuppress?.includes(entry.name)) {
      score -= 0.40;
    }
    if (ctx.songIdentity.moodKeywords && entry.tags) {
      for (const tag of entry.tags) {
        if (ctx.songIdentity.moodKeywords.includes(tag)) {
          score += 0.15;
        }
      }
    }
  }

  // Show arc overlay bias
  if (ctx.showArcModifiers?.overlayBias) {
    const group = resolveTextureGroup(entry.category);
    if (group) {
      const categoryBias = ctx.showArcModifiers.overlayBias[entry.category];
      if (categoryBias !== undefined) {
        score += categoryBias;
      }
    }
  }

  // Carryover vs repeat
  if (ctx.previousWindowOverlays.has(entry.name)) {
    if (ctx.previousWindowFrames < MIN_WINDOW_FOR_ROTATION) {
      score += CARRYOVER_BONUS;
    } else {
      score -= REPEAT_PENALTY;
    }
  }

  // Semantic profile bias: CLAP-derived category preferences
  if (ctx.semanticProfile && ctx.semanticProfile.dominantConfidence > 0.3) {
    const catBias = ctx.semanticProfile.overlayBiases[entry.category];
    if (catBias !== undefined) {
      score += catBias;
    }
  }

  // Deterministic jitter
  score += rng() * 0.1;

  return score;
}
