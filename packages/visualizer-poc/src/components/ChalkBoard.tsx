/**
 * ChalkBoard -- Chalk-on-blackboard text and diagrams.
 * A dark green-gray rectangle as the board.  Chalk lines draw setlist items
 * or musical notation.  White/pastel chalk colours with slightly rough edges
 * (jittered paths).  "Chalk dust" particles fall from the writing point.
 * An "eraser" swipe clears before new content.
 * Cycle: 80s total, 25s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2400;    // 80s
const DURATION = 750;  // 25s

const SETLIST_ITEMS = [
  "1. Minglewood Blues",
  "2. Loser",
  "3. El Paso",
  "4. They Love Each Other",
  "5. Jack Straw",
  "6. Deal",
  "7. Lazy Lightning",
  "8. Supplication",
];

const CHALK_COLORS = [
  "#FFFDF5", // white chalk
  "#FFE4E1", // pink chalk
  "#E0FFE0", // green chalk
  "#E0E8FF", // blue chalk
  "#FFFACD", // yellow chalk
];

const BOARD_COLOR = "#2C3E2C";
const BOARD_BORDER = "#5C3D2E";

/* per-line data */
interface ChalkLine {
  text: string;
  color: string;
  y: number;       // normalised 0-1 within board
  x: number;       // normalised
  jitterSeed: number;
}

function generateLines(seed: number): ChalkLine[] {
  const rng = seeded(seed);
  const count = 4 + Math.floor(rng() * 4); // 4-7 lines
  const lines: ChalkLine[] = [];
  for (let i = 0; i < count; i++) {
    lines.push({
      text: SETLIST_ITEMS[i % SETLIST_ITEMS.length],
      color: CHALK_COLORS[Math.floor(rng() * CHALK_COLORS.length)],
      y: 0.12 + (i / count) * 0.72,
      x: 0.08 + rng() * 0.04,
      jitterSeed: Math.floor(rng() * 10000),
    });
  }
  return lines;
}

/* chalk-dust particles */
interface DustParticle {
  startX: number; // 0-1
  startY: number; // 0-1
  vx: number;
  vy: number;
  life: number; // frames
  size: number;
  delay: number; // frames from cycle start
}

function generateDust(seed: number): DustParticle[] {
  const rng = seeded(seed);
  const particles: DustParticle[] = [];
  for (let i = 0; i < 30; i++) {
    particles.push({
      startX: 0.1 + rng() * 0.75,
      startY: 0.15 + rng() * 0.65,
      vx: (rng() - 0.5) * 0.3,
      vy: 0.5 + rng() * 1.5,
      life: 30 + Math.floor(rng() * 60),
      size: 1 + rng() * 2.5,
      delay: Math.floor(rng() * (DURATION * 0.6)),
    });
  }
  return particles;
}

const PATH_LENGTH = 600;

interface Props {
  frames: EnhancedFrameData[];
}

export const ChalkBoard: React.FC<Props> = ({ frames }) => {
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

  const cycleIndex = Math.floor(frame / CYCLE);

  /* memos BEFORE conditional returns */
  const lines = React.useMemo(() => generateLines(cycleIndex * 59 + 770508), [cycleIndex]);
  const dust = React.useMemo(() => generateDust(cycleIndex * 97 + 508), [cycleIndex]);

  /* ----- cycle gate ----- */
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  /* board fade in/out */
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const boardOpacity = Math.min(fadeIn, fadeOut) * 0.85;
  if (boardOpacity < 0.01) return null;

  /* eraser swipe: covers first 12% of cycle */
  const eraserProgress = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* board dimensions */
  const boardW = width * 0.65;
  const boardH = height * 0.55;
  const boardX = (width - boardW) / 2;
  const boardY = (height - boardH) / 2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: boardOpacity }}>
        {/* Board background */}
        <rect
          x={boardX - 8}
          y={boardY - 8}
          width={boardW + 16}
          height={boardH + 16}
          rx={4}
          fill={BOARD_BORDER}
        />
        <rect
          x={boardX}
          y={boardY}
          width={boardW}
          height={boardH}
          rx={2}
          fill={BOARD_COLOR}
        />
        {/* subtle board texture (a few faint scratches) */}
        {[0.2, 0.45, 0.7].map((yf, si) => (
          <line
            key={`scratch-${si}`}
            x1={boardX + 20}
            y1={boardY + boardH * yf}
            x2={boardX + boardW - 20}
            y2={boardY + boardH * yf + 3}
            stroke="#3A4F3A"
            strokeWidth={0.5}
            opacity={0.4}
          />
        ))}

        {/* Eraser swipe */}
        {eraserProgress > 0 && eraserProgress < 1 && (
          <rect
            x={boardX}
            y={boardY}
            width={boardW * eraserProgress}
            height={boardH}
            fill={BOARD_COLOR}
            opacity={0.95}
          />
        )}

        {/* Chalk text lines */}
        {lines.map((line, li) => {
          /* stagger: each line starts drawing after eraser + delay */
          const lineStart = 0.12 + li * 0.08;
          const lineEnd = Math.min(lineStart + 0.15, 0.92);

          const drawProg = interpolate(progress, [lineStart, lineEnd], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.quad),
          });

          if (drawProg < 0.001) return null;

          const dashOff = PATH_LENGTH * (1 - drawProg);

          /* chalk jitter via offset */
          const jRng = seeded(line.jitterSeed + frame);
          const jx = (jRng() - 0.5) * 1.5;
          const jy = (jRng() - 0.5) * 1.0;

          const tx = boardX + line.x * boardW + jx;
          const ty = boardY + line.y * boardH + jy;

          return (
            <text
              key={li}
              x={tx}
              y={ty}
              fill={line.color}
              opacity={0.85 * drawProg}
              strokeDasharray={PATH_LENGTH}
              strokeDashoffset={dashOff}
              stroke={line.color}
              strokeWidth={0.5}
              style={{
                fontSize: 22,
                fontFamily: "'Courier New', monospace",
                fontWeight: 400,
                filter: `drop-shadow(0 0 2px ${line.color})`,
              }}
            >
              {line.text}
            </text>
          );
        })}

        {/* Chalk dust particles */}
        {dust.map((p, pi) => {
          const particleAge = cycleFrame - p.delay;
          if (particleAge < 0 || particleAge > p.life) return null;

          const t = particleAge / p.life;
          const px = boardX + p.startX * boardW + p.vx * particleAge;
          const py = boardY + p.startY * boardH + p.vy * particleAge;
          const pOpacity = interpolate(t, [0, 0.2, 0.8, 1], [0, 0.6, 0.4, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          /* energy drives dust scatter */
          const scatter = energy * 2;
          const sx = px + Math.sin(frame * 0.1 + pi) * scatter;
          const sy = py + Math.cos(frame * 0.08 + pi * 0.7) * scatter;

          return (
            <circle
              key={`d${pi}`}
              cx={sx}
              cy={sy}
              r={p.size}
              fill="#FFFDF5"
              opacity={pOpacity}
            />
          );
        })}
      </svg>
    </div>
  );
};
