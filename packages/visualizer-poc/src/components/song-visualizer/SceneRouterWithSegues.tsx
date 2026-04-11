/**
 * SceneRouterWithSegues — wraps SceneRouter with segue IN/OUT crossfades.
 *
 * Extracted from the IIFE in SongVisualizer.tsx render tree
 * (pure extraction, no logic changes).
 */

import React from "react";
import { SceneRouter } from "../../scenes/SceneRouter";
import { SegueCrossfade } from "../../scenes/SegueCrossfade";
import { renderScene } from "../../scenes/scene-registry";
import type { TransitionStyle, SongIdentity } from "../../data/song-identities";
import type { EnhancedFrameData, SectionBoundary, SetlistEntry, ColorPalette, VisualMode } from "../../data/types";
import type { StemSectionType } from "../../utils/stem-features";
import type { JamEvolution, JamPhaseBoundaries, JamPhase } from "../../utils/jam-evolution";
import type { JamCycleState } from "../../utils/jam-cycles";
import type { ReactiveState } from "../../utils/reactive-triggers";
import type { InterplayMode } from "../../utils/stem-interplay";

export interface SceneRouterWithSeguesProps {
  frames: EnhancedFrameData[];
  sections: SectionBoundary[];
  song: SetlistEntry;
  tempo: number;
  showSeed?: number;
  jamDensity: number;
  deadAirFactor: number;
  era?: string;
  coherenceIsLocked: boolean;
  drumsSpacePhase?: string;
  usedShaderModes?: Map<VisualMode, number>;
  shaderModeLastUsed?: Map<VisualMode, number>;
  songIdentity?: SongIdentity;
  stemSection: StemSectionType;
  songDuration?: number;
  palette?: ColorPalette;
  segueIn?: boolean;
  isSacredSegueIn: boolean;
  isInSuiteMiddle: boolean;
  setNumber?: number;
  jamEvolution: JamEvolution;
  jamPhaseBoundaries: JamPhaseBoundaries | null;
  jamCycle: JamCycleState | null;
  jamPhaseShaders: Record<JamPhase, VisualMode> | undefined;
  climaxPhase: number;
  trackNumber: number;
  stemInterplayMode: InterplayMode;
  stemDominant: string;
  itForceTranscendentShader: boolean;
  reactiveState: ReactiveState;
  // Segue IN/OUT props
  segueOut?: boolean;
  segueFromMode?: VisualMode;
  segueToMode?: VisualMode;
  segueFromPalette?: ColorPalette;
  segueToPalette?: ColorPalette;
  sacredSegueInTransition?: TransitionStyle;
  sacredSegueOutTransition?: TransitionStyle;
  isSacredSegueOut: boolean;
  frame: number;
  durationInFrames: number;
  fadeFrames: number;
}

export const SceneRouterWithSegues: React.FC<SceneRouterWithSeguesProps> = (props) => {
  const {
    frames: f, sections, song, tempo, showSeed, jamDensity, deadAirFactor,
    era, coherenceIsLocked, drumsSpacePhase, usedShaderModes, shaderModeLastUsed,
    songIdentity, stemSection, songDuration, palette, segueIn, isSacredSegueIn,
    isInSuiteMiddle, setNumber, jamEvolution, jamPhaseBoundaries, jamCycle,
    jamPhaseShaders, climaxPhase, trackNumber, stemInterplayMode, stemDominant,
    itForceTranscendentShader, reactiveState,
    segueOut, segueFromMode, segueToMode, segueFromPalette, segueToPalette,
    sacredSegueInTransition, sacredSegueOutTransition, isSacredSegueOut,
    frame, durationInFrames, fadeFrames,
  } = props;

  const climaxPhaseMap: Record<string, number> = { idle: 0, build: 1, climax: 2, sustain: 3, release: 4 };
  const sceneRouter = <SceneRouter frames={f} sections={sections} song={song} tempo={tempo} seed={showSeed} jamDensity={jamDensity} deadAirMode={deadAirFactor > 0 ? "cosmic_dust" : undefined} deadAirFactor={deadAirFactor > 0 ? deadAirFactor : undefined} era={era} coherenceIsLocked={coherenceIsLocked} drumsSpacePhase={drumsSpacePhase} usedShaderModes={usedShaderModes} shaderModeLastUsed={shaderModeLastUsed} songIdentity={songIdentity} stemSection={stemSection} songDuration={songDuration} palette={palette} segueIn={segueIn} isSacredSegueIn={isSacredSegueIn} isInSuiteMiddle={isInSuiteMiddle} setNumber={setNumber} jamEvolution={jamEvolution} jamPhaseBoundaries={jamPhaseBoundaries} jamCycle={jamCycle} jamPhaseShaders={jamPhaseShaders} climaxPhase={climaxPhase} trackNumber={trackNumber} stemInterplayMode={stemInterplayMode} stemDominant={stemDominant} itForceTranscendentShader={itForceTranscendentShader} reactiveState={reactiveState} />;

  const effectivePalette = palette;

  // Segue IN crossfade: smooth dual-render dissolve from previous song's shader
  // Sacred segues get 50% longer crossfade for organic palette transition
  const segueInFrames = isSacredSegueIn ? Math.round(fadeFrames * 1.5) : segueIn ? 900 : fadeFrames;
  if (segueIn && segueFromMode && segueFromMode !== song.defaultMode && frame < segueInFrames) {
    const progress = frame / segueInFrames;
    const segueStyle = songIdentity?.transitionIn ?? sacredSegueInTransition ?? (isSacredSegueIn ? "morph" : segueIn ? "distortion_morph" : "dissolve");
    return (
      <SegueCrossfade
        progress={progress}
        outgoing={renderScene(segueFromMode, { frames: f, sections, palette: segueFromPalette ?? effectivePalette, tempo, jamDensity })}
        incoming={sceneRouter}
        style={segueStyle}
      />
    );
  }

  // Segue OUT crossfade: smooth dual-render dissolve into next song's shader
  const segueOutFrames = isSacredSegueOut ? Math.round(fadeFrames * 1.5) : segueOut ? 900 : fadeFrames;
  if (segueOut && segueToMode && segueToMode !== song.defaultMode && frame > durationInFrames - segueOutFrames) {
    const progress = (frame - (durationInFrames - segueOutFrames)) / segueOutFrames;
    const segueStyle = songIdentity?.transitionOut ?? sacredSegueOutTransition ?? (isSacredSegueOut ? "morph" : segueOut ? "distortion_morph" : "dissolve");
    return (
      <SegueCrossfade
        progress={progress}
        outgoing={sceneRouter}
        incoming={renderScene(segueToMode, { frames: f, sections, palette: segueToPalette ?? effectivePalette, tempo, jamDensity })}
        style={segueStyle}
      />
    );
  }

  return sceneRouter;
};
