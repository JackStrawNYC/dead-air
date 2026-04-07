/**
 * SongArtLayer — Option E: Tiny + Faded
 * Just shrink it. Small bottom-left corner card, low opacity, 12 seconds.
 * Stop trying so hard. The art is there if you look but never demands attention.
 */

import React from "react";
import { Img, useCurrentFrame, interpolate, Easing } from "remotion";

const clampOpts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// Aligned with SongVisualizer intro: shader is fully off until frame 450 (15s),
// then ramps in over 150 frames (5s). Card holds until 15s, then crossfades out
// over the same 5s window so the visualizer emerges as the card dissolves.
const ART_FADE_IN_END = 60;     // 2s fade in
const ART_HOLD_END = 450;       // 15s — full hold
const ART_FADE_END = 600;       // 20s — fully gone, shader at 100%

interface SongArtProps {
  src: string;
  suppressionFactor: number;
  hueRotation?: number;
  energy?: number;
  climaxIntensity?: number;
  focusOpacity?: number;
  segueIn?: boolean;
  artBlendMode?: string;
  introFactor?: number;
  deadAirFactor?: number;
}

export const SongArtLayer: React.FC<SongArtProps> = ({
  src,
  hueRotation = 0,
  energy = 0,
  segueIn = false,
  deadAirFactor = 0,
}) => {
  const frame = useCurrentFrame();

  if (segueIn && frame < 90) return null;
  const segueFade = segueIn && frame < 150 ? (frame - 90) / 60 : 1;

  const cardOpacity = interpolate(
    frame, [0, ART_FADE_IN_END, ART_HOLD_END, ART_FADE_END], [0, 0.7, 0.7, 0],
    { ...clampOpts, easing: Easing.inOut(Easing.cubic) },
  );
  // DEAD AIR: bring the card back at higher opacity (0.85 instead of 0.5) to clearly
  // signal "song over, between tracks". Viewers should immediately recognize the song
  // ended without needing to look at audio waveforms.
  const finalOpacity = Math.max(cardOpacity, deadAirFactor * 0.85) * segueFade;
  if (finalOpacity < 0.01) return null;

  const breath = 1.0 + energy * 0.05;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: finalOpacity,
        pointerEvents: "none",
      }}
    >
      {/* Small card bottom-left, 22% width */}
      <div
        style={{
          position: "absolute",
          left: "5%",
          bottom: "12%",
          width: "22%",
          aspectRatio: "1.3 / 1",
          borderRadius: "3px",
          overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 38%",
            filter: `brightness(${(0.7 * breath).toFixed(3)}) contrast(0.95) saturate(0.85) ${hueRotation !== 0 ? `hue-rotate(${hueRotation.toFixed(1)}deg)` : ""}`,
          }}
        />
        {/* Inner darken vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.35) 100%)",
            pointerEvents: "none",
          }}
        />
        {/* Subtle film grain */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%221.3%22 numOctaves=%222%22 seed=%229%22/><feColorMatrix values=%220 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0%22/></filter><rect width=%22200%22 height=%22200%22 filter=%22url(%23n)%22/></svg>")',
            backgroundSize: "200px 200px",
            mixBlendMode: "overlay",
            opacity: 0.5,
          }}
        />
      </div>
    </div>
  );
};
