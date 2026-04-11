/**
 * ReactiveShaderRouter — extracted from SceneRouter.tsx
 *
 * Handles reactive trigger shader swaps (crossfade in, hold, crossfade out)
 * and the exit crossfade when a trigger ends.
 *
 * Returns React.ReactNode if a reactive trigger or exit crossfade applies,
 * or null to fall through to subsequent routing stages.
 */

import React from "react";
import { SceneCrossfade } from "../SceneCrossfade";
import type {
  EnhancedFrameData,
  SectionBoundary,
  VisualMode,
  SetlistEntry,
  ColorPalette,
} from "../../data/types";
import type { SongIdentity } from "../../data/song-identities";
import type { StemSectionType } from "../../utils/stem-features";
import type { ReactiveState } from "../../utils/reactive-triggers";
import { seededLCG as seededRandom } from "../../utils/seededRandom";
import { renderMode } from "./scene-utils";
import { getModeForSection } from "./shader-variety";

/**
 * Evaluate reactive trigger state and render the appropriate crossfade or hold.
 *
 * ─── REACTIVE TRIGGER: mid-section shader swap on audio events ───
 * Fast 15-frame crossfade into reactive shader, then hold, then crossfade back.
 * Coherence lock always wins (suppressed upstream). Dual shader disabled during hold.
 *
 * Reactive triggers must respect the song's curated preferredModes — otherwise
 * they can pick shaders with hardcoded color schemes that clash with the song's
 * palette (e.g. cosmic_voyage's heavy nebula colors firing on a cool psychedelic
 * song produces stuck-color clumps). We INTERSECT the trigger's suggested pool
 * with preferredModes; if the intersection is empty, suppress the trigger.
 *
 * DEAD AIR: triggers are suppressed entirely. Crowd applause has impulsive
 * transients that fire reactive triggers as if the band were still playing.
 *
 * CALM MODE: also suppress reactive triggers if the song has explicit
 * sectionOverrides — the user curated those for a reason and reactive triggers
 * shouldn't override them. (Note: explicit override path returns early above,
 * but this is defensive in case override returns null/undefined for some sections.)
 */
export function renderReactiveTrigger(
  reactiveState: ReactiveState | undefined,
  coherenceIsLocked: boolean | undefined,
  deadAirFactor: number | undefined,
  song: SetlistEntry,
  songIdentity: SongIdentity | undefined,
  seed: number | undefined,
  currentSectionIdx: number,
  sections: SectionBoundary[],
  era: string | undefined,
  usedShaderModes: Map<VisualMode, number> | undefined,
  stemSection: StemSectionType | undefined,
  frames: EnhancedFrameData[],
  songDuration: number | undefined,
  setNumber: number | undefined,
  trackNumber: number | undefined,
  shaderModeLastUsed: Map<VisualMode, number> | undefined,
  stemDominant: string | undefined,
  palette: ColorPalette | undefined,
  tempo: number | undefined,
  jamDensity: number | undefined,
  frame: number,
  _renderMode: typeof renderMode,
  _getModeForSection: typeof getModeForSection,
  lastReactiveModeRef: React.MutableRefObject<VisualMode | null>,
  reactiveExitRef: React.MutableRefObject<{ mode: VisualMode; exitFrame: number; crossfadeFrames: number } | null>,
): React.ReactNode | null {
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
    const regularMode = _getModeForSection(song, currentSectionIdx, sections, seed, era, false, usedShaderModes, songIdentity, stemSection, frames, songDuration, setNumber, trackNumber, shaderModeLastUsed, stemDominant);
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
          outgoing={_renderMode(regularMode, frames, sections, palette, tempo, undefined, jamDensity)}
          incoming={_renderMode(reactiveMode, frames, sections, palette, tempo, undefined, jamDensity)}
        />
      );
    }
    // During hold — render reactive shader
    lastReactiveModeRef.current = reactiveMode;
    return <>{_renderMode(reactiveMode, frames, sections, palette, tempo, undefined, jamDensity)}</>;
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

  return null;
}

/**
 * Render the reactive exit crossfade if one is active.
 * Returns React.ReactNode if an exit crossfade is in progress, or null to fall through.
 */
export function renderReactiveExitCrossfade(
  reactiveExitRef: React.MutableRefObject<{ mode: VisualMode; exitFrame: number; crossfadeFrames: number } | null>,
  frame: number,
  currentMode: VisualMode,
  frames: EnhancedFrameData[],
  sections: SectionBoundary[],
  palette: ColorPalette | undefined,
  tempo: number | undefined,
  jamDensity: number | undefined,
  _renderMode: typeof renderMode,
): React.ReactNode | null {
  // Render reactive exit crossfade if active
  if (reactiveExitRef.current && frame < reactiveExitRef.current.exitFrame + reactiveExitRef.current.crossfadeFrames) {
    const { mode: exitMode, exitFrame, crossfadeFrames } = reactiveExitRef.current;
    const progress = (frame - exitFrame) / crossfadeFrames;
    return (
      <SceneCrossfade
        progress={progress}
        outgoing={_renderMode(exitMode, frames, sections, palette, tempo, undefined, jamDensity)}
        incoming={_renderMode(currentMode, frames, sections, palette, tempo, undefined, jamDensity)}
      />
    );
  }
  return null;
}
