/**
 * ArtNouveau -- Flowing organic Art Nouveau curves with floral motifs.
 * 4-6 sinuous whiplash curves flowing from corners with lily/iris flower
 * shapes at curve endpoints. Curves have varying stroke width (thick-thin-thick).
 * Gold/copper on dark with emerald accents. Energy drives curve undulation.
 * Cycle: 65s, 20s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1950;    // 65 seconds at 30fps
const DURATION = 600;  // 20 seconds visible

// Gold/copper/emerald palette
const COLORS = {
  gold: "#D4A017",
  copper: "#B87333",
  paleGold: "#F0D080",
  emerald: "#2E8B57",
  darkEmerald: "#1B5E3A",
};

interface CurveDef {
  /** Starting corner: 0=TL, 1=TR, 2=BR, 3=BL */
  corner: number;
  /** Control point offsets as fraction of screen (seeded) */
  cp1x: number;
  cp1y: number;
  cp2x: number;
  cp2y: number;
  /** End point as fraction of screen */
  endX: number;
  endY: number;
  /** Undulation frequency */
  freq: number;
  /** Phase offset */
  phase: number;
  /** Color key */
  color: keyof typeof COLORS;
  /** Whether to draw a flower at the end */
  hasFlower: boolean;
  /** Flower petal count */
  petalCount: number;
}

