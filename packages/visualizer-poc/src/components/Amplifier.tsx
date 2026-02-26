/**
 * Amplifier — Marshall-style amp stack. 2 speaker cabinets stacked (rectangles
 * with 4 speaker cone circles each). Head unit on top with control knobs.
 * Tubes glow warm orange inside the head (3 small circles). Speaker cones
 * vibrate (slight radius oscillation with sub-bass). Control knob needles
 * move with different frequency bands. Positioned bottom-left corner.
 * Appears every 55s for 12s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const AMP_BROWN = "#2A1F14";
const AMP_GOLD = "#C8A656";
const AMP_DARK = "#1A1208";
const GRILLE_COLOR = "#3A2F22";
const TUBE_ORANGE = "#FF8C00";
const CONE_COLOR = "#222018";
const CONE_EDGE = "#4A4030";

const CYCLE_FRAMES = 1650; // 55 seconds at 30fps
const VISIBLE_FRAMES = 360; // 12 seconds at 30fps

// Knob labels and which frequency band drives each
const KNOBS = [
  { label: "GAIN", bandKey: "low" as const },
  { label: "BASS", bandKey: "sub" as const },
  { label: "MID", bandKey: "mid" as const },
  { label: "TREBLE", bandKey: "high" as const },
  { label: "VOL", bandKey: "rms" as const },
];

interface SpeakerConeProps {
  cx: number;
  cy: number;
  baseRadius: number;
  vibration: number;
}

const SpeakerCone: React.FC<SpeakerConeProps> = ({ cx, cy, baseRadius, vibration }) => {
  const r = baseRadius + vibration * 2;
  return (
    <g>
      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={r} fill={CONE_COLOR} stroke={CONE_EDGE} strokeWidth={1.5} />
      {/* Inner cone rings */}
      <circle cx={cx} cy={cy} r={r * 0.7} fill="none" stroke={CONE_EDGE} strokeWidth={0.8} opacity={0.6} />
      <circle cx={cx} cy={cy} r={r * 0.45} fill="none" stroke={CONE_EDGE} strokeWidth={0.8} opacity={0.5} />
      {/* Dust cap */}
      <circle cx={cx} cy={cy} r={r * 0.2} fill={CONE_EDGE} opacity={0.8} />
    </g>
  );
};

interface KnobProps {
  cx: number;
  cy: number;
  radius: number;
  value: number; // 0-1
  label: string;
}

