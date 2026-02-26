/**
 * Dragonfly — 6-10 dragonflies with translucent iridescent wings darting
 * across the screen. Each dragonfly has a long thin body with two pairs of
 * elongated wings that beat rapidly. Speed and darting intensity varies with
 * energy. Wings shimmer with spectral iridescence.
 * Cycle: 55s (1650 frames), 18s (540 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 1650;   // 55s at 30fps
const DURATION = 540;  // 18s visible
const MAX_COUNT = 8;

interface DragonflyData {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  midXOff: number;
  midYOff: number;
  wingSpeed: number;
  wingPhase: number;
  bodyLen: number;
  hueBase: number;
  delay: number;
}

function generate(seed: number): DragonflyData[] {
  const rng = mulberry32(seed);
  const result: DragonflyData[] = [];
  for (let i = 0; i < MAX_COUNT; i++) {
    const fromLeft = rng() > 0.5;
    result.push({
      startX: fromLeft ? -0.08 : 1.08,
      startY: 0.1 + rng() * 0.6,
      endX: fromLeft ? 1.08 : -0.08,
      endY: 0.15 + rng() * 0.55,
      midXOff: (rng() - 0.5) * 0.3,
      midYOff: (rng() - 0.5) * 0.3,
      wingSpeed: 0.4 + rng() * 0.35,
      wingPhase: rng() * Math.PI * 2,
      bodyLen: 22 + rng() * 18,
      hueBase: rng() * 360,
      delay: rng() * 0.3,
    });
  }
  return result;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Dragonfly: React.FC<Props> = ({ frames }) => {
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

  const cycleIndex = Math.floor(frame / CYCLE);
  const dragonflies = React.useMemo(
    () => generate(cycleIndex * 59 + 882103),
    [cycleIndex],
  );

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
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.75;
  if (masterOpacity < 0.01) return null;

  const visibleCount = Math.floor(
    interpolate(energy, [0.03, 0.25], [4, MAX_COUNT], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {dragonflies.slice(0, visibleCount).map((df, di) => {
          const t = interpolate(
            progress,
            [df.delay, df.delay + (1 - df.delay)],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          if (t < 0.001 || t > 0.999) return null;

          /* speed modulated by energy: faster darting */
          const speedMod = 1 + energy * 2;

          /* quadratic bezier path */
          const midX = (df.startX + df.endX) / 2 + df.midXOff;
          const midY = (df.startY + df.endY) / 2 + df.midYOff;
          const px = (1 - t) * (1 - t) * df.startX + 2 * (1 - t) * t * midX + t * t * df.endX;
          const py = (1 - t) * (1 - t) * df.startY + 2 * (1 - t) * t * midY + t * t * df.endY;

          /* darting jitter */
          const jitterX = Math.sin(frame * 0.15 * speedMod + df.wingPhase) * 0.012 * energy;
          const jitterY = Math.cos(frame * 0.13 * speedMod + df.wingPhase * 1.2) * 0.01 * energy;

          const cx = (px + jitterX) * width;
          const cy = (py + jitterY) * height;

          /* heading */
          const dx = df.endX - df.startX;
          const dy = df.endY - df.startY;
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);

          /* wing beat: very fast, scaleY oscillates */
          const wingBeat = Math.sin(frame * df.wingSpeed * speedMod + df.wingPhase);
          const wingScaleY = 0.15 + (wingBeat + 1) * 0.425;

          const s = df.bodyLen;
          const hue = (df.hueBase + frame * 0.8) % 360;
          const wingColor = `hsla(${hue}, 70%, 70%, 0.35)`;
          const wingStroke = `hsla(${hue}, 80%, 80%, 0.6)`;

          return (
            <g key={di} transform={`translate(${cx}, ${cy}) rotate(${angle})`}>
              {/* body */}
              <line x1={-s * 0.5} y1={0} x2={s * 0.5} y2={0} stroke="#1A3A4A" strokeWidth={2.5} strokeLinecap="round" />
              {/* head */}
              <circle cx={s * 0.5} cy={0} r={3} fill="#2A4A5A" />
              {/* eyes */}
              <circle cx={s * 0.55} cy={-2} r={1.5} fill="#88EEFF" />
              <circle cx={s * 0.55} cy={2} r={1.5} fill="#88EEFF" />
              {/* front wings (upper pair) */}
              <ellipse cx={s * 0.15} cy={0} rx={s * 0.45} ry={s * 0.28 * wingScaleY}
                fill={wingColor} stroke={wingStroke} strokeWidth={0.5}
                transform={`translate(0, ${-s * 0.05 * wingScaleY})`}
              />
              <ellipse cx={s * 0.15} cy={0} rx={s * 0.45} ry={s * 0.28 * wingScaleY}
                fill={wingColor} stroke={wingStroke} strokeWidth={0.5}
                transform={`translate(0, ${s * 0.05 * wingScaleY}) scale(1, -1)`}
                style={{ transformOrigin: `${s * 0.15}px 0px` }}
              />
              {/* rear wings (lower pair, slightly smaller) */}
              <ellipse cx={-s * 0.1} cy={0} rx={s * 0.35} ry={s * 0.22 * wingScaleY}
                fill={wingColor} stroke={wingStroke} strokeWidth={0.5}
                transform={`translate(0, ${-s * 0.04 * wingScaleY})`}
              />
              <ellipse cx={-s * 0.1} cy={0} rx={s * 0.35} ry={s * 0.22 * wingScaleY}
                fill={wingColor} stroke={wingStroke} strokeWidth={0.5}
                transform={`translate(0, ${s * 0.04 * wingScaleY}) scale(1, -1)`}
                style={{ transformOrigin: `${-s * 0.1}px 0px` }}
              />
              {/* wing veins */}
              <line x1={s * 0.15} y1={0} x2={s * 0.55} y2={-s * 0.15 * wingScaleY}
                stroke={wingStroke} strokeWidth={0.3} opacity={0.4} />
              <line x1={s * 0.15} y1={0} x2={s * 0.55} y2={s * 0.15 * wingScaleY}
                stroke={wingStroke} strokeWidth={0.3} opacity={0.4} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
