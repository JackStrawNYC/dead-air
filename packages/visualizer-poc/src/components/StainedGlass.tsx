/**
 * StainedGlass -- Cathedral rose window pattern. Central circle divided into
 * 8 pie wedges, each further divided into 2-3 sections. Each section filled
 * with a different neon color (from chroma). Thin dark lead lines between
 * sections. Outer ring of smaller repeated arch shapes. Slow rotation.
 * Light appears to glow from behind (radial gradient center bright).
 * Appears every 70s for 14s at 20-35% opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2100; // 70 seconds at 30fps
const DURATION = 420; // 14 seconds
const WEDGE_COUNT = 8;
const ARCH_COUNT = 16;

/** Map chroma index (0-11) + hue offset to a neon HSL string */
function chromaToNeon(chromaValue: number, hueIndex: number, hueOffset: number): string {
  const hue = ((hueIndex * 30 + hueOffset) % 360 + 360) % 360;
  const sat = 85 + chromaValue * 15;
  const light = 45 + chromaValue * 20;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const StainedGlass: React.FC<Props> = ({ frames }) => {
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

  // Subsection division counts (memoized)
  const subsections = React.useMemo(() => {
    const rng = seeded(67_890_123);
    return Array.from({ length: WEDGE_COUNT }, () => 2 + Math.floor(rng() * 2)); // 2 or 3
  }, []);

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade in/out
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

  // 20-35% opacity driven by energy
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) * 0.38;
  const innerR = maxR * 0.15;
  const midR = maxR * 0.55;
  const outerR = maxR * 0.85;

  // Get chroma data for coloring
  const currentChroma = frames[idx].chroma;
  const hueOffset = (frame * 0.3) % 360;

  // Slow rotation
  const rotation = frame * 0.12;

  // Build wedge paths
  const wedges: React.ReactNode[] = [];
  let chromaIdx = 0;

  for (let w = 0; w < WEDGE_COUNT; w++) {
    const startAngle = (w / WEDGE_COUNT) * Math.PI * 2;
    const endAngle = ((w + 1) / WEDGE_COUNT) * Math.PI * 2;
    const subCount = subsections[w];

    // Radial subsections (inner to outer rings)
    const radii = [innerR, midR, outerR];
    for (let s = 0; s < subCount; s++) {
      const rInner = radii[s] || innerR + (outerR - innerR) * (s / subCount);
      const rOuter = radii[s + 1] || innerR + (outerR - innerR) * ((s + 1) / subCount);

      const x1 = Math.cos(startAngle) * rInner;
      const y1 = Math.sin(startAngle) * rInner;
      const x2 = Math.cos(startAngle) * rOuter;
      const y2 = Math.sin(startAngle) * rOuter;
      const x3 = Math.cos(endAngle) * rOuter;
      const y3 = Math.sin(endAngle) * rOuter;
      const x4 = Math.cos(endAngle) * rInner;
      const y4 = Math.sin(endAngle) * rInner;

      const largeArc = 0; // Each wedge < 180 degrees (8 wedges => 45 degrees each)

      const d = [
        `M ${x1} ${y1}`,
        `L ${x2} ${y2}`,
        `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x3} ${y3}`,
        `L ${x4} ${y4}`,
        `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x1} ${y1}`,
        "Z",
      ].join(" ");

      const cIdx = chromaIdx % 12;
      const color = chromaToNeon(currentChroma[cIdx], cIdx, hueOffset);
      chromaIdx++;

      wedges.push(
        <path
          key={`w${w}-s${s}`}
          d={d}
          fill={color}
          stroke="rgba(20,20,30,0.7)"
          strokeWidth="1.5"
          opacity={0.7 + currentChroma[cIdx] * 0.3}
        />
      );
    }
  }

  // Outer arch ring
  const arches: React.ReactNode[] = [];
  for (let a = 0; a < ARCH_COUNT; a++) {
    const aStart = (a / ARCH_COUNT) * Math.PI * 2;
    const aEnd = ((a + 0.8) / ARCH_COUNT) * Math.PI * 2;
    const aMid = (aStart + aEnd) / 2;

    const ax1 = Math.cos(aStart) * outerR;
    const ay1 = Math.sin(aStart) * outerR;
    const ax2 = Math.cos(aEnd) * outerR;
    const ay2 = Math.sin(aEnd) * outerR;
    const ax3 = Math.cos(aEnd) * maxR;
    const ay3 = Math.sin(aEnd) * maxR;
    const ax1o = Math.cos(aStart) * maxR;
    const ay1o = Math.sin(aStart) * maxR;

    // Arch top (pointed)
    const peakR = maxR + 12;
    const px = Math.cos(aMid) * peakR;
    const py = Math.sin(aMid) * peakR;

    const cIdx = a % 12;
    const archColor = chromaToNeon(currentChroma[cIdx], cIdx, hueOffset + 60);

    arches.push(
      <path
        key={`arch-${a}`}
        d={`M ${ax1} ${ay1} L ${ax1o} ${ay1o} Q ${px} ${py} ${ax3} ${ay3} L ${ax2} ${ay2} A ${outerR} ${outerR} 0 0 0 ${ax1} ${ay1} Z`}
        fill={archColor}
        stroke="rgba(20,20,30,0.6)"
        strokeWidth="1.2"
        opacity={0.6}
      />
    );
  }

  // Center glow
  const glowColor = chromaToNeon(currentChroma[0], 0, hueOffset);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 15px ${glowColor}) drop-shadow(0 0 30px rgba(255,255,255,0.15))`,
        }}
      >
        <defs>
          <radialGradient id="stainedglass-glow">
            <stop offset="0%" stopColor="rgba(255,255,240,0.35)" />
            <stop offset="50%" stopColor="rgba(255,255,240,0.08)" />
            <stop offset="100%" stopColor="rgba(255,255,240,0)" />
          </radialGradient>
        </defs>
        <g transform={`translate(${cx}, ${cy}) rotate(${rotation})`}>
          {/* Background glow (light from behind) */}
          <circle cx={0} cy={0} r={maxR * 1.1} fill="url(#stainedglass-glow)" />

          {/* Wedge sections */}
          {wedges}

          {/* Outer arch ring */}
          {arches}

          {/* Center hub */}
          <circle cx={0} cy={0} r={innerR} fill={glowColor} opacity={0.4} />
          <circle cx={0} cy={0} r={innerR} stroke="rgba(20,20,30,0.7)" strokeWidth="2" fill="none" />

          {/* Outer border ring */}
          <circle cx={0} cy={0} r={maxR} stroke="rgba(20,20,30,0.5)" strokeWidth="2.5" fill="none" />
          <circle cx={0} cy={0} r={outerR} stroke="rgba(20,20,30,0.4)" strokeWidth="1.5" fill="none" />
        </g>
      </svg>
    </div>
  );
};
