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
import { JAM_PHASE_INDEX } from "../utils/jam-evolution";
import type { JamCycleState } from "../utils/jam-cycles";
import type { InterplayMode } from "../utils/stem-interplay";
import type { ReactiveState } from "../utils/reactive-triggers";

// ─── Extracted routing modules ───
import { dynamicCrossfadeDuration, beatCrossfadeFrames } from "./routing/crossfade-timing";
import { findNearestBeat } from "./routing/beat-sync";
import { getModeForSection } from "./routing/shader-variety";
import { getDrumsSpaceMode } from "./routing/drums-space-router";
import { averageEnergy, selectDualBlendMode, renderMode } from "./routing/scene-utils";

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
