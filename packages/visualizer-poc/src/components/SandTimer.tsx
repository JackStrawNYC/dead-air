/**
 * SandTimer — Decorative sand timer (egg timer) with flowing sand particles.
 * Glass bulbs connected by narrow waist. Particle flow rate and density
 * driven by audio energy. Ornate brass end caps. Positioned lower-left.
 * Cycle: 50s, 18s visible.
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

const CYCLE = 1500; // 50s at 30fps
const DURATION = 540; // 18s visible

interface Grain {
  offsetX: number;
  speed: number;
  size: number;
  wobbleFreq: number;
  wobbleAmp: number;
  phase: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SandTimer: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate sand grains
  const grains = React.useMemo(() => {
    const rng = seeded(33991177);
    const pts: Grain[] = [];
    for (let i = 0; i < 30; i++) {
      pts.push({
        offsetX: (rng() - 0.5) * 10,
        speed: 0.4 + rng() * 1.0,
        size: 1.0 + rng() * 2.0,
        wobbleFreq: 0.05 + rng() * 0.15,
        wobbleAmp: 1 + rng() * 3,
        phase: rng() * 100,
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
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Position: lower left
  const cx = width * 0.18;
  const cy = height * 0.65;
  const timerH = Math.min(width, height) * 0.3;
  const bulbW = timerH * 0.2;
  const bulbH = timerH * 0.38;
  const neckW = timerH * 0.025;
  const neckH = timerH * 0.06;

  // Colors
  const brassColor = "#D4A850";
  const brassDark = "#8B6914";
  const sandColor = "#E8C97A";
  const sandDark = "#C8A45A";
  const glassColor = "rgba(200, 220, 240, 0.06)";

  // Sand draining: progress through visible window
  const drainProgress = interpolate(cycleFrame, [0, DURATION], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const topSand = 1 - drainProgress;
  const bottomSand = drainProgress;

  // Flow rate modulated by energy
  const flowRate = interpolate(energy, [0.03, 0.35], [0.5, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Active grain count modulated by energy
  const activeGrains = Math.floor(interpolate(energy, [0.03, 0.3], [5, 30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  const topBulbTop = -timerH / 2;
  const topBulbBot = -neckH / 2;
  const botBulbTop = neckH / 2;
  const botBulbBot = timerH / 2;

  const glowSize = interpolate(energy, [0.03, 0.3], [1, 6], {
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
          filter: `drop-shadow(0 0 ${glowSize}px rgba(232, 201, 122, 0.3))`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Top brass cap */}
          <rect x={-bulbW - 6} y={topBulbTop - 8} width={(bulbW + 6) * 2} height={10} rx={3} fill={brassColor} opacity={0.5} />
          <rect x={-bulbW - 4} y={topBulbTop - 3} width={(bulbW + 4) * 2} height={4} rx={1} fill={brassDark} opacity={0.3} />

          {/* Bottom brass cap */}
          <rect x={-bulbW - 6} y={botBulbBot - 2} width={(bulbW + 6) * 2} height={10} rx={3} fill={brassColor} opacity={0.5} />
          <rect x={-bulbW - 4} y={botBulbBot - 1} width={(bulbW + 4) * 2} height={4} rx={1} fill={brassDark} opacity={0.3} />

          {/* Brass support columns */}
          <line x1={-bulbW - 2} y1={topBulbTop} x2={-bulbW - 2} y2={botBulbBot} stroke={brassDark} strokeWidth={2} opacity={0.3} />
          <line x1={bulbW + 2} y1={topBulbTop} x2={bulbW + 2} y2={botBulbBot} stroke={brassDark} strokeWidth={2} opacity={0.3} />

          {/* Top bulb glass */}
          <path
            d={`M ${-bulbW} ${topBulbTop + 2}
                Q ${-bulbW * 1.15} ${topBulbTop + bulbH * 0.5} ${-neckW} ${topBulbBot}
                L ${neckW} ${topBulbBot}
                Q ${bulbW * 1.15} ${topBulbTop + bulbH * 0.5} ${bulbW} ${topBulbTop + 2}
                Z`}
            fill={glassColor}
            stroke={brassColor}
            strokeWidth={1}
            opacity={0.4}
          />

          {/* Bottom bulb glass */}
          <path
            d={`M ${-neckW} ${botBulbTop}
                Q ${-bulbW * 1.15} ${botBulbBot - bulbH * 0.5} ${-bulbW} ${botBulbBot - 2}
                L ${bulbW} ${botBulbBot - 2}
                Q ${bulbW * 1.15} ${botBulbBot - bulbH * 0.5} ${neckW} ${botBulbTop}
                Z`}
            fill={glassColor}
            stroke={brassColor}
            strokeWidth={1}
            opacity={0.4}
          />

          {/* Neck */}
          <rect x={-neckW} y={-neckH / 2} width={neckW * 2} height={neckH} fill={glassColor} opacity={0.3} />

          {/* Sand in top bulb */}
          {topSand > 0.03 && (
            <path
              d={`M ${-bulbW * topSand * 0.8} ${topBulbBot - bulbH * topSand * 0.7}
                  Q ${-bulbW * topSand * 0.5} ${topBulbBot - bulbH * topSand * 0.15} ${-neckW * 0.7} ${topBulbBot}
                  L ${neckW * 0.7} ${topBulbBot}
                  Q ${bulbW * topSand * 0.5} ${topBulbBot - bulbH * topSand * 0.15} ${bulbW * topSand * 0.8} ${topBulbBot - bulbH * topSand * 0.7}
                  Z`}
              fill={sandColor}
              opacity={0.45}
            />
          )}

          {/* Sand in bottom bulb */}
          {bottomSand > 0.03 && (
            <path
              d={`M ${-bulbW * Math.min(1, bottomSand * 1.2) * 0.85} ${botBulbBot - 2 - bulbH * bottomSand * 0.65}
                  L ${-bulbW * 0.85} ${botBulbBot - 2}
                  L ${bulbW * 0.85} ${botBulbBot - 2}
                  L ${bulbW * Math.min(1, bottomSand * 1.2) * 0.85} ${botBulbBot - 2 - bulbH * bottomSand * 0.65}
                  Z`}
              fill={sandDark}
              opacity={0.45}
            />
          )}

          {/* Stream through neck */}
          {topSand > 0.02 && bottomSand < 0.98 && (
            <line x1={0} y1={topBulbBot} x2={0} y2={botBulbTop} stroke={sandColor} strokeWidth={neckW * 0.7} opacity={0.35} />
          )}

          {/* Falling sand grains below neck */}
          {topSand > 0.02 && grains.slice(0, activeGrains).map((g, gi) => {
            const t = ((cycleFrame * g.speed * flowRate + g.phase * 30) % 50) / 50;
            if (t > 0.92) return null;
            const gy = botBulbTop + t * (botBulbBot - botBulbTop - 10) * 0.5;
            const gx = Math.sin(cycleFrame * g.wobbleFreq + g.phase) * g.wobbleAmp;
            return (
              <circle
                key={`grain-${gi}`}
                cx={gx}
                cy={gy}
                r={g.size}
                fill={sandColor}
                opacity={0.3 * (1 - t)}
              />
            );
          })}

          {/* Glass reflections */}
          <line x1={-bulbW * 0.6} y1={topBulbTop + 8} x2={-bulbW * 0.3} y2={topBulbBot - 8} stroke="white" strokeWidth={1.2} opacity={0.06} strokeLinecap="round" />
          <line x1={-bulbW * 0.55} y1={botBulbTop + 8} x2={-bulbW * 0.25} y2={botBulbBot - 8} stroke="white" strokeWidth={1.2} opacity={0.06} strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
};
