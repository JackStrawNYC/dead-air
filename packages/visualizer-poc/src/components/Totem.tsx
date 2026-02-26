/**
 * Totem — Tall totem pole on one side of screen.
 * Stacked carved faces (4-5 faces), each a simplified mask: oval with eyes, mouth,
 * and decorative elements (wings, beaks, fins). Each face has different expression
 * and colors (red, black, green, teal, gold). Faces glow individually in sequence
 * with energy pulses. Wood-carved texture via hatching lines.
 * Cycle: 65s, 20s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUM_FACES = 5;
const VISIBLE_DURATION = 600; // 20s at 30fps
const CYCLE_GAP = 1350; // 45s gap (65s total - 20s visible)
const CYCLE_TOTAL = VISIBLE_DURATION + CYCLE_GAP;

const FACE_COLORS = [
  { fill: "#8B1A1A", accent: "#CC3333", name: "red" },
  { fill: "#1A1A1A", accent: "#555555", name: "black" },
  { fill: "#1A5C3A", accent: "#2E8B57", name: "green" },
  { fill: "#1A6B6B", accent: "#20B2AA", name: "teal" },
  { fill: "#8B7500", accent: "#DAA520", name: "gold" },
];

/** Decorative element types */
type DecoType = "wings" | "beak" | "fins" | "horns" | "feathers";

interface FaceData {
  colorIdx: number;
  eyeStyle: number; // 0-3
  mouthStyle: number; // 0-3
  decoType: DecoType;
  hatchSeed: number;
}

function generateFaces(seed: number): FaceData[] {
  const rng = seeded(seed);
  const decoTypes: DecoType[] = ["wings", "beak", "fins", "horns", "feathers"];
  return Array.from({ length: NUM_FACES }, (_, i) => ({
    colorIdx: i % FACE_COLORS.length,
    eyeStyle: Math.floor(rng() * 4),
    mouthStyle: Math.floor(rng() * 4),
    decoType: decoTypes[Math.floor(rng() * decoTypes.length)],
    hatchSeed: Math.floor(rng() * 99999),
  }));
}

