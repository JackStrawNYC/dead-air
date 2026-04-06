/**
 * LighterWave — Sea of lighters held aloft during ballads.
 *
 * 50-60 lighter flames across the bottom 30% of the frame, distributed in
 * 3 depth layers for crowd density. Each lighter has a small rectangular
 * metallic body, a detailed multi-zone flame (white-hot core, bright yellow
 * middle, orange outer, blue base), and a silhouette arm/wrist extending
 * from below. Every flame flickers independently via multi-sine oscillation.
 * The entire crowd sways gently side-to-side (collective sway, as at a real
 * show). Some lighters ride higher (raised arms) while others stay low.
 *
 * INVERSELY gated on energy — MORE visible during quiet/ballad passages,
 * fading out as the band gets loud. Perfect for Morning Dew quiet section,
 * Row Jimmy, Stella Blue, Black Peter.
 *
 * Audio mapping:
 *   energy        → inverse gate (visible when quiet)
 *   slowEnergy    → collective sway amplitude
 *   beatDecay     → sway synchronization pulse
 *   chromaHue     → ambient glow tint
 *   tempoFactor   → sway speed
 *   dynamicRange  → flame height variation
 *   vocalPresence → flame brightness boost (vocal ballad = brighter)
 *
 * Layer 1, low energy, 10-25% base opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LighterData {
  /** X position as fraction of width (0-1) */
  x: number;
  /** Y position as fraction of height — within bottom 30% */
  y: number;
  /** Depth layer: 0 = back (smallest, dimmest), 1 = mid, 2 = front */
  layer: number;
  /** Scale factor driven by layer (back smaller, front bigger) */
  scale: number;
  /** Brightness modifier driven by layer */
  layerBrightness: number;
  /** Arm raise height (how far the lighter is above the arm base) */
  armRaise: number;
  /** Flicker: primary sine frequency */
  flickerFreq1: number;
  /** Flicker: secondary (harmonic) sine frequency */
  flickerFreq2: number;
  /** Flicker: tertiary (subharmonic) sine frequency */
  flickerFreq3: number;
  /** Flicker: phase offset */
  flickerPhase: number;
  /** Sway: individual offset from collective sway */
  swayPhaseOffset: number;
  /** Sway: amplitude modifier (how loosely this person sways) */
  swayAmpMod: number;
  /** Vertical bob frequency (gentle arm fatigue movement) */
  bobFreq: number;
  /** Vertical bob amplitude (px) */
  bobAmp: number;
  /** Bob phase offset */
  bobPhase: number;
  /** Lighter body hue shift (metallic variation) */
  bodyHueShift: number;
  /** Flame hue (28-55, yellow to deep orange) */
  flameHue: number;
  /** Whether this lighter tilts slightly left or right */
  tiltDir: number;
  /** Tilt amount (radians, small) */
  tiltAmount: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NUM_LIGHTERS = 55;
const STAGGER_START = 60; // 2 seconds before fade-in begins
const FADE_IN_DURATION = 120; // 4 seconds to fully appear (lighters raise slowly)

/* Layer config: [yMin, yMax, scaleMin, scaleMax, brightnessMin, brightnessMax, count] */
const LAYER_CONFIG: [number, number, number, number, number, number, number][] = [
  [0.70, 0.78, 0.50, 0.70, 0.45, 0.60, 15], // back: small, dim, higher on screen
  [0.76, 0.86, 0.70, 0.95, 0.60, 0.80, 22], // mid: medium
  [0.84, 0.96, 0.90, 1.20, 0.75, 1.00, 18], // front: large, bright, lower on screen
];

/* ------------------------------------------------------------------ */
/*  Seeded lighter generation                                          */
/* ------------------------------------------------------------------ */

