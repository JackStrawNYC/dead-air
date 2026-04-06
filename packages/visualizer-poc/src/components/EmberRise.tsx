/**
 * EmberRise — A+++ cinematic ember field: 60+ particles across 3 depth layers.
 *
 * Each ember has a white-hot core, warm orange mid-glow, soft red outer halo,
 * and a faint smoke wisp trail. Embers tumble and rotate individually as they
 * rise at depth-dependent speeds. Sinusoidal wind drift driven by melodicDirection.
 * A glowing coal bed at the bottom with feTurbulence texture. 1-in-8 "spark"
 * embers are brighter with longer trails.
 *
 * Audio mapping:
 *   energy     → ember count + brightness
 *   bass       → coal bed glow intensity
 *   beatDecay  → burst of extra embers
 *   chromaHue  → warm palette tint
 *   tempoFactor→ rise speed multiplier
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ─── Types ─── */

interface EmberData {
  x: number;
  riseSpeed: number;
  driftFreq: number;
  driftAmp: number;
  driftPhase: number;
  baseSize: number;
  hue: number;
  lightness: number;
  cycleOffset: number;
  flickerFreq: number;
  flickerPhase: number;
  /** 0 = near (large/slow), 1 = mid, 2 = far (small/fast) */
  depthLayer: 0 | 1 | 2;
  /** Per-ember rotation speed (rad/frame) */
  rotSpeed: number;
  /** Per-ember rotation phase offset */
  rotPhase: number;
  /** True for 1-in-8 "spark" embers: brighter, longer trail */
  isSpark: boolean;
  /** Tumble wobble frequency */
  tumbleFreq: number;
  /** Tumble wobble amplitude (px) */
  tumbleAmp: number;
}

/* ─── Constants ─── */

const NUM_EMBERS = 72;
const RISE_CYCLE = 270; // ~9s full rise at 30fps
const STAGGER_FRAMES = 120; // 4s fade-in
const COAL_BED_HEIGHT = 0.08; // bottom 8% of screen

/** Depth layer config: [sizeMult, speedMult, opacityMult] */
const DEPTH_CONFIG: Record<0 | 1 | 2, [number, number, number]> = {
  0: [1.6, 0.7, 1.0],   // near: large, slow, full opacity
  1: [1.0, 1.0, 0.75],  // mid: normal
  2: [0.55, 1.4, 0.5],  // far: small, fast, dimmer
};

/* ─── Ember Generator ─── */

function generateEmbers(seed: number): EmberData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_EMBERS }, (_, i) => {
    const depthRoll = rng();
    const depthLayer: 0 | 1 | 2 = depthRoll < 0.25 ? 0 : depthRoll < 0.65 ? 1 : 2;
    const isSpark = i % 8 === 0; // every 8th ember is a spark
    return {
      x: rng(),
      riseSpeed: 1.2 + rng() * 3.0,
      driftFreq: 0.008 + rng() * 0.025,
      driftAmp: 12 + rng() * 45,
      driftPhase: rng() * Math.PI * 2,
      baseSize: isSpark ? 2.5 + rng() * 2.0 : 1.0 + rng() * 2.2,
      hue: rng() * 50, // 0-50: deep red through warm orange
      lightness: 55 + rng() * 35,
      cycleOffset: Math.floor(rng() * RISE_CYCLE),
      flickerFreq: 0.06 + rng() * 0.22,
      flickerPhase: rng() * Math.PI * 2,
      depthLayer,
      rotSpeed: (rng() - 0.5) * 0.12, // -0.06 to +0.06 rad/frame
      rotPhase: rng() * Math.PI * 2,
      isSpark,
      tumbleFreq: 0.02 + rng() * 0.04,
      tumbleAmp: 3 + rng() * 8,
    };
  });
}

/* ─── Component ─── */

interface Props {
  frames: EnhancedFrameData[];
}

