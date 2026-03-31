/**
 * SongArtLayer — per-song poster art with Ken Burns zoom.
 *
 * Visual foundation: intro full-opacity title card (4s), then settles
 * to energy-reactive background wash. Quiet passages: art rises.
 * Peak energy: art fades, shader visuals dominate.
 *
 * Dead air bookend: poster reappears gently after the music ends,
 * serving as a "that was [song]" title card during applause/tuning.
 */

import React from "react";
import { Img, useCurrentFrame, interpolate, Easing } from "remotion";

const clampOpts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

const ART_FULL_END = 120;      // 4s at 30fps — full opacity title card
const ART_FADE_END = 300;      // 10s — fade to background wash level

interface SongArtProps {
  src: string;
  /** Smooth 0-1 suppression factor: 1 = full art, 0.45 = dimmed for curated media */
  suppressionFactor: number;
  /** Hue rotation in degrees (palette consistency with overlays/scene) */
  hueRotation?: number;
  /** Rolling energy (0-1) for breath modulation */
  energy?: number;
  /** Climax intensity (0-1) — art suppresses further during climax/sustain */
  climaxIntensity?: number;
  /** Focus system opacity multiplier (0-1) — controls art visibility by climax phase */
  focusOpacity?: number;
  /** Whether this song is a segue-in — suppress art during first 10s */
  segueIn?: boolean;
  /** CSS mix-blend-mode override (default "screen") */
  artBlendMode?: string;
  /** Intro factor 0-1: 0 = intro period (art-forward), 1 = engine fully open */
  introFactor?: number;
  /** Dead air factor 0-1: 0 = music playing, 1 = fully in dead air (post-music) */
  deadAirFactor?: number;
}

export const SongArtLayer: React.FC<SongArtProps> = ({ src, suppressionFactor, hueRotation = 0, energy = 0, climaxIntensity = 0, focusOpacity = 1, segueIn = false, artBlendMode, introFactor = 1, deadAirFactor = 0 }) => {
  const frame = useCurrentFrame();

  // Suppress art briefly during segue-in crossfade (3s), then fade in over 2s
  if (segueIn && frame < 90) return null;
  const segueFade = segueIn && frame < 150 ? (frame - 90) / 60 : 1;

  // Energy-reactive wash: quiet → 0.40, peak → 0.10
  // Art is intro title card only — gone after 12s, shader owns the song body
  const introTarget = introFactor < 1 ? 0.70 * (1 - introFactor) : 0;
  const baseOpacity = interpolate(
    frame,
    [0, ART_FULL_END, ART_FADE_END],
    [0.70, 0.70, introTarget],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  // Climax suppression: during climax/sustain, further suppress art
  const climaxSuppression = 1 - climaxIntensity * 0.7;
  // Intro override: during intro period (introFactor < 1), keep art prominent
  // by lerping focusOpacity toward 1.0. First 4s always full override.
  const introBoost = frame < ART_FULL_END ? 1.0
    : introFactor < 1 ? focusOpacity + (1.0 - focusOpacity) * (1 - introFactor)
    : focusOpacity;
  const artOpacity = baseOpacity * suppressionFactor * climaxSuppression * introBoost;

  // Dead air reappearance: poster returns prominently as bookend
  const deadAirOpacity = deadAirFactor * 0.85;
  const finalOpacity = Math.max(artOpacity, deadAirOpacity) * segueFade;

  if (finalOpacity < 0.01) return null;

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
        opacity: finalOpacity,
        mixBlendMode: (introFactor < 0.5 ? "normal" : (artBlendMode ?? "screen")) as React.CSSProperties["mixBlendMode"],
        overflow: "hidden",
        filter: [
          // Energy-adaptive color correction: brighter art at peaks, darker at quiet
          // Previously hardcoded brightness(0.7) contrast(0.8) — made intros muddy
          (() => {
            const artBright = interpolate(energy, [0, 0.15, 0.30], [0.65, 0.75, 0.85], clampOpts);
            const artContrast = interpolate(energy, [0, 0.15, 0.30], [0.75, 0.85, 0.95], clampOpts);
            // During intro (introFactor < 0.5), use consistent values instead of harsh 0.7
            const b = introFactor < 0.5 ? 0.85 : artBright;
            const c = introFactor < 0.5 ? 0.90 : artContrast;
            return `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)})`;
          })(),
          hueRotation !== 0 ? `hue-rotate(${hueRotation.toFixed(1)}deg)` : "",
        ].filter(Boolean).join(" ") || undefined,
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