function generateLighters(seed: number): LighterData[] {
  const rng = seeded(seed);
  const lighters: LighterData[] = [];

  for (let layerIdx = 0; layerIdx < LAYER_CONFIG.length; layerIdx++) {
    const [yMin, yMax, scaleMin, scaleMax, brightMin, brightMax, count] = LAYER_CONFIG[layerIdx];
    for (let i = 0; i < count; i++) {
      lighters.push({
        x: 0.02 + rng() * 0.96,
        y: yMin + rng() * (yMax - yMin),
        layer: layerIdx,
        scale: scaleMin + rng() * (scaleMax - scaleMin),
        layerBrightness: brightMin + rng() * (brightMax - brightMin),
        armRaise: 20 + rng() * 45, // how high the lighter is above the arm base
        flickerFreq1: 0.08 + rng() * 0.14,
        flickerFreq2: 0.18 + rng() * 0.30,
        flickerFreq3: 0.03 + rng() * 0.06,
        flickerPhase: rng() * Math.PI * 2,
        swayPhaseOffset: (rng() - 0.5) * 0.6, // slight desync from collective sway
        swayAmpMod: 0.6 + rng() * 0.8,
        bobFreq: 0.008 + rng() * 0.018,
        bobAmp: 1.5 + rng() * 5,
        bobPhase: rng() * Math.PI * 2,
        bodyHueShift: rng() * 30 - 15, // metallic color variation
        flameHue: 28 + rng() * 27,
        tiltDir: rng() > 0.5 ? 1 : -1,
        tiltAmount: 0.02 + rng() * 0.12,
      });
    }
  }

  // Sort by y so back layer renders first (painter's algorithm)
  lighters.sort((a, b) => a.y - b.y);
  return lighters;
}

/* ------------------------------------------------------------------ */
/*  Single flame renderer                                              */
/* ------------------------------------------------------------------ */

interface FlameProps {
  /** Base size unit (px) */
  s: number;
  /** Flicker intensity 0-1 */
  flicker: number;
  /** Flame hue (28-55) */
  hue: number;
  /** Ambient hue tint from chroma (0-360) */
  ambientHue: number;
  /** Ambient tint strength (0-1) */
  ambientStrength: number;
  /** Overall alpha */
  alpha: number;
}

