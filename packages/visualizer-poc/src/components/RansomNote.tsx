/**
 * RansomNote -- Cut-out magazine letter collage spelling Dead lyrics.
 * Letters of varying sizes, simulated font differences (via weight/colour
 * variation), and slight rotations.  Letters appear one by one.  Background
 * patches of different "paper" colours behind each letter.  Gritty punk
 * aesthetic.  Text: "WHAT A LONG STRANGE TRIP".
 * Cycle: 55s total, 14s visible.
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

const CYCLE = 1650;    // 55s
const DURATION = 420;  // 14s

const PHRASE = "WHAT A LONG STRANGE TRIP";

/* paper bg patches -- magazine clipping colours */
const PAPER_COLORS = [
  "#F5F0E1", "#E8D5B7", "#FFE0E0", "#D4EDDA",
  "#D1E7FF", "#FFF3CD", "#F0D0FF", "#E0E0E0",
  "#FFEAA7", "#DFE6E9", "#FAD0C4", "#C8E6C9",
];

/* ink colours for letters */
const INK_COLORS = [
  "#1A1A1A", "#8B0000", "#003366", "#2E4600",
  "#4A0072", "#8B4513", "#333333", "#660000",
];

/* per-letter data (deterministic) */
interface LetterData {
  ch: string;
  paperColor: string;
  inkColor: string;
  fontSize: number;
  rotation: number;
  fontWeight: number;
  isSerif: boolean;
  offsetX: number;
  offsetY: number;
  padX: number;
  padY: number;
}

function generateLetters(cycleSeed: number): LetterData[] {
  const rng = seeded(cycleSeed);
  return PHRASE.split("").map((ch) => ({
    ch,
    paperColor: PAPER_COLORS[Math.floor(rng() * PAPER_COLORS.length)],
    inkColor: INK_COLORS[Math.floor(rng() * INK_COLORS.length)],
    fontSize: 28 + Math.floor(rng() * 32), // 28-60
    rotation: -12 + rng() * 24,
    fontWeight: rng() > 0.5 ? 900 : 700,
    isSerif: rng() > 0.5,
    offsetX: (rng() - 0.5) * 6,
    offsetY: (rng() - 0.5) * 8,
    padX: 4 + rng() * 6,
    padY: 2 + rng() * 5,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const RansomNote: React.FC<Props> = ({ frames }) => {
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

  const cycleIndex = Math.floor(frame / CYCLE);

  /* memos BEFORE conditional returns */
  const letters = React.useMemo(
    () => generateLetters(cycleIndex * 131 + (ctx?.showSeed ?? 19770508)),
    [cycleIndex, ctx?.showSeed],
  );

  /* ----- cycle gate ----- */
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  if (fadeOut < 0.01) return null;

  /* layout: flow letters in rows, roughly centred */
  const maxRowWidth = width * 0.7;
  const avgCharWidth = 38; // rough average
  const charsPerRow = Math.floor(maxRowWidth / avgCharWidth);
  const rowCount = Math.ceil(PHRASE.length / charsPerRow);
  const startY = height * 0.35 - (rowCount * 50) / 2;
  const startX = (width - maxRowWidth) / 2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div style={{ opacity: fadeOut }}>
        {letters.map((ld, li) => {
          if (ld.ch === " ") return <span key={li} style={{ display: "inline-block", width: 18 }} />;

          /* staggered reveal: letters appear one at a time over first 60% of duration */
          const revealProgress = interpolate(
            progress,
            [li * 0.025, li * 0.025 + 0.04],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          if (revealProgress < 0.01) return null;

          /* slam-in: scale from 2 to 1 */
          const scaleIn = interpolate(revealProgress, [0, 1], [1.8, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });

          /* energy jitter */
          const jx = Math.sin(frame * 0.08 + li * 1.3) * energy * 4 + ld.offsetX;
          const jy = Math.cos(frame * 0.06 + li * 0.9) * energy * 3 + ld.offsetY;

          /* row / col layout */
          const row = Math.floor(li / charsPerRow);
          const col = li % charsPerRow;
          const x = startX + col * avgCharWidth + jx;
          const y = startY + row * 60 + jy;

          return (
            <div
              key={li}
              style={{
                position: "absolute",
                left: x,
                top: y,
                transform: `rotate(${ld.rotation}deg) scale(${scaleIn})`,
                opacity: revealProgress,
                willChange: "transform, opacity",
              }}
            >
              {/* paper background */}
              <div
                style={{
                  background: ld.paperColor,
                  padding: `${ld.padY}px ${ld.padX}px`,
                  border: "1px solid rgba(0,0,0,0.15)",
                  boxShadow: "2px 2px 4px rgba(0,0,0,0.2)",
                }}
              >
                <span
                  style={{
                    color: ld.inkColor,
                    fontSize: ld.fontSize,
                    fontWeight: ld.fontWeight,
                    fontFamily: ld.isSerif
                      ? "'Georgia', 'Times New Roman', serif"
                      : "'Arial', 'Helvetica', sans-serif",
                    lineHeight: 1,
                    display: "block",
                  }}
                >
                  {ld.ch}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
