/**
 * Shader variety — mode selection, recency weighting, and section-aware routing.
 */

import type {
  EnhancedFrameData,
  SectionBoundary,
  VisualMode,
  SetlistEntry,
} from "../../data/types";
import { seededLCG as seededRandom } from "../../utils/seededRandom";
import { type SongIdentity, getShowModesForSong } from "../../data/song-identities";
import type { StemSectionType } from "../../utils/stem-features";
import { getComplement, getModesForContinuousEnergy, TRANSITION_AFFINITY, SCENE_REGISTRY } from "../scene-registry";
import { applySetShaderFilter } from "../../utils/set-theme";
import { detectChordMood } from "../../utils/chord-mood";
import { estimateImprovisationScore } from "../../utils/improv-detector";
import { getSectionSpectralFamily } from "../../utils/spectral-section";
import { computeSemanticProfile, extractSemanticScores } from "../../utils/semantic-router";
import { detectGroove } from "../../utils/groove-detector";
import { AUTO_VARIETY_MIN_SECTION } from "./crossfade-timing";
import { scoreDiversityBonus, type VisualMemoryState } from "../../utils/visual-memory";
import { pickDrumsSpaceMode } from "./drums-space-router";
import type { DrumsSpaceSubPhase } from "../../utils/drums-space-phase";

/**
 * Safe shaders whitelist — validate chosen mode at the end.
 * Includes all curated chill-mode shaders that are confirmed palette-safe
 * (using paletteHueColor / safeBlendHue helpers post-audit) and have proper
 * temporalBlendEnabled feedback (no broken max() pattern).
 */
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

function validateSafe(mode: VisualMode, defaultMode: VisualMode): VisualMode {
  return SAFE_SHADERS.has(mode) ? mode : defaultMode;
}

/**
 * Apply recency-weighted scoring to a shader mode pool.
 * Instead of binary "used/unused" filtering, penalizes modes based on how recently
 * and how frequently they were used. Modes used many songs ago get nearly full weight.
 *
 * @returns Weighted pool where less-recently-used modes appear more often
 */
