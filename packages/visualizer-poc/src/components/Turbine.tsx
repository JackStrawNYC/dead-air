/**
 * Turbine — Spinning turbine blades viewed head-on.
 * 8 curved blades radiate from a central hub. RPM scales with energy.
 * Outer ring housing with rivets. Metallic blue-grey palette with
 * cyan neon glow that intensifies with energy. Motion blur via
 * opacity trails. Positioned upper-right. Cycle: 45s on, 45s off (90s = 2700f).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2700; // 90s at 30fps
const DURATION = 1350; // 45s visible
const NUM_BLADES = 8;
const RIVET_COUNT = 16;

interface Props {
  frames: EnhancedFrameData[];
}

export const Turbine: React.FC<Props> = ({ frames }) => {
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

  // Pre-compute rivet positions
  const rivets = React.useMemo(() => {
    const rng = seeded(90210);
    return Array.from({ length: RIVET_COUNT }, (_, i) => {
      const angle = (i / RIVET_COUNT) * Math.PI * 2;
      return {
        angle,
        size: 2.5 + rng() * 1.5,
        brightness: 0.3 + rng() * 0.3,
      };
    });
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
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Turbine geometry
  const cx = width * 0.82;
  const cy = height * 0.22;
  const outerR = 90;
  const hubR = 18;
  const bladeInnerR = 22;
  const bladeOuterR = 78;

  // Rotation: accumulate angle based on energy-driven RPM
  const rpm = 0.3 + energy * 4;
  const rotAngle = frame * rpm * 0.06; // radians

  // Blade curve: each blade is a slightly curved path
  const bladeElements = Array.from({ length: NUM_BLADES }, (_, bi) => {
    const baseAngle = rotAngle + (bi / NUM_BLADES) * Math.PI * 2;
    const curveBias = 0.15; // how much the blade curves

    // Blade as a quadratic bezier path
    const innerX = Math.cos(baseAngle) * bladeInnerR;
    const innerY = Math.sin(baseAngle) * bladeInnerR;
    const outerX = Math.cos(baseAngle) * bladeOuterR;
    const outerY = Math.sin(baseAngle) * bladeOuterR;

    // Control point offset perpendicular to blade direction
    const midR = (bladeInnerR + bladeOuterR) / 2;
    const perpAngle = baseAngle + Math.PI / 2;
    const ctrlX = Math.cos(baseAngle) * midR + Math.cos(perpAngle) * midR * curveBias;
    const ctrlY = Math.sin(baseAngle) * midR + Math.sin(perpAngle) * midR * curveBias;

    // Blade edge (slightly offset for width)
    const edgeAngle = baseAngle + 0.04;
    const innerX2 = Math.cos(edgeAngle) * bladeInnerR;
    const innerY2 = Math.sin(edgeAngle) * bladeInnerR;
    const outerX2 = Math.cos(edgeAngle) * bladeOuterR;
    const outerY2 = Math.sin(edgeAngle) * bladeOuterR;
    const ctrlX2 = Math.cos(edgeAngle) * midR + Math.cos(perpAngle) * midR * curveBias;
    const ctrlY2 = Math.sin(edgeAngle) * midR + Math.sin(perpAngle) * midR * curveBias;

    const d = [
      `M ${innerX} ${innerY}`,
      `Q ${ctrlX} ${ctrlY} ${outerX} ${outerY}`,
      `L ${outerX2} ${outerY2}`,
      `Q ${ctrlX2} ${ctrlY2} ${innerX2} ${innerY2}`,
      "Z",
    ].join(" ");

    return (
      <path
        key={`blade-${bi}`}
        d={d}
        fill="#607D8B"
        stroke="#00BCD4"
        strokeWidth={0.8}
        opacity={0.65}
      />
    );
  });

  const glowIntensity = interpolate(energy, [0.03, 0.3], [2, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Motion blur trail (ghost of previous position)
  const trailOpacity = interpolate(energy, [0.1, 0.4], [0, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const trailAngleOffset = rpm * 0.06 * 2; // 2 frames behind

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity, willChange: "opacity" }}>
        <defs>
          <filter id="turbine-glow">
            <feGaussianBlur stdDeviation={glowIntensity} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`translate(${cx}, ${cy})`}>
          {/* Outer housing ring */}
          <circle
            cx={0}
            cy={0}
            r={outerR}
            fill="none"
            stroke="#455A64"
            strokeWidth={6}
            opacity={0.5}
          />
          <circle
            cx={0}
            cy={0}
            r={outerR - 4}
            fill="none"
            stroke="#00BCD4"
            strokeWidth={1}
            opacity={0.3}
          />

          {/* Rivets on housing */}
          {rivets.map((rivet, ri) => (
            <circle
              key={`rivet-${ri}`}
              cx={Math.cos(rivet.angle) * (outerR + 1)}
              cy={Math.sin(rivet.angle) * (outerR + 1)}
              r={rivet.size}
              fill="#78909C"
              opacity={rivet.brightness}
            />
          ))}

          {/* Motion blur trail */}
          {trailOpacity > 0.01 && (
            <g opacity={trailOpacity} transform={`rotate(${(-trailAngleOffset * 180) / Math.PI})`}>
              {bladeElements}
            </g>
          )}

          {/* Blades */}
          <g filter="url(#turbine-glow)">
            {bladeElements}
          </g>

          {/* Central hub */}
          <circle cx={0} cy={0} r={hubR} fill="#37474F" stroke="#00BCD4" strokeWidth={1.5} opacity={0.7} />
          <circle cx={0} cy={0} r={hubR * 0.4} fill="#00BCD4" opacity={0.3 + energy * 0.3} />

          {/* Inner ring detail */}
          <circle
            cx={0}
            cy={0}
            r={bladeInnerR - 2}
            fill="none"
            stroke="#546E7A"
            strokeWidth={1.5}
            opacity={0.4}
          />
        </g>
      </svg>
    </div>
  );
};
