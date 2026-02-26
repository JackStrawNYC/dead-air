/**
 * KoiPond -- 4-6 koi fish swimming in gentle curves.
 * Each fish is an elongated body with a tail fin that waves.
 * Colors: orange/white, red/white, gold, black/orange.
 * Fish swim in smooth bezier paths, occasionally turning.
 * Energy drives swim speed. Cycle: 65s, 20s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/* ---- seeded PRNG (mulberry32) ---- */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUM_FISH = 5;
const CYCLE = 1950; // 65s at 30fps
const VISIBLE_DURATION = 600; // 20s

interface KoiData {
  /** Primary body color */
  bodyColor: string;
  /** Secondary spot/pattern color */
  spotColor: string;
  /** Body length (px) */
  bodyLength: number;
  /** Body width (px) */
  bodyWidth: number;
  /** Swim path: multiple sine components */
  freqX: number;
  freqY: number;
  ampX: number;
  ampY: number;
  phaseX: number;
  phaseY: number;
  /** Secondary path component */
  freq2X: number;
  freq2Y: number;
  amp2X: number;
  amp2Y: number;
  /** Tail wag frequency */
  tailFreq: number;
  /** Tail wag amplitude */
  tailAmp: number;
  /** Start position */
  startX: number;
  startY: number;
  /** Scale */
  scale: number;
}

const KOI_COLORS: Array<{ body: string; spot: string }> = [
  { body: "#F47B20", spot: "#FFFFFF" },   // orange/white
  { body: "#C0392B", spot: "#FFFFFF" },   // red/white
  { body: "#D4A017", spot: "#FFF8DC" },   // gold
  { body: "#2C2C2C", spot: "#F47B20" },   // black/orange
  { body: "#E74C3C", spot: "#F5D76E" },   // red/gold
];

function generateKoi(seed: number): KoiData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_FISH }, (_, i) => {
    const colors = KOI_COLORS[i % KOI_COLORS.length];
    return {
      bodyColor: colors.body,
      spotColor: colors.spot,
      bodyLength: 45 + rng() * 25,
      bodyWidth: 14 + rng() * 8,
      freqX: 0.003 + rng() * 0.004,
      freqY: 0.004 + rng() * 0.005,
      ampX: 0.15 + rng() * 0.2,
      ampY: 0.1 + rng() * 0.15,
      phaseX: rng() * Math.PI * 2,
      phaseY: rng() * Math.PI * 2,
      freq2X: 0.007 + rng() * 0.005,
      freq2Y: 0.005 + rng() * 0.004,
      amp2X: 0.05 + rng() * 0.08,
      amp2Y: 0.04 + rng() * 0.06,
      tailFreq: 0.12 + rng() * 0.08,
      tailAmp: 8 + rng() * 6,
      startX: 0.15 + rng() * 0.7,
      startY: 0.2 + rng() * 0.6,
      scale: 0.8 + rng() * 0.5,
    };
  });
}

interface Props {
  frames: EnhancedFrameData[];
}

