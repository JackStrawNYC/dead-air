/**
 * SongVisualizer — per-song composition orchestrator.
 *
 * Combines scene routing, audio playback, overlay stack, and special-prop
 * components into a layered visual composition. Delegates rendering to
 * focused sub-components in components/song-visualizer/.
 *
 * Architecture:
 *   SongVisualizer (orchestrator)
 *   ├─ SceneRouter (base shader)
 *   ├─ SongArtLayer (poster with Ken Burns)
 *   ├─ SceneVideoLayer (atmospheric AI videos)
 *   ├─ LyricTriggerLayer (word-synced curated visuals)
 *   ├─ PoeticLyrics (flowing text)
 *   ├─ DynamicOverlayStack (5-20 rotation overlays)
 *   ├─ CrowdOverlay (applause glow)
 *   ├─ SpecialPropsLayer (title, DNA, milestones, listen-for, fan quotes, grain)
 *   └─ AudioLayer (song audio + crowd ambience)
 */

import React, { useMemo } from "react";
import { staticFile, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { SceneRouter } from "./scenes/SceneRouter";
import { SceneCrossfade } from "./scenes/SceneCrossfade";
import { renderScene } from "./scenes/scene-registry";
import { OVERLAY_COMPONENTS } from "./data/overlay-components";
import { buildRotationSchedule, getOverlayOpacities } from "./data/overlay-rotation";
import type { RotationSchedule } from "./data/overlay-rotation";
import { ConcertInfo } from "./components/ConcertInfo";
import { SetlistScroll } from "./components/SetlistScroll";
import { loadAnalysis, getSections } from "./data/analysis-loader";
import type { SetlistEntry, ShowSetlist, TrackAnalysis, ColorPalette, VisualMode } from "./data/types";
import type { OverlayPhaseHint } from "./data/types";
import { ShowContextProvider, getShowSeed } from "./data/ShowContext";
import { VisualizerErrorBoundary } from "./components/VisualizerErrorBoundary";
import { SilentErrorBoundary } from "./components/SilentErrorBoundary";
import { SceneVideoLayer, computeMediaWindows } from "./components/SceneVideoLayer";
import { LyricTriggerLayer } from "./components/LyricTriggerLayer";
import { PoeticLyrics } from "./components/PoeticLyrics";
import { resolveLyricTriggers, loadAlignmentWords } from "./data/lyric-trigger-resolver";
import { resolveMediaForSong } from "./data/media-resolver";
import { SongPaletteProvider } from "./data/SongPaletteContext";
import { EraGrade } from "./components/EraGrade";
import { EnergyEnvelope } from "./components/EnergyEnvelope";
import { computeClimaxState, climaxModulation } from "./utils/climax-state";
import { computeAudioSnapshot, buildBeatArray } from "./utils/audio-reactive";
import { calibrateEnergy } from "./utils/energy";
import { AudioSnapshotProvider } from "./data/AudioSnapshotContext";
import { computeJamEvolution } from "./utils/jam-evolution";
import { computeMediaSuppression, computeArtSuppressionFactor } from "./utils/media-suppression";
import { computeSegueHueRotation } from "./utils/segue-blend";
import { detectCrowdMoments } from "./data/crowd-detector";
import { CrowdOverlay } from "./components/CrowdOverlay";
import { CameraMotion } from "./components/CameraMotion";
import { computeVisualFocus } from "./utils/visual-focus";
import { computeCounterpoint, resetCounterpoint } from "./utils/visual-counterpoint";

// Extracted sub-components
import { SongArtLayer } from "./components/song-visualizer/SongArtLayer";
import { DynamicOverlayStack } from "./components/song-visualizer/DynamicOverlayStack";
import { SpecialPropsLayer } from "./components/song-visualizer/SpecialPropsLayer";
import { AudioLayer } from "./components/song-visualizer/AudioLayer";
import {
  songStatsData,
  milestonesMap,
  narrationData,
  fanReviewsData,
  mediaCatalog,
} from "./components/song-visualizer/show-data-loader";

const FADE_FRAMES = 90; // 3 seconds at 30fps

/** Apply climax density multiplier to overlay opacities (skips always-active) */
function applyDensityMult(
  opacities: Record<string, number>,
  mult: number,
  schedule: RotationSchedule,
): Record<string, number> {
  if (mult === 1) return opacities;
  const alwaysSet = new Set(schedule.alwaysActive);
  const result: Record<string, number> = {};
  for (const [name, opacity] of Object.entries(opacities)) {
    result[name] = alwaysSet.has(name) ? opacity : opacity * mult;
  }
  return result;
}

export interface SongVisualizerProps {
  analysis?: TrackAnalysis;
  meta?: TrackAnalysis["meta"];
  frames?: TrackAnalysis["frames"];
  song: SetlistEntry;
  activeOverlays?: string[];
  energyHints?: Record<string, OverlayPhaseHint>;
  show?: ShowSetlist;
  segueIn?: boolean;
  segueOut?: boolean;
  segueFromPalette?: ColorPalette;
  segueToPalette?: ColorPalette;
  /** Visual mode of the previous song (for segue crossfade) */
  segueFromMode?: VisualMode;
  /** Visual mode of the next song (for segue crossfade) */
  segueToMode?: VisualMode;
}

export const SongVisualizer: React.FC<SongVisualizerProps> = (props) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  // ─── Data loading & analysis ───
  const analysis = loadAnalysis(props as unknown as Record<string, unknown>);

  const activeSet = useMemo(
    () => props.activeOverlays ? new Set(props.activeOverlays) : null,
    [props.activeOverlays],
  );

  const activeEntries = useMemo(() => {
    const entries = Object.entries(OVERLAY_COMPONENTS);
    if (!activeSet) return entries.slice(0, 50);
    return entries.filter(([name]) => activeSet.has(name));
  }, [activeSet]);

  const showSeed = useMemo(
    () => props.show ? getShowSeed(props.show) : undefined,
    [props.show],
  );

  const isDrumsSpace = useMemo(() => {
    const title = props.song.title.toLowerCase();
    return title.includes("drums") || title.includes("space") ||
      title === "drums / space" || title === "drums/space";
  }, [props.song.title]);

  const comesFromDrumsSpace = useMemo(() => {
    if (!props.show || !props.segueIn) return false;
    const songs = props.show.songs;
    const idx = songs.findIndex((s) => s.trackId === props.song.trackId);
    if (idx <= 0) return false;
    const prev = songs[idx - 1].title.toLowerCase();
    return prev.includes("drums") || prev.includes("space");
  }, [props.show, props.segueIn, props.song.trackId]);

  const energyCalibration = useMemo(
    () => analysis ? calibrateEnergy(analysis.frames) : undefined,
    [analysis],
  );

  // ─── Overlay scheduling ───
  const rotationSchedule = useMemo(() => {
    if (!props.activeOverlays || !analysis) return null;
    const sects = getSections(analysis);
    return buildRotationSchedule(props.activeOverlays, sects, props.song.trackId, showSeed, analysis?.frames, isDrumsSpace, props.energyHints);
  }, [props.activeOverlays, analysis, props.song.trackId, showSeed, isDrumsSpace, props.energyHints]);

  const opacityMapBase = rotationSchedule
    ? getOverlayOpacities(frame, rotationSchedule, analysis?.frames, energyCalibration)
    : null;

  // ─── Palette hue rotation ───
  const hueRotation = useMemo(() => {
    return computeSegueHueRotation(
      props.song.palette,
      !!props.segueIn, !!props.segueOut,
      props.segueFromPalette, props.segueToPalette,
      frame, durationInFrames, FADE_FRAMES,
    );
  }, [props.song.palette, props.segueIn, props.segueOut, props.segueFromPalette, props.segueToPalette, frame, durationInFrames]);

  // ─── Media resolution ───
  const resolvedMedia = useMemo(() => {
    if (!mediaCatalog) return null;
    return resolveMediaForSong(props.song.title, mediaCatalog, showSeed ?? 0, props.song.trackId);
  }, [props.song.title, props.song.trackId, showSeed]);

  const variantArt = useMemo(() => {
    const base = props.song.songArt;
    const count = props.song.artVariantCount;
    if (!base || !count || count <= 0 || !showSeed) return null;
    const variantIdx = (showSeed % count) + 1;
    return base.replace(/\.png$/, `-v${variantIdx}.png`);
  }, [props.song.songArt, props.song.artVariantCount, showSeed]);

  const effectiveSongArt = variantArt ?? props.song.songArt ?? resolvedMedia?.songArt ?? undefined;
  const effectiveMedia = (props.song.sceneVideos?.length) ? undefined : resolvedMedia?.media;
  const effectiveLegacyVideos = (props.song.sceneVideos?.length) ? props.song.sceneVideos : undefined;

  // ─── Lyrics ───
  const alignmentWords = useMemo(
    () => loadAlignmentWords(props.song.trackId),
    [props.song.trackId],
  );

  const lyricTriggerWindows = useMemo(() => {
    return resolveLyricTriggers(props.song.title, alignmentWords, 30);
  }, [props.song.title, alignmentWords]);

  const triggerSuppressedRanges = useMemo(
    () => lyricTriggerWindows.map((w) => ({ start: w.frameStart, end: w.frameEnd })),
    [lyricTriggerWindows],
  );

  // ─── No-data fallback ───
  if (!analysis || analysis.frames.length === 0) {
    return (
      <div style={{ width, height, backgroundColor: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontFamily: "monospace", fontSize: 24 }}>
        No analysis data — run: pnpm analyze
      </div>
    );
  }

  // ─── Audio-reactive state (per-frame) ───
  const sections = getSections(analysis);
  const tempo = analysis?.meta?.tempo ?? 120;
  const f = analysis.frames;

  const crowdMoments = useMemo(() => detectCrowdMoments(f), [f]);
  const beatArray = useMemo(() => buildBeatArray(f), [f]);
  const frameIdx = Math.min(Math.max(0, frame), f.length - 1);
  const audioSnapshot = computeAudioSnapshot(f, frameIdx, beatArray, 30, tempo);
  const climaxState = computeClimaxState(f, frame, sections, audioSnapshot.energy);
  const climaxMod = climaxModulation(climaxState);
  const counterpoint = computeCounterpoint(audioSnapshot, climaxState.phase, frame);

  const jamEvolution = useMemo(
    () => computeJamEvolution(f, frame, isDrumsSpace),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f, Math.floor(frame / 30), isDrumsSpace],
  );

  const combinedDensityMult = Math.max(0.75, climaxMod.overlayDensityMult * (jamEvolution.isLongJam ? jamEvolution.densityMult : 1));
  const opacityMap = opacityMapBase ? applyDensityMult(opacityMapBase, combinedDensityMult, rotationSchedule!) : null;

  // ─── Media suppression ───
  const mediaWindows = useMemo(
    () => computeMediaWindows(effectiveLegacyVideos, effectiveMedia, sections, f, props.song.trackId, showSeed),
    [effectiveLegacyVideos, effectiveMedia, sections, f, props.song.trackId, showSeed],
  );
  const activeMediaWindow = mediaWindows.find((w) => frame >= w.frameStart - 150 && frame < w.frameEnd + 150);
  const activeLyricTrigger = lyricTriggerWindows.find((w) => frame >= w.frameStart - 150 && frame < w.frameEnd + 120);
  const mediaSuppression = computeMediaSuppression(frame, activeMediaWindow, activeLyricTrigger);

  const SUPPRESS_FADE = 90;
  const artSuppressionFactor = useMemo(
    () => computeArtSuppressionFactor(frame, activeMediaWindow, activeLyricTrigger, SUPPRESS_FADE),
    [frame, activeMediaWindow, activeLyricTrigger],
  );

  // ─── Visual focus system ───
  const isVideoActive = !!activeMediaWindow && frame >= activeMediaWindow.frameStart && frame < activeMediaWindow.frameEnd;
  const focusState = computeVisualFocus(climaxState.phase, climaxState.intensity, isVideoActive, frame);

  // Derive energy level hint for overlay hard cap
  const energyLevel: "quiet" | "mid" | "peak" = audioSnapshot.energy < 0.10 ? "quiet" : audioSnapshot.energy > 0.25 ? "peak" : "mid";

  // ─── Fade in/out ───
  // Start fade-out 1 frame before the end of analyzed audio to ensure visuals are fully
  // gone by the time audio ends (analysis rounds up via ceil, creating a +1 frame mismatch)
  const fadeIn = props.segueIn ? 1 : interpolate(frame, [0, FADE_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOutStart = durationInFrames - FADE_FRAMES - 1;
  const fadeOut = props.segueOut ? 1 : interpolate(frame, [fadeOutStart, durationInFrames - 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(fadeIn, fadeOut);

  // ─── Render ───
  return (
    <div style={{ width, height, position: "relative", overflow: "hidden", background: "#000" }}>
      <ShowContextProvider show={props.show}>
      <AudioSnapshotProvider snapshot={audioSnapshot}>
      <VisualizerErrorBoundary>
      <div style={{ position: "absolute", inset: 0, opacity }}>
        <CameraMotion frames={f} jamEvolution={jamEvolution} bass={audioSnapshot.bass} cameraFreeze={counterpoint.cameraFreeze}>
        <EraGrade>
        <EnergyEnvelope snapshot={audioSnapshot} climaxMod={climaxMod} jamColorTemp={jamEvolution.isLongJam ? jamEvolution.colorTemperature : undefined} calibration={energyCalibration} counterpointSatMult={counterpoint.saturationMult}>
          <div style={{ position: "absolute", inset: 0, opacity: focusState.shaderOpacity }}>
          <SilentErrorBoundary name="SceneRouter">
            {(() => {
              const sceneRouter = <SceneRouter frames={f} sections={sections} song={props.song} tempo={tempo} seed={showSeed} />;
              const palette = props.song.palette;

              // Segue IN crossfade: blend from previous song's shader
              if (props.segueIn && props.segueFromMode && props.segueFromMode !== props.song.defaultMode && frame < FADE_FRAMES) {
                const progress = frame / FADE_FRAMES;
                return (
                  <SceneCrossfade
                    progress={progress}
                    outgoing={renderScene(props.segueFromMode, { frames: f, sections, palette: props.segueFromPalette ?? palette, tempo })}
                    incoming={sceneRouter}
                  />
                );
              }

              // Segue OUT crossfade: blend into next song's shader
              if (props.segueOut && props.segueToMode && props.segueToMode !== props.song.defaultMode && frame > durationInFrames - FADE_FRAMES) {
                const progress = (frame - (durationInFrames - FADE_FRAMES)) / FADE_FRAMES;
                return (
                  <SceneCrossfade
                    progress={progress}
                    outgoing={sceneRouter}
                    incoming={renderScene(props.segueToMode, { frames: f, sections, palette: props.segueToPalette ?? palette, tempo })}
                  />
                );
              }

              return sceneRouter;
            })()}
          </SilentErrorBoundary>
          </div>

          {effectiveSongArt && (
            <SilentErrorBoundary name="SongArt">
              <SongArtLayer src={staticFile(effectiveSongArt)} suppressionFactor={artSuppressionFactor} hueRotation={hueRotation} energy={audioSnapshot.energy} climaxIntensity={climaxState.intensity} focusOpacity={focusState.artOpacity} />
            </SilentErrorBoundary>
          )}

          {(effectiveLegacyVideos || effectiveMedia) && (
            <SilentErrorBoundary name="SceneVideos">
              <SceneVideoLayer videos={effectiveLegacyVideos} media={effectiveMedia} sections={sections} frames={f} trackId={props.song.trackId} showSeed={showSeed} hueRotation={hueRotation} suppressedRanges={triggerSuppressedRanges} />
            </SilentErrorBoundary>
          )}

          {/* Lyrics disabled — LyricTriggerLayer and PoeticLyrics removed */}

          <DynamicOverlayStack
            activeEntries={activeEntries}
            opacityMap={opacityMap}
            mediaSuppression={mediaSuppression}
            hueRotation={hueRotation}
            tempo={tempo}
            palette={props.song.palette}
            frames={f}
            focusSuppression={focusState.overlayOpacity}
            energyLevel={energyLevel}
          />

          {crowdMoments.length > 0 && (
            <SilentErrorBoundary name="CrowdOverlay">
              <SongPaletteProvider palette={props.song.palette}>
                <CrowdOverlay moments={crowdMoments} />
              </SongPaletteProvider>
            </SilentErrorBoundary>
          )}

          <ConcertInfo />
          <SetlistScroll frames={f} currentSong={props.song.title} />

          <SpecialPropsLayer
            songTitle={props.song.title}
            setNumber={props.song.set}
            trackNumber={props.song.trackNumber}
            trackId={props.song.trackId}
            isSegue={!!(props.segueIn && !comesFromDrumsSpace)}
            energy={audioSnapshot.energy}
            palette={props.song.palette}
            songStats={songStatsData}
            milestonesMap={milestonesMap}
            narrationData={narrationData}
            fanReviews={fanReviewsData}
            showSeed={showSeed}
          />
        </EnergyEnvelope>
        </EraGrade>
        </CameraMotion>
      </div>
      </VisualizerErrorBoundary>

      <AudioLayer
        audioFile={props.song.audioFile}
        snapshot={audioSnapshot}
        isDrumsSpace={isDrumsSpace}
      />
      </AudioSnapshotProvider>
      </ShowContextProvider>
    </div>
  );
};
