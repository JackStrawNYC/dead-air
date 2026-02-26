/**
 * Flock -- Boids flocking algorithm simulation.
 * 40-60 small bird/arrow shapes that flock together following separation /
 * alignment / cohesion rules.  The flock moves as a murmuration -- swirling,
 * banking turns.  Energy drives flock speed and cohesion tightness.  Dark
 * silhouette birds.  Flock direction influenced by spectral centroid.
 * Cycle: 60s total, 20s visible.
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

const CYCLE = 1800;     // 60s
const DURATION = 600;   // 20s
const NUM_BOIDS = 50;

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function initBoids(seed: number, w: number, h: number): Boid[] {
  const rng = seeded(seed);
  /* start near centre as a loose cluster */
  return Array.from({ length: NUM_BOIDS }, () => ({
    x: w * (0.3 + rng() * 0.4),
    y: h * (0.3 + rng() * 0.4),
    vx: (rng() - 0.5) * 3,
    vy: (rng() - 0.5) * 3,
  }));
}

/* ---- boids rules ---- */
function stepBoids(
  boids: Boid[],
  w: number,
  h: number,
  cohesionStr: number,
  separationStr: number,
  alignStr: number,
  speedScale: number,
  targetAngle: number,
  targetStr: number,
): Boid[] {
  const n = boids.length;
  const sepDist = 40;
  const neighDist = 120;
  const maxSpeed = 4 * speedScale;

  return boids.map((b, bi) => {
    let cx = 0, cy = 0, sx = 0, sy = 0, ax = 0, ay = 0;
    let cohCount = 0, aliCount = 0;

    for (let j = 0; j < n; j++) {
      if (j === bi) continue;
      const dx = boids[j].x - b.x;
      const dy = boids[j].y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

      if (dist < sepDist) {
        sx -= dx / dist;
        sy -= dy / dist;
      }
      if (dist < neighDist) {
        cx += boids[j].x;
        cy += boids[j].y;
        cohCount++;
        ax += boids[j].vx;
        ay += boids[j].vy;
        aliCount++;
      }
    }

    let nvx = b.vx;
    let nvy = b.vy;

    /* cohesion */
    if (cohCount > 0) {
      nvx += ((cx / cohCount - b.x) * cohesionStr);
      nvy += ((cy / cohCount - b.y) * cohesionStr);
    }
    /* separation */
    nvx += sx * separationStr;
    nvy += sy * separationStr;
    /* alignment */
    if (aliCount > 0) {
      nvx += ((ax / aliCount - b.vx) * alignStr);
      nvy += ((ay / aliCount - b.vy) * alignStr);
    }

    /* target direction (spectral centroid influence) */
    nvx += Math.cos(targetAngle) * targetStr;
    nvy += Math.sin(targetAngle) * targetStr;

    /* edge repulsion (soft walls) */
    const margin = 80;
    if (b.x < margin) nvx += (margin - b.x) * 0.02;
    if (b.x > w - margin) nvx -= (b.x - (w - margin)) * 0.02;
    if (b.y < margin) nvy += (margin - b.y) * 0.02;
    if (b.y > h - margin) nvy -= (b.y - (h - margin)) * 0.02;

    /* limit speed */
    const speed = Math.sqrt(nvx * nvx + nvy * nvy) || 0.001;
    if (speed > maxSpeed) {
      nvx = (nvx / speed) * maxSpeed;
      nvy = (nvy / speed) * maxSpeed;
    }

    return {
      x: b.x + nvx,
      y: b.y + nvy,
      vx: nvx,
      vy: nvy,
    };
  });
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Flock: React.FC<Props> = ({ frames }) => {
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

  /* memos BEFORE conditional returns.
     We run the full boids simulation up to `cycleFrame` steps inside useMemo
     keyed on the current cycleFrame.  This is O(N^2 * cycleFrame) per render
     but N=50 and cycleFrame <= 600 so it's fast enough for 30fps Remotion. */
  const cycleFrame = frame % CYCLE;

  const boids = React.useMemo(() => {
    const initial = initBoids(cycleIndex * 67 + 770508, width, height);

    if (cycleFrame >= DURATION) return initial; // won't be rendered

    /* simulate forward */
    let state = initial;
    const stepsToRun = Math.min(cycleFrame, DURATION);
    for (let step = 0; step < stepsToRun; step++) {
      const stepIdx = Math.min(Math.max(0, (frame - cycleFrame) + step), frames.length - 1);
      const fd = frames[stepIdx];
      const stepEnergy = fd.rms;
      const centroid = fd.centroid;

      /* spectral centroid drives direction */
      const targetAngle = centroid * Math.PI * 2;
      const targetStr = 0.1 + stepEnergy * 0.3;

      /* energy drives speed and cohesion */
      const speedScale = 0.6 + stepEnergy * 2;
      const cohesion = interpolate(stepEnergy, [0.05, 0.3], [0.003, 0.012], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

      state = stepBoids(state, width, height, cohesion, 0.8, 0.06, speedScale, targetAngle, targetStr);
    }
    return state;
  }, [cycleIndex, cycleFrame, width, height, frame, frames]);

  /* ----- cycle gate ----- */
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.7;
  if (masterOpacity < 0.01) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {boids.map((b, bi) => {
          /* heading angle from velocity */
          const angle = Math.atan2(b.vy, b.vx) * (180 / Math.PI);
          const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          /* scale slightly with speed */
          const birdScale = 0.8 + interpolate(speed, [0, 4], [0, 0.4], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <g
              key={bi}
              transform={`translate(${b.x}, ${b.y}) rotate(${angle}) scale(${birdScale})`}
            >
              {/* bird silhouette: simple arrow/chevron */}
              <path
                d="M 8 0 L -4 -5 L -2 0 L -4 5 Z"
                fill="#1A1A2E"
                opacity={0.85}
              />
              {/* subtle wing highlight */}
              <path
                d="M 6 0 L -2 -3.5 L -1 0 L -2 3.5 Z"
                fill="#2D2D44"
                opacity={0.5}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
