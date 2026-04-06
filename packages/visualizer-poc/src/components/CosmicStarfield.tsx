/**
 * CosmicStarfield — A+++ deep space starfield with parallax layers,
 * nebula wisps, twinkling diamonds, and hyperspace warp streaks.
 *
 * Three parallax layers:
 *   - Background (80): tiny, slow, dim — the infinite deep
 *   - Mid (40): medium brightness, moderate speed
 *   - Foreground (20): large, fast, blazing past the camera
 *
 * Each star is a cross/diamond shape with glow halo and motion streaks.
 * Twinkling at per-star frequencies. Mostly blue-white, 1-in-10 warm.
 * Nebula wisps: 2-3 large faint radial-gradient clouds, chromaHue-tinted.
 * Warp from center outward, energy-driven speed (gentle drift to hyperspace).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Star {
  angle: number; // radians from center
  speed: number; // 0-1 base speed factor
  baseRadius: number; // starting distance from center (0-1 normalized)
  size: number; // base pixel radius
  twinkleFreq: number; // oscillation frequency (radians per frame)
  twinklePhase: number; // phase offset for unique timing
  brightness: number; // base alpha 0-1
  isWarm: boolean; // ~10% warm (amber/gold), rest blue-white
  warmHue: number; // hue for warm stars (20-50 gold/amber range)
  layer: "bg" | "mid" | "fg";
}

interface Nebula {
  cx: number; // center x (0-1 normalized)
  cy: number; // center y (0-1 normalized)
  rx: number; // radius x (0-1 normalized)
  ry: number; // radius y (0-1 normalized)
  baseHue: number; // starting hue offset
  rotationSpeed: number; // radians per frame
  driftAngle: number; // drift direction
  driftSpeed: number; // drift magnitude per frame (normalized)
  opacity: number; // base opacity (very faint)
}

/* ------------------------------------------------------------------ */
/*  Layer Configs                                                      */
/* ------------------------------------------------------------------ */

const LAYER_CONFIG = {
  bg: { count: 80, sizeMin: 0.5, sizeMax: 1.5, speedMin: 0.1, speedMax: 0.3, brightMin: 0.15, brightMax: 0.4 },
  mid: { count: 40, sizeMin: 1.2, sizeMax: 2.8, speedMin: 0.3, speedMax: 0.6, brightMin: 0.35, brightMax: 0.7 },
  fg: { count: 20, sizeMin: 2.5, sizeMax: 5.0, speedMin: 0.6, speedMax: 1.0, brightMin: 0.6, brightMax: 1.0 },
} as const;

const NUM_NEBULAE = 3;
const STAR_CYCLE = 360; // frames per full warp cycle

/* ------------------------------------------------------------------ */
/*  Generation (deterministic)                                         */
/* ------------------------------------------------------------------ */

function generateStars(seed: number): Star[] {
  const rng = seeded(seed);
  const stars: Star[] = [];

  for (const [layer, cfg] of Object.entries(LAYER_CONFIG) as [Star["layer"], (typeof LAYER_CONFIG)[keyof typeof LAYER_CONFIG]][]) {
    for (let i = 0; i < cfg.count; i++) {
      const isWarm = rng() < 0.1;
      stars.push({
        angle: rng() * Math.PI * 2,
        speed: cfg.speedMin + rng() * (cfg.speedMax - cfg.speedMin),
        baseRadius: 0.02 + rng() * 0.25,
        size: cfg.sizeMin + rng() * (cfg.sizeMax - cfg.sizeMin),
        twinkleFreq: 0.03 + rng() * 0.12, // ~1-4 second cycles at 30fps
        twinklePhase: rng() * Math.PI * 2,
        brightness: cfg.brightMin + rng() * (cfg.brightMax - cfg.brightMin),
        isWarm,
        warmHue: 20 + rng() * 30, // gold-amber range
        layer,
      });
    }
  }
  return stars;
}