export const EmberRise: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();
  const tempoFactor = useTempoFactor();
  const audio = useAudioSnapshot(frames);

  const embers = React.useMemo(
    () => generateEmbers(ctx?.showSeed ?? 19770508),
    [ctx?.showSeed],
  );

  /* ── Master fade-in ── */
  const masterFade = interpolate(frame, [STAGGER_FRAMES, STAGGER_FRAMES + 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  /* ── Audio-driven parameters ── */
  const { energy, bass, beatDecay, chromaHue, melodicDirection: melodicDir } = audio;

  // Overall opacity: 10-35% based on energy
  const baseOpacity = interpolate(energy, [0.02, 0.35], [0.10, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = baseOpacity * masterFade;
  if (masterOpacity < 0.01) return null;

  // Brightness multiplier from energy
  const brightnessMult = interpolate(energy, [0.02, 0.35], [0.5, 1.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Speed multiplier: energy + tempo
  const speedMult = interpolate(energy, [0.02, 0.35], [0.6, 1.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * Math.max(0.5, tempoFactor);

  // Visible count: energy + beatDecay burst
  const baseVisible = interpolate(energy, [0.02, 0.35], [30, NUM_EMBERS], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const beatBurst = Math.round(beatDecay * 12); // up to 12 extra on beat
  const visibleCount = Math.min(NUM_EMBERS, Math.round(baseVisible) + beatBurst);

  // Wind drift offset driven by melodicDirection
  const windOffset = melodicDir * 40; // px shift from melodic direction

  // Coal bed glow from bass
  const coalGlow = interpolate(bass, [0.05, 0.4], [0.3, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ChromaHue tinting: warm offset (-15..+15 degrees)
  const hueTint = ((chromaHue % 360) / 360) * 30 - 15;
  const coalPulse = 1.0 + beatDecay * 0.4;
  const sid = ctx?.showSeed ?? 0;
  const filterId = `ember-glow-${sid}`;
  const coalFilterId = `coal-glow-${sid}`;
  const smokeFilterId = `smoke-blur-${sid}`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          {/* Glow blur for embers */}
          <filter id={filterId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
          </filter>
          {/* Smoke trail blur */}
          <filter id={smokeFilterId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
          </filter>
          {/* Coal bed turbulence texture */}
          <filter id={coalFilterId} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              id={`coal-turb-${sid}`}
              type="fractalNoise"
              baseFrequency="0.04 0.02"
              numOctaves={4}
              seed={ctx?.showSeed ?? 42}
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="saturate"
              values="0"
              result="gray"
            />
            <feComponentTransfer in="gray" result="shaped">
              <feFuncA type="table" tableValues="0 0.3 0.6 0.4 0.1" />
            </feComponentTransfer>
            <feComposite in="SourceGraphic" in2="shaped" operator="in" />
          </filter>
        </defs>

        {/* ── Coal Bed: glowing gradient at bottom ── */}
        <g opacity={coalGlow * coalPulse}>
          {/* Base radial glow */}
          <ellipse
            cx={width / 2}
            cy={height + 10}
            rx={width * 0.6}
            ry={height * COAL_BED_HEIGHT * 2.5}
            fill={`hsla(${15 + hueTint}, 100%, 25%, 0.6)`}
            filter={`url(#${filterId})`}
          />
          {/* Hot center core */}
          <ellipse
            cx={width / 2}
            cy={height + 5}
            rx={width * 0.35}
            ry={height * COAL_BED_HEIGHT * 1.5}
            fill={`hsla(${25 + hueTint}, 100%, 45%, 0.5)`}
            filter={`url(#${filterId})`}
          />
          {/* Textured coal surface */}
          <rect
            x={0}
            y={height * (1 - COAL_BED_HEIGHT)}
            width={width}
            height={height * COAL_BED_HEIGHT}
            fill={`hsla(${10 + hueTint}, 90%, 18%, 0.7)`}
            filter={`url(#${coalFilterId})`}
          />
          {/* Bright ember-line along the top edge of the coal bed */}
          <line
            x1={width * 0.1}
            y1={height * (1 - COAL_BED_HEIGHT)}
            x2={width * 0.9}
            y2={height * (1 - COAL_BED_HEIGHT)}
            stroke={`hsla(${30 + hueTint}, 100%, 55%, ${0.3 * coalGlow})`}
            strokeWidth={2}
            filter={`url(#${filterId})`}
          />
        </g>

        {/* ── Ember Particles ── */}
        {embers.slice(0, visibleCount).map((ember, i) => {
          const [sizeMult, layerSpeedMult, opacityMult] = DEPTH_CONFIG[ember.depthLayer];

          // Cycle position: each ember loops independently
          const effectiveSpeed = speedMult * layerSpeedMult;
          const cycleFrame = (frame * effectiveSpeed + ember.cycleOffset) % RISE_CYCLE;
          const riseProgress = cycleFrame / RISE_CYCLE; // 0 = bottom, 1 = top

          // Y position: bottom to top
          const py = height * (1.02 - riseProgress * 1.12);

          // X position: base + sine drift + wind + tumble
          const baseDrift = Math.sin(frame * ember.driftFreq + ember.driftPhase) * ember.driftAmp;
          const tumble = Math.sin(frame * ember.tumbleFreq + ember.flickerPhase) * ember.tumbleAmp;
          const px = ember.x * width + baseDrift + windOffset * (0.5 + riseProgress * 0.5) + tumble;

          // Wrap X
          const wx = ((px % width) + width) % width;

          // Vertical fade: bright at bottom, fade near top
          const verticalFade = interpolate(
            riseProgress,
            [0, 0.08, 0.15, 0.65, 0.85, 1],
            [0.1, 0.6, 1, 0.7, 0.25, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          // Multi-frequency flicker for organic feel
          const f1 = Math.sin(frame * ember.flickerFreq + ember.flickerPhase) * 0.25;
          const f2 = Math.sin(frame * ember.flickerFreq * 2.3 + ember.flickerPhase * 0.7) * 0.1;
          const f3 = Math.sin(frame * ember.flickerFreq * 0.4 + ember.flickerPhase * 1.3) * 0.08;
          const flicker = 0.57 + f1 + f2 + f3;

          const alpha = verticalFade * flicker * brightnessMult * opacityMult;
          if (alpha < 0.02) return null;

          // Size: shrinks as ember rises (cooling), depth-scaled
          const r = ember.baseSize * sizeMult * (1 - riseProgress * 0.35);

          // Per-ember rotation angle
          const rotation = (frame * ember.rotSpeed + ember.rotPhase) * (180 / Math.PI);

          // Color: base hue + chroma tint, spark embers are hotter
          const h = ember.hue + hueTint;
          const sparkBoost = ember.isSpark ? 1.4 : 1.0;
          const lit = Math.min(97, ember.lightness * brightnessMult * sparkBoost);

          // 4-layer glow: core (white-hot), inner (warm orange), outer (red halo), smoke wisp
          const coreAlpha = alpha * 1.0;
          const midAlpha = alpha * 0.55;
          const haloAlpha = alpha * 0.22;
          const smokeAlpha = alpha * 0.08;

          const coreColor = `hsla(${h + 10}, 100%, ${Math.min(98, lit + 20)}%, ${coreAlpha})`;
          const midColor = `hsla(${h}, 100%, ${lit}%, ${midAlpha})`;
          const haloColor = `hsla(${Math.max(0, h - 8)}, 85%, ${Math.max(20, lit - 20)}%, ${haloAlpha})`;
          const smokeColor = `hsla(0, 0%, 40%, ${smokeAlpha})`;

          // Trail length: sparks get longer trails
          const trailLen = ember.isSpark ? r * 8 : r * 4;
          const trailAlpha = ember.isSpark ? alpha * 0.18 : alpha * 0.09;
          const trailColor = `hsla(${h - 5}, 70%, ${Math.max(15, lit - 30)}%, ${trailAlpha})`;

          // Smoke wisp: offset slightly behind (above, since rising)
          const smokeOffsetY = r * 3;

          return (
            <g
              key={i}
              transform={`rotate(${rotation}, ${wx}, ${py})`}
            >
              {/* Smoke wisp trail behind ember */}
              <ellipse
                cx={wx}
                cy={py + smokeOffsetY}
                rx={r * 1.8}
                ry={r * 3}
                fill={smokeColor}
                filter={`url(#${smokeFilterId})`}
              />

              {/* Ember trail (stretched ellipse below) */}
              <ellipse
                cx={wx}
                cy={py + trailLen * 0.4}
                rx={r * 0.7}
                ry={trailLen * 0.5}
                fill={trailColor}
                filter={`url(#${filterId})`}
              />

              {/* Outer red halo */}
              <circle
                cx={wx}
                cy={py}
                r={r * 4.5}
                fill={haloColor}
                filter={`url(#${filterId})`}
              />

              {/* Mid warm orange glow */}
              <circle
                cx={wx}
                cy={py}
                r={r * 2.2}
                fill={midColor}
                filter={`url(#${filterId})`}
              />

              {/* Bright white-hot core */}
              <circle
                cx={wx}
                cy={py}
                r={r}
                fill={coreColor}
              />

              {/* Tiny specular highlight on spark embers */}
              {ember.isSpark && (
                <circle
                  cx={wx - r * 0.25}
                  cy={py - r * 0.25}
                  r={r * 0.35}
                  fill={`hsla(60, 100%, 98%, ${coreAlpha * 0.7})`}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
