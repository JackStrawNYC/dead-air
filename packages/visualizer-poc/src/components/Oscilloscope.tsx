/**
 * Oscilloscope — Classic green phosphor CRT oscilloscope waveform trace.
 * SVG polyline across the screen horizontally, Y values driven by spectral contrast.
 * Green (#00FF41) phosphor with heavy CRT glow and scanline overlay.
 * Waveform amplitude scales with rolling energy.
 * Always visible at 20-40% opacity, positioned in the lower third.
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

const PHOSPHOR_GREEN = "#00FF41";
const PHOSPHOR_DIM = "#00CC33";
const NUM_SCANLINES = 60;

interface Props {
  frames: EnhancedFrameData[];
}

export const Oscilloscope: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy window: idx-75 to idx+75
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const fd = frames[idx];

  // Position in lower third of screen
  const scopeTop = height * 0.65;
  const scopeHeight = height * 0.25;
  const scopeCenterY = scopeTop + scopeHeight / 2;

  // Opacity: always visible 20-40%, driven by energy
  const opacity = interpolate(energy, [0.02, 0.25], [0.2, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Amplitude scales with energy
  const amplitude = interpolate(energy, [0.02, 0.35], [0.3, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Build waveform points from the 7-band contrast array
  // Each contrast band maps to a segment of the horizontal line, with interpolation between
  const contrast = fd.contrast;
  const numPoints = 200;
  const points: string[] = [];

  const rng = seeded(frame * 7 + 1977);

  for (let p = 0; p < numPoints; p++) {
    const t = p / (numPoints - 1); // 0 to 1 across width
    const x = t * width;

    // Map t to the 7 contrast bands with smooth interpolation
    const bandPos = t * (contrast.length - 1);
    const bandIdx = Math.floor(bandPos);
    const bandFrac = bandPos - bandIdx;
    const bandA = contrast[Math.min(bandIdx, contrast.length - 1)];
    const bandB = contrast[Math.min(bandIdx + 1, contrast.length - 1)];
    const bandVal = bandA + (bandB - bandA) * bandFrac;

    // Add high-frequency noise modulated by RMS for organic feel
    const noiseFreq1 = Math.sin(t * 40 + frame * 0.3) * fd.rms * 0.4;
    const noiseFreq2 = Math.sin(t * 80 + frame * 0.7) * fd.high * 0.2;
    const noiseFreq3 = Math.sin(t * 15 + frame * 0.15) * fd.sub * 0.3;
    const jitter = (rng() - 0.5) * 0.03 * fd.rms;

    const displacement = (bandVal * 0.6 + noiseFreq1 + noiseFreq2 + noiseFreq3 + jitter) * amplitude;
    const y = scopeCenterY - displacement * scopeHeight * 0.45;

    points.push(`${x},${y}`);
  }

  const polylinePoints = points.join(" ");

  // Glow intensity driven by energy
  const glowSize = interpolate(energy, [0.03, 0.3], [4, 15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // CRT scanlines: thin repeating horizontal lines
  const scanlines = React.useMemo(() => {
    const lines: Array<{ y: number }> = [];
    for (let i = 0; i < NUM_SCANLINES; i++) {
      lines.push({ y: scopeTop + (i / NUM_SCANLINES) * scopeHeight });
    }
    return lines;
  }, [scopeTop, scopeHeight]);

  // Phosphor decay trail: slightly delayed duplicate with lower opacity
  const trailPoints: string[] = [];
  if (idx > 0) {
    const prevFd = frames[Math.max(0, idx - 2)];
    const prevContrast = prevFd.contrast;
    const trailRng = seeded((frame - 2) * 7 + 1977);

    for (let p = 0; p < numPoints; p++) {
      const t = p / (numPoints - 1);
      const x = t * width;

      const bandPos = t * (prevContrast.length - 1);
      const bandIdx2 = Math.floor(bandPos);
      const bandFrac2 = bandPos - bandIdx2;
      const bA = prevContrast[Math.min(bandIdx2, prevContrast.length - 1)];
      const bB = prevContrast[Math.min(bandIdx2 + 1, prevContrast.length - 1)];
      const bVal = bA + (bB - bA) * bandFrac2;

      const nf1 = Math.sin(t * 40 + (frame - 2) * 0.3) * prevFd.rms * 0.4;
      const nf2 = Math.sin(t * 80 + (frame - 2) * 0.7) * prevFd.high * 0.2;
      const nf3 = Math.sin(t * 15 + (frame - 2) * 0.15) * prevFd.sub * 0.3;
      const jit = (trailRng() - 0.5) * 0.03 * prevFd.rms;

      const disp = (bVal * 0.6 + nf1 + nf2 + nf3 + jit) * amplitude;
      const y = scopeCenterY - disp * scopeHeight * 0.45;

      trailPoints.push(`${x},${y}`);
    }
  }

  const trailPolyline = trailPoints.length > 0 ? trailPoints.join(" ") : polylinePoints;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${PHOSPHOR_GREEN}) drop-shadow(0 0 ${glowSize * 2}px ${PHOSPHOR_GREEN})`,
        }}
      >
        {/* CRT scanline overlay */}
        {scanlines.map((sl, i) => (
          <line
            key={`sl-${i}`}
            x1={0}
            y1={sl.y}
            x2={width}
            y2={sl.y}
            stroke="rgba(0,0,0,0.15)"
            strokeWidth={1}
          />
        ))}

        {/* Phosphor decay trail */}
        <polyline
          points={trailPolyline}
          fill="none"
          stroke={PHOSPHOR_DIM}
          strokeWidth={1.5}
          opacity={0.3}
        />

        {/* Main waveform trace */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={PHOSPHOR_GREEN}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Bright center dot scanning across */}
        {(() => {
          const scanX = ((frame * 3) % width);
          const scanT = scanX / width;
          const bandPos = scanT * (contrast.length - 1);
          const bIdx = Math.floor(bandPos);
          const bFrac = bandPos - bIdx;
          const bA = contrast[Math.min(bIdx, contrast.length - 1)];
          const bB = contrast[Math.min(bIdx + 1, contrast.length - 1)];
          const bVal = bA + (bB - bA) * bFrac;
          const nf = Math.sin(scanT * 40 + frame * 0.3) * fd.rms * 0.4;
          const disp = (bVal * 0.6 + nf) * amplitude;
          const scanY = scopeCenterY - disp * scopeHeight * 0.45;

          return (
            <circle
              cx={scanX}
              cy={scanY}
              r={3 + energy * 4}
              fill={PHOSPHOR_GREEN}
              opacity={0.8}
            />
          );
        })()}

        {/* Horizontal reference line (faint) */}
        <line
          x1={0}
          y1={scopeCenterY}
          x2={width}
          y2={scopeCenterY}
          stroke={PHOSPHOR_GREEN}
          strokeWidth={0.5}
          opacity={0.12}
          strokeDasharray="6,8"
        />
      </svg>
    </div>
  );
};
