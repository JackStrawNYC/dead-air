/**
 * SongArtLayer — Option E: Tiny + Faded
 * Just shrink it. Small bottom-left corner card, low opacity, 12 seconds.
 * Stop trying so hard. The art is there if you look but never demands attention.
 */

import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";

// PERF: We use a native <img> here instead of Remotion's <Img> on purpose.
// Remotion's <Img> wraps the load in delayRender(), and when 4 chrome workers
// race to load the same PNG at once, one of them deadlocks during the intro
// period. Native <img> loads asynchronously without blocking the frame, and
// for static PNGs cached in the bundle the load is essentially instant — no
// visible difference, but it unblocks multi-worker concurrency.

const clampOpts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// USER SPEC (revised): the song art card should stay visible for ~12 seconds.
// Previous version had it visibly gone by ~4s in renders even though the
// timeline said 13s — the cause was the dim 0.7 opacity getting drowned out
// once the bright shader kicked in. Bumped opacity to 0.95 and extended hold.
const ART_FADE_IN_END = 60;     // 2s fade in
const ART_HOLD_END = 360;       // 12s — full hold (10s after fade-in)
const ART_FADE_END = 420;       // 14s — fully gone (2s fade-out)
const ART_PEAK_OPACITY = 0.95;  // was 0.7 — too dim against bright shaders

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
    frame,
    [0, ART_FADE_IN_END, ART_HOLD_END, ART_FADE_END],
    [0, ART_PEAK_OPACITY, ART_PEAK_OPACITY, 0],
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
        // Force this above any overlays/shader siblings in the stacking order.
        // Without this, DynamicOverlayStack and other later siblings cover the
        // card once their bokeh/starfield overlays kick in (~3-4s into a song).
        zIndex: 50,
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
        <img
          src={src}
          alt=""
          loading="eager"
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
