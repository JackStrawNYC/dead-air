/**
 * SpaceTimeLattice — perspective grid that warps with bass.
 * Layer 4, tier B, tags: cosmic, psychedelic.
 * 8x6 grid of dots/intersections that distort toward center on bass hits.
 * Bass makes grid warp inward (perspective distortion).
 * Energy drives dot brightness. Position: full screen.
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

export const SpaceTimeLattice: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Opacity: subtle 0.1-0.3
  const opacity = interpolate(energy, [0.02, 0.4], [0.1, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Colors
  const dotColor = hueToHex(chromaHue);
  const lineColor = hueToHex(chromaHue + 0.15);

  // Grid params
  const cols = 8;
  const rows = 6;
  const viewW = 320;
  const viewH = 240;
  const centerX = viewW / 2;
  const centerY = viewH / 2;

  // Bass warp strength
  const warpStrength = interpolate(snap.bass, [0.05, 0.5], [0, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow drift
  const drift = frame * 0.005 * tempoFactor;

  // Compute warped grid positions
  const getWarpedPos = (col: number, row: number): [number, number] => {
    // Base grid position with margins
    const marginX = 30;
    const marginY = 25;
    const baseX = marginX + (col / (cols - 1)) * (viewW - marginX * 2);
    const baseY = marginY + (row / (rows - 1)) * (viewH - marginY * 2);

    // Vector from center
    const dx = baseX - centerX;
    const dy = baseY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
    const normDist = dist / maxDist;

    // Warp: pull toward center proportional to bass, stronger at edges
    const pullFactor = warpStrength * normDist;
    const warpedX = baseX - dx * pullFactor;
    const warpedY = baseY - dy * pullFactor;

    // Subtle wave ripple
    const ripple = Math.sin(dist * 0.05 + drift * 3) * slowEnergy * 3;
    const rippleAngle = Math.atan2(dy, dx);

    return [
      warpedX + Math.cos(rippleAngle) * ripple,
      warpedY + Math.sin(rippleAngle) * ripple,
    ];
  };

  // Build grid dots and lines
  const dots: React.ReactNode[] = [];
  const hLines: React.ReactNode[] = [];
  const vLines: React.ReactNode[] = [];

  // Pre-compute all positions
  const positions: [number, number][][] = [];
  for (let r = 0; r < rows; r++) {
    positions[r] = [];
    for (let c = 0; c < cols; c++) {
      positions[r][c] = getWarpedPos(c, r);
    }
  }

  // Horizontal grid lines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const [x1, y1] = positions[r][c];
      const [x2, y2] = positions[r][c + 1];
      hLines.push(
        <line
          key={`h-${r}-${c}`}
          x1={x1} y1={y1}
          x2={x2} y2={y2}
          stroke={lineColor}
          strokeWidth="0.6"
          opacity={0.2 + slowEnergy * 0.15}
        />,
      );
    }
  }

  // Vertical grid lines
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows - 1; r++) {
      const [x1, y1] = positions[r][c];
      const [x2, y2] = positions[r + 1][c];
      vLines.push(
        <line
          key={`v-${r}-${c}`}
          x1={x1} y1={y1}
          x2={x2} y2={y2}
          stroke={lineColor}
          strokeWidth="0.6"
          opacity={0.2 + slowEnergy * 0.15}
        />,
      );
    }
  }

  // Intersection dots
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [px, py] = positions[r][c];
      // Distance from center affects brightness
      const dx = px - centerX;
      const dy = py - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
      const normDist = dist / maxDist;

      const dotBrightness = interpolate(energy, [0.05, 0.5], [0.3, 0.9], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }) * (0.5 + (1 - normDist) * 0.5);

      const dotRadius = 1.5 + snap.beatDecay * 1.5 * (1 - normDist * 0.5);

      dots.push(
        <circle
          key={`d-${r}-${c}`}
          cx={px}
          cy={py}
          r={dotRadius}
          fill={dotColor}
          opacity={dotBrightness}
        />,
      );
    }
  }

  // Gentle overall rotation
  const rotation = drift * 2;

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
          transform: `rotate(${rotation}deg)`,
          opacity,
          willChange: "transform, opacity",
        }}
      >
        <svg
          width={width * 0.9}
          height={height * 0.9}
          viewBox={`0 0 ${viewW} ${viewH}`}
          fill="none"
        >
          {hLines}
          {vLines}
          {dots}
        </svg>
      </div>
    </div>
  );
};
