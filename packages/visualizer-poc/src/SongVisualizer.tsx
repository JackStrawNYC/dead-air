/**
 * SongVisualizer — per-song composition component.
 * Combines scene routing with audio playback + dynamic overlay stack.
 * 90-frame fade-in at start, 90-frame fade-out at end.
 * Used by Root.tsx for each song composition.
 *
 * Overlays are selected per-song by the overlay scheduler. If no activeOverlays
 * prop is provided, ALL overlays render (backwards compatible).
 */

import React, { Suspense, useMemo } from "react";
import { Audio, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { SceneRouter } from "./scenes/SceneRouter";
import { OVERLAY_COMPONENTS } from "./data/overlay-components";
import { buildRotationSchedule, getOverlayOpacities, HERO_OVERLAY_NAMES } from "./data/overlay-rotation";

// Special-prop components that stay hardcoded
import { SongTitle } from "./components/SongTitle";
import { ConcertInfo } from "./components/ConcertInfo";
import { SetlistScroll } from "./components/SetlistScroll";
import { FilmGrain } from "./components/FilmGrain";

import { loadAnalysis, getSections } from "./data/analysis-loader";
import type { SetlistEntry, ShowSetlist, TrackAnalysis } from "./data/types";
import { ShowContextProvider, getShowSeed } from "./data/ShowContext";
import { VisualizerErrorBoundary } from "./components/VisualizerErrorBoundary";
import { SilentErrorBoundary } from "./components/SilentErrorBoundary";
import { SceneVideoLayer, computeMediaWindows } from "./components/SceneVideoLayer";
import { resolveMediaForSong } from "./data/media-resolver";
import { SongPaletteProvider, paletteHueRotation } from "./data/SongPaletteContext";
import { TempoProvider } from "./data/TempoContext";
import { EraGrade } from "./components/EraGrade";
import { EnergyEnvelope } from "./components/EnergyEnvelope";
import { computeClimaxState, climaxModulation } from "./utils/climax-state";
import { computeAudioSnapshot } from "./utils/audio-reactive";
import { AudioSnapshotProvider } from "./data/AudioSnapshotContext";
import { CrowdAmbience } from "./components/CrowdAmbience";
import { SongDNA } from "./components/SongDNA";
import type { SongStats } from "./components/SongDNA";
import { computeJamEvolution } from "./utils/jam-evolution";
import { blendPalettes } from "./utils/segue-detection";
import type { ColorPalette } from "./data/types";

// Song stats — real Grateful Dead performance data
let songStatsData: Record<string, SongStats> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../data/song-stats.json");
  songStatsData = raw?.songs ?? null;
} catch {
  // Stats not available yet
}

import type { RotationSchedule } from "./data/overlay-rotation";

// Media catalog — safe import with fallback for when catalog doesn't exist yet
let mediaCatalog: { version: number; assets: Array<{ id: string; path: string; type: "image" | "video"; songKey: string; category?: "song" | "general"; tags: string[] }> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../data/image-library.json");
  mediaCatalog = raw?.assets?.length ? raw : null;
} catch {
  // Catalog not yet generated — auto-resolution disabled
}

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

// ─── Song Art Phases ───
const ART_FULL_END = 120;      // 4s at 30fps — full opacity title card
const ART_FADE_END = 300;      // 10s — fade to background wash level
const ART_BG_OPACITY = 0.25;   // persistent background wash opacity

interface SongArtProps {
  src: string;
  /** When curated media is active, suppress art so it doesn't clash */
  mediaActive: boolean;
  /** Curated media (song-specific) dims art more than general filler */
  mediaCurated: boolean;
}

/** Per-song poster art — the visual foundation of each song.
 *  Intro: full opacity title card (4s), then settles to background wash.
 *  Suppressed to 0% when curated media (images/videos) is active.
 */
