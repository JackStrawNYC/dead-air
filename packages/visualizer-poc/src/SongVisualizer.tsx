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
import { LyricTriggerLayer } from "./components/LyricTriggerLayer";
import { resolveLyricTriggers, loadAlignmentWords } from "./data/lyric-trigger-resolver";
import { resolveMediaForSong } from "./data/media-resolver";
import { SongPaletteProvider, paletteHueRotation } from "./data/SongPaletteContext";
import { TempoProvider } from "./data/TempoContext";
import { EraGrade } from "./components/EraGrade";
import { EnergyEnvelope } from "./components/EnergyEnvelope";
import { computeClimaxState, climaxModulation } from "./utils/climax-state";
import { computeAudioSnapshot } from "./utils/audio-reactive";
import { calibrateEnergy } from "./utils/energy";
import { AudioSnapshotProvider } from "./data/AudioSnapshotContext";
import { CrowdAmbience } from "./components/CrowdAmbience";
import { SongDNA } from "./components/SongDNA";
import type { SongStats } from "./components/SongDNA";
import { MilestoneCard } from "./components/MilestoneCard";
import { PoeticLyrics } from "./components/PoeticLyrics";
import { ListenFor } from "./components/ListenFor";
import type { Milestone } from "./data/types";
import { computeJamEvolution } from "./utils/jam-evolution";
import { blendPalettes } from "./utils/segue-detection";
import type { ColorPalette } from "./data/types";
import { detectCrowdMoments } from "./data/crowd-detector";
import { CrowdOverlay } from "./components/CrowdOverlay";
import { CameraMotion } from "./components/CameraMotion";
import { FanQuoteOverlay } from "./components/FanQuoteOverlay";
import type { FanReview } from "./components/FanQuoteOverlay";

// Song stats — real Grateful Dead performance data
let songStatsData: Record<string, SongStats> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../data/song-stats.json");
  songStatsData = raw?.songs ?? null;
} catch {
  // Stats not available yet
}

// Milestones — historically significant moments at this show
let milestonesMap: Record<string, Milestone> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../data/milestones.json");
  if (raw?.milestones) {
    milestonesMap = {};
    for (const m of raw.milestones as Milestone[]) {
      milestonesMap[m.trackId] = m;
    }
  }
} catch {
  // Milestones not available yet
}

