/**
 * AuroraBorealis — A+++ overlay.
 * Northern lights — flowing curtains of green/purple/cyan across the upper
 * 60% of the frame. Multiple wave layers with different speeds. Mountain
 * silhouette + foreground tree silhouettes at the bottom. Stars peeking
 * through aurora. Snowy ground hint.
 *
 * Audio reactivity:
 *   slowEnergy → aurora bloom
 *   energy     → curtain brightness
 *   bass       → ripple amplitude
 *   beatDecay  → flow speed
 *   onsetEnvelope → flare
 *   chromaHue  → color shift across spectrum
 *   tempoFactor → curtain animation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const STAR_COUNT = 110;
const TREE_COUNT = 20;
const CURTAIN_COUNT = 6;
const CURTAIN_SEGMENTS = 36;

interface BgStar {
  x: number;
  y: number;
  r: number;
  twinkleSpeed: number;
  phase: number;
}
interface Tree {
  x: number;
  height: number;
  width: number;
  type: number;
}

function buildStars(): BgStar[] {
  const rng = seeded(64_887_119);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.55,
    r: 0.5 + rng() * 1.4,
    twinkleSpeed: 0.02 + rng() * 0.05,
    phase: rng() * Math.PI * 2,
  }));
}

function buildTrees(): Tree[] {
  const rng = seeded(11_553_217);
  return Array.from({ length: TREE_COUNT }, () => ({
    x: rng(),
    height: 60 + rng() * 90,
    width: 18 + rng() * 16,
    type: Math.floor(rng() * 2),
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const AuroraBorealis: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const bgStars = React.useMemo(buildStars, []);
  const trees = React.useMemo(buildTrees, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  const auroraBloom = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const curtainBright = interpolate(snap.energy, [0.02, 0.32], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rippleAmp = 1 + snap.bass * 0.6;
  const flowMul = 1 + snap.beatDecay * 0.4;
  const flareBurst = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Palette
  const baseHue = 140; // green
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.35) % 360 + 360) % 360;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 50%, 5%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 50%, 10%)`;
  const skyBot = `hsl(${(tintHue + 200) % 360}, 40%, 14%)`;

  // Stars
  const starNodes = bgStars.map((s, i) => {
    const t = frame * s.twinkleSpeed + s.phase;
    const tw = 0.55 + Math.sin(t) * 0.4;
    return (
      <circle key={`bs-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.85 + tw * 0.3)}
        fill={`hsl(${tintHue}, 30%, 92%)`} opacity={0.85 * tw} />
    );
  });

  // Aurora curtains
  function buildCurtain(idx: number): React.ReactNode {
    const baseY = height * (0.10 + idx * 0.10);
    const ampBase = 60 + idx * 20;
    const speedMul = 0.020 + idx * 0.006;
    const phaseOffset = idx * 1.7;
    const cHue = (tintHue + idx * 35) % 360;
    const sat = 80;

    // Build top edge wave
    const topPoints: string[] = [];
    const botPoints: string[] = [];
    for (let s = 0; s <= CURTAIN_SEGMENTS; s++) {
      const x = (s / CURTAIN_SEGMENTS) * width;
      const phase = frame * speedMul * tempoFactor * flowMul + s * 0.4 + phaseOffset;
      const wave = Math.sin(phase) * ampBase * rippleAmp + Math.sin(phase * 2.3) * ampBase * 0.4;
      const ty = baseY + wave;
      const by = ty + (140 + idx * 40) + Math.sin(phase * 1.5) * 30;
      topPoints.push(`${s === 0 ? "M" : "L"} ${x} ${ty}`);
      botPoints.push(`L ${x} ${by}`);
    }
    // Reverse the bottom for the closing path
    const botReversed: string[] = [];
    for (let s = CURTAIN_SEGMENTS; s >= 0; s--) {
      const x = (s / CURTAIN_SEGMENTS) * width;
      const phase = frame * speedMul * tempoFactor * flowMul + s * 0.4 + phaseOffset;
      const wave = Math.sin(phase) * ampBase * rippleAmp + Math.sin(phase * 2.3) * ampBase * 0.4;
      const ty = baseY + wave;
      const by = ty + (140 + idx * 40) + Math.sin(phase * 1.5) * 30;
      botReversed.push(`L ${x} ${by}`);
    }
    const curtainPath = topPoints.join(" ") + " " + botReversed.join(" ") + " Z";
    const gradId = `aurora-curtain-${idx}`;

    return (
      <g key={`curtain-${idx}`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${cHue}, ${sat}%, 70%)`} stopOpacity={0.0} />
            <stop offset="20%" stopColor={`hsl(${cHue}, ${sat}%, 65%)`} stopOpacity={0.55 * curtainBright} />
            <stop offset="60%" stopColor={`hsl(${cHue}, ${sat}%, 55%)`} stopOpacity={0.35 * curtainBright} />
            <stop offset="100%" stopColor={`hsl(${cHue}, ${sat}%, 45%)`} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <path d={curtainPath} fill={`url(#${gradId})`} style={{ mixBlendMode: "screen" }} />
      </g>
    );
  }

  const curtains: React.ReactNode[] = [];
  for (let i = 0; i < CURTAIN_COUNT; i++) curtains.push(buildCurtain(i));

  // Mountain silhouette
  const mountainPath = `M 0 ${height}
    L 0 ${height * 0.78}
    L ${width * 0.10} ${height * 0.74}
    L ${width * 0.18} ${height * 0.78}
    L ${width * 0.27} ${height * 0.68}
    L ${width * 0.36} ${height * 0.74}
    L ${width * 0.46} ${height * 0.62}
    L ${width * 0.55} ${height * 0.70}
    L ${width * 0.62} ${height * 0.66}
    L ${width * 0.72} ${height * 0.74}
    L ${width * 0.82} ${height * 0.70}
    L ${width * 0.92} ${height * 0.78}
    L ${width} ${height * 0.74}
    L ${width} ${height} Z`;

  // Trees
  const treeNodes = trees.map((t, i) => {
    const tx = t.x * width;
    const tBaseY = height * 0.92;
    const tH = t.height;
    const tW = t.width;
    if (t.type === 0) {
      // Pine tree (triangular)
      return (
        <g key={`tree-${i}`}>
          <path d={`M ${tx} ${tBaseY - tH}
            L ${tx - tW * 0.5} ${tBaseY - tH * 0.4}
            L ${tx - tW * 0.3} ${tBaseY - tH * 0.4}
            L ${tx - tW * 0.6} ${tBaseY}
            L ${tx + tW * 0.6} ${tBaseY}
            L ${tx + tW * 0.3} ${tBaseY - tH * 0.4}
            L ${tx + tW * 0.5} ${tBaseY - tH * 0.4} Z`}
            fill="rgba(4, 4, 10, 1)" />
          <line x1={tx} y1={tBaseY - tH} x2={tx} y2={tBaseY}
            stroke="rgba(8, 8, 16, 1)" strokeWidth={1.5} />
        </g>
      );
    }
    // Triangular fir
    return (
      <path key={`tree-${i}`}
        d={`M ${tx} ${tBaseY - tH} L ${tx - tW * 0.55} ${tBaseY} L ${tx + tW * 0.55} ${tBaseY} Z`}
        fill="rgba(4, 4, 10, 1)" />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="ab-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <linearGradient id="ab-mountain" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(20, 18, 30, 0.96)" />
            <stop offset="100%" stopColor="rgba(6, 6, 12, 1)" />
          </linearGradient>
          <radialGradient id="ab-haze">
            <stop offset="0%" stopColor={`hsl(${tintHue}, 70%, 60%)`} stopOpacity={0.18 * auroraBloom} />
            <stop offset="100%" stopColor={`hsl(${tintHue}, 70%, 60%)`} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="ab-snow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(160, 180, 220, 0.6)" />
            <stop offset="100%" stopColor="rgba(40, 50, 80, 0.95)" />
          </linearGradient>
        </defs>

        <rect width={width} height={height} fill="url(#ab-sky)" />

        {/* Stars */}
        {starNodes}

        {/* Atmospheric haze */}
        <ellipse cx={width * 0.5} cy={height * 0.35} rx={width * 0.7} ry={height * 0.4}
          fill="url(#ab-haze)" />

        {/* Aurora curtains (back to front) */}
        {curtains}

        {/* Optional flare burst across whole upper area */}
        {flareBurst > 0.1 && (
          <rect x={0} y={0} width={width} height={height * 0.6}
            fill={`hsl(${tintHue}, 80%, 70%)`} opacity={flareBurst * 0.18} style={{ mixBlendMode: "screen" }} />
        )}

        {/* Mountain ridge */}
        <path d={mountainPath} fill="url(#ab-mountain)" stroke="rgba(40, 30, 60, 0.4)" strokeWidth={1} />
        {/* Snow caps */}
        {[
          [0.10, 0.74], [0.27, 0.68], [0.46, 0.62], [0.62, 0.66], [0.82, 0.70],
        ].map(([x, y], i) => (
          <path key={`snow-${i}`}
            d={`M ${x * width - 8} ${y * height + 4}
                L ${x * width} ${y * height}
                L ${x * width + 8} ${y * height + 4}`}
            stroke="rgba(220, 230, 250, 0.55)" strokeWidth={2} fill="none" />
        ))}

        {/* Trees */}
        {treeNodes}

        {/* Snowy ground */}
        <rect x={0} y={height * 0.92} width={width} height={height * 0.08} fill="url(#ab-snow)" />
        {/* Snow texture dots */}
        {Array.from({ length: 60 }).map((_, i) => {
          const sx = ((i * 37) % 100) / 100 * width;
          const sy = height * (0.93 + ((i * 13) % 8) / 100);
          return <circle key={`snow-d-${i}`} cx={sx} cy={sy} r={1} fill="rgba(220, 230, 250, 0.75)" />;
        })}
      </svg>
    </div>
  );
};
