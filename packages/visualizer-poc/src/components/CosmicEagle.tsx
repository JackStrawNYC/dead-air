/**
 * CosmicEagle — Thunderbird with spread wings, geometric feathers, stealie eye.
 * Native American-style angular feather pattern. Large spread-wing eagle.
 * Small stealie circle as the eagle's eye. Layer 5 Nature, Tier B.
 * Wings flap gently with bass, spread with energy.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

function hueToHex(h: number, s = 0.85, l = 0.6): string {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) { r = c; g = x; }
  else if (sector === 1) { r = x; g = c; }
  else if (sector === 2) { g = c; b = x; }
  else if (sector === 3) { g = x; b = c; }
  else if (sector === 4) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const EagleSVG: React.FC<{
  size: number;
  primaryColor: string;
  featherColor: string;
  accentColor: string;
  eyeColor: string;
  wingSpread: number;
}> = ({ size, primaryColor, featherColor, accentColor, eyeColor, wingSpread }) => {
  // Wing spread factor adjusts wing droop/lift (1.0 = neutral, >1 = more spread)
  const wingLift = (1 - wingSpread) * 12;

  return (
    <svg width={size} height={size * 0.65} viewBox="0 0 360 230" fill="none">
      {/* ─── Left Wing ─── */}
      <g transform={`translate(0, ${wingLift})`}>
        {/* Main wing shape */}
        <path
          d="M180 110 L140 80 L100 55 L60 40 L25 35 L15 50 L30 65 L50 75 L40 80 L20 85 L10 95 L30 100 L55 98 L45 108 L25 115 L15 125 L40 120 L65 112 L90 108 L120 106 L160 108"
          stroke={primaryColor} strokeWidth="2.5" fill="none" strokeLinejoin="round"
        />

        {/* Geometric feather pattern — left wing */}
        {/* Primary feathers (angular, Native American style) */}
        <path d="M25 35 L35 48 L22 52" stroke={featherColor} strokeWidth="1.5" fill="none" opacity="0.7" />
        <path d="M60 40 L65 55 L50 58" stroke={featherColor} strokeWidth="1.5" fill="none" opacity="0.7" />
        <path d="M100 55 L100 70 L85 72" stroke={featherColor} strokeWidth="1.5" fill="none" opacity="0.7" />
        <path d="M140 80 L135 95 L120 92" stroke={featherColor} strokeWidth="1.5" fill="none" opacity="0.7" />

        {/* Secondary feather row */}
        <path d="M20 85 L32 90 L25 98" stroke={featherColor} strokeWidth="1.2" fill="none" opacity="0.55" />
        <path d="M45 80 L55 88 L45 95" stroke={featherColor} strokeWidth="1.2" fill="none" opacity="0.55" />
        <path d="M25 115 L38 112 L35 122" stroke={featherColor} strokeWidth="1.2" fill="none" opacity="0.55" />

        {/* Wing chevron pattern (geometric) */}
        <path d="M50 58 L70 52 L90 58" stroke={accentColor} strokeWidth="1" opacity="0.4" />
        <path d="M40 75 L65 68 L90 75" stroke={accentColor} strokeWidth="1" opacity="0.4" />
        <path d="M35 95 L60 88 L85 95" stroke={accentColor} strokeWidth="1" opacity="0.4" />

        {/* Feather tips — triangular barbs */}
        <path d="M15 50 L10 42 L20 45" fill={featherColor} opacity="0.5" />
        <path d="M10 95 L5 88 L15 90" fill={featherColor} opacity="0.5" />
        <path d="M15 125 L10 118 L20 120" fill={featherColor} opacity="0.5" />
      </g>

      {/* ─── Right Wing (mirrored) ─── */}
      <g transform={`translate(0, ${wingLift})`}>
        <path
          d="M180 110 L220 80 L260 55 L300 40 L335 35 L345 50 L330 65 L310 75 L320 80 L340 85 L350 95 L330 100 L305 98 L315 108 L335 115 L345 125 L320 120 L295 112 L270 108 L240 106 L200 108"
          stroke={primaryColor} strokeWidth="2.5" fill="none" strokeLinejoin="round"
        />

        {/* Geometric feather pattern — right wing */}
        <path d="M335 35 L325 48 L338 52" stroke={featherColor} strokeWidth="1.5" fill="none" opacity="0.7" />
        <path d="M300 40 L295 55 L310 58" stroke={featherColor} strokeWidth="1.5" fill="none" opacity="0.7" />
        <path d="M260 55 L260 70 L275 72" stroke={featherColor} strokeWidth="1.5" fill="none" opacity="0.7" />
        <path d="M220 80 L225 95 L240 92" stroke={featherColor} strokeWidth="1.5" fill="none" opacity="0.7" />

        <path d="M340 85 L328 90 L335 98" stroke={featherColor} strokeWidth="1.2" fill="none" opacity="0.55" />
        <path d="M315 80 L305 88 L315 95" stroke={featherColor} strokeWidth="1.2" fill="none" opacity="0.55" />
        <path d="M335 115 L322 112 L325 122" stroke={featherColor} strokeWidth="1.2" fill="none" opacity="0.55" />

        <path d="M310 58 L290 52 L270 58" stroke={accentColor} strokeWidth="1" opacity="0.4" />
        <path d="M320 75 L295 68 L270 75" stroke={accentColor} strokeWidth="1" opacity="0.4" />
        <path d="M325 95 L300 88 L275 95" stroke={accentColor} strokeWidth="1" opacity="0.4" />

        <path d="M345 50 L350 42 L340 45" fill={featherColor} opacity="0.5" />
        <path d="M350 95 L355 88 L345 90" fill={featherColor} opacity="0.5" />
        <path d="M345 125 L350 118 L340 120" fill={featherColor} opacity="0.5" />
      </g>

      {/* ─── Body ─── */}
      <path
        d="M165 105 Q180 95 195 105 Q195 140 190 160 Q180 175 170 160 Q165 140 165 105 Z"
        stroke={primaryColor} strokeWidth="2" fill="none"
      />
      <path d="M165 105 Q180 95 195 105 Q195 140 190 160 Q180 175 170 160 Q165 140 165 105 Z"
        fill={primaryColor} opacity="0.08" />

      {/* Body geometric pattern */}
      <path d="M172 115 L180 110 L188 115 L180 120 Z" stroke={accentColor} strokeWidth="1" opacity="0.4" />
      <path d="M173 128 L180 123 L187 128 L180 133 Z" stroke={accentColor} strokeWidth="1" opacity="0.4" />
      <path d="M174 140 L180 135 L186 140 L180 145 Z" stroke={accentColor} strokeWidth="1" opacity="0.35" />

      {/* ─── Head ─── */}
      <ellipse cx="180" cy="100" rx="10" ry="12" stroke={primaryColor} strokeWidth="2.2" fill="none" />

      {/* Beak */}
      <path
        d="M180 108 L175 118 L180 115 L185 118 Z"
        stroke={primaryColor} strokeWidth="1.8" fill="none"
      />
      <path d="M180 108 L175 118 L180 115 L185 118 Z" fill={primaryColor} opacity="0.15" />

      {/* ─── Stealie Eye (small SYF as the eagle's eye) ─── */}
      <circle cx="180" cy="97" r="5" stroke={eyeColor} strokeWidth="1.5" fill="none" />
      <circle cx="180" cy="97" r="5" fill={eyeColor} opacity="0.2" />
      {/* Mini lightning bolt in eye */}
      <path d="M179 93 L181 96 L179.5 96 L182 101 L180 98 L181 98 Z"
        fill={eyeColor} opacity="0.8" />
      {/* Dividing line */}
      <line x1="175" y1="97" x2="185" y2="97" stroke={eyeColor} strokeWidth="0.8" opacity="0.5" />

      {/* ─── Tail feathers ─── */}
      <path d="M175 160 L168 185 L172 180" stroke={primaryColor} strokeWidth="1.8" fill="none" />
      <path d="M180 163 L180 192 L183 187" stroke={primaryColor} strokeWidth="1.8" fill="none" />
      <path d="M185 160 L192 185 L188 180" stroke={primaryColor} strokeWidth="1.8" fill="none" />
      {/* Tail feather barbs */}
      <path d="M168 185 L162 180 L170 178" stroke={featherColor} strokeWidth="1" opacity="0.5" />
      <path d="M180 192 L175 188 L182 186" stroke={featherColor} strokeWidth="1" opacity="0.5" />
      <path d="M192 185 L198 180 L190 178" stroke={featherColor} strokeWidth="1" opacity="0.5" />

      {/* ─── Crown feathers (head crest) ─── */}
      <path d="M176 89 L172 78 L175 82" stroke={primaryColor} strokeWidth="1.2" fill="none" />
      <path d="M180 88 L180 76 L182 80" stroke={primaryColor} strokeWidth="1.2" fill="none" />
      <path d="M184 89 L188 78 L185 82" stroke={primaryColor} strokeWidth="1.2" fill="none" />
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const CosmicEagle: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  const baseSize = Math.min(width, height) * 0.5;
  const breathe = interpolate(energy, [0.03, 0.3], [0.92, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Wing spread — increases with energy
  const wingSpread = interpolate(energy, [0.05, 0.4], [0.9, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Gentle flap with bass
  const flapY = Math.sin(frame / 25 * tempoFactor) * 3 * (0.5 + snap.bass * 0.5);
  const tilt = Math.sin(frame / 80 * tempoFactor) * 1.2;

  const opacity = interpolate(energy, [0.02, 0.3], [0.20, 0.50], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const primaryColor = hueToHex(chromaHue, 0.6, 0.6);
  const featherColor = hueToHex((chromaHue + 0.08) % 1, 0.55, 0.5);
  const accentColor = hueToHex((chromaHue + 0.5) % 1, 0.5, 0.55);
  const eyeColor = hueToHex((chromaHue + 0.15) % 1, 0.8, 0.6);

  const bassGlow = 0.6 + snap.bass * 0.8;
  const glowRadius = interpolate(energy, [0.05, 0.3], [4, 20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * bassGlow;

  const onsetScale = 1 + snap.onsetEnvelope * 0.03;
  const size = baseSize * breathe;

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
          transform: `translateY(${flapY}px) rotate(${tilt}deg) scale(${breathe * onsetScale})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${primaryColor}) drop-shadow(0 0 ${glowRadius * 1.3}px ${eyeColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <EagleSVG
          size={size}
          primaryColor={primaryColor}
          featherColor={featherColor}
          accentColor={accentColor}
          eyeColor={eyeColor}
          wingSpread={wingSpread}
        />
      </div>
    </div>
  );
};
