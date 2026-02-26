/**
 * CoffeeSwirl -- Top-down view of coffee in a cup. Circular cup rim.
 * Cream/milk swirl pattern spiraling in the dark coffee. Swirl follows
 * logarithmic spiral path. Steam wisps rise from surface (small curved lines).
 * Warm brown/cream palette. Swirl speed driven by energy.
 * Hypnotic, cozy. Cycle: 45s, 14s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useShowContext } from "../data/ShowContext";

const CYCLE = 1350; // 45 seconds at 30fps
const DURATION = 420; // 14 seconds visible

interface SteamWisp {
  startAngle: number;
  radiusOffset: number;
  height: number;
  curvature: number;
  phase: number;
  speed: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CoffeeSwirl: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate steam wisps
  const wisps = React.useMemo(() => {
    const rng = seeded(ctx?.showSeed ?? 77050806);
    const w: SteamWisp[] = [];
    for (let i = 0; i < 8; i++) {
      w.push({
        startAngle: rng() * Math.PI * 2,
        radiusOffset: 0.3 + rng() * 0.5,
        height: 30 + rng() * 50,
        curvature: (rng() - 0.5) * 30,
        phase: rng() * Math.PI * 2,
        speed: 0.5 + rng() * 1,
      });
    }
    return w;
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
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.3, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const cupRadius = Math.min(width, height) * 0.18;

  // Coffee colors
  const coffeeDark = "#2C1810";
  const coffeeMid = "#4A2C20";
  const cream = "#F5DEB3";
  const creamLight = "#FFF8DC";
  const rimColor = "#8B7355";
  const rimLight = "#A0896D";

  // Swirl speed driven by energy
  const swirlSpeed = interpolate(energy, [0.03, 0.3], [0.3, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Generate logarithmic spiral points for cream swirl
  const swirlAngle = cycleFrame * 0.02 * swirlSpeed;
  const swirlPoints: string[] = [];
  const spiralTurns = 3;
  const spiralSegments = 60;
  for (let s = 0; s < spiralSegments; s++) {
    const t = s / spiralSegments;
    const theta = t * spiralTurns * Math.PI * 2 + swirlAngle;
    // Logarithmic spiral: r = a * e^(b*theta)
    const r = cupRadius * 0.08 * Math.exp(0.12 * (t * spiralTurns * Math.PI * 2));
    const clampedR = Math.min(r, cupRadius * 0.85);
    const px = Math.cos(theta) * clampedR;
    const py = Math.sin(theta) * clampedR;
    swirlPoints.push(`${px},${py}`);
  }

  // Second swirl arm (offset)
  const swirlPoints2: string[] = [];
  for (let s = 0; s < spiralSegments; s++) {
    const t = s / spiralSegments;
    const theta = t * spiralTurns * Math.PI * 2 + swirlAngle + Math.PI;
    const r = cupRadius * 0.06 * Math.exp(0.11 * (t * spiralTurns * Math.PI * 2));
    const clampedR = Math.min(r, cupRadius * 0.8);
    const px = Math.cos(theta) * clampedR;
    const py = Math.sin(theta) * clampedR;
    swirlPoints2.push(`${px},${py}`);
  }

  const glowSize = interpolate(energy, [0.03, 0.3], [2, 6], {
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
          filter: `drop-shadow(0 0 ${glowSize}px rgba(139, 115, 85, 0.5))`,
          willChange: "opacity",
        }}
      >
        <defs>
          <clipPath id="coffee-cup-clip">
            <circle cx={cx} cy={cy} r={cupRadius - 3} />
          </clipPath>
          <radialGradient id="coffee-surface" cx="45%" cy="45%">
            <stop offset="0%" stopColor={coffeeMid} stopOpacity={0.15} />
            <stop offset="70%" stopColor={coffeeDark} stopOpacity={0.2} />
            <stop offset="100%" stopColor={coffeeDark} stopOpacity={0.25} />
          </radialGradient>
        </defs>

        {/* Saucer (outer ring) */}
        <circle cx={cx} cy={cy} r={cupRadius * 1.3} fill="none" stroke={rimColor} strokeWidth={2} opacity={0.2} />
        <circle cx={cx} cy={cy} r={cupRadius * 1.25} fill="none" stroke={rimLight} strokeWidth={0.5} opacity={0.15} />

        {/* Cup rim (thick ring) */}
        <circle cx={cx} cy={cy} r={cupRadius + 4} fill="none" stroke={rimColor} strokeWidth={6} opacity={0.35} />
        <circle cx={cx} cy={cy} r={cupRadius + 1} fill="none" stroke={rimLight} strokeWidth={1} opacity={0.2} />

        {/* Coffee surface */}
        <circle cx={cx} cy={cy} r={cupRadius - 3} fill="url(#coffee-surface)" />

        {/* Cream swirls (clipped to cup) */}
        <g clipPath="url(#coffee-cup-clip)">
          <g transform={`translate(${cx}, ${cy})`}>
            {/* Primary swirl arm */}
            <polyline
              points={swirlPoints.join(" ")}
              fill="none"
              stroke={cream}
              strokeWidth={3}
              opacity={0.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Wider faded version of primary */}
            <polyline
              points={swirlPoints.join(" ")}
              fill="none"
              stroke={creamLight}
              strokeWidth={6}
              opacity={0.1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Secondary swirl arm */}
            <polyline
              points={swirlPoints2.join(" ")}
              fill="none"
              stroke={cream}
              strokeWidth={2.5}
              opacity={0.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Center cream blob (slowly drifts) */}
            <circle
              cx={Math.sin(swirlAngle * 0.3) * 5}
              cy={Math.cos(swirlAngle * 0.4) * 4}
              r={cupRadius * 0.06}
              fill={cream}
              opacity={0.25}
            />
          </g>
        </g>

        {/* Cup rim highlight */}
        <circle cx={cx} cy={cy} r={cupRadius} fill="none" stroke="white" strokeWidth={0.8} opacity={0.06} />

        {/* Steam wisps (above the cup) */}
        {wisps.map((w, wi) => {
          const wispCycleLen = 90;
          const wispPhase = ((cycleFrame * w.speed + w.phase * 100) % wispCycleLen) / wispCycleLen;
          if (wispPhase > 0.85) return null;

          const wispOpacity = interpolate(wispPhase, [0, 0.1, 0.7, 0.85], [0, 0.15, 0.12, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const startR = cupRadius * w.radiusOffset;
          const startX = cx + Math.cos(w.startAngle) * startR;
          const startY = cy + Math.sin(w.startAngle) * startR;
          const riseY = -w.height * wispPhase;
          const drift = Math.sin(wispPhase * Math.PI * 2 + w.phase) * w.curvature;

          return (
            <path
              key={`wisp-${wi}`}
              d={`M ${startX} ${startY + riseY}
                  Q ${startX + drift * 0.5} ${startY + riseY - w.height * 0.15}
                    ${startX + drift} ${startY + riseY - w.height * 0.3}`}
              fill="none"
              stroke="white"
              strokeWidth={1.5}
              opacity={wispOpacity}
              strokeLinecap="round"
            />
          );
        })}

        {/* Handle (small arc on the right side) */}
        <path
          d={`M ${cx + cupRadius + 3} ${cy - 12}
              Q ${cx + cupRadius + 22} ${cy} ${cx + cupRadius + 3} ${cy + 12}`}
          fill="none"
          stroke={rimColor}
          strokeWidth={4}
          opacity={0.25}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
