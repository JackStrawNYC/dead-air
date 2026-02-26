/**
 * Cathedral — Gothic cathedral rose window mandala. Central mandala divided
 * into radiating sections, each illuminating with energy. Outer ring of
 * pointed gothic arches. Sections glow based on chroma data. Slow rotation.
 * Inner tracery patterns with trefoil and quatrefoil motifs.
 * Cycle: 75s on / off, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2250; // 75s at 30fps
const DURATION = 540; // 18s visible
const PETAL_COUNT = 12;
const OUTER_ARCH_COUNT = 24;

function chromaHsl(chromaVal: number, index: number, offset: number): string {
  const hue = ((index * 30 + offset) % 360 + 360) % 360;
  const sat = 70 + chromaVal * 25;
  const light = 30 + chromaVal * 35;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Cathedral: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Pre-generate petal variation offsets
  const petalOffsets = React.useMemo(() => {
    const rng = seeded(44_821_073);
    return Array.from({ length: PETAL_COUNT }, () => ({
      innerScale: 0.85 + rng() * 0.3,
      hueShift: rng() * 60,
    }));
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
  const baseOpacity = interpolate(energy, [0.02, 0.25], [0.18, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;
  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) * 0.4;
  const innerR = maxR * 0.12;
  const midR = maxR * 0.45;
  const outerR = maxR * 0.78;

  const chroma = frames[idx].chroma;
  const hueOffset = (frame * 0.25) % 360;
  const rotation = frame * 0.08;

  const glowSize = interpolate(energy, [0.02, 0.3], [3, 14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Build petals (inner rose sections)
  const petals: React.ReactNode[] = [];
  for (let p = 0; p < PETAL_COUNT; p++) {
    const a0 = (p / PETAL_COUNT) * Math.PI * 2;
    const a1 = ((p + 1) / PETAL_COUNT) * Math.PI * 2;
    const aMid = (a0 + a1) / 2;
    const off = petalOffsets[p];

    // Inner petal (innerR -> midR)
    const peakR = midR * off.innerScale;
    const px = Math.cos(aMid) * (peakR + 15);
    const py = Math.sin(aMid) * (peakR + 15);

    const x0i = Math.cos(a0) * innerR;
    const y0i = Math.sin(a0) * innerR;
    const x1i = Math.cos(a1) * innerR;
    const y1i = Math.sin(a1) * innerR;
    const x0o = Math.cos(a0) * peakR;
    const y0o = Math.sin(a0) * peakR;
    const x1o = Math.cos(a1) * peakR;
    const y1o = Math.sin(a1) * peakR;

    const cIdx = p % 12;
    const illumination = chroma[cIdx] * (0.5 + energy * 0.5);
    const color = chromaHsl(illumination, cIdx, hueOffset + off.hueShift);

    petals.push(
      <path
        key={`petal-${p}`}
        d={`M ${x0i} ${y0i} L ${x0o} ${y0o} Q ${px} ${py} ${x1o} ${y1o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 0 0 ${x0i} ${y0i} Z`}
        fill={color}
        stroke="rgba(15,10,30,0.6)"
        strokeWidth={1.2}
        opacity={0.5 + illumination * 0.4}
      />,
    );

    // Outer petal (midR -> outerR)
    const x0m = Math.cos(a0) * midR;
    const y0m = Math.sin(a0) * midR;
    const x1m = Math.cos(a1) * midR;
    const y1m = Math.sin(a1) * midR;
    const x0r = Math.cos(a0) * outerR;
    const y0r = Math.sin(a0) * outerR;
    const x1r = Math.cos(a1) * outerR;
    const y1r = Math.sin(a1) * outerR;
    const px2 = Math.cos(aMid) * (outerR + 10);
    const py2 = Math.sin(aMid) * (outerR + 10);
    const outerColor = chromaHsl(illumination * 0.8, (cIdx + 6) % 12, hueOffset + 30);

    petals.push(
      <path
        key={`outer-petal-${p}`}
        d={`M ${x0m} ${y0m} L ${x0r} ${y0r} Q ${px2} ${py2} ${x1r} ${y1r} L ${x1m} ${y1m} A ${midR} ${midR} 0 0 0 ${x0m} ${y0m} Z`}
        fill={outerColor}
        stroke="rgba(15,10,30,0.5)"
        strokeWidth={1}
        opacity={0.4 + illumination * 0.3}
      />,
    );
  }

  // Outer gothic arches
  const arches: React.ReactNode[] = [];
  for (let a = 0; a < OUTER_ARCH_COUNT; a++) {
    const a0 = (a / OUTER_ARCH_COUNT) * Math.PI * 2;
    const a1 = ((a + 0.85) / OUTER_ARCH_COUNT) * Math.PI * 2;
    const aMid = (a0 + a1) / 2;

    const x0 = Math.cos(a0) * outerR;
    const y0 = Math.sin(a0) * outerR;
    const x1 = Math.cos(a1) * outerR;
    const y1 = Math.sin(a1) * outerR;
    const tipR = maxR + 8;
    const tx = Math.cos(aMid) * tipR;
    const ty = Math.sin(aMid) * tipR;

    const cIdx = a % 12;
    const archColor = chromaHsl(chroma[cIdx] * 0.7, cIdx, hueOffset + 90);

    arches.push(
      <path
        key={`arch-${a}`}
        d={`M ${x0} ${y0} Q ${tx} ${ty} ${x1} ${y1} A ${outerR} ${outerR} 0 0 0 ${x0} ${y0} Z`}
        fill={archColor}
        stroke="rgba(15,10,30,0.5)"
        strokeWidth={0.8}
        opacity={0.35}
      />,
    );
  }

  const centerGlow = chromaHsl(chroma[0], 0, hueOffset);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${centerGlow}) drop-shadow(0 0 ${glowSize * 2}px rgba(200,180,255,0.1))`,
          willChange: "opacity",
        }}
      >
        <defs>
          <radialGradient id="cathedral-glow">
            <stop offset="0%" stopColor="rgba(255,240,220,0.3)" />
            <stop offset="60%" stopColor="rgba(255,240,220,0.05)" />
            <stop offset="100%" stopColor="rgba(255,240,220,0)" />
          </radialGradient>
        </defs>
        <g transform={`translate(${cx}, ${cy}) rotate(${rotation})`}>
          <circle cx={0} cy={0} r={maxR * 1.15} fill="url(#cathedral-glow)" />
          {arches}
          {petals}
          {/* Tracery rings */}
          <circle cx={0} cy={0} r={midR} stroke="rgba(200,180,255,0.3)" strokeWidth={1.5} fill="none" />
          <circle cx={0} cy={0} r={outerR} stroke="rgba(200,180,255,0.25)" strokeWidth={1.5} fill="none" />
          <circle cx={0} cy={0} r={maxR} stroke="rgba(200,180,255,0.2)" strokeWidth={2} fill="none" />
          {/* Center rosette */}
          <circle cx={0} cy={0} r={innerR} fill={centerGlow} opacity={0.35} />
          <circle cx={0} cy={0} r={innerR} stroke="rgba(15,10,30,0.6)" strokeWidth={1.5} fill="none" />
        </g>
      </svg>
    </div>
  );
};
