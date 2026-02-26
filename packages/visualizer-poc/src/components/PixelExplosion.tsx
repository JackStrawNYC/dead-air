/**
 * PixelExplosion -- 8-bit style pixel particle bursts.
 * On strong onsets (>0.7), a burst of 20-30 square pixels explodes outward
 * from a random point.  Pixels follow ballistic paths (gravity pulls down).
 * Bright rainbow colors.  Multiple bursts can be active simultaneously.
 * Retro gaming aesthetic.  Energy-gated.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const ONSET_THRESHOLD = 0.7;
const PARTICLES_PER_BURST = 25;
const BURST_LIFETIME = 60; // 2 seconds
const GRAVITY = 0.18; // px/frame^2
const MAX_ACTIVE_BURSTS = 6;
const PIXEL_SIZE_MIN = 4;
const PIXEL_SIZE_MAX = 10;
const SCAN_WINDOW = 4; // look at frames within +/-4 of current for onset detection
const MIN_BURST_SPACING = 12; // minimum frames between bursts

const RAINBOW_HUES = [0, 30, 60, 120, 180, 210, 270, 300, 330];

interface ParticleData {
  /** Velocity X (px/frame) */
  vx: number;
  /** Velocity Y (px/frame, negative = up) */
  vy: number;
  /** Pixel size */
  size: number;
  /** Hue */
  hue: number;
  /** Saturation */
  sat: number;
  /** Lightness */
  light: number;
}

interface BurstData {
  /** Frame the burst was triggered */
  birthFrame: number;
  /** Center x (px) */
  cx: number;
  /** Center y (px) */
  cy: number;
  /** Particles */
  particles: ParticleData[];
}

/** Pre-scan the frames data and generate all burst events deterministically */
function generateBursts(
  framesData: EnhancedFrameData[],
  screenWidth: number,
  screenHeight: number,
): BurstData[] {
  const bursts: BurstData[] = [];
  let lastBurstFrame = -MIN_BURST_SPACING;

  for (let f = 0; f < framesData.length; f++) {
    if (f - lastBurstFrame < MIN_BURST_SPACING) continue;
    if (framesData[f].onset <= ONSET_THRESHOLD) continue;

    /* Confirm it's a local maximum */
    let isMax = true;
    for (let d = 1; d <= SCAN_WINDOW; d++) {
      if (f - d >= 0 && framesData[f - d].onset > framesData[f].onset) {
        isMax = false;
        break;
      }
      if (f + d < framesData.length && framesData[f + d].onset > framesData[f].onset) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;

    const rng = seeded(f * 7919 + 42);

    const cx = 0.15 * screenWidth + rng() * 0.7 * screenWidth;
    const cy = 0.2 * screenHeight + rng() * 0.5 * screenHeight;

    const particles: ParticleData[] = Array.from(
      { length: PARTICLES_PER_BURST },
      () => {
        const angle = rng() * Math.PI * 2;
        const speed = 3 + rng() * 8;
        return {
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2, // bias upward
          size: PIXEL_SIZE_MIN + rng() * (PIXEL_SIZE_MAX - PIXEL_SIZE_MIN),
          hue: RAINBOW_HUES[Math.floor(rng() * RAINBOW_HUES.length)],
          sat: 80 + rng() * 20,
          light: 55 + rng() * 25,
        };
      },
    );

    bursts.push({ birthFrame: f, cx, cy, particles });
    lastBurstFrame = f;
  }

  return bursts;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PixelExplosion: React.FC<Props> = ({ frames }) => {
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

  /* Pre-generate all burst events (memoized) */
  const allBursts = React.useMemo(
    () => generateBursts(frames, width, height),
    [frames, width, height],
  );

  /* Energy gate: only show when energy is moderate+ */
  const gateOpacity = interpolate(energy, [0.08, 0.18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* Fade in */
  const masterFade = interpolate(frame, [30, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = gateOpacity * masterFade;
  if (masterOpacity < 0.01) return null;

  /* Find active bursts: born within BURST_LIFETIME frames ago */
  const activeBursts = allBursts.filter(
    (b) => frame >= b.birthFrame && frame < b.birthFrame + BURST_LIFETIME,
  );

  /* Limit active bursts */
  const visibleBursts = activeBursts.slice(-MAX_ACTIVE_BURSTS);

  if (visibleBursts.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        opacity: masterOpacity,
      }}
    >
      <svg width={width} height={height}>
        {visibleBursts.map((burst) => {
          const age = frame - burst.birthFrame;
          /* Overall burst fade */
          const burstAlpha = interpolate(age, [0, 5, BURST_LIFETIME * 0.6, BURST_LIFETIME], [0, 1, 0.7, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          if (burstAlpha < 0.02) return null;

          return (
            <g key={burst.birthFrame}>
              {burst.particles.map((p, pi) => {
                /* Ballistic trajectory */
                const px = burst.cx + p.vx * age;
                const py = burst.cy + p.vy * age + 0.5 * GRAVITY * age * age;

                /* Off screen check */
                if (px < -20 || px > width + 20 || py > height + 20) return null;

                /* Per-particle fade */
                const particleAlpha = burstAlpha * interpolate(
                  age,
                  [0, BURST_LIFETIME * 0.4, BURST_LIFETIME],
                  [1, 0.8, 0],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );

                if (particleAlpha < 0.03) return null;

                /* Pixel rotates slightly */
                const rotation = age * (pi % 2 === 0 ? 3 : -3);

                /* Size shrinks slightly over time */
                const size = p.size * interpolate(age, [0, BURST_LIFETIME], [1, 0.5], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });

                const color = `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${particleAlpha})`;
                const glowColor = `hsla(${p.hue}, 100%, ${p.light + 15}%, ${particleAlpha * 0.5})`;

                return (
                  <g key={pi}>
                    {/* Pixel glow */}
                    <rect
                      x={px - size * 0.75}
                      y={py - size * 0.75}
                      width={size * 1.5}
                      height={size * 1.5}
                      fill={glowColor}
                      transform={`rotate(${rotation}, ${px}, ${py})`}
                      style={{ filter: "blur(2px)" }}
                    />
                    {/* Pixel core */}
                    <rect
                      x={px - size / 2}
                      y={py - size / 2}
                      width={size}
                      height={size}
                      fill={color}
                      transform={`rotate(${rotation}, ${px}, ${py})`}
                    />
                    {/* Inner highlight */}
                    <rect
                      x={px - size * 0.2}
                      y={py - size * 0.2}
                      width={size * 0.4}
                      height={size * 0.4}
                      fill={`hsla(${p.hue}, 100%, 90%, ${particleAlpha * 0.6})`}
                      transform={`rotate(${rotation}, ${px}, ${py})`}
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
