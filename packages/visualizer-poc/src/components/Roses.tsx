/**
 * Roses — Skeleton & Roses / American Beauty style overlay.
 * SVG rose(s) with layered petals that bloom with energy.
 * Thorned vine grows along bottom edge with song progress.
 * Deep red primary, chroma-shifted accents, bass-driven petal sway.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";

/** Map 0-1 hue to an RGB hex string */
function hueToHex(h: number, s = 0.85, l = 0.5): string {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) { r = c; g = x; }
  else if (sector === 1) { r = x; g = c; }
  else if (sector === 2) { g = c; b = x; }
  else if (sector === 3) { g = x; b = c; }
  else if (sector === 4) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Single rose SVG with layered petals */
const Rose: React.FC<{
  size: number;
  bloom: number; // 0=bud, 1=full bloom
  sway: number;  // bass-driven sway offset in degrees
  primaryColor: string;
  accentColor: string;
}> = ({ size, bloom, sway, primaryColor, accentColor }) => {
  const petalLayers = 7;
  const cx = 50;
  const cy = 50;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <g transform={`rotate(${sway}, ${cx}, ${cy})`}>
        {/* Petal layers — inner to outer */}
        {Array.from({ length: petalLayers }, (_, i) => {
          const layerProgress = i / (petalLayers - 1); // 0 (inner) to 1 (outer)
          // Outer petals open more with bloom, inner stays tighter
          const openAmount = interpolate(bloom, [0, 1], [0.1, 0.3 + layerProgress * 0.7], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const radius = 5 + layerProgress * 22 * openAmount;
          const petalCount = 5 + Math.floor(i * 0.5);
          const opacity = interpolate(layerProgress, [0, 1], [0.9, 0.5]);
          // Mix primary toward accent for outer petals
          const layerColor = i < 4 ? primaryColor : accentColor;

          return Array.from({ length: petalCount }, (_, j) => {
            const angle = (j / petalCount) * Math.PI * 2 + i * 0.3;
            const px = cx + Math.cos(angle) * radius;
            const py = cy + Math.sin(angle) * radius;
            const petalSize = 6 + layerProgress * 8 * openAmount;

            return (
              <ellipse
                key={`${i}-${j}`}
                cx={px}
                cy={py}
                rx={petalSize * 0.7}
                ry={petalSize}
                fill={layerColor}
                opacity={opacity}
                transform={`rotate(${(angle * 180) / Math.PI + 90}, ${px}, ${py})`}
              />
            );
          });
        })}
        {/* Center pistil */}
        <circle cx={cx} cy={cy} r={3 + bloom * 2} fill="#FFD700" opacity={0.8} />
        <circle cx={cx} cy={cy} r={1.5} fill="#8B4513" opacity={0.6} />
      </g>
    </svg>
  );
};

