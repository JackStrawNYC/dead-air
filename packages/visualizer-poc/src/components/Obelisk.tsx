/**
 * Obelisk — Egyptian obelisk silhouette centered on screen. Tall tapered
 * shaft with pyramidion (pointed cap). Hieroglyphic panels run down the
 * shaft in rows, each panel glowing based on spectral contrast data.
 * Golden/turquoise palette. Shadow and sand base.
 * Cycle: 70s on / off, 16s visible.
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

const CYCLE = 2100; // 70s at 30fps
const DURATION = 480; // 16s visible
const PANEL_ROWS = 8;
const PANEL_COLS = 2;

const STONE_DARK = "#3A3225";
const STONE_MED = "#5C4E3A";
const GOLD = "#FFD700";
const TURQUOISE = "#00BFA5";
const WARM_GLOW = "#FFE0B2";
const DEEP_BLUE = "#1A237E";

// Simple hieroglyphic SVG path fragments (abstract symbols)
const GLYPH_PATHS = [
  "M0,0 L4,0 L4,8 L0,8 Z M1,2 L3,2 L3,6 L1,6 Z", // rectangle with hole
  "M2,0 L4,4 L2,8 L0,4 Z", // diamond
  "M0,4 A4,4 0 1,1 8,4 A4,4 0 1,1 0,4 Z", // circle
  "M0,8 L2,0 L4,8 Z", // triangle
  "M0,0 L4,0 L4,3 L2,3 L2,8 L0,8 Z", // angle/flag
  "M0,4 L2,0 L4,4 L2,8 Z M2,2 L3,4 L2,6 L1,4 Z", // nested diamond
  "M1,0 L3,0 L3,8 L1,8 Z", // pillar
  "M0,0 C2,3 2,5 0,8 L4,8 C2,5 2,3 4,0 Z", // wavy
  "M0,0 L4,4 M4,0 L0,4 M0,6 L4,6", // cross + line
  "M2,0 L4,2 L4,6 L2,8 L0,6 L0,2 Z", // hexagon
  "M0,0 L4,0 L2,4 L4,8 L0,8 L2,4 Z", // hourglass
  "M1,0 C0,4 4,4 3,8 M0,4 L4,4", // snake + cross
];

interface Props {
  frames: EnhancedFrameData[];
}

export const Obelisk: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Pre-generate which glyph goes where
  const glyphMap = React.useMemo(() => {
    const rng = seeded(77_402_913);
    return Array.from({ length: PANEL_ROWS * PANEL_COLS }, () =>
      Math.floor(rng() * GLYPH_PATHS.length),
    );
  }, []);

  // Pre-generate glyph color assignment (gold or turquoise)
  const glyphColors = React.useMemo(() => {
    const rng = seeded(33_901_288);
    return Array.from({ length: PANEL_ROWS * PANEL_COLS }, () =>
      rng() > 0.55 ? TURQUOISE : GOLD,
    );
  }, []);

  // Rolling energy (151-frame window)
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
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.02, 0.25], [0.2, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;
  if (masterOpacity < 0.01) return null;

  // Obelisk geometry
  const cx = width * 0.5;
  const baseY = height * 0.88;
  const topY = height * 0.12;
  const baseHalfW = 40;
  const topHalfW = 22;
  const pyramidionH = 50;
  const shaftTopY = topY + pyramidionH;

  // Spectral contrast for glyph glow (7 bands)
  const contrast = frames[idx].contrast;

  const glowSize = interpolate(energy, [0.02, 0.3], [2, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Panel dimensions
  const shaftH = baseY - shaftTopY;
  const panelH = shaftH / PANEL_ROWS;
  const panelW = (topHalfW + baseHalfW) * 0.35; // narrow column inside shaft

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          willChange: "opacity",
        }}
      >
        <defs>
          <linearGradient id="obelisk-shaft" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={STONE_DARK} />
            <stop offset="50%" stopColor={STONE_MED} />
            <stop offset="100%" stopColor={STONE_DARK} />
          </linearGradient>
          <radialGradient id="obelisk-apex-glow">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.6} />
            <stop offset="60%" stopColor={GOLD} stopOpacity={0.1} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Shadow on ground */}
        <ellipse
          cx={cx + 30}
          cy={baseY + 8}
          rx={60}
          ry={10}
          fill="#0A0804"
          opacity={0.25}
        />

        {/* Obelisk shaft (tapered) */}
        <polygon
          points={`${cx - baseHalfW},${baseY} ${cx + baseHalfW},${baseY} ${cx + topHalfW},${shaftTopY} ${cx - topHalfW},${shaftTopY}`}
          fill="url(#obelisk-shaft)"
          opacity={0.75}
        />

        {/* Pyramidion (pointed cap) */}
        <polygon
          points={`${cx - topHalfW},${shaftTopY} ${cx + topHalfW},${shaftTopY} ${cx},${topY}`}
          fill={STONE_MED}
          opacity={0.8}
        />
        <polygon
          points={`${cx - topHalfW},${shaftTopY} ${cx + topHalfW},${shaftTopY} ${cx},${topY}`}
          fill={GOLD}
          opacity={0.15 + energy * 0.25}
        />

        {/* Apex glow */}
        <circle
          cx={cx}
          cy={topY}
          r={25 + energy * 20}
          fill="url(#obelisk-apex-glow)"
          style={{ filter: `drop-shadow(0 0 ${glowSize}px ${GOLD})` }}
        />

        {/* Hieroglyphic panels */}
        {Array.from({ length: PANEL_ROWS }).map((_, row) => {
          // Width at this height (tapered)
          const t = row / PANEL_ROWS;
          const halfWAtRow = topHalfW + (baseHalfW - topHalfW) * ((row + 0.5) / PANEL_ROWS);
          const py = shaftTopY + panelH * row;

          // Spectral contrast band for this row
          const bandIdx = row % 7;
          const bandEnergy = contrast[bandIdx];
          const glyphGlow = 0.15 + bandEnergy * 0.7;

          return Array.from({ length: PANEL_COLS }).map((__, col) => {
            const gi = row * PANEL_COLS + col;
            const glyphIdx = glyphMap[gi];
            const color = glyphColors[gi];
            const colOffset = col === 0 ? -halfWAtRow * 0.5 : halfWAtRow * 0.5;
            const px = cx + colOffset - panelW / 2;

            // Scanning glow effect (wave down the obelisk)
            const scanPhase = ((frame * 0.03 + t * 2) % 1);
            const scanBoost = Math.max(0, 1 - Math.abs(scanPhase - 0.5) * 4) * 0.3;

            return (
              <g key={`panel-${row}-${col}`}>
                {/* Panel background */}
                <rect
                  x={px}
                  y={py + 2}
                  width={panelW}
                  height={panelH - 4}
                  fill={color}
                  opacity={(glyphGlow + scanBoost) * 0.25}
                  rx={1}
                  style={{ filter: `drop-shadow(0 0 ${glowSize * 0.4}px ${color})` }}
                />
                {/* Glyph symbol */}
                <g
                  transform={`translate(${px + panelW * 0.15}, ${py + panelH * 0.15}) scale(${panelW * 0.08}, ${(panelH - 8) * 0.08})`}
                >
                  <path
                    d={GLYPH_PATHS[glyphIdx]}
                    fill="none"
                    stroke={color}
                    strokeWidth={0.6}
                    opacity={glyphGlow + scanBoost}
                  />
                </g>
              </g>
            );
          });
        })}

        {/* Engraved border lines */}
        <line x1={cx - topHalfW + 3} y1={shaftTopY + 5} x2={cx - baseHalfW + 3} y2={baseY - 5} stroke={WARM_GLOW} strokeWidth={0.8} opacity={0.15} />
        <line x1={cx + topHalfW - 3} y1={shaftTopY + 5} x2={cx + baseHalfW - 3} y2={baseY - 5} stroke={WARM_GLOW} strokeWidth={0.8} opacity={0.15} />

        {/* Base pedestal */}
        <rect
          x={cx - baseHalfW - 10}
          y={baseY}
          width={(baseHalfW + 10) * 2}
          height={14}
          fill={STONE_DARK}
          opacity={0.6}
          rx={2}
        />
      </svg>
    </div>
  );
};