const SongArtLayer: React.FC<SongArtProps> = ({ src, mediaActive, mediaCurated }) => {
  const frame = useCurrentFrame();

  // Base target: full during intro, then settle to background wash
  const baseOpacity = interpolate(
    frame,
    [0, ART_FULL_END, ART_FADE_END],
    [1, 1, ART_BG_OPACITY],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  // Curated media: dim song art but keep a trace for visual continuity.
  const suppressionTarget = mediaCurated ? 0.25 : mediaActive ? 0.7 : 1;
  const artOpacity = baseOpacity * suppressionTarget;

  if (artOpacity < 0.01) return null;

  // Slow Ken Burns zoom + drift throughout
  const scale = interpolate(
    frame,
    [0, ART_FADE_END, ART_FADE_END + 9000],
    [1.0, 1.04, 1.10],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const translateX = interpolate(
    frame,
    [0, ART_FADE_END + 9000],
    [0, -10],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: artOpacity,
        overflow: "hidden",
      }}
    >
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 55%",
          transform: `scale(${scale}) translateX(${translateX}px)`,
          willChange: "transform",
        }}
      />
      {/* Bottom vignette for text legibility during intro */}
      {frame < ART_FADE_END && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "40%",
            background: "linear-gradient(transparent, rgba(0,0,0,0.6))",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};

export interface SongVisualizerProps {
  /** Track analysis (injected via --props or calculateMetadata) */
  analysis?: TrackAnalysis;
  meta?: TrackAnalysis["meta"];
  frames?: TrackAnalysis["frames"];
  /** Setlist entry for this song */
  song: SetlistEntry;
  /** Active overlay names (from overlay schedule). If undefined, all overlays render. */
  activeOverlays?: string[];
  /** Full show setlist (for ShowContext) */
  show?: ShowSetlist;
  /** Previous song segues into this one — skip fade-in + song art */
  segueIn?: boolean;
  /** This song segues into the next — skip fade-out */
  segueOut?: boolean;
  /** Previous song's palette (for segue-in blending) */
  segueFromPalette?: ColorPalette;
  /** Next song's palette (for segue-out blending) */
  segueToPalette?: ColorPalette;
}

