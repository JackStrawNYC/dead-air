/**
 * SceneRouter — determines which visual mode to render based on
 * current frame position within song sections.
 * Handles 90-frame crossfades between mode transitions.
 */

import React from "react";
import { useCurrentFrame } from "remotion";
import { SceneCrossfade } from "./SceneCrossfade";
import { renderScene, getComplement, getModesForEnergy, getModesForContinuousEnergy, TRANSITION_AFFINITY, SCENE_REGISTRY } from "./scene-registry";
import type {
  EnhancedFrameData,
  SectionBoundary,
  VisualMode,
  SetlistEntry,
  ColorPalette,
} from "../data/types";
import { seededLCG as seededRandom } from "../utils/seededRandom";
import { findCurrentSection } from "../utils/section-lookup";
import { type SongIdentity, getShowModesForSong } from "../data/song-identities";
import type { StemSectionType } from "../utils/stem-features";
import { applySetShaderFilter } from "../utils/set-theme";
import { detectChordMood } from "../utils/chord-mood";
import { estimateImprovisationScore } from "../utils/improv-detector";
import { selectTransitionStyle } from "../utils/transition-selector";
import { getSectionSpectralFamily } from "../utils/spectral-section";
import { getShaderStrings } from "../shaders/shader-strings";
import type { DualBlendMode } from "../components/DualShaderQuad";
import type { JamEvolution, JamPhaseBoundaries } from "../utils/jam-evolution";
import { getJamPhaseMode, JAM_PHASE_INDEX } from "../utils/jam-evolution";
import type { JamCycleState } from "../utils/jam-cycles";
import type { InterplayMode } from "../utils/stem-interplay";
import type { ReactiveState } from "../utils/reactive-triggers";
import { computeSemanticProfile, extractSemanticScores } from "../utils/semantic-router";

/**
 * Dynamic crossfade duration based on energy context and spectral flux.
 * Quiet→quiet: 720 frames (24s) — gentle dissolve
 * Loud→loud:    72 frames (2.4s) — hard cut
 * Quiet→loud:  108 frames (3.6s) — fast snap
 * Loud→quiet:  180 frames (6s)   — moderate fade
 * Mid (default): 135 frames (4.5s) — standard crossfade
 *
 * High spectral flux at the boundary compresses the duration by up to 50%,
 * because rapid timbral change means the transition should be visually snappy.
 */
/** @internal exported for testing */
export function dynamicCrossfadeDuration(
  frames: EnhancedFrameData[],
  boundary: number,
  lookback = 60,
): number {
  const lo = Math.max(0, boundary - lookback);
  const hi = Math.min(frames.length - 1, boundary + lookback);

  // Average energy before and after boundary
  let beforeSum = 0, beforeCount = 0;
  for (let i = lo; i < boundary && i < frames.length; i++) {
    beforeSum += frames[i].rms;
    beforeCount++;
  }
  let afterSum = 0, afterCount = 0;
  for (let i = boundary; i <= hi; i++) {
    afterSum += frames[i].rms;
    afterCount++;
  }

  const beforeEnergy = beforeCount > 0 ? beforeSum / beforeCount : 0;
  const afterEnergy = afterCount > 0 ? afterSum / afterCount : 0;

  const QUIET = 0.08;
  const LOUD = 0.20;

  const beforeQuiet = beforeEnergy < QUIET;
  const beforeLoud = beforeEnergy > LOUD;
  const afterQuiet = afterEnergy < QUIET;
  const afterLoud = afterEnergy > LOUD;

  // CHILL CALIBRATION (3-hour party background):
  // Minimum crossfade is now 90 frames (3s) — no snap cuts. Defaults raised so
  // section transitions are felt as gentle dissolves rather than sudden swaps.
  // Flux compression cap raised from 0.4 → 0.7 so even high-flux moments still
  // give the crossfade enough time to be smooth.
  let baseDuration: number;
  if (beforeQuiet && afterQuiet) baseDuration = 720;   // 24s ultra-gentle dissolve
  else if (beforeLoud && afterLoud) baseDuration = 150; // 5s — was 2.4s
  else if (beforeQuiet && afterLoud) baseDuration = 180; // 6s — was 3.6s
  else if (beforeLoud && afterQuiet) baseDuration = 240; // 8s — was 6s
  else baseDuration = 180;                               // 6s default — was 4.5s

  // Spectral flux compression — capped at 0.7 (was 0.4) so even rapid timbral
  // changes get a smooth 4s+ crossfade instead of a 2s snap.
  const fluxWindow = 8;
  const fluxLo = Math.max(1, boundary - fluxWindow);
  const fluxHi = Math.min(frames.length - 1, boundary + fluxWindow);
  let fluxSum = 0, fluxCount = 0;
  for (let i = fluxLo; i <= fluxHi; i++) {
    const curr = frames[i].contrast;
    const prev = frames[i - 1].contrast;
    let l2 = 0;
    for (let b = 0; b < 7; b++) {
      const diff = curr[b] - prev[b];
      l2 += diff * diff;
    }
    fluxSum += Math.sqrt(l2);
    fluxCount++;
  }
  const avgFlux = fluxCount > 0 ? fluxSum / fluxCount : 0;

  // Chill cap: floor at 0.7 (was 0.4) so high-flux moments still get smooth fades
  const fluxCompression = Math.max(0.7, 1 - Math.min(avgFlux / 0.25, 1) * 0.3);

  // Hard floor: never less than 90 frames (3 seconds) — no snap cuts in chill mode
  return Math.max(90, Math.round(baseDuration * fluxCompression));
}

/**
 * Tempo-scaled beat crossfade.
 *
 * CHILL CALIBRATION (3-hour party background):
 * Now 4 beats worth of frames with floor of 90 (3s). Crossfades land on
 * phrase-friendly boundaries instead of feeling rushed. Ceiling 180 (6s).
 */
function beatCrossfadeFrames(tempo?: number): number {
  if (!tempo || tempo <= 0) return 120; // 4s default
  // 4 beats at given tempo, at 30fps
  const framesPerBeat = (60 / tempo) * 30;
  return Math.max(90, Math.min(180, Math.round(framesPerBeat * 4)));
}

// Complement modes and energy pools are now in scene-registry.ts

// Minimum section duration (in frames) to qualify for auto-variety
// Lowered from 2700 (1.5 min) to 1200 (40s) so 5-minute songs get scene transitions.
// Previous threshold meant only 10+ minute songs got within-song variety.
const AUTO_VARIETY_MIN_SECTION = 2700; // 90 seconds at 30fps — unhurried, not frantic

/**
 * Find nearest strong beat within a frame range for beat-synced transitions.
 * Prefers downbeats (first beat of measure) when beatConfidence is high,
 * then falls back to regular beats and strong onsets.
 * Returns the frame index of the best alignment point, or null if none found.
 */
/** @internal exported for testing */
export function findNearestBeat(
  frames: EnhancedFrameData[],
  searchStart: number,
  searchEnd: number,
): number | null {
  let bestFrame: number | null = null;
  let bestScore = 0;

  for (let i = Math.max(0, searchStart); i < Math.min(frames.length, searchEnd); i++) {
    const f = frames[i];
    const confidence = f.beatConfidence ?? 0;
    // Downbeats score highest when beat confidence is strong (>0.5)
    // This snaps transitions to measure boundaries for musical phrasing
    const downbeatBonus = (f.downbeat && confidence > 0.5) ? 2.0 * confidence : 0;
    const beatScore = f.beat ? 1.0 : 0;
    const onsetScore = f.onset > 0.7 ? f.onset * 0.5 : 0;
    const score = downbeatBonus + beatScore + onsetScore;
    if (score > bestScore) {
      bestScore = score;
      bestFrame = i;
    }
  }

  return bestScore > 0 ? bestFrame : null;
}

/**
 * Validate section overrides against actual section count.
 * Call during calculateMetadata or at load time to catch invalid indices early.
 * Returns list of warnings (empty = all valid).
 */
