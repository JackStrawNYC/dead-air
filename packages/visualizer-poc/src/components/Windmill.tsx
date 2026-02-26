/**
 * Windmill — Dutch windmill silhouette with 4 spinning blades. Blade rotation
 * speed tied to energy. Windmill body is a tapered structure with a cap.
 * Blades have lattice detail. Positioned on left side of screen. Warm amber
 * window glow. Rolling hills silhouette at base.
 * Cycle: 60s on / off, 15s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1800; // 60s at 30fps
const DURATION = 450; // 15s visible
const BLADE_COUNT = 4;

const BODY_COLOR = "#3D3228";
const CAP_COLOR = "#2E2620";
const BLADE_COLOR = "#4A3F34";
const LATTICE_COLOR = "#5A4F44";
const WINDOW_GLOW = "#FFA726";
const HILL_COLOR = "#1A1812";

interface Props {
  frames: EnhancedFrameData[];
}

export const Windmill: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Pre-generate hill shape
  const hillPoints = React.useMemo(() => {
    const pts: string[] = [];
    const segments = 20;
    for (let i = 0; i <= segments; i++) {
      const x = (i / segments) * 100;
      const y = 92 - Math.sin((i / segments) * Math.PI) * 6
        - Math.sin((i / segments) * Math.PI * 3) * 2;
      pts.push(`${x},${y}`);
    }
    pts.push("100,100", "0,100");
    return pts.join(" ");
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
  const baseOpacity = interpolate(energy, [0.02, 0.25], [0.22, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;
  if (masterOpacity < 0.01) return null;

  // Windmill position
  const millX = width * 0.15;
  const millBaseY = height * 0.88;
  const millTopY = height * 0.32;
  const bodyBottomW = 70;
  const bodyTopW = 40;

  // Hub position (where blades attach)
  const hubX = millX;
  const hubY = millTopY + 20;

  // Blade rotation driven by energy
  const rotSpeed = 0.3 + energy * 3.0;
  const bladeAngle = (frame * rotSpeed) % 360;

  // Blade dimensions
  const bladeLength = Math.min(width, height) * 0.22;
  const bladeWidth = 18;

  const glowSize = interpolate(energy, [0.02, 0.3], [2, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          opacity: masterOpacity,
          willChange: "opacity",
        }}
      >
        <defs>
          <radialGradient id="windmill-window-glow">
            <stop offset="0%" stopColor={WINDOW_GLOW} stopOpacity={0.7} />
            <stop offset="100%" stopColor={WINDOW_GLOW} stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Rolling hills */}
        <polygon
          points={hillPoints.split(" ").map(p => {
            const [px, py] = p.split(",");
            return `${(parseFloat(px) / 100) * width},${(parseFloat(py) / 100) * height}`;
          }).join(" ")}
          fill={HILL_COLOR}
          opacity={0.5}
        />

        {/* Windmill body */}
        <polygon
          points={`${millX - bodyBottomW / 2},${millBaseY} ${millX + bodyBottomW / 2},${millBaseY} ${millX + bodyTopW / 2},${millTopY} ${millX - bodyTopW / 2},${millTopY}`}
          fill={BODY_COLOR}
          opacity={0.8}
        />

        {/* Cap (top of mill) */}
        <path
          d={`M ${millX - bodyTopW / 2 - 5} ${millTopY} Q ${millX} ${millTopY - 28} ${millX + bodyTopW / 2 + 5} ${millTopY}`}
          fill={CAP_COLOR}
          opacity={0.85}
        />

        {/* Door */}
        <path
          d={`M ${millX - 12} ${millBaseY} L ${millX - 12} ${millBaseY - 30} Q ${millX} ${millBaseY - 38} ${millX + 12} ${millBaseY - 30} L ${millX + 12} ${millBaseY} Z`}
          fill="#1A1510"
          opacity={0.6}
        />

        {/* Windows */}
        {[0.3, 0.55].map((t, wi) => {
          const wy = millTopY + (millBaseY - millTopY) * t;
          const wGlow = 0.3 + energy * 0.5;
          return (
            <g key={`win-${wi}`}>
              <circle cx={millX} cy={wy} r={20} fill="url(#windmill-window-glow)" opacity={wGlow * 0.4} />
              <ellipse cx={millX} cy={wy} rx={6} ry={9} fill={WINDOW_GLOW} opacity={wGlow} />
            </g>
          );
        })}

        {/* Spinning blades */}
        <g transform={`translate(${hubX}, ${hubY}) rotate(${bladeAngle})`}>
          {Array.from({ length: BLADE_COUNT }).map((_, bi) => {
            const angle = (bi / BLADE_COUNT) * 360;
            return (
              <g key={`blade-${bi}`} transform={`rotate(${angle})`}>
                {/* Main blade arm */}
                <rect
                  x={-bladeWidth / 2}
                  y={-bladeLength}
                  width={bladeWidth}
                  height={bladeLength}
                  fill={BLADE_COLOR}
                  opacity={0.75}
                  rx={2}
                />
                {/* Lattice cross bars */}
                {[0.2, 0.4, 0.6, 0.8].map((t, li) => (
                  <line
                    key={`lat-${bi}-${li}`}
                    x1={-bladeWidth / 2 + 2}
                    y1={-bladeLength * t}
                    x2={bladeWidth / 2 - 2}
                    y2={-bladeLength * t}
                    stroke={LATTICE_COLOR}
                    strokeWidth={1}
                    opacity={0.5}
                  />
                ))}
                {/* Diagonal lattice */}
                <line
                  x1={-bladeWidth / 2 + 2}
                  y1={0}
                  x2={bladeWidth / 2 - 2}
                  y2={-bladeLength * 0.5}
                  stroke={LATTICE_COLOR}
                  strokeWidth={0.8}
                  opacity={0.35}
                />
                <line
                  x1={bladeWidth / 2 - 2}
                  y1={0}
                  x2={-bladeWidth / 2 + 2}
                  y2={-bladeLength * 0.5}
                  stroke={LATTICE_COLOR}
                  strokeWidth={0.8}
                  opacity={0.35}
                />
              </g>
            );
          })}
          {/* Hub center */}
          <circle cx={0} cy={0} r={8} fill={CAP_COLOR} opacity={0.9} />
          <circle
            cx={0}
            cy={0}
            r={10}
            fill="none"
            stroke={WINDOW_GLOW}
            strokeWidth={1}
            opacity={0.2 + energy * 0.3}
            style={{ filter: `drop-shadow(0 0 ${glowSize}px ${WINDOW_GLOW})` }}
          />
        </g>
      </svg>
    </div>
  );
};
