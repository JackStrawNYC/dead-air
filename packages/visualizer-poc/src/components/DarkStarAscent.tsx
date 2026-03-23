/**
 * DarkStarAscent — rising spiral with dark star center.
 * Layer 2, tier A, tags: dead-culture, cosmic.
 * Central dark circle (void) with spiral arms ascending upward.
 * Star radiates dark energy (inverted glow). Arms pulse with bass.
 * OnsetSnap triggers arm flash. Cosmic purple/blue palette + chromaHue.
 * Position: center, large.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/** Map 0-1 hue to an RGB hex string */
function hueToHex(h: number): string {
  const s = 0.85;
  const l = 0.6;
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

/** Map 0-1 hue to RGB hex with custom saturation and lightness */
function hueToHexSL(h: number, s: number, l: number): string {
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

export const DarkStarAscent: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Opacity: 0.25-0.60 (tier A)
  const opacity = interpolate(energy, [0.02, 0.35], [0.25, 0.60], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Cosmic purple/blue base palette blended with chromaHue
  // Deep purple = ~0.78, cosmic blue = ~0.65
  const cosmicPurple = hueToHexSL(0.78, 0.7, 0.35);
  const cosmicBlue = hueToHexSL(0.65, 0.8, 0.4);
  const chromaColor = hueToHex(chromaHue);
  const chromaAccent = hueToHex(chromaHue + 0.15);

  // Size: large, breathes with slowEnergy
  const baseSize = Math.min(width, height) * 0.40;
  const breathe = interpolate(slowEnergy, [0.02, 0.3], [0.9, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const size = baseSize * breathe;

  // Slow rotation
  const rotation = (frame / 30) * 1.2 * tempoFactor;

  // Bass pulse on arms
  const bassPulse = interpolate(snap.bass, [0.05, 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Onset flash
  const onsetFlash = snap.onsetEnvelope;

  // Inverted glow: dark center radiates outward
  const voidGlow = interpolate(energy, [0.05, 0.4], [8, 25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cx = 100;
  const cy = 100;
  const voidRadius = 18;

  // Spiral arms ascending
  const armCount = 5;
  const arms: React.ReactNode[] = [];

  for (let a = 0; a < armCount; a++) {
    const armAngleOffset = (a / armCount) * Math.PI * 2;
    const pathPoints: string[] = [];
    const segments = 60;
    const maxT = 3 * Math.PI; // 1.5 turns per arm

    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * maxT;
      // Spiral radius grows with t, pulses with bass
      const baseR = voidRadius + t * (8 + bassPulse * 3);
      // Ascending: y offset decreases (moves upward) as t grows
      const ascent = t * 2.5;
      const angle = t + armAngleOffset;

      const px = cx + Math.cos(angle) * baseR;
      const py = cy - ascent + Math.sin(angle) * baseR * 0.4; // flattened vertically for ascent

      if (i === 0) {
        pathPoints.push(`M ${px.toFixed(1)} ${py.toFixed(1)}`);
      } else {
        pathPoints.push(`L ${px.toFixed(1)} ${py.toFixed(1)}`);
      }
    }

    // Arm color alternates cosmic/chroma
    const armColor = a % 2 === 0 ? cosmicPurple : cosmicBlue;
    const armOpacity = 0.3 + bassPulse * 0.25 + (onsetFlash > 0.3 ? onsetFlash * 0.3 : 0);

    arms.push(
      <path
        key={`arm-${a}`}
        d={pathPoints.join(" ")}
        stroke={armColor}
        strokeWidth={1.5 + bassPulse * 1}
        fill="none"
        opacity={armOpacity}
        strokeLinecap="round"
      />,
    );

    // Onset flash: white overlay on arms
    if (onsetFlash > 0.25) {
      arms.push(
        <path
          key={`flash-${a}`}
          d={pathPoints.join(" ")}
          stroke="white"
          strokeWidth={1 + onsetFlash * 1.5}
          fill="none"
          opacity={onsetFlash * 0.25}
          strokeLinecap="round"
        />,
      );
    }
  }

  // Radiating dark energy rings (inverted glow — dark expanding circles)
  const ringCount = 4;
  const rings: React.ReactNode[] = [];
  for (let i = 0; i < ringCount; i++) {
    const ringPhase = (frame * 0.01 * tempoFactor + i * 0.25) % 1;
    const ringR = voidRadius + ringPhase * 65;
    const ringOpacity = (1 - ringPhase) * 0.2 * (0.5 + energy * 0.5);

    rings.push(
      <circle
        key={`ring-${i}`}
        cx={cx}
        cy={cy}
        r={ringR}
        stroke={cosmicPurple}
        strokeWidth="0.8"
        fill="none"
        opacity={ringOpacity}
      />,
    );
  }

  // Particle motes ascending from the void
  const moteCount = 12;
  const motes: React.ReactNode[] = [];
  for (let i = 0; i < moteCount; i++) {
    const motePhase = ((frame * 0.008 * tempoFactor + i * 0.083) % 1);
    const moteAngle = (i / moteCount) * Math.PI * 2 + frame * 0.002;
    const moteR = voidRadius + motePhase * 55;
    const moteX = cx + Math.cos(moteAngle) * moteR * 0.6;
    const moteY = cy - motePhase * 40 + Math.sin(moteAngle) * moteR * 0.3;
    const moteOpacity = (1 - motePhase) * 0.4 * energy;
    const moteColor = i % 3 === 0 ? chromaColor : i % 3 === 1 ? cosmicBlue : chromaAccent;

    motes.push(
      <circle
        key={`mote-${i}`}
        cx={moteX}
        cy={moteY}
        r={1 + (1 - motePhase) * 1.5}
        fill={moteColor}
        opacity={moteOpacity}
      />,
    );
  }

  // Onset scale spike
  const onsetScale = 1 + onsetFlash * 0.06;

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
          filter: `drop-shadow(0 0 ${voidGlow}px ${cosmicPurple}) drop-shadow(0 0 ${voidGlow * 0.6}px ${cosmicBlue})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
          {/* Dark energy expanding rings */}
          {rings}

          {/* Spiral arms */}
          {arms}

          {/* Ascending motes */}
          {motes}

          {/* The Void — dark star center */}
          <circle
            cx={cx}
            cy={cy}
            r={voidRadius}
            fill="#0a0012"
            opacity={0.85}
          />
          {/* Void edge ring */}
          <circle
            cx={cx}
            cy={cy}
            r={voidRadius}
            stroke={cosmicPurple}
            strokeWidth="1.5"
            fill="none"
            opacity={0.5 + snap.beatDecay * 0.3}
          />
          {/* Inner void shimmer */}
          <circle
            cx={cx}
            cy={cy}
            r={voidRadius * 0.6}
            stroke={cosmicBlue}
            strokeWidth="0.8"
            fill="none"
            opacity={0.2 + energy * 0.2}
          />
          {/* Central singularity dot */}
          <circle
            cx={cx}
            cy={cy}
            r={2}
            fill={chromaColor}
            opacity={0.3 + onsetFlash * 0.7}
          />
        </svg>
      </div>
    </div>
  );
};
