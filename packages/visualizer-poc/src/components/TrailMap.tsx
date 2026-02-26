/**
 * TrailMap — Dotted trail path that traces across the screen.
 * A winding path of dots/dashes that grows from left to right, speed
 * varying with tempo/energy. Waypoint markers at energy peaks.
 * Distance counter ticks up. Neon warm amber/red colors.
 * Positioned mid-height band. Appears every 50s for 14s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1500; // 50 seconds at 30fps
const DURATION = 420; // 14 seconds visible
const NUM_TRAIL_POINTS = 120;

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const TrailMap: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Pre-compute trail shape
  const trailPoints = React.useMemo(() => {
    const rng = mulberry32(42069);
    const pts: Array<{ x: number; y: number }> = [];
    let y = 0.5;
    for (let i = 0; i < NUM_TRAIL_POINTS; i++) {
      const x = i / (NUM_TRAIL_POINTS - 1);
      // Wandering path with seeded noise
      y += (rng() - 0.5) * 0.06;
      y = Math.max(0.25, Math.min(0.75, y));
      pts.push({ x, y });
    }
    return pts;
  }, []);

  // Pre-compute waypoint positions (at roughly even intervals with slight variation)
  const waypoints = React.useMemo(() => {
    const rng = mulberry32(77777);
    const wps: number[] = [];
    for (let i = 0; i < NUM_TRAIL_POINTS; i++) {
      if (i > 0 && i % 15 === 0) {
        wps.push(i + Math.floor((rng() - 0.5) * 4));
      }
    }
    return wps.filter((w) => w >= 0 && w < NUM_TRAIL_POINTS);
  }, []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.2, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // How far along the trail we've drawn (0-1), speed varies with energy
  const trailSpeed = 0.5 + energy * 2;
  const trailProgress = Math.min(1, (cycleFrame / DURATION) * trailSpeed);
  const visibleCount = Math.floor(trailProgress * NUM_TRAIL_POINTS);

  const amber = "#FFAA44";
  const red = "#FF4444";
  const pale = "#FFE8CC";

  const glowSize = interpolate(energy, [0.02, 0.3], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Distance counter
  const distance = (trailProgress * 12.4).toFixed(1);

  // Build visible trail path
  const margin = width * 0.08;
  const trailW = width - margin * 2;
  const trailH = height * 0.5;
  const trailTop = height * 0.25;

  // Build SVG path for visible portion
  let pathD = "";
  for (let i = 0; i < visibleCount && i < trailPoints.length; i++) {
    const pt = trailPoints[i];
    const px = margin + pt.x * trailW;
    const py = trailTop + pt.y * trailH;
    if (i === 0) {
      pathD += `M ${px} ${py}`;
    } else {
      pathD += ` L ${px} ${py}`;
    }
  }

  // Current head position
  const headIdx = Math.min(visibleCount, trailPoints.length - 1);
  const headPt = trailPoints[headIdx];
  const headX = margin + headPt.x * trailW;
  const headY = trailTop + headPt.y * trailH;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${amber})`,
          willChange: "opacity",
        }}
      >
        {/* Trail path (dashed line) */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke={amber}
            strokeWidth={2}
            strokeDasharray="8 5"
            opacity={0.7}
            strokeLinecap="round"
          />
        )}

        {/* Dots at each trail point */}
        {trailPoints.slice(0, visibleCount).map((pt, i) => {
          if (i % 3 !== 0) return null;
          const px = margin + pt.x * trailW;
          const py = trailTop + pt.y * trailH;
          const age = (visibleCount - i) / NUM_TRAIL_POINTS;
          const dotOpacity = interpolate(age, [0, 0.5], [0.7, 0.15], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <circle key={`dot-${i}`} cx={px} cy={py} r={2} fill={amber} opacity={dotOpacity} />
          );
        })}

        {/* Waypoint markers */}
        {waypoints.map((wpIdx) => {
          if (wpIdx >= visibleCount) return null;
          const pt = trailPoints[wpIdx];
          const px = margin + pt.x * trailW;
          const py = trailTop + pt.y * trailH;
          return (
            <g key={`wp-${wpIdx}`}>
              <circle cx={px} cy={py} r={6} fill="none" stroke={red} strokeWidth={1.5} opacity={0.6} />
              <circle cx={px} cy={py} r={2.5} fill={red} opacity={0.5} />
              {/* Flag */}
              <line x1={px} y1={py - 6} x2={px} y2={py - 18} stroke={red} strokeWidth={1} opacity={0.5} />
              <polygon
                points={`${px},${py - 18} ${px + 8},${py - 15} ${px},${py - 12}`}
                fill={red}
                opacity={0.35}
              />
            </g>
          );
        })}

        {/* Trail head (current position) */}
        <circle cx={headX} cy={headY} r={5 + energy * 4} fill={amber} opacity={0.8} />
        <circle cx={headX} cy={headY} r={10 + energy * 8} fill="none" stroke={amber} strokeWidth={1} opacity={0.3} />

        {/* Distance counter */}
        <text
          x={headX + 15}
          y={headY - 15}
          fill={pale}
          fontSize={11}
          fontFamily="monospace"
          opacity={0.6}
        >
          {distance} mi
        </text>

        {/* Start marker */}
        {trailPoints.length > 0 && (
          <g>
            <circle
              cx={margin + trailPoints[0].x * trailW}
              cy={trailTop + trailPoints[0].y * trailH}
              r={4}
              fill="none"
              stroke={pale}
              strokeWidth={1.5}
              opacity={0.5}
            />
            <text
              x={margin + trailPoints[0].x * trailW}
              y={trailTop + trailPoints[0].y * trailH - 12}
              textAnchor="middle"
              fill={pale}
              fontSize={9}
              fontFamily="monospace"
              opacity={0.4}
            >
              START
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
