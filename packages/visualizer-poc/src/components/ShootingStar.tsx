/**
 * ShootingStar — Shooting stars that streak across on beat accents.
 * Unlike MeteorShower (which is energy-gated continuous), ShootingStar fires
 * specifically on detected beats/onsets, with longer graceful arcs and subtle
 * rainbow prismatic tails. Each star has a bright head, a color-shifting tail,
 * and a sparkle trail. Cycles: 35s on, 30s off (65s total).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface StarTrail {
  spawnFrame: number;
  duration: number;
  startX: number;
  startY: number;
  angle: number;
  speed: number;
  hueStart: number;
  hueEnd: number;
  headSize: number;
  tailWidth: number;
  sparkleCount: number;
}

const SCHEDULE_LENGTH = 108000;
const SLOT_INTERVAL = 8;

function generateSchedule(seed: number): StarTrail[] {
  const rng = seeded(seed);
  const stars: StarTrail[] = [];

  for (let f = 0; f < SCHEDULE_LENGTH; f += SLOT_INTERVAL) {
    if (rng() > 0.2) continue;

    const side = rng();
    let startX: number, startY: number, angle: number;
    if (side < 0.6) {
      startX = 0.1 + rng() * 0.8;
      startY = -0.03;
      angle = Math.PI * 0.4 + rng() * Math.PI * 0.2;
    } else if (side < 0.8) {
      startX = -0.03;
      startY = rng() * 0.4;
      angle = -Math.PI * 0.1 + rng() * Math.PI * 0.25;
    } else {
      startX = 1.03;
      startY = rng() * 0.4;
      angle = Math.PI * 0.7 + rng() * Math.PI * 0.25;
    }

    stars.push({
      spawnFrame: f,
      duration: 25 + Math.floor(rng() * 20),
      startX,
      startY,
      angle,
      speed: 25 + rng() * 30,
      hueStart: rng() * 360,
      hueEnd: rng() * 360,
      headSize: 2 + rng() * 2.5,
      tailWidth: 1 + rng() * 2,
      sparkleCount: 3 + Math.floor(rng() * 5),
    });
  }
  return stars;
}

const CYCLE = 1950; // 65s at 30fps
const DURATION = 1050; // 35s

interface Props {
  frames: EnhancedFrameData[];
}

export const ShootingStar: React.FC<Props> = ({ frames }) => {
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

  const schedule = React.useMemo(() => generateSchedule(20230815), []);
  const sparkleRng = React.useMemo(() => seeded(11235813), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  // Only fire on beat accents (onset > 0.15 or beat detected)
  const currentOnset = frames[idx]?.onset ?? 0;
  const isBeat = frames[idx]?.beat ?? false;
  const beatActive = currentOnset > 0.15 || isBeat;

  // Find active stars near beat frames
  const activeStars: { star: StarTrail; progress: number }[] = [];
  for (const s of schedule) {
    const elapsed = frame - s.spawnFrame;
    if (elapsed >= 0 && elapsed <= s.duration) {
      activeStars.push({ star: s, progress: elapsed / s.duration });
    }
    if (activeStars.length >= 3) break;
    if (s.spawnFrame > frame + 60) break;
  }

  // Also spawn on live beats
  if (beatActive && activeStars.length < 3) {
    // Use deterministic data from the beat frame to create a star
    const beatSeed = seeded(frame * 7 + 31415);
    const bStartX = 0.1 + beatSeed() * 0.8;
    const bAngle = Math.PI * 0.4 + beatSeed() * 0.2;
    activeStars.push({
      star: {
        spawnFrame: frame,
        duration: 30,
        startX: bStartX,
        startY: -0.02,
        angle: bAngle,
        speed: 30 + beatSeed() * 20,
        hueStart: beatSeed() * 360,
        hueEnd: beatSeed() * 360,
        headSize: 2.5,
        tailWidth: 1.5,
        sparkleCount: 4,
      },
      progress: 0,
    });
  }

  if (activeStars.length === 0) return null;

  const cycleFadeIn = interpolate(cycleFrame, [0, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const cycleFadeOut = interpolate(cycleFrame, [DURATION - 60, DURATION], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(cycleFadeIn, cycleFadeOut) * (0.6 + energy * 0.3);

  // Pre-compute sparkle offsets deterministically
  const sparkleOffsets: number[] = [];
  for (let k = 0; k < 30; k++) {
    sparkleOffsets.push(sparkleRng());
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, mixBlendMode: "screen" }}>
        <defs>
          <filter id="shooting-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {activeStars.map(({ star, progress }, si) => {
          const dist = progress * star.speed * star.duration;
          const headX = star.startX * width + Math.cos(star.angle) * dist;
          const headY = star.startY * height + Math.sin(star.angle) * dist;

          const tailLen = 80 + energy * 60;
          const tailX = headX - Math.cos(star.angle) * tailLen;
          const tailY = headY - Math.sin(star.angle) * tailLen;

          const fadeAlpha = interpolate(progress, [0, 0.1, 0.75, 1], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const hue = star.hueStart + (star.hueEnd - star.hueStart) * progress;

          return (
            <g key={`ss-${star.spawnFrame}-${si}`} opacity={fadeAlpha}>
              {/* Prismatic tail */}
              <line
                x1={tailX} y1={tailY} x2={headX} y2={headY}
                stroke={`hsla(${hue}, 80%, 80%, 0.4)`}
                strokeWidth={star.tailWidth}
                strokeLinecap="round"
              />
              <line
                x1={tailX + 2} y1={tailY + 1} x2={headX} y2={headY}
                stroke={`hsla(${(hue + 60) % 360}, 70%, 75%, 0.2)`}
                strokeWidth={star.tailWidth * 0.6}
                strokeLinecap="round"
              />
              {/* Head */}
              <circle
                cx={headX} cy={headY}
                r={star.headSize * (1 + energy * 0.5)}
                fill="#FFFFFF"
                filter="url(#shooting-glow)"
              />
              {/* Sparkle trail */}
              {Array.from({ length: star.sparkleCount }, (_, k) => {
                const t = (k + 1) / (star.sparkleCount + 1);
                const sIdx = (si * 10 + k) % sparkleOffsets.length;
                const sx = headX - Math.cos(star.angle) * tailLen * t + (sparkleOffsets[sIdx] - 0.5) * 8;
                const sy = headY - Math.sin(star.angle) * tailLen * t + (sparkleOffsets[(sIdx + 1) % sparkleOffsets.length] - 0.5) * 8;
                const sparkleAlpha = (1 - t) * 0.5 * fadeAlpha;
                return (
                  <circle
                    key={`sp${k}`}
                    cx={sx} cy={sy}
                    r={1 + sparkleOffsets[(sIdx + 2) % sparkleOffsets.length] * 1.5}
                    fill={`hsla(${(hue + k * 30) % 360}, 90%, 85%, ${sparkleAlpha})`}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
