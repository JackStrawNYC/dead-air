/**
 * RippleLotus -- Lotus flowers floating on water with ripple rings.
 * 3-4 lotus flowers with layered petal shapes (3 rows of petals, each larger).
 * Positioned in lower third. Concentric ripple rings expand from each flower.
 * Water surface effect via horizontal wavy lines.
 * Soft pink/white lotus, blue/cyan water.
 * Energy drives ripple speed and flower petal breathing.
 * Appears every 50s for 15s. Serene and beautiful.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface LotusData {
  /** X position 0-1 */
  x: number;
  /** Y position in lower third: 0.65-0.85 */
  y: number;
  /** Size multiplier */
  scale: number;
  /** Number of petals per row */
  petalsPerRow: number;
  /** Base rotation */
  baseAngle: number;
  /** Sway phase */
  swayPhase: number;
  /** Color variant */
  colorIdx: number;
  /** Ripple phase offset */
  ripplePhase: number;
  /** Number of ripple rings */
  rippleCount: number;
}

interface WaveLineData {
  y: number;
  amplitude: number;
  frequency: number;
  phase: number;
  alpha: number;
}

const LOTUS_COLORS = [
  { outer: "#FFB6C1", mid: "#FF69B4", inner: "#FFFFFF", center: "#FFD700" },
  { outer: "#FFC0CB", mid: "#FF85B3", inner: "#FFF0F5", center: "#FFA500" },
  { outer: "#E8A0E8", mid: "#DA70D6", inner: "#F8E8F8", center: "#FFD700" },
  { outer: "#F5DEB3", mid: "#FFE4E1", inner: "#FFFAFA", center: "#DAA520" },
];

const NUM_LOTUS = 4;
const NUM_WAVE_LINES = 8;
const CYCLE = 1500; // 50 seconds at 30fps
const DURATION = 450; // 15 seconds at 30fps

function generateLotus(seed: number): LotusData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_LOTUS }, (_, i) => ({
    x: 0.15 + (i / (NUM_LOTUS - 1)) * 0.7 + (rng() - 0.5) * 0.08,
    y: 0.68 + rng() * 0.14,
    scale: 0.7 + rng() * 0.5,
    petalsPerRow: 6 + Math.floor(rng() * 3), // 6-8
    baseAngle: rng() * Math.PI * 2,
    swayPhase: rng() * Math.PI * 2,
    colorIdx: Math.floor(rng() * LOTUS_COLORS.length),
    ripplePhase: rng() * Math.PI * 2,
    rippleCount: 2 + Math.floor(rng() * 2), // 2-3
  }));
}

