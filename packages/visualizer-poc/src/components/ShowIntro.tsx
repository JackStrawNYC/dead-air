/**
 * ShowIntro — Two-phase intro sequence:
 *   Phase 1: Dead Air brand VIDEO (7s) with its own audio
 *   Phase 2: Crossfade to show poster (3s) — video audio fades out,
 *            concert audio fades in underneath
 *
 * Total duration: 10s (300 frames at 30fps)
 */

import React from "react";
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

// ─── Timing constants (frames at 30fps) ───
const POSTER_START = 210;          // 7s — poster begins crossfading in
const CROSSFADE_FRAMES = 60;      // 2s — video → poster visual crossfade
const FADE_OUT_FRAMES = 45;       // 1.5s — poster fades to black at end
const AUDIO_CROSSFADE_START = 195; // 6.5s — video audio starts fading out (0.5s before visual)

export interface ShowIntroProps {
  /** Path to Dead Air brand video (relative to public/) */
  videoSrc: string;
  /** Path to show poster art (relative to public/) */
  posterSrc: string;
  /** Show date display string */
  date: string;
  /** Venue display string */
  venue: string;
  /** First song audio file (relative to public/) — fades in during poster phase */
  introAudioSrc?: string;
}

export const ShowIntro: React.FC<ShowIntroProps> = ({
  videoSrc,
  posterSrc,
  date,
  venue,
  introAudioSrc,
}) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

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

  // ─── Phase 2: Show poster ───
  // Fades in during crossfade, holds, then fades to black at end
  const posterFadeIn = interpolate(
    frame,
    [POSTER_START, POSTER_START + CROSSFADE_FRAMES],
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

  // Poster: slow Ken Burns zoom over its visible duration
  const posterScale = interpolate(
    frame,
    [POSTER_START, durationInFrames],
    [1.0, 1.06],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Poster: subtle drift
  const posterTranslateX = interpolate(
    frame,
    [POSTER_START, durationInFrames],
    [0, -8],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // ─── Audio: concert audio fades in as poster appears ───
  const concertAudioVolume = introAudioSrc
    ? interpolate(
        frame,
        [POSTER_START, POSTER_START + CROSSFADE_FRAMES, durationInFrames],
        [0, 0.06, 0.15],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : 0;

  return (
    <div style={{ width, height, position: "relative", overflow: "hidden", background: "#000" }}>
      {/* Layer 1: Show poster (behind video, fades in during crossfade) */}
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

      {/* Brand video audio — fades out as poster appears */}
      <Audio src={staticFile(videoSrc)} volume={videoAudioVolume} />

      {/* Concert audio — fades in during poster phase */}
      {introAudioSrc && concertAudioVolume > 0 && (
        <Audio src={staticFile(introAudioSrc)} volume={concertAudioVolume} />
      )}
    </div>
  );
};