export function validateSectionOverrides(
  song: SetlistEntry,
  sectionCount: number,
): string[] {
  if (!song.sectionOverrides?.length) return [];
  const warnings: string[] = [];
  for (const override of song.sectionOverrides) {
    if (override.sectionIndex >= sectionCount) {
      warnings.push(
        `[${song.trackId}] sectionOverride index ${override.sectionIndex} (mode: ${override.mode}) ` +
        `exceeds section count ${sectionCount} (valid: 0-${sectionCount - 1})`
      );
    }
  }
  if (warnings.length > 0) {
    console.warn(`Section override validation failed for "${song.title}":`);
    warnings.forEach((w) => console.warn(`  ${w}`));
  }
  return warnings;
}

interface Props {
  frames: EnhancedFrameData[];
  sections: SectionBoundary[];
  song: SetlistEntry;
  tempo?: number;
  /** Optional seed for generative variation — different seed → different scene assignments */
  seed?: number;
  /** Normalized jam density from jam evolution system (0-1, default 0.5) */
  jamDensity?: number;
  /** Ambient visual mode to crossfade into during dead air */
  deadAirMode?: VisualMode;
  /** 0→1 crossfade progress into dead air ambient mode */
  deadAirFactor?: number;
  /** Show era for mode pool filtering */
  era?: string;
  /** When true, coherence is locked — hold current shader (no transitions during peak moments) */
  coherenceIsLocked?: boolean;
  /** Map of shader modes already used in this show (for variety enforcement) */
  usedShaderModes?: Map<VisualMode, number>;
  /** Song index when each shader mode was last used (for recency decay) */
  shaderModeLastUsed?: Map<VisualMode, number>;
  /** Drums/Space sub-phase override for forced shader selection */
  drumsSpacePhase?: string;
  /** Per-song visual identity for preferred modes and D/S shader overrides */
  songIdentity?: SongIdentity;
  /** Stem-derived section type for mode bias */
  stemSection?: StemSectionType;
  /** Total song duration in seconds for duration-aware shader routing */
  songDuration?: number;
  /** Effective palette (chroma-blended) — overrides song.palette when provided */
  palette?: ColorPalette;
  /** Segue in from previous song */
  segueIn?: boolean;
  /** Sacred segue: suppress first within-song scene crossfade for 90 frames */
  isSacredSegueIn?: boolean;
  /** Suite continuity: suppress first scene crossfade for suite-middle songs */
  isInSuiteMiddle?: boolean;
  /** Set number for set-position shader filtering */
  setNumber?: number;
  /** Full jam evolution state for within-jam shader transitions */
  jamEvolution?: JamEvolution;
  /** Precomputed phase boundaries (frame numbers) for crossfade detection */
  jamPhaseBoundaries?: JamPhaseBoundaries | null;
  /** Jam cycle sub-state for composition modulation at cycle peaks */
  jamCycle?: JamCycleState | null;
  /** Precomputed shader mode for each jam phase (deterministic via seed) */
  jamPhaseShaders?: Record<string, VisualMode>;
  /** Current climax phase (0=idle, 1=build, 2=climax, 3=sustain, 4=release) for dual-shader forcing */
  climaxPhase?: number;
  /** Track number within the show for per-song shader variety */
  trackNumber?: number;
  /** Stem interplay mode for dual-shader composition awareness */
  stemInterplayMode?: InterplayMode;
  /** Dominant stem musician for shader pool bias */
  stemDominant?: string;
  /** Force transcendent shader (from IT response deep coherence lock) */
  itForceTranscendentShader?: boolean;
  /** Reactive trigger state from mid-section audio analysis */
  reactiveState?: ReactiveState;
}

/**
 * Apply recency-weighted scoring to a shader mode pool.
 * Instead of binary "used/unused" filtering, penalizes modes based on how recently
 * and how frequently they were used. Modes used many songs ago get nearly full weight.
 *
 * @returns Weighted pool where less-recently-used modes appear more often
 */
function applyRecencyWeighting(
  pool: VisualMode[],
  usedShaderModes: Map<VisualMode, number>,
  shaderModeLastUsed: Map<VisualMode, number> | undefined,
  currentSongIdx: number,
): VisualMode[] {
  if (usedShaderModes.size === 0) return pool;

  // Build weighted pool: aggressively penalize recently-used modes, boost fresh ones.
  // This breaks the "big 4" convergence where the same high-energy shaders
  // recirculate via tight affinity pools.
  const MAX_COPIES = 6;
  const FRESH_BONUS = 2; // Extra copies for never-used modes
  const weighted: VisualMode[] = [];

  for (const mode of pool) {
    const count = usedShaderModes.get(mode) ?? 0;
    if (count === 0) {
      // Never used — strong boost to break convergence
      for (let i = 0; i < MAX_COPIES + FRESH_BONUS; i++) weighted.push(mode);
      continue;
    }

    // Recency: how many songs ago was this mode last used?
    const lastUsed = shaderModeLastUsed?.get(mode) ?? 0;
    const songDistance = Math.max(1, currentSongIdx - lastUsed);

    // Hard cooldown: modes used in last 2 songs get minimal representation
    if (songDistance <= 2) {
      weighted.push(mode); // 1 copy only — still selectable but heavily de-weighted
      continue;
    }

    // Frequency penalty: 1/count (used once=1.0, twice=0.5, three=0.33)
    const freqFactor = 1 / count;
    // Recency bonus: modes used long ago recover toward full weight
    // distance 3 → 0.60, distance 6 → 0.75, distance 12+ → 0.86+
    const recencyFactor = 1 - 1 / (1 + songDistance * 0.5);

    // Combined weight: 0→1 scale, then map to copy count (min 1)
    const weight = freqFactor * recencyFactor;
    const copies = Math.max(1, Math.round(weight * MAX_COPIES));
    for (let i = 0; i < copies; i++) weighted.push(mode);
  }

  return weighted.length > 0 ? weighted : pool;
}

/** Determine the visual mode for a given section index.
 *  Priority: explicit sectionOverrides > seeded variation > energy-aware affinity morphing > defaultMode.
 *
 *  Energy-aware morphing: when a section's energy differs from the previous,
 *  pick from the affinity map. Coherence lock holds the current shader.
 */
