/**
 * Pyrotechnics — Stage pyro fountain effects that burst on high energy peaks.
 * Gerb-style fountains shoot upward from the bottom of frame at 3-5 positions.
 * Each fountain is a column of sparks that rise and spread. Sparks have gravity
 * and short lifetimes. Golden/white/orange sparks. Triggered deterministically
 * when energy exceeds 0.15 threshold. Max 5 concurrent fountains.
 * No cycle timer — fires whenever the music warrants it.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";

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
const RMS_THRESHOLD = 0.15;
const MAX_CONCURRENT = 5;
const SPARKS_PER_FOUNTAIN = 50;
const GRAVITY = 0.08;
const FOUNTAIN_DURATION = 75;

function precomputeFountains(
  frames: EnhancedFrameData[],
  masterSeed: number,
): FountainEvent[] {
  const rng = seeded(masterSeed);
  const events: FountainEvent[] = [];

  for (let f = 0; f < frames.length; f += CHECK_INTERVAL) {
    if (frames[f].rms > RMS_THRESHOLD) {
      const active = events.filter((e) => f - e.frame < FOUNTAIN_DURATION);
      if (active.length >= MAX_CONCURRENT) continue;

      const sparks: SparkData[] = Array.from({ length: SPARKS_PER_FOUNTAIN }, () => {
        const spreadAngle = -Math.PI / 2 + (rng() - 0.5) * 0.8; // mostly upward
        const speed = 5 + rng() * 10;
        return {
          vx: Math.cos(spreadAngle) * speed,
          vy: Math.sin(spreadAngle) * speed,
          size: 3 + rng() * 5,
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
  const snap = useAudioSnapshot(frames);

  const energy = snap.energy;

  const fountainEvents = React.useMemo(
    () => precomputeFountains(frames, (ctx?.showSeed ?? 19770508)),
    [frames, ctx?.showSeed],
  );

  // Find active fountains
  const activeFountains = fountainEvents.filter(
    (e) => frame >= e.frame && frame < e.frame + FOUNTAIN_DURATION,
  );

  if (activeFountains.length === 0) return null;

  // Intensity boost from energy
  const intensityBoost = interpolate(energy, [0.2, 0.45], [0.6, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const baseY = height - 10;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}>
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
