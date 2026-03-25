/**
 * SceneRouter — determines which visual mode to render based on
 * current frame position within song sections.
 * Handles 90-frame crossfades between mode transitions.
 */

import React from "react";
import { useCurrentFrame } from "remotion";
import { SceneCrossfade } from "./SceneCrossfade";
import { renderScene, getComplement, getModesForEnergy, TRANSITION_AFFINITY, SCENE_REGISTRY } from "./scene-registry";
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
import { DualShaderScene } from "./DualShaderScene";
import type { DualBlendMode } from "../components/DualShaderQuad";
import type { JamEvolution, JamPhaseBoundaries } from "../utils/jam-evolution";
import { getJamPhaseMode, JAM_PHASE_INDEX } from "../utils/jam-evolution";
import type { JamCycleState } from "../utils/jam-cycles";
import type { InterplayMode } from "../utils/stem-interplay";
import type { ReactiveState } from "../utils/reactive-triggers";
import { computeSemanticProfile, extractSemanticScores } from "../utils/semantic-router";

/**
 * Dynamic crossfade duration based on energy context and spectral flux.
 * Quiet→quiet: 240 frames (8s) — gentle dissolve
 * Loud→loud:     8 frames     — hard cut
 * Quiet→loud:   18 frames     — fast snap
 * Loud→quiet:   50 frames     — moderate fade
 * Mid (default): 30 frames    — standard crossfade
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

  let baseDuration: number;
  if (beforeQuiet && afterQuiet) baseDuration = 240;   // gentle dissolve
  else if (beforeLoud && afterLoud) baseDuration = 8;  // hard cut
  else if (beforeQuiet && afterLoud) baseDuration = 18; // fast snap
  else if (beforeLoud && afterQuiet) baseDuration = 50; // moderate fade
  else baseDuration = 30;                               // default

  // Spectral flux compression: measure timbral change rate at the boundary.
  // High flux = rapid spectral change = faster visual crossfade.
  // Compute average spectral flux in a narrow window around the boundary.
  const fluxWindow = 8;
  const fluxLo = Math.max(1, boundary - fluxWindow);
  const fluxHi = Math.min(frames.length - 1, boundary + fluxWindow);
  let fluxSum = 0, fluxCount = 0;
  for (let i = fluxLo; i <= fluxHi; i++) {
    // Compute per-frame spectral flux from contrast vectors
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

  // Flux typically ranges 0-0.5. Above 0.15 is a significant timbral shift.
  // Scale factor: 1.0 (no flux) down to 0.5 (high flux)
  const fluxCompression = Math.max(0.5, 1 - Math.min(avgFlux / 0.3, 1) * 0.5);

  return Math.max(4, Math.round(baseDuration * fluxCompression));
}

const BEAT_CROSSFADE_FRAMES = 30; // 1 second when beat-synced (15 before + 15 after)

// Complement modes and energy pools are now in scene-registry.ts

// Minimum section duration (in frames) to qualify for auto-variety
// Lowered from 2700 (1.5 min) to 1200 (40s) so 5-minute songs get scene transitions.
// Previous threshold meant only 10+ minute songs got within-song variety.
const AUTO_VARIETY_MIN_SECTION = 750; // 25 seconds at 30fps

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
  // Explicit override always wins
  const override = song.sectionOverrides?.find((o) => o.sectionIndex === sectionIndex);
  if (override) return override.mode;

  // Feedback shader cold-start guard: feedback shaders (kaleidoscope, fractal_zoom, etc.)
  // need ~2 minutes of sequential frame accumulation to build brightness. For the first
  // 3 sections, filter them out so songs start with visible, non-feedback shaders.
  const avoidFeedback = sectionIndex <= 2;

  // Coherence lock: hold current shader during peak moments
  if (coherenceIsLocked && sectionIndex > 0) {
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

      // Energy transition detection: pick from affinity map when energy changes
      const energyChanged = prevSection && prevSection.energy !== section.energy;

      if (energyChanged) {
        const affinityPool = TRANSITION_AFFINITY[prevMode];
        if (affinityPool && affinityPool.length > 0) {
          // Filter by energy affinity and era
          const energyPool = getModesForEnergy(section.energy, era, song.defaultMode);
          const energySet = new Set(energyPool);
          let candidates = affinityPool.filter((m) => energySet.has(m));
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

          // Filter feedback shaders from early sections (cold-start produces black)
          if (avoidFeedback) {
            const nonFeedback = candidates.filter((m) => !SCENE_REGISTRY[m]?.usesFeedback);
            if (nonFeedback.length > 0) candidates = nonFeedback;
          }

          const rng = seededRandom(seed + (trackNumber ?? 0) * 31337 + sectionIndex * 7919);
          return candidates[Math.floor(rng() * candidates.length)];
        }
      }

      // No energy change: use energy-appropriate mode pool with seeded selection
      const pool = getModesForEnergy(section.energy, era, song.defaultMode);

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
        let weightedPool: VisualMode[] = [];
        for (const m of showModes) { for (let i = 0; i < 3; i++) weightedPool.push(m); }
        for (const m of remainingPreferred) { for (let i = 0; i < 2; i++) weightedPool.push(m); }
        // Filter feedback shaders from early sections (cold-start produces black)
        if (avoidFeedback) {
          const nonFb = weightedPool.filter((m) => !SCENE_REGISTRY[m]?.usesFeedback);
          if (nonFb.length > 0) weightedPool = nonFb;
        }
        if (weightedPool.length > 0) filteredPool = weightedPool;
      }

      // Stem section bias: route shaders by what the band is doing
      if (stemSection === "solo") {
        const dramaticModes: VisualMode[] = ["inferno", "concert_lighting", "liquid_light"];
        const dramatic = dramaticModes.filter((m) => filteredPool.includes(m));
        if (dramatic.length > 0) {
          filteredPool = [...filteredPool, ...dramatic, ...dramatic]; // 3x weight
        }
      } else if (stemSection === "vocal") {
        const warmModes: VisualMode[] = ["oil_projector", "vintage_film", "aurora"];
        const warm = warmModes.filter((m) => filteredPool.includes(m));
        if (warm.length > 0) {
          filteredPool = [...filteredPool, ...warm, ...warm]; // 3x weight
        }
      } else if (stemSection === "jam") {
        const generativeModes: VisualMode[] = ["feedback_recursion", "reaction_diffusion", "fractal_zoom", "kaleidoscope", "mandala_engine", "voronoi_flow"];
        const generative = generativeModes.filter((m) => filteredPool.includes(m));
        if (generative.length > 0) {
          filteredPool = [...filteredPool, ...generative, ...generative]; // 3x weight
        }
      } else if (stemSection === "instrumental") {
        const midModes: VisualMode[] = ["aurora", "voronoi_flow", "oil_projector", "tie_dye", "crystal_cavern"];
        const mid = midModes.filter((m) => filteredPool.includes(m));
        if (mid.length > 0) {
          filteredPool = [...filteredPool, ...mid]; // 2x weight
        }
      } else if (stemSection === "quiet") {
        const ambientModes: VisualMode[] = ["cosmic_dust", "deep_ocean", "void_light", "morphogenesis", "cosmic_voyage"];
        const ambient = ambientModes.filter((m) => filteredPool.includes(m));
        if (ambient.length > 0) {
          filteredPool = [...filteredPool, ...ambient, ...ambient]; // 3x weight
        }
      }

      // Stem dominant musician bias: who's driving → which shaders feel right
      if (stemDominant === "jerry") {
        const jerryModes: VisualMode[] = ["kaleidoscope", "fractal_zoom", "sacred_geometry", "aurora"];
        const matches = jerryModes.filter((m) => filteredPool.includes(m));
        if (matches.length > 0) {
          for (let i = 0; i < 2; i++) filteredPool = [...filteredPool, ...matches]; // 2.5x weight
        }
      } else if (stemDominant === "phil") {
        const philModes: VisualMode[] = ["deep_ocean", "cosmic_voyage", "neural_web", "cosmic_dust"];
        const matches = philModes.filter((m) => filteredPool.includes(m));
        if (matches.length > 0) {
          for (let i = 0; i < 2; i++) filteredPool = [...filteredPool, ...matches];
        }
      } else if (stemDominant === "drums") {
        const drumsModes: VisualMode[] = ["mandala_engine", "reaction_diffusion", "electric_arc", "inferno"];
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
          const improvModes: VisualMode[] = ["fluid_2d", "fractal_zoom", "reaction_diffusion", "kaleidoscope", "mandala_engine", "feedback_recursion"];
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
          const ambientModes: VisualMode[] = ["aurora", "deep_ocean", "cosmic_dust", "void_light", "morphogenesis", "cosmic_voyage", "oil_projector"];
          const ambientMatches = ambientModes.filter((m) => filteredPool.includes(m));
          if (ambientMatches.length > 0) {
            filteredPool = [...filteredPool, ...ambientMatches]; // 2x weight
          }
        } else if (arc === "jam_vehicle") {
          const generativeModes: VisualMode[] = ["feedback_recursion", "reaction_diffusion", "fractal_zoom", "kaleidoscope", "mandala_engine", "voronoi_flow"];
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
            "concert_lighting", "vintage_film", "lo_fi_grain",
            "stark_minimal", "tie_dye", "inferno", "oil_projector",
          ];
          const matches = structuredModes.filter((m) => filteredPool.includes(m));
          if (matches.length > 0) {
            filteredPool = [...filteredPool, ...matches, ...matches];
          }
        } else if (songDuration > 360) {
          const feedbackModes: VisualMode[] = [
            "feedback_recursion", "reaction_diffusion", "morphogenesis",
            "fractal_zoom", "kaleidoscope", "mandala_engine", "neural_web", "voronoi_flow",
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

      // Filter feedback shaders from early sections (cold-start produces black)
      if (avoidFeedback) {
        const nonFeedback = filteredPool.filter((m) => !SCENE_REGISTRY[m]?.usesFeedback);
        if (nonFeedback.length > 0) filteredPool = nonFeedback;
      }

      const rng = seededRandom(seed + (trackNumber ?? 0) * 31337 + sectionIndex * 7919);
      const idx = Math.floor(rng() * filteredPool.length);
      return filteredPool[idx];
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
      let affinityPool = TRANSITION_AFFINITY[song.defaultMode];
      if (affinityPool && affinityPool.length > 0) {
        if (avoidFeedback) {
          const nonFb = affinityPool.filter((m) => !SCENE_REGISTRY[m]?.usesFeedback);
          if (nonFb.length > 0) affinityPool = nonFb;
        }
        const rng = seededRandom((seed ?? 0) + (trackNumber ?? 0) * 31337 + sectionIndex * 7919);
        return affinityPool[Math.floor(rng() * affinityPool.length)];
      }
      return getComplement(song.defaultMode);
    }
  }

  // Final fallback: if defaultMode is a feedback shader and we're in early sections,
  // use its complement instead (which is always a non-feedback shader)
  if (avoidFeedback && SCENE_REGISTRY[song.defaultMode]?.usesFeedback) {
    return SCENE_REGISTRY[song.defaultMode].complement;
  }
  return song.defaultMode;
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
      const pool: VisualMode[] = ["inferno", "concert_lighting", "electric_arc"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "transition": {
      const pool: VisualMode[] = ["cosmic_voyage", "aurora", "voronoi_flow"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "space_ambient": {
      const pool: VisualMode[] = ["deep_ocean", "cosmic_dust", "crystal_cavern", "void_light", "morphogenesis"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "space_textural": {
      const pool: VisualMode[] = ["sacred_geometry", "fractal_zoom", "mandala_engine", "morphogenesis"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "space_melodic": {
      const pool: VisualMode[] = ["kaleidoscope", "aurora", "sacred_geometry", "crystal_cavern"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "reemergence": return rng() > 0.5 ? "concert_lighting" : "liquid_light";
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

  if (sections.length === 0) {
    return <>{renderMode(song.defaultMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
  }

  // Find current section
  const { sectionIndex: currentSectionIdx } = findCurrentSection(sections, frame);

  // IT transcendent shader forcing: deep coherence lock → meditative shader pool
  if (itForceTranscendentShader) {
    const transcendentPool: VisualMode[] = ["fractal_zoom", "kaleidoscope", "mandala_engine", "cosmic_voyage", "aurora"];
    const rng = seededRandom((seed ?? 0) + frame * 7);
    const dsMode = transcendentPool[Math.floor(rng() * transcendentPool.length)];
    return <>{renderMode(dsMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
  }

  // Drums/Space phase override: force specific shaders per sub-phase
  if (drumsSpacePhase) {
    const dsMode = getDrumsSpaceMode(drumsSpacePhase, seed, songIdentity);
    return <>{renderMode(dsMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
  }

  // ─── REACTIVE TRIGGER: mid-section shader swap on audio events ───
  // Fast 15-frame crossfade into reactive shader, then hold, then crossfade back.
  // Coherence lock always wins (suppressed upstream). Dual shader disabled during hold.
  if (reactiveState?.isTriggered && !coherenceIsLocked && reactiveState.suggestedModes.length > 0) {
    const rng = seededRandom((seed ?? 0) + frame * 11 + (reactiveState.triggerType?.length ?? 0));
    const reactiveMode = reactiveState.suggestedModes[Math.floor(rng() * reactiveState.suggestedModes.length)];
    const regularMode = getModeForSection(song, currentSectionIdx, sections, seed, era, false, usedShaderModes, songIdentity, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed, stemDominant);
    const REACTIVE_CROSSFADE = 15;
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
    return <>{renderMode(reactiveMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
  }

  const currentMode = getModeForSection(song, currentSectionIdx, sections, seed, era, coherenceIsLocked, usedShaderModes, songIdentity, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed, stemDominant);
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
            return (
              <DualShaderScene
                frames={frames} sections={sections} palette={palette} tempo={tempo} jamDensity={jamDensity}
                vertA={stringsA.vert} fragA={stringsA.frag}
                vertB={stringsB.vert} fragB={stringsB.frag}
                blendMode={blendMode} blendProgress={Math.min(0.40, peakBlend)}
              />
            );
          }
        }
      }

      // Standard jam phase render (with dual-shader composition if energy warrants)
      const frameEnergy = frames[Math.min(frame, frames.length - 1)]?.rms ?? 0;
      const jamShouldDual = frameEnergy > 0.05 || jamEvolution.phase === "peak_space" || jamEvolution.phase === "building" || jamEvolution.phase === "exploration";
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
          return (
            <DualShaderScene
              frames={frames} sections={sections} palette={palette} tempo={tempo} jamDensity={jamDensity}
              vertA={stringsA.vert} fragA={stringsA.frag}
              vertB={stringsB.vert} fragB={stringsB.frag}
              blendMode={blendMode} blendProgress={Math.min(0.50, blendProgress)}
            />
          );
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
      const crossfadeLen = beatFrame !== null ? BEAT_CROSSFADE_FRAMES : dynamicCrossfadeDuration(frames, boundary);
      const crossfadeStart = beatFrame !== null ? beatFrame - 30 : boundary;
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
            const GPU_CROSSFADE_LEN = 60;
            const gpuDistFromStart = frame - crossfadeStart;
            if (gpuDistFromStart >= 0 && gpuDistFromStart < GPU_CROSSFADE_LEN) {
              const gpuProgress = gpuDistFromStart / GPU_CROSSFADE_LEN;
              const blendMode = selectDualBlendMode(frameEnergy, currentSection?.energy, undefined);
              return (
                <DualShaderScene
                  frames={frames} sections={sections} palette={palette} tempo={tempo} jamDensity={jamDensity}
                  vertA={stringsA.vert} fragA={stringsA.frag}
                  vertB={stringsB.vert} fragB={stringsB.frag}
                  blendMode={blendMode} blendProgress={gpuProgress}
                />
              );
            }
          }
        }

        const sectionLabel = currentSection ? (frames[boundary]?.sectionType ?? undefined) : undefined;
        const scenePreferredOut = SCENE_REGISTRY[prevMode]?.preferredTransitionOut;
        const scenePreferredIn = SCENE_REGISTRY[currentMode]?.preferredTransitionIn;
        const transitionStyle = selectTransitionStyle(energyBefore, energyAfter, sectionLabel, scenePreferredIn, scenePreferredOut);
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
      const crossfadeLen = beatFrame !== null ? BEAT_CROSSFADE_FRAMES : dynamicCrossfadeDuration(frames, boundary);
      const crossfadeEnd = beatFrame !== null ? beatFrame + 30 : boundary;
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
            const GPU_CROSSFADE_LEN = 60;
            const gpuDistToEnd = crossfadeEnd - frame;
            if (gpuDistToEnd >= 0 && gpuDistToEnd < GPU_CROSSFADE_LEN) {
              const gpuProgress = 1 - gpuDistToEnd / GPU_CROSSFADE_LEN;
              const blendMode = selectDualBlendMode(frameEnergy, currentSection?.energy, undefined);
              return (
                <DualShaderScene
                  frames={frames} sections={sections} palette={palette} tempo={tempo} jamDensity={jamDensity}
                  vertA={stringsA.vert} fragA={stringsA.frag}
                  vertB={stringsB.vert} fragB={stringsB.frag}
                  blendMode={blendMode} blendProgress={gpuProgress}
                />
              );
            }
          }
        }

        const sectionLabel = nextSection ? (frames[boundary]?.sectionType ?? undefined) : undefined;
        const scenePreferredOutB = SCENE_REGISTRY[currentMode]?.preferredTransitionOut;
        const scenePreferredInB = SCENE_REGISTRY[nextMode]?.preferredTransitionIn;
        const transitionStyle = selectTransitionStyle(energyBefore, energyAfter, sectionLabel, scenePreferredInB, scenePreferredOutB);
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

  // Dual-shader activation: sufficient length + moderate energy, or jam/solo stem, or tight-lock interplay
  const shouldDual = !dualCooldown && !isSoloSpotlight && (climaxForceDual || interplayForceDual || (sectionLen >= 600 && (
    frameEnergy > dualEnergyThreshold ||
    stemSection === "jam" || stemSection === "solo"
  )));

  // Solo-spotlight dual: subtle focus blend instead of full suppression
  const shouldSoloSpotlightDual = isSoloSpotlight && !dualCooldown && sectionLen >= 300 && frameEnergy > 0.06;

  if (shouldDual || shouldSoloSpotlightDual) {
    // Prefer transition affinity pool for secondary shader selection
    const affinityPool = TRANSITION_AFFINITY[currentMode];
    const rng = seededRandom((seed ?? 0) + currentSectionIdx * 13);

    let secondaryMode: VisualMode;
    if (shouldSoloSpotlightDual) {
      // Solo spotlight: blend a focus-appropriate shader (stark, void, aurora)
      const soloPool: VisualMode[] = ["stark_minimal", "void_light", "aurora", "deep_ocean"];
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

      mainScene = (
        <DualShaderScene
          frames={frames} sections={sections} palette={palette} tempo={tempo} jamDensity={jamDensity}
          vertA={stringsA.vert} fragA={stringsA.frag}
          vertB={stringsB.vert} fragB={stringsB.frag}
          blendMode={blendMode} blendProgress={blendProgress}
        />
      );
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