function generateNebulae(seed: number): Nebula[] {
  const rng = seeded(seed + 7777);
  return Array.from({ length: NUM_NEBULAE }, () => ({
    cx: 0.2 + rng() * 0.6,
    cy: 0.2 + rng() * 0.6,
    rx: 0.15 + rng() * 0.25,
    ry: 0.12 + rng() * 0.2,
    baseHue: rng() * 360,
    rotationSpeed: (rng() - 0.5) * 0.002,
    driftAngle: rng() * Math.PI * 2,
    driftSpeed: 0.00003 + rng() * 0.00006,
    opacity: 0.04 + rng() * 0.06, // very faint: 4-10%
  }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const CosmicStarfield: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const showSeed = ctx?.showSeed ?? 19770508;
  const stars = React.useMemo(() => generateStars(showSeed), [showSeed]);
  const nebulae = React.useMemo(() => generateNebulae(showSeed), [showSeed]);

  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  /* ---- Audio-derived parameters ---- */

  const energy = snap.energy;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue;
  const bass = snap.bass;
  const highs = snap.highs;

  // Warp speed: gentle drift at low energy, hyperspace at high
  const baseSpeed = interpolate(energy, [0.02, 0.15, 0.4, 0.7], [0.3, 0.8, 2.0, 4.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const beatPulse = 1 + beatDecay * 0.6;
  const speedMult = baseSpeed * beatPulse * tempoFactor;

  // Streak elongation: energy + highs boost
  const streakBase = interpolate(energy, [0.03, 0.2, 0.5, 0.8], [1, 6, 18, 40], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const highsStreakBoost = 1 + highs * 1.2;

  // Overall opacity: always present but scales with energy
  const opacity = interpolate(energy, [0.01, 0.1, 0.4], [0.2, 0.5, 0.75], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Beat brightness pulse: stars flash brighter on beats
  const beatBright = 1 + beatDecay * 0.4;

  // Bass throb: subtle size increase on bass hits
  const bassThrob = 1 + bass * 0.3;

  /* ---- Nebula rendering ---- */

  const nebulaElements = nebulae.map((neb, i) => {
    // Slow drift over time
    const drift = frame * neb.driftSpeed;
    const nebCx = (neb.cx + Math.cos(neb.driftAngle) * drift) * width;
    const nebCy = (neb.cy + Math.sin(neb.driftAngle) * drift) * height;
    const nebRx = neb.rx * width;
    const nebRy = neb.ry * height;

    // Rotation
    const rotation = frame * neb.rotationSpeed * (180 / Math.PI);

    // Hue: blend nebula base hue with chromaHue
    const hue = (neb.baseHue * 0.4 + chromaHue * 0.6) % 360;

    // Opacity: very faint, breathe slightly with slow energy
    const nebOpacity = neb.opacity * (0.7 + snap.slowEnergy * 0.6) * (0.8 + beatDecay * 0.15);

    const gradId = `nebula-grad-${i}`;

    return (
      <g key={`nebula-${i}`} transform={`rotate(${rotation} ${nebCx} ${nebCy})`}>
        <defs>
          <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`hsla(${hue}, 70%, 60%, ${nebOpacity})`} />
            <stop offset="35%" stopColor={`hsla(${hue}, 60%, 45%, ${nebOpacity * 0.5})`} />
            <stop offset="70%" stopColor={`hsla(${(hue + 30) % 360}, 50%, 35%, ${nebOpacity * 0.15})`} />
            <stop offset="100%" stopColor={`hsla(${hue}, 40%, 20%, 0)`} />
          </radialGradient>
        </defs>
        <ellipse
          cx={nebCx}
          cy={nebCy}
          rx={nebRx}
          ry={nebRy}
          fill={`url(#${gradId})`}
        />
      </g>
    );
  });

  /* ---- Star rendering ---- */

  const starElements = stars.map((star, i) => {
    // Twinkle: per-star sinusoidal brightness oscillation
    const twinkle = 0.6 + 0.4 * Math.sin(frame * star.twinkleFreq + star.twinklePhase);

    // Layer-specific speed multiplier (bg slowest, fg fastest)
    const layerSpeedScale = star.layer === "bg" ? 0.4 : star.layer === "mid" ? 0.7 : 1.0;

    // Warp position: fly from center outward, loop
    const period = STAR_CYCLE / (star.speed * layerSpeedScale);
    const t = ((frame * speedMult * layerSpeedScale) % period) / period;
    const r = (star.baseRadius + t * (1 - star.baseRadius)) * maxR;

    const x = cx + Math.cos(star.angle) * r;
    const y = cy + Math.sin(star.angle) * r;

    // Distance-based fade: dim near center, bright at edges
    const distFade = Math.pow(r / maxR, 0.7);

    // Combined alpha
    const alpha = Math.min(1, star.brightness * twinkle * distFade * beatBright);
    if (alpha < 0.03) return null;

    // Star color
    let hue: number;
    let sat: number;
    let lum: number;
    if (star.isWarm) {
      hue = star.warmHue;
      sat = 50 + energy * 20;
      lum = 75 + energy * 15;
    } else {
      // Blue-white: hue 210-240 range, low saturation for white look
      hue = 215 + Math.sin(star.twinklePhase) * 15;
      sat = 15 + energy * 25;
      lum = 80 + energy * 15;
    }

    const color = `hsla(${hue}, ${sat}%, ${Math.min(95, lum)}%, ${alpha})`;
    const glowColor = `hsla(${hue}, ${Math.min(100, sat + 20)}%, 85%, ${alpha * 0.35})`;
    const coreColor = `hsla(${hue}, ${Math.min(100, sat - 5)}%, 95%, ${Math.min(1, alpha * 1.3)})`;

    // Size with bass throb and distance scaling
    const sz = star.size * bassThrob * (0.6 + distFade * 0.4);

    // Streak length: longer at high energy, longer for faster/nearer stars
    const streakLen = streakBase * star.speed * highsStreakBoost * layerSpeedScale;

    // Streak endpoint (toward center)
    const sx = cx + Math.cos(star.angle) * Math.max(0, r - streakLen);
    const sy = cy + Math.sin(star.angle) * Math.max(0, r - streakLen);

    // Cross/diamond arm length
    const arm = sz * 0.6;
    // Perpendicular angle for cross arms
    const perpAngle = star.angle + Math.PI / 2;
    const armDx = Math.cos(perpAngle) * arm;
    const armDy = Math.sin(perpAngle) * arm;
    // Radial arms (along motion direction)
    const radDx = Math.cos(star.angle) * arm * 0.8;
    const radDy = Math.sin(star.angle) * arm * 0.8;

    // Glow radius scales with size
    const glowR = sz * (1.8 + energy * 2.0);

    // Whether to show prominent streak (only when moving fast enough)
    const showStreak = streakLen > 2;

    // Streak width: thinner for bg, thicker for fg
    const streakWidth = star.layer === "bg" ? sz * 0.5 : star.layer === "mid" ? sz * 0.7 : sz * 0.9;

    return (
      <g key={i}>
        {/* Outer glow halo */}
        <circle
          cx={x}
          cy={y}
          r={glowR}
          fill={glowColor}
          style={{ mixBlendMode: "screen" }}
        />

        {/* Motion streak — elongated toward center when warping */}
        {showStreak && (
          <line
            x1={x}
            y1={y}
            x2={sx}
            y2={sy}
            stroke={color}
            strokeWidth={streakWidth}
            strokeLinecap="round"
            style={{ mixBlendMode: "screen" }}
          />
        )}

        {/* Diamond/cross shape: 4 arms */}
        {/* Perpendicular arms */}
        <line
          x1={x - armDx}
          y1={y - armDy}
          x2={x + armDx}
          y2={y + armDy}
          stroke={coreColor}
          strokeWidth={sz * 0.25}
          strokeLinecap="round"
        />
        {/* Radial arms */}
        <line
          x1={x - radDx}
          y1={y - radDy}
          x2={x + radDx}
          y2={y + radDy}
          stroke={coreColor}
          strokeWidth={sz * 0.25}
          strokeLinecap="round"
        />

        {/* Bright core dot */}
        <circle
          cx={x}
          cy={y}
          r={sz * 0.35}
          fill={coreColor}
        />
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
      <svg
        width={width}
        height={height}
        style={{ opacity }}
        viewBox={`0 0 ${width} ${height}`}
      >
        {/* Nebula wisps render behind stars */}
        {nebulaElements}
        {/* Stars: bg first, then mid, then fg (painter's order — fg on top) */}
        {starElements}
      </svg>
    </div>
  );
};
