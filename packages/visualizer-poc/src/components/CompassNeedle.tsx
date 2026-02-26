/**
 * CompassNeedle -- Large ornate compass centered on screen.
 * Decorative circular bezel with degree markings. North/South needle that
 * swings and oscillates. Cardinal direction letters (N, S, E, W).
 * Needle swing amplitude driven by energy -- wild during loud, settling
 * during quiet. Brass/gold metallic aesthetic.
 * Cycle: 50s, 15s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1500; // 50 seconds at 30fps
const DURATION = 450; // 15 seconds visible

interface Props {
  frames: EnhancedFrameData[];
}

export const CompassNeedle: React.FC<Props> = ({ frames }) => {
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
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const outerR = Math.min(width, height) * 0.22;

  // Brass/gold palette
  const brassLight = "#D4A850";
  const brassDark = "#8B6914";
  const brassHighlight = "#F0D078";
  const ivoryBg = "#FAF0D7";
  const darkText = "#3E2723";

  // Needle swing: amplitude driven by energy
  const swingAmplitude = interpolate(energy, [0.03, 0.35], [8, 85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Multiple sine waves for organic oscillation
  const needleAngle =
    Math.sin(cycleFrame * 0.08) * swingAmplitude * 0.6 +
    Math.sin(cycleFrame * 0.13 + 1.2) * swingAmplitude * 0.3 +
    Math.sin(cycleFrame * 0.03 + 2.5) * swingAmplitude * 0.1;

  const glowSize = interpolate(energy, [0.03, 0.3], [2, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Degree tick marks
  const ticks: React.ReactNode[] = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const isMajor = deg % 30 === 0;
    const isCardinal = deg % 90 === 0;
    const tickInner = isCardinal ? outerR * 0.78 : isMajor ? outerR * 0.83 : outerR * 0.88;
    const tickOuter = outerR * 0.92;
    const rad = (deg - 90) * Math.PI / 180;
    const x1 = Math.cos(rad) * tickInner;
    const y1 = Math.sin(rad) * tickInner;
    const x2 = Math.cos(rad) * tickOuter;
    const y2 = Math.sin(rad) * tickOuter;
    ticks.push(
      <line
        key={`tick-${deg}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={isCardinal ? brassHighlight : brassDark}
        strokeWidth={isCardinal ? 2 : isMajor ? 1.2 : 0.5}
        opacity={isCardinal ? 0.8 : isMajor ? 0.5 : 0.3}
      />
    );

    // Degree numbers every 30
    if (isMajor && !isCardinal) {
      const numR = outerR * 0.72;
      const numX = Math.cos(rad) * numR;
      const numY = Math.sin(rad) * numR;
      ticks.push(
        <text
          key={`deg-${deg}`}
          x={numX}
          y={numY}
          textAnchor="middle"
          dominantBaseline="central"
          fill={brassDark}
          fontSize={8}
          fontFamily="serif"
          opacity={0.4}
        >
          {deg}
        </text>
      );
    }
  }

  // Cardinal directions
  const cardinals = [
    { label: "N", deg: 0, color: "#B71C1C" },
    { label: "E", deg: 90, color: darkText },
    { label: "S", deg: 180, color: darkText },
    { label: "W", deg: 270, color: darkText },
  ];

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${brassLight}) drop-shadow(0 0 ${glowSize * 2}px rgba(212, 168, 80, 0.3))`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Outer bezel rings */}
          <circle cx={0} cy={0} r={outerR * 1.05} fill="none" stroke={brassDark} strokeWidth={3} opacity={0.4} />
          <circle cx={0} cy={0} r={outerR} fill={ivoryBg} opacity={0.08} stroke={brassLight} strokeWidth={2} />
          <circle cx={0} cy={0} r={outerR * 0.95} fill="none" stroke={brassDark} strokeWidth={0.8} opacity={0.25} />

          {/* Decorative bezel pattern (small dots around outer ring) */}
          {Array.from({ length: 72 }).map((_, di) => {
            const a = (di * 5 - 90) * Math.PI / 180;
            const dotR = outerR * 0.97;
            return (
              <circle
                key={`bezel-${di}`}
                cx={Math.cos(a) * dotR}
                cy={Math.sin(a) * dotR}
                r={1}
                fill={brassLight}
                opacity={0.2}
              />
            );
          })}

          {/* Tick marks and degree numbers */}
          {ticks}

          {/* Cardinal direction labels */}
          {cardinals.map((c) => {
            const rad = (c.deg - 90) * Math.PI / 180;
            const labelR = outerR * 0.62;
            return (
              <text
                key={`card-${c.label}`}
                x={Math.cos(rad) * labelR}
                y={Math.sin(rad) * labelR}
                textAnchor="middle"
                dominantBaseline="central"
                fill={c.color}
                fontSize={20}
                fontFamily="serif"
                fontWeight="bold"
                opacity={0.7}
              >
                {c.label}
              </text>
            );
          })}

          {/* Inner decorative ring */}
          <circle cx={0} cy={0} r={outerR * 0.45} fill="none" stroke={brassLight} strokeWidth={1} opacity={0.2} />
          {/* Filigree arcs */}
          {[0, 1, 2, 3].map((qi) => {
            const startDeg = qi * 90 + 20;
            const endDeg = qi * 90 + 70;
            const r = outerR * 0.52;
            const x1 = Math.cos(startDeg * Math.PI / 180) * r;
            const y1 = Math.sin(startDeg * Math.PI / 180) * r;
            const x2 = Math.cos(endDeg * Math.PI / 180) * r;
            const y2 = Math.sin(endDeg * Math.PI / 180) * r;
            return (
              <path
                key={`fili-${qi}`}
                d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                fill="none"
                stroke={brassHighlight}
                strokeWidth={0.6}
                opacity={0.15}
              />
            );
          })}

          {/* Needle (swings based on energy) */}
          <g transform={`rotate(${needleAngle})`}>
            {/* North (red) needle */}
            <polygon
              points={`0,${-outerR * 0.8} ${-5},${-outerR * 0.1} 0,${outerR * 0.08} ${5},${-outerR * 0.1}`}
              fill="#B71C1C"
              opacity={0.75}
              stroke="#8B0000"
              strokeWidth={0.5}
            />
            {/* South (brass) needle */}
            <polygon
              points={`0,${outerR * 0.8} ${-5},${outerR * 0.1} 0,${-outerR * 0.08} ${5},${outerR * 0.1}`}
              fill={brassLight}
              opacity={0.55}
              stroke={brassDark}
              strokeWidth={0.5}
            />
            {/* Needle highlight (thin bright line on north half) */}
            <line
              x1={0}
              y1={-outerR * 0.75}
              x2={0}
              y2={-outerR * 0.15}
              stroke="#FF5252"
              strokeWidth={1}
              opacity={0.3}
            />
          </g>

          {/* Center pivot */}
          <circle cx={0} cy={0} r={7} fill={brassLight} opacity={0.8} stroke={brassDark} strokeWidth={1} />
          <circle cx={0} cy={0} r={3} fill={brassHighlight} opacity={0.6} />
        </g>
      </svg>
    </div>
  );
};
