/**
 * OceanWaves — 4-6 layered sine wave lines scrolling horizontally across screen
 * at different speeds. Deep blue/teal/cyan palette with foam-white crests.
 * Wave amplitude driven by low-frequency energy (frames[idx].low). Higher
 * energy = taller, faster waves. Always visible at low opacity (0.1-0.3).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
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

interface WaveLayerData {
  /** Primary sine frequency */
  freq1: number;
  /** Secondary sine frequency (harmonic detail) */
  freq2: number;
  /** Primary amplitude (px) */
  amp1: number;
  /** Secondary amplitude (px) */
  amp2: number;
  /** Scroll speed (px per frame) */
  scrollSpeed: number;
  /** Vertical position (0-1, fraction of height) */
  yPosition: number;
  /** Stroke color */
  color: string;
  /** Fill color for area below wave */
  fillColor: string;
  /** Stroke width */
  strokeWidth: number;
  /** Phase offset */
  phase: number;
}

const NUM_WAVES = 6;

function generateWaves(seed: number): WaveLayerData[] {
  const rng = seeded(seed);
  const colors = [
    { stroke: "#00CED1", fill: "rgba(0, 206, 209, 0.08)" },    // dark turquoise
    { stroke: "#20B2AA", fill: "rgba(32, 178, 170, 0.07)" },    // light sea green
    { stroke: "#1E90FF", fill: "rgba(30, 144, 255, 0.06)" },    // dodger blue
    { stroke: "#4169E1", fill: "rgba(65, 105, 225, 0.06)" },    // royal blue
    { stroke: "#00BFFF", fill: "rgba(0, 191, 255, 0.07)" },     // deep sky blue
    { stroke: "#008B8B", fill: "rgba(0, 139, 139, 0.05)" },     // dark cyan
  ];

  return Array.from({ length: NUM_WAVES }, (_, i) => {
    const t = i / (NUM_WAVES - 1); // 0 = front, 1 = back
    return {
      freq1: 0.003 + rng() * 0.004,
      freq2: 0.008 + rng() * 0.006,
      amp1: 12 + t * 8 + rng() * 10,
      amp2: 3 + rng() * 5,
      scrollSpeed: (0.5 + rng() * 1.5) * (1 - t * 0.4),
      yPosition: 0.72 + t * 0.06,
      color: colors[i].stroke,
      fillColor: colors[i].fill,
      strokeWidth: 2.5 - t * 0.8,
      phase: rng() * Math.PI * 2,
    };
  });
}

function buildWavePaths(
  layer: WaveLayerData,
  width: number,
  height: number,
  frame: number,
  amplitudeScale: number,
  speedScale: number,
): { linePath: string; fillPath: string; peakPositions: [number, number][] } {
  const steps = 100;
  const points: [number, number][] = [];
  const peakPositions: [number, number][] = [];
  const baseY = layer.yPosition * height;
  const scroll = frame * layer.scrollSpeed * speedScale;

  for (let s = 0; s <= steps; s++) {
    const x = (s / steps) * width;
    const xOffset = x + scroll;
    const y1 = Math.sin(xOffset * layer.freq1 + layer.phase) * layer.amp1 * amplitudeScale;
    const y2 = Math.sin(xOffset * layer.freq2 + layer.phase * 1.7) * layer.amp2 * amplitudeScale;
    const y = baseY - y1 - y2;
    points.push([x, y]);

    // Detect local peaks (crests) for foam
    if (s > 0 && s < steps) {
      const xPrev = ((s - 1) / steps) * width + scroll;
      const xNext = ((s + 1) / steps) * width + scroll;
      const yPrev = baseY
        - Math.sin(xPrev * layer.freq1 + layer.phase) * layer.amp1 * amplitudeScale
        - Math.sin(xPrev * layer.freq2 + layer.phase * 1.7) * layer.amp2 * amplitudeScale;
      const yNext = baseY
        - Math.sin(xNext * layer.freq1 + layer.phase) * layer.amp1 * amplitudeScale
        - Math.sin(xNext * layer.freq2 + layer.phase * 1.7) * layer.amp2 * amplitudeScale;
      if (y < yPrev && y < yNext) {
        peakPositions.push([x, y]);
      }
    }
  }

  const linePath = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(" ");
  const fillPath = linePath + ` L ${width} ${height + 20} L 0 ${height + 20} Z`;

  return { linePath, fillPath, peakPositions };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const OceanWaves: React.FC<Props> = ({ frames }) => {
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

  const waves = React.useMemo(() => generateWaves(1234), []);
  const foamRng = React.useMemo(() => {
    const rng = seeded(5678);
    return Array.from({ length: 40 }, () => ({
      rx: 2 + rng() * 5,
      ry: 1 + rng() * 1.5,
      offsetX: (rng() - 0.5) * 6,
      offsetY: rng() * 2,
    }));
  }, []);

  // Always visible: opacity 0.1-0.3 based on energy
  const opacity = interpolate(energy, [0.03, 0.2, 0.35], [0.10, 0.20, 0.30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Low-frequency energy drives wave amplitude
  const lowEnergy = frames[idx].low;
  const amplitudeScale = interpolate(lowEnergy, [0.05, 0.4], [0.5, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Higher energy = faster waves
  const speedScale = interpolate(energy, [0.05, 0.35], [0.7, 1.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Show foam crests when energy is higher
  const showFoam = energy > 0.15;
  const foamOpacity = showFoam
    ? interpolate(energy, [0.15, 0.3], [0, 0.55], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="wave-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Render back to front (last wave in array = back, first = front) */}
        {[...waves].reverse().map((layer, layerIdx) => {
          const { linePath, fillPath, peakPositions } = buildWavePaths(
            layer, width, height, frame, amplitudeScale, speedScale,
          );

          return (
            <g key={layerIdx}>
              {/* Fill below wave */}
              <path d={fillPath} fill={layer.fillColor} />
              {/* Wave line */}
              <path
                d={linePath}
                fill="none"
                stroke={layer.color}
                strokeWidth={layer.strokeWidth}
                strokeLinecap="round"
                opacity={0.7}
                filter="url(#wave-glow)"
              />
              {/* Foam crests on front waves */}
              {showFoam && layerIdx >= waves.length - 2 && peakPositions.map((peak, pi) => {
                const foam = foamRng[pi % foamRng.length];
                return (
                  <ellipse
                    key={`foam-${pi}`}
                    cx={peak[0] + foam.offsetX}
                    cy={peak[1] - foam.offsetY}
                    rx={foam.rx * (1 + lowEnergy)}
                    ry={foam.ry}
                    fill="#FFFFFF"
                    opacity={foamOpacity * 0.5}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Subtle deep water gradient at bottom */}
        <rect
          x={0}
          y={height * 0.85}
          width={width}
          height={height * 0.15}
          fill="rgba(0, 20, 60, 0.06)"
        />
      </svg>
    </div>
  );
};
