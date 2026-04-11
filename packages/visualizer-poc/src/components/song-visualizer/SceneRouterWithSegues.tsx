/**
 * SceneRouterWithSegues — wraps SceneRouter with segue IN/OUT crossfades.
 *
 * Extracted from the IIFE in SongVisualizer.tsx render tree
 * (pure extraction, no logic changes).
 */

import React, { useMemo } from "react";
import { SceneRouter } from "../../scenes/SceneRouter";
import { SegueCrossfade } from "../../scenes/SegueCrossfade";
import { renderScene } from "../../scenes/scene-registry";
import type { TransitionStyle, SongIdentity } from "../../data/song-identities";
import { getSegueKnowledge, type SegueKnowledge } from "../../data/dead-knowledge-graph";
import type { EnhancedFrameData, SectionBoundary, SetlistEntry, ColorPalette, VisualMode } from "../../data/types";
import type { StemSectionType } from "../../utils/stem-features";
import type { JamEvolution, JamPhaseBoundaries, JamPhase } from "../../utils/jam-evolution";
import type { JamCycleState } from "../../utils/jam-cycles";
import type { ReactiveState } from "../../utils/reactive-triggers";
import type { InterplayMode } from "../../utils/stem-interplay";
import type { VisualMemoryState } from "../../utils/visual-memory";
import type { CameraProfile } from "../../config/camera-profiles";

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
  /** Accumulated visual memory for show-level diversity scoring */
  visualMemory?: VisualMemoryState;
  /** Camera behavior profile resolved from narrative directive */
  cameraProfile?: CameraProfile;
  // Segue IN/OUT props
  segueOut?: boolean;
  segueFromMode?: VisualMode;
  segueToMode?: VisualMode;
  segueFromPalette?: ColorPalette;
  segueToPalette?: ColorPalette;
  sacredSegueInTransition?: TransitionStyle;
  sacredSegueOutTransition?: TransitionStyle;
  isSacredSegueOut: boolean;
  /** Title of the previous song (for knowledge graph segue lookup) */
  segueFromTitle?: string;
  /** Title of the next song (for knowledge graph segue lookup) */
  segueToTitle?: string;
  frame: number;
  durationInFrames: number;
  fadeFrames: number;
}

/** Map knowledge graph treatment to a SegueCrossfade TransitionStyle */
function treatmentToTransitionStyle(treatment: SegueKnowledge["treatment"]): TransitionStyle {
  switch (treatment) {
    case "explosive": return "flash";
    case "ethereal": return "morph";
    case "building": return "dissolve";
    case "seamless": return "distortion_morph";
    case "dramatic": return "void";
    default: return "dissolve";
  }
}

