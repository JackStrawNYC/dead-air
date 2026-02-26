/**
 * StampCollection -- Grid of 6-9 vintage postage stamps.
 * Each stamp has a perforated edge (zigzag border), central illustration
 * (simple geometric: star, eagle, bell, flag, flower), denomination text,
 * and country name. Rich ink colors: green, red, blue, purple.
 * Stamps appear one by one. Energy drives appearance rate.
 * Cycle: 70s, 20s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useShowContext } from "../data/ShowContext";

const CYCLE = 2100; // 70 seconds at 30fps
const DURATION = 600; // 20 seconds visible

const STAMP_W = 90;
const STAMP_H = 110;
const PERF_RADIUS = 3;
const PERF_SPACING = 8;

const INK_COLORS = ["#1B5E20", "#B71C1C", "#1A237E", "#4A148C", "#006064", "#BF360C", "#33691E", "#880E4F", "#311B92"];
const DENOMINATIONS = ["1c", "2c", "3c", "5c", "8c", "10c", "15c", "20c", "25c"];
const COUNTRY_NAMES = ["UNITED STATES", "US POSTAGE", "AMERICA", "USA"];

type StampIcon = "star" | "eagle" | "bell" | "flag" | "flower" | "shield" | "torch" | "liberty" | "globe";
const ICONS: StampIcon[] = ["star", "eagle", "bell", "flag", "flower", "shield", "torch", "liberty", "globe"];

interface StampConfig {
  color: string;
  denomination: string;
  country: string;
  icon: StampIcon;
  rotation: number;
}

function renderStampIcon(icon: StampIcon, cx: number, cy: number, size: number, color: string): React.ReactNode {
  const s = size;
  const hl = "#F5F0E0"; // highlight color
  switch (icon) {
    case "star": {
      const points: string[] = [];
      for (let i = 0; i < 5; i++) {
        const outerAngle = (i * 72 - 90) * (Math.PI / 180);
        const innerAngle = ((i * 72 + 36) - 90) * (Math.PI / 180);
        points.push(`${cx + Math.cos(outerAngle) * s},${cy + Math.sin(outerAngle) * s}`);
        points.push(`${cx + Math.cos(innerAngle) * s * 0.4},${cy + Math.sin(innerAngle) * s * 0.4}`);
      }
      return <polygon points={points.join(" ")} fill={hl} opacity={0.7} />;
    }
    case "eagle":
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx={s * 0.3} ry={s * 0.5} fill={hl} opacity={0.6} />
          <line x1={cx - s} y1={cy - s * 0.2} x2={cx - s * 0.3} y2={cy} stroke={hl} strokeWidth={2} opacity={0.5} />
          <line x1={cx + s * 0.3} y1={cy} x2={cx + s} y2={cy - s * 0.2} stroke={hl} strokeWidth={2} opacity={0.5} />
          <circle cx={cx} cy={cy - s * 0.35} r={s * 0.2} fill={hl} opacity={0.7} />
        </g>
      );
    case "bell":
      return (
        <g>
          <path
            d={`M ${cx - s * 0.5} ${cy + s * 0.3} Q ${cx - s * 0.6} ${cy - s * 0.4} ${cx} ${cy - s * 0.7} Q ${cx + s * 0.6} ${cy - s * 0.4} ${cx + s * 0.5} ${cy + s * 0.3} Z`}
            fill={hl}
            opacity={0.6}
          />
          <circle cx={cx} cy={cy + s * 0.45} r={s * 0.12} fill={hl} opacity={0.7} />
        </g>
      );
    case "flag":
      return (
        <g>
          <line x1={cx - s * 0.4} y1={cy - s * 0.6} x2={cx - s * 0.4} y2={cy + s * 0.6} stroke={hl} strokeWidth={2} opacity={0.6} />
          <rect x={cx - s * 0.35} y={cy - s * 0.55} width={s * 0.9} height={s * 0.6} fill={hl} opacity={0.5} rx={1} />
          {[0, 1, 2].map((li) => (
            <line
              key={`fl-${li}`}
              x1={cx - s * 0.3}
              y1={cy - s * 0.45 + li * s * 0.2}
              x2={cx + s * 0.5}
              y2={cy - s * 0.45 + li * s * 0.2}
              stroke={color}
              strokeWidth={1.5}
              opacity={0.3}
            />
          ))}
        </g>
      );
    case "flower":
      return (
        <g>
          {[0, 1, 2, 3, 4, 5].map((pi) => {
            const a = (pi * 60) * (Math.PI / 180);
            return (
              <ellipse
                key={`petal-${pi}`}
                cx={cx + Math.cos(a) * s * 0.35}
                cy={cy + Math.sin(a) * s * 0.35}
                rx={s * 0.25}
                ry={s * 0.15}
                fill={hl}
                opacity={0.5}
                transform={`rotate(${pi * 60}, ${cx + Math.cos(a) * s * 0.35}, ${cy + Math.sin(a) * s * 0.35})`}
              />
            );
          })}
          <circle cx={cx} cy={cy} r={s * 0.18} fill={hl} opacity={0.7} />
        </g>
      );
    case "shield":
      return (
        <path
          d={`M ${cx} ${cy - s * 0.6} L ${cx + s * 0.5} ${cy - s * 0.25} L ${cx + s * 0.5} ${cy + s * 0.15} Q ${cx + s * 0.3} ${cy + s * 0.6} ${cx} ${cy + s * 0.7} Q ${cx - s * 0.3} ${cy + s * 0.6} ${cx - s * 0.5} ${cy + s * 0.15} L ${cx - s * 0.5} ${cy - s * 0.25} Z`}
          fill={hl}
          opacity={0.6}
        />
      );
    case "torch":
      return (
        <g>
          <rect x={cx - 3} y={cy - s * 0.1} width={6} height={s * 0.7} fill={hl} opacity={0.6} rx={1} />
          <ellipse cx={cx} cy={cy - s * 0.2} rx={s * 0.2} ry={s * 0.35} fill={hl} opacity={0.5} />
          <ellipse cx={cx} cy={cy - s * 0.45} rx={s * 0.12} ry={s * 0.2} fill="#FFEB3B" opacity={0.4} />
        </g>
      );
    case "liberty":
      return (
        <g>
          <ellipse cx={cx} cy={cy + s * 0.1} rx={s * 0.3} ry={s * 0.5} fill={hl} opacity={0.5} />
          <circle cx={cx} cy={cy - s * 0.35} r={s * 0.2} fill={hl} opacity={0.6} />
          {[-2, -1, 0, 1, 2].map((ri) => (
            <line
              key={`ray-${ri}`}
              x1={cx + ri * s * 0.12}
              y1={cy - s * 0.55}
              x2={cx + ri * s * 0.18}
              y2={cy - s * 0.75}
              stroke={hl}
              strokeWidth={1.5}
              opacity={0.4}
            />
          ))}
        </g>
      );
    case "globe":
      return (
        <g>
          <circle cx={cx} cy={cy} r={s * 0.5} fill="none" stroke={hl} strokeWidth={1.5} opacity={0.6} />
          <ellipse cx={cx} cy={cy} rx={s * 0.25} ry={s * 0.5} fill="none" stroke={hl} strokeWidth={1} opacity={0.4} />
          <line x1={cx - s * 0.5} y1={cy} x2={cx + s * 0.5} y2={cy} stroke={hl} strokeWidth={1} opacity={0.4} />
        </g>
      );
  }
}

interface Props {
  frames: EnhancedFrameData[];
}

export const StampCollection: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const stampConfigs = React.useMemo(() => {
    const rng = seeded(ctx?.showSeed ?? 77050802);
    const configs: StampConfig[] = [];
    const count = 9;
    for (let i = 0; i < count; i++) {
      configs.push({
        color: INK_COLORS[Math.floor(rng() * INK_COLORS.length)],
        denomination: DENOMINATIONS[i % DENOMINATIONS.length],
        country: COUNTRY_NAMES[Math.floor(rng() * COUNTRY_NAMES.length)],
        icon: ICONS[i % ICONS.length],
        rotation: (rng() - 0.5) * 8,
      });
    }
    return configs;
  }, [ctx?.showSeed]);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // How many stamps are revealed (energy drives rate)
  const appearRate = interpolate(energy, [0.03, 0.3], [0.6, 1.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const baseRevealPerStamp = DURATION / (stampConfigs.length + 1);
  const revealedCount = Math.min(
    stampConfigs.length,
    Math.floor(1 + (cycleFrame * appearRate) / baseRevealPerStamp)
  );

  // Grid layout: 3 columns
  const cols = 3;
  const gridW = cols * (STAMP_W + 20);
  const rows = Math.ceil(stampConfigs.length / cols);
  const gridH = rows * (STAMP_H + 16);
  const gridStartX = (width - gridW) / 2;
  const gridStartY = (height - gridH) / 2;

  const glowSize = interpolate(energy, [0.03, 0.3], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px rgba(255, 215, 0, 0.5))`,
          willChange: "opacity",
        }}
      >
        {stampConfigs.map((stamp, si) => {
          if (si >= revealedCount) return null;

          const col = si % cols;
          const row = Math.floor(si / cols);
          const sx = gridStartX + col * (STAMP_W + 20) + 10;
          const sy = gridStartY + row * (STAMP_H + 16) + 8;

          // Individual stamp fade-in
          const stampAppearFrame = si * baseRevealPerStamp / appearRate;
          const stampAge = cycleFrame - stampAppearFrame;
          const stampFade = interpolate(stampAge, [0, 30], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });

          // Perforated edge: zigzag points around the stamp
          const perfPoints: string[] = [];
          // Top edge
          for (let px = 0; px <= STAMP_W; px += PERF_SPACING) {
            const indent = (Math.floor(px / PERF_SPACING) % 2 === 0) ? 0 : PERF_RADIUS;
            perfPoints.push(`${sx + px},${sy + indent}`);
          }
          // Right edge
          for (let py = 0; py <= STAMP_H; py += PERF_SPACING) {
            const indent = (Math.floor(py / PERF_SPACING) % 2 === 0) ? 0 : -PERF_RADIUS;
            perfPoints.push(`${sx + STAMP_W + indent},${sy + py}`);
          }
          // Bottom edge (reverse)
          for (let px = STAMP_W; px >= 0; px -= PERF_SPACING) {
            const indent = (Math.floor(px / PERF_SPACING) % 2 === 0) ? 0 : -PERF_RADIUS;
            perfPoints.push(`${sx + px},${sy + STAMP_H + indent}`);
          }
          // Left edge (reverse)
          for (let py = STAMP_H; py >= 0; py -= PERF_SPACING) {
            const indent = (Math.floor(py / PERF_SPACING) % 2 === 0) ? 0 : PERF_RADIUS;
            perfPoints.push(`${sx + indent},${sy + py}`);
          }

          const iconCx = sx + STAMP_W / 2;
          const iconCy = sy + STAMP_H * 0.42;

          return (
            <g
              key={`stamp-${si}`}
              opacity={stampFade}
              transform={`rotate(${stamp.rotation}, ${sx + STAMP_W / 2}, ${sy + STAMP_H / 2})`}
            >
              {/* Stamp body with perforated edge */}
              <polygon
                points={perfPoints.join(" ")}
                fill={stamp.color}
                opacity={0.85}
              />

              {/* Inner border */}
              <rect
                x={sx + 5}
                y={sy + 5}
                width={STAMP_W - 10}
                height={STAMP_H - 10}
                fill="none"
                stroke="#F5F0E0"
                strokeWidth={1}
                opacity={0.4}
              />

              {/* Icon illustration */}
              {renderStampIcon(stamp.icon, iconCx, iconCy, 18, stamp.color)}

              {/* Country name */}
              <text
                x={sx + STAMP_W / 2}
                y={sy + 16}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#F5F0E0"
                fontSize={7}
                fontFamily="serif"
                fontWeight="bold"
                letterSpacing={1.5}
                opacity={0.7}
              >
                {stamp.country}
              </text>

              {/* Denomination */}
              <text
                x={sx + STAMP_W / 2}
                y={sy + STAMP_H - 14}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#F5F0E0"
                fontSize={12}
                fontFamily="serif"
                fontWeight="bold"
                opacity={0.8}
              >
                {stamp.denomination}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
