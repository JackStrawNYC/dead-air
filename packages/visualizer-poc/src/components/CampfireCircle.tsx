/**
 * CampfireCircle — campfire with seated silhouettes around it.
 * Layer 6, tier B, tags: dead-culture, contemplative.
 * Central fire with 3-4 flame tongues flickering with energy.
 * 6 seated stick-figure silhouettes in a circle. Ember particles float up.
 * Warm orange/amber colors. Low-energy overlay (opacity 0.10-0.30).
 * Position: bottom center.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/** Map 0-1 hue to an RGB hex string */
function hueToHex(h: number): string {
  const s = 0.85, l = 0.6;
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

interface Props {
  frames: EnhancedFrameData[];
}

export const CampfireCircle: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Low-energy overlay: opacity 0.10-0.30
  const opacity = interpolate(energy, [0.02, 0.3], [0.10, 0.30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fire flicker scale from beatDecay and energy
  const fireScale = interpolate(energy, [0.0, 0.4], [0.85, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Warm amber base color, tinted slightly by chromaHue
  const fireColor1 = hueToHex(0.08 + chromaHue * 0.05); // orange
  const fireColor2 = hueToHex(0.05 + chromaHue * 0.03); // deep amber
  const fireColor3 = hueToHex(0.12 + chromaHue * 0.04); // yellow-orange
  const emberColor = hueToHex(0.03); // deep red-orange

  // Flame tongue offsets — flicker with frame and beatDecay
  const flickerA = Math.sin(frame * 0.15 * tempoFactor) * 4 + snap.beatDecay * 6;
  const flickerB = Math.cos(frame * 0.12 * tempoFactor + 1.2) * 5 + snap.beatDecay * 4;
  const flickerC = Math.sin(frame * 0.18 * tempoFactor + 2.5) * 3 + snap.beatDecay * 5;
  const flickerD = Math.cos(frame * 0.10 * tempoFactor + 0.7) * 4 + snap.beatDecay * 3;

  // Ember particles (6 embers floating upward)
  const embers: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const speed = 0.4 + i * 0.12;
    const phase = i * 1.3;
    const yOffset = ((frame * speed * tempoFactor + phase * 40) % 80);
    const xDrift = Math.sin(frame * 0.05 * tempoFactor + phase) * (8 + i * 2);
    const emberOpacity = interpolate(yOffset, [0, 20, 70, 80], [0, 0.8, 0.3, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) * energy;

    embers.push(
      <circle
        key={i}
        cx={100 + xDrift}
        cy={145 - yOffset}
        r={1.2 + Math.sin(frame * 0.2 + i) * 0.4}
        fill={emberColor}
        opacity={emberOpacity}
      />,
    );
  }

  // 6 seated silhouettes around the fire — positioned in a circle
  const silhouettes: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const radius = 38;
    const sx = 100 + Math.cos(angle) * radius;
    const sy = 158 + Math.sin(angle) * radius * 0.35; // compressed vertically for perspective
    // Simple seated stick figure: head circle + body triangle
    silhouettes.push(
      <g key={i} opacity={0.7}>
        {/* Head */}
        <circle cx={sx} cy={sy - 10} r={3} fill="#1a1a1a" />
        {/* Body (seated triangle) */}
        <polygon
          points={`${sx},${sy - 7} ${sx - 4},${sy + 2} ${sx + 4},${sy + 2}`}
          fill="#1a1a1a"
        />
        {/* Legs (seated, horizontal) */}
        <line
          x1={sx - 4} y1={sy + 2}
          x2={sx - 7} y2={sy + 4}
          stroke="#1a1a1a" strokeWidth="1.2" strokeLinecap="round"
        />
        <line
          x1={sx + 4} y1={sy + 2}
          x2={sx + 7} y2={sy + 4}
          stroke="#1a1a1a" strokeWidth="1.2" strokeLinecap="round"
        />
      </g>,
    );
  }

  // Fire glow radius
  const glowRadius = interpolate(energy, [0.05, 0.3], [6, 18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Breathe with slowEnergy
  const breathe = interpolate(slowEnergy, [0.02, 0.25], [0.95, 1.05], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const baseSize = Math.min(width, height) * 0.35;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: height * 0.05,
      }}
    >
      <div
        style={{
          transform: `scale(${breathe})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${fireColor1})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <svg
          width={baseSize}
          height={baseSize * 0.7}
          viewBox="0 0 200 180"
          fill="none"
        >
          {/* Fire pit base — ring of stones */}
          <ellipse cx="100" cy="162" rx="18" ry="5" fill="#4a3a2a" opacity="0.6" />

          {/* Fire glow on ground */}
          <ellipse
            cx="100" cy="160"
            rx={22 + energy * 8} ry={6 + energy * 2}
            fill={fireColor1}
            opacity={0.15 + energy * 0.1}
          />

          {/* Flame tongues */}
          <g transform={`translate(100, 155) scale(${fireScale})`}>
            {/* Flame 1 — center tall */}
            <path
              d={`M 0,0 Q ${-3 + flickerA * 0.3},${-18 - energy * 8} ${flickerA * 0.5},${-30 - energy * 10} Q ${2 + flickerB * 0.2},${-18 - energy * 6} 0,0`}
              fill={fireColor1}
              opacity={0.9}
            />
            {/* Flame 2 — left */}
            <path
              d={`M -3,0 Q ${-8 + flickerB * 0.3},${-14 - energy * 6} ${-4 + flickerC * 0.3},${-22 - energy * 7} Q ${-1 + flickerA * 0.2},${-10 - energy * 4} -3,0`}
              fill={fireColor2}
              opacity={0.85}
            />
            {/* Flame 3 — right */}
            <path
              d={`M 3,0 Q ${7 + flickerC * 0.3},${-12 - energy * 5} ${5 + flickerD * 0.4},${-20 - energy * 6} Q ${2 + flickerB * 0.2},${-8 - energy * 3} 3,0`}
              fill={fireColor3}
              opacity={0.85}
            />
            {/* Flame 4 — inner bright core */}
            <path
              d={`M 0,0 Q ${-1 + flickerD * 0.2},${-10 - energy * 4} ${flickerA * 0.2},${-16 - energy * 5} Q ${1 + flickerC * 0.1},${-8 - energy * 3} 0,0`}
              fill="#ffe4a0"
              opacity={0.7 + snap.beatDecay * 0.3}
            />
          </g>

          {/* Embers */}
          {embers}

          {/* Seated silhouettes */}
          {silhouettes}
        </svg>
      </div>
    </div>
  );
};
