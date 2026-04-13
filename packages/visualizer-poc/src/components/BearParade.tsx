/**
 * BearParade — Grateful Dead marching bears, beat-driven.
 *
 * The iconic Bob Thomas dancing bears: upright, bipedal, facing forward,
 * one arm up one arm down, legs in walking stride, big grinning face,
 * thick black outline, solid color fill, jagged collar.
 *
 * Audio reactivity:
 *   tempoFactor → walk cycle speed
 *   beatDecay   → synchronized stepping
 *   bass        → stomp depth
 *   slowEnergy  → expressiveness
 *   onsetEnvelope → arm raise
 *   chromaHue   → palette tint
 *   energy      → bounce height
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const BEAR_COUNT = 5;

interface BearSpec {
  idx: number;
  phase: number;
  hue: number;
  xSlot: number;
}

function buildBears(): BearSpec[] {
  const hues = [20, 355, 50, 145, 280]; // orange, red, gold, green, purple
  const rng = seeded(88_221_773);
  return Array.from({ length: BEAR_COUNT }, (_, i) => ({
    idx: i,
    phase: i * 1.1 + rng() * 0.3,
    hue: hues[i],
    xSlot: 0.12 + i * 0.19,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const BearParade: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const bears = React.useMemo(buildBears, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.85;
  if (masterOpacity < 0.01) return null;

  const expr = interpolate(snap.slowEnergy, [0.02, 0.30], [0.1, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bounce = interpolate(snap.energy, [0.02, 0.30], [0.0, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stomp = snap.bass * snap.beatDecay;
  const armTrig = interpolate(snap.onsetEnvelope, [0.3, 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tintShift = (snap.chromaHue - 180) * 0.3;

  const groundY = height * 0.90;
  // Bear is ~55% of screen height — BIG and chunky
  const bearH = height * 0.52;

  function renderBear(spec: BearSpec): React.ReactNode {
    const hue = ((spec.hue + tintShift) % 360 + 360) % 360;
    const fill = `hsl(${hue}, 85%, 50%)`;
    const collarHue = (hue + 200) % 360;
    const collarFill = `hsl(${collarHue}, 75%, 48%)`;
    const stroke = "#000";
    const sw = Math.max(4, bearH * 0.018); // THICK black outline — the defining GD bear trait

    const cx = spec.xSlot * width;
    const phase = frame * 0.11 * tempoFactor + spec.phase;

    // Walk cycle — legs and arms swing in opposition
    const legAngle = Math.sin(phase) * 22 * expr;
    const armAngle = Math.sin(phase + Math.PI) * 30 * expr;
    const armAngle2 = Math.sin(phase) * 25 * expr;
    const headTilt = Math.sin(phase * 2) * 3 * expr;
    const beatPop = snap.beatDecay * 8 * expr;

    // Bear origin — bottom center at ground level
    const bx = cx;
    const by = groundY - beatPop;

    // Proportions (relative to bearH):
    // Head: 28% of height, centered at top
    // Torso: 30% of height
    // Legs: 42% of height
    const headR = bearH * 0.14;
    const headCy = by - bearH * 0.82;
    const shoulderY = by - bearH * 0.62;
    const waistY = by - bearH * 0.38;
    const torsoW = bearH * 0.22;

    // Arm length and leg length
    const armLen = bearH * 0.32;
    const legLen = bearH * 0.38;

    // Extra arm raise on onset
    const extraArmUp = armTrig * 20;

    return (
      <g key={`bear-${spec.idx}`}>
        {/* Shadow */}
        <ellipse cx={bx} cy={groundY + 2} rx={bearH * 0.18} ry={3}
          fill="rgba(0,0,0,0.35)" />

        {/* === LEFT LEG (back leg in stride) === */}
        <g transform={`rotate(${-legAngle} ${bx - torsoW * 0.35} ${waistY})`}>
          {/* Thigh */}
          <path d={`
            M ${bx - torsoW * 0.50} ${waistY}
            L ${bx - torsoW * 0.60} ${waistY + legLen * 0.55}
            L ${bx - torsoW * 0.25} ${waistY + legLen * 0.55}
            L ${bx - torsoW * 0.20} ${waistY}
            Z
          `} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          {/* Shin + foot */}
          <path d={`
            M ${bx - torsoW * 0.58} ${waistY + legLen * 0.50}
            L ${bx - torsoW * 0.55} ${waistY + legLen * 0.95}
            L ${bx - torsoW * 0.75} ${waistY + legLen}
            L ${bx - torsoW * 0.75} ${waistY + legLen * 1.05}
            L ${bx - torsoW * 0.15} ${waistY + legLen * 1.05}
            L ${bx - torsoW * 0.15} ${waistY + legLen}
            L ${bx - torsoW * 0.27} ${waistY + legLen * 0.50}
            Z
          `} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </g>

        {/* === RIGHT LEG (front leg in stride) === */}
        <g transform={`rotate(${legAngle} ${bx + torsoW * 0.35} ${waistY})`}>
          <path d={`
            M ${bx + torsoW * 0.20} ${waistY}
            L ${bx + torsoW * 0.25} ${waistY + legLen * 0.55}
            L ${bx + torsoW * 0.60} ${waistY + legLen * 0.55}
            L ${bx + torsoW * 0.50} ${waistY}
            Z
          `} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <path d={`
            M ${bx + torsoW * 0.27} ${waistY + legLen * 0.50}
            L ${bx + torsoW * 0.15} ${waistY + legLen * 0.95}
            L ${bx + torsoW * 0.15} ${waistY + legLen * 1.05}
            L ${bx + torsoW * 0.75} ${waistY + legLen * 1.05}
            L ${bx + torsoW * 0.75} ${waistY + legLen}
            L ${bx + torsoW * 0.55} ${waistY + legLen * 0.95}
            L ${bx + torsoW * 0.58} ${waistY + legLen * 0.50}
            Z
          `} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </g>

        {/* === BACK ARM (the one going back) === */}
        <g transform={`rotate(${armAngle2 + 15} ${bx - torsoW * 0.55} ${shoulderY + bearH * 0.02})`}>
          <path d={`
            M ${bx - torsoW * 0.55} ${shoulderY}
            C ${bx - torsoW * 0.90} ${shoulderY + armLen * 0.3}
              ${bx - torsoW * 1.0} ${shoulderY + armLen * 0.6}
              ${bx - torsoW * 0.85} ${shoulderY + armLen * 0.85}
            L ${bx - torsoW * 0.65} ${shoulderY + armLen * 0.75}
            C ${bx - torsoW * 0.70} ${shoulderY + armLen * 0.5}
              ${bx - torsoW * 0.65} ${shoulderY + armLen * 0.25}
              ${bx - torsoW * 0.42} ${shoulderY + bearH * 0.02}
            Z
          `} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </g>

        {/* === TORSO — slightly narrower at waist, wider at shoulders === */}
        <path d={`
          M ${bx - torsoW * 0.55} ${shoulderY}
          C ${bx - torsoW * 0.60} ${shoulderY + (waistY - shoulderY) * 0.3}
            ${bx - torsoW * 0.50} ${shoulderY + (waistY - shoulderY) * 0.7}
            ${bx - torsoW * 0.40} ${waistY}
          L ${bx + torsoW * 0.40} ${waistY}
          C ${bx + torsoW * 0.50} ${shoulderY + (waistY - shoulderY) * 0.7}
            ${bx + torsoW * 0.60} ${shoulderY + (waistY - shoulderY) * 0.3}
            ${bx + torsoW * 0.55} ${shoulderY}
          Z
        `} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />

        {/* === COLLAR — jagged neckpiece === */}
        {(() => {
          const collarY = shoulderY + bearH * 0.02;
          const collarR = torsoW * 0.65;
          const points = 9;
          const spikes: string[] = [];
          for (let i = 0; i < points; i++) {
            const a = (i / points) * Math.PI * 2 - Math.PI * 0.5;
            const aNext = ((i + 0.5) / points) * Math.PI * 2 - Math.PI * 0.5;
            const outerR = collarR * (1.1 + Math.sin(i * 2.3) * 0.15);
            const innerR = collarR * 0.7;
            spikes.push(`${bx + Math.cos(a) * outerR} ${collarY + Math.sin(a) * outerR * 0.5}`);
            spikes.push(`${bx + Math.cos(aNext) * innerR} ${collarY + Math.sin(aNext) * innerR * 0.5}`);
          }
          return (
            <polygon
              points={spikes.join(" ")}
              fill={collarFill}
              stroke={stroke}
              strokeWidth={sw * 0.7}
              strokeLinejoin="round"
            />
          );
        })()}

        {/* === FRONT ARM (raised, dancing) === */}
        <g transform={`rotate(${-armAngle - extraArmUp - 30} ${bx + torsoW * 0.55} ${shoulderY + bearH * 0.02})`}>
          <path d={`
            M ${bx + torsoW * 0.42} ${shoulderY + bearH * 0.02}
            C ${bx + torsoW * 0.65} ${shoulderY + armLen * 0.25}
              ${bx + torsoW * 0.70} ${shoulderY + armLen * 0.5}
              ${bx + torsoW * 0.65} ${shoulderY + armLen * 0.75}
            L ${bx + torsoW * 0.85} ${shoulderY + armLen * 0.85}
            C ${bx + torsoW * 1.0} ${shoulderY + armLen * 0.6}
              ${bx + torsoW * 0.90} ${shoulderY + armLen * 0.3}
              ${bx + torsoW * 0.55} ${shoulderY}
            Z
          `} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </g>

        {/* === HEAD — round, facing forward === */}
        <g transform={`rotate(${headTilt} ${bx} ${headCy})`}>
          {/* Main head circle */}
          <circle cx={bx} cy={headCy} r={headR}
            fill={fill} stroke={stroke} strokeWidth={sw} />

          {/* Ears — round bumps on top */}
          <circle cx={bx - headR * 0.75} cy={headCy - headR * 0.75} r={headR * 0.35}
            fill={fill} stroke={stroke} strokeWidth={sw} />
          <circle cx={bx - headR * 0.75} cy={headCy - headR * 0.75} r={headR * 0.15}
            fill={stroke} />
          <circle cx={bx + headR * 0.75} cy={headCy - headR * 0.75} r={headR * 0.35}
            fill={fill} stroke={stroke} strokeWidth={sw} />
          <circle cx={bx + headR * 0.75} cy={headCy - headR * 0.75} r={headR * 0.15}
            fill={stroke} />

          {/* Eyes — simple oval dots */}
          <ellipse cx={bx - headR * 0.35} cy={headCy - headR * 0.15} rx={headR * 0.12} ry={headR * 0.14}
            fill={stroke} />
          <ellipse cx={bx + headR * 0.35} cy={headCy - headR * 0.15} rx={headR * 0.12} ry={headR * 0.14}
            fill={stroke} />

          {/* Nose — oval */}
          <ellipse cx={bx} cy={headCy + headR * 0.15} rx={headR * 0.15} ry={headR * 0.10}
            fill={stroke} />

          {/* Mouth — wide open grin (the iconic feature) */}
          <path d={`
            M ${bx - headR * 0.45} ${headCy + headR * 0.35}
            Q ${bx - headR * 0.25} ${headCy + headR * 0.20}
              ${bx} ${headCy + headR * 0.30}
            Q ${bx + headR * 0.25} ${headCy + headR * 0.20}
              ${bx + headR * 0.45} ${headCy + headR * 0.35}
            Q ${bx + headR * 0.30} ${headCy + headR * 0.70}
              ${bx} ${headCy + headR * 0.72}
            Q ${bx - headR * 0.30} ${headCy + headR * 0.70}
              ${bx - headR * 0.45} ${headCy + headR * 0.35}
            Z
          `} fill={stroke} />
        </g>
      </g>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        {/* Dark stage */}
        <rect width={width} height={height} fill="rgb(8, 5, 3)" />
        {/* Footlight glow */}
        <ellipse cx={width / 2} cy={groundY + 10} rx={width * 0.45} ry={40}
          fill="rgba(60, 40, 20, 0.12)" />
        {/* Ground */}
        <line x1={0} y1={groundY} x2={width} y2={groundY}
          stroke="rgba(60, 40, 20, 0.25)" strokeWidth={1} />
        {/* Bears */}
        {bears.map(renderBear)}
      </svg>
    </div>
  );
};
