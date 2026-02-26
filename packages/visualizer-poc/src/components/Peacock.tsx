/**
 * Peacock — A peacock tail fan that expands and contracts with energy. Feathers
 * are elongated shapes radiating from a center point, each with an iridescent
 * "eye" marking (concentric circles). Fan spread widens with energy. Feather
 * eyes shimmer with chroma-driven color shifts. Body silhouette at base.
 * Cycle: 90s (2700 frames), 25s (750 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 2700;   // 90s
const DURATION = 750;  // 25s
const NUM_FEATHERS = 24;

interface FeatherData {
  angleOffset: number;
  length: number;
  width: number;
  eyeRadius: number;
  shimmerPhase: number;
  sway: number;
}

function generate(seed: number): FeatherData[] {
  const rng = mulberry32(seed);
  return Array.from({ length: NUM_FEATHERS }, () => ({
    angleOffset: (rng() - 0.5) * 0.1,
    length: 140 + rng() * 80,
    width: 8 + rng() * 6,
    eyeRadius: 8 + rng() * 5,
    shimmerPhase: rng() * Math.PI * 2,
    sway: rng() * 0.02 + 0.005,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Peacock: React.FC<Props> = ({ frames }) => {
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

  const feathers = React.useMemo(() => generate(339911), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.65;
  if (masterOpacity < 0.01) return null;

  const frameData = frames[idx];
  const chroma = frameData?.chroma ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  /* fan spread: energy drives how wide the fan opens */
  const fanSpread = interpolate(energy, [0.03, 0.3], [0.4, 1.0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  /* anchor at bottom center */
  const cx = width * 0.5;
  const cy = height * 0.92;

  /* fan arc spans from about -80 to +80 degrees at full spread */
  const maxArc = 80 * fanSpread;
  const startAngle = -90 - maxArc;
  const endAngle = -90 + maxArc;
  const arcStep = (endAngle - startAngle) / (NUM_FEATHERS - 1);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <filter id="peacock-iridescent">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* feathers (back to front, outer first) */}
        {feathers.map((f, fi) => {
          const baseAngle = startAngle + fi * arcStep;
          const swayOff = Math.sin(frame * f.sway + f.shimmerPhase) * 2;
          const angleDeg = baseAngle + f.angleOffset * maxArc + swayOff;
          const angleRad = (angleDeg * Math.PI) / 180;

          /* feather length scales with fan spread */
          const len = f.length * (0.7 + fanSpread * 0.3);

          /* tip position */
          const tipX = cx + Math.cos(angleRad) * len;
          const tipY = cy + Math.sin(angleRad) * len;

          /* eye position: 75% along feather */
          const eyeX = cx + Math.cos(angleRad) * len * 0.75;
          const eyeY = cy + Math.sin(angleRad) * len * 0.75;

          /* iridescent color from chroma data */
          const chromaIdx = fi % 12;
          const chromaVal = chroma[chromaIdx];
          const iridHue = (chromaIdx * 30 + chromaVal * 60 + frame * 0.5) % 360;
          const featherColor = `hsl(${iridHue}, 65%, 35%)`;
          const eyeOuter = `hsl(${iridHue + 180}, 80%, 50%)`;
          const eyeInner = `hsl(${iridHue + 120}, 90%, 60%)`;
          const eyeCore = `hsl(${iridHue + 60}, 70%, 25%)`;

          /* shimmer */
          const shimmer = 0.6 + Math.sin(frame * 0.05 + f.shimmerPhase) * 0.2 + chromaVal * 0.2;

          /* perpendicular vector for feather width */
          const perpAngle = angleRad + Math.PI / 2;
          const halfW = f.width * 0.5;

          /* feather outline (elongated diamond) */
          const base1X = cx + Math.cos(perpAngle) * halfW * 0.3;
          const base1Y = cy + Math.sin(perpAngle) * halfW * 0.3;
          const base2X = cx - Math.cos(perpAngle) * halfW * 0.3;
          const base2Y = cy - Math.sin(perpAngle) * halfW * 0.3;
          const mid1X = cx + Math.cos(angleRad) * len * 0.5 + Math.cos(perpAngle) * halfW;
          const mid1Y = cy + Math.sin(angleRad) * len * 0.5 + Math.sin(perpAngle) * halfW;
          const mid2X = cx + Math.cos(angleRad) * len * 0.5 - Math.cos(perpAngle) * halfW;
          const mid2Y = cy + Math.sin(angleRad) * len * 0.5 - Math.sin(perpAngle) * halfW;

          const featherPath = `M ${base1X} ${base1Y} Q ${mid1X} ${mid1Y}, ${tipX} ${tipY} Q ${mid2X} ${mid2Y}, ${base2X} ${base2Y} Z`;

          return (
            <g key={fi}>
              {/* feather shaft */}
              <line x1={cx} y1={cy} x2={tipX} y2={tipY}
                stroke="hsl(45, 30%, 25%)" strokeWidth={1} opacity={0.4} />
              {/* feather vane */}
              <path d={featherPath} fill={featherColor} opacity={shimmer * 0.5} />
              {/* eye marking */}
              <g filter="url(#peacock-iridescent)">
                <circle cx={eyeX} cy={eyeY} r={f.eyeRadius} fill={eyeOuter} opacity={shimmer * 0.7} />
                <circle cx={eyeX} cy={eyeY} r={f.eyeRadius * 0.65} fill={eyeInner} opacity={shimmer * 0.8} />
                <circle cx={eyeX} cy={eyeY} r={f.eyeRadius * 0.35} fill={eyeCore} opacity={shimmer * 0.9} />
                <circle cx={eyeX} cy={eyeY} r={f.eyeRadius * 0.15} fill="#FFF" opacity={shimmer * 0.5} />
              </g>
            </g>
          );
        })}

        {/* body silhouette */}
        <ellipse cx={cx} cy={cy + 15} rx={22} ry={30} fill="hsl(220, 50%, 20%)" />
        {/* neck */}
        <ellipse cx={cx} cy={cy - 8} rx={10} ry={20} fill="hsl(210, 60%, 30%)" />
        {/* head */}
        <circle cx={cx} cy={cy - 30} r={9} fill="hsl(210, 60%, 30%)" />
        {/* beak */}
        <polygon
          points={`${cx + 5},${cy - 32} ${cx + 14},${cy - 30} ${cx + 5},${cy - 28}`}
          fill="hsl(40, 70%, 40%)"
        />
        {/* eye */}
        <circle cx={cx + 3} cy={cy - 32} r={2} fill="#111" />
        <circle cx={cx + 3.5} cy={cy - 32.5} r={0.7} fill="#FFF" />
        {/* crest (3 small plumes on head) */}
        {[0, 1, 2].map((ci) => {
          const ca = (-100 + ci * 15) * Math.PI / 180;
          const clen = 12 + ci * 2;
          return (
            <g key={`crest-${ci}`}>
              <line x1={cx} y1={cy - 36}
                x2={cx + Math.cos(ca) * clen} y2={cy - 36 + Math.sin(ca) * clen}
                stroke="hsl(210, 60%, 30%)" strokeWidth={1.5} strokeLinecap="round" />
              <circle cx={cx + Math.cos(ca) * clen} cy={cy - 36 + Math.sin(ca) * clen}
                r={2} fill="hsl(180, 70%, 50%)" />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