// Narration data — "listen for" moments and song context
interface NarrationSong {
  listenFor: string[];
  context?: string;
  songHistory?: string;
}
let narrationData: Record<string, NarrationSong> | null = null;
let fanReviewsData: FanReview[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../data/narration.json");
  narrationData = raw?.songs ?? null;
  fanReviewsData = raw?.fanReviews ?? [];
} catch {
  // Narration not available yet
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
const OVERLAY_GATE_END = 420;  // 14s — overlays hidden until intro elements clear
// Art wash opacity is now energy-reactive: 0.55 (quiet) → 0.25 (peak)

interface SongArtProps {
  src: string;
  /** Smooth 0-1 suppression factor: 1 = full art, 0.45 = dimmed for curated media */
  suppressionFactor: number;
  /** Hue rotation in degrees (palette consistency with overlays/scene) */
  hueRotation?: number;
  /** Rolling energy (0-1) for breath modulation */
  energy?: number;
}

/** Per-song poster art — the visual foundation of each song.
 *  Intro: full opacity title card (4s), then settles to energy-reactive background wash.
 *  Quiet passages: art rises (contemplative). Peak energy: art fades, visuals dominate.
 */
const SongArtLayer: React.FC<SongArtProps> = ({ src, suppressionFactor, hueRotation = 0, energy = 0 }) => {
  const frame = useCurrentFrame();

  // Energy-reactive wash: quiet → 0.55, peak → 0.25
  const energyWash = interpolate(
    energy,
    [0.03, 0.30],
    [0.55, 0.25],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Base target: full during intro, then settle to energy-reactive wash
  const baseOpacity = interpolate(
    frame,
    [0, ART_FULL_END, ART_FADE_END],
    [1, 1, energyWash],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  const artOpacity = baseOpacity * suppressionFactor;

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
        filter: hueRotation !== 0 ? `hue-rotate(${hueRotation.toFixed(1)}deg)` : undefined,
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
  /** Per-overlay energy phase hints (from intelligent curation) */
  energyHints?: Record<string, import("./data/types").OverlayPhaseHint>;
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

  // Songs emerging from Drums/Space deserve their reveal moment — show title + poster
  // even during a segue-in (the crowd erupting when they recognize the song)
  const comesFromDrumsSpace = useMemo(() => {
    if (!props.show || !props.segueIn) return false;
    const songs = props.show.songs;
    const idx = songs.findIndex((s) => s.trackId === props.song.trackId);
    if (idx <= 0) return false;
    const prev = songs[idx - 1].title.toLowerCase();
    return prev.includes("drums") || prev.includes("space");
  }, [props.show, props.segueIn, props.song.trackId]);

  // Per-song energy calibration — maps this recording's dynamic range to full visual range
  const energyCalibration = useMemo(
    () => analysis ? calibrateEnergy(analysis.frames) : undefined,
    [analysis],
  );

  const rotationSchedule = useMemo(() => {
    if (!props.activeOverlays || !analysis) return null;
    const sects = getSections(analysis);
    return buildRotationSchedule(props.activeOverlays, sects, props.song.trackId, showSeed, analysis?.frames, isDrumsSpace, props.energyHints);
  }, [props.activeOverlays, analysis, props.song.trackId, showSeed, isDrumsSpace, props.energyHints]);

  // Per-frame overlay opacities (densityMult applied after climax state computed below)
  const opacityMapBase = rotationSchedule
    ? getOverlayOpacities(frame, rotationSchedule, analysis?.frames, energyCalibration)
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

  // Variant art selection: if variants exist, pick based on seed
  const variantArt = useMemo(() => {
    const base = props.song.songArt;
    const count = props.song.artVariantCount;
    if (!base || !count || count <= 0 || !showSeed) return null;
    const variantIdx = (showSeed % count) + 1;
    // e.g., assets/song-art/s2t08.png → assets/song-art/s2t08-v2.png
    return base.replace(/\.png$/, `-v${variantIdx}.png`);
  }, [props.song.songArt, props.song.artVariantCount, showSeed]);

  // Explicit overrides in setlist.json take priority over auto-resolution
  const effectiveSongArt = variantArt ?? props.song.songArt ?? resolvedMedia?.songArt ?? undefined;
  const effectiveMedia = (props.song.sceneVideos?.length)
    ? undefined    // legacy path — use SceneVideo[] directly
    : resolvedMedia?.media;
  const effectiveLegacyVideos = (props.song.sceneVideos?.length)
    ? props.song.sceneVideos
    : undefined;

  // ── Lyric trigger windows ──
  const lyricTriggerWindows = useMemo(() => {
    const words = loadAlignmentWords(props.song.trackId);
    return resolveLyricTriggers(props.song.title, words, 30);
  }, [props.song.trackId, props.song.title]);

  // Frame ranges where lyric triggers suppress SceneVideoLayer
  const triggerSuppressedRanges = useMemo(
    () => lyricTriggerWindows.map((w) => ({ start: w.frameStart, end: w.frameEnd })),
    [lyricTriggerWindows],
  );

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

  // Detect crowd noise moments (once per song)
  const crowdMoments = useMemo(() => detectCrowdMoments(f), [f]);

  // Compute audio snapshot ONCE per frame — shared via context with all consumers
  const frameIdx = Math.min(Math.max(0, frame), f.length - 1);
  const audioSnapshot = computeAudioSnapshot(f, frameIdx);

  // Climax/release state machine — uses precomputed energy from snapshot
  const climaxState = computeClimaxState(f, frame, sections, audioSnapshot.energy);
  const climaxMod = climaxModulation(climaxState);

  // Jam evolution — phase detection for long jams (10+ min, or 3+ min for Drums/Space)
  const jamEvolution = useMemo(
    () => computeJamEvolution(f, frame, isDrumsSpace),
    // Recompute every ~30 frames (1 second) for performance
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f, Math.floor(frame / 30), isDrumsSpace],
  );

  // Combined density multiplier: climax × jam evolution (floor at 0.75 — overlays should always be visible)
  const combinedDensityMult = Math.max(0.75, climaxMod.overlayDensityMult * (jamEvolution.isLongJam ? jamEvolution.densityMult : 1));

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
    (w) => frame >= w.frameStart - 150 && frame < w.frameEnd + 150, // fade detection range
  );
  // Also check if a lyric trigger is currently active (highest-priority curated media)
  const activeLyricTrigger = lyricTriggerWindows.find(
    (w) => frame >= w.frameStart - 150 && frame < w.frameEnd + 120, // 150/120 = LyricTriggerLayer FADE_IN/OUT_FRAMES
  );
  const mediaActive = !!activeMediaWindow || !!activeLyricTrigger;
  const mediaCurated = activeLyricTrigger ? true : (activeMediaWindow ? activeMediaWindow.media.priority <= 1 : false);
  // When curated media is playing, icons yield — they fill the gaps, not compete
  const mediaSuppression = activeLyricTrigger ? 0.15 : mediaCurated ? 0.25 : mediaActive ? 0.40 : 1.0;

  // Smooth suppression factor for song art — crossfades with video fade envelope
  // instead of snapping when video windows start/end
  const SUPPRESS_FADE = 90; // 3-second smooth transition
  const artSuppressionFactor = useMemo(() => {
    if (activeLyricTrigger) {
      // Smooth in/out around lyric trigger
      const fadeIn = Math.min(1, Math.max(0, (frame - (activeLyricTrigger.frameStart - 150)) / 150));
      const fadeOut = Math.min(1, Math.max(0, (activeLyricTrigger.frameEnd + 120 - frame) / 120));
      const envelope = Math.min(fadeIn, fadeOut);
      return 1 - envelope * 0.75; // dims to 0.25 at peak
    }
    if (activeMediaWindow) {
      const isCurated = activeMediaWindow.media.priority <= 1;
      const fadeIn = Math.min(1, Math.max(0, (frame - (activeMediaWindow.frameStart - SUPPRESS_FADE)) / SUPPRESS_FADE));
      const fadeOut = Math.min(1, Math.max(0, (activeMediaWindow.frameEnd + SUPPRESS_FADE - frame) / SUPPRESS_FADE));
      const envelope = Math.min(fadeIn, fadeOut);
      // Smoothstep for natural feel
      const smooth = envelope * envelope * (3 - 2 * envelope);
      const dimTarget = isCurated ? 0.60 : 0.80;
      return 1 - smooth * (1 - dimTarget);
    }
    return 1;
  }, [frame, activeMediaWindow, activeLyricTrigger]);

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
        <CameraMotion frames={f}>
        <EraGrade>
        <EnergyEnvelope snapshot={audioSnapshot} climaxMod={climaxMod} jamColorTemp={jamEvolution.isLongJam ? jamEvolution.colorTemperature : undefined} calibration={energyCalibration}>
          {/* ═══ Layer 0: Base shader visualization ═══ */}
          <SceneRouter
            frames={f}
            sections={sections}
            song={props.song}
            tempo={tempo}
            seed={showSeed}
          />

          {/* ═══ Layer 0.5: Per-song poster art (persistent background wash) ═══ */}
          {effectiveSongArt && (
            <SilentErrorBoundary name="SongArt">
              <SongArtLayer src={staticFile(effectiveSongArt)} suppressionFactor={artSuppressionFactor} hueRotation={hueRotation} energy={audioSnapshot.energy} />
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
                suppressedRanges={triggerSuppressedRanges}
              />
            </SilentErrorBoundary>
          )}

          {/* ═══ Layer 0.8: Lyric-triggered curated visuals ═══ */}
          {lyricTriggerWindows.length > 0 && (
            <SilentErrorBoundary name="LyricTriggers">
              <LyricTriggerLayer windows={lyricTriggerWindows} />
            </SilentErrorBoundary>
          )}

          {/* ═══ Layer 0.9: Poetic lyrics — flowing text synced to word-level alignment ═══ */}
          <SilentErrorBoundary name="PoeticLyrics">
            <PoeticLyrics
              alignmentWords={loadAlignmentWords(props.song.trackId)}
              triggerWindows={triggerSuppressedRanges}
              sections={sections}
              frames={f}
            />
          </SilentErrorBoundary>

          {/* ═══ Dynamic overlay layers (1-10) ═══ */}
          {/* Hidden during title card, then fade in over 3 seconds (skip gate during segue-in) */}
          <TempoProvider tempo={tempo}>
          <SongPaletteProvider palette={props.song.palette}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: interpolate(
                  frame,
                  [OVERLAY_GATE_END, OVERLAY_GATE_END + 90],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
                ),
                filter: hueRotation !== 0 ? `hue-rotate(${hueRotation.toFixed(1)}deg)` : undefined,
              }}
            >
              {activeEntries.map(([name, { Component }]) => {
                const overlayOpacity = Math.min(1, (opacityMap ? (opacityMap[name] ?? 0) : 1) * mediaSuppression);
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
            </div>
          </SongPaletteProvider>
          </TempoProvider>

          {/* ═══ Crowd noise overlay — warm glow during applause ═══ */}
          {crowdMoments.length > 0 && (
            <SilentErrorBoundary name="CrowdOverlay">
              <SongPaletteProvider palette={props.song.palette}>
                <CrowdOverlay moments={crowdMoments} />
              </SongPaletteProvider>
            </SilentErrorBoundary>
          )}

          {/* ═══ ConcertInfo + SetlistScroll — own timing, outside overlay gate ═══ */}
          <ConcertInfo />
          <SetlistScroll frames={f} currentSong={props.song.title} />
        </EnergyEnvelope>
        </EraGrade>
        </CameraMotion>

        {/* ═══ Always-active: special-prop components ═══ */}
        <SongTitle
          title={props.song.title}
          setNumber={props.song.set}
          trackNumber={props.song.trackNumber}
          isSegue={props.segueIn && !comesFromDrumsSpace}
        />
        {/* Song DNA stats card — appears after song art settles */}
        {songStatsData && songStatsData[props.song.trackId] && (
          <SilentErrorBoundary name="SongDNA">
            <SongDNA stats={songStatsData[props.song.trackId]} />
          </SilentErrorBoundary>
        )}
        {/* Milestone card — historic moments */}
        {milestonesMap && milestonesMap[props.song.trackId] && (
          <SilentErrorBoundary name="MilestoneCard">
            <MilestoneCard milestone={milestonesMap[props.song.trackId]} />
          </SilentErrorBoundary>
        )}
        {/* Listen For card — contextual "listen for" moments */}
        {narrationData && narrationData[props.song.trackId] && (
          <SilentErrorBoundary name="ListenFor">
            <SongPaletteProvider palette={props.song.palette}>
              <ListenFor
                items={narrationData[props.song.trackId].listenFor}
                context={narrationData[props.song.trackId].context}
              />
            </SongPaletteProvider>
          </SilentErrorBoundary>
        )}
        {/* Fan quote overlay — archive.org reviews every 3rd song */}
        {fanReviewsData.length > 0 && (
          <SilentErrorBoundary name="FanQuoteOverlay">
            <FanQuoteOverlay
              reviews={fanReviewsData}
              trackNumber={props.song.trackNumber}
              seed={showSeed}
            />
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
