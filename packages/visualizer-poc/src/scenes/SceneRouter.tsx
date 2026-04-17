/**
 * SceneRouter — determines which visual mode to render based on
 * current frame position within song sections.
 * Handles 90-frame crossfades between mode transitions.
 */

import React from "react";
import { useCurrentFrame } from "remotion";
import { SceneCrossfade } from "./SceneCrossfade";
import { getComplement, TRANSITION_AFFINITY, SCENE_REGISTRY } from "./scene-registry";
import type {
  EnhancedFrameData,
  SectionBoundary,
  VisualMode,
  SetlistEntry,
  ColorPalette,
} from "../data/types";
import { seededLCG as seededRandom } from "../utils/seededRandom";
import { findCurrentSection } from "../utils/section-lookup";
import type { SongIdentity } from "../data/song-identities";
import type { StemSectionType } from "../utils/stem-features";
// selectTransitionStyle no longer needed — all transitions use GPUTransition
import { GPUTransition, transitionStyleToBlendMode } from "./GPUTransition";
import type { JamEvolution, JamPhaseBoundaries } from "../utils/jam-evolution";
import type { JamCycleState } from "../utils/jam-cycles";
import type { InterplayMode } from "../utils/stem-interplay";
import type { ReactiveState } from "../utils/reactive-triggers";
import type { VisualMemoryState } from "../utils/visual-memory";
import type { CameraProfile } from "../config/camera-profiles";

// ─── Extracted routing modules ───
import { dynamicCrossfadeDuration, beatCrossfadeFrames } from "./routing/crossfade-timing";
import { findNearestBeat } from "./routing/beat-sync";
import { getModeForSection } from "./routing/shader-variety";
import { getDrumsSpaceMode } from "./routing/drums-space-router";
import { averageEnergy, renderMode } from "./routing/scene-utils";
import { renderSectionOverride } from "./routing/SectionOverrideRouter";
import { renderReactiveTrigger, renderReactiveExitCrossfade } from "./routing/ReactiveShaderRouter";
import { renderJamPhase } from "./routing/JamPhaseRouter";
import { getSectionVocabulary } from "../utils/section-vocabulary";

// Re-export extracted functions so existing imports from SceneRouter continue to work
export { dynamicCrossfadeDuration } from "./routing/crossfade-timing";
export { findNearestBeat } from "./routing/beat-sync";
export { validateSectionOverrides } from "./routing/section-validation";
export { getModeForSection } from "./routing/shader-variety";
export { getDrumsSpaceMode } from "./routing/drums-space-router";

/** Minimum shader hold frames by section type (at 30fps) */
const MIN_HOLD_FRAMES: Record<string, number> = {
  jam: 5400,     // 3 minutes
  solo: 2700,    // 90 seconds
  space: 9000,   // 5 minutes
  verse: 900,    // 30 seconds
  chorus: 900,   // 30 seconds
  bridge: 900,   // 30 seconds
  intro: 450,    // 15 seconds
  outro: 450,    // 15 seconds
};

/**
 * Check whether the current shader should be held (suppress transition).
 * Looks backward through sections to find the start of the current "run"
 * of same-type sections, then checks if enough time has elapsed.
 */
function shouldHoldShader(
  frames: EnhancedFrameData[],
  frame: number,
  currentSection: SectionBoundary,
  sectionIndex: number,
  sections: SectionBoundary[],
): boolean {
  const sectionType = frames[Math.min(frame, frames.length - 1)]?.sectionType ?? "verse";
  const minHold = MIN_HOLD_FRAMES[sectionType] ?? 900;

  // Walk backward to find the start of this contiguous run of same-type sections
  let holdStart = currentSection.frameStart;
  for (let i = sectionIndex - 1; i >= 0; i--) {
    const prevType = frames[Math.min(sections[i].frameStart, frames.length - 1)]?.sectionType;
    if (prevType !== sectionType) break;
    holdStart = sections[i].frameStart;
  }

  return (frame - holdStart) < minHold;
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
  /** Accumulated visual memory for show-level diversity scoring */
  visualMemory?: VisualMemoryState;
  /** Camera behavior profile resolved from narrative directive */
  cameraProfile?: CameraProfile;
  /** Per-show curated shader pool — whitelist filter for mode selection */
  showShaderPool?: VisualMode[];
}

