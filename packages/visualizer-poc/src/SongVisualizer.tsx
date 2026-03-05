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
import { OVERLAY_COMPONENTS } from "./data/overlay-components";
import { buildRotationSchedule, getOverlayOpacities } from "./data/overlay-rotation";
import type { RotationSchedule } from "./data/overlay-rotation";
import { ConcertInfo } from "./components/ConcertInfo";
import { SetlistScroll } from "./components/SetlistScroll";
import { loadAnalysis, getSections } from "./data/analysis-loader";
import type { SetlistEntry, ShowSetlist, TrackAnalysis, ColorPalette } from "./data/types";
import type { OverlayPhaseHint } from "./data/types";
import { ShowContextProvider, getShowSeed } from "./data/ShowContext";
import { VisualizerErrorBoundary } from "./components/VisualizerErrorBoundary";
import { SilentErrorBoundary } from "./components/SilentErrorBoundary";
import { SceneVideoLayer, computeMediaWindows } from "./components/SceneVideoLayer";
import { LyricTriggerLayer } from "./components/LyricTriggerLayer";
import { resolveLyricTriggers, loadAlignmentWords } from "./data/lyric-trigger-resolver";
import { resolveMediaForSong } from "./data/media-resolver";
import { SongPaletteProvider, paletteHueRotation } from "./data/SongPaletteContext";
import { EraGrade } from "./components/EraGrade";
import { EnergyEnvelope } from "./components/EnergyEnvelope";
import { computeClimaxState, climaxModulation } from "./utils/climax-state";
import { computeAudioSnapshot } from "./utils/audio-reactive";
import { calibrateEnergy } from "./utils/energy";
import { AudioSnapshotProvider } from "./data/AudioSnapshotContext";
import { PoeticLyrics } from "./components/PoeticLyrics";
import { computeJamEvolution } from "./utils/jam-evolution";
import { blendPalettes } from "./utils/segue-detection";
import { detectCrowdMoments } from "./data/crowd-detector";
import { CrowdOverlay } from "./components/CrowdOverlay";
import { CameraMotion } from "./components/CameraMotion";

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
    if (!activeSet) return entries;
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
    if (!props.song.palette) return 0;
    if (props.segueIn && props.segueFromPalette && frame < FADE_FRAMES) {
      const progress = frame / FADE_FRAMES;
      const blended = blendPalettes(props.segueFromPalette, props.song.palette, progress);
      return paletteHueRotation(blended);
    }
    if (props.segueOut && props.segueToPalette && frame > durationInFrames - FADE_FRAMES) {
      const progress = (frame - (durationInFrames - FADE_FRAMES)) / FADE_FRAMES;
      const blended = blendPalettes(props.song.palette, props.segueToPalette, progress);
      return paletteHueRotation(blended);
    }
    return paletteHueRotation(props.song.palette);
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

  // ─── Lyric triggers ───
  const lyricTriggerWindows = useMemo(() => {
    const words = loadAlignmentWords(props.song.trackId);
    return resolveLyricTriggers(props.song.title, words, 30);
  }, [props.song.trackId, props.song.title]);

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
  const tempo = analysis.meta.tempo ?? 120;
  const f = analysis.frames;

  const crowdMoments = useMemo(() => detectCrowdMoments(f), [f]);
  const frameIdx = Math.min(Math.max(0, frame), f.length - 1);
  const audioSnapshot = computeAudioSnapshot(f, frameIdx);
  const climaxState = computeClimaxState(f, frame, sections, audioSnapshot.energy);
  const climaxMod = climaxModulation(climaxState);

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
  const mediaSuppression = activeLyricTrigger ? 0.15 : (activeMediaWindow?.media.priority ?? 99) <= 1 ? 0.25 : activeMediaWindow ? 0.40 : 1.0;

  const SUPPRESS_FADE = 90;
  const artSuppressionFactor = useMemo(() => {
    if (activeLyricTrigger) {
      const fadeIn = Math.min(1, Math.max(0, (frame - (activeLyricTrigger.frameStart - 150)) / 150));
      const fadeOut = Math.min(1, Math.max(0, (activeLyricTrigger.frameEnd + 120 - frame) / 120));
      return 1 - Math.min(fadeIn, fadeOut) * 0.75;
    }
    if (activeMediaWindow) {
      const isCurated = activeMediaWindow.media.priority <= 1;
      const fadeIn = Math.min(1, Math.max(0, (frame - (activeMediaWindow.frameStart - SUPPRESS_FADE)) / SUPPRESS_FADE));
      const fadeOut = Math.min(1, Math.max(0, (activeMediaWindow.frameEnd + SUPPRESS_FADE - frame) / SUPPRESS_FADE));
      const envelope = Math.min(fadeIn, fadeOut);
      const smooth = envelope * envelope * (3 - 2 * envelope);
      return 1 - smooth * (1 - (isCurated ? 0.60 : 0.80));
    }
    return 1;
  }, [frame, activeMediaWindow, activeLyricTrigger]);

  // ─── Fade in/out ───
  const fadeIn = props.segueIn ? 1 : interpolate(frame, [0, FADE_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = props.segueOut ? 1 : interpolate(frame, [durationInFrames - FADE_FRAMES, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(fadeIn, fadeOut);

  // ─── Render ───
  return (
    <div style={{ width, height, position: "relative", overflow: "hidden", background: "#000" }}>
      <ShowContextProvider show={props.show}>
      <AudioSnapshotProvider snapshot={audioSnapshot}>
      <VisualizerErrorBoundary>
      <div style={{ position: "absolute", inset: 0, opacity }}>
        <CameraMotion frames={f}>
        <EraGrade>
        <EnergyEnvelope snapshot={audioSnapshot} climaxMod={climaxMod} jamColorTemp={jamEvolution.isLongJam ? jamEvolution.colorTemperature : undefined} calibration={energyCalibration}>
          <SceneRouter frames={f} sections={sections} song={props.song} tempo={tempo} seed={showSeed} />

          {effectiveSongArt && (
            <SilentErrorBoundary name="SongArt">
              <SongArtLayer src={staticFile(effectiveSongArt)} suppressionFactor={artSuppressionFactor} hueRotation={hueRotation} energy={audioSnapshot.energy} />
            </SilentErrorBoundary>
          )}

          {(effectiveLegacyVideos || effectiveMedia) && (
            <SilentErrorBoundary name="SceneVideos">
              <SceneVideoLayer videos={effectiveLegacyVideos} media={effectiveMedia} sections={sections} frames={f} trackId={props.song.trackId} showSeed={showSeed} hueRotation={hueRotation} suppressedRanges={triggerSuppressedRanges} />
            </SilentErrorBoundary>
          )}

          {lyricTriggerWindows.length > 0 && (
            <SilentErrorBoundary name="LyricTriggers">
              <LyricTriggerLayer windows={lyricTriggerWindows} />
            </SilentErrorBoundary>
          )}

          <SilentErrorBoundary name="PoeticLyrics">
            <PoeticLyrics alignmentWords={loadAlignmentWords(props.song.trackId)} triggerWindows={triggerSuppressedRanges} sections={sections} frames={f} />
          </SilentErrorBoundary>

          <DynamicOverlayStack
            activeEntries={activeEntries}
            opacityMap={opacityMap}
            mediaSuppression={mediaSuppression}
            hueRotation={hueRotation}
            tempo={tempo}
            palette={props.song.palette}
            frames={f}
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
        </EnergyEnvelope>
        </EraGrade>
        </CameraMotion>

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
