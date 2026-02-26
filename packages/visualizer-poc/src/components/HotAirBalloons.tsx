/**
 * HotAirBalloons -- 3-5 hot air balloons floating upward slowly.
 * Each balloon is a large oval/teardrop envelope with horizontal stripe pattern,
 * basket hanging below (small rectangle connected by 4 lines).
 * Bright colors: red/yellow, blue/white, green/gold. Balloons sway gently
 * side-to-side. Rise speed driven by energy. Cycle: 60s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";

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

interface BalloonDef {
  envelopeColor1: string;
  envelopeColor2: string;
  xFraction: number;
  phase: number;
  swayAmp: number;
  swayFreq: number;
  sizeScale: number;
  riseSpeedBase: number;
}

const NUM_BALLOONS = 4;
const VISIBLE_DURATION = 540; // 18s at 30fps
const CYCLE_GAP = 1260;       // 42s gap (60s total - 18s visible)
const CYCLE_TOTAL = VISIBLE_DURATION + CYCLE_GAP;

function generateBalloons(seed: number): BalloonDef[] {
  const rng = seeded(seed);
  const palettes: Array<[string, string]> = [
    ["#E53935", "#FFD600"], // red / yellow
    ["#1565C0", "#ECEFF1"], // blue / white
    ["#2E7D32", "#FFB300"], // green / gold
    ["#AD1457", "#FF8F00"], // magenta / amber
    ["#6A1B9A", "#26C6DA"], // purple / cyan
  ];
  return Array.from({ length: NUM_BALLOONS }, (_, i) => {
    const pal = palettes[i % palettes.length];
    return {
      envelopeColor1: pal[0],
      envelopeColor2: pal[1],
      xFraction: 0.1 + rng() * 0.8,
      phase: rng() * Math.PI * 2,
      swayAmp: 20 + rng() * 40,
      swayFreq: 0.01 + rng() * 0.015,
      sizeScale: 0.8 + rng() * 0.4,
      riseSpeedBase: 0.8 + rng() * 0.5,
    };
  });
}

/** Single hot air balloon SVG */
const Balloon: React.FC<{
  color1: string;
  color2: string;
  size: number;
  gradId: string;
}> = ({ color1, color2, size, gradId }) => {
  const w = size;
  const h = size * 1.6;
  return (
    <svg width={w} height={h} viewBox="0 0 80 128" fill="none">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color1} />
          <stop offset="50%" stopColor={color2} />
          <stop offset="100%" stopColor={color1} />
        </linearGradient>
      </defs>
      {/* Envelope (teardrop) */}
      <path
        d="M 40 4 C 62 4, 76 24, 76 48 C 76 68, 60 82, 50 88 L 30 88 C 20 82, 4 68, 4 48 C 4 24, 18 4, 40 4 Z"
        fill={`url(#${gradId})`}
        opacity="0.9"
      />
      {/* Horizontal stripes on envelope */}
      <line x1="8" y1="28" x2="72" y2="28" stroke={color2} strokeWidth="2" opacity="0.5" />
      <line x1="5" y1="42" x2="75" y2="42" stroke={color1} strokeWidth="2" opacity="0.4" />
      <line x1="6" y1="56" x2="74" y2="56" stroke={color2} strokeWidth="2" opacity="0.5" />
      <line x1="12" y1="70" x2="68" y2="70" stroke={color1} strokeWidth="2" opacity="0.4" />
      {/* Skirt (bottom of envelope) */}
      <path
        d="M 30 88 L 28 94 L 52 94 L 50 88"
        fill={color1}
        opacity="0.7"
      />
      {/* Rigging lines from skirt to basket */}
      <line x1="30" y1="94" x2="32" y2="110" stroke="#8D6E63" strokeWidth="1" opacity="0.6" />
      <line x1="50" y1="94" x2="48" y2="110" stroke="#8D6E63" strokeWidth="1" opacity="0.6" />
      <line x1="36" y1="94" x2="35" y2="110" stroke="#8D6E63" strokeWidth="1" opacity="0.6" />
      <line x1="44" y1="94" x2="45" y2="110" stroke="#8D6E63" strokeWidth="1" opacity="0.6" />
      {/* Basket */}
      <rect x="30" y="110" width="20" height="12" rx="2" fill="#6D4C41" opacity="0.8" />
      <rect x="30" y="110" width="20" height="3" rx="1" fill="#8D6E63" opacity="0.7" />
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const HotAirBalloons: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const balloons = React.useMemo(() => generateBalloons((ctx?.showSeed ?? 19770508)), [ctx?.showSeed]);

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

  // Only visible during the first VISIBLE_DURATION frames of each cycle
  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  // Fade in/out
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
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.8;

  if (masterOpacity < 0.01) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {balloons.map((b, i) => {
        const size = 70 * b.sizeScale;

        // Rise: starts below screen, floats up. Energy increases speed.
        const riseSpeed = b.riseSpeedBase + energy * 1.5;
        const yStart = height + 50;
        const yEnd = -size * 2.5;
        const yRange = yStart - yEnd;
        const yProgress = (cycleFrame * riseSpeed) / yRange;
        const y = yStart - yProgress * yRange;

        // Sway side to side
        const sway = Math.sin(frame * b.swayFreq + b.phase) * b.swayAmp * (1 + energy * 0.5);
        const x = b.xFraction * width + sway;

        // Gentle tilt from sway
        const tilt = Math.sin(frame * b.swayFreq + b.phase + 0.3) * 4;

        // Neon glow
        const glow = `drop-shadow(0 0 12px ${b.envelopeColor1}88) drop-shadow(0 0 30px ${b.envelopeColor1}44)`;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - size / 2,
              top: y,
              transform: `rotate(${tilt}deg)`,
              opacity: masterOpacity,
              filter: glow,
              willChange: "transform, opacity",
            }}
          >
            <Balloon
              color1={b.envelopeColor1}
              color2={b.envelopeColor2}
              size={size}
              gradId={`balloon-grad-${i}`}
            />
          </div>
        );
      })}
    </div>
  );
};
