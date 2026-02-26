/**
 * PocketWatch — Ornate pocket watch with chain, that opens and closes
 * based on energy thresholds. When open, reveals a detailed watch face.
 * Chain drapes across the composition. Gold/antique aesthetic.
 * Lid swings open when energy exceeds threshold, closes when energy drops.
 * Cycle: 65s, 20s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1950; // 65s at 30fps
const DURATION = 600; // 20s visible
const OPEN_THRESHOLD = 0.15;

interface ChainLink {
  angle: number;
  size: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PocketWatch: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate chain link variations
  const chainLinks = React.useMemo(() => {
    const rng = seeded(44556677);
    const links: ChainLink[] = [];
    for (let i = 0; i < 20; i++) {
      links.push({
        angle: (rng() - 0.5) * 20,
        size: 3 + rng() * 2,
      });
    }
    return links;
  }, []);

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

  // Position: center
  const cx = width * 0.5;
  const cy = height * 0.5;
  const watchR = Math.min(width, height) * 0.15;

  // Colors
  const goldColor = "#D4A850";
  const goldDark = "#8B6914";
  const goldLight = "#F0D078";
  const faceIvory = "#FAF0D7";
  const darkHand = "#3E2723";

  // Lid open/close: smoothly interpolated from energy threshold
  const lidTarget = energy > OPEN_THRESHOLD ? 1 : 0;
  // We simulate smoothing by blending with a sine of energy level
  const lidOpenness = interpolate(energy, [0.05, OPEN_THRESHOLD, 0.3], [0, 0.3, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lidAngle = lidOpenness * -160; // degrees (open = rotated back)

  // Watch hands
  const hourAngle = frame * 0.012;
  const minuteAngle = frame * 0.15;
  const secondAngle = frame * 2.0;

  const glowSize = interpolate(energy, [0.03, 0.3], [2, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Chain catenary: 15 links curving from top of watch to upper-right
  const chainStartX = 0;
  const chainStartY = -watchR - 8;
  const chainEndX = watchR * 2.5;
  const chainEndY = -watchR * 2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px rgba(212, 168, 80, 0.4))`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Chain */}
          {chainLinks.slice(0, 15).map((link, li) => {
            const t = li / 14;
            // Catenary-like curve
            const lx = chainStartX + (chainEndX - chainStartX) * t;
            const sag = Math.sin(t * Math.PI) * watchR * 0.5;
            const ly = chainStartY + (chainEndY - chainStartY) * t + sag;
            return (
              <ellipse
                key={`chain-${li}`}
                cx={lx}
                cy={ly}
                rx={link.size}
                ry={link.size * 0.6}
                fill="none"
                stroke={goldDark}
                strokeWidth={1.5}
                opacity={0.35}
                transform={`rotate(${link.angle + (li % 2) * 90}, ${lx}, ${ly})`}
              />
            );
          })}

          {/* Crown (winding knob at top) */}
          <rect x={-5} y={-watchR - 14} width={10} height={8} rx={3} fill={goldColor} opacity={0.5} stroke={goldDark} strokeWidth={1} />

          {/* Outer case */}
          <circle cx={0} cy={0} r={watchR * 1.05} fill="none" stroke={goldColor} strokeWidth={4} opacity={0.5} />
          <circle cx={0} cy={0} r={watchR * 1.01} fill="none" stroke={goldDark} strokeWidth={1} opacity={0.3} />

          {/* Watch face (visible when lid is open) */}
          <circle cx={0} cy={0} r={watchR} fill={faceIvory} opacity={0.08 + lidOpenness * 0.05} stroke={goldColor} strokeWidth={1.5} />

          {/* Face detail (fades in as lid opens) */}
          <g opacity={0.3 + lidOpenness * 0.5}>
            {/* Hour markers */}
            {Array.from({ length: 12 }).map((_, hi) => {
              const a = ((hi * 30 - 90) * Math.PI) / 180;
              const r1 = watchR * 0.82;
              const r2 = watchR * 0.92;
              const isMajor = hi % 3 === 0;
              return (
                <g key={`hm-${hi}`}>
                  <line
                    x1={Math.cos(a) * r1}
                    y1={Math.sin(a) * r1}
                    x2={Math.cos(a) * r2}
                    y2={Math.sin(a) * r2}
                    stroke={darkHand}
                    strokeWidth={isMajor ? 2 : 1}
                    opacity={isMajor ? 0.6 : 0.3}
                  />
                  {isMajor && (
                    <text
                      x={Math.cos(a) * watchR * 0.72}
                      y={Math.sin(a) * watchR * 0.72}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={darkHand}
                      fontSize={watchR * 0.1}
                      fontFamily="serif"
                      opacity={0.5}
                    >
                      {hi === 0 ? "12" : hi}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Hour hand */}
            <line
              x1={0} y1={0}
              x2={Math.cos(((hourAngle - 90) * Math.PI) / 180) * watchR * 0.45}
              y2={Math.sin(((hourAngle - 90) * Math.PI) / 180) * watchR * 0.45}
              stroke={darkHand} strokeWidth={3} strokeLinecap="round" opacity={0.7}
            />
            {/* Minute hand */}
            <line
              x1={0} y1={0}
              x2={Math.cos(((minuteAngle - 90) * Math.PI) / 180) * watchR * 0.65}
              y2={Math.sin(((minuteAngle - 90) * Math.PI) / 180) * watchR * 0.65}
              stroke={darkHand} strokeWidth={2} strokeLinecap="round" opacity={0.6}
            />
            {/* Second hand */}
            <line
              x1={0} y1={0}
              x2={Math.cos(((secondAngle - 90) * Math.PI) / 180) * watchR * 0.78}
              y2={Math.sin(((secondAngle - 90) * Math.PI) / 180) * watchR * 0.78}
              stroke="#AA3333" strokeWidth={0.8} strokeLinecap="round" opacity={0.6}
            />
            <circle cx={0} cy={0} r={3} fill={goldColor} opacity={0.6} />
          </g>

          {/* Lid (hinged at top, swings open) */}
          <g transform={`rotate(${lidAngle}, 0, ${-watchR})`}>
            <circle
              cx={0}
              cy={0}
              r={watchR * 0.98}
              fill={goldColor}
              opacity={0.15 + (1 - lidOpenness) * 0.2}
              stroke={goldDark}
              strokeWidth={1.5}
            />
            {/* Engraved decoration on lid */}
            <circle cx={0} cy={0} r={watchR * 0.6} fill="none" stroke={goldLight} strokeWidth={0.8} opacity={0.2 * (1 - lidOpenness)} />
            <circle cx={0} cy={0} r={watchR * 0.3} fill="none" stroke={goldLight} strokeWidth={0.6} opacity={0.15 * (1 - lidOpenness)} />
            {/* Ornamental cross pattern */}
            {[0, 45, 90, 135].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              return (
                <line
                  key={`orn-${deg}`}
                  x1={Math.cos(rad) * watchR * 0.25}
                  y1={Math.sin(rad) * watchR * 0.25}
                  x2={Math.cos(rad) * watchR * 0.55}
                  y2={Math.sin(rad) * watchR * 0.55}
                  stroke={goldLight}
                  strokeWidth={0.6}
                  opacity={0.12 * (1 - lidOpenness)}
                />
              );
            })}
          </g>

          {/* Hinge at top */}
          <circle cx={0} cy={-watchR} r={4} fill={goldColor} opacity={0.5} stroke={goldDark} strokeWidth={1} />
        </g>
      </svg>
    </div>
  );
};
