/**
 * RoseGarden — American Beauty-style roses blooming from center.
 * Petals pulse with beatDecay, vine tendrils grow with slowEnergy.
 * Hue-rotate driven by chromaHue for harmonic color breathing.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

interface Props {
  frames: EnhancedFrameData[];
}

/** Generate a rose petal path centered at origin */
function petalPath(angle: number, radius: number, petalWidth: number): string {
  const cx1 = Math.cos(angle - petalWidth) * radius * 0.6;
  const cy1 = Math.sin(angle - petalWidth) * radius * 0.6;
  const ex = Math.cos(angle) * radius;
  const ey = Math.sin(angle) * radius;
  const cx2 = Math.cos(angle + petalWidth) * radius * 0.6;
  const cy2 = Math.sin(angle + petalWidth) * radius * 0.6;
  return `M 0 0 Q ${cx1} ${cy1} ${ex} ${ey} Q ${cx2} ${cy2} 0 0`;
}

/** Generate a vine tendril path */
function vinePath(startX: number, startY: number, length: number, curve: number, seed: number): string {
  const points: string[] = [`M ${startX} ${startY}`];
  let x = startX;
  let y = startY;
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    x += (Math.sin(seed + t * 4) * curve + (Math.cos(seed * 2) > 0 ? 1 : -1) * 2) * (length / steps);
    y -= length / steps;
    points.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return points.join(" ");
}

export const RoseGarden: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue;
  const slowEnergy = snap.slowEnergy;

  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(width, height) * 0.12;

  // Bloom effect: petals expand with energy
  const bloomScale = 0.8 + energy * 0.4 + beatDecay * 0.15;
  const petalRadius = baseRadius * bloomScale;

  // Opacity: gentle presence
  const opacity = 0.15 + energy * 0.25;

  // Rotation: slow organic drift
  const rotation = (frame / 30) * 2 * tempoFactor;

  // Hue from chroma
  const hueRotate = chromaHue;

  // Number of petal layers (3-5 based on energy)
  const petalLayers = 3 + Math.floor(energy * 2);

  // Vine growth: tendrils extend with slowEnergy
  const vineLength = 40 + slowEnergy * 120;
  const vineOpacity = 0.1 + slowEnergy * 0.2;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          filter: `hue-rotate(${hueRotate}deg) drop-shadow(0 0 ${8 + energy * 20}px rgba(200, 50, 80, ${0.3 + energy * 0.3}))`,
          opacity,
        }}
      >
        {/* Vine tendrils growing from center */}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const angle = (i / 6) * Math.PI * 2 + rotation * 0.01;
          const startX = centerX + Math.cos(angle) * petalRadius * 0.8;
          const startY = centerY + Math.sin(angle) * petalRadius * 0.8;
          return (
            <path
              key={`vine-${i}`}
              d={vinePath(startX, startY, vineLength, 8, i * 2.3)}
              stroke="rgba(60, 140, 60, 0.6)"
              strokeWidth={1.5 + slowEnergy}
              fill="none"
              opacity={vineOpacity}
            />
          );
        })}

        {/* Rose petals — layered rings */}
        <g transform={`translate(${centerX}, ${centerY}) rotate(${rotation})`}>
          {Array.from({ length: petalLayers }).map((_, layer) => {
            const layerRadius = petalRadius * (0.4 + layer * 0.2);
            const petalCount = 5 + layer * 2;
            const petalWidth = 0.3 - layer * 0.03;
            const layerRotation = layer * 15 + beatDecay * 3;
            const layerOpacity = 1 - layer * 0.15;

            return (
              <g key={`layer-${layer}`} transform={`rotate(${layerRotation})`} opacity={layerOpacity}>
                {Array.from({ length: petalCount }).map((_, p) => {
                  const angle = (p / petalCount) * Math.PI * 2;
                  const pulseRadius = layerRadius * (1 + beatDecay * 0.08);
                  return (
                    <path
                      key={`petal-${layer}-${p}`}
                      d={petalPath(angle, pulseRadius, petalWidth)}
                      fill={`hsla(${345 + layer * 8}, 70%, ${45 + layer * 5}%, 0.6)`}
                      stroke={`hsla(${340 + layer * 10}, 60%, 35%, 0.4)`}
                      strokeWidth={0.5}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Center bud */}
          <circle cx={0} cy={0} r={petalRadius * 0.15} fill="hsla(350, 80%, 40%, 0.8)" />
          <circle cx={0} cy={0} r={petalRadius * 0.08} fill="hsla(45, 90%, 60%, 0.6)" />
        </g>
      </svg>
    </div>
  );
};
