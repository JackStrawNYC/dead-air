/**
 * SpiralHypnoDisc -- Rotating optical-illusion hypnotic spiral disc.
 *
 * Classic 60s psychedelic projection straight out of Bill Graham's Fillmore.
 * Three stacked Archimedean spiral discs at different scales rotate at
 * independent speeds, producing the illusion of an infinite tunnel zoom.
 *
 * A+++ structure: 3 layered discs (large slow / mid / small fast) each with
 * 3-4 intertwining Archimedean spiral arms (B&W high contrast fading to
 * chromaHue color at high energy). Concentric color ring bands behind the
 * arms, outer boundary rings, bright center vortex with radial glow + inner
 * converging spiral, soft chroma-tinted outer aura halo. Continuous rotation
 * creates depth-zoom illusion. Subtle scale breathing from slowEnergy.
 *
 * Audio mapping:
 *   energy        -> rotation speed multiplier (faster when louder)
 *   slowEnergy    -> scale breathing (disc inhales/exhales)
 *   beatDecay     -> center vortex brightness pulse
 *   chromaHue     -> spiral color tint (B&W -> hue at high energy)
 *   onsetEnvelope -> white flash at center vortex
 *   tempoFactor   -> overall rotation tempo lock
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ---------- Types & constants ---------- */

interface Props {
  frames: EnhancedFrameData[];
}

interface DiscDef {
  /** Relative scale (1.0 = base radius) */
  scale: number;
  /** Rotation speed multiplier (signed: + clockwise, - counter) */
  speed: number;
  /** Number of intertwining spiral arms */
  arms: number;
  /** Spiral tightness (radians per unit) — controls density */
  tightness: number;
  /** Base opacity */
  opacity: number;
  /** Stroke thickness multiplier */
  thickness: number;
}

/** Three nested discs: outermost slow, innermost fast — creates tunnel zoom. */
const DISCS: DiscDef[] = [
  { scale: 1.00, speed: -0.0090, arms: 4, tightness: 6.5, opacity: 0.85, thickness: 1.0 },
  { scale: 0.66, speed:  0.0165, arms: 3, tightness: 5.2, opacity: 0.78, thickness: 0.85 },
  { scale: 0.36, speed: -0.0290, arms: 4, tightness: 4.0, opacity: 0.70, thickness: 0.7 },
];

const RING_BANDS = 6;
const ARM_STEPS = 110;
const VORTEX_STEPS = 70;

/* ---------- Spiral arm path builder (Archimedean wedge) ---------- */

/**
 * Build an Archimedean spiral arm as a thick filled wedge. The wedge tapers
 * from thin near the center to thicker at the outer edge for organic depth.
 */
function buildSpiralArmPath(
  cx: number,
  cy: number,
  startAngle: number,
  armOffset: number,
  tightness: number,
  maxRadius: number,
  armWidth: number,
  steps: number,
): string {
  const inner: string[] = [];
  const outer: string[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    // Archimedean: r grows linearly with theta
    const theta = startAngle + armOffset + t * tightness;
    const r = t * maxRadius;
    // Arm tapers from center (thin) to outer edge (thicker)
    const w = armWidth * (0.25 + t * 0.85);
    // Tangent angle for perpendicular offset (arm width direction)
    const tangentAngle = theta + Math.atan2(r, tightness);
    const perpX = Math.cos(tangentAngle + Math.PI / 2);
    const perpY = Math.sin(tangentAngle + Math.PI / 2);
    const baseX = cx + Math.cos(theta) * r;
    const baseY = cy + Math.sin(theta) * r;
    inner.push(`${baseX - perpX * w},${baseY - perpY * w}`);
    outer.push(`${baseX + perpX * w},${baseY + perpY * w}`);
  }
  let d = `M ${inner[0]}`;
  for (let i = 1; i < inner.length; i++) d += ` L ${inner[i]}`;
  for (let i = outer.length - 1; i >= 0; i--) d += ` L ${outer[i]}`;
  d += " Z";
  return d;
}

/* ---------- Inner converging vortex spiral ---------- */

