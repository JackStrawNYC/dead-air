/**
 * Chronograph — Stopwatch face with sweep second hand, plus three subdials
 * showing energy, bass, and highs. Outer bezel with tachymeter scale.
 * Sweep hand rotates continuously, subdials driven by real-time audio data.
 * Silver/steel aesthetic with red accents. Cycle: 55s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1650; // 55s at 30fps
const DURATION = 540; // 18s visible

interface Props {
  frames: EnhancedFrameData[];
}

export const Chronograph: React.FC<Props> = ({ frames }) => {
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

  // Position: center-right
  const cx = width * 0.75;
  const cy = height * 0.45;
  const mainR = Math.min(width, height) * 0.18;

  // Colors
  const steelLight = "#C8C8C8";
  const steelDark = "#707070";
  const faceColor = "#F5F5F0";
  const redAccent = "#CC2222";
  const darkText = "#222222";

  // Main sweep second hand: 6 degrees per frame (1 revolution per second at 60fps... slowed)
  const sweepAngle = frame * 3.6; // 1 revolution per 100 frames (~3.3s)

  // Subdial values from audio data
  const currentEnergy = frames[idx]?.rms ?? 0;
  const currentBass = (frames[idx]?.sub ?? 0) * 0.5 + (frames[idx]?.low ?? 0) * 0.5;
  const currentHighs = frames[idx]?.high ?? 0;

  // Subdial hand angles (0-360)
  const energyAngle = currentEnergy * 360;
  const bassAngle = currentBass * 360;
  const highsAngle = currentHighs * 360;

  // Subdial positions
  const subR = mainR * 0.2;
  const subDialEnergy = { x: 0, y: -mainR * 0.4 }; // top
  const subDialBass = { x: -mainR * 0.35, y: mainR * 0.25 }; // bottom-left
  const subDialHighs = { x: mainR * 0.35, y: mainR * 0.25 }; // bottom-right

  const glowSize = interpolate(energy, [0.03, 0.3], [1, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Helper: draw a subdial
  const renderSubdial = (
    sdx: number,
    sdy: number,
    angle: number,
    label: string,
    key: string,
  ) => (
    <g key={key}>
      <circle cx={sdx} cy={sdy} r={subR} fill="none" stroke={steelDark} strokeWidth={1} opacity={0.5} />
      {/* Subdial tick marks */}
      {Array.from({ length: 8 }).map((_, ti) => {
        const a = ((ti * 45 - 90) * Math.PI) / 180;
        return (
          <line
            key={`${key}-t${ti}`}
            x1={sdx + Math.cos(a) * subR * 0.75}
            y1={sdy + Math.sin(a) * subR * 0.75}
            x2={sdx + Math.cos(a) * subR * 0.92}
            y2={sdy + Math.sin(a) * subR * 0.92}
            stroke={steelDark}
            strokeWidth={0.8}
            opacity={0.4}
          />
        );
      })}
      {/* Subdial hand */}
      <line
        x1={sdx}
        y1={sdy}
        x2={sdx + Math.cos(((angle - 90) * Math.PI) / 180) * subR * 0.7}
        y2={sdy + Math.sin(((angle - 90) * Math.PI) / 180) * subR * 0.7}
        stroke={redAccent}
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={0.7}
      />
      <circle cx={sdx} cy={sdy} r={2} fill={steelDark} opacity={0.6} />
      {/* Label */}
      <text
        x={sdx}
        y={sdy + subR + 8}
        textAnchor="middle"
        fill={darkText}
        fontSize={6}
        fontFamily="sans-serif"
        opacity={0.3}
      >
        {label}
      </text>
    </g>
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px rgba(200, 200, 200, 0.3))`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Outer bezel */}
          <circle cx={0} cy={0} r={mainR * 1.08} fill="none" stroke={steelLight} strokeWidth={4} opacity={0.4} />
          <circle cx={0} cy={0} r={mainR * 1.03} fill="none" stroke={steelDark} strokeWidth={1.5} opacity={0.3} />

          {/* Tachymeter markings on outer bezel */}
          {[60, 70, 80, 90, 100, 120, 150, 200, 300, 500].map((val, ti) => {
            const a = ((ti * 32 - 90) * Math.PI) / 180;
            const r1 = mainR * 1.04;
            return (
              <text
                key={`tachy-${val}`}
                x={Math.cos(a) * r1}
                y={Math.sin(a) * r1}
                textAnchor="middle"
                dominantBaseline="central"
                fill={steelDark}
                fontSize={5}
                fontFamily="sans-serif"
                opacity={0.25}
              >
                {val}
              </text>
            );
          })}

          {/* Main face */}
          <circle cx={0} cy={0} r={mainR} fill={faceColor} opacity={0.08} stroke={steelLight} strokeWidth={1.5} />

          {/* Second ticks (60) */}
          {Array.from({ length: 60 }).map((_, ti) => {
            const isMajor = ti % 5 === 0;
            const a = ((ti * 6 - 90) * Math.PI) / 180;
            const r1 = isMajor ? mainR * 0.82 : mainR * 0.88;
            const r2 = mainR * 0.94;
            return (
              <line
                key={`st-${ti}`}
                x1={Math.cos(a) * r1}
                y1={Math.sin(a) * r1}
                x2={Math.cos(a) * r2}
                y2={Math.sin(a) * r2}
                stroke={isMajor ? darkText : steelDark}
                strokeWidth={isMajor ? 1.8 : 0.6}
                opacity={isMajor ? 0.6 : 0.3}
              />
            );
          })}

          {/* Hour numbers */}
          {[12, 3, 6, 9].map((num) => {
            const a = ((num * 30 - 90) * Math.PI) / 180;
            const r1 = mainR * 0.72;
            return (
              <text
                key={`num-${num}`}
                x={Math.cos(a) * r1}
                y={Math.sin(a) * r1}
                textAnchor="middle"
                dominantBaseline="central"
                fill={darkText}
                fontSize={mainR * 0.1}
                fontFamily="sans-serif"
                fontWeight="bold"
                opacity={0.5}
              >
                {num}
              </text>
            );
          })}

          {/* Subdials */}
          {renderSubdial(subDialEnergy.x, subDialEnergy.y, energyAngle, "ENERGY", "sd-energy")}
          {renderSubdial(subDialBass.x, subDialBass.y, bassAngle, "BASS", "sd-bass")}
          {renderSubdial(subDialHighs.x, subDialHighs.y, highsAngle, "HIGHS", "sd-highs")}

          {/* Main sweep second hand */}
          <line
            x1={0}
            y1={mainR * 0.08}
            x2={Math.cos(((sweepAngle - 90) * Math.PI) / 180) * mainR * 0.88}
            y2={Math.sin(((sweepAngle - 90) * Math.PI) / 180) * mainR * 0.88}
            stroke={redAccent}
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={0.8}
          />

          {/* Counterweight on sweep hand */}
          <line
            x1={0}
            y1={0}
            x2={Math.cos(((sweepAngle + 90) * Math.PI) / 180) * mainR * 0.12}
            y2={Math.sin(((sweepAngle + 90) * Math.PI) / 180) * mainR * 0.12}
            stroke={redAccent}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.7}
          />

          {/* Center hub */}
          <circle cx={0} cy={0} r={4} fill={steelLight} opacity={0.7} stroke={steelDark} strokeWidth={1} />
          <circle cx={0} cy={0} r={2} fill={redAccent} opacity={0.6} />

          {/* Crown (button at top) */}
          <rect x={-4} y={-mainR * 1.08 - 10} width={8} height={10} rx={2} fill={steelLight} opacity={0.4} stroke={steelDark} strokeWidth={0.8} />

          {/* Side pushers */}
          <rect x={mainR * 0.95} y={-mainR * 0.3} width={10} height={6} rx={1.5} fill={steelLight} opacity={0.3} />
          <rect x={mainR * 0.95} y={mainR * 0.24} width={10} height={6} rx={1.5} fill={steelLight} opacity={0.3} />
        </g>
      </svg>
    </div>
  );
};
