/**
 * CherryBlossom -- Falling cherry blossom petals drifting down from top.
 * 30-50 small petal shapes (rotated ellipses with a notch) drift downward
 * with gentle spinning and side-to-side flutter.  Soft pink/white palette.
 * Fall speed is gentle and energy-modulated.  Wind gusts on high energy push
 * petals sideways.  Beautiful, peaceful.  Always visible at 0.1-0.25 opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";

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

const NUM_PETALS = 42;
const FALL_CYCLE = 480; // 16s to fall from top to bottom

interface PetalData {
  /** Start x as fraction of width */
  x: number;
  /** Cycle offset (frames) */
  cycleOffset: number;
  /** Fall speed multiplier */
  fallSpeed: number;
  /** Flutter frequency (side-to-side) */
  flutterFreq: number;
  /** Flutter amplitude (px) */
  flutterAmp: number;
  /** Flutter phase */
  flutterPhase: number;
  /** Spin speed (rad/frame) */
  spinSpeed: number;
  /** Spin phase */
  spinPhase: number;
  /** Petal size (width px) */
  sizeW: number;
  /** Petal size (height px) */
  sizeH: number;
  /** Hue: pink range 330-350 or white-ish 340-360 */
  hue: number;
  /** Saturation */
  sat: number;
  /** Lightness */
  light: number;
  /** Tilt phase (3D tumble) */
  tiltFreq: number;
  tiltPhase: number;
}

function generatePetals(seed: number): PetalData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_PETALS }, () => ({
    x: rng(),
    cycleOffset: Math.floor(rng() * FALL_CYCLE),
    fallSpeed: 0.6 + rng() * 0.8,
    flutterFreq: 0.015 + rng() * 0.025,
    flutterAmp: 20 + rng() * 60,
    flutterPhase: rng() * Math.PI * 2,
    spinSpeed: 0.02 + rng() * 0.04,
    spinPhase: rng() * Math.PI * 2,
    sizeW: 6 + rng() * 8,
    sizeH: 8 + rng() * 10,
    hue: 330 + rng() * 30, // 330-360: pink to light pink
    sat: 40 + rng() * 45,
    light: 75 + rng() * 20,
    tiltFreq: 0.01 + rng() * 0.02,
    tiltPhase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CherryBlossom: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

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
  const petals = React.useMemo(() => generatePetals((ctx?.showSeed ?? 19770508)), [ctx?.showSeed]);

  /* master opacity: always visible 0.1-0.25 */
  const masterOpacity = interpolate(energy, [0.03, 0.25], [0.1, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* wind gust on high energy: sideways push */
  const windGust = interpolate(energy, [0.15, 0.4], [0, 80], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* energy drives fall speed */
  const speedMult = interpolate(energy, [0.03, 0.3], [0.7, 1.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* master fade in */
  const masterFade = interpolate(frame, [30, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const finalOpacity = masterOpacity * masterFade;
  if (finalOpacity < 0.01) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: finalOpacity }}>
        {petals.map((petal, i) => {
          /* falling position with wrapping */
          const cycleFrame = (frame * petal.fallSpeed * speedMult + petal.cycleOffset) % FALL_CYCLE;
          const fallProgress = cycleFrame / FALL_CYCLE;

          /* Y: top to bottom */
          const py = -petal.sizeH * 2 + fallProgress * (height + petal.sizeH * 4);

          /* X: base + flutter + wind gust */
          const flutter = Math.sin(frame * petal.flutterFreq + petal.flutterPhase) * petal.flutterAmp;
          const rawX = petal.x * width + flutter + windGust * Math.sin(frame * 0.01 + petal.flutterPhase);
          const px = ((rawX % width) + width) % width;

          /* spin angle */
          const spin = frame * petal.spinSpeed + petal.spinPhase;

          /* 3D tilt effect (scale Y to simulate tumble) */
          const tilt = Math.cos(frame * petal.tiltFreq + petal.tiltPhase);
          const scaleY = 0.3 + Math.abs(tilt) * 0.7;

          /* fade at edges of cycle */
          const edgeFade = interpolate(fallProgress, [0, 0.08, 0.85, 1], [0, 1, 0.8, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          if (edgeFade < 0.03) return null;

          const hue = petal.hue;
          const color = `hsla(${hue}, ${petal.sat}%, ${petal.light}%, ${edgeFade})`;
          const darkColor = `hsla(${hue}, ${petal.sat + 10}%, ${petal.light - 15}%, ${edgeFade * 0.6})`;

          /* Petal shape: ellipse with a notch (heart-like) */
          const w = petal.sizeW;
          const h = petal.sizeH * scaleY;
          /* Simple petal path: an elongated shape with a small V notch at top */
          const petalPath = `
            M 0 ${-h * 0.3}
            C ${w * 0.5} ${-h * 0.5}, ${w * 0.6} ${h * 0.1}, 0 ${h * 0.5}
            C ${-w * 0.6} ${h * 0.1}, ${-w * 0.5} ${-h * 0.5}, 0 ${-h * 0.3}
            Z
          `;

          return (
            <g
              key={i}
              transform={`translate(${px}, ${py}) rotate(${(spin * 180) / Math.PI})`}
            >
              {/* Soft glow behind */}
              <ellipse
                cx={0}
                cy={0}
                rx={w * 0.8}
                ry={h * 0.6}
                fill={`hsla(${hue}, ${petal.sat}%, 90%, ${edgeFade * 0.15})`}
                style={{ filter: "blur(3px)" }}
              />
              {/* Petal body */}
              <path d={petalPath} fill={color} />
              {/* Center vein */}
              <line
                x1={0}
                y1={-h * 0.2}
                x2={0}
                y2={h * 0.4}
                stroke={darkColor}
                strokeWidth={0.5}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
