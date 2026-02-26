/**
 * Dewdrops — 15-25 circular water droplets sitting on the screen surface.
 * Each droplet is a circle with a radial gradient (bright highlight
 * off-center for refraction look). Droplets slowly grow, merge when
 * touching (larger droplet absorbs smaller). New droplets form at
 * seeded positions. Crystal clear with slight color tint. Energy
 * drives formation rate.
 * Cycle: 50s (1500 frames), 18s visible (540 frames).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 1500;    // 50 seconds at 30fps
const DURATION = 540;  // 18 seconds visible
const STAGGER_OFFSET = 270; // 9s offset
const MAX_DROPLETS = 22;
const NUM_WAVES = 4;   // waves of droplet formation

interface DropletSeed {
  x: number;       // 0-1
  y: number;       // 0-1
  maxRadius: number;
  growthRate: number;
  hueOffset: number;
  waveIndex: number; // which wave this droplet belongs to
  /** Highlight position angle (where the refraction glint sits) */
  highlightAngle: number;
}

function generateDropletSeeds(seed: number): DropletSeed[] {
  const rng = mulberry32(seed);
  return Array.from({ length: MAX_DROPLETS }, (_, i) => ({
    x: 0.08 + rng() * 0.84,
    y: 0.08 + rng() * 0.84,
    maxRadius: 15 + rng() * 35,
    growthRate: 0.3 + rng() * 0.7,
    hueOffset: rng() * 40 - 20,
    waveIndex: Math.floor(rng() * NUM_WAVES),
    highlightAngle: -0.8 + rng() * 0.6,  // upper-left quadrant for natural light
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Dewdrops: React.FC<Props> = ({ frames }) => {
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

  const dropletSeeds = React.useMemo(() => generateDropletSeeds(4433221), []);

  // Periodic visibility
  const effectiveFrame = Math.max(0, frame - STAGGER_OFFSET);
  const cycleFrame = effectiveFrame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const visibility = Math.min(fadeIn, fadeOut);

  const energyOpacity = interpolate(energy, [0.04, 0.25], [0.15, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = visibility * energyOpacity;
  if (masterOpacity < 0.01) return null;

  // Energy drives formation speed (droplets grow faster)
  const formationMult = interpolate(energy, [0.03, 0.3], [0.5, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Compute current droplet states
  interface DropletState {
    x: number;
    y: number;
    radius: number;
    highlightAngle: number;
    hueOffset: number;
    alive: boolean;
  }

  const states: DropletState[] = dropletSeeds.map((seed) => {
    // Each wave appears at a different phase of the cycle
    const waveStart = seed.waveIndex / NUM_WAVES;
    const waveProgress = Math.max(0, progress - waveStart) / (1 - waveStart);

    if (waveProgress <= 0) {
      return { x: 0, y: 0, radius: 0, highlightAngle: 0, hueOffset: 0, alive: false };
    }

    // Growth: starts small, grows with easing
    const growEased = interpolate(
      waveProgress * formationMult,
      [0, 0.5, 1],
      [0, 0.7, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const radius = seed.maxRadius * growEased * seed.growthRate;

    return {
      x: seed.x * width,
      y: seed.y * height,
      radius: Math.max(0, radius),
      highlightAngle: seed.highlightAngle,
      hueOffset: seed.hueOffset,
      alive: radius > 1,
    };
  });

  // Merge pass: if two droplets overlap, grow the larger one and remove the smaller
  const alive = states.filter((s) => s.alive);
  const merged = new Set<number>();

  for (let a = 0; a < alive.length; a++) {
    if (merged.has(a)) continue;
    for (let b = a + 1; b < alive.length; b++) {
      if (merged.has(b)) continue;
      const dx = alive[a].x - alive[b].x;
      const dy = alive[a].y - alive[b].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const touchDist = alive[a].radius + alive[b].radius;
      if (dist < touchDist * 0.8) {
        // Merge: bigger absorbs smaller
        if (alive[a].radius >= alive[b].radius) {
          alive[a].radius = Math.sqrt(alive[a].radius ** 2 + alive[b].radius ** 2);
          merged.add(b);
        } else {
          alive[b].radius = Math.sqrt(alive[a].radius ** 2 + alive[b].radius ** 2);
          merged.add(a);
          break;
        }
      }
    }
  }

  const visibleDroplets = alive.filter((_, i) => !merged.has(i));

  // Crystal clear palette — slight blue/cyan tint
  const baseHue = 200 + Math.sin(cycleFrame * 0.007) * 20;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          mixBlendMode: "screen",
        }}
      >
        <defs>
          {visibleDroplets.map((drop, i) => {
            const hue = baseHue + drop.hueOffset;
            // Highlight offset: 30% from center toward upper-left
            const hlX = 35 + Math.cos(drop.highlightAngle) * 15;
            const hlY = 35 + Math.sin(drop.highlightAngle) * 15;
            return (
              <radialGradient
                key={`dg-${i}`}
                id={`drop-grad-${i}`}
                cx={`${hlX}%`}
                cy={`${hlY}%`}
                r="55%"
              >
                <stop offset="0%" stopColor="white" stopOpacity="0.9" />
                <stop offset="20%" stopColor={`hsl(${hue}, 30%, 90%)`} stopOpacity="0.5" />
                <stop offset="60%" stopColor={`hsl(${hue}, 40%, 70%)`} stopOpacity="0.15" />
                <stop offset="100%" stopColor={`hsl(${hue}, 50%, 50%)`} stopOpacity="0.05" />
              </radialGradient>
            );
          })}
        </defs>

        {visibleDroplets.map((drop, i) => {
          if (drop.radius < 2) return null;
          const hue = baseHue + drop.hueOffset;

          return (
            <g key={`d-${i}`}>
              {/* Droplet body — radial gradient for refraction */}
              <circle
                cx={drop.x}
                cy={drop.y}
                r={drop.radius}
                fill={`url(#drop-grad-${i})`}
                stroke={`hsla(${hue}, 50%, 80%, 0.3)`}
                strokeWidth={0.8}
              />

              {/* Inner highlight (refraction glint) */}
              <circle
                cx={drop.x + Math.cos(drop.highlightAngle) * drop.radius * 0.3}
                cy={drop.y + Math.sin(drop.highlightAngle) * drop.radius * 0.3}
                r={drop.radius * 0.2}
                fill="white"
                opacity={0.5 + energy * 0.3}
              />

              {/* Bottom shadow/caustic */}
              <ellipse
                cx={drop.x}
                cy={drop.y + drop.radius * 0.8}
                rx={drop.radius * 0.5}
                ry={drop.radius * 0.15}
                fill={`hsla(${hue}, 60%, 70%, 0.15)`}
                style={{ filter: "blur(2px)" }}
              />

              {/* Subtle edge ring */}
              <circle
                cx={drop.x}
                cy={drop.y}
                r={drop.radius * 0.92}
                fill="none"
                stroke="white"
                strokeWidth={0.3}
                opacity={0.1}
              />
            </g>
          );
        })}

        {/* Ambient refraction lines (surface tension) */}
        {visibleDroplets
          .filter((d) => d.radius > 15)
          .map((drop, i) => {
            const arcR = drop.radius * 0.85;
            const startAngle = drop.highlightAngle + 0.5;
            const endAngle = drop.highlightAngle + 1.8;
            const sx = drop.x + Math.cos(startAngle) * arcR;
            const sy = drop.y + Math.sin(startAngle) * arcR;
            const ex = drop.x + Math.cos(endAngle) * arcR;
            const ey = drop.y + Math.sin(endAngle) * arcR;
            return (
              <path
                key={`arc-${i}`}
                d={`M ${sx} ${sy} A ${arcR} ${arcR} 0 0 1 ${ex} ${ey}`}
                fill="none"
                stroke="white"
                strokeWidth={0.4}
                opacity={0.15}
              />
            );
          })}
      </svg>
    </div>
  );
};