export function applyRecencyWeighting(
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
  visualMemory?: VisualMemoryState,
  showShaderPool?: VisualMode[],
  drumsSpacePhase?: DrumsSpaceSubPhase,
): VisualMode {
  // Explicit override always wins
  const override = song.sectionOverrides?.find((o) => o.sectionIndex === sectionIndex);
  if (override) return validateSafe(override.mode, song.defaultMode);

  // Drums/Space ritual override — sacred phase routing wins over normal
  // section logic (and over coherence lock — the ritual IS the coherent
  // moment). Pool curated in drums-space-router.ts; song identity
  // drumsSpaceShaders override the pool when present and pool-valid.
  if (drumsSpacePhase) {
    const ds = pickDrumsSpaceMode(drumsSpacePhase, seed ?? 0, songIdentity, showShaderPool);
    return validateSafe(ds, song.defaultMode);
  }

  // Section 0: use first authored preferredMode if available, else default.
  // This prevents every song from opening on liquid_light (the global default)
  // when the song has a curated visual identity.
  if (sectionIndex === 0) {
    if (songIdentity?.preferredModes?.length) {
      // Pick the first non-blocked preferredMode
      for (const mode of songIdentity.preferredModes) {
        if (SAFE_SHADERS.has(mode)) return mode;
      }
    }
    return validateSafe(song.defaultMode, song.defaultMode);
  }

  // Coherence lock: hold shader ID but allow parameter evolution.
  // During "IT" moments, the shader stays the same but the visual world
  // deepens — colors shift, geometry breathes, depth opens. Transcendence
  // = deepening, not freezing. The shader ID is locked; parameters evolve.
  if (coherenceIsLocked) {
    return getModeForSection(song, sectionIndex - 1, sections, seed, era, false, usedShaderModes, songIdentity, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed, stemDominant, visualMemory, showShaderPool);
    // Note: parameter evolution is driven by the EnergyEnvelope and
    // shader-internal uCoherence uniform, which continues to respond
    // to audio even when the shader ID is locked.
  }

  // Seeded variation with affinity-aware morphing
  if (seed !== undefined) {
    const section = sections[sectionIndex];
    if (section) {
      const prevSection = sectionIndex > 0 ? sections[sectionIndex - 1] : null;
      const prevMode = sectionIndex > 0
        ? getModeForSection(song, sectionIndex - 1, sections, seed, era, false, usedShaderModes, songIdentity, undefined, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed, stemDominant, visualMemory, showShaderPool)
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
          let energyPool = getModesForContinuousEnergy(section.avgEnergy, era, song.defaultMode);
          // Show shader pool whitelist: restrict to curated per-show shaders
          if (showShaderPool && showShaderPool.length > 0) {
            const poolSet = new Set(showShaderPool);
            const filtered = energyPool.filter((m) => poolSet.has(m));
            if (filtered.length >= 2) energyPool = filtered; // soft filter
          }
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

          // Preferred mode hard ceiling: song identity dominates shader selection.
          // When preferredModes exist, they are a HARD ceiling — only preferred
          // shaders can be selected, weighted 5x for show modes. This ensures
          // Dark Star looks like Dark Star, not random rotation.
          if (songIdentity?.preferredModes?.length && seed !== undefined) {
            const showModes = getShowModesForSong(songIdentity.preferredModes, seed, song.title);
            const showModeSet = new Set(showModes);
            const remainingPreferred = songIdentity.preferredModes.filter((m) => !showModeSet.has(m));
            const weightedPool: VisualMode[] = [];
            for (const m of showModes) { for (let i = 0; i < 5; i++) weightedPool.push(m); }
            for (const m of remainingPreferred) { for (let i = 0; i < 2; i++) weightedPool.push(m); }
            if (weightedPool.length > 0) candidates = weightedPool;
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

          // Visual memory diversity: boost candidates that are visually novel
          if (visualMemory && visualMemory.totalWeight > 0) {
            const DIVERSITY_WEIGHT = 0.5;
            const diversityCandidates: VisualMode[] = [];
            for (const mode of candidates) {
              const bonus = scoreDiversityBonus(visualMemory, mode);
              const extraCopies = Math.round(bonus * DIVERSITY_WEIGHT * 4);
              for (let i = 0; i < 1 + extraCopies; i++) {
                diversityCandidates.push(mode);
              }
            }
            if (diversityCandidates.length > 0) candidates = diversityCandidates;
          }

          const rng = seededRandom(seed + (trackNumber ?? 0) * 31337 + sectionIndex * 7919);
          return validateSafe(candidates[Math.floor(rng() * candidates.length)], song.defaultMode);
        }
      }

      // No energy change: use continuous-energy weighted pool. Each shader's
      // copies are gaussian-proportional to distance between its affinity
      // center and the section's actual avgEnergy, so a quiet ballad section
      // (avgEnergy 0.10) and a quiet station section (avgEnergy 0.20) draw
      // from genuinely different distributions instead of identical "low" pools.
      let pool = getModesForContinuousEnergy(section.avgEnergy, era, song.defaultMode);
      // Show shader pool whitelist: restrict to curated per-show shaders
      if (showShaderPool && showShaderPool.length > 0) {
        const poolSet = new Set(showShaderPool);
        const filtered = pool.filter((m) => poolSet.has(m));
        if (filtered.length >= 2) pool = filtered; // soft filter
      }

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

      // ─── Groove detection: PRIMARY routing signal ───
      // Averages audio features across the section (not a single frame) for stable groove detection.
      // Groove type (pocket/driving/floating/freeform) maps to shader families with 3x weight.
      if (frames && section) {
        const sStart = section.frameStart;
        const sEnd = Math.min(section.frameEnd, frames.length - 1);
        const sampleCount = Math.min(10, sEnd - sStart);
        if (sampleCount > 0) {
          let avgStability = 0, avgDrumOnset = 0, avgFlatness = 0;
          for (let s = 0; s < sampleCount; s++) {
            const fi = sStart + Math.floor(s * (sEnd - sStart) / sampleCount);
            const f = frames[fi];
            avgStability += f?.beatConfidence ?? 0.5;
            avgDrumOnset += f?.stemDrumOnset ?? 0;
            avgFlatness += f?.flatness ?? 0.3;
          }
          avgStability /= sampleCount;
          avgDrumOnset /= sampleCount;
          avgFlatness /= sampleCount;

          const groove = detectGroove(avgStability, avgDrumOnset, section.avgEnergy ?? 0.2, avgFlatness);
          if (groove.confidence > 0.3) {
            const GROOVE_SHADERS: Record<string, VisualMode[]> = {
              pocket: ["protean_clouds", "mandala_engine", "aurora", "tie_dye", "vintage_film"],
              driving: ["inferno", "cosmic_voyage", "electric_arc", "plasma_field", "lava_flow"],
              floating: ["void_light", "cosmic_dust", "deep_ocean", "volumetric_nebula", "particle_nebula"],
              freeform: ["cosmic_voyage", "deep_ocean", "fractal_zoom", "reaction_diffusion", "morphogenesis"],
            };
            const grooveModes = (GROOVE_SHADERS[groove.type] ?? []).filter((m: VisualMode) => filteredPool.includes(m));
            if (grooveModes.length > 0) {
              // 3x weight — groove is a primary signal but shouldn't override song identity
              for (let i = 0; i < 2; i++) filteredPool = [...filteredPool, ...grooveModes];
            }
          }
        }
      }

      // ─── Semantic routing: PRIMARY routing signal ───
      // Averages CLAP semantic scores across the section for stable mood detection.
      // When dominant category confidence > 0.35, its preferred shaders get 3x weight.
      if (frames && section) {
        const sStart = section.frameStart;
        const sEnd = Math.min(section.frameEnd, frames.length - 1);
        const sampleCount = Math.min(10, sEnd - sStart);
        if (sampleCount > 0) {
          let avgScores = { psychedelic: 0, aggressive: 0, tender: 0, cosmic: 0, rhythmic: 0, ambient: 0, chaotic: 0, triumphant: 0 };
          for (let s = 0; s < sampleCount; s++) {
            const fi = sStart + Math.floor(s * (sEnd - sStart) / sampleCount);
            const f = frames[fi];
            if (f) {
              avgScores.psychedelic += f.semantic_psychedelic ?? 0;
              avgScores.aggressive += f.semantic_aggressive ?? 0;
              avgScores.tender += f.semantic_tender ?? 0;
              avgScores.cosmic += f.semantic_cosmic ?? 0;
              avgScores.rhythmic += f.semantic_rhythmic ?? 0;
              avgScores.ambient += f.semantic_ambient ?? 0;
              avgScores.chaotic += f.semantic_chaotic ?? 0;
              avgScores.triumphant += f.semantic_triumphant ?? 0;
            }
          }
          for (const k of Object.keys(avgScores) as (keyof typeof avgScores)[]) {
            avgScores[k] /= sampleCount;
          }

          const scores = extractSemanticScores({
            semanticPsychedelic: avgScores.psychedelic,
            semanticAggressive: avgScores.aggressive,
            semanticTender: avgScores.tender,
            semanticCosmic: avgScores.cosmic,
            semanticRhythmic: avgScores.rhythmic,
            semanticAmbient: avgScores.ambient,
            semanticChaotic: avgScores.chaotic,
            semanticTriumphant: avgScores.triumphant,
          });
          if (scores) {
            const profile = computeSemanticProfile(scores);
            if (profile.dominant && profile.dominantConfidence > 0.35 && profile.preferredShaders.length > 0) {
              const semanticMatches = profile.preferredShaders.filter((m: VisualMode) => filteredPool.includes(m));
              if (semanticMatches.length > 0) {
                // 3x weight — semantic is a primary signal but respects song identity
                for (let i = 0; i < 2; i++) filteredPool = [...filteredPool, ...semanticMatches];
              }
            }
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

      // Visual memory diversity: boost candidates that are visually novel
      if (visualMemory && visualMemory.totalWeight > 0) {
        const DIVERSITY_WEIGHT = 0.5;
        const diversityPool: VisualMode[] = [];
        for (const mode of filteredPool) {
          const bonus = scoreDiversityBonus(visualMemory, mode);
          const extraCopies = Math.round(bonus * DIVERSITY_WEIGHT * 4);
          for (let i = 0; i < 1 + extraCopies; i++) {
            diversityPool.push(mode);
          }
        }
        if (diversityPool.length > 0) filteredPool = diversityPool;
      }

      const rng = seededRandom(seed + (trackNumber ?? 0) * 31337 + sectionIndex * 7919);
      const idx = Math.floor(rng() * filteredPool.length);
      return validateSafe(filteredPool[idx], song.defaultMode);
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
        return validateSafe(affinityPool[Math.floor(rng() * affinityPool.length)], song.defaultMode);
      }
      return validateSafe(getComplement(song.defaultMode), song.defaultMode);
    }
  }

  return validateSafe(song.defaultMode, song.defaultMode);
}
