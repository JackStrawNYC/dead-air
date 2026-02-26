/**
 * ZenRipples -- Concentric circles expanding outward from 2-3 points on screen,
 * like pebbles dropped in still water.  Each ripple set starts from a random
 * point and expands with fading opacity.  New ripple sets trigger on beat/onset
 * detection.  Minimal, monochrome (white/silver).  Very zen.
 * Cycle: 55s, 16s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1650; // 55s at 30fps
const VISIBLE_DURATION = 480; // 16s
const MAX_RIPPLE_SETS = 300; // pre-generated pool
const RIPPLES_PER_SET = 5; // concentric rings per drop
const RIPPLE_LIFETIME = 120; // 4s per ripple expansion

interface RippleSet {
  /** Frame (relative to cycle start) this set triggers */
  triggerFrame: number;
  /** Center x as fraction */
  cx: number;
  /** Center y as fraction */
  cy: number;
  /** Max radius as fraction of screen diagonal */
  maxRadius: number;
}

function generateRippleSets(seed: number): RippleSet[] {
  const rng = seeded(seed);
  const sets: RippleSet[] = [];
  let currentFrame = 15;
  for (let i = 0; i < MAX_RIPPLE_SETS; i++) {
    sets.push({
      triggerFrame: currentFrame,
      cx: 0.15 + rng() * 0.7,
      cy: 0.15 + rng() * 0.7,
      maxRadius: 0.25 + rng() * 0.35,
    });
    currentFrame += 12 + Math.floor(rng() * 20); // 12-32 frames between drops
  }
  return sets;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const ZenRipples: React.FC<Props> = ({ frames }) => {
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
  const rippleSets = React.useMemo(() => generateRippleSets(7081977), []);

  /* Cycle: 55s total, 16s visible */
  const cycleFrame = frame % CYCLE;
  const isVisible = cycleFrame < VISIBLE_DURATION;

  /* Fade in/out */
  const fadeIn = interpolate(cycleFrame, [0, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(
    cycleFrame,
    [VISIBLE_DURATION - 45, VISIBLE_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const visibility = isVisible ? Math.min(fadeIn, fadeOut) : 0;

  if (visibility < 0.01) return null;

  /* Beat/onset detection enhances triggering — we only render sets that
     are within the active window anyway, but we can modulate opacity by
     how strong the onset was near the trigger frame. */

  const diagonal = Math.sqrt(width * width + height * height);
  const masterOpacity = visibility * interpolate(energy, [0.02, 0.2], [0.35, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* Find active ripple sets in current cycle window */
  const activeRipples = rippleSets.filter(
    (rs) =>
      cycleFrame >= rs.triggerFrame &&
      cycleFrame < rs.triggerFrame + RIPPLE_LIFETIME,
  );

  if (activeRipples.length === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {activeRipples.map((rs, si) => {
          const age = cycleFrame - rs.triggerFrame;
          const lifeProgress = age / RIPPLE_LIFETIME;
          const cx = rs.cx * width;
          const cy = rs.cy * height;

          return (
            <g key={`${rs.triggerFrame}-${si}`}>
              {Array.from({ length: RIPPLES_PER_SET }, (_, ri) => {
                /* Each ring in the set is staggered by a small delay */
                const ringDelay = ri * 8;
                const ringAge = age - ringDelay;
                if (ringAge < 0) return null;

                const ringProgress = ringAge / (RIPPLE_LIFETIME - ringDelay);
                if (ringProgress > 1) return null;

                const radius = ringProgress * rs.maxRadius * diagonal;

                /* Fade: quick appear, slow fade */
                const ringAlpha = interpolate(
                  ringProgress,
                  [0, 0.05, 0.5, 1],
                  [0, 0.7, 0.3, 0],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );

                if (ringAlpha < 0.02 || radius < 1) return null;

                /* Stroke thins as it expands */
                const sw = interpolate(ringProgress, [0, 1], [1.5, 0.3], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });

                const lightness = 80 + ri * 3; // slightly different whites
                const color = `hsla(0, 0%, ${lightness}%, ${ringAlpha})`;
                const glowColor = `hsla(0, 0%, ${lightness + 10}%, ${ringAlpha * 0.3})`;

                return (
                  <g key={ri}>
                    {/* Soft glow ring */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill="none"
                      stroke={glowColor}
                      strokeWidth={sw * 3}
                      style={{ filter: "blur(2px)" }}
                    />
                    {/* Core ring */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill="none"
                      stroke={color}
                      strokeWidth={sw}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
