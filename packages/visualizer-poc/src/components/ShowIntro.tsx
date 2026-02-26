/**
 * ShowIntro — Two-phase intro sequence:
 *   Phase 1: Dead Air branding card (8s) with Ken Burns zoom
 *   Phase 2: Crossfade to Cornell show poster (10s) with Ken Burns zoom
 *   Final 3s: Fade to black
 *
 * Total duration: 18s (540 frames at 30fps)
 */

import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";

// ─── Timing constants (frames at 30fps) ───
const BRAND_DURATION = 240;     // 8s — Dead Air branding card
const CROSSFADE_FRAMES = 60;    // 2s — crossfade between brand → show poster
const FADE_OUT_FRAMES = 90;     // 3s — fade to black at end

export interface ShowIntroProps {
  /** Path to Dead Air branding art (relative to public/) */
  brandSrc: string;
  /** Path to show poster art (relative to public/) */
  posterSrc: string;
  /** Show date display string */
  date: string;
  /** Venue display string */
  venue: string;
}

export const ShowIntro: React.FC<ShowIntroProps> = ({ brandSrc, posterSrc }) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  // ─── Phase 1: Brand card ───
  // Full opacity for 8s, then fades out over crossfade
  const brandOpacity = interpolate(
    frame,
    [0, BRAND_DURATION - CROSSFADE_FRAMES, BRAND_DURATION],
    [1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  // Brand: slow zoom 1.0 → 1.06
  const brandScale = interpolate(frame, [0, BRAND_DURATION], [1.0, 1.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ─── Phase 2: Show poster ───
  // Fades in during crossfade, holds, then fades to black at end
  const posterFadeIn = interpolate(
    frame,
    [BRAND_DURATION - CROSSFADE_FRAMES, BRAND_DURATION],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) },
  );
  const posterFadeOut = interpolate(
    frame,
    [durationInFrames - FADE_OUT_FRAMES, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );
  const posterOpacity = Math.min(posterFadeIn, posterFadeOut);

  // Poster: slow zoom over its visible duration
  const posterScale = interpolate(
    frame,
    [BRAND_DURATION - CROSSFADE_FRAMES, durationInFrames],
    [1.0, 1.08],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Poster: subtle drift
  const posterTranslateX = interpolate(
    frame,
    [BRAND_DURATION - CROSSFADE_FRAMES, durationInFrames],
    [0, -12],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div style={{ width, height, position: "relative", overflow: "hidden", background: "#000" }}>
      {/* Layer 1: Show poster (behind, fades in during crossfade) */}
      <div style={{ position: "absolute", inset: 0, opacity: posterOpacity, overflow: "hidden" }}>
        <Img
          src={staticFile(posterSrc)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${posterScale}) translateX(${posterTranslateX}px)`,
            willChange: "transform",
          }}
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
      </div>

      {/* Layer 2: Dead Air brand card (on top, fades out during crossfade) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: brandOpacity,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000",
        }}
      >
        <Img
          src={staticFile(brandSrc)}
          style={{
            width: width * 0.65,
            height: height * 0.65,
            objectFit: "contain",
            transform: `scale(${brandScale})`,
            willChange: "transform",
          }}
        />
      </div>
    </div>
  );
};