function renderFlame({ s, flicker, hue, ambientHue, ambientStrength, alpha }: FlameProps): React.ReactNode {
  // Mix in ambient hue from chromaHue — gentle tint on the glow
  const glowHue = hue + (ambientHue - hue) * ambientStrength * 0.15;
  const flickAlpha = alpha * (0.6 + flicker * 0.4);

  // Height varies with flicker
  const h = s * (1.8 + flicker * 0.5);
  const w = s * 0.55;

  return (
    <>
      {/* Ambient glow — large, soft */}
      <ellipse
        cx={0}
        cy={-h * 0.4}
        rx={s * 3.0}
        ry={s * 3.5}
        fill={`hsla(${glowHue}, 80%, 55%, ${flickAlpha * 0.12})`}
        style={{ filter: "blur(6px)" }}
      />
      {/* Outer flame — orange with slight blue base */}
      <path
        d={`M 0 ${-h}
            C ${w * 1.1} ${-h * 0.55}, ${w * 0.95} ${h * 0.15}, ${w * 0.3} ${h * 0.35}
            Q ${w * 0.15} ${h * 0.45}, 0 ${h * 0.4}
            Q ${-w * 0.15} ${h * 0.45}, ${-w * 0.3} ${h * 0.35}
            C ${-w * 0.95} ${h * 0.15}, ${-w * 1.1} ${-h * 0.55}, 0 ${-h}
            Z`}
        fill={`hsla(${hue + 8}, 100%, 55%, ${flickAlpha * 0.7})`}
      />
      {/* Blue base zone — real lighter flames have blue at ignition point */}
      <ellipse
        cx={0}
        cy={h * 0.3}
        rx={w * 0.55}
        ry={s * 0.35}
        fill={`hsla(220, 80%, 55%, ${flickAlpha * 0.5})`}
        style={{ filter: "blur(1px)" }}
      />
      {/* Middle flame — bright yellow */}
      <path
        d={`M 0 ${-h * 0.85}
            C ${w * 0.7} ${-h * 0.4}, ${w * 0.55} ${h * 0.05}, ${w * 0.15} ${h * 0.2}
            Q 0 ${h * 0.28}, ${-w * 0.15} ${h * 0.2}
            C ${-w * 0.55} ${h * 0.05}, ${-w * 0.7} ${-h * 0.4}, 0 ${-h * 0.85}
            Z`}
        fill={`hsla(${hue - 5}, 100%, 70%, ${flickAlpha * 0.85})`}
      />
      {/* White-hot core — intense bright center at base */}
      <path
        d={`M 0 ${-h * 0.55}
            C ${w * 0.35} ${-h * 0.2}, ${w * 0.25} ${h * 0.05}, 0 ${h * 0.12}
            C ${-w * 0.25} ${h * 0.05}, ${-w * 0.35} ${-h * 0.2}, 0 ${-h * 0.55}
            Z`}
        fill={`hsla(48, 100%, 95%, ${flickAlpha * 0.95})`}
        style={{ filter: "blur(0.5px)" }}
      />
      {/* Tip highlight — tiny bright point at apex */}
      <circle
        cx={0}
        cy={-h * 0.92}
        r={w * 0.2}
        fill={`hsla(40, 100%, 88%, ${flickAlpha * 0.6})`}
        style={{ filter: "blur(1px)" }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Single lighter renderer (body + arm silhouette + flame)            */
/* ------------------------------------------------------------------ */

interface LighterRenderProps {
  lighter: LighterData;
  px: number;
  py: number;
  tilt: number;
  flicker: number;
  ambientHue: number;
  ambientStrength: number;
  masterAlpha: number;
  height: number;
}

function renderLighter({
  lighter,
  px,
  py,
  tilt,
  flicker,
  ambientHue,
  ambientStrength,
  masterAlpha,
  height,
}: LighterRenderProps): React.ReactNode {
  const s = lighter.scale * 7; // base size unit
  const alpha = masterAlpha * lighter.layerBrightness;

  // Lighter body dimensions
  const bodyW = s * 0.5;
  const bodyH = s * 1.6;

  // Metal body gradient lightness based on layer hue shift
  const metalBase = 45 + lighter.bodyHueShift * 0.3;

  // Arm extends from body bottom down to bottom of frame
  const armLength = (1.0 - lighter.y) * height + 20;
  const wristWidth = s * 0.65;
  const forearmWidth = s * 0.85;

  return (
    <g transform={`translate(${px}, ${py}) rotate(${tilt})`}>
      {/* Arm/hand silhouette — dark shape extending downward */}
      <path
        d={`M ${-wristWidth * 0.5} ${bodyH * 0.3}
            L ${-forearmWidth * 0.5} ${armLength}
            L ${forearmWidth * 0.5} ${armLength}
            L ${wristWidth * 0.5} ${bodyH * 0.3}
            Z`}
        fill={`rgba(15, 12, 10, ${alpha * 0.85})`}
      />
      {/* Hand/fist gripping the lighter — rounded rectangle */}
      <rect
        x={-wristWidth * 0.65}
        y={bodyH * 0.1}
        width={wristWidth * 1.3}
        height={s * 1.0}
        rx={s * 0.2}
        ry={s * 0.2}
        fill={`rgba(20, 16, 14, ${alpha * 0.8})`}
      />
      {/* Lighter body — small metallic rectangle */}
      <rect
        x={-bodyW * 0.5}
        y={-bodyH * 0.5}
        width={bodyW}
        height={bodyH}
        rx={s * 0.06}
        ry={s * 0.06}
        fill={`hsla(${210 + lighter.bodyHueShift}, 8%, ${metalBase}%, ${alpha * 0.9})`}
        stroke={`hsla(${210 + lighter.bodyHueShift}, 5%, ${metalBase + 15}%, ${alpha * 0.4})`}
        strokeWidth={0.5}
      />
      {/* Metallic highlight strip on lighter body */}
      <rect
        x={-bodyW * 0.15}
        y={-bodyH * 0.45}
        width={bodyW * 0.2}
        height={bodyH * 0.85}
        rx={s * 0.03}
        fill={`hsla(${210 + lighter.bodyHueShift}, 6%, ${metalBase + 20}%, ${alpha * 0.35})`}
      />
      {/* Lighter top (metal windguard) */}
      <rect
        x={-bodyW * 0.35}
        y={-bodyH * 0.55}
        width={bodyW * 0.7}
        height={s * 0.2}
        rx={s * 0.03}
        fill={`hsla(${210 + lighter.bodyHueShift}, 5%, ${metalBase + 10}%, ${alpha * 0.7})`}
      />
      {/* Flame — positioned above the lighter body */}
      <g transform={`translate(0, ${-bodyH * 0.55 - s * 0.3})`}>
        {renderFlame({
          s,
          flicker,
          hue: lighter.flameHue,
          ambientHue,
          ambientStrength,
          alpha,
        })}
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const LighterWave: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const audio = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const lighters = React.useMemo(() => generateLighters(19770508), []);

  /* ---- Master fade-in (lighters raise slowly into frame) ---- */
  const masterFade = interpolate(
    frame,
    [STAGGER_START, STAGGER_START + FADE_IN_DURATION],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  /* ---- INVERSE energy gating: MORE visible when quiet ---- */
  const energyGate = interpolate(audio.energy, [0.07, 0.22], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ---- Base opacity: higher when quieter ---- */
  const baseOpacity = interpolate(audio.energy, [0.0, 0.15], [0.25, 0.10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ---- Vocal presence boost: brighter during vocal ballads ---- */
  const vocalBoost = 1.0 + audio.vocalPresence * 0.25;

  /* ---- Dynamic range drives flame height variation ---- */
  const flameHeightMod = 0.85 + audio.dynamicRange * 0.3;

  const masterOpacity = Math.min(1, baseOpacity * masterFade * energyGate * vocalBoost);

  if (masterOpacity < 0.01) return null;

  /* ---- How many lighters visible (more during quiet passages) ---- */
  const visibleCount = Math.round(
    interpolate(audio.energy, [0.0, 0.18], [NUM_LIGHTERS, 30], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  /* ---- Collective sway: everyone sways together at shows ---- */
  const swaySpeed = 0.012 * tempoFactor;
  const swayBase = Math.sin(frame * swaySpeed) * (8 + audio.slowEnergy * 18);
  // beatDecay creates a sync pulse — on beat, everyone snaps together slightly
  const beatSync = audio.beatDecay * 3;

  /* ---- Ambient glow from chromaHue ---- */
  const ambientHue = audio.chromaHue;
  // Strength: stronger in quieter passages
  const ambientStrength = interpolate(audio.energy, [0.0, 0.2], [0.6, 0.1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ---- Per-lighter stagger (they don't all appear at once) ---- */
  const staggerWindow = FADE_IN_DURATION * 0.7;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity: masterOpacity, mixBlendMode: "screen" }}
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          {/* Subtle top-down gradient mask so upper lighters fade into darkness */}
          <linearGradient id="lighter-depth-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.55" stopColor="white" stopOpacity={0.3} />
            <stop offset="0.75" stopColor="white" stopOpacity={0.7} />
            <stop offset="1.0" stopColor="white" stopOpacity={1.0} />
          </linearGradient>
          <mask id="lighter-depth-mask">
            <rect width={width} height={height} fill="url(#lighter-depth-fade)" />
          </mask>
        </defs>

        <g mask="url(#lighter-depth-mask)">
          {lighters.slice(0, visibleCount).map((lighter, i) => {
            /* ---- Per-lighter stagger fade ---- */
            const lighterDelay = (i / NUM_LIGHTERS) * staggerWindow;
            const lighterFade = interpolate(
              frame,
              [STAGGER_START + lighterDelay, STAGGER_START + lighterDelay + 60],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) },
            );
            if (lighterFade < 0.02) return null;

            /* ---- Multi-sine flicker (3 harmonics) ---- */
            const f1 = Math.sin(frame * lighter.flickerFreq1 + lighter.flickerPhase);
            const f2 = Math.sin(frame * lighter.flickerFreq2 + lighter.flickerPhase * 1.7);
            const f3 = Math.sin(frame * lighter.flickerFreq3 + lighter.flickerPhase * 0.5);
            const flicker = 0.5 + f1 * 0.28 + f2 * 0.15 + f3 * 0.07;
            const flickerClamped = Math.max(0.15, Math.min(1, flicker));

            /* ---- Collective sway + individual variation ---- */
            const individualSway =
              Math.sin(frame * swaySpeed + lighter.swayPhaseOffset) * lighter.swayAmpMod * 5;
            const totalSway = (swayBase + individualSway + beatSync) * lighter.swayAmpMod;

            /* ---- Vertical bob (arm fatigue) ---- */
            const bob = Math.sin(frame * lighter.bobFreq + lighter.bobPhase) * lighter.bobAmp;

            /* ---- Position ---- */
            const px = lighter.x * width + totalSway;
            const py = lighter.y * height + bob;

            /* ---- Tilt (slight lean) ---- */
            const tiltBase = lighter.tiltDir * lighter.tiltAmount * (180 / Math.PI);
            const tiltSway = (totalSway / width) * 8; // lean into sway direction
            const tilt = tiltBase + tiltSway;

            return (
              <g key={i} style={{ opacity: lighterFade }}>
                {renderLighter({
                  lighter,
                  px,
                  py,
                  tilt,
                  flicker: flickerClamped * flameHeightMod,
                  ambientHue,
                  ambientStrength,
                  masterAlpha: lighterFade,
                  height,
                })}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