function generateCurves(seed: number): CurveDef[] {
  const rng = seeded(seed);
  const count = 5; // 5 curves
  const curves: CurveDef[] = [];

  for (let i = 0; i < count; i++) {
    const corner = i % 4;
    const colorKeys: (keyof typeof COLORS)[] = ["gold", "copper", "paleGold", "emerald", "copper"];
    curves.push({
      corner,
      cp1x: 0.2 + rng() * 0.3,
      cp1y: 0.2 + rng() * 0.3,
      cp2x: 0.4 + rng() * 0.3,
      cp2y: 0.3 + rng() * 0.4,
      endX: 0.3 + rng() * 0.4,
      endY: 0.3 + rng() * 0.4,
      freq: 0.03 + rng() * 0.04,
      phase: rng() * Math.PI * 2,
      color: colorKeys[i],
      hasFlower: i < 4, // first 4 get flowers
      petalCount: 5 + Math.floor(rng() * 3), // 5-7 petals
    });
  }

  return curves;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const ArtNouveau: React.FC<Props> = ({ frames }) => {
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

  const curves = React.useMemo(() => generateCurves(77508), []);

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
  const opacity =
    Math.min(fadeIn, fadeOut) *
    interpolate(energy, [0.03, 0.25], [0.2, 0.55], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  if (opacity < 0.01) return null;

  // Energy drives undulation amplitude
  const undulationAmp = interpolate(energy, [0.03, 0.3], [8, 35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Draw progress for line-drawing animation
  const drawProgress = interpolate(progress, [0.02, 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  function getCornerPos(corner: number): [number, number] {
    switch (corner) {
      case 0: return [0, 0];              // TL
      case 1: return [width, 0];           // TR
      case 2: return [width, height];      // BR
      case 3: return [0, height];           // BL
      default: return [0, 0];
    }
  }

  function renderFlower(cx: number, cy: number, petalCount: number, color: string, size: number) {
    const petals: React.ReactNode[] = [];
    for (let p = 0; p < petalCount; p++) {
      const angle = (p / petalCount) * Math.PI * 2 + frame * 0.005;
      const px = cx + Math.cos(angle) * size * 0.6;
      const py = cy + Math.sin(angle) * size * 0.6;
      petals.push(
        <ellipse
          key={`petal-${p}`}
          cx={px}
          cy={py}
          rx={size * 0.45}
          ry={size * 0.2}
          transform={`rotate(${(angle * 180) / Math.PI}, ${px}, ${py})`}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0.7}
        />,
      );
    }
    // Center pistil
    petals.push(
      <circle
        key="pistil"
        cx={cx}
        cy={cy}
        r={size * 0.12}
        fill={COLORS.emerald}
        opacity={0.6}
      />,
    );
    return petals;
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 6px ${COLORS.gold}44) drop-shadow(0 0 15px ${COLORS.copper}33)`,
        }}
      >
        <defs>
          <linearGradient id="an-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={COLORS.gold} />
            <stop offset="50%" stopColor={COLORS.paleGold} />
            <stop offset="100%" stopColor={COLORS.copper} />
          </linearGradient>
        </defs>

        {curves.map((curve, ci) => {
          const [sx, sy] = getCornerPos(curve.corner);

          // Undulate control points with energy
          const t = frame * curve.freq + curve.phase;
          const und1x = Math.sin(t) * undulationAmp;
          const und1y = Math.cos(t * 1.3) * undulationAmp;
          const und2x = Math.sin(t * 0.7 + 1) * undulationAmp * 0.8;
          const und2y = Math.cos(t * 0.9 + 2) * undulationAmp * 0.8;

          const cp1x = curve.cp1x * width + und1x;
          const cp1y = curve.cp1y * height + und1y;
          const cp2x = curve.cp2x * width + und2x;
          const cp2y = curve.cp2y * height + und2y;
          const ex = curve.endX * width;
          const ey = curve.endY * height;

          const pathD = `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`;

          // Approximate path length for dash animation
          const dx = ex - sx;
          const dy = ey - sy;
          const approxLen = Math.sqrt(dx * dx + dy * dy) * 1.5;
          const dashLen = approxLen * drawProgress;

          const color = COLORS[curve.color];
          const flowerSize = 20 + energy * 30;

          return (
            <g key={`curve-${ci}`}>
              {/* Main whiplash curve with varying stroke width */}
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={2.5 + Math.sin(frame * 0.02 + ci) * 1}
                strokeDasharray={`${dashLen} ${approxLen}`}
                strokeLinecap="round"
                opacity={0.7}
              />
              {/* Thinner parallel for depth */}
              <path
                d={pathD}
                fill="none"
                stroke={COLORS.paleGold}
                strokeWidth={0.8}
                strokeDasharray={`${dashLen} ${approxLen}`}
                strokeLinecap="round"
                opacity={0.3}
              />

              {/* Flower at endpoint (visible after draw reaches it) */}
              {curve.hasFlower && drawProgress > 0.85 && (
                <g opacity={interpolate(drawProgress, [0.85, 1], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })}>
                  {renderFlower(ex, ey, curve.petalCount, color, flowerSize)}
                </g>
              )}

              {/* Small leaf shapes along the curve */}
              {drawProgress > 0.3 && (
                <>
                  {[0.25, 0.5, 0.75].map((pos, li) => {
                    if (pos > drawProgress) return null;
                    // Approximate point on cubic bezier at t=pos
                    const tt = pos;
                    const mt = 1 - tt;
                    const lx = mt * mt * mt * sx + 3 * mt * mt * tt * cp1x + 3 * mt * tt * tt * cp2x + tt * tt * tt * ex;
                    const ly = mt * mt * mt * sy + 3 * mt * mt * tt * cp1y + 3 * mt * tt * tt * cp2y + tt * tt * tt * ey;
                    const leafAngle = Math.atan2(ey - sy, ex - sx) + (li % 2 === 0 ? 0.5 : -0.5);
                    const leafSize = 8 + energy * 12;
                    return (
                      <ellipse
                        key={`leaf-${ci}-${li}`}
                        cx={lx}
                        cy={ly}
                        rx={leafSize}
                        ry={leafSize * 0.35}
                        transform={`rotate(${(leafAngle * 180) / Math.PI}, ${lx}, ${ly})`}
                        fill="none"
                        stroke={COLORS.darkEmerald}
                        strokeWidth={1.2}
                        opacity={0.45}
                      />
                    );
                  })}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
