/**
 * CampfireSparks — Rising ember/spark particles from bottom center.
 * 30-50 particles with orange/red/gold colors rising in curved paths with
 * wind drift. Sparks glow brighter and move faster during high energy.
 * Individual sparks flicker and fade out. Always visible; particle count
 * scales with energy.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SparkData {
  /** Horizontal origin offset from center (-0.3 to 0.3 of width) */
  originX: number;
  /** Rise speed (px per frame) */
  riseSpeed: number;
  /** Horizontal wind drift frequency */
  windFreq: number;
  /** Horizontal wind drift amplitude (px) */
  windAmp: number;
  /** Wind phase offset */
  windPhase: number;
  /** Secondary curve frequency (creates curved path) */
  curveFreq: number;
  /** Secondary curve amplitude */
  curveAmp: number;
  /** Base size (radius px) */
  size: number;
  /** Hue: 0-50 (red/orange/gold) */
  hue: number;
  /** Lightness: 50-90 */
  lightness: number;
  /** Cycle offset so sparks stagger */
  cycleOffset: number;
  /** Flicker frequency */
  flickerFreq: number;
  /** Flicker phase */
  flickerPhase: number;
  /** Rise cycle length for this spark (180-300 frames) */
  riseCycle: number;
}

const MAX_SPARKS = 50;
const MIN_SPARKS = 20;

function generateSparks(seed: number): SparkData[] {
  const rng = seeded(seed);
  return Array.from({ length: MAX_SPARKS }, () => {
    const riseCycle = 180 + Math.floor(rng() * 120);
    return {
      originX: (rng() - 0.5) * 0.35,
      riseSpeed: 2 + rng() * 4,
      windFreq: 0.008 + rng() * 0.025,
      windAmp: 20 + rng() * 70,
      windPhase: rng() * Math.PI * 2,
      curveFreq: 0.015 + rng() * 0.04,
      curveAmp: 10 + rng() * 40,
      size: 1.2 + rng() * 2.5,
      hue: rng() * 50,
      lightness: 50 + rng() * 40,
      cycleOffset: Math.floor(rng() * riseCycle),
      flickerFreq: 0.1 + rng() * 0.25,
      flickerPhase: rng() * Math.PI * 2,
      riseCycle,
    };
  });
}

const STAGGER_START = 90;

interface Props {
  frames: EnhancedFrameData[];
}

export const CampfireSparks: React.FC<Props> = ({ frames }) => {
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

  const sparks = React.useMemo(() => generateSparks(19770508), []);

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Always visible: opacity 0.12 to 0.4 based on energy
  const baseOpacity = interpolate(energy, [0.03, 0.35], [0.12, 0.40], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = baseOpacity * masterFade;

  if (masterOpacity < 0.01) return null;

  // Energy drives brightness boost and speed
  const brightnessMult = interpolate(energy, [0.03, 0.35], [0.5, 1.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const speedMult = interpolate(energy, [0.03, 0.35], [0.6, 1.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Visible count scales with energy
  const visibleCount = Math.round(interpolate(energy, [0.03, 0.35], [MIN_SPARKS, MAX_SPARKS], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  const centerX = width / 2;
  const bottomY = height * 0.95;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {sparks.slice(0, visibleCount).map((spark, i) => {
          // Cycle position: each spark loops independently
          const cycleFrame = (frame * speedMult + spark.cycleOffset) % spark.riseCycle;
          const riseProgress = cycleFrame / spark.riseCycle;

          // Y position: bottom center rising up
          const py = bottomY - riseProgress * height * 1.1;

          // X position: center-ish origin + wind drift + curved path
          const baseX = centerX + spark.originX * width;
          const windX = Math.sin(frame * spark.windFreq + spark.windPhase) * spark.windAmp;
          const curveX = Math.sin(frame * spark.curveFreq + spark.windPhase * 1.7) * spark.curveAmp * riseProgress;
          const px = baseX + windX + curveX;

          // Vertical fade: bright near bottom, fading near top
          const verticalFade = interpolate(riseProgress, [0, 0.1, 0.6, 1], [0.15, 1, 0.5, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          // Flicker
          const flicker = 0.55 + Math.sin(frame * spark.flickerFreq + spark.flickerPhase) * 0.3
            + Math.sin(frame * spark.flickerFreq * 3.1 + spark.flickerPhase * 0.6) * 0.15;

          const alpha = verticalFade * flicker * brightnessMult;
          if (alpha < 0.03) return null;

          // Size shrinks as spark rises (cools)
          const r = spark.size * (1 - riseProgress * 0.4);

          const hue = spark.hue;
          const lightness = Math.min(95, spark.lightness * brightnessMult);
          const coreColor = `hsla(${hue}, 100%, ${Math.min(97, lightness + 18)}%, ${alpha})`;
          const glowColor = `hsla(${hue}, 100%, ${lightness}%, ${alpha * 0.5})`;
          const outerGlow = `hsla(${hue + 8}, 85%, ${Math.max(30, lightness - 12)}%, ${alpha * 0.2})`;

          return (
            <g key={i}>
              <circle cx={px} cy={py} r={r * 5} fill={outerGlow} style={{ filter: "blur(4px)" }} />
              <circle cx={px} cy={py} r={r * 2.2} fill={glowColor} style={{ filter: "blur(2px)" }} />
              <circle cx={px} cy={py} r={r} fill={coreColor} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