/** Thorned vine SVG along the bottom */
const ThornedVine: React.FC<{
  width: number;
  height: number;
  progress: number; // 0-1 how far vine has grown
  color: string;
}> = ({ width, height, progress }) => {
  const vineY = height - 30;
  const vineLength = width * progress;
  const segments = Math.floor(progress * 20);

  // Build a wavy vine path
  let path = `M 0 ${vineY}`;
  for (let i = 1; i <= segments; i++) {
    const x = (i / 20) * width;
    const waveY = vineY + Math.sin(i * 0.8) * 8;
    path += ` Q ${x - (width / 40)} ${waveY - 10}, ${x} ${waveY}`;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
      fill="none"
    >
      {/* Main vine */}
      <path d={path} stroke="#2D5016" strokeWidth={3} fill="none" opacity={0.7} />
      {/* Secondary thinner vine */}
      <path d={path} stroke="#3A6B1E" strokeWidth={1.5} fill="none" opacity={0.4}
        transform="translate(0, -3)" />

      {/* Thorns along the vine */}
      {Array.from({ length: segments }, (_, i) => {
        const x = ((i + 0.5) / 20) * width;
        if (x > vineLength) return null;
        const baseY = vineY + Math.sin((i + 0.5) * 0.8) * 8;
        const side = i % 2 === 0 ? -1 : 1;
        return (
          <line
            key={`thorn-${i}`}
            x1={x}
            y1={baseY}
            x2={x + 4 * side}
            y2={baseY - 8}
            stroke="#2D5016"
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={0.6}
          />
        );
      })}

      {/* Small leaves */}
      {Array.from({ length: Math.floor(segments / 3) }, (_, i) => {
        const leafIdx = i * 3 + 1;
        const x = ((leafIdx + 0.5) / 20) * width;
        if (x > vineLength) return null;
        const baseY = vineY + Math.sin((leafIdx + 0.5) * 0.8) * 8;
        const side = i % 2 === 0 ? -1 : 1;
        return (
          <ellipse
            key={`leaf-${i}`}
            cx={x + 8 * side}
            cy={baseY - 4}
            rx={6}
            ry={3}
            fill="#2D5016"
            opacity={0.5}
            transform={`rotate(${side * 30}, ${x + 8 * side}, ${baseY - 4})`}
          />
        );
      })}
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const Roses: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const snap = useAudioSnapshot(frames);

  const energy = snap.energy;
  const bass = snap.bass;
  const chromaHue = snap.chromaHue / 360;

  // Song progress for vine growth
  const songProgress = Math.min(frame / Math.max(durationInFrames - 1, 1), 1);

  // Bloom: energy drives how open the roses are (0=tight bud, 1=full bloom)
  const bloom = interpolate(energy, [0.02, 0.35], [0.15, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bass-driven petal sway
  const sway = Math.sin(frame * 0.03) * (3 + bass * 12);

  // Opacity: 0.4-0.8 based on energy
  const opacity = interpolate(energy, [0.02, 0.30], [0.4, 0.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Colors: deep red primary, chroma-shifted accent
  const primaryColor = hueToHex(0.0, 0.9, 0.35); // deep crimson red
  const accentHue = 0.95 + chromaHue * 0.08; // subtle chroma shift around red
  const accentColor = hueToHex(accentHue, 0.8, 0.45);

  // Rose sizes scaled to resolution
  const resScale = height / 1080;
  const mainRoseSize = Math.round(220 * resScale);
  const sideRoseSize = Math.round(140 * resScale);

  // Glow from energy
  const glowRadius = interpolate(energy, [0.05, 0.30], [5, 25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Thorned vine along bottom */}
      <ThornedVine
        width={width}
        height={height}
        progress={songProgress}
        color="#2D5016"
      />

      {/* Main center rose */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${1 + snap.onsetEnvelope * 0.04})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${primaryColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <Rose
          size={mainRoseSize}
          bloom={bloom}
          sway={sway}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      </div>

      {/* Left rose — slightly behind in bloom (0.7x energy) */}
      <div
        style={{
          position: "absolute",
          left: "18%",
          top: "58%",
          transform: `translate(-50%, -50%) rotate(-15deg)`,
          opacity: opacity * 0.7,
          filter: `drop-shadow(0 0 ${glowRadius * 0.6}px ${primaryColor})`,
          willChange: "opacity",
        }}
      >
        <Rose
          size={sideRoseSize}
          bloom={bloom * 0.7}
          sway={sway * 0.6}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      </div>

      {/* Right rose — different bloom phase */}
      <div
        style={{
          position: "absolute",
          left: "82%",
          top: "62%",
          transform: `translate(-50%, -50%) rotate(12deg)`,
          opacity: opacity * 0.6,
          filter: `drop-shadow(0 0 ${glowRadius * 0.5}px ${primaryColor})`,
          willChange: "opacity",
        }}
      >
        <Rose
          size={sideRoseSize}
          bloom={bloom * 0.85}
          sway={sway * -0.8}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      </div>
    </div>
  );
};
