/**
 * Tumbleweed — 2-3 tumbleweeds rolling across screen from right to left.
 * Each tumbleweed is a circle of scratchy interlocking lines (random short strokes
 * inside a circular boundary). Tumbleweeds rotate as they roll. Slight bounce motion
 * (small vertical sine). Brown/tan/khaki color. Roll speed driven by energy.
 * New tumbleweeds enter at staggered intervals.
 * Cycle: 45s, 14s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUM_WEEDS = 3;
const VISIBLE_DURATION = 420; // 14s at 30fps
const CYCLE_GAP = 930; // 31s gap (45s total - 14s visible)
const CYCLE_TOTAL = VISIBLE_DURATION + CYCLE_GAP;

const COLORS = ["#8B7355", "#C4A777", "#6B5B3A"]; // brown, tan, dark khaki

interface WeedStrokes {
  lines: { x1: number; y1: number; x2: number; y2: number }[];
}

function generateWeedStrokes(seed: number, count: number): WeedStrokes {
  const rng = seeded(seed);
  const lines: WeedStrokes["lines"] = [];
  const radius = 28;
  for (let i = 0; i < count; i++) {
    // Random point inside the circular boundary
    const angle = rng() * Math.PI * 2;
    const r = rng() * radius;
    const cx = Math.cos(angle) * r;
    const cy = Math.sin(angle) * r;
    // Short stroke from this point in a random direction
    const strokeAngle = rng() * Math.PI * 2;
    const strokeLen = 6 + rng() * 16;
    let x2 = cx + Math.cos(strokeAngle) * strokeLen;
    let y2 = cy + Math.sin(strokeAngle) * strokeLen;
    // Clamp to circle boundary
    const dist2 = Math.sqrt(x2 * x2 + y2 * y2);
    if (dist2 > radius) {
      x2 = (x2 / dist2) * radius;
      y2 = (y2 / dist2) * radius;
    }
    lines.push({ x1: cx, y1: cy, x2, y2 });
  }
  return { lines };
}

interface TumbleweedSVGProps {
  size: number;
  color: string;
  strokes: WeedStrokes;
  rotation: number;
}

const TumbleweedSVG: React.FC<TumbleweedSVGProps> = ({
  size,
  color,
  strokes,
  rotation,
}) => (
  <svg width={size} height={size} viewBox="-35 -35 70 70" fill="none">
    <g transform={`rotate(${rotation})`}>
      {/* Outer circle boundary */}
      <circle cx={0} cy={0} r={28} stroke={color} strokeWidth={1.2} opacity={0.5} fill="none" />
      <circle cx={0} cy={0} r={22} stroke={color} strokeWidth={0.8} opacity={0.3} fill="none" />
      {/* Scratchy interlocking lines */}
      {strokes.lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={color}
          strokeWidth={0.8 + (i % 3) * 0.3}
          strokeLinecap="round"
          opacity={0.5 + (i % 4) * 0.1}
        />
      ))}
      {/* Cross-hatch arcs for texture */}
      <path
        d="M -20 -10 Q 0 -25 20 -10"
        stroke={color}
        strokeWidth={0.7}
        fill="none"
        opacity={0.35}
      />
      <path
        d="M -15 8 Q 0 22 15 8"
        stroke={color}
        strokeWidth={0.7}
        fill="none"
        opacity={0.35}
      />
    </g>
  </svg>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const Tumbleweed: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const weedData = React.useMemo(() => {
    const data: { strokes: WeedStrokes; sizeBase: number; yOffset: number; stagger: number }[] = [];
    for (let i = 0; i < NUM_WEEDS; i++) {
      const rng = seeded(505077 + i * 1337);
      data.push({
        strokes: generateWeedStrokes(707077 + i * 999, 30 + Math.floor(rng() * 15)),
        sizeBase: 55 + rng() * 30,
        yOffset: rng() * 60,
        stagger: i * 0.08,
      });
    }
    return data;
  }, []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleFrame = frame % CYCLE_TOTAL;

  // Only render during visible portion
  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0, 0.2], [0.45, 0.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const yBase = height - 100;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {weedData.map((wd, i) => {
        const weedProgress = progress - wd.stagger;
        // Roll from right to left
        const speedMult = 1 + energy * 1.5;
        const x = interpolate(weedProgress * speedMult, [0, 1], [width + 80, -120], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        // Bounce via sine
        const bounceAmp = 8 + energy * 12;
        const bounceFreq = 0.06 + energy * 0.04;
        const bounce = Math.abs(Math.sin(frame * bounceFreq + i * 2.1)) * bounceAmp;

        // Rotation — rolls as it moves
        const rollSpeed = 2.5 + energy * 3;
        const rotation = frame * rollSpeed + i * 120;

        // Individual fade
        const indFadeIn = interpolate(weedProgress, [0, 0.08], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const indFadeOut = interpolate(weedProgress, [0.85, 0.95], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const indOpacity = Math.min(indFadeIn, indFadeOut);

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: yBase - bounce - wd.yOffset,
              opacity: masterOpacity * Math.max(0, indOpacity),
              willChange: "transform, opacity",
            }}
          >
            <TumbleweedSVG
              size={wd.sizeBase}
              color={COLORS[i % COLORS.length]}
              strokes={wd.strokes}
              rotation={rotation}
            />
          </div>
        );
      })}
    </div>
  );
};
