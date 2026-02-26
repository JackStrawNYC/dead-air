/**
 * Pyrotechnics — Stage pyro fountain effects that burst on high energy peaks.
 * Gerb-style fountains shoot upward from the bottom of frame at 3-5 positions.
 * Each fountain is a column of sparks that rise and spread. Sparks have gravity
 * and short lifetimes. Golden/white/orange sparks. Triggered deterministically
 * when energy exceeds 0.30 threshold. Max 3 concurrent fountains.
 * Cycle: every 45s (1350 frames) for 18s (540 frames).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPARK_COLORS = [
  { h: 42, s: 100, l: 80 },  // bright gold
  { h: 35, s: 95, l: 70 },   // amber
  { h: 25, s: 100, l: 65 },  // orange
  { h: 50, s: 90, l: 90 },   // white-gold
  { h: 15, s: 100, l: 60 },  // deep orange
];

interface SparkData {
  vx: number;
  vy: number;
  size: number;
  colorIdx: number;
  lifetime: number;
  drag: number;
}

interface FountainData {
  x: number;
  sparks: SparkData[];
}

interface FountainEvent {
  frame: number;
  fountain: FountainData;
}

const CHECK_INTERVAL = 12;
const RMS_THRESHOLD = 0.30;
const MAX_CONCURRENT = 3;
const SPARKS_PER_FOUNTAIN = 35;
const GRAVITY = 0.08;
const FOUNTAIN_DURATION = 75;

// Cycle: every 45s for 18s
const CYCLE_PERIOD = 1350;
const SHOW_DURATION = 540;
const FADE_FRAMES = 40;

function precomputeFountains(
  frames: EnhancedFrameData[],
  masterSeed: number,
): FountainEvent[] {
  const rng = seeded(masterSeed);
  const events: FountainEvent[] = [];

  for (let f = 0; f < frames.length; f += CHECK_INTERVAL) {
    // Only spawn during show windows
    const cyclePos = f % CYCLE_PERIOD;
    if (cyclePos >= SHOW_DURATION) continue;

    if (frames[f].rms > RMS_THRESHOLD) {
      const active = events.filter((e) => f - e.frame < FOUNTAIN_DURATION);
      if (active.length >= MAX_CONCURRENT) continue;

      const sparks: SparkData[] = Array.from({ length: SPARKS_PER_FOUNTAIN }, () => {
        const spreadAngle = -Math.PI / 2 + (rng() - 0.5) * 0.8; // mostly upward
        const speed = 3 + rng() * 7;
        return {
          vx: Math.cos(spreadAngle) * speed,
          vy: Math.sin(spreadAngle) * speed,
          size: 1 + rng() * 2.5,
          colorIdx: Math.floor(rng() * SPARK_COLORS.length),
          lifetime: 35 + Math.floor(rng() * 40),
          drag: 0.95 + rng() * 0.04,
        };
      });

      events.push({
        frame: f,
        fountain: {
          x: 0.1 + rng() * 0.8,
          sparks,
        },
      });
    }
  }

  return events;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Pyrotechnics: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const fountainEvents = React.useMemo(
    () => precomputeFountains(frames, (ctx?.showSeed ?? 19770508)),
    [frames, ctx?.showSeed],
  );

  // Cycle fade envelope
  const cyclePos = frame % CYCLE_PERIOD;
  const inShowWindow = cyclePos < SHOW_DURATION;

  const showFadeIn = interpolate(cyclePos, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const showFadeOut = interpolate(
    cyclePos,
    [SHOW_DURATION - FADE_FRAMES, SHOW_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) },
  );
  const showEnvelope = Math.min(showFadeIn, showFadeOut);
  const cycleOpacity = inShowWindow ? showEnvelope : 0;

  // Find active fountains
  const activeFountains = fountainEvents.filter(
    (e) => frame >= e.frame && frame < e.frame + FOUNTAIN_DURATION,
  );

  if (activeFountains.length === 0 || cycleOpacity < 0.01) return null;

  // Intensity boost from energy
  const intensityBoost = interpolate(energy, [0.2, 0.45], [0.6, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const baseY = height - 10;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: cycleOpacity }}>
        {activeFountains.map((event, fi) => {
          const age = frame - event.frame;
          const originX = event.fountain.x * width;

          return (
            <g key={`fountain-${event.frame}-${fi}`}>
              {/* Base glow */}
              <ellipse
                cx={originX}
                cy={baseY}
                rx={25}
                ry={8}
                fill={`hsla(42, 100%, 80%, ${0.4 * intensityBoost})`}
                style={{ filter: `blur(6px)` }}
              />
              {event.fountain.sparks.map((spark, si) => {
                if (age >= spark.lifetime) return null;

                // Physics
                let px = originX;
                let py = baseY;
                let vx = spark.vx;
                let vy = spark.vy;
                for (let t = 0; t < age; t++) {
                  px += vx;
                  py += vy;
                  vy += GRAVITY;
                  vx *= spark.drag;
                  vy *= spark.drag;
                }

                const lifeProgress = age / spark.lifetime;
                const alpha = interpolate(lifeProgress, [0, 0.2, 1], [0.9, 0.9, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });

                if (alpha < 0.02) return null;

                const color = SPARK_COLORS[spark.colorIdx];
                const fillColor = `hsla(${color.h}, ${color.s}%, ${color.l}%, ${alpha * intensityBoost})`;
                const r = spark.size * (1 - lifeProgress * 0.6);

                // Trail
                const speed = Math.sqrt(vx * vx + vy * vy) + 0.001;
                const trailLen = Math.min(10, speed * 2.5);
                const trailX = px - (vx / speed) * trailLen;
                const trailY = py - (vy / speed) * trailLen;

                return (
                  <g key={si}>
                    <line
                      x1={px}
                      y1={py}
                      x2={trailX}
                      y2={trailY}
                      stroke={fillColor}
                      strokeWidth={r * 0.5}
                      strokeLinecap="round"
                    />
                    <circle
                      cx={px}
                      cy={py}
                      r={r}
                      fill={fillColor}
                      style={{ filter: `drop-shadow(0 0 3px ${fillColor})` }}
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
