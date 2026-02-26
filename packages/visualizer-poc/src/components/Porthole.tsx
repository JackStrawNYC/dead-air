/**
 * Porthole — Ship porthole frame with water refraction effects.
 * Circular brass frame with rivets. Inside shows animated water surface
 * rendered as wavy horizontal lines. Wave amplitude and frequency match
 * bass (sub+low) energy. Light caustics overlay shimmer with centroid.
 * Bubbles rise on beat hits. Neon brass/deep-blue colors.
 * Positioned center-right. Appears every 40s for 13s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1200; // 40 seconds at 30fps
const DURATION = 390; // 13 seconds visible
const NUM_RIVETS = 12;
const NUM_WAVE_LINES = 14;
const NUM_CAUSTIC_LINES = 8;

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Porthole: React.FC<Props> = ({ frames }) => {
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

  // Pre-compute bubble seed positions (deterministic)
  const bubbleSeeds = React.useMemo(() => {
    const rng = mulberry32(98765);
    const seeds: Array<{ xOff: number; size: number; speedMul: number }> = [];
    for (let b = 0; b < 20; b++) {
      seeds.push({
        xOff: (rng() - 0.5) * 0.7,
        size: 2 + rng() * 4,
        speedMul: 0.6 + rng() * 0.8,
      });
    }
    return seeds;
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
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.2, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const fd = frames[idx];

  const cx = width * 0.68;
  const cy = height * 0.5;
  const outerR = Math.min(width, height) * 0.18;
  const innerR = outerR * 0.85;

  // Bass energy for waves
  const bassEnergy = (fd.sub + fd.low) * 0.5;
  const waveAmp = 3 + bassEnergy * 15;
  const waveFreq = 0.03 + bassEnergy * 0.02;

  const brass = "#CCAA44";
  const darkBrass = "#886622";
  const deepBlue = "#0044AA";
  const lightBlue = "#44AAFF";
  const causticColor = "#88DDFF";

  const glowSize = interpolate(energy, [0.02, 0.3], [2, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Generate wave line paths (horizontal wavy lines inside the porthole)
  const waveLines: Array<{ d: string; y: number }> = [];
  for (let w = 0; w < NUM_WAVE_LINES; w++) {
    const yRatio = (w + 1) / (NUM_WAVE_LINES + 1); // 0-1 vertical position
    const baseY = -innerR + yRatio * innerR * 2;
    const phaseOff = w * 1.2;
    const segments = 40;
    let d = "";
    for (let s = 0; s <= segments; s++) {
      const xRatio = s / segments;
      const x = -innerR + xRatio * innerR * 2;
      const waveY = baseY + Math.sin((x * waveFreq + frame * 0.06 + phaseOff) * Math.PI) * waveAmp;
      if (s === 0) d = `M ${x} ${waveY}`;
      else d += ` L ${x} ${waveY}`;
    }
    waveLines.push({ d, y: baseY });
  }

  // Caustic lines (lighter, faster-moving, fewer)
  const causticLines: string[] = [];
  for (let c = 0; c < NUM_CAUSTIC_LINES; c++) {
    const yRatio = (c + 0.5) / NUM_CAUSTIC_LINES;
    const baseY = -innerR * 0.8 + yRatio * innerR * 1.6;
    const segments = 30;
    let d = "";
    for (let s = 0; s <= segments; s++) {
      const xRatio = s / segments;
      const x = -innerR * 0.9 + xRatio * innerR * 1.8;
      const cy2 = baseY + Math.sin((x * 0.05 + frame * 0.1 + c * 2.5) * Math.PI) * (2 + fd.centroid * 6);
      if (s === 0) d = `M ${x} ${cy2}`;
      else d += ` L ${x} ${cy2}`;
    }
    causticLines.push(d);
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${deepBlue}) drop-shadow(0 0 ${glowSize * 1.5}px ${brass})`,
          willChange: "opacity",
        }}
      >
        <defs>
          <clipPath id="porthole-clip">
            <circle cx={cx} cy={cy} r={innerR} />
          </clipPath>
        </defs>

        {/* Water background (deep blue fill) */}
        <circle cx={cx} cy={cy} r={innerR} fill={deepBlue} opacity={0.15} />

        {/* Wave lines (clipped to porthole) */}
        <g clipPath="url(#porthole-clip)" transform={`translate(${cx}, ${cy})`}>
          {waveLines.map((wl, wi) => (
            <path
              key={`wave-${wi}`}
              d={wl.d}
              fill="none"
              stroke={lightBlue}
              strokeWidth={0.8}
              opacity={interpolate(Math.abs(wl.y), [0, innerR], [0.4, 0.15], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })}
            />
          ))}

          {/* Caustic light lines */}
          {causticLines.map((d, ci) => (
            <path
              key={`caustic-${ci}`}
              d={d}
              fill="none"
              stroke={causticColor}
              strokeWidth={0.5}
              opacity={0.15 + fd.centroid * 0.15}
            />
          ))}

          {/* Bubbles (rise on beats) */}
          {bubbleSeeds.map((seed, bi) => {
            // Bubbles cycle vertically
            const bubblePhase = ((frame * seed.speedMul * 0.02 + bi * 0.15) % 1);
            const bx = seed.xOff * innerR + Math.sin(frame * 0.04 + bi * 3) * 5;
            const by = innerR * (1 - bubblePhase * 2);
            const bubbleOpacity = fd.beat && bi < 8
              ? 0.5
              : interpolate(bubblePhase, [0, 0.1, 0.8, 1], [0, 0.3, 0.25, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
            return (
              <circle
                key={`bubble-${bi}`}
                cx={bx}
                cy={by}
                r={seed.size}
                fill="none"
                stroke={lightBlue}
                strokeWidth={0.8}
                opacity={bubbleOpacity}
              />
            );
          })}
        </g>

        {/* Brass frame (outer ring) */}
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={brass} strokeWidth={outerR - innerR} opacity={0.25} />
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={brass} strokeWidth={3} opacity={0.6} />
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={darkBrass} strokeWidth={2} opacity={0.5} />

        {/* Inner bevel ring */}
        <circle cx={cx} cy={cy} r={innerR + (outerR - innerR) * 0.3} fill="none" stroke={brass} strokeWidth={1} opacity={0.2} />

        {/* Rivets around the frame */}
        {Array.from({ length: NUM_RIVETS }, (_, ri) => {
          const angle = ((ri / NUM_RIVETS) * 360 * Math.PI) / 180;
          const rivetR = (outerR + innerR) * 0.5;
          const rx = cx + Math.cos(angle) * rivetR;
          const ry = cy + Math.sin(angle) * rivetR;
          return (
            <g key={`rivet-${ri}`}>
              <circle cx={rx} cy={ry} r={3.5} fill={darkBrass} opacity={0.4} />
              <circle cx={rx} cy={ry} r={2} fill={brass} opacity={0.5} />
              <circle cx={rx} cy={ry} r={0.8} fill="#FFFFFF" opacity={0.15} />
            </g>
          );
        })}

        {/* Hinge on left side */}
        <rect
          x={cx - outerR - 8}
          y={cy - 12}
          width={16}
          height={24}
          rx={3}
          fill="none"
          stroke={brass}
          strokeWidth={1.5}
          opacity={0.3}
        />

        {/* Glass reflection highlight (arc in upper-left) */}
        <path
          d={`M ${cx - innerR * 0.5} ${cy - innerR * 0.65}
              A ${innerR * 0.8} ${innerR * 0.8} 0 0 1 ${cx - innerR * 0.65} ${cy - innerR * 0.3}`}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2}
          opacity={0.08}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
