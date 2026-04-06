/**
 * MeteorShower — A+++ dramatic streaking meteor shower overlay.
 *
 * 8-15 active streaking meteors continuously spawning from upper-right and
 * arcing diagonally across the night sky. Each meteor renders a 3-layer trail:
 *   1. Outer atmospheric glow (wide, blurred, low alpha)
 *   2. Main streak gradient (medium width, fading head-to-tail)
 *   3. Bright core line (thin, near-opaque, hot center)
 * plus a white-hot head circle with multi-ring radial glow.
 *
 * Spawn pool is precomputed in useMemo as a deterministic schedule. At render
 * time we pick the active subset based on energy (more meteors when louder)
 * and inject onset-driven bursts (2-3 simultaneous spawns on transient hits).
 *
 * Color palette: 4 in 5 meteors are white-blue (cool ionized air), 1 in 5
 * are warm orange/red (iron/sodium burn). All hues are subtly tinted by the
 * dominant chroma hue from the audio so meteors echo the band's tonality.
 *
 * Some meteors "burst" at end-of-life: a small radial particle explosion
 * scaled by bass intensity. Bursts only fire when life > 0.85 and the meteor
 * was flagged "exploder" at spawn time (about 1 in 3).
 *
 * Background is a thin dark sky tint so meteors pop against any underlying
 * shader without fighting it.
 *
 * Audio reactivity:
 *   energy        → active meteor count (8-15) + master opacity
 *   beatDecay     → head brightness flash + glow ring radius
 *   chromaHue     → subtle hue shift on cool palette (rotates blue→cyan→teal)
 *   onsetEnvelope → triggers burst spawns (2-3 simultaneous meteors)
 *   bass          → explosion particle radius and density
 *   tempoFactor   → spawn rate (faster songs = more frequent meteors)
 *
 * Perfect for Dark Star, St. Stephen, China>Rider transitions.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Types & Constants                                                  */
/* ------------------------------------------------------------------ */

interface Meteor {
  spawnFrame: number;   // frame this meteor enters the world
  lifetime: number;     // total frames it lives (60-180)
  startX: number;       // normalized entry x (0-1, biased upper-right)
  startY: number;       // normalized entry y (0-1, biased top)
  angle: number;        // travel angle in radians (down-left arcs)
  speed: number;        // pixels travelled per frame
  trailLength: number;  // trail length in pixels at full extension
  headRadius: number;   // head circle radius in pixels
  trailWidth: number;   // trail stroke width in pixels
  warmth: 0 | 1;        // 0 = cool white-blue, 1 = warm orange-red
  exploder: boolean;    // whether this meteor explodes at end-of-life
  phase: number;        // per-meteor jitter phase
}

interface ActiveMeteor { meteor: Meteor; life: number /* 0-1 */; }

const SCHEDULE_LENGTH_FRAMES = 108000;  // 1 hour at 30fps
const BASE_SPAWN_INTERVAL = 8;          // attempt spawn every 8 frames at base tempo
const SCHEDULE_SEED = 19770508;         // Cornell '77 — deterministic
const ONSET_BURST_THRESHOLD = 0.55;
const ONSET_BURST_COOLDOWN = 18;
const MAX_ACTIVE_METEORS = 15;
const MIN_ACTIVE_METEORS = 8;

/* ------------------------------------------------------------------ */
/*  Schedule Generation                                                */
/* ------------------------------------------------------------------ */

function generateSchedule(seed: number): Meteor[] {
  const rng = seeded(seed);
  const schedule: Meteor[] = [];
  for (let f = 0; f < SCHEDULE_LENGTH_FRAMES; f += BASE_SPAWN_INTERVAL) {
    const jitter = Math.floor(rng() * BASE_SPAWN_INTERVAL);
    const isFast = rng() < 0.4;
    schedule.push({
      spawnFrame: f + jitter,
      lifetime: isFast ? 60 + Math.floor(rng() * 40) : 110 + Math.floor(rng() * 70),
      startX: 0.55 + rng() * 0.5,         // upper-right entry band
      startY: -0.05 + rng() * 0.45,
      angle: Math.PI * 0.55 + rng() * Math.PI * 0.3, // down-left arcs
      speed: isFast ? 14 + rng() * 10 : 6 + rng() * 6,
      trailLength: isFast ? 180 + rng() * 120 : 280 + rng() * 220,
      headRadius: 2.2 + rng() * 2.4,
      trailWidth: 1.6 + rng() * 2.0,
      warmth: rng() < 0.2 ? 1 : 0,         // 1 in 5 warm
      exploder: rng() < 0.33,              // 1 in 3 explodes
      phase: rng() * Math.PI * 2,
    });
  }
  return schedule;
}

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