export const KoiPond: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  /* ----- energy ----- */
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  /* memos BEFORE conditional returns */
  const fish = React.useMemo(() => generateKoi(5081977), []);

  /* Cycle: 65s total, 20s visible */
  const cycleFrame = frame % CYCLE;
  const isVisible = cycleFrame < VISIBLE_DURATION;

  /* Fade in/out */
  const fadeIn = interpolate(cycleFrame, [0, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(
    cycleFrame,
    [VISIBLE_DURATION - 60, VISIBLE_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const visibility = isVisible ? Math.min(fadeIn, fadeOut) : 0;

  if (visibility < 0.01) return null;

  /* Energy drives swim speed */
  const swimSpeed = interpolate(energy, [0.03, 0.3], [0.7, 1.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = visibility * 0.6;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <filter id="koi-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {fish.map((koi, fi) => {
          /* Swim position: combined sine waves */
          const t = frame * swimSpeed;
          const px = koi.startX * width
            + Math.sin(t * koi.freqX + koi.phaseX) * koi.ampX * width
            + Math.sin(t * koi.freq2X + koi.phaseX * 1.7) * koi.amp2X * width;
          const py = koi.startY * height
            + Math.cos(t * koi.freqY + koi.phaseY) * koi.ampY * height
            + Math.cos(t * koi.freq2Y + koi.phaseY * 1.3) * koi.amp2Y * height;

          /* Wrap position */
          const wx = ((px % width) + width) % width;
          const wy = ((py % height) + height) % height;

          /* Swimming direction: derivative of position for heading angle */
          const dx = Math.cos(t * koi.freqX + koi.phaseX) * koi.freqX * koi.ampX
            + Math.cos(t * koi.freq2X + koi.phaseX * 1.7) * koi.freq2X * koi.amp2X;
          const dy = -Math.sin(t * koi.freqY + koi.phaseY) * koi.freqY * koi.ampY
            - Math.sin(t * koi.freq2Y + koi.phaseY * 1.3) * koi.freq2Y * koi.amp2Y;
          const heading = Math.atan2(dy, dx) * (180 / Math.PI);

          /* Tail wag */
          const tailWag = Math.sin(frame * koi.tailFreq) * koi.tailAmp;

          const bLen = koi.bodyLength * koi.scale;
          const bWid = koi.bodyWidth * koi.scale;

          /* Fish body path: teardrop shape pointing right */
          const bodyPath = `
            M ${bLen * 0.5} 0
            C ${bLen * 0.3} ${-bWid * 0.5}, ${-bLen * 0.2} ${-bWid * 0.45}, ${-bLen * 0.4} 0
            C ${-bLen * 0.2} ${bWid * 0.45}, ${bLen * 0.3} ${bWid * 0.5}, ${bLen * 0.5} 0
            Z
          `;

          /* Tail: triangle that wags */
          const tailX = -bLen * 0.4;
          const tailTipX = tailX - bLen * 0.3;
          const tailPath = `
            M ${tailX} ${-bWid * 0.15}
            L ${tailTipX} ${-bWid * 0.35 + tailWag}
            L ${tailTipX} ${bWid * 0.35 + tailWag}
            L ${tailX} ${bWid * 0.15}
            Z
          `;

          /* Spot positions (deterministic from fish index) */
          const spotRng = seeded(fi * 999 + 42);
          const spots = Array.from({ length: 3 }, () => ({
            cx: (spotRng() - 0.3) * bLen * 0.5,
            cy: (spotRng() - 0.5) * bWid * 0.4,
            r: 2 + spotRng() * 4,
          }));

          return (
            <g
              key={fi}
              transform={`translate(${wx}, ${wy}) rotate(${heading})`}
              filter="url(#koi-glow)"
            >
              {/* Shadow/water effect */}
              <ellipse
                cx={3}
                cy={3}
                rx={bLen * 0.45}
                ry={bWid * 0.35}
                fill="rgba(0,0,0,0.15)"
                style={{ filter: "blur(4px)" }}
              />
              {/* Tail */}
              <path d={tailPath} fill={koi.bodyColor} opacity={0.85} />
              {/* Body */}
              <path d={bodyPath} fill={koi.bodyColor} />
              {/* Spots */}
              {spots.map((spot, si) => (
                <circle
                  key={si}
                  cx={spot.cx}
                  cy={spot.cy}
                  r={spot.r * koi.scale}
                  fill={koi.spotColor}
                  opacity={0.7}
                />
              ))}
              {/* Eye */}
              <circle
                cx={bLen * 0.3}
                cy={-bWid * 0.12}
                r={2 * koi.scale}
                fill="#111"
              />
              <circle
                cx={bLen * 0.32}
                cy={-bWid * 0.14}
                r={0.8 * koi.scale}
                fill="#FFF"
                opacity={0.7}
              />
              {/* Dorsal fin hint */}
              <line
                x1={bLen * 0.1}
                y1={-bWid * 0.4}
                x2={-bLen * 0.15}
                y2={-bWid * 0.2}
                stroke={koi.bodyColor}
                strokeWidth={2 * koi.scale}
                strokeLinecap="round"
                opacity={0.4}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