function buildVortexSpiralPath(
  cx: number,
  cy: number,
  startAngle: number,
  maxRadius: number,
  turns: number,
): string {
  const points: string[] = [];
  for (let s = 0; s <= VORTEX_STEPS; s++) {
    const t = s / VORTEX_STEPS;
    const r = (1 - t) * maxRadius;
    const theta = startAngle + t * turns * Math.PI * 2;
    const x = cx + Math.cos(theta) * r;
    const y = cy + Math.sin(theta) * r;
    points.push(s === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }
  return points.join(" ");
}

/* ---------- Color helper ---------- */

/** Mix between black/white alternation and a chroma-hue color. */
function spiralStrokeColor(
  isAlt: boolean,
  hueDeg: number,
  colorMix: number,
  bright: number,
): string {
  const monoLight = isAlt ? 96 : 6;
  const colorLight = isAlt ? 70 : 22;
  const sat = colorMix * 88;
  const light = monoLight * (1 - colorMix) + colorLight * colorMix + bright * 6;
  return `hsl(${hueDeg}, ${sat}%, ${Math.max(0, Math.min(100, light))}%)`;
}

/* ---------- Main component ---------- */

export const SpiralHypnoDisc: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue;
  const onsetEnvelope = snap.onsetEnvelope;

  // Layout
  const cx = width / 2;
  const cy = height / 2;
  const baseRadius = Math.min(width, height) * 0.34;

  // Audio modulators
  const speedMul = (0.6 + energy * 1.6) * tempoFactor;
  const breathePhase = Math.sin(frame * 0.018) * 0.5 + 0.5;
  const breatheAmp = 0.04 + slowEnergy * 0.07;
  const scaleBreath = 1 + (breathePhase - 0.5) * 2 * breatheAmp;
  const colorMix = interpolate(energy, [0.15, 0.55], [0, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const baseHue = chromaHue;
  const centerBright = 0.55 + beatDecay * 0.4 + onsetEnvelope * 0.35;
  const centerFlash = onsetEnvelope * 0.85;
  const overallOpacity = 0.18 + energy * 0.40 + slowEnergy * 0.08;

  // Per-disc rotation angles (each spins at independent speed)
  const discRotations = DISCS.map((d) => frame * d.speed * speedMul);

  // Pre-computed deterministic ring band hue offsets
  const ringHueOffsets = useMemo(
    () => Array.from({ length: RING_BANDS }, (_, i) => (i * 53) % 360),
    [],
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0, opacity: overallOpacity }}
      >
        <defs>
          {/* Outer aura halo, tinted by chromaHue */}
          <radialGradient id="shd-aura" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={`hsl(${baseHue}, ${20 + colorMix * 60}%, ${28 + slowEnergy * 18}%)`} stopOpacity={0} />
            <stop offset="55%" stopColor={`hsl(${baseHue}, ${30 + colorMix * 60}%, ${42 + slowEnergy * 18}%)`} stopOpacity={0.18 + energy * 0.18} />
            <stop offset="100%" stopColor={`hsl(${baseHue}, ${20 + colorMix * 50}%, 6%)`} stopOpacity={0} />
          </radialGradient>

          {/* Center vortex glow */}
          <radialGradient id="shd-center" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity={centerBright} />
            <stop offset="25%" stopColor={`hsl(${baseHue}, 90%, ${75 + colorMix * 10}%)`} stopOpacity={0.85 * centerBright} />
            <stop offset="60%" stopColor={`hsl(${baseHue}, 80%, 45%)`} stopOpacity={0.45 * centerBright} />
            <stop offset="100%" stopColor="black" stopOpacity={0} />
          </radialGradient>

          {/* Ring band gradients (one per concentric color band) */}
          {ringHueOffsets.map((hueOff, i) => {
            const h = (baseHue + hueOff) % 360;
            return (
              <radialGradient key={`shd-band-${i}`} id={`shd-band-${i}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={`hsl(${h}, ${50 + colorMix * 35}%, 55%)`} stopOpacity={0} />
                <stop offset="50%" stopColor={`hsl(${h}, ${55 + colorMix * 35}%, 50%)`} stopOpacity={0.22} />
                <stop offset="100%" stopColor={`hsl(${h}, ${50 + colorMix * 35}%, 45%)`} stopOpacity={0} />
              </radialGradient>
            );
          })}

          <filter id="shd-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={4 + beatDecay * 6} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="shd-soft">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" />
          </filter>

          {/* Per-disc circular clip paths */}
          <clipPath id="shd-clip-large"><circle cx={cx} cy={cy} r={baseRadius * DISCS[0].scale * scaleBreath} /></clipPath>
          <clipPath id="shd-clip-mid"><circle cx={cx} cy={cy} r={baseRadius * DISCS[1].scale * scaleBreath} /></clipPath>
          <clipPath id="shd-clip-small"><circle cx={cx} cy={cy} r={baseRadius * DISCS[2].scale * scaleBreath} /></clipPath>
        </defs>

        {/* Outer aura halo (drawn first, behind everything) */}
        <circle
          cx={cx}
          cy={cy}
          r={baseRadius * 1.55 * scaleBreath}
          fill="url(#shd-aura)"
        />

        {/* Concentric color ring bands behind disc structure */}
        {Array.from({ length: RING_BANDS }, (_, i) => {
          const t = (i + 0.5) / RING_BANDS;
          const ringR = baseRadius * scaleBreath * (0.18 + t * 0.92);
          const ringW = baseRadius * scaleBreath * (0.04 + slowEnergy * 0.018);
          return (
            <circle
              key={`band-${i}`}
              cx={cx}
              cy={cy}
              r={ringR}
              fill="none"
              stroke={`url(#shd-band-${i})`}
              strokeWidth={ringW}
              opacity={0.55 + colorMix * 0.25}
              filter="url(#shd-soft)"
            />
          );
        })}

        {/* Three layered spiral discs */}
        {DISCS.map((disc, di) => {
          const discR = baseRadius * disc.scale * scaleBreath;
          const rotation = discRotations[di];
          const clipId =
            di === 0 ? "shd-clip-large" : di === 1 ? "shd-clip-mid" : "shd-clip-small";
          const armBaseWidth = discR * 0.085 * disc.thickness;
          // Smaller discs spin faster + read brighter for tunnel illusion
          const discBright = 0.4 + (1 - disc.scale) * 0.4 + beatDecay * 0.25;

          return (
            <g key={`disc-${di}`} clipPath={`url(#${clipId})`}>
              {/* Disc dark backing so spiral arms read as silhouettes */}
              <circle
                cx={cx}
                cy={cy}
                r={discR}
                fill={`hsl(${baseHue}, ${10 + colorMix * 30}%, ${4 + slowEnergy * 5}%)`}
                opacity={disc.opacity * 0.75}
              />

              {/* Spiral arms — alternating B&W (or color at high energy) */}
              {Array.from({ length: disc.arms }, (_, a) => {
                const armOffset = (a / disc.arms) * Math.PI * 2;
                const isAlt = a % 2 === 0;
                const armPath = buildSpiralArmPath(
                  cx, cy, rotation, armOffset, disc.tightness,
                  discR, armBaseWidth, ARM_STEPS,
                );
                const fill = spiralStrokeColor(isAlt, baseHue, colorMix, discBright);
                return (
                  <path key={`arm-${di}-${a}`} d={armPath} fill={fill} opacity={disc.opacity} />
                );
              })}

              {/* Disc outer boundary ring */}
              <circle
                cx={cx}
                cy={cy}
                r={discR * 0.985}
                fill="none"
                stroke={`hsl(${baseHue}, ${30 + colorMix * 50}%, ${75 + beatDecay * 15}%)`}
                strokeWidth={discR * 0.012}
                opacity={0.7}
              />
              {/* Inset secondary ring */}
              <circle
                cx={cx}
                cy={cy}
                r={discR * 0.92}
                fill="none"
                stroke={`hsl(${baseHue}, ${20 + colorMix * 40}%, 20%)`}
                strokeWidth={discR * 0.006}
                opacity={0.55}
              />
            </g>
          );
        })}

        {/* Inner converging vortex spiral at the very center */}
        <g opacity={0.75 + colorMix * 0.2}>
          {Array.from({ length: 3 }, (_, v) => {
            const vortexAngle = -frame * 0.045 * speedMul + (v / 3) * Math.PI * 2;
            const vortexR = baseRadius * 0.18 * scaleBreath;
            const vortexPath = buildVortexSpiralPath(cx, cy, vortexAngle, vortexR, 3);
            return (
              <path
                key={`vortex-${v}`}
                d={vortexPath}
                fill="none"
                stroke={`hsl(${baseHue}, ${60 + colorMix * 30}%, ${78 + beatDecay * 12}%)`}
                strokeWidth={1.6 + beatDecay * 1.4}
                strokeLinecap="round"
                opacity={0.65}
              />
            );
          })}
        </g>

        {/* Center vortex glow disc */}
        <circle
          cx={cx}
          cy={cy}
          r={baseRadius * 0.14 * (1 + beatDecay * 0.3)}
          fill="url(#shd-center)"
          filter="url(#shd-glow)"
        />

        {/* Bright center point */}
        <circle
          cx={cx}
          cy={cy}
          r={baseRadius * 0.022 * (1 + beatDecay * 0.5)}
          fill="white"
          opacity={0.85 * centerBright}
        />

        {/* Onset white flash overlay at center */}
        {centerFlash > 0.02 && (
          <circle
            cx={cx}
            cy={cy}
            r={baseRadius * 0.08 * (1 + onsetEnvelope * 1.4)}
            fill="white"
            opacity={centerFlash * 0.7}
            filter="url(#shd-glow)"
          />
        )}

        {/* Outer rim highlight */}
        <circle
          cx={cx}
          cy={cy}
          r={baseRadius * scaleBreath * 1.005}
          fill="none"
          stroke={`hsl(${baseHue}, ${40 + colorMix * 40}%, ${82 + beatDecay * 10}%)`}
          strokeWidth={1.4}
          opacity={0.35 + energy * 0.25}
        />
        {/* Wider soft outer rim */}
        <circle
          cx={cx}
          cy={cy}
          r={baseRadius * scaleBreath * 1.06}
          fill="none"
          stroke={`hsl(${baseHue}, ${30 + colorMix * 30}%, 60%)`}
          strokeWidth={0.8}
          opacity={0.18 + slowEnergy * 0.15}
        />
      </svg>
    </div>
  );
};