export const SceneRouterWithSegues: React.FC<SceneRouterWithSeguesProps> = (props) => {
  const {
    frames: f, sections, song, tempo, showSeed, jamDensity, deadAirFactor,
    era, coherenceIsLocked, drumsSpacePhase, usedShaderModes, shaderModeLastUsed,
    songIdentity, stemSection, songDuration, palette, segueIn, isSacredSegueIn,
    isInSuiteMiddle, setNumber, jamEvolution, jamPhaseBoundaries, jamCycle,
    jamPhaseShaders, climaxPhase, trackNumber, stemInterplayMode, stemDominant,
    itForceTranscendentShader, reactiveState, visualMemory, cameraProfile,
    segueOut, segueFromMode, segueToMode, segueFromPalette, segueToPalette,
    sacredSegueInTransition, sacredSegueOutTransition, isSacredSegueOut,
    segueFromTitle, segueToTitle,
    frame, durationInFrames, fadeFrames,
  } = props;

  // Knowledge graph: look up cultural significance for segue IN (prev → current)
  const segueInKnowledge = useMemo((): SegueKnowledge | undefined => {
    if (segueFromTitle && song.title) {
      return getSegueKnowledge(segueFromTitle, song.title);
    }
    return undefined;
  }, [segueFromTitle, song.title]);

  // Knowledge graph: look up cultural significance for segue OUT (current → next)
  const segueOutKnowledge = useMemo((): SegueKnowledge | undefined => {
    if (segueToTitle && song.title) {
      return getSegueKnowledge(song.title, segueToTitle);
    }
    return undefined;
  }, [song.title, segueToTitle]);

  const climaxPhaseMap: Record<string, number> = { idle: 0, build: 1, climax: 2, sustain: 3, release: 4 };
  const sceneRouter = <SceneRouter frames={f} sections={sections} song={song} tempo={tempo} seed={showSeed} jamDensity={jamDensity} deadAirMode={deadAirFactor > 0 ? "cosmic_dust" : undefined} deadAirFactor={deadAirFactor > 0 ? deadAirFactor : undefined} era={era} coherenceIsLocked={coherenceIsLocked} drumsSpacePhase={drumsSpacePhase} usedShaderModes={usedShaderModes} shaderModeLastUsed={shaderModeLastUsed} songIdentity={songIdentity} stemSection={stemSection} songDuration={songDuration} palette={palette} segueIn={segueIn} isSacredSegueIn={isSacredSegueIn} isInSuiteMiddle={isInSuiteMiddle} setNumber={setNumber} jamEvolution={jamEvolution} jamPhaseBoundaries={jamPhaseBoundaries} jamCycle={jamCycle} jamPhaseShaders={jamPhaseShaders} climaxPhase={climaxPhase} trackNumber={trackNumber} stemInterplayMode={stemInterplayMode} stemDominant={stemDominant} itForceTranscendentShader={itForceTranscendentShader} reactiveState={reactiveState} visualMemory={visualMemory} cameraProfile={cameraProfile} />;

  const effectivePalette = palette;

  // Segue IN crossfade: smooth dual-render dissolve from previous song's shader
  // Sacred segues get 50% longer crossfade for organic palette transition
  // Knowledge graph famous segues get 50% longer crossfade for their cultural weight
  const segueInFrames = isSacredSegueIn || (segueInKnowledge && segueInKnowledge.significance > 0.7) ? Math.round(fadeFrames * 1.5) : segueIn ? 900 : fadeFrames;
  if (segueIn && segueFromMode && segueFromMode !== song.defaultMode && frame < segueInFrames) {
    const progress = frame / segueInFrames;
    // Knowledge graph treatment takes priority over defaults (but curated identity
    // and sacred segue transitions still win — they're hand-tuned)
    const knowledgeStyle = segueInKnowledge && segueInKnowledge.significance > 0.7
      ? treatmentToTransitionStyle(segueInKnowledge.treatment) : undefined;
    const segueStyle = songIdentity?.transitionIn ?? sacredSegueInTransition ?? knowledgeStyle ?? (isSacredSegueIn ? "morph" : segueIn ? "distortion_morph" : "dissolve");
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
  // Knowledge graph famous segues get 50% longer crossfade for their cultural weight
  const segueOutFrames = isSacredSegueOut || (segueOutKnowledge && segueOutKnowledge.significance > 0.7) ? Math.round(fadeFrames * 1.5) : segueOut ? 900 : fadeFrames;
  if (segueOut && segueToMode && segueToMode !== song.defaultMode && frame > durationInFrames - segueOutFrames) {
    const progress = (frame - (durationInFrames - segueOutFrames)) / segueOutFrames;
    const knowledgeStyle = segueOutKnowledge && segueOutKnowledge.significance > 0.7
      ? treatmentToTransitionStyle(segueOutKnowledge.treatment) : undefined;
    const segueStyle = songIdentity?.transitionOut ?? sacredSegueOutTransition ?? knowledgeStyle ?? (isSacredSegueOut ? "morph" : segueOut ? "distortion_morph" : "dissolve");
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
