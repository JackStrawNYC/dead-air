/**
 * EnergyEffects — fire ring, confetti drop, rainbow prism.
 * Three peak-energy effects:
 * - Fire ring: flickering fire around edges during sustained peaks
 * - Confetti: Dead-themed confetti raining during climaxes
 * - Rainbow prism: Dark Side style rainbow arc during peaks
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── FIRE RING ───────────────────────────────────────────────────

const FireRing: React.FC<{ width: number; height: number; energy: number; frame: number }> = ({
  width, height, energy, frame,
}) => {
  if (energy < 0.2) return null;

  const intensity = interpolate(energy, [0.2, 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flicker = Math.sin(frame * 0.5) * 0.15 + Math.sin(frame * 1.3) * 0.1;
  const opacity = intensity * (0.3 + flicker);

  // Fire colors gradient from edges inward
  const fireGradient = `
    radial-gradient(ellipse at 50% 50%,
      transparent 55%,
      rgba(255, 100, 0, ${opacity * 0.3}) 65%,
      rgba(255, 50, 0, ${opacity * 0.5}) 75%,
      rgba(255, 200, 0, ${opacity * 0.4}) 82%,
      rgba(255, 50, 0, ${opacity * 0.6}) 90%,
      rgba(200, 0, 0, ${opacity * 0.8}) 100%
    )
  `;

  // Animated fire distortion via box-shadow color cycling
  const hueShift = Math.sin(frame * 0.2) * 20;
  const glowColor = `hsla(${20 + hueShift}, 100%, 50%, ${opacity * 0.5})`;

  return (
    <div
      style={{
        position: "absolute",
        inset: -20,
        background: fireGradient,
        filter: `drop-shadow(0 0 ${15 + energy * 30}px ${glowColor})`,
        mixBlendMode: "screen",
        pointerEvents: "none",
      }}
    />
  );
};

// ── CONFETTI ────────────────────────────────────────────────────

interface ConfettiPiece {
  x: number;
  speed: number;
  wobbleSpeed: number;
  wobbleAmp: number;
  rotation: number;
  rotSpeed: number;
  size: number;
  colorIdx: number;
  shape: "rect" | "circle" | "bolt" | "star";
}

const CONFETTI_COLORS = [
  "#FF1493", "#FF4500", "#FFD700", "#00FF7F", "#00FFFF",
  "#FF00FF", "#7B68EE", "#FF6347", "#ADFF2F", "#FF69B4",
];

const NUM_CONFETTI = 60;
const CONFETTI_CYCLE = 900;   // 30 seconds
const CONFETTI_DURATION = 240; // 8 seconds of confetti

function generateConfetti(seed: number): ConfettiPiece[] {
  const rng = seeded(seed);
  const shapes: ConfettiPiece["shape"][] = ["rect", "circle", "bolt", "star"];
  return Array.from({ length: NUM_CONFETTI }, () => ({
    x: rng(),
    speed: 1.5 + rng() * 3,
    wobbleSpeed: 2 + rng() * 4,
    wobbleAmp: 15 + rng() * 30,
    rotation: rng() * 360,
    rotSpeed: (rng() - 0.5) * 8,
    size: 6 + rng() * 12,
    colorIdx: Math.floor(rng() * CONFETTI_COLORS.length),
    shape: shapes[Math.floor(rng() * shapes.length)],
  }));
}

const ConfettiDrop: React.FC<{ width: number; height: number; energy: number; frame: number }> = ({
  width, height, energy, frame,
}) => {
  const cycleFrame = frame % CONFETTI_CYCLE;
  if (cycleFrame >= CONFETTI_DURATION || energy < 0.22) return null;

  const cycleIdx = Math.floor(frame / CONFETTI_CYCLE);
  const confetti = React.useMemo(() => generateConfetti(cycleIdx * 31 + 1977), [cycleIdx]);

  const progress = cycleFrame / CONFETTI_DURATION;
  const fadeIn = Math.min(1, progress * 6);
  const fadeOut = Math.min(1, (1 - progress) * 4);
  const opacity = Math.min(fadeIn, fadeOut) * 0.8;

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}>
      {confetti.map((c, i) => {
        const x = c.x * width + Math.sin(cycleFrame * c.wobbleSpeed * 0.02) * c.wobbleAmp;
        const y = ((cycleFrame * c.speed) % (height + 40)) - 20;
        const rot = c.rotation + cycleFrame * c.rotSpeed;
        const color = CONFETTI_COLORS[c.colorIdx];

        return (
          <g key={i} transform={`translate(${x}, ${y}) rotate(${rot})`}>
            {c.shape === "rect" && <rect x={-c.size / 2} y={-c.size / 4} width={c.size} height={c.size / 2} fill={color} />}
            {c.shape === "circle" && <circle r={c.size / 2} fill={color} />}
            {c.shape === "bolt" && <polygon points={`0,${-c.size / 2} ${-c.size / 3},1 ${c.size / 4},1 0,${c.size / 2}`} fill={color} />}
            {c.shape === "star" && (
              <polygon
                points={Array.from({ length: 5 }, (_, j) => {
                  const a = (j / 5) * Math.PI * 2 - Math.PI / 2;
                  const ri = j % 2 === 0 ? c.size / 2 : c.size / 4;
                  return `${Math.cos(a) * ri},${Math.sin(a) * ri}`;
                }).join(" ")}
                fill={color}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
};

// ── RAINBOW PRISM ───────────────────────────────────────────────

const RainbowPrism: React.FC<{ width: number; height: number; energy: number; frame: number }> = ({
  width, height, energy, frame,
}) => {
  if (energy < 0.18) return null;

  const intensity = interpolate(energy, [0.18, 0.35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = intensity * 0.35;

  const RAINBOW = ["#FF0000", "#FF7F00", "#FFFF00", "#00FF00", "#0000FF", "#4B0082", "#9400D3"];
  const bandHeight = 4;
  const arcCx = width / 2;
  const arcCy = height * 0.7;
  const baseRadius = width * 0.35 + Math.sin(frame * 0.02) * 20;

  return (
    <svg
      width={width} height={height}
      style={{
        position: "absolute", inset: 0, opacity, pointerEvents: "none",
        filter: `blur(2px) drop-shadow(0 0 15px rgba(255,255,255,0.3))`,
      }}
    >
      {RAINBOW.map((color, i) => {
        const r = baseRadius + i * (bandHeight + 2);
        return (
          <path
            key={i}
            d={`M ${arcCx - r} ${arcCy} A ${r} ${r} 0 0 1 ${arcCx + r} ${arcCy}`}
            stroke={color}
            strokeWidth={bandHeight}
            fill="none"
            opacity={0.7}
          />
        );
      })}
    </svg>
  );
};

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const EnergyEffects: React.FC<Props> = ({ frames }) => {
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

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <FireRing width={width} height={height} energy={energy} frame={frame} />
      <RainbowPrism width={width} height={height} energy={energy} frame={frame} />
      <ConfettiDrop width={width} height={height} energy={energy} frame={frame} />
    </div>
  );
};
