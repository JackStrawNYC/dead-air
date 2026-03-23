/**
 * GratefulMandala — kaleidoscopic 8-pointed star with stealie motifs at tips.
 * Layer 2, tier A, tags: dead-culture, psychedelic.
 * Central bolt design. Rotates slowly with tempoFactor. Arms extend/contract
 * with slowEnergy. Colors cycle with chromaHue. Glows with bass.
 * Position: center, breathes with energy.
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

interface Props {
  frames: EnhancedFrameData[];
}

export const GratefulMandala: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Opacity: 0.25-0.65 (tier A — more prominent)
  const opacity = interpolate(energy, [0.02, 0.35], [0.25, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow sacred rotation
  const rotation = (frame / 30) * 1.5 * tempoFactor + snap.beatDecay * 2;

  // Arm extension: breathes with slowEnergy
  const armExtension = interpolate(slowEnergy, [0.02, 0.3], [0.7, 1.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bass glow
  const bassGlow = interpolate(snap.bass, [0.05, 0.4], [5, 30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Colors
  const mainColor = hueToHex(chromaHue);
  const secondColor = hueToHex(chromaHue + 0.12);
  const thirdColor = hueToHex(chromaHue + 0.25);
  const boltColor = hueToHex(chromaHue + 0.4);

  // Size breathes with energy
  const baseSize = Math.min(width, height) * 0.32;
  const breathe = interpolate(slowEnergy, [0.02, 0.3], [0.85, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const size = baseSize * breathe;

  // 8-pointed star arms
  const armCount = 8;
  const arms: React.ReactNode[] = [];
  const innerR = 20;
  const outerR = 70 * armExtension;

  for (let i = 0; i < armCount; i++) {
    const angle = (i / armCount) * Math.PI * 2;
    const halfStep = Math.PI / armCount;

    // Outer tip
    const tipX = 100 + Math.cos(angle) * outerR;
    const tipY = 100 + Math.sin(angle) * outerR;

    // Inner notches (between arms)
    const leftX = 100 + Math.cos(angle - halfStep) * innerR;
    const leftY = 100 + Math.sin(angle - halfStep) * innerR;
    const rightX = 100 + Math.cos(angle + halfStep) * innerR;
    const rightY = 100 + Math.sin(angle + halfStep) * innerR;

    // Arm color alternates
    const armColor = i % 2 === 0 ? mainColor : secondColor;

    arms.push(
      <polygon
        key={`arm-${i}`}
        points={`${leftX},${leftY} ${tipX},${tipY} ${rightX},${rightY}`}
        fill={armColor}
        opacity={0.2 + energy * 0.15}
        stroke={armColor}
        strokeWidth="1"
      />,
    );

    // Mini stealie at tip of each arm
    const miniR = 6 + snap.beatDecay * 2;
    arms.push(
      <g key={`stealie-${i}`}>
        {/* Mini skull circle */}
        <circle
          cx={tipX}
          cy={tipY}
          r={miniR}
          stroke={thirdColor}
          strokeWidth="1"
          fill="none"
          opacity={0.5 + energy * 0.3}
        />
        {/* Mini bolt line */}
        <line
          x1={tipX}
          y1={tipY - miniR * 0.8}
          x2={tipX}
          y2={tipY + miniR * 0.8}
          stroke={boltColor}
          strokeWidth="1.2"
          opacity={0.6 + snap.onsetEnvelope * 0.4}
        />
      </g>,
    );
  }

  // Decorative rings
  const ringCount = 3;
  const rings: React.ReactNode[] = [];
  for (let i = 0; i < ringCount; i++) {
    const r = 25 + i * 15 * armExtension;
    rings.push(
      <circle
        key={`ring-${i}`}
        cx="100"
        cy="100"
        r={r}
        stroke={i % 2 === 0 ? mainColor : secondColor}
        strokeWidth="0.8"
        fill="none"
        opacity={0.2 + slowEnergy * 0.2}
        strokeDasharray={i === 1 ? "4 3" : "none"}
      />,
    );
  }

  // Central bolt — the sacred center
  const boltOpacity = 0.5 + snap.onsetEnvelope * 0.5;

  // Onset scale spike
  const onsetScale = 1 + snap.onsetEnvelope * 0.06;

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
          filter: `drop-shadow(0 0 ${bassGlow}px ${mainColor}) drop-shadow(0 0 ${bassGlow * 1.5}px ${secondColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
          {/* Star arms with stealies at tips */}
          {arms}

          {/* Decorative concentric rings */}
          {rings}

          {/* Central bolt */}
          <polygon
            points="100,65 96,95 104,95 94,135 106,108 98,108 104,65"
            fill={boltColor}
            opacity={boltOpacity}
          />

          {/* Central glow circle */}
          <circle
            cx="100"
            cy="100"
            r="12"
            fill={mainColor}
            opacity={0.1 + energy * 0.2}
          />

          {/* Outer boundary ring */}
          <circle
            cx="100"
            cy="100"
            r={outerR + 8}
            stroke={mainColor}
            strokeWidth="1.5"
            fill="none"
            opacity={0.2 + snap.beatDecay * 0.2}
          />
        </svg>
      </div>
    </div>
  );
};
