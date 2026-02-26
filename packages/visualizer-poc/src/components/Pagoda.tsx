/**
 * Pagoda — Multi-tier pagoda silhouette (5 tiers) with glowing lanterns on
 * each level. Lantern brightness follows spectral band data (each tier maps
 * to a different frequency band). Curved eaves with upturned tips.
 * Positioned center-right. Misty atmospheric glow at base.
 * Cycle: 65s on / off, 17s visible.
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

const CYCLE = 1950; // 65s at 30fps
const DURATION = 510; // 17s visible
const TIER_COUNT = 5;

const WOOD_DARK = "#2D1810";
const WOOD_MED = "#3E2218";
const EAVE_COLOR = "#1E120A";
const LANTERN_RED = "#FF3D00";
const LANTERN_GOLD = "#FFB300";
const MIST_COLOR = "#E0D8D0";

interface TierDef {
  yFrac: number;      // top position as fraction of height
  widthFrac: number;   // width as fraction of screen width
  heightFrac: number;  // tier height as fraction
  eaveOverhang: number; // how far eaves extend past body
  lanternCount: number;
  band: "sub" | "low" | "mid" | "high" | "centroid";
}

const TIERS: TierDef[] = [
  { yFrac: 0.26, widthFrac: 0.06, heightFrac: 0.08, eaveOverhang: 25, lanternCount: 1, band: "high" },
  { yFrac: 0.34, widthFrac: 0.10, heightFrac: 0.09, eaveOverhang: 32, lanternCount: 2, band: "mid" },
  { yFrac: 0.43, widthFrac: 0.14, heightFrac: 0.10, eaveOverhang: 38, lanternCount: 3, band: "mid" },
  { yFrac: 0.53, widthFrac: 0.18, heightFrac: 0.11, eaveOverhang: 44, lanternCount: 3, band: "low" },
  { yFrac: 0.64, widthFrac: 0.22, heightFrac: 0.12, eaveOverhang: 50, lanternCount: 4, band: "sub" },
];

interface Props {
  frames: EnhancedFrameData[];
}

export const Pagoda: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Pre-generate lantern sway phases
  const lanternPhases = React.useMemo(() => {
    const rng = seeded(88_103_442);
    const phases: number[][] = [];
    for (let t = 0; t < TIER_COUNT; t++) {
      phases.push(
        Array.from({ length: TIERS[t].lanternCount }, () => rng() * Math.PI * 2),
      );
    }
    return phases;
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
  const baseOpacity = interpolate(energy, [0.02, 0.25], [0.2, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;
  if (masterOpacity < 0.01) return null;

  const pagodaCx = width * 0.72;
  const currentFrame = frames[idx];

  const getBandEnergy = (band: TierDef["band"]): number => {
    switch (band) {
      case "sub": return currentFrame.sub;
      case "low": return currentFrame.low;
      case "mid": return currentFrame.mid;
      case "high": return currentFrame.high;
      case "centroid": return currentFrame.centroid;
    }
  };

  const glowSize = interpolate(energy, [0.02, 0.3], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
          <radialGradient id="pagoda-lantern-glow">
            <stop offset="0%" stopColor={LANTERN_RED} stopOpacity={0.7} />
            <stop offset="50%" stopColor={LANTERN_GOLD} stopOpacity={0.2} />
            <stop offset="100%" stopColor={LANTERN_GOLD} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="pagoda-mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={MIST_COLOR} stopOpacity={0} />
            <stop offset="100%" stopColor={MIST_COLOR} stopOpacity={0.15} />
          </linearGradient>
        </defs>

        {/* Mist at base */}
        <ellipse
          cx={pagodaCx}
          cy={height * 0.82}
          rx={width * 0.18}
          ry={40}
          fill="url(#pagoda-mist)"
          opacity={0.4 + energy * 0.3}
        />

        {/* Spire on top */}
        <line
          x1={pagodaCx}
          y1={height * 0.16}
          x2={pagodaCx}
          y2={height * TIERS[0].yFrac}
          stroke={WOOD_DARK}
          strokeWidth={3}
          opacity={0.7}
        />
        <circle
          cx={pagodaCx}
          cy={height * 0.16}
          r={4}
          fill={LANTERN_GOLD}
          opacity={0.5 + energy * 0.4}
          style={{ filter: `drop-shadow(0 0 ${glowSize}px ${LANTERN_GOLD})` }}
        />

        {/* Tiers (top to bottom) */}
        {TIERS.map((tier, ti) => {
          const ty = height * tier.yFrac;
          const tw = width * tier.widthFrac;
          const th = height * tier.heightFrac;
          const eaveW = tw + tier.eaveOverhang * 2;
          const bandE = getBandEnergy(tier.band);

          return (
            <g key={`tier-${ti}`}>
              {/* Tier body */}
              <rect
                x={pagodaCx - tw / 2}
                y={ty}
                width={tw}
                height={th}
                fill={WOOD_MED}
                opacity={0.7}
                rx={1}
              />

              {/* Curved eave */}
              <path
                d={`M ${pagodaCx - eaveW / 2} ${ty + th} Q ${pagodaCx - eaveW / 2 - 8} ${ty + th - 15} ${pagodaCx - tw / 2} ${ty + th - 3} L ${pagodaCx + tw / 2} ${ty + th - 3} Q ${pagodaCx + eaveW / 2 + 8} ${ty + th - 15} ${pagodaCx + eaveW / 2} ${ty + th} Z`}
                fill={EAVE_COLOR}
                opacity={0.8}
              />

              {/* Upturned eave tips */}
              <line
                x1={pagodaCx - eaveW / 2}
                y1={ty + th}
                x2={pagodaCx - eaveW / 2 - 6}
                y2={ty + th - 10}
                stroke={EAVE_COLOR}
                strokeWidth={2}
                opacity={0.6}
              />
              <line
                x1={pagodaCx + eaveW / 2}
                y1={ty + th}
                x2={pagodaCx + eaveW / 2 + 6}
                y2={ty + th - 10}
                stroke={EAVE_COLOR}
                strokeWidth={2}
                opacity={0.6}
              />

              {/* Lanterns hanging from eaves */}
              {Array.from({ length: tier.lanternCount }).map((_, li) => {
                const lx = pagodaCx - eaveW / 2 + (eaveW / (tier.lanternCount + 1)) * (li + 1);
                const ly = ty + th + 8;
                const sway = Math.sin(frame * 0.04 + lanternPhases[ti][li]) * 3;
                const lanternBright = 0.3 + bandE * 0.7;

                return (
                  <g key={`lantern-${ti}-${li}`} transform={`translate(${sway}, 0)`}>
                    {/* String */}
                    <line
                      x1={lx}
                      y1={ty + th}
                      x2={lx}
                      y2={ly}
                      stroke={WOOD_DARK}
                      strokeWidth={0.8}
                      opacity={0.5}
                    />
                    {/* Lantern glow halo */}
                    <circle
                      cx={lx}
                      cy={ly + 5}
                      r={12 + bandE * 8}
                      fill="url(#pagoda-lantern-glow)"
                      opacity={lanternBright * 0.5}
                    />
                    {/* Lantern body */}
                    <ellipse
                      cx={lx}
                      cy={ly + 5}
                      rx={4}
                      ry={6}
                      fill={LANTERN_RED}
                      opacity={lanternBright}
                      style={{ filter: `drop-shadow(0 0 ${glowSize * 0.6}px ${LANTERN_RED})` }}
                    />
                  </g>
                );
              })}

              {/* Window openings (dark with faint glow) */}
              {ti >= 2 && (
                <rect
                  x={pagodaCx - tw * 0.15}
                  y={ty + th * 0.25}
                  width={tw * 0.3}
                  height={th * 0.45}
                  fill={LANTERN_GOLD}
                  opacity={0.15 + bandE * 0.25}
                  rx={1}
                />
              )}
            </g>
          );
        })}

        {/* Foundation/base platform */}
        <rect
          x={pagodaCx - width * 0.13}
          y={height * TIERS[4].yFrac + height * TIERS[4].heightFrac}
          width={width * 0.26}
          height={height * 0.05}
          fill={WOOD_DARK}
          opacity={0.6}
          rx={2}
        />
      </svg>
    </div>
  );
};
