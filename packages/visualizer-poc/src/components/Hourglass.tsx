/**
 * Hourglass -- Ornate hourglass shape in center of screen.
 * Glass bulbs (top and bottom) connected by narrow neck. Sand particles flow
 * from top to bottom through the neck. Sand level decreases in top, increases
 * in bottom. Particle flow rate driven by energy. Gold frame, warm sand color.
 * When bottom fills, it flips. Cycle: 55s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

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

const CYCLE = 1650; // 55 seconds at 30fps
const DURATION = 540; // 18 seconds visible
const FLIP_DURATION = 60; // 2 seconds for flip animation
const SAND_CYCLE = (DURATION - FLIP_DURATION) / 2; // time to drain before flip

interface SandParticle {
  offsetX: number;
  speed: number;
  size: number;
  wobblePhase: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Hourglass: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate sand particles
  const particles = React.useMemo(() => {
    const rng = seeded(77050805);
    const pts: SandParticle[] = [];
    for (let i = 0; i < 20; i++) {
      pts.push({
        offsetX: (rng() - 0.5) * 6,
        speed: 0.6 + rng() * 0.8,
        size: 1.5 + rng() * 1.5,
        wobblePhase: rng() * Math.PI * 2,
      });
    }
    return pts;
  }, []);

  // Timing gate
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
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.5;

  // Hourglass dimensions
  const totalH = Math.min(width, height) * 0.45;
  const bulbH = totalH * 0.4;
  const neckH = totalH * 0.08;
  const bulbW = totalH * 0.22;
  const neckW = totalH * 0.03;

  // Gold/brass palette
  const frameColor = "#D4A850";
  const frameDark = "#8B6914";
  const sandColor = "#DEB887";
  const sandDark = "#C8A067";
  const glassColor = "rgba(210, 230, 255, 0.08)";

  // Sand level calculation -- sand drains from top to bottom
  // Determine which half of the cycle we're in (pre-flip vs post-flip)
  const sandProgress = cycleFrame < SAND_CYCLE
    ? cycleFrame / SAND_CYCLE
    : cycleFrame < SAND_CYCLE + FLIP_DURATION
      ? 1.0
      : 1.0 - ((cycleFrame - SAND_CYCLE - FLIP_DURATION) / SAND_CYCLE);

  const clampedSandProgress = Math.max(0, Math.min(1, sandProgress));

  // Energy modulates flow speed (more energy = slightly faster visual flow)
  const flowRate = interpolate(energy, [0.03, 0.3], [0.7, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const topSandLevel = 1 - clampedSandProgress; // 1 = full, 0 = empty
  const bottomSandLevel = clampedSandProgress;

  // Flip rotation
  const isFlipping = cycleFrame >= SAND_CYCLE && cycleFrame < SAND_CYCLE + FLIP_DURATION;
  const flipAngle = isFlipping
    ? interpolate(cycleFrame - SAND_CYCLE, [0, FLIP_DURATION], [0, 180], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      })
    : cycleFrame >= SAND_CYCLE + FLIP_DURATION ? 180 : 0;

  // Glass outline coordinates
  const topBulbTop = -totalH / 2;
  const topBulbBottom = -neckH / 2;
  const bottomBulbTop = neckH / 2;
  const bottomBulbBottom = totalH / 2;

  // Sand flowing particles (visible when sand is moving)
  const showStream = !isFlipping && clampedSandProgress > 0.02 && clampedSandProgress < 0.98;

  const glowSize = interpolate(energy, [0.03, 0.3], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px rgba(212, 168, 80, 0.5))`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy}) rotate(${flipAngle})`}>
          {/* Frame decorative caps (top and bottom) */}
          <rect
            x={-bulbW - 8}
            y={topBulbTop - 6}
            width={(bulbW + 8) * 2}
            height={8}
            rx={3}
            fill={frameColor}
            opacity={0.6}
          />
          <rect
            x={-bulbW - 8}
            y={bottomBulbBottom - 2}
            width={(bulbW + 8) * 2}
            height={8}
            rx={3}
            fill={frameColor}
            opacity={0.6}
          />

          {/* Frame side struts */}
          <line x1={-bulbW - 3} y1={topBulbTop} x2={-neckW - 2} y2={0} stroke={frameDark} strokeWidth={2.5} opacity={0.4} />
          <line x1={bulbW + 3} y1={topBulbTop} x2={neckW + 2} y2={0} stroke={frameDark} strokeWidth={2.5} opacity={0.4} />
          <line x1={-neckW - 2} y1={0} x2={-bulbW - 3} y2={bottomBulbBottom} stroke={frameDark} strokeWidth={2.5} opacity={0.4} />
          <line x1={neckW + 2} y1={0} x2={bulbW + 3} y2={bottomBulbBottom} stroke={frameDark} strokeWidth={2.5} opacity={0.4} />

          {/* Glass outline -- top bulb (curved) */}
          <path
            d={`M ${-bulbW} ${topBulbTop}
                Q ${-bulbW - 5} ${topBulbTop + bulbH * 0.5} ${-neckW} ${topBulbBottom}
                L ${neckW} ${topBulbBottom}
                Q ${bulbW + 5} ${topBulbTop + bulbH * 0.5} ${bulbW} ${topBulbTop}
                Z`}
            fill={glassColor}
            stroke={frameColor}
            strokeWidth={1.5}
            opacity={0.5}
          />

          {/* Glass outline -- bottom bulb */}
          <path
            d={`M ${-neckW} ${bottomBulbTop}
                Q ${-bulbW - 5} ${bottomBulbBottom - bulbH * 0.5} ${-bulbW} ${bottomBulbBottom}
                L ${bulbW} ${bottomBulbBottom}
                Q ${bulbW + 5} ${bottomBulbBottom - bulbH * 0.5} ${neckW} ${bottomBulbTop}
                Z`}
            fill={glassColor}
            stroke={frameColor}
            strokeWidth={1.5}
            opacity={0.5}
          />

          {/* Neck */}
          <rect
            x={-neckW}
            y={-neckH / 2}
            width={neckW * 2}
            height={neckH}
            fill={glassColor}
            stroke={frameColor}
            strokeWidth={1}
            opacity={0.4}
          />

          {/* Sand in top bulb */}
          {topSandLevel > 0.02 && (
            <path
              d={`M ${-bulbW * topSandLevel * 0.85} ${topBulbBottom - bulbH * topSandLevel * 0.8}
                  Q ${-bulbW * topSandLevel * 0.6} ${topBulbBottom - bulbH * topSandLevel * 0.2} ${-neckW * 0.8} ${topBulbBottom}
                  L ${neckW * 0.8} ${topBulbBottom}
                  Q ${bulbW * topSandLevel * 0.6} ${topBulbBottom - bulbH * topSandLevel * 0.2} ${bulbW * topSandLevel * 0.85} ${topBulbBottom - bulbH * topSandLevel * 0.8}
                  Z`}
              fill={sandColor}
              opacity={0.5}
            />
          )}

          {/* Sand in bottom bulb */}
          {bottomSandLevel > 0.02 && (
            <path
              d={`M ${-bulbW * bottomSandLevel * 0.85} ${bottomBulbBottom - bulbH * bottomSandLevel * 0.75}
                  L ${-bulbW * 0.9} ${bottomBulbBottom}
                  L ${bulbW * 0.9} ${bottomBulbBottom}
                  L ${bulbW * bottomSandLevel * 0.85} ${bottomBulbBottom - bulbH * bottomSandLevel * 0.75}
                  Z`}
              fill={sandDark}
              opacity={0.5}
            />
          )}

          {/* Sand stream through neck */}
          {showStream && (
            <line
              x1={0}
              y1={topBulbBottom}
              x2={0}
              y2={bottomBulbTop}
              stroke={sandColor}
              strokeWidth={neckW * 0.8}
              opacity={0.4}
            />
          )}

          {/* Falling sand particles */}
          {showStream && particles.map((p, pi) => {
            const particlePhase = (cycleFrame * p.speed * flowRate + pi * 47) % 60;
            const particleProgress = particlePhase / 60;
            const py = bottomBulbTop + particleProgress * (bottomBulbBottom - bottomBulbTop) * 0.6;
            const wobble = Math.sin(cycleFrame * 0.2 + p.wobblePhase) * p.offsetX;

            if (particleProgress > 0.95) return null;

            return (
              <circle
                key={`sp-${pi}`}
                cx={wobble}
                cy={py}
                r={p.size}
                fill={sandColor}
                opacity={0.3 * (1 - particleProgress)}
              />
            );
          })}

          {/* Glass highlight (reflection) */}
          <line
            x1={-bulbW * 0.6}
            y1={topBulbTop + 10}
            x2={-bulbW * 0.3}
            y2={topBulbBottom - 10}
            stroke="white"
            strokeWidth={1.5}
            opacity={0.08}
            strokeLinecap="round"
          />
          <line
            x1={-bulbW * 0.55}
            y1={bottomBulbTop + 10}
            x2={-bulbW * 0.25}
            y2={bottomBulbBottom - 10}
            stroke="white"
            strokeWidth={1.5}
            opacity={0.08}
            strokeLinecap="round"
          />

          {/* Decorative frame knobs */}
          <circle cx={-bulbW - 5} cy={topBulbTop - 2} r={4} fill={frameColor} opacity={0.4} />
          <circle cx={bulbW + 5} cy={topBulbTop - 2} r={4} fill={frameColor} opacity={0.4} />
          <circle cx={-bulbW - 5} cy={bottomBulbBottom + 2} r={4} fill={frameColor} opacity={0.4} />
          <circle cx={bulbW + 5} cy={bottomBulbBottom + 2} r={4} fill={frameColor} opacity={0.4} />
        </g>
      </svg>
    </div>
  );
};
