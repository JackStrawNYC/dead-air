/**
 * PeaceSignShower — A+++ psychedelic peace symbols floating across screen.
 *
 * Rich peace sign design:
 *   - Double-stroke outer ring with bevel highlight
 *   - Inner peace lines with rounded caps and slight taper
 *   - Inner glow emanating from the center
 *   - Every 3rd symbol gets decorative rosettes at the three line tips
 *
 * 8-12 symbols across 3 depth layers (large/close, medium, small/far):
 *   - Each rotates slowly at its own rate
 *   - Sine-wave horizontal drift (not straight down)
 *   - Ghostly trail echo behind each symbol
 *
 * Rainbow/psychedelic coloring:
 *   - Unique hue per symbol from chromaHue + offset
 *   - Neon glow that pulses with beat
 *   - Glow color shifts with chromaHue
 *
 * Audio reactivity:
 *   - Beat pulse on glow intensity and scale
 *   - Energy drives visible count (fewer when quiet, more when loud)
 *   - Onset spawns brief burst symbols
 *   - MusicalTime syncs rotation phase
 *   - TempoFactor scales fall/drift speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type DepthLayer = "far" | "mid" | "close";

interface PeaceParticle {
  startFrame: number;
  lifetime: number;
  startX: number; // 0-1 normalized
  size: number;
  hueOffset: number;
  driftAmplitude: number; // sine-wave horizontal drift amplitude
  driftFrequency: number; // sine-wave frequency
  fallSpeed: number; // base pixels per frame
  rotationSpeed: number;
  rotationStart: number;
  layer: DepthLayer;
  hasRosettes: boolean; // decorative flowers at tips
  trailCount: number; // 1-3 ghostly echoes
  id: number;
}

/* ------------------------------------------------------------------ */
/*  Particle generation                                                */
/* ------------------------------------------------------------------ */

const LAYER_CONFIG: Record<DepthLayer, { sizeRange: [number, number]; opacity: number; blur: number }> = {
  far: { sizeRange: [50, 80], opacity: 0.25, blur: 1.5 },
  mid: { sizeRange: [90, 140], opacity: 0.45, blur: 0.5 },
  close: { sizeRange: [160, 240], opacity: 0.65, blur: 0 },
};

const LAYERS: DepthLayer[] = ["far", "far", "far", "mid", "mid", "mid", "close", "close", "close", "close", "mid", "far"];

function generateParticles(totalFrames: number, seed: number): PeaceParticle[] {
  const rng = seeded(seed);
  const particles: PeaceParticle[] = [];
  let nextStart = 15;
  let idx = 0;

  while (nextStart < totalFrames) {
    const layer = LAYERS[idx % LAYERS.length];
    const cfg = LAYER_CONFIG[layer];
    const lifetime = 200 + Math.floor(rng() * 240); // 6.7-14.7s at 30fps
    const [minS, maxS] = cfg.sizeRange;

    particles.push({
      startFrame: nextStart,
      lifetime,
      startX: 0.05 + rng() * 0.9,
      size: minS + rng() * (maxS - minS),
      hueOffset: rng() * 360,
      driftAmplitude: 20 + rng() * 60,
      driftFrequency: 0.008 + rng() * 0.015,
      fallSpeed: (layer === "far" ? 0.4 : layer === "mid" ? 0.7 : 1.1) + rng() * 0.5,
      rotationSpeed: (rng() - 0.5) * 1.2,
      rotationStart: rng() * 360,
      layer,
      hasRosettes: idx % 3 === 0,
      trailCount: layer === "close" ? 3 : layer === "mid" ? 2 : 1,
      id: idx,
    });

    // Tighter spacing for denser field
    nextStart += 22 + Math.floor(rng() * 45);
    idx++;
  }
  return particles;
}

/* ------------------------------------------------------------------ */
/*  SVG sub-components                                                 */
/* ------------------------------------------------------------------ */

/** Tiny 5-petal rosette flower */
const Rosette: React.FC<{ cx: number; cy: number; r: number; color: string }> = ({ cx, cy, r, color }) => {
  const petals: React.ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i * 72 * Math.PI) / 180;
    const px = cx + Math.cos(angle) * r * 0.55;
    const py = cy + Math.sin(angle) * r * 0.55;
    petals.push(
      <ellipse
        key={i}
        cx={px}
        cy={py}
        rx={r * 0.45}
        ry={r * 0.3}
        transform={`rotate(${i * 72}, ${px}, ${py})`}
        fill={color}
        opacity={0.7}
      />,
    );
  }
  return (
    <g>
      {petals}
      <circle cx={cx} cy={cy} r={r * 0.22} fill="white" opacity={0.6} />
    </g>
  );
};

