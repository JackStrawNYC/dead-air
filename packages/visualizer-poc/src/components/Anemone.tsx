/**
 * Anemone — 3-4 sea anemone clusters at bottom of screen.
 * Each anemone is a ring of 12-20 tentacle lines radiating from a central base,
 * waving independently. Tentacles have rounded tips.
 * Bioluminescent colors: magenta, cyan, gold.
 * Tentacle wave speed tied to energy. Cycle: 50s, 15s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1500;    // 50 seconds at 30fps
const DURATION = 450;  // 15 seconds
const NUM_ANEMONES = 4;

const ANEMONE_PALETTES = [
  { base: "#FF00AA", tentacle: "#FF44CC", tip: "#FF88EE" },
  { base: "#00CCCC", tentacle: "#00EEFF", tip: "#66FFFF" },
  { base: "#CCAA00", tentacle: "#FFD700", tip: "#FFE866" },
  { base: "#CC00FF", tentacle: "#DD44FF", tip: "#EE88FF" },
];

interface AnemoneData {
  x: number;
  y: number;
  paletteIdx: number;
  tentacleCount: number;
  tentacleLength: number;
  baseRadius: number;
  waveSpeedBase: number;
}

interface TentacleData {
  angle: number;
  lengthMult: number;
  phaseOffset: number;
  waveFreqMult: number;
  thickness: number;
}

function generateAnemones(seed: number): AnemoneData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_ANEMONES }, () => ({
    x: 0.08 + rng() * 0.84,
    y: 0.85 + rng() * 0.12,
    paletteIdx: Math.floor(rng() * ANEMONE_PALETTES.length),
    tentacleCount: 12 + Math.floor(rng() * 9),
    tentacleLength: 50 + rng() * 80,
    baseRadius: 12 + rng() * 18,
    waveSpeedBase: 0.03 + rng() * 0.02,
  }));
}

function generateTentacles(anemone: AnemoneData, seed: number): TentacleData[] {
  const rng = seeded(seed);
  return Array.from({ length: anemone.tentacleCount }, (_, i) => {
    const angleSpread = (Math.PI * 0.9);
    const baseAngle = -Math.PI / 2;
    const angle =
      baseAngle - angleSpread / 2 +
      (i / (anemone.tentacleCount - 1)) * angleSpread +
      (rng() - 0.5) * 0.15;
    return {
      angle,
      lengthMult: 0.7 + rng() * 0.6,
      phaseOffset: rng() * Math.PI * 2,
      waveFreqMult: 0.8 + rng() * 0.4,
      thickness: 1.5 + rng() * 2,
    };
  });
}

function buildTentaclePath(
  ox: number,
  oy: number,
  tentacle: TentacleData,
  length: number,
  frame: number,
  waveSpeed: number,
  waveMult: number,
): { path: string; tipX: number; tipY: number } {
  const segs = 10;
  const points: Array<[number, number]> = [];

  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    // Progressive wave (more movement at tip)
    const wave =
      Math.sin(
        frame * waveSpeed * tentacle.waveFreqMult * waveMult +
          tentacle.phaseOffset -
          t * 2.0,
      ) * (8 + t * 25) * waveMult;

    const baseLen = length * tentacle.lengthMult;
    const px = ox + Math.cos(tentacle.angle) * t * baseLen + wave * Math.cos(tentacle.angle + Math.PI / 2);
    const py = oy + Math.sin(tentacle.angle) * t * baseLen + wave * Math.sin(tentacle.angle + Math.PI / 2);
    points.push([px, py]);
  }

  let pathD = `M ${points[0][0]} ${points[0][1]}`;
  for (let p = 1; p < points.length; p++) {
    const prev = points[p - 1];
    const curr = points[p];
    const mx = (prev[0] + curr[0]) / 2;
    const my = (prev[1] + curr[1]) / 2;
    pathD += ` Q ${prev[0]} ${prev[1]}, ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  pathD += ` L ${last[0]} ${last[1]}`;

  return { path: pathD, tipX: last[0], tipY: last[1] };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Anemone: React.FC<Props> = ({ frames }) => {
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

  const anemones = React.useMemo(() => generateAnemones(5050), []);
  const allTentacles = React.useMemo(() => {
    return anemones.map((a, i) => generateTentacles(a, 5050 + i * 200));
  }, [anemones]);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.7;

  const waveMult = interpolate(energy, [0.02, 0.25], [0.5, 2.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="anemone-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {anemones.map((anem, ai) => {
          const palette = ANEMONE_PALETTES[anem.paletteIdx];
          const ax = anem.x * width;
          const ay = anem.y * height;
          const tentacles = allTentacles[ai];

          return (
            <g key={`anem-${ai}`} filter="url(#anemone-glow)">
              {/* Base (fleshy mound) */}
              <ellipse
                cx={ax}
                cy={ay}
                rx={anem.baseRadius * 1.3}
                ry={anem.baseRadius * 0.6}
                fill={palette.base}
                opacity={0.5}
              />
              <ellipse
                cx={ax}
                cy={ay - anem.baseRadius * 0.2}
                rx={anem.baseRadius}
                ry={anem.baseRadius * 0.4}
                fill={palette.tentacle}
                opacity={0.3}
              />

              {/* Tentacles */}
              {tentacles.map((tent, ti) => {
                const { path, tipX, tipY } = buildTentaclePath(
                  ax,
                  ay - anem.baseRadius * 0.3,
                  tent,
                  anem.tentacleLength,
                  frame,
                  anem.waveSpeedBase,
                  waveMult,
                );

                return (
                  <g key={`tent-${ti}`}>
                    <path
                      d={path}
                      fill="none"
                      stroke={palette.tentacle}
                      strokeWidth={tent.thickness}
                      strokeLinecap="round"
                      opacity={0.5}
                    />
                    {/* Rounded tip */}
                    <circle
                      cx={tipX}
                      cy={tipY}
                      r={tent.thickness * 0.8 + energy * 1.5}
                      fill={palette.tip}
                      opacity={0.6 + Math.sin(frame * 0.06 + ti * 0.4) * 0.15}
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
