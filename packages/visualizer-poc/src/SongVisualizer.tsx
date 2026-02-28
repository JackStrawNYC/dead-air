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
import { buildRotationSchedule, getOverlayOpacities } from "./data/overlay-rotation";

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
import { SceneVideoLayer } from "./components/SceneVideoLayer";
import { SongPaletteProvider, paletteHueRotation } from "./data/SongPaletteContext";
import { TempoProvider } from "./data/TempoContext";
import { EraGrade } from "./components/EraGrade";
import { EnergyEnvelope } from "./components/EnergyEnvelope";
import { computeClimaxState, climaxModulation } from "./utils/climax-state";
import { computeAudioSnapshot } from "./utils/audio-reactive";
import { AudioSnapshotProvider } from "./data/AudioSnapshotContext";

import type { RotationSchedule } from "./data/overlay-rotation";

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
const ART_FADE_END = 300;      // 10s — fade completes (6s transition)
const ART_BG_OPACITY = 0.25;   // background wash opacity

/** Per-song psychedelic poster art with 3-phase animation */
const SongArtLayer: React.FC<{ src: string }> = ({ src }) => {
  const frame = useCurrentFrame();

  // Phase 1 (0–120): full opacity (4s title card)
  // Phase 2 (120–300): fade 1.0 → 0.15 (6s transition)
  // Phase 3 (300+): hold at 0.15 background wash
  const artOpacity = interpolate(
    frame,
    [0, ART_FULL_END, ART_FADE_END],
    [1, 1, ART_BG_OPACITY],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  // Slow Ken Burns zoom: 1.0 → 1.04 (phase 1+2), then 1.04 → 1.10 (phase 3 bg wash)
  const scale = interpolate(
    frame,
    [0, ART_FADE_END, ART_FADE_END + 9000],
    [1.0, 1.04, 1.10],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Subtle horizontal drift
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
      {/* Bottom vignette for text legibility during Phase 1 */}
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
  const rotationSchedule = useMemo(() => {
    if (!props.activeOverlays || !analysis) return null;
    const sects = getSections(analysis);
    return buildRotationSchedule(props.activeOverlays, sects, props.song.trackId, showSeed, analysis?.frames);
  }, [props.activeOverlays, analysis, props.song.trackId, showSeed]);

  // Per-frame overlay opacities (densityMult applied after climax state computed below)
  const opacityMapBase = rotationSchedule
    ? getOverlayOpacities(frame, rotationSchedule, analysis?.frames)
    : null;

  // Per-song palette hue rotation (CSS filter applied to overlay wrapper)
  const hueRotation = useMemo(
    () => props.song.palette ? paletteHueRotation(props.song.palette) : 0,
    [props.song.palette],
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

  // Compute audio snapshot ONCE per frame — shared via context with all consumers
  const frameIdx = Math.min(Math.max(0, frame), f.length - 1);
  const audioSnapshot = computeAudioSnapshot(f, frameIdx);

  // Climax/release state machine — uses precomputed energy from snapshot
  const climaxState = computeClimaxState(f, frame, sections, audioSnapshot.energy);
  const climaxMod = climaxModulation(climaxState);

  // Apply climax density multiplier to overlay opacities
  const opacityMap = opacityMapBase
    ? applyDensityMult(opacityMapBase, climaxMod.overlayDensityMult, rotationSchedule!)
    : null;

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
        <EnergyEnvelope snapshot={audioSnapshot} climaxMod={climaxMod}>
          {/* ═══ Layer 0: Base shader visualization ═══ */}
          <SceneRouter
            frames={f}
            sections={sections}
            song={props.song}
            tempo={tempo}
          />

          {/* ═══ Layer 0.5: Per-song poster art ═══ */}
          {props.song.songArt && (
            <SilentErrorBoundary name="SongArt">
              <SongArtLayer src={staticFile(props.song.songArt)} />
            </SilentErrorBoundary>
          )}

          {/* ═══ Layer 0.7: Atmospheric scene videos ═══ */}
          {props.song.sceneVideos && props.song.sceneVideos.length > 0 && (
            <SilentErrorBoundary name="SceneVideos">
              <SceneVideoLayer
                videos={props.song.sceneVideos}
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
                opacity: props.song.songArt
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
                const overlayOpacity = opacityMap ? (opacityMap[name] ?? 0) : 1;
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
        <FilmGrain opacity={interpolate(
          audioSnapshot.energy, [0.03, 0.30], [0.15, 0.06],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )} />
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
      </AudioSnapshotProvider>
      </ShowContextProvider>
    </div>
  );
};