/** @internal exported for testing */
export function getModeForSection(
  song: SetlistEntry,
  sectionIndex: number,
  sections: SectionBoundary[],
  seed?: number,
  era?: string,
  coherenceIsLocked?: boolean,
  usedShaderModes?: Map<VisualMode, number>,
  songIdentity?: SongIdentity,
  stemSection?: StemSectionType,
  frames?: EnhancedFrameData[],
  songDuration?: number,
  setNumber?: number,
  trackNumber?: number,
  shaderModeLastUsed?: Map<VisualMode, number>,
  stemDominant?: string,
): VisualMode {
  // Safe shaders whitelist — validate chosen mode at the end.
  // Includes all curated chill-mode shaders that are confirmed palette-safe
  // (using paletteHueColor / safeBlendHue helpers post-audit) and have proper
  // temporalBlendEnabled feedback (no broken max() pattern).
  const SAFE_SHADERS: Set<VisualMode> = new Set([
    // Atmospheric / cosmic
    "protean_clouds", "cosmic_voyage", "cosmic_dust", "volumetric_clouds",
    "volumetric_smoke", "volumetric_nebula", "warm_nebula", "dark_star_void",
    "terrapin_nebula", "creation", "void_light", "star_nest", "morning_dew_fog",
    "scarlet_golden_haze", "estimated_prophet_mist",
    // Aurora / sky
    "aurora", "aurora_sky", "aurora_curtains", "nimitz_aurora",
    // Nature
    "river", "forest", "ocean", "seascape", "mountain_fire", "campfire",
    "rain_street", "storm", "canyon", "ember_meadow", "flower_field",
    "coral_reef", "aviary_canopy",
    // Geometric / sacred
    "fractal_temple", "honeycomb_cathedral", "sacred_geometry", "mandala_engine",
    "kaleidoscope",
    // Road / cowboy / journey
    "desert_road", "desert_cantina", "highway_horizon", "cosmic_railroad",
    "canyon_chase", "boxcar_tunnel", "locomotive_engine",
    // Memorial / contemplative
    "porch_twilight", "memorial_drift", "campfire_embers", "fluid_light",
    // Peaks / climax
    "inferno", "deep_ocean", "climax_surge", "bloom_explosion",
    "mobius_amphitheater", "event_horizon", "psychedelic_garden",
    // Veneta-specific
    "neon_casino", "storm_vortex", "earthquake_fissure", "clockwork_temple",
    "stained_glass_dissolution", "dance_floor_prism",
    // Liquid / oil-projector aesthetic
    "liquid_light", "oil_projector", "tie_dye", "liquid_projector",
  ]);
  const validateSafe = (mode: VisualMode): VisualMode =>
    SAFE_SHADERS.has(mode) ? mode : song.defaultMode;

  // Explicit override always wins
  const override = song.sectionOverrides?.find((o) => o.sectionIndex === sectionIndex);
  if (override) return validateSafe(override.mode);

  // Section 0 always uses default
  if (sectionIndex === 0) return validateSafe(song.defaultMode);

  // Coherence lock: hold current shader
  if (coherenceIsLocked) {
    return getModeForSection(song, sectionIndex - 1, sections, seed, era, false, usedShaderModes, songIdentity, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed);
  }

  // Seeded variation with affinity-aware morphing
  if (seed !== undefined) {
    const section = sections[sectionIndex];
    if (section) {
      const prevSection = sectionIndex > 0 ? sections[sectionIndex - 1] : null;
      const prevMode = sectionIndex > 0
        ? getModeForSection(song, sectionIndex - 1, sections, seed, era, false, usedShaderModes, songIdentity, undefined, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed)
        : song.defaultMode;

      // Visual evolution: change shader on energy transitions only
      // Periodic changes caused glitchy cuts — let the music drive transitions
      const energyChanged = prevSection && prevSection.energy !== section.energy;

      if (energyChanged) {
        const affinityPool = TRANSITION_AFFINITY[prevMode];
        if (affinityPool && affinityPool.length > 0) {
          // Filter by continuous-energy affinity and era. avgEnergy is the
          // actual section RMS (0..1) — replaces the old 3-bucket discretization
          // that made every "low" song share one shader pool.
          const energyPool = getModesForContinuousEnergy(section.avgEnergy, era, song.defaultMode);
          const energySet = new Set(energyPool);
          let candidates = affinityPool.filter((m) => energySet.has(m));

          // VARIETY FALLBACK: many TRANSITION_AFFINITY entries reference modes
          // that are now in AUTO_SELECT_BLOCKLIST, leaving only 0-2 survivors.
          // When that happens, every song with the same defaultMode collapses
          // to the same shader on its first energy change (e.g. fractal_temple
          // → only volumetric_nebula). Fall through to the full continuous-energy
          // pool when the intersection is starved, so different songs actually
          // get different shaders even when they share a defaultMode.
          if (candidates.length < 3) {
            candidates = energyPool;
          }
          if (candidates.length === 0) candidates = affinityPool;

          // Preferred mode awareness: intersect with preferred modes first
          if (songIdentity?.preferredModes?.length && seed !== undefined) {
            const preferredSet = new Set(songIdentity.preferredModes);
            const preferredCandidates = candidates.filter((m) => preferredSet.has(m));
            if (preferredCandidates.length > 0) candidates = preferredCandidates;
          }

          // Recency-weighted variety: penalize recently/frequently used modes
          if (usedShaderModes && usedShaderModes.size > 0) {
            candidates = applyRecencyWeighting(candidates, usedShaderModes, shaderModeLastUsed, trackNumber ?? 0);
          }

          // Spectral-categorical filtering: match shader to section timbral character
          if (frames && section) {
            const spectralFamily = getSectionSpectralFamily(frames, section.frameStart, section.frameEnd);
            if (spectralFamily) {
              const spectralFiltered = candidates.filter((m) => {
                const f = SCENE_REGISTRY[m]?.spectralFamily;
                return !f || f === spectralFamily; // undefined = versatile, accepts any
              });
              if (spectralFiltered.length >= 2) candidates = spectralFiltered; // soft filter
            }
          }

          const rng = seededRandom(seed + (trackNumber ?? 0) * 31337 + sectionIndex * 7919);
          return validateSafe(candidates[Math.floor(rng() * candidates.length)]);
        }
      }

      // No energy change: use continuous-energy weighted pool. Each shader's
      // copies are gaussian-proportional to distance between its affinity
      // center and the section's actual avgEnergy, so a quiet ballad section
      // (avgEnergy 0.10) and a quiet station section (avgEnergy 0.20) draw
      // from genuinely different distributions instead of identical "low" pools.
      const pool = getModesForContinuousEnergy(section.avgEnergy, era, song.defaultMode);

      // Recency-weighted variety: penalize recently/frequently used modes
      let filteredPool = pool;
      if (usedShaderModes && usedShaderModes.size > 0) {
        filteredPool = applyRecencyWeighting(pool, usedShaderModes, shaderModeLastUsed, trackNumber ?? 0);
      }

      // Preferred-first pool: show modes + preferred + generous registry splash
      if (songIdentity?.preferredModes?.length && seed !== undefined) {
        const showModes = getShowModesForSong(songIdentity.preferredModes, seed, song.title);
        const showModeSet = new Set(showModes);
        const remainingPreferred = songIdentity.preferredModes.filter((m) => !showModeSet.has(m));
        // Strict preferred-only pool: song identity controls the visual.
        // No registry splash — curated modes only, no random off-brand shaders.
        const weightedPool: VisualMode[] = [];
        for (const m of showModes) { for (let i = 0; i < 5; i++) weightedPool.push(m); }
        for (const m of remainingPreferred) { for (let i = 0; i < 2; i++) weightedPool.push(m); }
        if (weightedPool.length > 0) filteredPool = weightedPool;
      }

      // Stem section bias: route shaders by what the band is doing
      if (stemSection === "solo") {
        const dramaticModes: VisualMode[] = ["inferno", "protean_clouds", "cosmic_voyage", "inferno"];
        const dramatic = dramaticModes.filter((m) => filteredPool.includes(m));
        if (dramatic.length > 0) {
          filteredPool = [...filteredPool, ...dramatic, ...dramatic]; // 3x weight
        }
      } else if (stemSection === "vocal") {
        const warmModes: VisualMode[] = ["protean_clouds", "protean_clouds", "aurora"];
        const warm = warmModes.filter((m) => filteredPool.includes(m));
        if (warm.length > 0) {
          filteredPool = [...filteredPool, ...warm, ...warm]; // 3x weight
        }
      } else if (stemSection === "jam") {
        const generativeModes: VisualMode[] = ["cosmic_voyage", "deep_ocean", "cosmic_voyage", "cosmic_voyage", "mandala_engine", "protean_clouds"];
        const generative = generativeModes.filter((m) => filteredPool.includes(m));
        if (generative.length > 0) {
          filteredPool = [...filteredPool, ...generative, ...generative]; // 3x weight
        }
      } else if (stemSection === "instrumental") {
        const midModes: VisualMode[] = ["aurora", "protean_clouds", "protean_clouds", "protean_clouds", "cosmic_voyage"];
        const mid = midModes.filter((m) => filteredPool.includes(m));
        if (mid.length > 0) {
          filteredPool = [...filteredPool, ...mid]; // 2x weight
        }
      } else if (stemSection === "quiet") {
        const ambientModes: VisualMode[] = ["cosmic_dust", "deep_ocean", "void_light", "deep_ocean", "cosmic_voyage"];
        const ambient = ambientModes.filter((m) => filteredPool.includes(m));
        if (ambient.length > 0) {
          filteredPool = [...filteredPool, ...ambient, ...ambient]; // 3x weight
        }
      }

      // Stem dominant musician bias: who's driving → which shaders feel right
      if (stemDominant === "jerry") {
        const jerryModes: VisualMode[] = ["cosmic_voyage", "cosmic_voyage", "cosmic_voyage", "aurora"];
        const matches = jerryModes.filter((m) => filteredPool.includes(m));
        if (matches.length > 0) {
          for (let i = 0; i < 2; i++) filteredPool = [...filteredPool, ...matches]; // 2.5x weight
        }
      } else if (stemDominant === "phil") {
        const philModes: VisualMode[] = ["deep_ocean", "cosmic_voyage", "cosmic_voyage", "cosmic_dust"];
        const matches = philModes.filter((m) => filteredPool.includes(m));
        if (matches.length > 0) {
          for (let i = 0; i < 2; i++) filteredPool = [...filteredPool, ...matches];
        }
      } else if (stemDominant === "drums") {
        const drumsModes: VisualMode[] = ["mandala_engine", "deep_ocean", "inferno", "inferno"];
        const matches = drumsModes.filter((m) => filteredPool.includes(m));
        if (matches.length > 0) {
          for (let i = 0; i < 2; i++) filteredPool = [...filteredPool, ...matches];
        }
      }

      // Chord mood bias: weight mood-matching modes 2x when confidence > 0.3
      if (frames && section) {
        const moodResult = detectChordMood(frames, section.frameStart);
        if (moodResult.confidence > 0.3) {
          const moodMatches = moodResult.preferredModes.filter((m) => filteredPool.includes(m));
          if (moodMatches.length > 0) {
            filteredPool = [...filteredPool, ...moodMatches]; // 2x weight
          }
        }

        // Improvisation bias: high improv biases toward fluid/generative shaders
        const improvScore = estimateImprovisationScore(frames, section.frameStart);
        if (improvScore > 0.6) {
          const improvModes: VisualMode[] = ["fluid_2d", "cosmic_voyage", "deep_ocean", "cosmic_voyage", "mandala_engine", "cosmic_voyage"];
          const improvMatches = improvModes.filter((m) => filteredPool.includes(m));
          if (improvMatches.length > 0) {
            filteredPool = [...filteredPool, ...improvMatches, ...improvMatches]; // 3x weight
          }
        }
      }

      // Narrative arc bias: weight shaders by song's story arc type
      if (songIdentity?.narrativeArc) {
        const arc = songIdentity.narrativeArc;
        if (arc === "meditative_journey" || arc === "elegy") {
          const ambientModes: VisualMode[] = ["aurora", "deep_ocean", "cosmic_dust", "void_light", "deep_ocean", "cosmic_voyage", "protean_clouds"];
          const ambientMatches = ambientModes.filter((m) => filteredPool.includes(m));
          if (ambientMatches.length > 0) {
            filteredPool = [...filteredPool, ...ambientMatches]; // 2x weight
          }
        } else if (arc === "jam_vehicle") {
          const generativeModes: VisualMode[] = ["cosmic_voyage", "deep_ocean", "cosmic_voyage", "cosmic_voyage", "mandala_engine", "protean_clouds"];
          const generativeMatches = generativeModes.filter((m) => filteredPool.includes(m));
          if (generativeMatches.length > 0) {
            filteredPool = [...filteredPool, ...generativeMatches]; // 2x weight
          }
        }
      }

      // Duration bias: short songs → structured, extended jams → feedback/generative
      if (songDuration !== undefined) {
        if (songDuration < 300) {
          const structuredModes: VisualMode[] = [
            "inferno", "vintage_film", "lo_fi_grain",
            "deep_ocean", "protean_clouds", "inferno", "protean_clouds",
          ];
          const matches = structuredModes.filter((m) => filteredPool.includes(m));
          if (matches.length > 0) {
            filteredPool = [...filteredPool, ...matches, ...matches];
          }
        } else if (songDuration > 360) {
          const feedbackModes: VisualMode[] = [
            "cosmic_voyage", "deep_ocean", "deep_ocean",
            "cosmic_voyage", "cosmic_voyage", "mandala_engine", "cosmic_voyage", "protean_clouds",
          ];
          const matches = feedbackModes.filter((m) => filteredPool.includes(m));
          if (matches.length > 0) {
            // Graduated weight: >480s = 2× (double boost), 360-480s = 1× (single boost)
            filteredPool = [...filteredPool, ...matches];
            if (songDuration > 480) {
              filteredPool = [...filteredPool, ...matches];
            }
          }
        }
      }

      // Set position intelligence: boost/suppress shaders per set
      if (setNumber !== undefined) {
        filteredPool = applySetShaderFilter(filteredPool, setNumber);
      }

      // Spectral-categorical filtering: match shader to section timbral character
      if (frames && section) {
        const spectralFamily = getSectionSpectralFamily(frames, section.frameStart, section.frameEnd);
        if (spectralFamily) {
          const spectralFiltered = filteredPool.filter((m) => {
            const f = SCENE_REGISTRY[m]?.spectralFamily;
            return !f || f === spectralFamily;
          });
          if (spectralFiltered.length >= 2) filteredPool = spectralFiltered;
        }
      }

      // Semantic bias: if CLAP semantic data is available, weight matching shaders 2x
      if (frames && section) {
        const midFrame = Math.min(Math.floor((section.frameStart + section.frameEnd) / 2), frames.length - 1);
        const semanticScores = extractSemanticScores({
          semanticPsychedelic: frames[midFrame].semantic_psychedelic,
          semanticAggressive: frames[midFrame].semantic_aggressive,
          semanticTender: frames[midFrame].semantic_tender,
          semanticCosmic: frames[midFrame].semantic_cosmic,
          semanticRhythmic: frames[midFrame].semantic_rhythmic,
          semanticAmbient: frames[midFrame].semantic_ambient,
          semanticChaotic: frames[midFrame].semantic_chaotic,
          semanticTriumphant: frames[midFrame].semantic_triumphant,
        });
        if (semanticScores) {
          const profile = computeSemanticProfile(semanticScores);
          if (profile.dominantConfidence > 0.4 && profile.preferredShaders.length > 0) {
            const semanticMatches = profile.preferredShaders.filter((m) => filteredPool.includes(m));
            if (semanticMatches.length > 0) {
              // Add at 2x weight
              filteredPool = [...filteredPool, ...semanticMatches, ...semanticMatches];
            }
          }
        }
      }

      const rng = seededRandom(seed + (trackNumber ?? 0) * 31337 + sectionIndex * 7919);
      const idx = Math.floor(rng() * filteredPool.length);
      return validateSafe(filteredPool[idx]);
    }
  }

  // Auto-variety: if no overrides at all and the song has sections long enough,
  // use affinity-based selection instead of simple complement
  if (!song.sectionOverrides?.length && sections.length >= 3) {
    const section = sections[sectionIndex];
    const sectionLen = section ? section.frameEnd - section.frameStart : 0;
    const totalLen = sections[sections.length - 1]?.frameEnd ?? 0;

    // Removed odd-section-only restriction (was: sectionIndex % 2 === 1) and lowered
    // total length from 5400 (3 min) to 3600 (2 min) so more songs get visual variety.
    if (totalLen > 3600 && sectionLen > AUTO_VARIETY_MIN_SECTION && sectionIndex > 0) {
      const affinityPool = TRANSITION_AFFINITY[song.defaultMode];
      if (affinityPool && affinityPool.length > 0) {
        const rng = seededRandom((seed ?? 0) + (trackNumber ?? 0) * 31337 + sectionIndex * 7919);
        return validateSafe(affinityPool[Math.floor(rng() * affinityPool.length)]);
      }
      return validateSafe(getComplement(song.defaultMode));
    }
  }

  return validateSafe(song.defaultMode);
}

