/**
 * ShowIntro — Two-phase intro sequence:
 *   Phase 1: Dead Air brand VIDEO (7s) with its own audio
 *   Phase 2: Crossfade to cosmic_voyage shader scene (generative nebula emergence)
 *            with venue/date text overlay, then fade to black
 *
 * Total duration: ~15.5s (465 frames at 30fps)
 */

import React, { useMemo } from "react";
import {
  Audio,
  Img,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { CosmicVoyageScene } from "../scenes/CosmicVoyageScene";
import type { EnhancedFrameData, ColorPalette } from "../data/types";

// ─── Timing constants (frames at 30fps) ───
const POSTER_START = 210;          // 7s — scene begins crossfading in
const CROSSFADE_FRAMES = 60;      // 2s — video → scene visual crossfade
const FADE_OUT_FRAMES = 45;       // 1.5s — scene fades to black at end
const AUDIO_CROSSFADE_START = 195; // 6.5s — video audio starts fading out (0.5s before visual)

// Duration of Phase 2 in frames (from POSTER_START to end)
const PHASE2_FRAMES = 255;        // ~8.5s

/** Generate synthetic audio frames for the intro nebula emergence.
 *  RMS ramps from 0 → 0.3 over first 150 frames, holds at 0.3.
 *  All other features at minimal/defaults. Creates: thick fog → slow emergence → gentle drift.
 */
function generateSyntheticFrames(count: number): EnhancedFrameData[] {
  const frames: EnhancedFrameData[] = [];
  for (let i = 0; i < count; i++) {
    const rms = i < 150
      ? (i / 150) * 0.3
      : 0.3;
    frames.push({
      rms,
      centroid: 0.2,
      onset: 0,
      beat: false,
      sub: 0.1,
      low: 0.1,
      mid: 0.1,
      high: 0.05,
      chroma: [0.3, 0.1, 0.1, 0.1, 0.2, 0.1, 0.1, 0.1, 0.2, 0.1, 0.1, 0.1],
      contrast: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
      flatness: 0.3,
    });
  }
  return frames;
}

export interface ShowIntroProps {
  /** Path to Dead Air brand video (relative to public/) */
  videoSrc: string;
  /** Path to show poster art (relative to public/) */
  posterSrc: string;
  /** Show date display string */
  date: string;
  /** Venue display string */
  venue: string;
  /** Era palette for generative scene coloring */
  eraPalette?: ColorPalette;
}

export const ShowIntro: React.FC<ShowIntroProps> = ({
  videoSrc,
  date,
  venue,
  eraPalette,
}) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  // Synthetic frames for cosmic_voyage scene (generated once)
  const syntheticFrames = useMemo(() => generateSyntheticFrames(PHASE2_FRAMES), []);

  // ─── Phase 1: Brand video ───
  // Full opacity for 7s, then fades out over crossfade
  const videoOpacity = interpolate(
    frame,
    [POSTER_START, POSTER_START + CROSSFADE_FRAMES],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  // Video audio: full volume, starts fading out slightly before the visual crossfade
  const videoAudioVolume = interpolate(
    frame,
    [AUDIO_CROSSFADE_START, POSTER_START + CROSSFADE_FRAMES],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // ─── Phase 2: Generative nebula scene ───
  // Fades in during crossfade, holds, then fades to black at end
  const sceneFadeIn = interpolate(
    frame,
    [POSTER_START, POSTER_START + CROSSFADE_FRAMES],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) },
  );
  const sceneFadeOut = interpolate(
    frame,
    [durationInFrames - FADE_OUT_FRAMES, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );
  const sceneOpacity = Math.min(sceneFadeIn, sceneFadeOut);

  // Text appearance: fade in after scene is established, fade out with scene
  const textOpacity = interpolate(
    frame,
    [POSTER_START + CROSSFADE_FRAMES + 30, POSTER_START + CROSSFADE_FRAMES + 60],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  ) * sceneFadeOut;

  // Default era palette: cosmic deep blue/purple for classic era
  const palette = eraPalette ?? { primary: 210, secondary: 270 };

  return (
    <div style={{ width, height, position: "relative", overflow: "hidden", background: "#000" }}>
      {/* Layer 1: Show poster as intro backdrop */}
      <div style={{ position: "absolute", inset: 0, opacity: sceneOpacity, overflow: "hidden", background: "#0a0812" }}>
        <Img
          src={staticFile("assets/song-art/show-poster.png")}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
        />
        {/* Bottom vignette for legibility */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "35%",
            background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
            pointerEvents: "none",
          }}
        />
        {/* Venue + date text over scene */}
        {(venue || date) && (
          <div
            style={{
              position: "absolute",
              bottom: "8%",
              left: 0,
              right: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              pointerEvents: "none",
              opacity: textOpacity,
            }}
          >
            {venue && (
              <div
                style={{
                  fontFamily: "'Georgia', serif",
                  fontSize: 22,
                  fontWeight: 600,
                  color: "rgba(255, 255, 255, 0.85)",
                  textShadow: "0 2px 12px rgba(0,0,0,0.8)",
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  textAlign: "center",
                }}
              >
                {venue}
              </div>
            )}
            {date && (
              <div
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 16,
                  color: "rgba(255, 255, 255, 0.7)",
                  textShadow: "0 2px 8px rgba(0,0,0,0.7)",
                  letterSpacing: 4,
                  textAlign: "center",
                }}
              >
                {date}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Layer 2: Brand video (on top, fades out during crossfade) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: videoOpacity,
          overflow: "hidden",
          backgroundColor: "#000",
        }}
      >
        <OffthreadVideo
          src={staticFile(videoSrc)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </div>

      {/* Brand video audio — fades out as scene appears */}
      <Audio src={staticFile(videoSrc)} volume={videoAudioVolume} />

    </div>
  );
};