/** Render hatching lines for wood texture */
function renderHatching(seed: number, w: number, h: number, count: number): React.ReactNode[] {
  const rng = seeded(seed);
  const lines: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const x1 = rng() * w;
    const y1 = rng() * h;
    const angle = -0.3 + rng() * 0.6; // mostly vertical
    const len = 4 + rng() * 10;
    const x2 = x1 + Math.cos(angle) * len;
    const y2 = y1 + Math.sin(angle) * len;
    lines.push(
      <line
        key={`h-${i}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="rgba(0,0,0,0.15)"
        strokeWidth={0.5}
        strokeLinecap="round"
      />,
    );
  }
  return lines;
}

/** Single totem face */
const TotemFace: React.FC<{
  face: FaceData;
  faceHeight: number;
  faceWidth: number;
  glowIntensity: number;
}> = ({ face, faceHeight, faceWidth, glowIntensity }) => {
  const c = FACE_COLORS[face.colorIdx];
  const hw = faceWidth / 2;
  const hh = faceHeight / 2;

  // Eye variants
  const renderEyes = () => {
    const eyeY = hh * 0.35;
    const eyeSpread = hw * 0.45;
    switch (face.eyeStyle) {
      case 0: // Round eyes
        return (
          <>
            <circle cx={hw - eyeSpread} cy={eyeY} r={5} fill="white" />
            <circle cx={hw - eyeSpread} cy={eyeY} r={2.5} fill="black" />
            <circle cx={hw + eyeSpread} cy={eyeY} r={5} fill="white" />
            <circle cx={hw + eyeSpread} cy={eyeY} r={2.5} fill="black" />
          </>
        );
      case 1: // Slit eyes
        return (
          <>
            <ellipse cx={hw - eyeSpread} cy={eyeY} rx={7} ry={3} fill="white" />
            <ellipse cx={hw - eyeSpread} cy={eyeY} rx={3} ry={2.5} fill="black" />
            <ellipse cx={hw + eyeSpread} cy={eyeY} rx={7} ry={3} fill="white" />
            <ellipse cx={hw + eyeSpread} cy={eyeY} rx={3} ry={2.5} fill="black" />
          </>
        );
      case 2: // Diamond eyes
        return (
          <>
            <polygon
              points={`${hw - eyeSpread},${eyeY - 5} ${hw - eyeSpread + 6},${eyeY} ${hw - eyeSpread},${eyeY + 5} ${hw - eyeSpread - 6},${eyeY}`}
              fill="white"
            />
            <circle cx={hw - eyeSpread} cy={eyeY} r={2} fill="black" />
            <polygon
              points={`${hw + eyeSpread},${eyeY - 5} ${hw + eyeSpread + 6},${eyeY} ${hw + eyeSpread},${eyeY + 5} ${hw + eyeSpread - 6},${eyeY}`}
              fill="white"
            />
            <circle cx={hw + eyeSpread} cy={eyeY} r={2} fill="black" />
          </>
        );
      default: // Crescent eyes
        return (
          <>
            <path
              d={`M ${hw - eyeSpread - 6} ${eyeY} Q ${hw - eyeSpread} ${eyeY - 6} ${hw - eyeSpread + 6} ${eyeY}`}
              stroke="white"
              strokeWidth={2.5}
              fill="none"
            />
            <path
              d={`M ${hw + eyeSpread - 6} ${eyeY} Q ${hw + eyeSpread} ${eyeY - 6} ${hw + eyeSpread + 6} ${eyeY}`}
              stroke="white"
              strokeWidth={2.5}
              fill="none"
            />
          </>
        );
    }
  };

  // Mouth variants
  const renderMouth = () => {
    const mouthY = hh * 0.7;
    switch (face.mouthStyle) {
      case 0: // Wide grimace
        return (
          <path
            d={`M ${hw - 12} ${mouthY} L ${hw - 5} ${mouthY + 4} L ${hw + 5} ${mouthY + 4} L ${hw + 12} ${mouthY}`}
            stroke={c.accent}
            strokeWidth={2}
            fill="none"
          />
        );
      case 1: // Open oval
        return <ellipse cx={hw} cy={mouthY} rx={8} ry={5} fill="#111" stroke={c.accent} strokeWidth={1.5} />;
      case 2: // Teeth showing
        return (
          <>
            <rect x={hw - 10} y={mouthY - 3} width={20} height={8} rx={2} fill="#111" stroke={c.accent} strokeWidth={1} />
            <line x1={hw - 5} y1={mouthY - 3} x2={hw - 5} y2={mouthY + 5} stroke={c.accent} strokeWidth={0.8} />
            <line x1={hw} y1={mouthY - 3} x2={hw} y2={mouthY + 5} stroke={c.accent} strokeWidth={0.8} />
            <line x1={hw + 5} y1={mouthY - 3} x2={hw + 5} y2={mouthY + 5} stroke={c.accent} strokeWidth={0.8} />
          </>
        );
      default: // Frown
        return (
          <path
            d={`M ${hw - 10} ${mouthY + 3} Q ${hw} ${mouthY - 5} ${hw + 10} ${mouthY + 3}`}
            stroke={c.accent}
            strokeWidth={2}
            fill="none"
          />
        );
    }
  };

  // Decorations
  const renderDeco = () => {
    switch (face.decoType) {
      case "wings":
        return (
          <>
            <path d={`M 0 ${hh * 0.3} Q ${-10} ${hh * 0.1} ${-15} ${hh * 0.4} Q ${-8} ${hh * 0.5} 0 ${hh * 0.4}`} fill={c.accent} opacity={0.6} />
            <path d={`M ${faceWidth} ${hh * 0.3} Q ${faceWidth + 10} ${hh * 0.1} ${faceWidth + 15} ${hh * 0.4} Q ${faceWidth + 8} ${hh * 0.5} ${faceWidth} ${hh * 0.4}`} fill={c.accent} opacity={0.6} />
          </>
        );
      case "beak":
        return (
          <polygon
            points={`${hw} ${hh * 0.45} ${hw - 4} ${hh * 0.55} ${hw + 4} ${hh * 0.55}`}
            fill={c.accent}
            opacity={0.8}
          />
        );
      case "fins":
        return (
          <>
            <path d={`M 2 ${hh * 0.2} L ${-8} ${hh * 0.05} L ${-6} ${hh * 0.35} Z`} fill={c.accent} opacity={0.5} />
            <path d={`M ${faceWidth - 2} ${hh * 0.2} L ${faceWidth + 8} ${hh * 0.05} L ${faceWidth + 6} ${hh * 0.35} Z`} fill={c.accent} opacity={0.5} />
          </>
        );
      case "horns":
        return (
          <>
            <path d={`M ${hw - 12} 0 Q ${hw - 18} ${-12} ${hw - 10} ${-10} L ${hw - 8} 2 Z`} fill={c.accent} opacity={0.7} />
            <path d={`M ${hw + 12} 0 Q ${hw + 18} ${-12} ${hw + 10} ${-10} L ${hw + 8} 2 Z`} fill={c.accent} opacity={0.7} />
          </>
        );
      case "feathers":
        return (
          <>
            {[0, 1, 2].map((fi) => (
              <line
                key={fi}
                x1={hw - 6 + fi * 6}
                y1={-2}
                x2={hw - 8 + fi * 8}
                y2={-14 - fi * 3}
                stroke={c.accent}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            ))}
          </>
        );
    }
  };

  return (
    <svg
      width={faceWidth + 30}
      height={faceHeight}
      viewBox={`-15 -15 ${faceWidth + 30} ${faceHeight + 15}`}
      fill="none"
    >
      {/* Glow behind face */}
      {glowIntensity > 0.1 && (
        <ellipse
          cx={hw}
          cy={hh}
          rx={hw + 5}
          ry={hh + 5}
          fill={c.accent}
          opacity={glowIntensity * 0.3}
          style={{ filter: `blur(${8 + glowIntensity * 6}px)` }}
        />
      )}
      {/* Face oval */}
      <ellipse cx={hw} cy={hh} rx={hw - 2} ry={hh - 2} fill={c.fill} stroke={c.accent} strokeWidth={1.5} />
      {/* Wood hatching */}
      <g clipPath={`url(#face-clip-${face.colorIdx})`}>
        {renderHatching(face.hatchSeed, faceWidth, faceHeight, 20)}
      </g>
      {renderEyes()}
      {renderMouth()}
      {renderDeco()}
      {/* Divider line at bottom */}
      <line x1={2} y1={faceHeight - 3} x2={faceWidth - 2} y2={faceHeight - 3} stroke={c.accent} strokeWidth={1} opacity={0.4} />
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const Totem: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const faces = React.useMemo(() => generateFaces(77050819), []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleIndex = Math.floor(frame / CYCLE_TOTAL);
  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0, 0.2], [0.4, 0.75], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Alternate sides each cycle
  const onLeft = cycleIndex % 2 === 0;
  const slideX = onLeft
    ? interpolate(progress, [0, 0.08, 0.92, 1], [-80, 20, 20, -80], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : interpolate(progress, [0, 0.08, 0.92, 1], [width + 10, width - 80, width - 80, width + 10], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  const faceWidth = 60;
  const faceHeight = (height * 0.75) / NUM_FACES;
  const totemTop = height * 0.1;

  // Glow sequence: one face glows brighter at a time, cycling
  const glowCycleSpeed = 0.04 + energy * 0.06;
  const glowPhase = frame * glowCycleSpeed;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: slideX,
          top: totemTop,
          opacity: masterOpacity,
          willChange: "transform, opacity",
        }}
      >
        {/* Totem pole base */}
        <div
          style={{
            width: faceWidth + 30,
            background: "linear-gradient(to right, #5C4033, #8B6E4E, #5C4033)",
            borderRadius: 4,
            overflow: "visible",
            position: "relative",
          }}
        >
          {faces.map((face, fi) => {
            // Each face glows in sequence
            const faceGlowPhase = glowPhase - fi * 1.2;
            const glowVal = Math.max(0, Math.sin(faceGlowPhase)) * energy * 2;
            const glowIntensity = Math.min(1, glowVal);

            return (
              <div key={fi} style={{ position: "relative" }}>
                <TotemFace
                  face={face}
                  faceHeight={faceHeight}
                  faceWidth={faceWidth}
                  glowIntensity={glowIntensity}
                />
              </div>
            );
          })}
          {/* Base pedestal */}
          <div
            style={{
              width: faceWidth + 40,
              height: 15,
              marginLeft: -5,
              background: "#4A3728",
              borderRadius: "0 0 6px 6px",
            }}
          />
        </div>
      </div>
    </div>
  );
};
