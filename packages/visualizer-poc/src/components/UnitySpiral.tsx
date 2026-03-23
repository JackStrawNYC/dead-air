/**
 * UnitySpiral — Fibonacci spiral with small traced dots along the path.
 * Layer 2, tier B, tags: cosmic, dead-culture.
 * Spiral grows outward with slowEnergy. Dots travel along spiral path
 * over time. Colors from palette. Gentle rotation. Position: center.
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

/** Golden ratio for Fibonacci spiral */
const PHI = (1 + Math.sqrt(5)) / 2;

/** Get point on a Fibonacci (golden) spiral at parameter t */
function spiralPoint(t: number, scale: number): [number, number] {
  // r = a * phi^(t / (2*pi)) — logarithmic spiral with golden ratio growth
  const a = 2;
  const r = a * Math.pow(PHI, t / (Math.PI * 2)) * scale;
  const x = r * Math.cos(t);
  const y = r * Math.sin(t);
  return [x, y];
}

interface Props {
  frames: EnhancedFrameData[];
}

export const UnitySpiral: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Opacity: 0.15-0.40
  const opacity = interpolate(energy, [0.02, 0.35], [0.15, 0.40], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Spiral scale grows with slowEnergy
  const spiralScale = interpolate(slowEnergy, [0.02, 0.3], [0.6, 1.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Gentle rotation
  const rotation = (frame / 30) * 0.8 * tempoFactor;

  // Colors
  const mainColor = hueToHex(chromaHue);
  const accentColor = hueToHex(chromaHue + 0.2);
  const trailColor = hueToHex(chromaHue + 0.35);

  // Size
  const size = Math.min(width, height) * 0.35;

  // Build spiral path
  const cx = 100;
  const cy = 100;
  const totalTurns = 4; // number of spiral turns
  const steps = 120;
  const maxT = totalTurns * Math.PI * 2;

  // Generate spiral path points
  const pathPoints: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * maxT;
    const [sx, sy] = spiralPoint(t, spiralScale * 3);
    const px = cx + sx;
    const py = cy + sy;
    if (i === 0) {
      pathPoints.push(`M ${px} ${py}`);
    } else {
      pathPoints.push(`L ${px} ${py}`);
    }
  }
  const spiralPath = pathPoints.join(" ");

  // Traveling dots along the spiral
  const dotCount = 16;
  const travelDots: React.ReactNode[] = [];

  for (let i = 0; i < dotCount; i++) {
    // Each dot travels along the spiral over time
    const phase = (i / dotCount) * maxT;
    const travelT = (phase + frame * 0.03 * tempoFactor) % maxT;
    const [dx, dy] = spiralPoint(travelT, spiralScale * 3);
    const dotX = cx + dx;
    const dotY = cy + dy;

    // Progress along spiral determines size and opacity
    const progress = travelT / maxT;
    const dotR = 1.2 + progress * 1.5 + snap.beatDecay * 0.8;
    const dotOpacity = 0.3 + progress * 0.4 + energy * 0.2;

    // Alternate colors
    const dotHue = chromaHue + i * 0.04;
    const dotCol = hueToHex(dotHue);

    travelDots.push(
      <circle
        key={`dot-${i}`}
        cx={dotX}
        cy={dotY}
        r={dotR}
        fill={dotCol}
        opacity={dotOpacity}
      />,
    );
  }

  // Static marker dots at golden angle intervals
  const markerDots: React.ReactNode[] = [];
  const goldenAngle = Math.PI * 2 / (PHI * PHI);
  for (let i = 0; i < 24; i++) {
    const t = i * goldenAngle * 1.8;
    if (t > maxT) break;
    const [mx, my] = spiralPoint(t, spiralScale * 3);
    markerDots.push(
      <circle
        key={`marker-${i}`}
        cx={cx + mx}
        cy={cy + my}
        r="1"
        fill={accentColor}
        opacity={0.2 + slowEnergy * 0.2}
      />,
    );
  }

  // Bass glow
  const bassGlow = interpolate(snap.bass, [0.05, 0.4], [3, 15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Onset pulse
  const onsetScale = 1 + snap.onsetEnvelope * 0.05;

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
          transform: `rotate(${rotation}deg) scale(${onsetScale})`,
          opacity,
          filter: `drop-shadow(0 0 ${bassGlow}px ${mainColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
          {/* Main spiral path */}
          <path
            d={spiralPath}
            stroke={mainColor}
            strokeWidth="1.2"
            fill="none"
            opacity={0.3 + slowEnergy * 0.3}
          />

          {/* Secondary spiral — offset rotation for depth */}
          <g transform={`rotate(137.5, ${cx}, ${cy})`} opacity={0.15 + slowEnergy * 0.15}>
            <path
              d={spiralPath}
              stroke={trailColor}
              strokeWidth="0.7"
              fill="none"
            />
          </g>

          {/* Marker dots at golden positions */}
          {markerDots}

          {/* Traveling dots */}
          {travelDots}

          {/* Center point */}
          <circle
            cx={cx}
            cy={cy}
            r={3 + snap.beatDecay * 2}
            fill={accentColor}
            opacity={0.4 + energy * 0.3}
          />
        </svg>
      </div>
    </div>
  );
};
