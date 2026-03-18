/**
 * PhilLesh — Layer 6 (Character)
 * Bass silhouette pulsing with uStemBass. Concentric bass-note rings.
 * Fills missing musician gap.
 * Tier B | Tags: dead-culture, organic | dutyCycle: 100 | energyBand: mid
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";

const STAGGER_START = 180;

interface Props {
  frames: EnhancedFrameData[];
}

export const PhilLesh: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const f = frames[idx];
  const energy = f.rms;
  const stemBass = f.stemBassRms ?? f.sub;
  const beat = f.beat;

  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const masterOpacity = interpolate(energy, [0.05, 0.15, 0.35], [0.02, 0.10, 0.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * masterFade;

  if (masterOpacity < 0.005) return null;

  // Bass pulse scale
  const bassPulse = 1 + stemBass * 0.08;

  // Position: left side, lower third
  const cx = width * 0.15;
  const cy = height * 0.65;
  const silhouetteScale = 0.7 * bassPulse;

  // Bass note rings
  const numRings = 4;
  const rings = Array.from({ length: numRings }, (_, i) => {
    const age = ((frame - i * 15) % 90) / 90;
    const r = 30 + age * 120 * stemBass;
    const opacity = (1 - age) * 0.3 * stemBass;
    return { r, opacity, age };
  });

  // Silhouette body sway
  const sway = Math.sin(frame * 0.025) * 3 * stemBass;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, mixBlendMode: "screen" }}>
        {/* Bass note rings */}
        {rings.map((ring, i) => (
          ring.opacity > 0.01 && (
            <circle
              key={`ring-${i}`}
              cx={cx}
              cy={cy}
              r={ring.r}
              fill="none"
              stroke={`hsla(270, 50%, 60%, ${ring.opacity})`}
              strokeWidth={1.5}
            />
          )
        ))}

        {/* Phil silhouette — simplified bass player shape */}
        <g transform={`translate(${cx + sway}, ${cy}) scale(${silhouetteScale})`}>
          {/* Head */}
          <circle cx={0} cy={-85} r={14} fill="hsla(270, 30%, 50%, 0.7)" />
          {/* Body */}
          <ellipse cx={0} cy={-50} rx={18} ry={30} fill="hsla(270, 30%, 45%, 0.6)" />
          {/* Bass guitar body */}
          <ellipse cx={-25} cy={-35} rx={20} ry={12} fill="hsla(270, 40%, 55%, 0.5)"
            transform="rotate(-15, -25, -35)" />
          {/* Neck of bass */}
          <line x1={-35} y1={-42} x2={-55} y2={-80} stroke="hsla(270, 40%, 55%, 0.5)" strokeWidth={3} />
          {/* Arms position */}
          <line x1={5} y1={-60} x2={-20} y2={-40} stroke="hsla(270, 30%, 45%, 0.5)" strokeWidth={5} strokeLinecap="round" />
          <line x1={-5} y1={-55} x2={-30} y2={-30} stroke="hsla(270, 30%, 45%, 0.5)" strokeWidth={5} strokeLinecap="round" />
          {/* Legs */}
          <line x1={-8} y1={-22} x2={-12} y2={10} stroke="hsla(270, 30%, 45%, 0.5)" strokeWidth={6} strokeLinecap="round" />
          <line x1={8} y1={-22} x2={12} y2={10} stroke="hsla(270, 30%, 45%, 0.5)" strokeWidth={6} strokeLinecap="round" />
        </g>

        {/* Bass string vibration line */}
        {stemBass > 0.2 && (
          <path
            d={`M ${cx - 60} ${cy - 60} Q ${cx - 40 + Math.sin(frame * 0.3) * 5 * stemBass} ${cy - 50}, ${cx - 20} ${cy - 40}`}
            fill="none"
            stroke={`hsla(270, 60%, 70%, ${stemBass * 0.4})`}
            strokeWidth={1}
          />
        )}
      </svg>
    </div>
  );
};
