/**
 * LighterWave — A+++ overlay: a sea of hundreds of lighters held aloft
 * across the lower 60% of the frame during a ballad. Distant stage at the
 * back, dark venue, atmospheric haze, drifting smoke, hundreds of small
 * flickering flames each with a 3-layer glow halo. Each lighter has a
 * unique flicker phase and slight sway. Rear stage spotlight cuts through
 * the smoke from above. The image of a Dead show in 1977.
 *
 * Audio reactivity:
 *   slowEnergy   → overall flame brightness and atmospheric warmth
 *   energy       → flame size and sway amplitude
 *   bass         → ground rumble and crowd sway
 *   beatDecay    → simultaneous flicker pulse
 *   onsetEnvelope→ stage flare
 *   chromaHue    → background tint
 *   tempoFactor  → sway speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 820;
const FRONT_FLAMES = 80;
const MID_FLAMES = 90;
const BACK_FLAMES = 110;
const SMOKE_PUFFS = 16;
const STAR_COUNT = 50;
const STAGE_LIGHT_COUNT = 5;

interface Flame {
  x: number;
  y: number;
  size: number;
  flickerSpeed: number;
  flickerAmp: number;
  swayPhase: number;
  hueOffset: number;
  phase: number;
}

interface SmokePuff {
  x: number;
  y: number;
  rx: number;
  ry: number;
  drift: number;
  shade: number;
  phase: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

function buildFlames(seed: number, count: number, yMin: number, yMax: number): Flame[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: rng(),
    y: yMin + rng() * (yMax - yMin),
    size: 0.7 + rng() * 0.6,
    flickerSpeed: 0.15 + rng() * 0.30,
    flickerAmp: 0.2 + rng() * 0.4,
    swayPhase: rng() * Math.PI * 2,
    hueOffset: -8 + rng() * 16,
    phase: rng() * Math.PI * 2,
  }));
}

function buildSmoke(): SmokePuff[] {
  const rng = seeded(80_115_236);
  return Array.from({ length: SMOKE_PUFFS }, () => ({
    x: rng(),
    y: 0.18 + rng() * 0.30,
    rx: 0.10 + rng() * 0.20,
    ry: 0.04 + rng() * 0.06,
    drift: 0.0001 + rng() * 0.00040,
    shade: 0.18 + rng() * 0.22,
    phase: rng() * Math.PI * 2,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(63_022_704);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.30,
    size: 0.4 + rng() * 1.4,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const LighterWave: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const frontFlames = React.useMemo(() => buildFlames(11_667_223, FRONT_FLAMES, 0.78, 0.97), []);
  const midFlames = React.useMemo(() => buildFlames(22_778_334, MID_FLAMES, 0.62, 0.82), []);
  const backFlames = React.useMemo(() => buildFlames(33_889_445, BACK_FLAMES, 0.50, 0.68), []);
  const smoke = React.useMemo(buildSmoke, []);
  const stars = React.useMemo(buildStars, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const flameGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.6, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const energy = snap.energy;
  const bass = snap.bass;
  const beatPulse = 1 + snap.beatDecay * 0.40;
  const onsetFlare = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  const baseHue = 28;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.4) % 360 + 360) % 360;
  const flameHueBase = 30;
  const flameCore = `hsl(${flameHueBase + 18}, 100%, 88%)`;
  const flameMid = `hsl(${flameHueBase + 6}, 95%, 65%)`;
  const flameDeep = `hsl(${flameHueBase - 14}, 90%, 45%)`;

  const skyTop = `hsl(${(tintHue + 220) % 360}, 30%, 4%)`;
  const skyMid = `hsl(${(tintHue + 240) % 360}, 24%, 8%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 36%, 14%)`;

  const horizonY = height * 0.46;
  const stageY = height * 0.42;
  const stageH = height * 0.10;

  // Flame renderer with 3-layer halo
  function renderFlame(f: Flame, rowIndex: 0 | 1 | 2, key: string) {
    const baseSize = rowIndex === 0 ? 1.0 : rowIndex === 1 ? 0.78 : 0.55;
    const t = frame * f.flickerSpeed + f.phase;
    const flicker = 0.7 + Math.sin(t) * f.flickerAmp + Math.sin(t * 2.7) * 0.15;
    const sway = Math.sin(frame * 0.012 * tempoFactor + f.swayPhase) * (1.5 + bass * 4) * baseSize;
    const px = f.x * width + sway;
    const py = f.y * height;
    const sz = f.size * baseSize * (1 + energy * 0.30) * beatPulse;
    const glowR = sz * 18;
    const halo2R = sz * 10;
    const flameW = sz * 1.8;
    const flameH = sz * 5.5 * flicker;
    const flameHue = (flameHueBase + f.hueOffset) % 360;
    const fCore = `hsl(${flameHue + 22}, 100%, 92%)`;
    const fMid = `hsl(${flameHue + 6}, 95%, 65%)`;
    const fDeep = `hsl(${flameHue - 12}, 90%, 45%)`;
    return (
      <g key={key}>
        {/* outer glow halo */}
        <circle cx={px} cy={py} r={glowR} fill={fDeep} opacity={0.10 * flameGlow * flicker} />
        {/* mid halo */}
        <circle cx={px} cy={py} r={halo2R} fill={fMid} opacity={0.22 * flameGlow * flicker} />
        {/* inner halo */}
        <circle cx={px} cy={py} r={sz * 5} fill={fCore} opacity={0.36 * flameGlow * flicker} />
        {/* lighter body silhouette below the flame */}
        <rect x={px - sz * 1.4} y={py + sz * 0.5} width={sz * 2.8} height={sz * 4} rx={sz * 0.4} fill="rgba(8, 6, 12, 0.85)" />
        {/* flame body teardrop */}
        <ellipse cx={px} cy={py - flameH * 0.3} rx={flameW} ry={flameH * 0.5} fill={fDeep} />
        <ellipse cx={px} cy={py - flameH * 0.45} rx={flameW * 0.65} ry={flameH * 0.4} fill={fMid} />
        <ellipse cx={px} cy={py - flameH * 0.55} rx={flameW * 0.32} ry={flameH * 0.28} fill={fCore} />
      </g>
    );
  }

  // Smoke clouds
  const smokeNodes = smoke.map((s, i) => {
    const drift = (s.x + frame * s.drift) % 1.2 - 0.1;
    const breath = 1 + Math.sin(frame * 0.012 + s.phase) * 0.06;
    return (
      <ellipse
        key={`sm-${i}`}
        cx={drift * width}
        cy={s.y * height}
        rx={s.rx * width * breath}
        ry={s.ry * height * breath}
        fill={`rgba(${28 + s.shade * 14},${24 + s.shade * 12},${36 + s.shade * 16},${0.40 + flameGlow * 0.22})`}
      />
    );
  });

  // Stars
  const starNodes = stars.map((s, i) => {
    const tw = 0.5 + Math.sin(frame * 0.05 + s.phase) * 0.45;
    return <circle key={`star-${i}`} cx={s.x * width} cy={s.y * height} r={s.size * tw} fill="rgba(240, 232, 220, 0.85)" />;
  });

  // Stage spotlights (diagonal cones from above, hitting smoke)
  const stageBeams = Array.from({ length: STAGE_LIGHT_COUNT }).map((_, i) => {
    const sx = width * (0.20 + (i / (STAGE_LIGHT_COUNT - 1)) * 0.60);
    const sy = stageY - 8;
    const angle = -Math.PI / 2 + (i - (STAGE_LIGHT_COUNT - 1) / 2) * 0.18 + Math.sin(frame * 0.005 + i) * 0.15;
    const len = height * 0.8;
    const ex = sx + Math.cos(angle + Math.PI / 2) * len;
    const ey = sy - Math.abs(Math.sin(angle + Math.PI / 2)) * len;
    const w = 50 + beatPulse * 14;
    return (
      <g key={`sb-${i}`} style={{ mixBlendMode: "screen" }}>
        <path
          d={`M ${sx - 4} ${sy} L ${ex - w * 0.5} ${ey} L ${ex + w * 0.5} ${ey} L ${sx + 4} ${sy} Z`}
          fill={flameMid}
          opacity={0.10 * flameGlow}
        />
        <path
          d={`M ${sx - 2} ${sy} L ${ex - w * 0.22} ${ey} L ${ex + w * 0.22} ${ey} L ${sx + 2} ${sy} Z`}
          fill={flameCore}
          opacity={0.18 * flameGlow}
        />
      </g>
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="lw-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="lw-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(8, 4, 14, 0.4)" />
            <stop offset="100%" stopColor="rgba(2, 1, 4, 0.95)" />
          </linearGradient>
          <radialGradient id="lw-stagewash" cx="0.5" cy="1" r="0.7">
            <stop offset="0%" stopColor={flameCore} stopOpacity="0.42" />
            <stop offset="50%" stopColor={flameDeep} stopOpacity="0.18" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <filter id="lw-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#lw-sky)" />

        {/* Stars */}
        <g>{starNodes}</g>

        {/* Distant stage glow */}
        <ellipse cx={width * 0.5} cy={stageY + stageH} rx={width * 0.55} ry={height * 0.16} fill="url(#lw-stagewash)" />

        {/* Stage truss */}
        <g opacity={0.85}>
          <rect x={width * 0.16} y={stageY - 4} width={width * 0.68} height={4} fill="rgba(18, 14, 22, 0.95)" />
          <rect x={width * 0.16} y={stageY - 4} width={5} height={stageH + 4} fill="rgba(18, 14, 22, 0.95)" />
          <rect x={width * 0.84 - 5} y={stageY - 4} width={5} height={stageH + 4} fill="rgba(18, 14, 22, 0.95)" />
          {Array.from({ length: 18 }).map((_, i) => (
            <line
              key={`tr-${i}`}
              x1={width * 0.16 + i * (width * 0.68 / 18)}
              y1={stageY}
              x2={width * 0.16 + (i + 1) * (width * 0.68 / 18)}
              y2={stageY + 4}
              stroke="rgba(28, 22, 32, 0.7)"
              strokeWidth={1}
            />
          ))}
          <rect x={width * 0.20} y={stageY} width={20} height={42} rx={3} fill="rgba(12, 8, 18, 0.95)" />
          <rect x={width * 0.80 - 20} y={stageY} width={20} height={42} rx={3} fill="rgba(12, 8, 18, 0.95)" />
        </g>

        {/* Distant band silhouettes */}
        <g>
          {[0.38, 0.50, 0.62].map((px, i) => {
            const x = px * width;
            const y = stageY + stageH;
            const figH = stageH * 0.85;
            return (
              <g key={`bd-${i}`}>
                <ellipse cx={x} cy={y - figH * 0.4} rx={figH * 0.18} ry={figH * 0.45} fill="rgba(4, 2, 8, 0.98)" />
                <circle cx={x} cy={y - figH * 0.85} r={figH * 0.10} fill="rgba(4, 2, 8, 0.98)" />
              </g>
            );
          })}
        </g>

        {/* Smoke layer */}
        <g filter="url(#lw-blur)">{smokeNodes}</g>

        {/* Stage beams */}
        <g>{stageBeams}</g>

        {/* Onset flare */}
        {onsetFlare > 0 && (
          <rect width={width} height={height} fill={`hsla(${tintHue}, 90%, 80%, ${onsetFlare * 0.10})`} />
        )}

        {/* Floor wash */}
        <rect x={0} y={horizonY} width={width} height={height - horizonY} fill="url(#lw-floor)" />

        {/* Back row flames (smallest) */}
        <g>{backFlames.map((f, i) => renderFlame(f, 2, `back-${i}`))}</g>

        {/* Mid row flames */}
        <g>{midFlames.map((f, i) => renderFlame(f, 1, `mid-${i}`))}</g>

        {/* Front row flames (largest) */}
        <g>{frontFlames.map((f, i) => renderFlame(f, 0, `front-${i}`))}</g>

        {/* Final atmospheric warmth wash */}
        <rect
          width={width}
          height={height}
          fill={`hsla(${tintHue}, 80%, 50%, ${0.05 + flameGlow * 0.04})`}
          style={{ mixBlendMode: "screen" }}
        />
      </svg>
    </div>
  );
};