interface MeteorColors { core: string; hot: string; glow: string; glowFaint: string; trailCss: string; }

function meteorColors(warmth: 0 | 1, chromaHue: number, beatBoost: number): MeteorColors {
  if (warmth === 1) {
    // Warm: iron-burn orange/red, subtly chroma-modulated
    const hue = 18 + Math.sin(chromaHue * 0.017) * 8;
    const lum = Math.min(95, 78 + beatBoost * 12);
    return {
      core: `hsl(${hue + 12}, 100%, 98%)`,
      hot: `hsl(${hue + 5}, 100%, ${lum}%)`,
      glow: `hsla(${hue}, 95%, 60%, 0.85)`,
      glowFaint: `hsla(${hue - 4}, 95%, 50%, 0.18)`,
      trailCss: `hsla(${hue}, 95%, 65%, 0.0)`,
    };
  }
  // Cool: white-blue, hue tinted by chroma (~182-218)
  const hue = 200 + Math.sin(chromaHue * 0.0175) * 18;
  const sat = 60 + beatBoost * 25;
  const lum = Math.min(98, 86 + beatBoost * 8);
  return {
    core: `hsl(${hue}, 30%, 99%)`,
    hot: `hsl(${hue}, ${sat}%, ${lum}%)`,
    glow: `hsla(${hue}, ${sat + 20}%, 78%, 0.85)`,
    glowFaint: `hsla(${hue + 6}, ${sat}%, 60%, 0.18)`,
    trailCss: `hsla(${hue}, ${sat + 10}%, 70%, 0.0)`,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const MeteorShower: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const schedule = React.useMemo(() => generateSchedule(SCHEDULE_SEED), []);

  /* ---- Audio-derived parameters ---- */

  const { energy, beatDecay, chromaHue, onsetEnvelope: onsetEnv, bass } = snap;
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

  // Master opacity floor so meteors stay visible even at low energy
  const masterOpacity = interpolate(energy, [0.02, 0.1, 0.4], [0.55, 0.85, 1.0], clamp);
  // Active count: louder = more meteors
  const targetCount = Math.round(
    interpolate(energy, [0.02, 0.15, 0.45], [MIN_ACTIVE_METEORS, 11, MAX_ACTIVE_METEORS], clamp),
  );
  // Speed scaling: tempo + energy
  const speedScale = (0.85 + energy * 0.6) * tempoFactor;
  // Trail length: longer at high energy
  const trailMult = interpolate(energy, [0.05, 0.5], [0.85, 1.35], clamp);

  /* ---- Active meteor selection ---- */

  // Walk schedule and collect meteors whose lifetime window contains current frame.
  // Schedule is sorted by spawnFrame so we can early-exit once we pass current frame.
  const active: ActiveMeteor[] = [];
  for (const m of schedule) {
    if (m.spawnFrame > frame) break;
    const elapsed = frame - m.spawnFrame;
    if (elapsed >= 0 && elapsed <= m.lifetime) {
      active.push({ meteor: m, life: elapsed / m.lifetime });
      if (active.length >= targetCount) break;
    }
  }

  /* ---- Onset burst injection ---- */
  /* When onsetEnvelope spikes we synthesize 2-3 extra meteors that share the */
  /* current frame as their spawn — they appear in-flight, feeling like a hit. */

  if (onsetEnv > ONSET_BURST_THRESHOLD && active.length < MAX_ACTIVE_METEORS) {
    // Quantize burst trigger to a cooldown window so we don't spam every frame
    const burstWindowId = Math.floor(frame / ONSET_BURST_COOLDOWN);
    const burstRng = seeded(SCHEDULE_SEED + burstWindowId * 31);
    const burstSize = 2 + Math.floor(burstRng() * 2); // 2-3
    for (let b = 0; b < burstSize && active.length < MAX_ACTIVE_METEORS; b++) {
      active.push({
        meteor: {
          spawnFrame: frame,
          lifetime: 70 + Math.floor(burstRng() * 30),
          startX: 0.6 + burstRng() * 0.45,
          startY: -0.05 + burstRng() * 0.35,
          angle: Math.PI * 0.55 + burstRng() * Math.PI * 0.3,
          speed: 16 + burstRng() * 10,
          trailLength: 220 + burstRng() * 160,
          headRadius: 2.8 + burstRng() * 2.0,
          trailWidth: 2.0 + burstRng() * 1.8,
          warmth: burstRng() < 0.25 ? 1 : 0,
          exploder: burstRng() < 0.5,
          phase: burstRng() * Math.PI * 2,
        },
        life: 0.04, // start nearly at birth so the streak emerges in-flight
      });
    }
  }

  /* ---- Render meteors ---- */

  const meteorElements = active.map(({ meteor, life }, idx) => {
    // Position along travel vector
    const distance = life * meteor.speed * meteor.lifetime * speedScale;
    const cosA = Math.cos(meteor.angle);
    const sinA = Math.sin(meteor.angle);
    const headX = meteor.startX * width + cosA * distance;
    const headY = meteor.startY * height + sinA * distance;

    // Trail ramps in over first 12% of life
    const trailRamp = interpolate(life, [0, 0.12], [0.25, 1], clamp);
    const trailLen = meteor.trailLength * trailMult * trailRamp;
    const tailX = headX - cosA * trailLen;
    const tailY = headY - sinA * trailLen;

    // Cull if entirely off-screen on any axis
    if (
      (headX < -trailLen && tailX < -trailLen) ||
      (headX > width + trailLen && tailX > width + trailLen) ||
      (headY > height + trailLen && tailY > height + trailLen)
    ) return null;

    // Fade-in / fade-out envelope
    const fadeIn = interpolate(life, [0, 0.08], [0, 1], clamp);
    const fadeOut = interpolate(life, [0.78, 1], [1, 0], clamp);
    const lifeAlpha = Math.min(fadeIn, fadeOut);

    // Beat-driven head brightness flash
    const beatBoost = beatDecay * 0.7;
    const colors = meteorColors(meteor.warmth, chromaHue, beatBoost);

    // Per-meteor unique IDs for gradients/filters
    const gradId = `mtr-trail-${idx}-${meteor.spawnFrame}`;
    const coreGradId = `mtr-core-${idx}-${meteor.spawnFrame}`;
    const glowFilterId = `mtr-glow-${idx}-${meteor.spawnFrame}`;

    // Head sizing pulses with beatDecay
    const headR = meteor.headRadius * (1 + beatBoost * 0.55);
    const headGlowR = headR * (4.5 + beatBoost * 1.2);
    const haloR = headR * (8 + beatBoost * 2.0);

    // Burst — explosion at end-of-life for exploder meteors
    const burstActiveLocal = meteor.exploder && life > 0.85;
    const burstProgress = burstActiveLocal ? interpolate(life, [0.85, 1], [0, 1], clamp) : 0;
    const burstRadius = burstProgress * (28 + bass * 70);
    const burstAlpha = (1 - burstProgress) * (0.6 + bass * 0.4) * lifeAlpha;
    const burstParticleCount = 8;

    const blurOuter = `blur(${meteor.trailWidth * 2}px)`;
    const blurMain = `blur(${meteor.trailWidth * 0.5}px)`;
    const blurHalo = `blur(${headR * 2.2}px)`;
    const blurMid = `blur(${headR * 0.9}px)`;

    return (
      <g key={`mtr-${meteor.spawnFrame}-${idx}`} opacity={lifeAlpha}>
        <defs>
          {/* Trail gradient: transparent at tail -> bright at head */}
          <linearGradient id={gradId} x1={tailX} y1={tailY} x2={headX} y2={headY} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={colors.trailCss} stopOpacity="0" />
            <stop offset="55%" stopColor={colors.glowFaint} stopOpacity="0.25" />
            <stop offset="85%" stopColor={colors.glow} stopOpacity="0.7" />
            <stop offset="100%" stopColor={colors.hot} stopOpacity="0.95" />
          </linearGradient>
          {/* Core line gradient: ultra-bright near head only */}
          <linearGradient id={coreGradId} x1={tailX} y1={tailY} x2={headX} y2={headY} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={colors.hot} stopOpacity="0" />
            <stop offset="78%" stopColor={colors.hot} stopOpacity="0.55" />
            <stop offset="100%" stopColor={colors.core} stopOpacity="1" />
          </linearGradient>
          {/* Soft glow filter for the head */}
          <filter id={glowFilterId} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation={headR * 1.3} />
          </filter>
        </defs>

        {/* Layer 1 — Outer atmospheric glow (very wide, blurred) */}
        <line
          x1={tailX} y1={tailY} x2={headX} y2={headY}
          stroke={`url(#${gradId})`} strokeWidth={meteor.trailWidth * 6} strokeLinecap="round"
          opacity={0.35} style={{ filter: blurOuter, mixBlendMode: "screen" }}
        />
        {/* Layer 2 — Main streak (medium width, full gradient) */}
        <line
          x1={tailX} y1={tailY} x2={headX} y2={headY}
          stroke={`url(#${gradId})`} strokeWidth={meteor.trailWidth * 2.4} strokeLinecap="round"
          opacity={0.85} style={{ filter: blurMain, mixBlendMode: "screen" }}
        />
        {/* Layer 3 — Bright core line (thin, hot, near-opaque) */}
        <line
          x1={tailX} y1={tailY} x2={headX} y2={headY}
          stroke={`url(#${coreGradId})`} strokeWidth={meteor.trailWidth * 0.85} strokeLinecap="round"
          style={{ mixBlendMode: "screen" }}
        />

        {/* Outer halo behind head */}
        <circle cx={headX} cy={headY} r={haloR} fill={colors.glowFaint}
          style={{ filter: blurHalo, mixBlendMode: "screen" }} />
        {/* Mid glow ring */}
        <circle cx={headX} cy={headY} r={headGlowR} fill={colors.glow} opacity={0.55}
          style={{ filter: blurMid, mixBlendMode: "screen" }} />
        {/* White-hot head core */}
        <circle cx={headX} cy={headY} r={headR} fill={colors.core} filter={`url(#${glowFilterId})`} />
        {/* Tiny pinpoint for crispness */}
        <circle cx={headX} cy={headY} r={Math.max(0.8, headR * 0.45)} fill="#FFFFFF" />

        {/* Burst particles at end-of-life */}
        {burstActiveLocal && (
          <g opacity={burstAlpha}>
            {Array.from({ length: burstParticleCount }, (_, p) => {
              const a = (p / burstParticleCount) * Math.PI * 2 + meteor.phase;
              const px = headX + Math.cos(a) * burstRadius;
              const py = headY + Math.sin(a) * burstRadius;
              const pr = (1.4 + bass * 2.2) * (1 - burstProgress * 0.6);
              return (
                <circle key={`bp-${p}`} cx={px} cy={py} r={pr} fill={colors.hot}
                  style={{ filter: "blur(1px)", mixBlendMode: "screen" }} />
              );
            })}
            {/* Central flash */}
            <circle cx={headX} cy={headY} r={burstRadius * 0.4} fill={colors.glow}
              style={{ filter: `blur(${burstRadius * 0.3}px)`, mixBlendMode: "screen" }} />
          </g>
        )}
      </g>
    );
  });

  /* ---- Compose ---- */

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Subtle dark sky tint so meteors pop without obscuring underlying shader */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 70% 30%, rgba(6,8,18,0.18) 0%, rgba(2,3,8,0.32) 60%, rgba(0,0,0,0.42) 100%)",
          mixBlendMode: "multiply",
          opacity: masterOpacity,
        }}
      />
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: masterOpacity }}
        viewBox={`0 0 ${width} ${height}`}
      >
        {meteorElements}
      </svg>
    </div>
  );
};
