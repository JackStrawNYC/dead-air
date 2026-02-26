/**
 * NeonSign -- Flickering neon tube letters spelling "GRATEFUL DEAD" across
 * the top of the screen.  Each letter is an SVG text element with layered
 * drop-shadow glow.  Letters flicker independently (some steady, some
 * buzzing).  Colors mix red / blue / pink neon tubes.  Energy drives overall
 * brightness.  Occasional full-sign flicker on beat hits.
 * Cycle: 70s total, 20s visible.
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

const CYCLE = 2100; // 70s at 30fps
const DURATION = 600; // 20s

const NEON_PALETTE = ["#FF1744", "#2979FF", "#FF4081", "#FF1493", "#448AFF", "#F50057"];

/** Generate tube colors for each letter (deterministic per seed) */
function generateTubeColors(text: string, seed: number): string[] {
  const rng = seeded(seed);
  return Array.from({ length: text.length }, () =>
    NEON_PALETTE[Math.floor(rng() * NEON_PALETTE.length)],
  );
}

/* per-letter flicker characteristics (deterministic) */
interface LetterFlicker {
  /** Hz-ish flicker speed multiplier */
  speed: number;
  /** Phase offset */
  phase: number;
  /** Min brightness (0 = can fully extinguish, 0.7 = mostly steady) */
  minBright: number;
}

function generateFlickers(seed: number, count: number): LetterFlicker[] {
  const rng = seeded(seed);
  const result: LetterFlicker[] = [];
  for (let i = 0; i < count; i++) {
    result.push({
      speed: 0.15 + rng() * 0.5,
      phase: rng() * Math.PI * 2,
      minBright: rng() < 0.3 ? 0.1 + rng() * 0.3 : 0.6 + rng() * 0.35,
    });
  }
  return result;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const NeonSign: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const signText = ctx?.bandName?.toUpperCase() ?? "GRATEFUL DEAD";

  /* ----- energy ----- */
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  /* useMemo BEFORE any conditional returns */
  const showSeed = ctx?.showSeed ?? 19770508;
  const letterFlickers = React.useMemo(() => generateFlickers(showSeed, signText.length), [showSeed, signText.length]);
  const tubeColors = React.useMemo(() => generateTubeColors(signText, showSeed + 1), [signText, showSeed]);

  /* ----- cycle gate ----- */
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const envelope = Math.min(fadeIn, fadeOut);

  /* full-sign beat flicker */
  const curBeat = frames[idx].beat;
  const beatFlicker = curBeat ? 0.3 + 0.7 * Math.abs(Math.sin(frame * 1.7)) : 1;

  const energyBright = interpolate(energy, [0.04, 0.3], [0.5, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = envelope * beatFlicker * energyBright;
  if (masterOpacity < 0.01) return null;

  /* layout: letters spaced across top */
  const fontSize = Math.min(80, width / (signText.length * 0.7));
  const totalTextWidth = signText.length * fontSize * 0.65;
  const startX = (width - totalTextWidth) / 2;
  const baseY = height * 0.08 + fontSize;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {signText.split("").map((ch, i) => {
          if (ch === " ") return null;
          const fl = letterFlickers[i];
          const color = tubeColors[i];

          /* per-letter brightness flicker */
          const raw = Math.sin(frame * fl.speed + fl.phase);
          const buzz = fl.minBright + (1 - fl.minBright) * ((raw + 1) * 0.5);
          const letterOpacity = buzz;

          const x = startX + i * fontSize * 0.65 + fontSize * 0.32;
          const y = baseY + Math.sin(frame * 0.02 + i * 0.4) * 3;

          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor="middle"
              fill={color}
              opacity={letterOpacity}
              style={{
                fontSize,
                fontFamily: "'Georgia', serif",
                fontWeight: 900,
                filter: `
                  drop-shadow(0 0 4px ${color})
                  drop-shadow(0 0 12px ${color})
                  drop-shadow(0 0 28px ${color})
                  drop-shadow(0 0 60px ${color})
                `,
              }}
            >
              {ch}
            </text>
          );
        })}
      </svg>
    </div>
  );
};
