/**
 * HologramGlitch — Holographic projection effect with horizontal scan lines.
 * A ghostly blue-cyan translucent rectangle with a "hologram" of the Dead's
 * lightning bolt inside. Periodic glitch artifacts: horizontal offset slices,
 * color channel separation, static noise lines. Glitch intensity tied to
 * energy peaks. Cycle: 40s (1200 frames), 12s (360 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1200; // 40s at 30fps
const DURATION = 360; // 12s visible
const SCAN_LINE_COUNT = 60;

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const HologramGlitch: React.FC<Props> = ({ frames }) => {
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

  // Cycle gating
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
    easing: Easing.in(Easing.cubic),
  });

  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Hologram panel position and size
  const panelW = width * 0.28;
  const panelH = height * 0.45;
  const panelX = width * 0.62;
  const panelY = height * 0.28;

  // Glitch intensity from instantaneous energy
  const instantEnergy = frames[idx].rms;
  const glitchIntensity = interpolate(instantEnergy, [0.1, 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Per-frame deterministic RNG for glitch artifacts
  const rng = mulberry32(frame * 17 + 9999);

  // Scan line offset (rolling scan)
  const scanY = (frame * 2.5) % panelH;

  // Lightning bolt path (Dead's iconic bolt) centered in panel
  const boltCx = panelW / 2;
  const boltCy = panelH / 2;
  const boltScale = Math.min(panelW, panelH) * 0.003;
  const boltPath = `M ${boltCx - 15 * boltScale} ${boltCy - 50 * boltScale} L ${boltCx + 10 * boltScale} ${boltCy - 10 * boltScale} L ${boltCx - 5 * boltScale} ${boltCy - 10 * boltScale} L ${boltCx + 15 * boltScale} ${boltCy + 50 * boltScale} L ${boltCx - 10 * boltScale} ${boltCy + 10 * boltScale} L ${boltCx + 5 * boltScale} ${boltCy + 10 * boltScale} Z`;

  // Glitch slices: horizontal strips offset sideways
  const glitchSlices: { y: number; h: number; dx: number }[] = [];
  if (glitchIntensity > 0.2) {
    const numSlices = 2 + Math.floor(rng() * 4);
    for (let s = 0; s < numSlices; s++) {
      glitchSlices.push({
        y: rng() * panelH,
        h: 2 + rng() * 8,
        dx: (rng() - 0.5) * 20 * glitchIntensity,
      });
    }
  }

  // Color flicker
  const flicker = 0.85 + rng() * 0.15;

  // Color channel separation offset
  const channelSep = glitchIntensity * 4;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: opacity * flicker,
          filter: `drop-shadow(0 0 12px rgba(0, 200, 255, 0.4)) drop-shadow(0 0 30px rgba(0, 150, 255, 0.15))`,
          willChange: "opacity",
        }}
      >
        <defs>
          <clipPath id="holo-panel-clip">
            <rect x={panelX} y={panelY} width={panelW} height={panelH} />
          </clipPath>
          <linearGradient id="holo-bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(0, 180, 255, 0.06)" />
            <stop offset="50%" stopColor="rgba(0, 220, 255, 0.03)" />
            <stop offset="100%" stopColor="rgba(0, 180, 255, 0.06)" />
          </linearGradient>
        </defs>

        {/* Panel background */}
        <rect
          x={panelX}
          y={panelY}
          width={panelW}
          height={panelH}
          fill="url(#holo-bg)"
          stroke="rgba(0, 200, 255, 0.4)"
          strokeWidth={1.5}
          rx={3}
        />

        {/* Scan lines */}
        <g clipPath="url(#holo-panel-clip)">
          {Array.from({ length: SCAN_LINE_COUNT }, (_, i) => {
            const ly = panelY + (i / SCAN_LINE_COUNT) * panelH;
            return (
              <line
                key={`sl-${i}`}
                x1={panelX}
                y1={ly}
                x2={panelX + panelW}
                y2={ly}
                stroke="rgba(0, 200, 255, 0.08)"
                strokeWidth={0.5}
              />
            );
          })}

          {/* Bright rolling scan line */}
          <rect
            x={panelX}
            y={panelY + scanY}
            width={panelW}
            height={2}
            fill="rgba(0, 255, 255, 0.3)"
          />

          {/* Lightning bolt — main cyan channel */}
          <g transform={`translate(${panelX}, ${panelY})`}>
            <path
              d={boltPath}
              fill="rgba(0, 220, 255, 0.5)"
              stroke="rgba(0, 255, 255, 0.8)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </g>

          {/* Red channel offset (glitch) */}
          {channelSep > 0.5 && (
            <g transform={`translate(${panelX + channelSep}, ${panelY})`}>
              <path
                d={boltPath}
                fill="none"
                stroke={`rgba(255, 0, 80, ${0.3 * glitchIntensity})`}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            </g>
          )}

          {/* Blue channel offset (glitch) */}
          {channelSep > 0.5 && (
            <g transform={`translate(${panelX - channelSep}, ${panelY})`}>
              <path
                d={boltPath}
                fill="none"
                stroke={`rgba(80, 0, 255, ${0.3 * glitchIntensity})`}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            </g>
          )}

          {/* Glitch horizontal slices */}
          {glitchSlices.map((slice, i) => (
            <rect
              key={`glitch-${i}`}
              x={panelX + slice.dx}
              y={panelY + slice.y}
              width={panelW}
              height={slice.h}
              fill={`rgba(0, 200, 255, ${0.1 + rng() * 0.15})`}
            />
          ))}

          {/* Static noise lines during high glitch */}
          {glitchIntensity > 0.4 && Array.from({ length: 6 }, (_, i) => {
            const ny = panelY + rng() * panelH;
            return (
              <line
                key={`noise-${i}`}
                x1={panelX + rng() * panelW * 0.3}
                y1={ny}
                x2={panelX + panelW * 0.3 + rng() * panelW * 0.7}
                y2={ny}
                stroke={`rgba(255, 255, 255, ${0.2 + rng() * 0.3})`}
                strokeWidth={1}
              />
            );
          })}
        </g>

        {/* Corner brackets */}
        {[
          { x: panelX, y: panelY, sx: 1, sy: 1 },
          { x: panelX + panelW, y: panelY, sx: -1, sy: 1 },
          { x: panelX, y: panelY + panelH, sx: 1, sy: -1 },
          { x: panelX + panelW, y: panelY + panelH, sx: -1, sy: -1 },
        ].map((corner, ci) => (
          <g key={`corner-${ci}`} transform={`translate(${corner.x}, ${corner.y}) scale(${corner.sx}, ${corner.sy})`}>
            <path
              d="M 0 12 L 0 0 L 12 0"
              fill="none"
              stroke="rgba(0, 255, 255, 0.6)"
              strokeWidth={1.5}
            />
          </g>
        ))}
      </svg>
    </div>
  );
};