export const SongVisualizer: React.FC<SongVisualizerProps> = (props) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  // Load analysis (supports both nested and flat prop structures)
  const analysis = loadAnalysis(props as unknown as Record<string, unknown>);

  // Build active set — if no activeOverlays prop, render all (backwards compatible)
  const activeSet = useMemo(
    () =>
      props.activeOverlays
        ? new Set(props.activeOverlays)
        : null,
    [props.activeOverlays],
  );

  // Pre-compute filtered overlay entries (stable across frames)
  const activeEntries = useMemo(() => {
    const entries = Object.entries(OVERLAY_COMPONENTS);
    if (!activeSet) return entries; // All overlays
    return entries.filter(([name]) => activeSet.has(name));
  }, [activeSet]);

  // Build rotation schedule (once per song, only when activeOverlays provided)
  const showSeed = useMemo(
    () => props.show ? getShowSeed(props.show) : undefined,
    [props.show],
  );

  // Detect Drums/Space — the psychedelic centerpiece deserves special treatment
  const isDrumsSpace = useMemo(() => {
    const title = props.song.title.toLowerCase();
    return title.includes("drums") || title.includes("space") ||
      title === "drums / space" || title === "drums/space";
  }, [props.song.title]);

  const rotationSchedule = useMemo(() => {
    if (!props.activeOverlays || !analysis) return null;
    const sects = getSections(analysis);
    return buildRotationSchedule(props.activeOverlays, sects, props.song.trackId, showSeed, analysis?.frames, isDrumsSpace);
  }, [props.activeOverlays, analysis, props.song.trackId, showSeed, isDrumsSpace]);

  // Per-frame overlay opacities (densityMult applied after climax state computed below)
  const opacityMapBase = rotationSchedule
    ? getOverlayOpacities(frame, rotationSchedule, analysis?.frames)
    : null;

  // Per-song palette hue rotation (CSS filter applied to overlay wrapper)
  // During segues, blend palette from prev/next song for smooth color transition
  const hueRotation = useMemo(() => {
    if (!props.song.palette) return 0;

    // Segue-in: blend from previous song's palette over first FADE_FRAMES
    if (props.segueIn && props.segueFromPalette && frame < FADE_FRAMES) {
      const progress = frame / FADE_FRAMES;
      const blended = blendPalettes(props.segueFromPalette, props.song.palette, progress);
      return paletteHueRotation(blended);
    }

    // Segue-out: blend toward next song's palette over last FADE_FRAMES
    if (props.segueOut && props.segueToPalette && frame > durationInFrames - FADE_FRAMES) {
      const progress = (frame - (durationInFrames - FADE_FRAMES)) / FADE_FRAMES;
      const blended = blendPalettes(props.song.palette, props.segueToPalette, progress);
      return paletteHueRotation(blended);
    }

    return paletteHueRotation(props.song.palette);
  }, [props.song.palette, props.segueIn, props.segueOut, props.segueFromPalette, props.segueToPalette, frame, durationInFrames]);

  // Auto-resolve media from catalog (poster + prioritized media list)
  const resolvedMedia = useMemo(() => {
    if (!mediaCatalog) return null;
    return resolveMediaForSong(
      props.song.title,
      mediaCatalog,
      showSeed ?? 0,
      props.song.trackId,
    );
  }, [props.song.title, props.song.trackId, showSeed]);

  // Explicit overrides in setlist.json take priority over auto-resolution
  const effectiveSongArt = props.song.songArt ?? resolvedMedia?.songArt ?? undefined;
  const effectiveMedia = (props.song.sceneVideos?.length)
    ? undefined    // legacy path — use SceneVideo[] directly
    : resolvedMedia?.media;
  const effectiveLegacyVideos = (props.song.sceneVideos?.length)
    ? props.song.sceneVideos
    : undefined;

  if (!analysis || analysis.frames.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          backgroundColor: "#0a0a0f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#444",
          fontFamily: "monospace",
          fontSize: 24,
        }}
      >
        No analysis data — run: pnpm analyze
      </div>
    );
  }

  const sections = getSections(analysis);
  const tempo = analysis.meta.tempo ?? 120;
  const f = analysis.frames;

  // Compute audio snapshot ONCE per frame — shared via context with all consumers
  const frameIdx = Math.min(Math.max(0, frame), f.length - 1);
  const audioSnapshot = computeAudioSnapshot(f, frameIdx);

  // Climax/release state machine — uses precomputed energy from snapshot
  const climaxState = computeClimaxState(f, frame, sections, audioSnapshot.energy);
  const climaxMod = climaxModulation(climaxState);

  // Jam evolution — phase detection for long jams (10+ min)
  const jamEvolution = useMemo(
    () => computeJamEvolution(f, frame),
    // Recompute every ~30 frames (1 second) for performance
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f, Math.floor(frame / 30)],
  );

  // Combined density multiplier: climax × jam evolution
  const combinedDensityMult = climaxMod.overlayDensityMult * (jamEvolution.isLongJam ? jamEvolution.densityMult : 1);

  // Apply combined density multiplier to overlay opacities
  const opacityMap = opacityMapBase
    ? applyDensityMult(opacityMapBase, combinedDensityMult, rotationSchedule!)
    : null;

  // ── Media suppression: reduce overlay opacity when curated media is active ──
  const mediaWindows = useMemo(
    () => computeMediaWindows(effectiveLegacyVideos, effectiveMedia, sections, f, props.song.trackId, showSeed),
    [effectiveLegacyVideos, effectiveMedia, sections, f, props.song.trackId, showSeed],
  );
  const activeMediaWindow = mediaWindows.find(
    (w) => frame >= w.frameStart - 270 && frame < w.frameEnd + 270, // 270 = CURATED_FADE_FRAMES
  );
  const mediaActive = !!activeMediaWindow;
  const mediaCurated = activeMediaWindow ? activeMediaWindow.media.priority <= 1 : false;
  const mediaSuppression = mediaCurated ? 0.55 : mediaActive ? 0.75 : 1.0;

  // Fade in/out for set break transitions (segues skip the fade)
  const fadeIn = props.segueIn ? 1 : interpolate(frame, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = props.segueOut ? 1 : interpolate(
    frame,
    [durationInFrames - FADE_FRAMES, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <div style={{ width, height, position: "relative", overflow: "hidden", background: "#000" }}>
      <ShowContextProvider show={props.show}>
      <AudioSnapshotProvider snapshot={audioSnapshot}>
      <VisualizerErrorBoundary>
      <div style={{ position: "absolute", inset: 0, opacity }}>
        <EraGrade>
        <EnergyEnvelope snapshot={audioSnapshot} climaxMod={climaxMod} jamColorTemp={jamEvolution.isLongJam ? jamEvolution.colorTemperature : undefined}>
          {/* ═══ Layer 0: Base shader visualization ═══ */}
          <SceneRouter
            frames={f}
            sections={sections}
            song={props.song}
            tempo={tempo}
          />

          {/* ═══ Layer 0.5: Per-song poster art (persistent background wash) ═══ */}
          {effectiveSongArt && (
            <SilentErrorBoundary name="SongArt">
              <SongArtLayer src={staticFile(effectiveSongArt)} mediaActive={mediaActive} mediaCurated={mediaCurated} />
            </SilentErrorBoundary>
          )}

          {/* ═══ Layer 0.7: Atmospheric scene videos ═══ */}
          {(effectiveLegacyVideos || effectiveMedia) && (
            <SilentErrorBoundary name="SceneVideos">
              <SceneVideoLayer
                videos={effectiveLegacyVideos}
                media={effectiveMedia}
                sections={sections}
                frames={f}
                trackId={props.song.trackId}
                showSeed={showSeed}
                hueRotation={hueRotation}
              />
            </SilentErrorBoundary>
          )}

          {/* ═══ Dynamic overlay layers (1-10) ═══ */}
          {/* Hidden during title card, then fade in over 3 seconds */}
          <TempoProvider tempo={tempo}>
          <SongPaletteProvider palette={props.song.palette}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: effectiveSongArt
                  ? interpolate(frame, [ART_FULL_END, ART_FULL_END + 90], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                      easing: Easing.out(Easing.cubic),
                    })
                  : 1,
                filter: hueRotation !== 0 ? `hue-rotate(${hueRotation.toFixed(1)}deg)` : undefined,
              }}
            >
              {activeEntries.map(([name, { Component }]) => {
                // Hero overlays get 1.8x opacity boost so concrete animated objects
                // (bears, bolts, balloons) are clearly visible through the opacity stack
                const heroBoost = HERO_OVERLAY_NAMES.has(name) ? 1.8 : 1.0;
                const overlayOpacity = Math.min(1, (opacityMap ? (opacityMap[name] ?? 0) : 1) * mediaSuppression * heroBoost);
                if (overlayOpacity < 0.01) return null; // Skip render — invisible overlays waste ~450 renders/sec
                return (
                  <div
                    key={name}
                    style={{
                      position: "absolute",
                      inset: 0,
                      opacity: overlayOpacity,
                      pointerEvents: "none",
                    }}
                  >
                    <Suspense fallback={null}>
                      <SilentErrorBoundary name={name}>
                        <Component frames={f} />
                      </SilentErrorBoundary>
                    </Suspense>
                  </div>
                );
              })}
              <ConcertInfo />
              <SetlistScroll frames={f} currentSong={props.song.title} />
            </div>
          </SongPaletteProvider>
          </TempoProvider>
        </EnergyEnvelope>
        </EraGrade>

        {/* ═══ Always-active: special-prop components ═══ */}
        <SongTitle
          title={props.song.title}
          setNumber={props.song.set}
          trackNumber={props.song.trackNumber}
        />
        {/* Song DNA stats card — appears after song art settles (skip during segue-in) */}
        {!props.segueIn && songStatsData && songStatsData[props.song.trackId] && (
          <SilentErrorBoundary name="SongDNA">
            <SongDNA stats={songStatsData[props.song.trackId]} />
          </SilentErrorBoundary>
        )}
        <FilmGrain opacity={interpolate(
          audioSnapshot.energy, [0.03, 0.30], [0.10, 0.04],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )} energy={audioSnapshot.energy} />

      </div>
      </VisualizerErrorBoundary>

      {/* Audio outside error boundary would crash the entire render if file is missing.
          Wrap in its own error boundary so a missing file produces silence, not a crash. */}
      <SilentErrorBoundary name="SongAudio">
        <Audio
          src={staticFile(`audio/${props.song.audioFile}`)}
          volume={1}
        />
      </SilentErrorBoundary>

      {/* ═══ Crowd ambience — subtle live room atmosphere ═══ */}
      {/* During Drums/Space: near-silent crowd — the audience holds its breath */}
      <SilentErrorBoundary name="CrowdAmbience">
        <CrowdAmbience
          snapshot={audioSnapshot}
          baseVolume={isDrumsSpace ? 0.005 : 0.02}
          peakVolume={isDrumsSpace ? 0.02 : 0.07}
        />
      </SilentErrorBoundary>
      </AudioSnapshotProvider>
      </ShowContextProvider>
    </div>
  );
};
