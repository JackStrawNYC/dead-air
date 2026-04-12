/**
 * SunflowerStealie — Steal Your Face bolt center with 13 sunflower petals.
 * SYF circle with lightning bolt, 13 petals radiating at ~27.7deg spacing.
 * Petals scale with energy, slight rotation on beat. Layer 2 Sacred, Tier A.
 * Golden yellow base blended with chroma.
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

/** Create a sunflower petal path centered at origin, pointing up */
function petalPath(length: number, width: number): string {
  return `M0 0 C${-width} ${-length * 0.3} ${-width * 0.8} ${-length * 0.7} 0 ${-length} C${width * 0.8} ${-length * 0.7} ${width} ${-length * 0.3} 0 0 Z`;
}

const SunflowerStealieSVG: React.FC<{
  size: number;
  boltColor: string;
  circleColor: string;
  petalColor: string;
  petalDarkColor: string;
  centerColor: string;
  petalScale: number;
}> = ({ size, boltColor, circleColor, petalColor, petalDarkColor, centerColor, petalScale }) => {
  const cx = 140;
  const cy = 140;
  const petalRadius = 52;

  return (
    <svg width={size} height={size} viewBox="0 0 280 280" fill="none">
      {/* ─── 13 Sunflower petals radiating outward ─── */}
      {Array.from({ length: 13 }).map((_, i) => {
        const angle = (i / 13) * 360;
        const pLen = (38 + (i % 2 === 0 ? 4 : 0)) * petalScale;
        const pWid = 10;
        return (
          <g key={`petal${i}`} transform={`translate(${cx}, ${cy}) rotate(${angle})`}>
            {/* Outer petal */}
            <path
              d={petalPath(petalRadius + pLen, pWid)}
              fill={petalColor}
              opacity="0.75"
            />
            {/* Inner petal highlight */}
            <path
              d={petalPath(petalRadius + pLen * 0.7, pWid * 0.6)}
              fill={petalDarkColor}
              opacity="0.45"
            />
            {/* Petal vein */}
            <line
              x1="0" y1={-petalRadius * 0.3}
              x2="0" y2={-(petalRadius + pLen * 0.85)}
              stroke={petalDarkColor}
              strokeWidth="0.8"
              opacity="0.4"
            />
          </g>
        );
      })}

      {/* ─── Seed ring (between petals and SYF) ─── */}
      {Array.from({ length: 21 }).map((_, i) => {
        const angle = (i / 21) * Math.PI * 2;
        const sx = cx + Math.cos(angle) * 48;
        const sy = cy + Math.sin(angle) * 48;
        return (
          <circle key={`seed${i}`} cx={sx} cy={sy} r="2"
            fill={centerColor} opacity="0.5" />
        );
      })}

      {/* ─── Steal Your Face circle ─── */}
      <circle cx={cx} cy={cy} r="42" stroke={circleColor} strokeWidth="3" fill="none" />
      <circle cx={cx} cy={cy} r="42" fill={circleColor} opacity="0.1" />

      {/* Inner ring */}
      <circle cx={cx} cy={cy} r="36" stroke={circleColor} strokeWidth="1.5" fill="none" opacity="0.5" />

      {/* ─── SYF halves dividing line ─── */}
      <line x1={cx - 42} y1={cy} x2={cx + 42} y2={cy} stroke={circleColor} strokeWidth="2" />

      {/* ─── Upper half fill (subtle) ─── */}
      <path
        d={`M${cx - 42} ${cy} A42 42 0 0 1 ${cx + 42} ${cy} Z`}
        fill={circleColor} opacity="0.08"
      />

      {/* ─── Lightning Bolt ─── */}
      <path
        d={`M${cx - 2} ${cy - 38} L${cx + 10} ${cy - 8} L${cx + 2} ${cy - 8} L${cx + 12} ${cy + 5} L${cx + 4} ${cy + 5} L${cx + 14} ${cy + 36} L${cx - 4} ${cy + 8} L${cx + 4} ${cy + 8} L${cx - 6} ${cy - 5} L${cx + 2} ${cy - 5} L${cx - 8} ${cy - 20} L${cx - 2} ${cy - 20} Z`}
        fill={boltColor}
        opacity="0.85"
      />

      {/* Bolt outline */}
      <path
        d={`M${cx - 2} ${cy - 38} L${cx + 10} ${cy - 8} L${cx + 2} ${cy - 8} L${cx + 12} ${cy + 5} L${cx + 4} ${cy + 5} L${cx + 14} ${cy + 36} L${cx - 4} ${cy + 8} L${cx + 4} ${cy + 8} L${cx - 6} ${cy - 5} L${cx + 2} ${cy - 5} L${cx - 8} ${cy - 20} L${cx - 2} ${cy - 20} Z`}
        stroke={boltColor}
        strokeWidth="1.5"
        fill="none"
        opacity="0.5"
      />

      {/* ─── Outer decorative ring ─── */}
      <circle cx={cx} cy={cy} r="45" stroke={circleColor} strokeWidth="1" opacity="0.3" />

      {/* ─── Fibonacci seed spiral suggestion ─── */}
      {Array.from({ length: 34 }).map((_, i) => {
        const goldenAngle = i * 137.508 * (Math.PI / 180);
        const r = Math.sqrt(i) * 5.5;
        const sx = cx + Math.cos(goldenAngle) * r;
        const sy = cy + Math.sin(goldenAngle) * r;
        if (r > 33) return null;
        return (
          <circle key={`fib${i}`} cx={sx} cy={sy} r="1.2"
            fill={centerColor} opacity="0.3" />
        );
      })}
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const SunflowerStealie: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  const baseSize = Math.min(width, height) * 0.44;
  // Widened breathing: tight bud at quiet → full bloom at loud
  const breathe = interpolate(energy, [0.03, 0.35], [0.75, 1.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Petals scale independently with energy (more dramatic spread)
  // Widened petal scale: closed tight at quiet → wide bloom at loud
  const petalScale = interpolate(energy, [0.05, 0.4], [0.65, 1.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow rotation + beat impulse
  // Widened rotation: more dramatic beat-driven spin (was ×4, now ×10)
  const rotation = (frame / 60) * tempoFactor + snap.beatDecay * 10;

  // Widened opacity: ghostly at quiet → vivid at loud
  const opacity = interpolate(energy, [0.02, 0.35], [0.12, 0.80], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Golden yellow base blended with chroma
  const goldenBase = 0.13; // ~47deg, golden yellow
  const blendedHue = (goldenBase * 0.6 + chromaHue * 0.4) % 1;
  const petalColor = hueToHex(blendedHue, 0.85, 0.58);
  const petalDarkColor = hueToHex(blendedHue, 0.75, 0.42);
  const circleColor = hueToHex(chromaHue, 0.7, 0.65);
  const boltColor = hueToHex(chromaHue, 0.8, 0.55);
  const centerColor = hueToHex((blendedHue + 0.05) % 1, 0.6, 0.35);

  // Widened bass glow: subtle at quiet → blazing at loud
  const bassGlow = 0.3 + snap.bass * 1.5;
  const glowRadius = interpolate(energy, [0.05, 0.3], [2, 40], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * bassGlow;

  const onsetScale = 1 + snap.onsetEnvelope * 0.04;
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
          transform: `rotate(${rotation}deg) scale(${breathe * onsetScale})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${petalColor}) drop-shadow(0 0 ${glowRadius * 1.5}px ${boltColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <SunflowerStealieSVG
          size={size}
          boltColor={boltColor}
          circleColor={circleColor}
          petalColor={petalColor}
          petalDarkColor={petalDarkColor}
          centerColor={centerColor}
          petalScale={petalScale}
        />
      </div>
    </div>
  );
};
