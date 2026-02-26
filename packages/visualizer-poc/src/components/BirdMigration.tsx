/**
 * BirdMigration -- V-formation birds crossing the sky.
 * 12-20 small bird shapes (simple check-mark / chevron shapes with flapping wings).
 * Formation drifts across screen from one side. Wing flap speed tied to energy.
 * Formation ripple -- birds flap in sequence with phase delay. Dark silhouettes.
 * Multiple formations at different altitudes (sizes).
 * Cycle: 50s (1500 frames), 14s (420 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface BirdData {
  /** Offset from formation leader (x, y) */
  offsetX: number;
  offsetY: number;
  /** Phase delay for flap ripple */
  flapPhase: number;
  /** Size multiplier */
  sizeMult: number;
  /** Y wobble frequency */
  wobbleFreq: number;
  wobblePhase: number;
}

interface FormationData {
  /** Y position as fraction of height (0-0.4 for upper screen) */
  y: number;
  /** Scale based on altitude (distant = smaller) */
  scale: number;
  /** Direction: true = left-to-right */
  goingRight: boolean;
  /** Speed multiplier */
  speed: number;
  /** Birds in this formation */
  birds: BirdData[];
  /** Opacity (distant formations dimmer) */
  opacity: number;
}

function generateFormation(rng: () => number, birdCount: number): BirdData[] {
  const birds: BirdData[] = [];
  // Leader at center
  birds.push({
    offsetX: 0,
    offsetY: 0,
    flapPhase: 0,
    sizeMult: 1.0,
    wobbleFreq: 0.02 + rng() * 0.02,
    wobblePhase: rng() * Math.PI * 2,
  });

  // V-formation: alternating left and right
  for (let i = 1; i < birdCount; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const row = Math.ceil(i / 2);
    birds.push({
      offsetX: -row * (25 + rng() * 10),
      offsetY: side * row * (18 + rng() * 8),
      flapPhase: row * (0.3 + rng() * 0.2),
      sizeMult: 0.85 + rng() * 0.3,
      wobbleFreq: 0.015 + rng() * 0.025,
      wobblePhase: rng() * Math.PI * 2,
    });
  }
  return birds;
}

function generateFormations(seed: number): FormationData[] {
  const rng = seeded(seed);
  return [
    {
      y: 0.15,
      scale: 1.0,
      goingRight: true,
      speed: 1.0,
      birds: generateFormation(rng, 15),
      opacity: 0.85,
    },
    {
      y: 0.08,
      scale: 0.55,
      goingRight: false,
      speed: 0.7,
      birds: generateFormation(rng, 9),
      opacity: 0.5,
    },
    {
      y: 0.28,
      scale: 0.75,
      goingRight: true,
      speed: 0.85,
      birds: generateFormation(rng, 12),
      opacity: 0.65,
    },
  ];
}

const CYCLE = 1500; // 50s
const VISIBLE_DURATION = 420; // 14s

interface Props {
  frames: EnhancedFrameData[];
}

export const BirdMigration: React.FC<Props> = ({ frames }) => {
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

  const formations = React.useMemo(() => generateFormations(50197708), []);

  const cycleFrame = frame % CYCLE;
  const isVisible = cycleFrame < VISIBLE_DURATION;

  const fadeIn = isVisible
    ? interpolate(cycleFrame, [0, 45], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;
  const fadeOut = isVisible
    ? interpolate(cycleFrame, [VISIBLE_DURATION - 45, VISIBLE_DURATION], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const masterOpacity = Math.min(fadeIn, fadeOut);

  if (!isVisible || masterOpacity < 0.01) return null;

  // Wing flap speed driven by energy
  const flapSpeed = interpolate(energy, [0.03, 0.3], [0.06, 0.18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {formations.map((formation, fi) => {
          // Formation crosses screen over visible duration
          const progress = cycleFrame / VISIBLE_DURATION;
          const startX = formation.goingRight ? -width * 0.2 : width * 1.2;
          const endX = formation.goingRight ? width * 1.2 : -width * 0.2;
          const leaderX = interpolate(progress, [0, 1], [startX, endX], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) * formation.speed;
          const leaderY = formation.y * height;

          return (
            <g key={fi} opacity={formation.opacity}>
              {formation.birds.map((bird, bi) => {
                // Wobble
                const wobble = Math.sin(frame * bird.wobbleFreq + bird.wobblePhase) * 3;

                const birdX = leaderX + bird.offsetX * formation.scale * (formation.goingRight ? 1 : -1);
                const birdY = leaderY + bird.offsetY * formation.scale + wobble;

                // Wing flap angle with ripple delay
                const flapAngle = Math.sin(frame * flapSpeed + bird.flapPhase) * 25 + 5;
                const wingSpan = 12 * bird.sizeMult * formation.scale;

                // Bird as chevron/check-mark shape
                const wingRad = (flapAngle * Math.PI) / 180;
                const wingDy = -Math.sin(wingRad) * wingSpan;
                const wingDx = Math.cos(wingRad) * wingSpan;

                return (
                  <g key={bi}>
                    {/* Left wing */}
                    <line
                      x1={birdX}
                      y1={birdY}
                      x2={birdX - wingDx}
                      y2={birdY + wingDy}
                      stroke="rgba(10, 10, 20, 0.9)"
                      strokeWidth={2 * formation.scale * bird.sizeMult}
                      strokeLinecap="round"
                    />
                    {/* Right wing */}
                    <line
                      x1={birdX}
                      y1={birdY}
                      x2={birdX + wingDx}
                      y2={birdY + wingDy}
                      stroke="rgba(10, 10, 20, 0.9)"
                      strokeWidth={2 * formation.scale * bird.sizeMult}
                      strokeLinecap="round"
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
