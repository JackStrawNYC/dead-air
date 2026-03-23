/**
 * SpeakerStack — Wall of Sound speaker cone array.
 * Layer 4, tier A, tags: intense, dead-culture.
 * 4x3 grid of speaker cones (circles with inner rings).
 * Each cone pulses with different frequency band — top row highs, middle mids, bottom bass.
 * Cones vibrate (scale pulse) on beatDecay. Dark cone bodies, bright rims.
 * Position: fills lower half.
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

/** Single speaker cone */
const SpeakerCone: React.FC<{
  cx: number;
  cy: number;
  r: number;
  pulse: number;
  rimColor: string;
  beatDecay: number;
  frame: number;
  index: number;
  tempoFactor: number;
}> = ({ cx, cy, r, pulse, rimColor, beatDecay, frame, index, tempoFactor }) => {
  // Each cone vibrates slightly differently
  const vibrate = Math.sin(frame * 0.3 * tempoFactor + index * 1.1) * 0.5 * beatDecay;
  const coneScale = 1 + pulse * 0.08 + vibrate * 0.02;
  // Inner cone displacement (simulates speaker pushing outward)
  const push = pulse * 2 + beatDecay * 1.5;

  return (
    <g transform={`translate(${cx}, ${cy}) scale(${coneScale})`}>
      {/* Outer rim */}
      <circle cx={0} cy={0} r={r} fill="#1a1a1a" stroke={rimColor} strokeWidth="1.5" />
      {/* Surround ring */}
      <circle cx={0} cy={0} r={r * 0.85} fill="none" stroke="#333" strokeWidth="1" opacity="0.6" />
      {/* Cone body */}
      <circle cx={0} cy={0} r={r * 0.7} fill="#222" stroke="#444" strokeWidth="0.8" />
      {/* Inner cone — pushes with audio */}
      <circle
        cx={0} cy={0}
        r={r * 0.45 + push * 0.3}
        fill="#2a2a2a"
        stroke={rimColor}
        strokeWidth="0.6"
        opacity={0.7 + pulse * 0.3}
      />
      {/* Dust cap (center dome) */}
      <circle
        cx={0} cy={0}
        r={r * 0.18 + push * 0.1}
        fill="#333"
        stroke={rimColor}
        strokeWidth="0.5"
        opacity={0.8}
      />
      {/* Highlight on dust cap */}
      <circle
        cx={-r * 0.05} cy={-r * 0.05}
        r={r * 0.06}
        fill={rimColor}
        opacity={0.15 + pulse * 0.2}
      />
    </g>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const SpeakerStack: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Opacity based on energy — tier A so more visible
  const opacity = interpolate(energy, [0.02, 0.3], [0.25, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Rim color from chromaHue
  const rimColor = hueToHex(chromaHue);
  const rimColor2 = hueToHex(chromaHue + 0.1);

  // Frequency bands for rows
  const bassReact = snap.bass;
  const midReact = energy;
  const highReact = interpolate(snap.chromaHue, [0, 360], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * 0.5 + snap.onsetEnvelope * 0.5;

  // Grid: 4 columns x 3 rows
  const cols = 4;
  const rows = 3;
  const coneRadius = 11;
  const spacingX = 28;
  const spacingY = 26;
  const gridWidth = (cols - 1) * spacingX;
  const gridStartX = (120 - gridWidth) / 2 + coneRadius;
  const gridStartY = 18;

  const rowBands = [highReact, midReact, bassReact];

  const cones: React.ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      const cx = gridStartX + col * spacingX;
      const cy = gridStartY + row * spacingY;
      const bandPulse = rowBands[row];
      // Slightly offset each cone's phase for organic feel
      const phasedPulse = bandPulse * (0.7 + Math.sin(frame * 0.1 * tempoFactor + idx * 0.9) * 0.3);

      cones.push(
        <SpeakerCone
          key={idx}
          cx={cx}
          cy={cy}
          r={coneRadius}
          pulse={phasedPulse}
          rimColor={row === 2 ? rimColor2 : rimColor}
          beatDecay={snap.beatDecay}
          frame={frame}
          index={idx}
          tempoFactor={tempoFactor}
        />,
      );
    }
  }

  // Cabinet outline
  const cabinetGlow = interpolate(energy, [0.1, 0.4], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const baseWidth = width * 0.55;
  const baseHeight = height * 0.45;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${cabinetGlow}px ${rimColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <svg
          width={baseWidth}
          height={baseHeight}
          viewBox="0 0 120 95"
          fill="none"
        >
          {/* Cabinet body */}
          <rect
            x="2" y="2"
            width="116" height="91"
            rx="3"
            fill="#0d0d0d"
            stroke="#333"
            strokeWidth="1.5"
          />
          {/* Cabinet inner border */}
          <rect
            x="5" y="5"
            width="110" height="85"
            rx="2"
            fill="none"
            stroke="#222"
            strokeWidth="0.8"
          />

          {/* Speaker cones */}
          {cones}

          {/* Cabinet screws — corners */}
          <circle cx="7" cy="7" r="1.5" fill="#444" />
          <circle cx="113" cy="7" r="1.5" fill="#444" />
          <circle cx="7" cy="88" r="1.5" fill="#444" />
          <circle cx="113" cy="88" r="1.5" fill="#444" />

          {/* Bass port (bottom center) */}
          <rect x="50" y="82" width="20" height="5" rx="2" fill="#111" stroke="#333" strokeWidth="0.5" />
        </svg>
      </div>
    </div>
  );
};
