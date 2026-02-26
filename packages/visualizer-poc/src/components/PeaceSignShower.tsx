/**
 * PeaceSignShower — Peace symbols floating across screen.
 * Peace sign = circle + 3 lines inside (SVG).
 * 3-5 visible at a time, drifting diagonally downward like snow.
 * Different sizes (40-100px). Neon rainbow colors cycling.
 * Gentle rotation as they fall. Continuous: always spawning new ones.
 * More appear during higher energy. 15-35% opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface PeaceParticle {
  startFrame: number;
  lifetime: number;
  startX: number; // 0-1 normalized
  size: number;
  hueOffset: number;
  driftXSpeed: number; // pixels per frame
  fallSpeed: number; // pixels per frame
  rotationSpeed: number;
  rotationStart: number;
}

function generateParticles(totalFrames: number, seed: number): PeaceParticle[] {
  const rng = seeded(seed);
  const particles: PeaceParticle[] = [];
  let nextStart = 30;
  while (nextStart < totalFrames) {
    const lifetime = 180 + Math.floor(rng() * 180); // 6-12 seconds
    particles.push({
      startFrame: nextStart,
      lifetime,
      startX: rng(),
      size: 40 + rng() * 60, // 40-100px
      hueOffset: rng() * 360,
      driftXSpeed: (rng() - 0.5) * 1.2,
      fallSpeed: 0.8 + rng() * 1.5,
      rotationSpeed: (rng() - 0.5) * 1.5,
      rotationStart: rng() * 360,
    });
    // Spacing: 60-150 frames between spawns
    nextStart += 60 + Math.floor(rng() * 90);
  }
  return particles;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PeaceSignShower: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const particles = React.useMemo(
    () => generateParticles(durationInFrames, 55667),
    [durationInFrames],
  );

  // Master opacity: 15-35% based on energy
  const masterOpacity = interpolate(energy, [0.02, 0.25], [0.15, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Max concurrent: 3 during quiet, 5 during loud
  const maxVisible = Math.round(interpolate(energy, [0.03, 0.3], [3, 5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  // Collect active particles
  const active: Array<{ p: PeaceParticle; age: number }> = [];
  for (const p of particles) {
    const age = frame - p.startFrame;
    if (age >= 0 && age < p.lifetime) {
      active.push({ p, age });
      if (active.length >= maxVisible) break;
    }
  }

  if (active.length === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {active.map(({ p, age }, ai) => {
          const t = age / p.lifetime;
          // Fade in/out
          const fadeIn = Math.min(1, t * 6);
          const fadeOut = Math.min(1, (1 - t) * 6);
          const particleOpacity = Math.min(fadeIn, fadeOut);

          if (particleOpacity < 0.01) return null;

          // Position: start at top, drift down diagonally
          const x = p.startX * width + age * p.driftXSpeed;
          const y = -p.size + age * p.fallSpeed;

          // Wrap horizontally
          const wx = ((x % width) + width) % width;

          // If past bottom, skip
          if (y > height + p.size) return null;

          const rotation = p.rotationStart + age * p.rotationSpeed;
          const hue = (frame * 1.2 + p.hueOffset) % 360;
          const color = `hsl(${hue}, 100%, 65%)`;
          const s = p.size;
          const r = s * 0.44;

          return (
            <g
              key={ai}
              transform={`translate(${wx}, ${y}) rotate(${rotation})`}
              opacity={particleOpacity}
              style={{ filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 14px ${color})` }}
            >
              {/* Peace sign: circle + vertical line + two angled lines */}
              <circle cx={0} cy={0} r={r} stroke={color} strokeWidth={2.5} fill="none" />
              <line x1={0} y1={-r} x2={0} y2={r} stroke={color} strokeWidth={2.5} />
              <line x1={0} y1={0} x2={-r * 0.7} y2={r * 0.7} stroke={color} strokeWidth={2.5} />
              <line x1={0} y1={0} x2={r * 0.7} y2={r * 0.7} stroke={color} strokeWidth={2.5} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
