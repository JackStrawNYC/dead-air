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
import { selectTransitionStyle } from "../utils/transition-selector";
import { getShaderStrings } from "../shaders/shader-strings";
import { GPUTransition, transitionStyleToBlendMode } from "./GPUTransition";
import type { JamEvolution, JamPhaseBoundaries } from "../utils/jam-evolution";
import type { JamCycleState } from "../utils/jam-cycles";
import type { InterplayMode } from "../utils/stem-interplay";
import type { ReactiveState } from "../utils/reactive-triggers";

// ─── Extracted routing modules ───
import { dynamicCrossfadeDuration, beatCrossfadeFrames } from "./routing/crossfade-timing";
import { findNearestBeat } from "./routing/beat-sync";
import { getModeForSection } from "./routing/shader-variety";
import { getDrumsSpaceMode } from "./routing/drums-space-router";
import { averageEnergy, selectDualBlendMode, renderMode } from "./routing/scene-utils";
import { renderSectionOverride } from "./routing/SectionOverrideRouter";
import { renderReactiveTrigger, renderReactiveExitCrossfade } from "./routing/ReactiveShaderRouter";
import { renderJamPhase } from "./routing/JamPhaseRouter";

// Re-export extracted functions so existing imports from SceneRouter continue to work
export { dynamicCrossfadeDuration } from "./routing/crossfade-timing";
export { findNearestBeat } from "./routing/beat-sync";
export { validateSectionOverrides } from "./routing/section-validation";
export { getModeForSection } from "./routing/shader-variety";
export { getDrumsSpaceMode } from "./routing/drums-space-router";

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

export const SceneRouter: React.FC<Props> = ({ frames, sections, song, tempo, seed, jamDensity, deadAirMode, deadAirFactor, era, coherenceIsLocked, usedShaderModes, shaderModeLastUsed, drumsSpacePhase, songIdentity, stemSection, songDuration, palette: paletteProp, segueIn, isSacredSegueIn, isInSuiteMiddle, setNumber, jamEvolution, jamPhaseBoundaries, jamCycle, jamPhaseShaders, climaxPhase: climaxPhaseProp, trackNumber, stemInterplayMode, stemDominant, itForceTranscendentShader, reactiveState }) => {
  const frame = useCurrentFrame();
  const palette = paletteProp ?? song.palette;

  // Track reactive trigger for crossfade-out when trigger ends
  const reactiveExitRef = React.useRef<{ mode: VisualMode; exitFrame: number; crossfadeFrames: number } | null>(null);
  const lastReactiveModeRef = React.useRef<VisualMode | null>(null);

  if (sections.length === 0) {
    return <>{renderMode(song.defaultMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
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

  // ─── REACTIVE TRIGGER — delegated to ReactiveShaderRouter
  const reactiveResult = renderReactiveTrigger(reactiveState, coherenceIsLocked, deadAirFactor, song, songIdentity, seed, currentSectionIdx, sections, era, usedShaderModes, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed, stemDominant, palette, tempo, jamDensity, frame, renderMode, getModeForSection, lastReactiveModeRef, reactiveExitRef);
  if (reactiveResult) return reactiveResult;

  const currentMode = getModeForSection(song, currentSectionIdx, sections, seed, era, coherenceIsLocked, usedShaderModes, songIdentity, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed, stemDominant);

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

        // High energy delta: use GPU blend for organic crossfade
        const energyDelta = Math.abs(energyAfter - energyBefore);
        if (energyDelta > 0.15) {
          const GPU_CROSSFADE_LEN = 120; // 4s GPU crossfade
          const gpuDistFromStart = frame - crossfadeStart;
          if (gpuDistFromStart >= 0 && gpuDistFromStart < GPU_CROSSFADE_LEN) {
            const gpuProgress = gpuDistFromStart / GPU_CROSSFADE_LEN;
            const gpuBlendMode = transitionStyleToBlendMode("dissolve", energyAfter);
            return (
              <GPUTransition
                outMode={prevMode}
                inMode={currentMode}
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