/** Rich peace sign SVG group */
const PeaceSign: React.FC<{
  size: number;
  color: string;
  glowColor: string;
  glowIntensity: number;
  hasRosettes: boolean;
  beatPulse: number;
}> = ({ size, color, glowColor, glowIntensity, hasRosettes, beatPulse }) => {
  const r = size * 0.44;
  const strokeBase = Math.max(2, size * 0.025);
  const strokeHighlight = strokeBase * 0.5;

  // Peace line endpoints
  const tipBottom = r;
  const tipLeft = { x: -r * 0.7, y: r * 0.7 };
  const tipRight = { x: r * 0.7, y: r * 0.7 };

  // Beat-driven glow radius
  const glowRadius = 6 + glowIntensity * 18 + beatPulse * 12;
  const glowRadiusOuter = 14 + glowIntensity * 24 + beatPulse * 16;

  // Rosette size
  const rosetteR = size * 0.04;

  return (
    <g>
      {/* Center glow — radial gradient */}
      <defs>
        <radialGradient id={`cg-${size.toFixed(0)}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={glowColor} stopOpacity={0.35 * glowIntensity} />
          <stop offset="60%" stopColor={glowColor} stopOpacity={0.1 * glowIntensity} />
          <stop offset="100%" stopColor={glowColor} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={0} cy={0} r={r * 1.3} fill={`url(#cg-${size.toFixed(0)})`} />

      {/* Outer ring — dark shadow stroke (bevel effect) */}
      <circle
        cx={0}
        cy={0}
        r={r}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={strokeBase + 2}
        fill="none"
      />

      {/* Outer ring — main color stroke */}
      <circle
        cx={0}
        cy={0}
        r={r}
        stroke={color}
        strokeWidth={strokeBase}
        fill="none"
        strokeLinecap="round"
      />

      {/* Outer ring — inner highlight (bevel top-light) */}
      <circle
        cx={0}
        cy={0}
        r={r - strokeBase * 0.3}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={strokeHighlight}
        fill="none"
        strokeDasharray={`${r * 1.5} ${r * 4.8}`}
        strokeDashoffset={r * 0.5}
      />

      {/* Peace lines — shadow layer */}
      <line x1={0} y1={-r} x2={0} y2={tipBottom} stroke="rgba(0,0,0,0.3)" strokeWidth={strokeBase + 1.5} strokeLinecap="round" />
      <line x1={0} y1={0} x2={tipLeft.x} y2={tipLeft.y} stroke="rgba(0,0,0,0.3)" strokeWidth={strokeBase + 1.5} strokeLinecap="round" />
      <line x1={0} y1={0} x2={tipRight.x} y2={tipRight.y} stroke="rgba(0,0,0,0.3)" strokeWidth={strokeBase + 1.5} strokeLinecap="round" />

      {/* Peace lines — main color with taper (thicker at center, thinner at tips) */}
      <line x1={0} y1={-r} x2={0} y2={tipBottom} stroke={color} strokeWidth={strokeBase} strokeLinecap="round" />
      <line x1={0} y1={0} x2={tipLeft.x} y2={tipLeft.y} stroke={color} strokeWidth={strokeBase * 0.9} strokeLinecap="round" />
      <line x1={0} y1={0} x2={tipRight.x} y2={tipRight.y} stroke={color} strokeWidth={strokeBase * 0.9} strokeLinecap="round" />

      {/* Peace lines — highlight shimmer */}
      <line x1={0} y1={-r * 0.6} x2={0} y2={r * 0.3} stroke="rgba(255,255,255,0.15)" strokeWidth={strokeHighlight} strokeLinecap="round" />

      {/* Decorative rosettes at the three line tips (every 3rd symbol) */}
      {hasRosettes && (
        <>
          <Rosette cx={0} cy={-r} r={rosetteR} color={color} />
          <Rosette cx={tipLeft.x} cy={tipLeft.y} r={rosetteR} color={color} />
          <Rosette cx={tipRight.x} cy={tipRight.y} r={rosetteR} color={color} />
        </>
      )}

      {/* Neon glow filters via drop-shadows (layered for richness) */}
      <circle
        cx={0}
        cy={0}
        r={r}
        stroke={glowColor}
        strokeWidth={strokeBase * 0.4}
        fill="none"
        opacity={glowIntensity * 0.5}
        style={{
          filter: `drop-shadow(0 0 ${glowRadius}px ${glowColor}) drop-shadow(0 0 ${glowRadiusOuter}px ${glowColor})`,
        }}
      />
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const PeaceSignShower: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const {
    energy,
    chromaHue,
    beatDecay,
    onsetEnvelope,
    musicalTime,
    bass,
    fastEnergy,
  } = snap;

  const particles = React.useMemo(
    () => generateParticles(durationInFrames, 55667),
    [durationInFrames],
  );

  // Beat pulse: sharp attack from beatDecay
  const beatPulse = Math.pow(beatDecay, 2.5);

  // Master opacity: 30-65% based on energy
  const masterOpacity = interpolate(energy, [0.02, 0.3], [0.30, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Max visible: 5 during quiet, 12 during loud
  const baseVisible = Math.round(
    interpolate(energy, [0.03, 0.35], [5, 10], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  // Onset burst: temporarily +3 symbols on strong transients
  const onsetBoost = onsetEnvelope > 0.5 ? Math.round(interpolate(onsetEnvelope, [0.5, 1], [1, 3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })) : 0;

  const maxVisible = Math.min(12, baseVisible + onsetBoost);

  // Collect active particles
  const active: Array<{ p: PeaceParticle; age: number }> = [];
  for (const p of particles) {
    const age = frame - p.startFrame;
    if (age >= 0 && age < p.lifetime) {
      active.push({ p, age });
      if (active.length >= maxVisible) break;
    }
  }

  if (active.length === 0) return null;

  // Glow intensity modulation from energy + bass
  const glowIntensity = interpolate(
    energy * 0.6 + bass * 0.4,
    [0.02, 0.35],
    [0.3, 1.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity: masterOpacity }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {active.map(({ p, age }) => {
          const t = age / p.lifetime;

          // Smooth fade in/out (ease curves, not linear)
          const fadeInRaw = Math.min(1, t * 5);
          const fadeIn = fadeInRaw * fadeInRaw * (3 - 2 * fadeInRaw); // smoothstep
          const fadeOutRaw = Math.min(1, (1 - t) * 5);
          const fadeOut = fadeOutRaw * fadeOutRaw * (3 - 2 * fadeOutRaw);
          const particleOpacity = Math.min(fadeIn, fadeOut);

          if (particleOpacity < 0.01) return null;

          // Layer config
          const layerCfg = LAYER_CONFIG[p.layer];

          // Position: sine-wave horizontal drift + downward fall
          const sineOffset = Math.sin(age * p.driftFrequency) * p.driftAmplitude;
          const baseX = p.startX * width + sineOffset;
          const y = -p.size * 0.5 + age * p.fallSpeed * tempoFactor;

          // Wrap horizontally with padding
          const wx = ((baseX % width) + width) % width;

          // Off-screen bottom? Skip.
          if (y > height + p.size) return null;

          // Rotation synced to musicalTime for phase coherence
          const rotation =
            p.rotationStart +
            age * p.rotationSpeed * tempoFactor +
            Math.sin(musicalTime * 0.5 + p.id) * 8;

          // Beat-driven scale pulse (subtle)
          const scalePulse = 1.0 + beatPulse * 0.08 + fastEnergy * 0.04;

          // Per-symbol hue: chromaHue + unique offset + slow drift
          const hue = (chromaHue + p.hueOffset + frame * 0.3) % 360;
          const sat = 90 + beatPulse * 10;
          const lum = 60 + beatPulse * 10;
          const color = `hsl(${hue}, ${sat}%, ${lum}%)`;

          // Glow color: shifted hue for prismatic effect
          const glowHue = (hue + 30 + beatPulse * 20) % 360;
          const glowColor = `hsl(${glowHue}, 100%, 70%)`;

          // Layer-adjusted opacity
          const finalOpacity = particleOpacity * layerCfg.opacity;

          // Trail ghosts: render N echoes behind the symbol at decreasing opacity
          const trails: React.ReactNode[] = [];
          for (let ti = p.trailCount; ti >= 1; ti--) {
            const trailAge = age - ti * 8; // 8 frames behind per echo
            if (trailAge < 0) continue;

            const trailSine = Math.sin(trailAge * p.driftFrequency) * p.driftAmplitude;
            const trailX = ((p.startX * width + trailSine) % width + width) % width;
            const trailY = -p.size * 0.5 + trailAge * p.fallSpeed * tempoFactor;
            const trailRot =
              p.rotationStart +
              trailAge * p.rotationSpeed * tempoFactor +
              Math.sin(musicalTime * 0.5 + p.id) * 8;

            const trailOpacity = finalOpacity * (0.15 / ti);

            trails.push(
              <g
                key={`trail-${p.id}-${ti}`}
                transform={`translate(${trailX}, ${trailY}) rotate(${trailRot}) scale(${scalePulse * (1 + ti * 0.03)})`}
                opacity={trailOpacity}
                style={{ filter: `blur(${1.5 + ti * 1.2}px)` }}
              >
                <PeaceSign
                  size={p.size}
                  color={color}
                  glowColor={glowColor}
                  glowIntensity={glowIntensity * 0.3}
                  hasRosettes={false}
                  beatPulse={0}
                />
              </g>,
            );
          }

          return (
            <React.Fragment key={p.id}>
              {/* Ghost trails (behind) */}
              {trails}

              {/* Main symbol */}
              <g
                transform={`translate(${wx}, ${y}) rotate(${rotation}) scale(${scalePulse})`}
                opacity={finalOpacity}
                style={{
                  filter: layerCfg.blur > 0 ? `blur(${layerCfg.blur}px)` : undefined,
                }}
              >
                <PeaceSign
                  size={p.size}
                  color={color}
                  glowColor={glowColor}
                  glowIntensity={glowIntensity}
                  hasRosettes={p.hasRosettes}
                  beatPulse={beatPulse}
                />
              </g>
            </React.Fragment>
          );
        })}
      </svg>
    </div>
  );
};
