/**
 * SoapBubbles -- 10-15 large soap bubbles floating upward.
 * Each bubble is a circle with iridescent rainbow gradient (thin film
 * interference -- shifting hue across surface). Bright highlight spot.
 * Bubbles wobble slightly. Occasional bubble pops (circle expands then
 * disappears). Bubble count and rise speed driven by energy.
 * Cycle: 40s, 14s visible.
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

const CYCLE = 1200; // 40 seconds at 30fps
const DURATION = 420; // 14 seconds visible

interface BubbleConfig {
  startX: number;
  startY: number;
  radius: number;
  riseSpeed: number;
  driftAmplitude: number;
  driftFreq: number;
  wobbleFreq: number;
  wobbleAmp: number;
  hueOffset: number;
  highlightAngle: number;
  popFrame: number; // frame within DURATION when this bubble pops (-1 = never)
  phase: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SoapBubbles: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate bubble configs
  const bubbles = React.useMemo(() => {
    const rng = seeded(77050808);
    const configs: BubbleConfig[] = [];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const willPop = rng() < 0.25;
      configs.push({
        startX: width * 0.1 + rng() * width * 0.8,
        startY: height * 0.6 + rng() * height * 0.4,
        radius: 20 + rng() * 45,
        riseSpeed: 0.3 + rng() * 0.7,
        driftAmplitude: 15 + rng() * 40,
        driftFreq: 0.01 + rng() * 0.02,
        wobbleFreq: 0.04 + rng() * 0.06,
        wobbleAmp: 0.02 + rng() * 0.06,
        hueOffset: rng() * 360,
        highlightAngle: -40 + rng() * 30,
        popFrame: willPop ? Math.floor(DURATION * 0.4 + rng() * DURATION * 0.45) : -1,
        phase: rng() * Math.PI * 2,
      });
    }
    return configs;
  }, [width, height]);

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
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.3, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Energy drives rise speed multiplier and bubble count visibility
  const riseMultiplier = interpolate(energy, [0.03, 0.3], [0.6, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const visibleCount = Math.floor(
    interpolate(energy, [0.03, 0.3], [8, 14], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  const glowSize = interpolate(energy, [0.03, 0.3], [3, 12], {
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
          filter: `drop-shadow(0 0 ${glowSize}px rgba(180, 200, 255, 0.3))`,
          willChange: "opacity",
        }}
      >
        <defs>
          {/* Iridescent gradient definitions per bubble */}
          {bubbles.slice(0, visibleCount).map((b, bi) => {
            const hue1 = (b.hueOffset + cycleFrame * 0.5) % 360;
            const hue2 = (hue1 + 60) % 360;
            const hue3 = (hue1 + 140) % 360;
            const hue4 = (hue1 + 220) % 360;
            return (
              <radialGradient
                key={`bg-${bi}`}
                id={`bubble-grad-${bi}`}
                cx="35%"
                cy="30%"
                r="65%"
              >
                <stop offset="0%" stopColor={`hsl(${hue1}, 70%, 85%)`} stopOpacity={0.15} />
                <stop offset="30%" stopColor={`hsl(${hue2}, 80%, 75%)`} stopOpacity={0.12} />
                <stop offset="60%" stopColor={`hsl(${hue3}, 70%, 65%)`} stopOpacity={0.1} />
                <stop offset="85%" stopColor={`hsl(${hue4}, 75%, 70%)`} stopOpacity={0.15} />
                <stop offset="100%" stopColor={`hsl(${hue1}, 60%, 80%)`} stopOpacity={0.08} />
              </radialGradient>
            );
          })}
        </defs>

        {bubbles.slice(0, visibleCount).map((b, bi) => {
          // Stagger appearance
          const appearFrame = bi * 15;
          if (cycleFrame < appearFrame) return null;

          // Check if this bubble has popped
          const isPopping = b.popFrame > 0 && cycleFrame >= b.popFrame;
          const popAge = isPopping ? cycleFrame - b.popFrame : 0;
          const popDuration = 12;

          if (isPopping && popAge > popDuration) return null;

          // Pop animation
          const popScale = isPopping
            ? interpolate(popAge, [0, popDuration * 0.4, popDuration], [1, 1.3, 2], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 1;
          const popOpacity = isPopping
            ? interpolate(popAge, [0, popDuration * 0.3, popDuration], [1, 0.8, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 1;

          // Rise position
          const age = cycleFrame - appearFrame;
          const riseY = -age * b.riseSpeed * riseMultiplier;
          const driftX = Math.sin(age * b.driftFreq + b.phase) * b.driftAmplitude;

          const bx = b.startX + driftX;
          const by = b.startY + riseY;

          // Skip if off screen
          if (by < -b.radius * 2 || by > height + b.radius) return null;

          // Wobble (slight radius deformation)
          const wobbleX = 1 + Math.sin(age * b.wobbleFreq) * b.wobbleAmp;
          const wobbleY = 1 + Math.cos(age * b.wobbleFreq * 1.3) * b.wobbleAmp;

          const r = b.radius * popScale;

          // Highlight position
          const hlAngle = b.highlightAngle * Math.PI / 180;
          const hlDist = r * 0.35;
          const hlX = Math.cos(hlAngle) * hlDist;
          const hlY = Math.sin(hlAngle) * hlDist;

          return (
            <g key={`bubble-${bi}`} opacity={popOpacity}>
              {/* Bubble body */}
              <ellipse
                cx={bx}
                cy={by}
                rx={r * wobbleX}
                ry={r * wobbleY}
                fill={`url(#bubble-grad-${bi})`}
                stroke={`hsla(${(b.hueOffset + cycleFrame * 0.5) % 360}, 60%, 80%, 0.2)`}
                strokeWidth={1}
              />

              {/* Thin film edge highlight */}
              <ellipse
                cx={bx}
                cy={by}
                rx={r * wobbleX * 0.95}
                ry={r * wobbleY * 0.95}
                fill="none"
                stroke={`hsla(${(b.hueOffset + cycleFrame * 0.5 + 120) % 360}, 80%, 85%, 0.12)`}
                strokeWidth={1.5}
              />

              {/* Primary highlight spot */}
              <ellipse
                cx={bx + hlX}
                cy={by + hlY}
                rx={r * 0.18}
                ry={r * 0.12}
                fill="white"
                opacity={0.25}
                transform={`rotate(${b.highlightAngle}, ${bx + hlX}, ${by + hlY})`}
              />

              {/* Secondary small highlight */}
              <circle
                cx={bx + hlX * 0.3 + r * 0.15}
                cy={by + hlY * 0.3 + r * 0.2}
                r={r * 0.06}
                fill="white"
                opacity={0.15}
              />

              {/* Pop burst rings */}
              {isPopping && popAge > 2 && (
                <>
                  <circle
                    cx={bx}
                    cy={by}
                    r={r * 1.1}
                    fill="none"
                    stroke="white"
                    strokeWidth={0.5}
                    opacity={0.15 * (1 - popAge / popDuration)}
                  />
                  {/* Small scattered droplets */}
                  {[0, 1, 2, 3, 4].map((di) => {
                    const da = (di * 72 + b.hueOffset) * Math.PI / 180;
                    const dd = r * 0.8 * (popAge / popDuration);
                    return (
                      <circle
                        key={`drop-${bi}-${di}`}
                        cx={bx + Math.cos(da) * dd}
                        cy={by + Math.sin(da) * dd}
                        r={2}
                        fill="white"
                        opacity={0.1 * (1 - popAge / popDuration)}
                      />
                    );
                  })}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
