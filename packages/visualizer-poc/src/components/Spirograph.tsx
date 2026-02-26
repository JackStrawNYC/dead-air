/**
 * Spirograph — Rotating hypotrochoid/epitrochoid curves driven by audio.
 * Parametric equations:
 *   x = (R-r)*cos(t) + d*cos((R-r)/r * t)
 *   y = (R-r)*sin(t) + d*sin((R-r)/r * t)
 * where R (outer radius) is driven by bass, r (inner radius) by mids,
 * and d (drawing point offset) by highs. 500+ points rendered as an
 * SVG polyline. The pattern continuously evolves as audio changes.
 * Slow rotation. Neon color shifts along curve length.
 * Energy drives trail brightness. Appears every 50s for 15s.
 * Centered on screen, ~60% of viewport.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1500; // 50 seconds at 30fps
const DURATION = 450; // 15 seconds visible
const NUM_POINTS = 600;
const TWO_PI = Math.PI * 2;

interface Props {
  frames: EnhancedFrameData[];
}

export const Spirograph: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Clamp frame index to valid range
  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy: average RMS over a 151-frame window centered on current frame
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade in over first 10%, fade out over last 12%
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  // Overall opacity: 0.2-0.55 driven by energy
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const viewportSize = Math.min(width, height) * 0.6;

  // Read current audio bands (with smoothing from adjacent frames)
  const fd = frames[idx];
  const smoothWindow = 8;
  let bassSum = 0;
  let midSum = 0;
  let highSum = 0;
  let smoothCount = 0;
  for (let i = Math.max(0, idx - smoothWindow); i <= Math.min(frames.length - 1, idx + smoothWindow); i++) {
    bassSum += frames[i].sub + frames[i].low;
    midSum += frames[i].mid;
    highSum += frames[i].high;
    smoothCount++;
  }
  const bass = smoothCount > 0 ? bassSum / smoothCount : (fd.sub + fd.low);
  const mid = smoothCount > 0 ? midSum / smoothCount : fd.mid;
  const high = smoothCount > 0 ? highSum / smoothCount : fd.high;

  // Hypotrochoid parameters derived from audio
  // R: outer radius (bass drives it, range 3-7)
  const R = interpolate(bass, [0, 1], [3.0, 7.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // r: inner radius (mids drive it, range 1-4, avoid R=r which collapses to circle)
  const rRaw = interpolate(mid, [0, 1], [1.0, 4.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Ensure r differs from R by at least 0.3
  const r = Math.abs(R - rRaw) < 0.3 ? rRaw + 0.5 : rRaw;
  // d: drawing point distance (highs drive it, range 0.5-3.5)
  const d = interpolate(high, [0, 1], [0.5, 3.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Scale factor to fit pattern within viewportSize
  // Max extent of hypotrochoid is approximately |R-r| + d
  const maxExtent = Math.abs(R - r) + d;
  const scale = maxExtent > 0 ? (viewportSize / 2) / maxExtent : 1;

  // Slow time-based phase progression so the pattern continuously evolves
  const timePhase = frame * 0.02;

  // Generate points along the hypotrochoid
  const points: Array<{ x: number; y: number }> = [];
  // Number of full loops for a complete pattern: lcm(R,r)/r revolutions
  // We'll trace multiple full revolutions for visual density
  const revolutions = 8;
  for (let p = 0; p < NUM_POINTS; p++) {
    const t = (p / NUM_POINTS) * revolutions * TWO_PI + timePhase;
    const diff = R - r;
    const ratio = diff / r;
    const x = diff * Math.cos(t) + d * Math.cos(ratio * t);
    const y = diff * Math.sin(t) + d * Math.sin(ratio * t);
    points.push({ x: x * scale, y: y * scale });
  }

  // Slow overall rotation
  const rotation = frame * (0.2 + energy * 0.3);

  // Color cycling along the curve (neon gradient)
  const baseHue = (frame * 0.8) % 360;
  const glowColor1 = `hsl(${baseHue}, 100%, 65%)`;
  const glowColor2 = `hsl(${(baseHue + 120) % 360}, 100%, 65%)`;

  // Energy-driven stroke brightness and width
  const strokeWidth = interpolate(energy, [0.03, 0.3], [1.2, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowRadius = interpolate(energy, [0.03, 0.3], [4, 18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Build the path as segments with varying color along the curve
  const segmentCount = 12;
  const pointsPerSegment = Math.floor(NUM_POINTS / segmentCount);

  const pathSegments: Array<{ d: string; color: string }> = [];
  for (let s = 0; s < segmentCount; s++) {
    const startIdx = s * pointsPerSegment;
    const endIdx = Math.min(startIdx + pointsPerSegment + 1, NUM_POINTS);
    if (startIdx >= NUM_POINTS) break;

    // Build SVG path for this segment
    let pathD = `M ${points[startIdx].x} ${points[startIdx].y}`;
    for (let p = startIdx + 1; p < endIdx; p++) {
      pathD += ` L ${points[p].x} ${points[p].y}`;
    }

    // Color shifts along the curve
    const segHue = (baseHue + (s / segmentCount) * 360) % 360;
    const color = `hsl(${segHue}, 100%, 65%)`;

    pathSegments.push({ d: pathD, color });
  }

  // Spectral flatness modulates a subtle secondary pattern (more tonal = more defined)
  const flatness = fd.flatness;
  const secondaryOpacity = interpolate(flatness, [0, 0.5], [0.3, 0.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Secondary: an epitrochoid (slightly different formula: R+r instead of R-r)
  const secondaryPoints: Array<{ x: number; y: number }> = [];
  const r2 = r * 0.7;
  const d2 = d * 0.6;
  const maxExtent2 = R + r2 + d2;
  const scale2 = maxExtent2 > 0 ? (viewportSize * 0.45) / maxExtent2 : 1;
  for (let p = 0; p < 400; p++) {
    const t = (p / 400) * 6 * TWO_PI + timePhase * 1.3;
    const sum = R + r2;
    const ratio2 = sum / r2;
    const x = sum * Math.cos(t) - d2 * Math.cos(ratio2 * t);
    const y = sum * Math.sin(t) - d2 * Math.sin(ratio2 * t);
    secondaryPoints.push({ x: x * scale2, y: y * scale2 });
  }

  let secondaryPath = `M ${secondaryPoints[0].x} ${secondaryPoints[0].y}`;
  for (let p = 1; p < secondaryPoints.length; p++) {
    secondaryPath += ` L ${secondaryPoints[p].x} ${secondaryPoints[p].y}`;
  }
  const secondaryHue = (baseHue + 60) % 360;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${glowColor1}) drop-shadow(0 0 ${glowRadius * 1.5}px ${glowColor2})`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy}) rotate(${rotation})`}>
          {/* Secondary epitrochoid (behind, dimmer) */}
          <path
            d={secondaryPath}
            stroke={`hsl(${secondaryHue}, 90%, 60%)`}
            strokeWidth={strokeWidth * 0.6}
            fill="none"
            opacity={secondaryOpacity}
          />

          {/* Primary hypotrochoid — color segments */}
          {pathSegments.map((seg, i) => (
            <path
              key={i}
              d={seg.d}
              stroke={seg.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.8}
            />
          ))}

          {/* Center glow dot */}
          <circle
            cx={0}
            cy={0}
            r={3 + energy * 6}
            fill={glowColor1}
            opacity={0.6}
          />
        </g>
      </svg>
    </div>
  );
};