function generateWaveLines(seed: number): WaveLineData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_WAVE_LINES }, (_, i) => ({
    y: 0.62 + (i / NUM_WAVE_LINES) * 0.35,
    amplitude: 2 + rng() * 4,
    frequency: 0.008 + rng() * 0.006,
    phase: rng() * Math.PI * 2,
    alpha: 0.08 + rng() * 0.12,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const RippleLotus: React.FC<Props> = ({ frames }) => {
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

  const lotusFlowers = React.useMemo(() => generateLotus(77_05_08), []);
  const waveLines = React.useMemo(() => generateWaveLines(508_77), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const masterOpacity = interpolate(progress, [0, 0.08, 0.88, 1], [0, 0.75, 0.75, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (masterOpacity < 0.01) return null;

  // Energy drives ripple speed and petal breathing
  const rippleSpeed = interpolate(energy, [0.03, 0.25], [0.5, 2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const breatheAmp = interpolate(energy, [0.03, 0.3], [0.02, 0.1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bloom in effect
  const bloomIn = interpolate(progress, [0, 0.15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {/* Water surface: horizontal wavy lines */}
        {waveLines.map((wave, wi) => {
          const wy = wave.y * height;
          const points: string[] = [];
          const numPoints = 80;
          for (let p = 0; p <= numPoints; p++) {
            const px = (p / numPoints) * width;
            const py = wy + Math.sin(px * wave.frequency + frame * 0.02 + wave.phase) * wave.amplitude
                      + Math.sin(px * wave.frequency * 1.5 + frame * 0.015 + wave.phase * 2) * wave.amplitude * 0.5;
            points.push(`${px},${py}`);
          }

          return (
            <polyline
              key={`wave-${wi}`}
              points={points.join(" ")}
              fill="none"
              stroke={`hsla(195, 80%, 65%, ${wave.alpha})`}
              strokeWidth={1}
              style={{ filter: "blur(0.5px)" }}
            />
          );
        })}

        {/* Ripple rings and lotus flowers */}
        {lotusFlowers.map((lotus, li) => {
          const lx = lotus.x * width;
          const ly = lotus.y * height;
          const s = lotus.scale * bloomIn;

          // Gentle sway
          const sway = Math.sin(frame * 0.02 + lotus.swayPhase) * 4;
          const centerX = lx + sway;
          const centerY = ly;

          const colors = LOTUS_COLORS[lotus.colorIdx];

          // Ripple rings expanding outward
          const rippleElements: React.ReactNode[] = [];
          for (let ri = 0; ri < lotus.rippleCount; ri++) {
            const rippleCycle = 120; // 4 seconds per ripple expansion
            const rippleT = ((frame * rippleSpeed + lotus.ripplePhase * 30 + ri * 40) % rippleCycle) / rippleCycle;
            const rippleR = 20 + rippleT * 120 * s;
            const rippleAlpha = interpolate(rippleT, [0, 0.1, 0.8, 1], [0, 0.3, 0.15, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            rippleElements.push(
              <ellipse
                key={`ripple-${li}-${ri}`}
                cx={centerX}
                cy={centerY + 5}
                rx={rippleR}
                ry={rippleR * 0.3}
                fill="none"
                stroke={`hsla(190, 80%, 70%, ${rippleAlpha})`}
                strokeWidth={1.2}
                style={{ filter: `drop-shadow(0 0 3px hsla(190, 100%, 75%, ${rippleAlpha * 0.5}))` }}
              />,
            );
          }

          // Petal breathing
          const breathe = 1 + Math.sin(frame * 0.035 + li * 1.7) * breatheAmp;

          // Three rows of petals (outer, mid, inner)
          const petalRows = [
            { row: 0, count: lotus.petalsPerRow, length: 28, width: 12, color: colors.outer, opacity: 0.5, offset: 0 },
            { row: 1, count: lotus.petalsPerRow, length: 22, width: 10, color: colors.mid, opacity: 0.65, offset: Math.PI / lotus.petalsPerRow },
            { row: 2, count: Math.max(4, lotus.petalsPerRow - 2), length: 15, width: 8, color: colors.inner, opacity: 0.8, offset: Math.PI / (lotus.petalsPerRow * 2) },
          ];

          return (
            <g key={`lotus-${li}`}>
              {/* Ripples (behind flower) */}
              {rippleElements}

              {/* Water reflection (subtle) */}
              <ellipse
                cx={centerX}
                cy={centerY + 8 * s}
                rx={35 * s}
                ry={6 * s}
                fill={`hsla(190, 60%, 60%, 0.15)`}
                style={{ filter: "blur(3px)" }}
              />

              {/* Lotus flower */}
              <g
                style={{ filter: `drop-shadow(0 0 6px ${colors.mid}) drop-shadow(0 0 12px ${colors.outer})` }}
              >
                {/* Petals: 3 rows */}
                {petalRows.map((row) => (
                  <g key={`row-${row.row}`}>
                    {Array.from({ length: row.count }, (_, pi) => {
                      const angle = lotus.baseAngle + row.offset + (pi / row.count) * Math.PI * 2;
                      // Upper half only (lotus petals point upward)
                      const petalAngle = angle * 0.5 - Math.PI * 0.25 + (pi / row.count) * Math.PI;
                      const px = centerX + Math.cos(petalAngle) * row.length * 0.4 * s * breathe;
                      const py = centerY - Math.abs(Math.sin(petalAngle)) * row.length * 0.3 * s * breathe;

                      return (
                        <ellipse
                          key={`petal-${row.row}-${pi}`}
                          cx={px}
                          cy={py}
                          rx={row.width * 0.5 * s * breathe}
                          ry={row.length * 0.5 * s * breathe}
                          fill={row.color}
                          opacity={row.opacity}
                          transform={`rotate(${petalAngle * (180 / Math.PI) - 90}, ${px}, ${py})`}
                        />
                      );
                    })}
                  </g>
                ))}

                {/* Center: golden */}
                <circle
                  cx={centerX}
                  cy={centerY - 2 * s}
                  r={6 * s * breathe}
                  fill={colors.center}
                  opacity={0.7}
                />
                {/* Inner dots */}
                {Array.from({ length: 5 }, (_, di) => {
                  const da = (di / 5) * Math.PI * 2 + frame * 0.01;
                  return (
                    <circle
                      key={`dot-${di}`}
                      cx={centerX + Math.cos(da) * 3 * s}
                      cy={centerY - 2 * s + Math.sin(da) * 3 * s}
                      r={1.5 * s}
                      fill={colors.center}
                      opacity={0.5}
                    />
                  );
                })}
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
