/**
 * OverlayOnlyVisualizer — stripped-down renderer for overlay-only pass.
 *
 * Renders ONLY overlays, song art, and text on transparent background.
 * Skips ALL expensive computation that SongVisualizer does:
 * - No Three.js Canvas, no GLSL shaders, no WebGL
 * - No coherence/IT detection
 * - No climax state machine
 * - No reactive triggers
 * - No jam evolution
 * - No stem analysis
 * - No camera motion
 * - No energy envelope CSS filters
 * - No era grading
 *
 * Audio snapshot is computed minimally (just energy, bass, beat for overlay reactivity).
 * Overlay rotation schedule is pre-computed once at mount.
 *
 * Target: 5-10 fps (vs 0.4 fps with full SongVisualizer).
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import type { SetlistEntry, ShowSetlist, EnhancedFrameData, ColorPalette } from "./data/types";
import type { OverlayPhaseHint } from "./data/types";
import { loadAnalysis, getSections } from "./data/analysis-loader";
import { OVERLAY_COMPONENTS } from "./data/overlay-components";
import { buildRotationSchedule } from "./data/overlay-rotation";
import { getOverlayOpacities } from "./data/overlay-rotation";
import { SELECTABLE_REGISTRY, ALWAYS_ACTIVE } from "./data/overlay-registry";
import { SongPaletteProvider } from "./data/SongPaletteContext";
import { TempoProvider } from "./data/TempoContext";
import { SilentErrorBoundary } from "./components/SilentErrorBoundary";
import { SongArtLayer } from "./components/song-visualizer/SongArtLayer";
import { ConcertInfo } from "./components/ConcertInfo";
import { buildBeatArray, computeAudioSnapshot } from "./utils/audio-reactive";
import { getShowSeed } from "./data/ShowContext";
import { lookupSongIdentity, getOrGenerateSongIdentity, setActiveShowDate } from "./data/song-identities";
import { deriveChromaPalette } from "./utils/chroma-palette";

export interface OverlayOnlyProps {
  analysis?: { meta: any; frames: EnhancedFrameData[] };
  song: SetlistEntry;
  activeOverlays?: string[];
  energyHints?: Record<string, OverlayPhaseHint>;
  show?: ShowSetlist;
  segueIn?: boolean;
}

export const OverlayOnlyVisualizer: React.FC<OverlayOnlyProps> = (props) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const analysisFrameScale = 30 / fps;

  // ─── Analysis ───
  const analysis = loadAnalysis(props as unknown as Record<string, unknown>);
  if (!analysis || analysis.frames.length === 0) {
    return <div style={{ width, height, background: "transparent" }}>
      <p style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", paddingTop: "45%" }}>
        No analysis data
      </p>
    </div>;
  }

  const f = analysis.frames;
  const sections = useMemo(() => getSections(analysis), [analysis]);
  const tempo = analysis.meta?.tempo ?? 120;

  // ─── Minimal audio snapshot (just what overlays need) ───
  const beatArray = useMemo(() => buildBeatArray(f), [f]);
  const frameIdx = Math.min(Math.max(0, Math.floor(frame * analysisFrameScale)), f.length - 1);
  const audioSnapshot = computeAudioSnapshot(f, frameIdx, beatArray, 30, tempo);

  // ─── Show seed + identity ───
  const showSeed = useMemo(
    () => props.show ? getShowSeed(props.show) : undefined,
    [props.show],
  );

  if (props.show?.date) setActiveShowDate(props.show.date);

  const songIdentity = useMemo(
    () => lookupSongIdentity(props.song.title),
    [props.song.title],
  );

  // ─── Palette ───
  const palette = useMemo((): ColorPalette | undefined => {
    if (props.song.palette) return props.song.palette;
    if (f.length > 0) return deriveChromaPalette(f, showSeed ?? 0);
    return undefined;
  }, [props.song.palette, f, showSeed]);

  // ─── Overlay selection (pre-computed once) ───
  const activeEntries = useMemo(() => {
    const entries = Object.entries(OVERLAY_COMPONENTS);
    if (!props.activeOverlays) return entries.slice(0, 30);
    const activeSet = new Set(props.activeOverlays);
    return entries.filter(([name]) => activeSet.has(name));
  }, [props.activeOverlays]);

  const rotationSchedule = useMemo(
    () => buildRotationSchedule(
      props.activeOverlays ?? SELECTABLE_REGISTRY.map(e => e.name).slice(0, 30),
      sections,
      props.song.trackId,
      showSeed,
      f,
      false,
      props.energyHints,
      props.show?.era,
      undefined,
      songIdentity,
    ),
    [sections, props.song.trackId, showSeed],
  );

  // ─── Per-frame overlay opacities ───
  const opacityMap = useMemo(
    () => getOverlayOpacities(frame, rotationSchedule, f),
    [rotationSchedule, frame],
  );

  // ─── Energy level ───
  const energy = audioSnapshot.energy;
  const energyLevel = energy < 0.15 ? "quiet" as const : energy > 0.45 ? "peak" as const : "mid" as const;

  // ─── Song art ───
  const effectiveSongArt = props.song.songArt;

  // ─── Intro factor ───
  const introFactor = Math.min(1, frame / 90);

  // ─── Hue rotation from chroma ───
  const hueRotation = (audioSnapshot.chromaHue ?? 0) * 0.5;

  return (
    <div style={{ width, height, position: "relative", overflow: "hidden", background: "transparent" }}>
      <SongPaletteProvider palette={palette}>
      <TempoProvider tempo={tempo}>

        {/* Song art card */}
        {effectiveSongArt && (
          <SilentErrorBoundary name="SongArt" resetKey={frame}>
            <SongArtLayer
              src={staticFile(effectiveSongArt)}
              suppressionFactor={1}
              hueRotation={hueRotation}
              energy={energy}
              introFactor={introFactor}
              deadAirFactor={0}
            />
          </SilentErrorBoundary>
        )}

        {/* DOM overlays only — no GLSL overlays, no Three.js Canvas */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {activeEntries.map(([name, entry]) => {
            const { Component } = entry;
            const blendMode = (entry as any).blendMode;
            const opacity = opacityMap?.[name] ?? 0;
            if (opacity < 0.01) return null;
            return (
              <div
                key={name}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity,
                  pointerEvents: "none",
                  mixBlendMode: blendMode ?? "screen",
                }}
              >
                <SilentErrorBoundary name={name}>
                  <Component frames={f} />
                </SilentErrorBoundary>
              </div>
            );
          })}
        </div>

        {/* Song title text */}
        <ConcertInfo songTitle={props.song.title} />

      </TempoProvider>
      </SongPaletteProvider>
    </div>
  );
};
