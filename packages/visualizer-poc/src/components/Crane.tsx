/**
 * Crane — Construction crane swinging a load on a cable.
 * Tower crane silhouette with a lattice boom. A cable hangs from the boom
 * tip with a load (block/container) that swings as a pendulum.
 * Pendulum motion period tied to tempo. Swing amplitude scales with energy.
 * Warning light blinks on top. Dark steel with yellow safety accents.
 * Positioned left side, tall. Cycle: 50s on, 40s off (90s = 2700f, offset 600).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2700; // 90s at 30fps
const CYCLE_OFFSET = 600; // 20s stagger from Turbine which shares same CYCLE
const DURATION = 1500; // 50s visible

interface Props {
  frames: EnhancedFrameData[];
}

export const Crane: React.FC<Props> = ({ frames }) => {
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

  // Lattice cross-brace positions (deterministic)
  const towerBraces = React.useMemo(() => {
    const rng = seeded(22750);
    return Array.from({ length: 12 }, (_, i) => ({
      y: i,
      skew: rng() > 0.5 ? 1 : -1,
    }));
  }, []);

  // Timing gate (with offset)
  const adjustedFrame = frame + CYCLE_OFFSET;
  const cycleFrame = adjustedFrame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], {
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

  // Crane geometry
  const baseX = width * 0.12;
  const baseY = height * 0.9;
  const towerW = 20;
  const towerH = height * 0.7;
  const towerTopY = baseY - towerH;

  // Boom (horizontal arm)
  const boomLen = width * 0.28;
  const boomEndX = baseX + boomLen;
  const boomY = towerTopY + 5;
  const counterweightLen = width * 0.08;
  const counterweightX = baseX - counterweightLen;

  // Cable and load
  const cableAttachX = boomEndX - 20;
  const cableLen = height * 0.25;

  // Pendulum physics
  const swingPeriod = 75; // ~2.5s natural period
  const maxAmplitude = interpolate(energy, [0.03, 0.15, 0.35], [0.05, 0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const swingPhase = (frame % swingPeriod) / swingPeriod;
  const pendulumAngle = Math.sin(swingPhase * Math.PI * 2) * maxAmplitude;

  // Load position
  const loadX = cableAttachX + Math.sin(pendulumAngle) * cableLen;
  const loadY = boomY + Math.cos(pendulumAngle) * cableLen;
  const loadW = 30;
  const loadH = 22;

  // Warning light blink
  const blinkPhase = (frame % 30) / 30;
  const lightOn = blinkPhase < 0.4;
  const lightOpacity = lightOn ? 0.7 + energy * 0.3 : 0.1;

  // Boom sway (very subtle, driven by energy)
  const boomSway = Math.sin(frame * 0.02) * energy * 3;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity, willChange: "opacity" }}>
        <defs>
          <filter id="crane-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Tower (two vertical rails) */}
        <line
          x1={baseX - towerW / 2}
          y1={baseY}
          x2={baseX - towerW / 2}
          y2={towerTopY}
          stroke="#455A64"
          strokeWidth={4}
          opacity={0.6}
        />
        <line
          x1={baseX + towerW / 2}
          y1={baseY}
          x2={baseX + towerW / 2}
          y2={towerTopY}
          stroke="#455A64"
          strokeWidth={4}
          opacity={0.6}
        />

        {/* Tower lattice cross-braces */}
        {towerBraces.map((brace, bi) => {
          const by1 = towerTopY + (bi / 12) * towerH;
          const by2 = towerTopY + ((bi + 1) / 12) * towerH;
          const x1 = brace.skew > 0 ? baseX - towerW / 2 : baseX + towerW / 2;
          const x2 = brace.skew > 0 ? baseX + towerW / 2 : baseX - towerW / 2;
          return (
            <line
              key={`brace-${bi}`}
              x1={x1}
              y1={by1}
              x2={x2}
              y2={by2}
              stroke="#546E7A"
              strokeWidth={1.5}
              opacity={0.4}
            />
          );
        })}

        {/* Slewing unit (rotation platform at top) */}
        <rect
          x={baseX - towerW / 2 - 3}
          y={towerTopY - 6}
          width={towerW + 6}
          height={12}
          rx={2}
          fill="#37474F"
          opacity={0.6}
        />

        {/* Boom (jib arm) — extending right */}
        <line
          x1={baseX}
          y1={boomY + boomSway}
          x2={boomEndX}
          y2={boomY + boomSway}
          stroke="#455A64"
          strokeWidth={5}
          opacity={0.6}
        />
        {/* Boom top chord */}
        <line
          x1={baseX}
          y1={boomY - 8 + boomSway}
          x2={boomEndX}
          y2={boomY - 8 + boomSway}
          stroke="#546E7A"
          strokeWidth={2}
          opacity={0.4}
        />
        {/* Boom lattice */}
        {Array.from({ length: 8 }, (_, i) => {
          const bx = baseX + ((i + 0.5) / 8) * boomLen;
          return (
            <line
              key={`boom-lat-${i}`}
              x1={bx}
              y1={boomY + boomSway}
              x2={bx + boomLen / 16}
              y2={boomY - 8 + boomSway}
              stroke="#546E7A"
              strokeWidth={1}
              opacity={0.3}
            />
          );
        })}

        {/* Counterweight arm (extending left) */}
        <line
          x1={baseX}
          y1={boomY + boomSway}
          x2={counterweightX}
          y2={boomY + boomSway}
          stroke="#455A64"
          strokeWidth={4}
          opacity={0.5}
        />

        {/* Counterweight block */}
        <rect
          x={counterweightX - 15}
          y={boomY + boomSway}
          width={25}
          height={18}
          rx={2}
          fill="#37474F"
          opacity={0.6}
        />

        {/* Hoist cable support wires (from tower top to boom tip) */}
        <line
          x1={baseX}
          y1={towerTopY - 15}
          x2={boomEndX}
          y2={boomY + boomSway}
          stroke="#78909C"
          strokeWidth={1}
          opacity={0.3}
        />
        <line
          x1={baseX}
          y1={towerTopY - 15}
          x2={counterweightX}
          y2={boomY + boomSway}
          stroke="#78909C"
          strokeWidth={1}
          opacity={0.3}
        />

        {/* Pendant (small mast above slewing unit) */}
        <line
          x1={baseX}
          y1={towerTopY - 6}
          x2={baseX}
          y2={towerTopY - 20}
          stroke="#455A64"
          strokeWidth={3}
          opacity={0.5}
        />

        {/* Cable from boom to load */}
        <line
          x1={cableAttachX}
          y1={boomY + boomSway}
          x2={loadX}
          y2={loadY}
          stroke="#90A4AE"
          strokeWidth={1.5}
          opacity={0.5}
        />

        {/* Load (container block) */}
        <rect
          x={loadX - loadW / 2}
          y={loadY}
          width={loadW}
          height={loadH}
          rx={2}
          fill="#37474F"
          stroke="#FDD835"
          strokeWidth={1.5}
          opacity={0.6}
        />
        {/* Load safety stripes */}
        <line
          x1={loadX - loadW / 2 + 3}
          y1={loadY + loadH / 2}
          x2={loadX + loadW / 2 - 3}
          y2={loadY + loadH / 2}
          stroke="#FDD835"
          strokeWidth={2}
          opacity={0.4}
        />

        {/* Hook at cable end */}
        <path
          d={`M ${loadX} ${loadY - 2} Q ${loadX + 6} ${loadY - 8} ${loadX} ${loadY - 14}`}
          fill="none"
          stroke="#90A4AE"
          strokeWidth={2}
          opacity={0.5}
        />

        {/* Warning light on top */}
        <circle
          cx={baseX}
          cy={towerTopY - 20}
          r={4}
          fill={lightOn ? "#F44336" : "#B71C1C"}
          opacity={lightOpacity}
          filter={lightOn ? "url(#crane-glow)" : undefined}
        />

        {/* Base/foundation */}
        <rect
          x={baseX - 30}
          y={baseY}
          width={60}
          height={10}
          rx={2}
          fill="#455A64"
          opacity={0.5}
        />

        {/* Yellow safety markings on tower */}
        {[0.2, 0.5, 0.8].map((t) => {
          const markY = towerTopY + t * towerH;
          return (
            <rect
              key={`mark-${t}`}
              x={baseX - towerW / 2 - 1}
              y={markY}
              width={towerW + 2}
              height={4}
              fill="#FDD835"
              opacity={0.25}
            />
          );
        })}
      </svg>
    </div>
  );
};
