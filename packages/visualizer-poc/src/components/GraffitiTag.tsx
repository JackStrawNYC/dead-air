/**
 * GraffitiTag -- Spray-paint style text tags that appear stroke-by-stroke.
 * 3-4 Dead-related words/phrases ("NFA", "~!~", "DEAD", "KIND") draw
 * themselves using SVG stroke-dasharray animation via interpolate.
 * Bold, thick strokes in bright spray-paint colors. Tags positioned at
 * various angles.
 * Cycle: 45s total, 12s visible.
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

const CYCLE = 1350; // 45s
const DURATION = 360; // 12s

const TAG_WORDS = ["NFA", "~!~", "DEAD", "KIND"];
const TAG_COLORS = ["#FF1744", "#FFD600", "#00E676", "#2979FF"];

/** Pre-computed tag layouts (deterministic) */
interface TagLayout {
  word: string;
  color: string;
  x: number; // 0-1
  y: number; // 0-1
  angle: number; // degrees
  scale: number;
  /** stagger delay (0-1 of the draw phase) */
  delay: number;
}

function generateLayout(cycleSeed: number): TagLayout[] {
  const rng = seeded(cycleSeed);
  const count = 3 + Math.floor(rng() * 2); // 3-4 tags
  const tags: TagLayout[] = [];
  for (let i = 0; i < count; i++) {
    tags.push({
      word: TAG_WORDS[i % TAG_WORDS.length],
      color: TAG_COLORS[i % TAG_COLORS.length],
      x: 0.15 + rng() * 0.65,
      y: 0.2 + rng() * 0.55,
      angle: -18 + rng() * 36,
      scale: 0.8 + rng() * 0.6,
      delay: i * 0.18,
    });
  }
  return tags;
}

/* Approximate path length for a text glyph -- we use a generous estimate */
const PATH_LENGTH_ESTIMATE = 800;

interface Props {
  frames: EnhancedFrameData[];
}

export const GraffitiTag: React.FC<Props> = ({ frames }) => {
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
  const tags = React.useMemo(() => generateLayout(cycleIndex * 73 + 50877), [cycleIndex]);

  /* ----- cycle gate ----- */
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  /* fade out near end */
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  const masterOpacity = fadeOut * 0.9;
  if (masterOpacity < 0.01) return null;

  const fontSize = Math.min(120, width * 0.12);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {tags.map((tag, ti) => {
          /* staggered draw: each tag draws over ~40% of the DURATION,
             delayed by tag.delay fraction */
          const drawStart = tag.delay;
          const drawEnd = Math.min(tag.delay + 0.4, 0.85);

          const drawProgress = interpolate(progress, [drawStart, drawEnd], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });

          if (drawProgress < 0.001) return null;

          const dashOffset = PATH_LENGTH_ESTIMATE * (1 - drawProgress);

          /* slight energy-driven wobble */
          const wobbleX = Math.sin(frame * 0.05 + ti * 2.1) * energy * 3;
          const wobbleY = Math.cos(frame * 0.04 + ti * 1.7) * energy * 2;

          const tx = tag.x * width + wobbleX;
          const ty = tag.y * height + wobbleY;

          return (
            <g
              key={ti}
              transform={`translate(${tx}, ${ty}) rotate(${tag.angle}) scale(${tag.scale})`}
            >
              {/* thick paint stroke (background) */}
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fill="none"
                stroke={tag.color}
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={PATH_LENGTH_ESTIMATE}
                strokeDashoffset={dashOffset}
                style={{
                  fontSize: fontSize * tag.scale,
                  fontFamily: "'Impact', 'Arial Black', sans-serif",
                  fontWeight: 900,
                  filter: `
                    drop-shadow(0 0 6px ${tag.color})
                    drop-shadow(0 0 18px ${tag.color})
                  `,
                }}
                opacity={0.7}
              >
                {tag.word}
              </text>
              {/* inner fill (slightly delayed) */}
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fill={tag.color}
                opacity={interpolate(drawProgress, [0.3, 0.8], [0, 0.95], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })}
                style={{
                  fontSize: fontSize * tag.scale,
                  fontFamily: "'Impact', 'Arial Black', sans-serif",
                  fontWeight: 900,
                }}
              >
                {tag.word}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
