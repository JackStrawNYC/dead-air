/**
 * ShowIntro — Two-phase intro sequence:
 *   Phase 1: Dead Air branding card (5s) with Ken Burns zoom
 *   Phase 2: Crossfade to Cornell show poster (5s) with Ken Burns zoom
 *   First song audio bleeds in during poster phase at low volume
 *
 * Total duration: ~10s (300 frames at 30fps)
 */

import React from "react";
import { Audio, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";

// ─── Timing constants (frames at 30fps) ───
const BRAND_DURATION = 150;     // 5s — Dead Air branding card
const CROSSFADE_FRAMES = 45;    // 1.5s — crossfade between brand → show poster
const FADE_OUT_FRAMES = 60;     // 2s — fade to black at end

export interface ShowIntroProps {
  /** Path to Dead Air branding art (relative to public/) */
  brandSrc: string;
  /** Path to show poster art (relative to public/) */
  posterSrc: string;
  /** Show date display string */
  date: string;
  /** Venue display string */
  venue: string;
  /** First song audio file (relative to public/audio/) — bleeds in during poster phase */
  introAudioSrc?: string;
}

export const ShowIntro: React.FC<ShowIntroProps> = ({ brandSrc, posterSrc, date, venue, introAudioSrc }) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  // ─── Phase 1: Brand card ───
  // Full opacity for 5s, then fades out over crossfade
  const brandOpacity = interpolate(
    frame,
    [0, BRAND_DURATION - CROSSFADE_FRAMES, BRAND_DURATION],
    [1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  // Brand: slow zoom 1.0 → 1.04
  const brandScale = interpolate(frame, [0, BRAND_DURATION], [1.0, 1.04], {
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
    [1.0, 1.06],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Poster: subtle drift
  const posterTranslateX = interpolate(
    frame,
    [BRAND_DURATION - CROSSFADE_FRAMES, durationInFrames],
    [0, -8],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // ─── Audio: first song bleeds in during poster phase ───
  // Starts when poster begins appearing, builds to 0.15 by end
  const audioVolume = introAudioSrc
    ? interpolate(
        frame,
        [BRAND_DURATION - CROSSFADE_FRAMES, BRAND_DURATION, durationInFrames - 15, durationInFrames],
        [0, 0.06, 0.15, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : 0;

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
        {/* Venue + date text over poster */}
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

      {/* First song audio bleeding in during poster phase */}
      {introAudioSrc && audioVolume > 0 && (
        <Audio src={staticFile(introAudioSrc)} volume={audioVolume} />
      )}
    </div>
  );
};
