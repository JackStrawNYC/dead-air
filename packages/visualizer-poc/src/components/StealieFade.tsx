/**
 * StealieFade — Steal Your Face (Stealie) logo overlay.
 *
 * A+++ version: full anatomical Stealie with beveled outer ring, skull dome,
 * eye sockets with beat-pulsing inner glow, nose triangle, detailed lightning
 * bolt with white-hot core + outer glow, horizontal divider, and classic
 * red/blue half-split. Atmospheric effects include radial halo, beat-synced
 * bolt pulse, sacred rotation, breathing scale, and chromaHue-tinted glow.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ─── Helpers ─── */

function hsl(h: number, s: number, l: number, a = 1): string {
  return a < 1
    ? `hsla(${h}, ${s}%, ${l}%, ${a})`
    : `hsl(${h}, ${s}%, ${l}%)`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/* ─── Props ─── */

interface Props {
  frames: EnhancedFrameData[];
}

/* ─── Component ─── */

export const StealieFade: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const baseSize = Math.min(width, height) * 0.28;
  const time = frame / fps;

  /* ── Audio-driven parameters ── */

  // Beat-synced pulse: punchy on beat, decays gracefully
  const beatPulse = interpolate(snap.beatDecay, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Drum onset adds extra kick to the bolt
  const drumKick = interpolate(snap.drumOnset, [0, 0.5], [0, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Overall opacity: atmospheric presence, stronger on beats
  const baseOpacity = interpolate(snap.slowEnergy, [0.02, 0.25], [0.06, 0.14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const beatOpacity = interpolate(snap.beatDecay, [0, 1], [0, 0.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(baseOpacity + beatOpacity, 0.28);

  // Scale breathes with slow energy
  const scale = interpolate(snap.slowEnergy, [0.02, 0.35], [0.96, 1.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sacred rotation: ~1 deg/sec, tempo-scaled
  const rotation = time * 1.0 * tempoFactor;

  // ChromaHue-tinted outer glow
  const glowHue = snap.chromaHue;

  /* ── Color scheme ── */

  // Classic Stealie: warm red left, cool blue right
  const redHue = lerp(350, 10, snap.harmonicTension);
  const blueHue = lerp(210, 230, snap.harmonicTension);

  const redFill = hsl(redHue, 65, 42, 0.85);
  const blueFill = hsl(blueHue, 60, 38, 0.85);

  // Ring / skull stroke color: warm white-gold
  const ringColor = hsl(45, 20, 80);
  const ringHighlight = hsl(45, 15, 92, 0.5);

  // Eye socket glow: beat-synced inner radiance
  const eyeGlowIntensity = lerp(0.15, 0.7, beatPulse);
  const eyeGlowColor = hsl(glowHue, 50, 70, eyeGlowIntensity);

  // Bolt colors: white-hot core with colored outer glow
  const boltCoreColor = hsl(55, 100, 95);
  const boltOuterGlow = hsl(55, 90, 70, lerp(0.5, 1.0, beatPulse + drumKick * 0.5));
  const boltEdgeGlow = hsl(glowHue, 70, 60, lerp(0.3, 0.8, beatPulse));

  // Bolt glow radius pulses with beat
  const boltGlowRadius = lerp(3, 10, beatPulse + drumKick * 0.4);

  // Outer halo glow
  const haloOpacity = lerp(0.05, 0.2, beatPulse * 0.5 + snap.energy * 0.5);

  /* ── SVG IDs (unique per instance) ── */
  const id = `stealie-${frame}`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          transform: `rotate(${rotation}deg) scale(${scale})`,
          opacity,
          willChange: "transform, opacity",
        }}
      >
        <svg
          width={baseSize}
          height={baseSize}
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* ── Radial halo glow ── */}
            <radialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={hsl(glowHue, 60, 70)} stopOpacity={haloOpacity * 1.5} />
              <stop offset="40%" stopColor={hsl(glowHue, 50, 60)} stopOpacity={haloOpacity * 0.7} />
              <stop offset="100%" stopColor={hsl(glowHue, 40, 50)} stopOpacity={0} />
            </radialGradient>

            {/* ── Red/blue split clip paths ── */}
            <clipPath id={`${id}-left-half`}>
              <rect x="0" y="0" width="100" height="200" />
            </clipPath>
            <clipPath id={`${id}-right-half`}>
              <rect x="100" y="0" width="100" height="200" />
            </clipPath>

            {/* ── Inner circle clip (for color fills) ── */}
            <clipPath id={`${id}-inner-circle`}>
              <circle cx="100" cy="100" r="88" />
            </clipPath>

            {/* ── Upper skull clip (above horizontal line) ── */}
            <clipPath id={`${id}-upper`}>
              <rect x="0" y="0" width="200" height="100" />
            </clipPath>

            {/* ── Lower clip (below horizontal line) ── */}
            <clipPath id={`${id}-lower`}>
              <rect x="0" y="100" width="200" height="100" />
            </clipPath>

            {/* ── Eye socket glow gradient ── */}
            <radialGradient id={`${id}-eye-glow`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={eyeGlowColor} stopOpacity={eyeGlowIntensity} />
              <stop offset="70%" stopColor={eyeGlowColor} stopOpacity={eyeGlowIntensity * 0.3} />
              <stop offset="100%" stopColor={eyeGlowColor} stopOpacity={0} />
            </radialGradient>

            {/* ── Bolt glow filter ── */}
            <filter id={`${id}-bolt-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation={boltGlowRadius} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* ── Ring bevel highlight filter ── */}
            <filter id={`${id}-ring-bevel`} x="-5%" y="-5%" width="110%" height="110%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ═══════════════════════════════════════════════
              LAYER 0: Radial halo emanating from center
              ═══════════════════════════════════════════════ */}
          <circle cx="100" cy="100" r="100" fill={`url(#${id}-halo)`} />

          {/* ═══════════════════════════════════════════════
              LAYER 1: Red/blue split fills inside circle
              ═══════════════════════════════════════════════ */}
          <g clipPath={`url(#${id}-inner-circle)`}>
            {/* Left half — red/warm */}
            <g clipPath={`url(#${id}-left-half)`}>
              {/* Upper left quadrant (skull area) */}
              <rect x="0" y="0" width="100" height="100" fill={redFill} opacity={0.25} />
              {/* Lower left quadrant */}
              <rect x="0" y="100" width="100" height="100" fill={redFill} opacity={0.35} />
            </g>
            {/* Right half — blue/cool */}
            <g clipPath={`url(#${id}-right-half)`}>
              {/* Upper right quadrant */}
              <rect x="100" y="0" width="100" height="100" fill={blueFill} opacity={0.25} />
              {/* Lower right quadrant */}
              <rect x="100" y="100" width="100" height="100" fill={blueFill} opacity={0.35} />
            </g>
          </g>

          {/* ═══════════════════════════════════════════════
              LAYER 2: Outer ring with bevel / depth
              ═══════════════════════════════════════════════ */}
          {/* Outer shadow ring — depth illusion */}
          <circle
            cx="100" cy="100" r="93"
            stroke={hsl(0, 0, 20, 0.4)}
            strokeWidth="6"
            fill="none"
          />
          {/* Primary ring */}
          <circle
            cx="100" cy="100" r="91"
            stroke={ringColor}
            strokeWidth="4"
            fill="none"
            filter={`url(#${id}-ring-bevel)`}
          />
          {/* Inner highlight arc — bevel top-light */}
          <path
            d="M 30 65 A 80 80 0 0 1 170 65"
            stroke={ringHighlight}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />

          {/* ═══════════════════════════════════════════════
              LAYER 3: Skull dome — cranium curve
              ═══════════════════════════════════════════════ */}
          {/* Upper cranium arc */}
          <path
            d="M 35 100 Q 36 42 100 28 Q 164 42 165 100"
            stroke={ringColor}
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            opacity={0.7}
          />
          {/* Inner cranium detail line */}
          <path
            d="M 45 97 Q 47 52 100 38 Q 153 52 155 97"
            stroke={ringColor}
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
            opacity={0.25}
          />

          {/* ═══════════════════════════════════════════════
              LAYER 4: Eye sockets with inner glow
              ═══════════════════════════════════════════════ */}
          {/* Left eye — outer ring */}
          <ellipse cx="72" cy="74" rx="18" ry="16"
            stroke={ringColor} strokeWidth="2.5" fill="none" />
          {/* Left eye — inner glow */}
          <ellipse cx="72" cy="74" rx="14" ry="12"
            fill={`url(#${id}-eye-glow)`} />
          {/* Left eye — pupil dot */}
          <circle cx="72" cy="74" r="4"
            fill={hsl(0, 0, 10, lerp(0.1, 0.4, beatPulse))} />

          {/* Right eye — outer ring */}
          <ellipse cx="128" cy="74" rx="18" ry="16"
            stroke={ringColor} strokeWidth="2.5" fill="none" />
          {/* Right eye — inner glow */}
          <ellipse cx="128" cy="74" rx="14" ry="12"
            fill={`url(#${id}-eye-glow)`} />
          {/* Right eye — pupil dot */}
          <circle cx="128" cy="74" r="4"
            fill={hsl(0, 0, 10, lerp(0.1, 0.4, beatPulse))} />

          {/* ═══════════════════════════════════════════════
              LAYER 5: Nose triangle
              ═══════════════════════════════════════════════ */}
          <polygon
            points="100,82 91,98 109,98"
            stroke={ringColor}
            strokeWidth="2"
            fill="none"
            strokeLinejoin="round"
            opacity={0.65}
          />
          {/* Nostrils — subtle shadow dots */}
          <circle cx="96" cy="95" r="2" fill={hsl(0, 0, 30, 0.3)} />
          <circle cx="104" cy="95" r="2" fill={hsl(0, 0, 30, 0.3)} />

          {/* ═══════════════════════════════════════════════
              LAYER 6: Horizontal dividing line
              ═══════════════════════════════════════════════ */}
          <line
            x1="9" y1="100" x2="191" y2="100"
            stroke={ringColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity={0.8}
          />
          {/* Thin highlight line above (bevel) */}
          <line
            x1="12" y1="98.5" x2="188" y2="98.5"
            stroke={ringHighlight}
            strokeWidth="0.8"
            opacity={0.4}
          />

          {/* ═══════════════════════════════════════════════
              LAYER 7: Lightning bolt — outer glow layer
              ═══════════════════════════════════════════════ */}
          <g filter={`url(#${id}-bolt-glow)`}>
            {/* Outer bolt shape (wider, colored glow) */}
            <polygon
              points="
                104,10
                88,72
                96,72
                80,106
                90,106
                70,192
                108,118
                97,118
                120,82
                110,82
              "
              fill={boltEdgeGlow}
              opacity={lerp(0.4, 0.9, beatPulse)}
            />
          </g>

          {/* ═══════════════════════════════════════════════
              LAYER 8: Lightning bolt — main body
              ═══════════════════════════════════════════════ */}
          <polygon
            points="
              103,14
              90,74
              97,74
              82,106
              91,106
              74,188
              106,120
              98,120
              118,84
              109,84
            "
            fill={boltOuterGlow}
            opacity={0.9}
          />

          {/* ═══════════════════════════════════════════════
              LAYER 9: Lightning bolt — white-hot inner core
              ═══════════════════════════════════════════════ */}
          <polygon
            points="
              102,22
              92,76
              98,76
              86,106
              93,106
              80,180
              104,122
              99,122
              114,86
              108,86
            "
            fill={boltCoreColor}
            opacity={lerp(0.6, 1.0, beatPulse * 0.7 + drumKick * 0.3)}
          />

          {/* ═══════════════════════════════════════════════
              LAYER 10: Bolt spark — tiny flare at tip on beat
              ═══════════════════════════════════════════════ */}
          {beatPulse > 0.4 && (
            <>
              <circle cx="102" cy="14" r={lerp(1.5, 4, beatPulse)}
                fill={boltCoreColor} opacity={lerp(0.3, 0.9, beatPulse)} />
              <circle cx="78" cy="186" r={lerp(1, 3, beatPulse)}
                fill={boltCoreColor} opacity={lerp(0.2, 0.7, beatPulse)} />
            </>
          )}

          {/* ═══════════════════════════════════════════════
              LAYER 11: Jaw / chin arc below the divider
              ═══════════════════════════════════════════════ */}
          <path
            d="M 42 100 Q 45 155 100 170 Q 155 155 158 100"
            stroke={ringColor}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            opacity={0.5}
          />

          {/* ═══════════════════════════════════════════════
              LAYER 12: Teeth / mouth hint
              ═══════════════════════════════════════════════ */}
          {/* Upper teeth row — subtle horizontal lines */}
          <line x1="82" y1="105" x2="92" y2="105"
            stroke={ringColor} strokeWidth="1" opacity={0.25} />
          <line x1="108" y1="105" x2="118" y2="105"
            stroke={ringColor} strokeWidth="1" opacity={0.25} />

          {/* ═══════════════════════════════════════════════
              LAYER 13: Outer ring second stroke (for thickness)
              ═══════════════════════════════════════════════ */}
          <circle
            cx="100" cy="100" r="95"
            stroke={ringColor}
            strokeWidth="1.5"
            fill="none"
            opacity={0.35}
          />
        </svg>
      </div>
    </div>
  );
};