const Knob: React.FC<KnobProps> = ({ cx, cy, radius, value, label }) => {
  // Knob rotation: -135deg (min) to +135deg (max)
  const angle = interpolate(value, [0, 1], [-135, 135], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const angleRad = (angle * Math.PI) / 180;
  const indicatorLen = radius * 0.7;
  const endX = cx + Math.sin(angleRad) * indicatorLen;
  const endY = cy - Math.cos(angleRad) * indicatorLen;

  return (
    <g>
      {/* Knob body */}
      <circle cx={cx} cy={cy} r={radius} fill={AMP_DARK} stroke={AMP_GOLD} strokeWidth={0.8} opacity={0.9} />
      {/* Position indicator line */}
      <line
        x1={cx}
        y1={cy}
        x2={endX}
        y2={endY}
        stroke={AMP_GOLD}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={1.5} fill={AMP_GOLD} opacity={0.6} />
      {/* Label */}
      <text
        x={cx}
        y={cy + radius + 10}
        textAnchor="middle"
        fill={AMP_GOLD}
        fontSize={6}
        fontFamily="monospace"
        fontWeight={600}
        opacity={0.7}
      >
        {label}
      </text>
    </g>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const Amplifier: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const fd = frames[idx];

  // Periodic visibility
  const cycleFrame = frame % CYCLE_FRAMES;
  const fadeIn = interpolate(cycleFrame, [0, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(cycleFrame, [VISIBLE_FRAMES - 45, VISIBLE_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const visibilityOpacity = cycleFrame < VISIBLE_FRAMES ? fadeIn * fadeOut : 0;

  if (visibilityOpacity < 0.01) return null;

  // Amp dimensions
  const ampWidth = 180;
  const cabinetHeight = 110;
  const headHeight = 50;
  const totalHeight = headHeight + cabinetHeight * 2 + 8;
  const ampX = 20;
  const ampY = height - totalHeight - 20;

  // Speaker cone vibration from sub-bass
  const subVibration = fd.sub * 3;
  const rng = seeded(frame * 7 + 1977);
  const vibJitter = (rng() - 0.5) * fd.sub * 1.5;

  // Tube glow intensity
  const tubeGlow = interpolate(energy, [0.05, 0.35], [0.4, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Speaker cone positions in a 2x2 grid per cabinet
  const coneRadius = 22;
  const conePositions = [
    { cx: ampWidth * 0.3, cy: cabinetHeight * 0.35 },
    { cx: ampWidth * 0.7, cy: cabinetHeight * 0.35 },
    { cx: ampWidth * 0.3, cy: cabinetHeight * 0.7 },
    { cx: ampWidth * 0.7, cy: cabinetHeight * 0.7 },
  ];

  // Knob values from frequency bands (smoothed with previous frames)
  const knobValues = KNOBS.map((knob) => {
    let sum = 0;
    let count = 0;
    for (let d = 0; d <= 4; d++) {
      const fi = Math.max(0, idx - d);
      const fdata = frames[fi];
      const val = knob.bandKey === "rms" ? fdata.rms : fdata[knob.bandKey];
      sum += val;
      count++;
    }
    return count > 0 ? sum / count : 0;
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={ampWidth + 40}
        height={totalHeight + 40}
        style={{
          position: "absolute",
          left: ampX,
          top: ampY,
          opacity: visibilityOpacity * 0.65,
          filter: `drop-shadow(0 0 8px rgba(255, 140, 0, 0.25))`,
        }}
      >
        <g transform="translate(10, 10)">
          {/* Head unit */}
          <rect x={0} y={0} width={ampWidth} height={headHeight} rx={4} fill={AMP_BROWN} stroke={AMP_GOLD} strokeWidth={1} />

          {/* Brand text */}
          <text
            x={ampWidth / 2}
            y={14}
            textAnchor="middle"
            fill={AMP_GOLD}
            fontSize={9}
            fontFamily="serif"
            fontWeight={700}
            letterSpacing={4}
            opacity={0.8}
          >
            AMPLIFIER
          </text>

          {/* Tubes (3 glowing circles) */}
          {[0.3, 0.5, 0.7].map((pct, ti) => {
            const tubeX = ampWidth * pct;
            const tubeY = 24;
            const flicker = 0.85 + rng() * 0.15;
            return (
              <g key={`tube-${ti}`}>
                <circle
                  cx={tubeX}
                  cy={tubeY}
                  r={6}
                  fill={`rgba(255, 140, 0, ${0.15 * tubeGlow * flicker})`}
                  style={{ filter: `blur(3px)` }}
                />
                <circle
                  cx={tubeX}
                  cy={tubeY}
                  r={4}
                  fill={TUBE_ORANGE}
                  opacity={tubeGlow * flicker * 0.6}
                />
                <circle
                  cx={tubeX}
                  cy={tubeY}
                  r={2}
                  fill="#FFCC66"
                  opacity={tubeGlow * flicker * 0.8}
                />
              </g>
            );
          })}

          {/* Control knobs */}
          {KNOBS.map((knob, ki) => {
            const knobX = 20 + ki * ((ampWidth - 40) / (KNOBS.length - 1));
            return (
              <Knob
                key={knob.label}
                cx={knobX}
                cy={headHeight - 10}
                radius={7}
                value={knobValues[ki]}
                label={knob.label}
              />
            );
          })}

          {/* Upper cabinet */}
          <g transform={`translate(0, ${headHeight + 3})`}>
            <rect x={0} y={0} width={ampWidth} height={cabinetHeight} rx={4} fill={GRILLE_COLOR} stroke={AMP_GOLD} strokeWidth={0.8} />
            {/* Grille cloth lines */}
            {Array.from({ length: 12 }, (_, gi) => (
              <line
                key={`grille-u-${gi}`}
                x1={0}
                y1={gi * (cabinetHeight / 11)}
                x2={ampWidth}
                y2={gi * (cabinetHeight / 11)}
                stroke="rgba(60, 50, 35, 0.3)"
                strokeWidth={0.5}
              />
            ))}
            {conePositions.map((pos, ci) => (
              <SpeakerCone
                key={`upper-${ci}`}
                cx={pos.cx}
                cy={pos.cy}
                baseRadius={coneRadius}
                vibration={subVibration + vibJitter}
              />
            ))}
          </g>

          {/* Lower cabinet */}
          <g transform={`translate(0, ${headHeight + cabinetHeight + 6})`}>
            <rect x={0} y={0} width={ampWidth} height={cabinetHeight} rx={4} fill={GRILLE_COLOR} stroke={AMP_GOLD} strokeWidth={0.8} />
            {Array.from({ length: 12 }, (_, gi) => (
              <line
                key={`grille-l-${gi}`}
                x1={0}
                y1={gi * (cabinetHeight / 11)}
                x2={ampWidth}
                y2={gi * (cabinetHeight / 11)}
                stroke="rgba(60, 50, 35, 0.3)"
                strokeWidth={0.5}
              />
            ))}
            {conePositions.map((pos, ci) => (
              <SpeakerCone
                key={`lower-${ci}`}
                cx={pos.cx}
                cy={pos.cy}
                baseRadius={coneRadius}
                vibration={subVibration * 0.8 + vibJitter}
              />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
};
