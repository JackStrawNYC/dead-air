/**
 * SongVisualizer — per-song composition component.
 * Combines scene routing with audio playback + dynamic overlay stack.
 * 90-frame fade-in at start, 90-frame fade-out at end.
 * Used by Root.tsx for each song composition.
 *
 * Overlays are selected per-song by the overlay scheduler. If no activeOverlays
 * prop is provided, ALL overlays render (backwards compatible).
 */

import React, { useMemo } from "react";
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
import type { SetlistEntry, TrackAnalysis } from "./data/types";

const FADE_FRAMES = 90; // 3 seconds at 30fps

// ─── Song Art Phases ───
const ART_FULL_END = 900;      // 30s at 30fps — full opacity title card
const ART_FADE_END = 1080;     // 36s — fade completes
const ART_BG_OPACITY = 0.15;   // background wash opacity

/** Per-song psychedelic poster art with 3-phase animation */
const SongArtLayer: React.FC<{ src: string }> = ({ src }) => {
  const frame = useCurrentFrame();

  // Phase 1 (0–900): full opacity
  // Phase 2 (900–1080): fade 1.0 → 0.15
  // Phase 3 (1080+): hold at 0.15
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

  // Slow Ken Burns zoom: 1.0 → 1.08 (phase 1+2), then 1.08 → 1.15 (phase 3)
  const scale = interpolate(
    frame,
    [0, ART_FADE_END, ART_FADE_END + 9000],
    [1.0, 1.08, 1.15],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Subtle horizontal drift
  const translateX = interpolate(
    frame,
    [0, ART_FADE_END + 9000],
    [0, -15],
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
  const rotationSchedule = useMemo(() => {
    if (!props.activeOverlays || !analysis) return null;
    const sects = getSections(analysis);
    return buildRotationSchedule(props.activeOverlays, sects, props.song.trackId);
  }, [props.activeOverlays, analysis, props.song.trackId]);

  // Per-frame overlay opacities
  const opacityMap = rotationSchedule
    ? getOverlayOpacities(frame, rotationSchedule)
    : null;

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

  // Fade in/out for set break transitions
  const fadeIn = interpolate(frame, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - FADE_FRAMES, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <div style={{ width, height, position: "relative", overflow: "hidden", background: "#000" }}>
      <div style={{ position: "absolute", inset: 0, opacity }}>
        {/* ═══ Layer 0: Base shader visualization ═══ */}
        <SceneRouter
          frames={f}
          sections={sections}
          song={props.song}
          tempo={tempo}
        />

        {/* ═══ Layer 0.5: Per-song poster art ═══ */}
        {props.song.songArt && (
          <SongArtLayer src={staticFile(props.song.songArt)} />
        )}

        {/* ═══ Dynamic overlay layers (1-10) ═══ */}
        {/* Hidden during poster art phase, then fade in over 6 seconds */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: props.song.songArt
              ? interpolate(frame, [ART_FULL_END, ART_FULL_END + 180], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.cubic),
                })
              : 1,
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
                <Component frames={f} />
              </div>
            );
          })}
          <ConcertInfo songTitle={props.song.title} />
          <SetlistScroll frames={f} currentSong={props.song.title} />
        </div>

        {/* ═══ Always-active: special-prop components ═══ */}
        <SongTitle
          title={props.song.title}
          setNumber={props.song.set}
          trackNumber={props.song.trackNumber}
        />
        <FilmGrain opacity={0.06} />
      </div>
      <Audio src={staticFile(`audio/${props.song.audioFile}`)} />
    </div>
  );
};