export const SceneRouter: React.FC<Props> = ({ frames, sections, song, tempo, seed, jamDensity, deadAirMode, deadAirFactor, era, coherenceIsLocked, usedShaderModes, shaderModeLastUsed, drumsSpacePhase, songIdentity, stemSection, songDuration, palette: paletteProp, segueIn, isSacredSegueIn, isInSuiteMiddle, setNumber, jamEvolution, jamPhaseBoundaries, jamCycle, jamPhaseShaders, climaxPhase: climaxPhaseProp, trackNumber, stemInterplayMode, stemDominant, itForceTranscendentShader, reactiveState, visualMemory, cameraProfile, showShaderPool }) => {
  const frame = useCurrentFrame();
  const palette = paletteProp ?? song.palette;

  // Build scene config from camera profile (threaded through all renderMode calls)
  const sceneConfig = cameraProfile ? { cameraProfile } : undefined;

  // Track reactive trigger for crossfade-out when trigger ends
  const reactiveExitRef = React.useRef<{ mode: VisualMode; exitFrame: number; crossfadeFrames: number } | null>(null);
  const lastReactiveModeRef = React.useRef<VisualMode | null>(null);

  if (sections.length === 0) {
    return <>{renderMode(song.defaultMode, frames, sections, palette, tempo, undefined, jamDensity, sceneConfig)}</>;
  }

  // Find current section
  const { sectionIndex: currentSectionIdx } = findCurrentSection(sections, frame);

  // EXPLICIT SECTION OVERRIDE — delegated to SectionOverrideRouter
  const overrideResult = renderSectionOverride(song, sections, currentSectionIdx, frame, frames, palette, tempo, jamDensity, renderMode);
  if (overrideResult) return overrideResult;

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
      return <>{renderMode(dsMode, frames, sections, palette, tempo, undefined, jamDensity, sceneConfig)}</>;
    }
    // Fall through if no preferred mode matches the transcendent pool
  }

  // Drums/Space phase override: force specific shaders per sub-phase.
  // getDrumsSpaceMode already consults songIdentity for drumsSpaceShaders mappings,
  // so this path is already song-aware. Leave as-is.
  if (drumsSpacePhase) {
    const dsMode = getDrumsSpaceMode(drumsSpacePhase, seed, songIdentity);
    return <>{renderMode(dsMode, frames, sections, palette, tempo, undefined, jamDensity, sceneConfig)}</>;
  }

  // ─── REACTIVE TRIGGER — delegated to ReactiveShaderRouter
  const reactiveResult = renderReactiveTrigger(reactiveState, coherenceIsLocked, deadAirFactor, song, songIdentity, seed, currentSectionIdx, sections, era, usedShaderModes, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed, stemDominant, palette, tempo, jamDensity, frame, renderMode, getModeForSection, lastReactiveModeRef, reactiveExitRef);
  if (reactiveResult) return reactiveResult;

  const currentMode = getModeForSection(song, currentSectionIdx, sections, seed, era, coherenceIsLocked, usedShaderModes, songIdentity, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed, stemDominant, visualMemory, showShaderPool);

  // ─── Reactive exit crossfade — delegated to ReactiveShaderRouter
  const reactiveExitResult = renderReactiveExitCrossfade(reactiveExitRef, frame, currentMode, frames, sections, palette, tempo, jamDensity, renderMode);
  if (reactiveExitResult) return reactiveExitResult;
  const currentSection = sections[currentSectionIdx];

  // ─── JAM PHASE SHADER TRANSITIONS — delegated to JamPhaseRouter
  const jamResult = renderJamPhase(jamEvolution, jamPhaseBoundaries, jamPhaseShaders, jamCycle, frame, frames, sections, palette, tempo, jamDensity, seed, currentSection, renderMode);
  if (jamResult) return jamResult;

  const nextSectionIdx = currentSectionIdx + 1;
  const prevSectionIdx = currentSectionIdx - 1;
  const frameEnergy = frames[Math.min(frame, frames.length - 1)]?.rms ?? 0;

  // Sacred segue or suite middle: suppress first within-song scene crossfade for 90 frames (3s)
  // This prevents a jarring shader switch right as the segue/suite transition lands
  const suppressCrossfade = (isSacredSegueIn || isInSuiteMiddle) && frame < 90;

  // Crossfade INTO this section (from previous) — beat-synced when possible
  // High energy delta transitions (>0.15) use DualShaderQuad for organic GPU blending
  if (prevSectionIdx >= 0 && !suppressCrossfade) {
    const prevMode = getModeForSection(song, prevSectionIdx, sections, seed, era, false, usedShaderModes, songIdentity, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed, stemDominant, visualMemory, showShaderPool);
    if (prevMode !== currentMode) {
      // ─── cutsPermitted gate: section types that forbid cuts suppress all normal transitions
      const incomingSectionType = frames[Math.min(frame, frames.length - 1)]?.sectionType;
      const incomingVocab = getSectionVocabulary(incomingSectionType);
      if (!incomingVocab.cutsPermitted) {
        // Fall through — render current mode without crossfade
      } else if (shouldHoldShader(frames, frame, currentSection, currentSectionIdx, sections)) {
        // Minimum hold not met — suppress transition, hold current shader
      } else {
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

          // ALL transitions use GPU blend modes — no CSS crossfades.
          // GPU transitions render both shaders and blend at the pixel level,
          // producing seamless morphs instead of jarring opacity fades.
          // Blend mode is selected based on energy context:
          //   - High energy delta (>0.15): luminance_key (bright areas punch through)
          //   - High flux: noise_dissolve (organic, psychedelic)
          //   - Low energy: additive (soft glow)
          //   - Default: dissolve (clean linear crossfade)
          const energyDelta = Math.abs(energyAfter - energyBefore);

          // Compute spectral flux for blend mode selection
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

          // Select GPU blend mode based on energy context.
          // Use input names that transitionStyleToBlendMode recognizes:
          //   "shader_luminance" → luminance_key (bright areas punch through)
          //   "distortion" → noise_dissolve (organic, psychedelic)
          //   "shader_additive" → additive (soft glow)
          //   "dissolve" → noise_dissolve (clean)
          let gpuStyle: string;
          if (energyDelta > 0.15) gpuStyle = "shader_luminance";
          else if (boundaryFlux > 0.25) gpuStyle = "distortion";
          else if (energyAfter < 0.08) gpuStyle = "shader_additive";
          else gpuStyle = "dissolve";

          return (
            <GPUTransition
              outMode={prevMode}
              inMode={currentMode}
              progress={progress}
              blendMode={transitionStyleToBlendMode(gpuStyle, energyAfter)}
              frames={frames}
              sections={sections}
              palette={palette}
              tempo={tempo}
              jamDensity={jamDensity}
            />
          );
        }
      }
    }
  }

  // Crossfade OUT of this section (to next) — beat-synced when possible
  // High energy delta transitions use DualShaderQuad for organic GPU blending
  if (nextSectionIdx < sections.length) {
    const nextMode = getModeForSection(song, nextSectionIdx, sections, seed, era, false, usedShaderModes, songIdentity, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed, stemDominant, visualMemory, showShaderPool);
    if (nextMode !== currentMode) {
      // ─── cutsPermitted gate: section types that forbid cuts suppress all normal transitions
      const outgoingSectionType = frames[Math.min(frame, frames.length - 1)]?.sectionType;
      const outgoingVocab = getSectionVocabulary(outgoingSectionType);
      if (!outgoingVocab.cutsPermitted) {
        // Fall through — render current mode without crossfade
      } else if (shouldHoldShader(frames, frame, currentSection, currentSectionIdx, sections)) {
        // Minimum hold not met — suppress transition, hold current shader
      } else {
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

          // High energy delta: use GPU blend for organic crossfade
          const energyDeltaOut = Math.abs(energyAfter - energyBefore);
          if (energyDeltaOut > 0.15) {
            const GPU_CROSSFADE_LEN = 120; // 4s GPU crossfade
            const gpuDistToEnd = crossfadeEnd - frame;
            if (gpuDistToEnd >= 0 && gpuDistToEnd < GPU_CROSSFADE_LEN) {
              const gpuProgress = 1 - gpuDistToEnd / GPU_CROSSFADE_LEN;
              const gpuBlendMode = transitionStyleToBlendMode("dissolve", energyAfter);
              return (
                <GPUTransition
                  outMode={currentMode}
                  inMode={nextMode}
                  progress={gpuProgress}
                  blendMode={gpuBlendMode}
                  frames={frames}
                  sections={sections}
                  palette={palette}
                  tempo={tempo}
                  jamDensity={jamDensity}
                />
              );
            }
          }

          // ALL outgoing transitions use GPU blend — no CSS crossfades.
          // Select blend mode based on energy and spectral flux at boundary.
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

          // Pick GPU blend style: soft glow for quiet, organic dissolve for high flux, clean dissolve otherwise
          let gpuStyleOut: string;
          if (energyAfter < 0.08) gpuStyleOut = "shader_additive";
          else if (boundaryFluxOut > 0.25) gpuStyleOut = "distortion";
          else gpuStyleOut = "dissolve";

          return (
            <GPUTransition
              outMode={currentMode}
              inMode={nextMode}
              progress={progress}
              blendMode={transitionStyleToBlendMode(gpuStyleOut, energyAfter)}
              frames={frames}
              sections={sections}
              palette={palette}
              tempo={tempo}
              jamDensity={jamDensity}
            />
          );
        }
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

  // TODO: dual-shader composition not yet wired — render single mode for now
  mainScene = renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity, sceneConfig);

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