/** Map Drums/Space sub-phase to forced shader mode */
/** @internal exported for testing */
export function getDrumsSpaceMode(phase: string, seed?: number, songIdentity?: SongIdentity): VisualMode {
  // Song identity overrides for D/S sub-phases
  if (songIdentity?.drumsSpaceShaders) {
    const override = songIdentity.drumsSpaceShaders[phase as import("../utils/drums-space-phase").DrumsSpaceSubPhase];
    if (override) return override;
  }

  const rng = seededRandom((seed ?? 0) + 31337);
  switch (phase) {
    case "drums_tribal": {
      const pool: VisualMode[] = ["inferno", "inferno", "inferno"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "transition": {
      const pool: VisualMode[] = ["cosmic_voyage", "aurora", "protean_clouds"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "space_ambient": {
      const pool: VisualMode[] = ["deep_ocean", "cosmic_dust", "cosmic_voyage", "void_light", "deep_ocean"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "space_textural": {
      const pool: VisualMode[] = ["cosmic_voyage", "cosmic_voyage", "mandala_engine", "deep_ocean"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "space_melodic": {
      const pool: VisualMode[] = ["cosmic_voyage", "aurora", "cosmic_voyage", "cosmic_voyage"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "reemergence": return rng() > 0.5 ? "inferno" : "protean_clouds";
    default: return "cosmic_voyage";
  }
}

/** Average energy (rms) over a frame range */
function averageEnergy(frames: EnhancedFrameData[], start: number, end: number): number {
  const lo = Math.max(0, start);
  const hi = Math.min(frames.length, end);
  if (hi <= lo) return 0;
  let sum = 0;
  for (let i = lo; i < hi; i++) sum += frames[i].rms;
  return sum / (hi - lo);
}

/** Select GPU blend mode based on energy context, climax phase, and section type */
function selectDualBlendMode(
  energy: number,
  sectionEnergy?: string,
  climaxPhase?: number,
  sectionType?: string,
): DualBlendMode {
  if (climaxPhase !== undefined && climaxPhase >= 2 && climaxPhase <= 3) return "noise_dissolve";
  if (sectionType === "jam" || sectionType === "solo") return "depth_aware";
  if (energy > 0.25) return "luminance_key";
  if (energy < 0.08) return "additive";
  if (sectionEnergy === "low") return "depth_aware";
  return "luminance_key";
}

/** Render a scene for a given mode (delegates to scene registry) */
function renderMode(
  mode: VisualMode,
  frames: EnhancedFrameData[],
  sections: SectionBoundary[],
  palette?: ColorPalette,
  tempo?: number,
  style?: React.CSSProperties,
  jamDensity?: number,
): React.ReactNode {
  return renderScene(mode, { frames, sections, palette, tempo, style, jamDensity });
}

export const SceneRouter: React.FC<Props> = ({ frames, sections, song, tempo, seed, jamDensity, deadAirMode, deadAirFactor, era, coherenceIsLocked, usedShaderModes, shaderModeLastUsed, drumsSpacePhase, songIdentity, stemSection, songDuration, palette: paletteProp, segueIn, isSacredSegueIn, isInSuiteMiddle, setNumber, jamEvolution, jamPhaseBoundaries, jamCycle, jamPhaseShaders, climaxPhase: climaxPhaseProp, trackNumber, stemInterplayMode, stemDominant, itForceTranscendentShader, reactiveState }) => {
  const frame = useCurrentFrame();
  const palette = paletteProp ?? song.palette;

  // Track reactive trigger for crossfade-out when trigger ends
  const reactiveExitRef = React.useRef<{ mode: string; exitFrame: number; crossfadeFrames: number } | null>(null);
  const lastReactiveModeRef = React.useRef<string | null>(null);

  if (sections.length === 0) {
    return <>{renderMode(song.defaultMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
  }

  // Find current section
  const { sectionIndex: currentSectionIdx } = findCurrentSection(sections, frame);

  // EXPLICIT SECTION OVERRIDE: highest authority — represents user-curated choice.
  // Honored BEFORE reactive triggers, IT lock, drums/space, semantic router, etc.
  // If a song explicitly sets sectionOverrides for a section, that mode is used,
  // and no other routing path can override it. This is the safety net that ensures
  // a song's curated visual identity can't be silently replaced by a reactive
  // shader pool that doesn't fit the song's palette or character.
  //
  // CROSSFADE: when adjacent sections have DIFFERENT overrides, smoothly blend
  // between them across a 90-frame (3s) window centered on the boundary instead
  // of doing a 1-frame snap cut. Without this, sectionOverride boundaries look
  // like jarring jump cuts.
  const explicitOverride = song.sectionOverrides?.find((o) => o.sectionIndex === currentSectionIdx);
  if (explicitOverride) {
    const SECTION_OVERRIDE_CROSSFADE = 180; // 6 seconds at 30fps — CALM MODE: doubled from 3s
    const halfCF = Math.floor(SECTION_OVERRIDE_CROSSFADE / 2);
    const currentSection = sections[currentSectionIdx];

    // Look back: are we early in the current section, with a previous section
    // that had a different override? If so, crossfade IN.
    if (currentSection && currentSectionIdx > 0 && frame - currentSection.frameStart < halfCF) {
      const prevOverride = song.sectionOverrides?.find((o) => o.sectionIndex === currentSectionIdx - 1);
      if (prevOverride && prevOverride.mode !== explicitOverride.mode) {
        const cfStart = currentSection.frameStart - halfCF;
        const progress = Math.max(0, Math.min(1, (frame - cfStart) / SECTION_OVERRIDE_CROSSFADE));
        return (
          <SceneCrossfade
            progress={progress}
            outgoing={renderMode(prevOverride.mode, frames, sections, palette, tempo, undefined, jamDensity)}
            incoming={renderMode(explicitOverride.mode, frames, sections, palette, tempo, undefined, jamDensity)}
            style="morph"
          />
        );
      }
    }

    // Look forward: are we late in the current section, with a NEXT section
    // that has a different override? If so, crossfade OUT (start the blend
    // before the boundary so the visual is already morphing into the new shader
    // when the section actually starts).
    if (currentSection && currentSectionIdx < sections.length - 1 && currentSection.frameEnd - frame < halfCF) {
      const nextOverride = song.sectionOverrides?.find((o) => o.sectionIndex === currentSectionIdx + 1);
      if (nextOverride && nextOverride.mode !== explicitOverride.mode) {
        const cfStart = currentSection.frameEnd - halfCF;
        const progress = Math.max(0, Math.min(1, (frame - cfStart) / SECTION_OVERRIDE_CROSSFADE));
        return (
          <SceneCrossfade
            progress={progress}
            outgoing={renderMode(explicitOverride.mode, frames, sections, palette, tempo, undefined, jamDensity)}
            incoming={renderMode(nextOverride.mode, frames, sections, palette, tempo, undefined, jamDensity)}
            style="morph"
          />
        );
      }
    }

    return <>{renderMode(explicitOverride.mode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
  }

  // IT transcendent shader forcing: deep coherence lock → meditative shader pool.
  // Intersect with preferredModes so we don't pick a palette-incompatible shader.
  if (itForceTranscendentShader) {
    const transcendentPool: VisualMode[] = ["cosmic_voyage", "cosmic_voyage", "mandala_engine", "cosmic_voyage", "aurora"];
    const allowedTrans = songIdentity?.preferredModes && songIdentity.preferredModes.length > 0
      ? transcendentPool.filter((m) => songIdentity.preferredModes.includes(m))
      : transcendentPool;
    if (allowedTrans.length > 0) {
      const rng = seededRandom((seed ?? 0) + frame * 7);
      const dsMode = allowedTrans[Math.floor(rng() * allowedTrans.length)];
      return <>{renderMode(dsMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
    }
    // Fall through if no preferred mode matches the transcendent pool
  }

  // Drums/Space phase override: force specific shaders per sub-phase.
  // getDrumsSpaceMode already consults songIdentity for drumsSpaceShaders mappings,
  // so this path is already song-aware. Leave as-is.
  if (drumsSpacePhase) {
    const dsMode = getDrumsSpaceMode(drumsSpacePhase, seed, songIdentity);
    return <>{renderMode(dsMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
  }

  // ─── REACTIVE TRIGGER: mid-section shader swap on audio events ───
  // Fast 15-frame crossfade into reactive shader, then hold, then crossfade back.
  // Coherence lock always wins (suppressed upstream). Dual shader disabled during hold.
  //
  // Reactive triggers must respect the song's curated preferredModes — otherwise
  // they can pick shaders with hardcoded color schemes that clash with the song's
  // palette (e.g. cosmic_voyage's heavy nebula colors firing on a cool psychedelic
  // song produces stuck-color clumps). We INTERSECT the trigger's suggested pool
  // with preferredModes; if the intersection is empty, suppress the trigger.
  //
  // DEAD AIR: triggers are suppressed entirely. Crowd applause has impulsive
  // transients that fire reactive triggers as if the band were still playing.
  //
  // CALM MODE: also suppress reactive triggers if the song has explicit
  // sectionOverrides — the user curated those for a reason and reactive triggers
  // shouldn't override them. (Note: explicit override path returns early above,
  // but this is defensive in case override returns null/undefined for some sections.)
  const isInDeadAir = (deadAirFactor ?? 0) > 0.1;
  const hasOverrides = (song.sectionOverrides?.length ?? 0) > 0;
  if (reactiveState?.isTriggered && !coherenceIsLocked && !isInDeadAir && !hasOverrides && reactiveState.suggestedModes.length > 0) {
    // Filter reactive pool to only modes the song explicitly allows
    const allowedModes = songIdentity?.preferredModes && songIdentity.preferredModes.length > 0
      ? reactiveState.suggestedModes.filter((m) => songIdentity.preferredModes.includes(m))
      : reactiveState.suggestedModes;

    // If the trigger's pool has no intersection with preferred modes, suppress
    // the trigger entirely and fall through to normal section selection.
    if (allowedModes.length === 0) {
      // fall through — no early return
    } else {
    const rng = seededRandom((seed ?? 0) + frame * 11 + (reactiveState.triggerType?.length ?? 0));
    const reactiveMode = allowedModes[Math.floor(rng() * allowedModes.length)];
    const regularMode = getModeForSection(song, currentSectionIdx, sections, seed, era, false, usedShaderModes, songIdentity, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed, stemDominant);
    // Energy-scaled reactive crossfade: snappy at high energy, gentle at low
    const reactiveEnergy = frames[Math.min(frame, frames.length - 1)]?.rms ?? 0.15;
    const REACTIVE_CROSSFADE = reactiveEnergy > 0.2 ? 12 : reactiveEnergy > 0.1 ? 22 : 40;
    const age = reactiveState.triggerAge;

    if (age < REACTIVE_CROSSFADE) {
      // Crossfade in
      const progress = age / REACTIVE_CROSSFADE;
      return (
        <SceneCrossfade
          progress={progress}
          outgoing={renderMode(regularMode, frames, sections, palette, tempo, undefined, jamDensity)}
          incoming={renderMode(reactiveMode, frames, sections, palette, tempo, undefined, jamDensity)}
        />
      );
    }
    // During hold — render reactive shader
    lastReactiveModeRef.current = reactiveMode;
    return <>{renderMode(reactiveMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
    } // close: else (allowedModes.length > 0)
  }

  // ─── Reactive trigger crossfade-OUT ───
  // When trigger just ended, record exit and blend back to regular shader.
  if (!reactiveState?.isTriggered && lastReactiveModeRef.current) {
    const exitMode = lastReactiveModeRef.current;
    lastReactiveModeRef.current = null;
    const exitEnergy = frames[Math.min(frame, frames.length - 1)]?.rms ?? 0.15;
    reactiveExitRef.current = {
      mode: exitMode,
      exitFrame: frame,
      crossfadeFrames: exitEnergy > 0.2 ? 15 : exitEnergy > 0.1 ? 25 : 40,
    };
  }

  const currentMode = getModeForSection(song, currentSectionIdx, sections, seed, era, coherenceIsLocked, usedShaderModes, songIdentity, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed, stemDominant);

  // Render reactive exit crossfade if active
  if (reactiveExitRef.current && frame < reactiveExitRef.current.exitFrame + reactiveExitRef.current.crossfadeFrames) {
    const { mode: exitMode, exitFrame, crossfadeFrames } = reactiveExitRef.current;
    const progress = (frame - exitFrame) / crossfadeFrames;
    return (
      <SceneCrossfade
        progress={progress}
        outgoing={renderMode(exitMode, frames, sections, palette, tempo, undefined, jamDensity)}
        incoming={renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity)}
      />
    );
  }
  const currentSection = sections[currentSectionIdx];

  // ─── JAM PHASE SHADER TRANSITIONS ───
  // For long jams (10+ min), override the section shader with phase-specific shaders.
  // Each phase (exploration/building/peak_space/resolution) gets its own shader,
  // with crossfades at phase boundaries. This makes a 20-minute Dark Star
  // visually evolve as the music evolves.
  if (jamEvolution?.isLongJam && jamPhaseBoundaries && jamPhaseShaders) {
    const jpMode = jamPhaseShaders[jamEvolution.phase];
    if (jpMode) {
      // Detect if we're near a phase boundary and need to crossfade
      const JAM_CROSSFADE_FRAMES = 120; // 4 seconds — slow organic transition
      const boundaries = [
        { frame: jamPhaseBoundaries.explorationEnd, from: "exploration", to: "building" },
        { frame: jamPhaseBoundaries.buildingEnd, from: "building", to: "peak_space" },
        { frame: jamPhaseBoundaries.peakSpaceEnd, from: "peak_space", to: "resolution" },
      ] as const;

      for (const b of boundaries) {
        const fromMode = jamPhaseShaders[b.from];
        const toMode = jamPhaseShaders[b.to];
        if (!fromMode || !toMode || fromMode === toMode) continue;

        const halfCF = Math.floor(JAM_CROSSFADE_FRAMES / 2);
        const cfStart = b.frame - halfCF;
        const cfEnd = b.frame + halfCF;

        if (frame >= cfStart && frame < cfEnd) {
          const progress = (frame - cfStart) / JAM_CROSSFADE_FRAMES;
          return (
            <SceneCrossfade
              progress={progress}
              outgoing={renderMode(fromMode, frames, sections, palette, tempo, undefined, jamDensity)}
              incoming={renderMode(toMode, frames, sections, palette, tempo, undefined, jamDensity)}
              style="morph"
            />
          );
        }
      }

      // Not at a phase boundary — render the phase shader.
      // During jam cycle peaks, use DualShaderQuad to blend current phase shader
      // with the NEXT phase's shader for sub-cycle visual climaxes.
      if (jamCycle && (jamCycle.phase === "peak" || (jamCycle.phase === "build" && jamCycle.progress > 0.6)) && jamCycle.progress > 0.2) {
        // Find the next phase's shader for the sub-cycle peak blend
        const phaseOrder: string[] = ["exploration", "building", "peak_space", "resolution"];
        const currentPhaseIdx = phaseOrder.indexOf(jamEvolution.phase);
        const nextPhaseKey = currentPhaseIdx < phaseOrder.length - 1
          ? phaseOrder[currentPhaseIdx + 1]
          : phaseOrder[currentPhaseIdx]; // resolution stays on resolution
        const peakBlendMode = jamPhaseShaders[nextPhaseKey] ?? jpMode;

        if (peakBlendMode !== jpMode) {
          const stringsA = getShaderStrings(jpMode);
          const stringsB = getShaderStrings(peakBlendMode);
          if (stringsA && stringsB) {
            // Blend toward next phase shader proportional to cycle peak intensity
            const peakBlend = 0.15 + jamCycle.progress * 0.25;
            const blendMode = selectDualBlendMode(
              frames[Math.min(frame, frames.length - 1)]?.rms ?? 0,
              currentSection?.energy,
              undefined,
              "jam",
            );
            return <>{renderMode(jpMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
          }
        }
      }

      // Standard jam phase render (with dual-shader composition if energy warrants)
      const frameEnergy = frames[Math.min(frame, frames.length - 1)]?.rms ?? 0;
      const jamShouldDual = frameEnergy > 0.05;
      if (jamShouldDual) {
        const affinityPool = TRANSITION_AFFINITY[jpMode];
        const rng = seededRandom((seed ?? 0) + JAM_PHASE_INDEX[jamEvolution.phase] * 31);
        const secondaryMode = affinityPool && affinityPool.length > 0
          ? affinityPool[Math.floor(rng() * affinityPool.length)]
          : getComplement(jpMode);
        const stringsA = getShaderStrings(jpMode);
        const stringsB = getShaderStrings(secondaryMode);
        if (stringsA && stringsB) {
          const blendMode = selectDualBlendMode(frameEnergy, currentSection?.energy, undefined, "jam");
          // Phase ramp: blend builds over first 15% of phase (not instant)
          const phaseRamp = Math.min(1, jamEvolution.phaseProgress / 0.15);
          const baseJamBlend = 0.10 + frameEnergy * 0.20;
          const arcJamBlend = Math.sin(jamEvolution.phaseProgress * Math.PI) * 0.12;
          const jamFrameData = frames[Math.min(frame, frames.length - 1)];
          const jamBeatPulse = (jamFrameData?.beat ? 0.12 : 0) * Math.max(0.3, frameEnergy);
          const blendProgress = (baseJamBlend + arcJamBlend + jamBeatPulse) * phaseRamp;
          return <>{renderMode(jpMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
        }
      }

      // Fallback: simple single-shader render for this jam phase
      return <>{renderMode(jpMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
    }
  }

  const nextSectionIdx = currentSectionIdx + 1;
  const prevSectionIdx = currentSectionIdx - 1;
  const frameEnergy = frames[Math.min(frame, frames.length - 1)]?.rms ?? 0;

  // Sacred segue or suite middle: suppress first within-song scene crossfade for 90 frames (3s)
  // This prevents a jarring shader switch right as the segue/suite transition lands
  const suppressCrossfade = (isSacredSegueIn || isInSuiteMiddle) && frame < 90;

  // Crossfade INTO this section (from previous) — beat-synced when possible
  // High energy delta transitions (>0.15) use DualShaderQuad for organic GPU blending
  if (prevSectionIdx >= 0 && !suppressCrossfade) {
    const prevMode = getModeForSection(song, prevSectionIdx, sections, seed, era, false, usedShaderModes, songIdentity, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed);
    if (prevMode !== currentMode) {
      const boundary = currentSection.frameStart;
      const beatFrame = findNearestBeat(frames, boundary - 30, boundary + 30);
      const dynamicLen = dynamicCrossfadeDuration(frames, boundary);
      const beatLen = beatCrossfadeFrames(tempo);
      // Use the shorter of beat-synced and dynamic — fast spectral changes win
      const crossfadeLen = beatFrame !== null ? Math.min(beatLen, dynamicLen) : dynamicLen;
      const crossfadeStart = beatFrame !== null ? beatFrame - Math.floor(beatLen / 2) : boundary;
      const distFromStart = frame - crossfadeStart;

      if (distFromStart >= 0 && distFromStart < crossfadeLen) {
        const progress = distFromStart / crossfadeLen;
        // Compute energy before/after boundary for transition style selection
        const energyBefore = prevSectionIdx >= 0 && sections[prevSectionIdx] ? averageEnergy(frames, sections[prevSectionIdx].frameStart, boundary) : 0;
        const energyAfter = currentSection ? averageEnergy(frames, boundary, currentSection.frameEnd) : 0;

        // High energy delta: use DualShaderQuad for organic GPU blend (60 frames)
        const energyDelta = Math.abs(energyAfter - energyBefore);
        if (energyDelta > 0.15) {
          const stringsA = getShaderStrings(prevMode);
          const stringsB = getShaderStrings(currentMode);
          if (stringsA && stringsB) {
            const GPU_CROSSFADE_LEN = 120; // chill: 4s GPU crossfade (was 2s)
            const gpuDistFromStart = frame - crossfadeStart;
            if (gpuDistFromStart >= 0 && gpuDistFromStart < GPU_CROSSFADE_LEN) {
              const gpuProgress = gpuDistFromStart / GPU_CROSSFADE_LEN;
              return <>{renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
            }
          }
        }

        const sectionLabel = currentSection ? (frames[boundary]?.sectionType ?? undefined) : undefined;
        const scenePreferredOut = SCENE_REGISTRY[prevMode]?.preferredTransitionOut;
        const scenePreferredIn = SCENE_REGISTRY[currentMode]?.preferredTransitionIn;
        // Compute spectral flux at boundary for style selection
        const fluxWindow = 8;
        const fluxLo = Math.max(1, boundary - fluxWindow);
        const fluxHi = Math.min(frames.length - 1, boundary + fluxWindow);
        let fluxSum = 0, fluxCount = 0;
        for (let i = fluxLo; i <= fluxHi; i++) {
          const curr = frames[i].contrast;
          const prev = frames[i - 1].contrast;
          let l2 = 0;
          for (let b = 0; b < 7; b++) {
            const diff = curr[b] - prev[b];
            l2 += diff * diff;
          }
          fluxSum += Math.sqrt(l2);
          fluxCount++;
        }
        const boundaryFlux = fluxCount > 0 ? fluxSum / fluxCount : 0;
        const transitionStyle = selectTransitionStyle(energyBefore, energyAfter, sectionLabel, scenePreferredIn, scenePreferredOut, boundaryFlux);
        return (
          <SceneCrossfade
            progress={progress}
            outgoing={renderMode(prevMode, frames, sections, palette, tempo, undefined, jamDensity)}
            incoming={renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity)}
            flashFrame={beatFrame !== null ? beatFrame : undefined}
            style={transitionStyle}
          />
        );
      }
    }
  }

  // Crossfade OUT of this section (to next) — beat-synced when possible
  // High energy delta transitions use DualShaderQuad for organic GPU blending
  if (nextSectionIdx < sections.length) {
    const nextMode = getModeForSection(song, nextSectionIdx, sections, seed, era, false, usedShaderModes, songIdentity, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed);
    if (nextMode !== currentMode) {
      const boundary = currentSection.frameEnd;
      const beatFrame = findNearestBeat(frames, boundary - 30, boundary + 30);
      const dynamicLenOut = dynamicCrossfadeDuration(frames, boundary);
      const beatLenOut = beatCrossfadeFrames(tempo);
      const crossfadeLen = beatFrame !== null ? Math.min(beatLenOut, dynamicLenOut) : dynamicLenOut;
      const crossfadeEnd = beatFrame !== null ? beatFrame + Math.floor(beatLenOut / 2) : boundary;
      const distToEnd = crossfadeEnd - frame;

      if (distToEnd >= 0 && distToEnd < crossfadeLen) {
        const progress = 1 - distToEnd / crossfadeLen;
        const energyBefore = currentSection ? averageEnergy(frames, currentSection.frameStart, boundary) : 0;
        const nextSection = sections[nextSectionIdx];
        const energyAfter = nextSection ? averageEnergy(frames, boundary, nextSection.frameEnd) : 0;

        // High energy delta: use DualShaderQuad for organic GPU blend
        const energyDeltaOut = Math.abs(energyAfter - energyBefore);
        if (energyDeltaOut > 0.15) {
          const stringsA = getShaderStrings(currentMode);
          const stringsB = getShaderStrings(nextMode);
          if (stringsA && stringsB) {
            const GPU_CROSSFADE_LEN = 120; // chill: 4s GPU crossfade (was 2s)
            const gpuDistToEnd = crossfadeEnd - frame;
            if (gpuDistToEnd >= 0 && gpuDistToEnd < GPU_CROSSFADE_LEN) {
              const gpuProgress = 1 - gpuDistToEnd / GPU_CROSSFADE_LEN;
              return <>{renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
            }
          }
        }

        const sectionLabel = nextSection ? (frames[boundary]?.sectionType ?? undefined) : undefined;
        const scenePreferredOutB = SCENE_REGISTRY[currentMode]?.preferredTransitionOut;
        const scenePreferredInB = SCENE_REGISTRY[nextMode]?.preferredTransitionIn;
        // Compute spectral flux at boundary for style selection
        const fluxWindowOut = 8;
        const fluxLoOut = Math.max(1, boundary - fluxWindowOut);
        const fluxHiOut = Math.min(frames.length - 1, boundary + fluxWindowOut);
        let fluxSumOut = 0, fluxCountOut = 0;
        for (let i = fluxLoOut; i <= fluxHiOut; i++) {
          const curr = frames[i].contrast;
          const prev = frames[i - 1].contrast;
          let l2 = 0;
          for (let b = 0; b < 7; b++) {
            const diff = curr[b] - prev[b];
            l2 += diff * diff;
          }
          fluxSumOut += Math.sqrt(l2);
          fluxCountOut++;
        }
        const boundaryFluxOut = fluxCountOut > 0 ? fluxSumOut / fluxCountOut : 0;
        const transitionStyle = selectTransitionStyle(energyBefore, energyAfter, sectionLabel, scenePreferredInB, scenePreferredOutB, boundaryFluxOut);
        return (
          <SceneCrossfade
            progress={progress}
            outgoing={renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity)}
            incoming={renderMode(nextMode, frames, sections, palette, tempo, undefined, jamDensity)}
            flashFrame={beatFrame !== null ? beatFrame : undefined}
            style={transitionStyle}
          />
        );
      }
    }
  }

  // ─── Dual-shader composition ───
  // Two shaders run simultaneously on the GPU, composited via blend modes.
  // Creates psychedelic depth that a single shader can't achieve.
  // Activates for: high-energy sections, jam/solo stems, tight-lock interplay,
  // solo-spotlight focus (subtle), and Set 1 at higher energy thresholds.
  let mainScene: React.ReactNode;
  const sectionLen = currentSection ? currentSection.frameEnd - currentSection.frameStart : 0;

  // Set-aware energy thresholds: Set 1 requires higher energy, Set 2+ standard
  const isSet1 = setNumber === 1;
  const dualEnergyThreshold = isSet1 ? 0.18 : 0.12;
  const dualBlendCap = isSet1 ? 0.35 : 0.55;

  // Climax force: any section during climax/sustain phase, or high-energy sections
  const climaxForceDual = (climaxPhaseProp !== undefined && climaxPhaseProp >= 2 && climaxPhaseProp <= 3 && frameEnergy > 0.08)
    || (currentSection?.energy === "high" && frameEnergy > dualEnergyThreshold);

  // Cooldown: every 3rd section forced single for visual contrast
  const dualCooldown = currentSectionIdx > 0 && currentSectionIdx % 3 === 0;

  // Stem interplay modulation: tight-lock encourages dual composition
  const interplayForceDual = stemInterplayMode === "tight-lock";
  const isSoloSpotlight = stemInterplayMode === "solo-spotlight";

  const shouldDual = !dualCooldown && !isSoloSpotlight && (climaxForceDual || interplayForceDual || (sectionLen >= 600 && (
    frameEnergy > dualEnergyThreshold ||
    stemSection === "jam" || stemSection === "solo"
  )));

  // Solo-spotlight dual: subtle focus blend instead of full suppression
  const shouldSoloSpotlightDual = isSoloSpotlight && sectionLen >= 600 && frameEnergy > 0.06;

  if (shouldDual || shouldSoloSpotlightDual) {
    // Prefer transition affinity pool for secondary shader selection
    const affinityPool = TRANSITION_AFFINITY[currentMode];
    const rng = seededRandom((seed ?? 0) + currentSectionIdx * 13);

    let secondaryMode: VisualMode;
    if (shouldSoloSpotlightDual) {
      // Solo spotlight: blend a focus-appropriate shader (stark, void, aurora)
      const soloPool: VisualMode[] = ["deep_ocean", "void_light", "aurora", "deep_ocean"];
      const soloFiltered = soloPool.filter((m) => m !== currentMode);
      secondaryMode = soloFiltered[Math.floor(rng() * soloFiltered.length)] ?? getComplement(currentMode);
    } else {
      secondaryMode = affinityPool && affinityPool.length > 0
        ? affinityPool[Math.floor(rng() * affinityPool.length)]
        : getComplement(currentMode);
    }

    const stringsA = getShaderStrings(currentMode);
    const stringsB = getShaderStrings(secondaryMode);

    if (stringsA && stringsB) {
      // Get climax phase from frame data for blend mode selection
      const frameData = frames[Math.min(frame, frames.length - 1)];
      const frameSectionType = frameData?.sectionType;
      const blendMode = selectDualBlendMode(frameEnergy, currentSection?.energy, undefined, frameSectionType);
      // Asymmetric blend with beat pulse: primary dominates at rest,
      // secondary punches through on beats for dynamic contrast (not mush)
      const sectionProgress = currentSection
        ? (frame - currentSection.frameStart) / Math.max(1, sectionLen)
        : 0;
      // Ramp up over first 20% of section (don't start at full blend)
      const sectionRamp = Math.min(1, sectionProgress / 0.2);

      let blendProgress: number;
      if (shouldSoloSpotlightDual) {
        // Solo spotlight: subtle 20-30% blend for visual focus effect
        const soloBaseBlend = 0.15 + frameEnergy * 0.15;
        const soloBeatPulse = (frameData?.beat ? 0.08 : 0) * Math.max(0.3, frameEnergy);
        blendProgress = (soloBaseBlend + soloBeatPulse) * sectionRamp;
        blendProgress = Math.min(0.30, blendProgress);
      } else {
        // Standard dual-shader blend
        const baseBlend = 0.10 + frameEnergy * 0.30;
        const arcBlend = Math.sin(sectionProgress * Math.PI) * 0.12;
        const beatPulse = (frameData?.beat ? 0.15 : 0) * Math.max(0.3, frameEnergy);
        blendProgress = (baseBlend + arcBlend + beatPulse) * sectionRamp;
        blendProgress = Math.min(dualBlendCap, blendProgress);
      }

      mainScene = renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity);
    } else {
      mainScene = renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity);
    }
  } else {
    mainScene = renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity);
  }

  // Dead air crossfade: transition to ambient shader after music ends
  // Use a neutral desaturated palette so the song's personality doesn't bleed into applause
  if (deadAirMode && deadAirFactor !== undefined && deadAirFactor > 0) {
    const deadAirPalette: typeof palette = { primary: 240, secondary: 240, saturation: 0.15, brightness: 0.6 };
    const basePalette = palette ?? { primary: 240, secondary: 240, saturation: 0.5, brightness: 0.8 };
    const blendedPalette = deadAirFactor >= 1 ? deadAirPalette : {
      primary: basePalette.primary + (deadAirPalette.primary - basePalette.primary) * deadAirFactor,
      secondary: basePalette.secondary + (deadAirPalette.secondary - basePalette.secondary) * deadAirFactor,
      saturation: (basePalette.saturation ?? 1) + ((deadAirPalette.saturation ?? 0.15) - (basePalette.saturation ?? 1)) * deadAirFactor,
      brightness: (basePalette.brightness ?? 1) + ((deadAirPalette.brightness ?? 0.6) - (basePalette.brightness ?? 1)) * deadAirFactor,
    };
    if (deadAirFactor >= 1) {
      return <>{renderMode(deadAirMode, frames, sections, deadAirPalette, tempo, undefined, 0.2)}</>;
    }
    return (
      <SceneCrossfade
        progress={deadAirFactor}
        outgoing={mainScene}
        incoming={renderMode(deadAirMode, frames, sections, blendedPalette, tempo, undefined, 0.2)}
      />
    );
  }

  return <>{mainScene}</>;
};
