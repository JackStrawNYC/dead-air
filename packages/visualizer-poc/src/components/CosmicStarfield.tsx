/**
 * CosmicStarfield — A+++ overlay.
 * Rich star field with multiple star types (giants, dwarfs, distant), nebulae
 * in 3-4 colors, glowing constellations connecting stars with thin lines,
 * occasional shooting stars. Each star has size variation, color temperature,
 * glow halo. NOT just dots.
 *
 * Audio reactivity:
 *   slowEnergy → nebula bloom + ambient warmth
 *   energy     → star halo brightness
 *   bass       → giant star pulse
 *   beatDecay  → twinkle amplitude
 *   onsetEnvelope → shooting star triggers
 *   chromaHue  → nebula color tint
 *   tempoFactor → twinkle/drift speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const STAR_COUNT = 240;
const NEBULA_COUNT = 8;
const CONSTELLATION_COUNT = 4;

interface Star {
  x: number;
  y: number;
  baseR: number;
  twinkleSpeed: number;
  phase: number;
  hueOffset: number;
  type: "dwarf" | "giant" | "blue" | "red";
  hasFlare: boolean;
}
interface Nebula {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotation: number;
  hueOffset: number;
  drift: number;
  layers: number;
}
interface ConstellationStar {
  x: number;
  y: number;
  size: number;
}
interface ConstellationDef {
  stars: ConstellationStar[];
  edges: [number, number][];
  baseHueOffset: number;
}
interface ShootingStar {
  startFrame: number;
  startX: number;
  startY: number;
  angle: number;
  length: number;
}

function buildStars(): Star[] {
  const rng = seeded(91_553_271);
  return Array.from({ length: STAR_COUNT }, () => {
    const t = rng();
    let type: Star["type"] = "dwarf";
    if (t > 0.94) type = "giant";
    else if (t > 0.78) type = "blue";
    else if (t > 0.66) type = "red";
    const baseR =
      type === "giant" ? 2.4 + rng() * 2.0
        : type === "blue" ? 1.4 + rng() * 1.0
        : type === "red" ? 1.2 + rng() * 0.8
        : 0.4 + rng() * 0.9;
    return {
      x: rng(),
      y: rng(),
      baseR,
      twinkleSpeed: 0.018 + rng() * 0.05,
      phase: rng() * Math.PI * 2,
      hueOffset:
        type === "giant" ? -10 + rng() * 20
          : type === "blue" ? -50 - rng() * 30
          : type === "red" ? 60 + rng() * 30
          : rng() * 20,
      type,
      hasFlare: type === "giant" || type === "blue",
    };
  });
}

function buildNebulae(): Nebula[] {
  const rng = seeded(33_882_104);
  return Array.from({ length: NEBULA_COUNT }, () => ({
    x: rng(),
    y: rng(),
    rx: 0.16 + rng() * 0.22,
    ry: 0.10 + rng() * 0.18,
    rotation: rng() * 360,
    hueOffset: -120 + rng() * 240,
    drift: 0.00006 + rng() * 0.00014,
    layers: 4,
  }));
}

function buildConstellations(): ConstellationDef[] {
  const rng = seeded(72_119_044);
  return Array.from({ length: CONSTELLATION_COUNT }, (_, ci) => {
    const cx = 0.15 + rng() * 0.7;
    const cy = 0.15 + rng() * 0.7;
    const numStars = 5 + Math.floor(rng() * 4);
    const stars: ConstellationStar[] = Array.from({ length: numStars }, () => ({
      x: cx + (rng() - 0.5) * 0.18,
      y: cy + (rng() - 0.5) * 0.18,
      size: 1.6 + rng() * 1.6,
    }));
    const edges: [number, number][] = [];
    for (let i = 0; i < numStars - 1; i++) {
      edges.push([i, i + 1]);
    }
    if (numStars > 4 && rng() > 0.4) {
      edges.push([0, Math.floor(numStars / 2)]);
    }
    return { stars, edges, baseHueOffset: -90 + (ci / CONSTELLATION_COUNT) * 240 };
  });
}

function buildShootingStars(): ShootingStar[] {
  const rng = seeded(55_661_209);
  return Array.from({ length: 8 }, (_, i) => ({
    startFrame: 60 + i * 90 + Math.floor(rng() * 30),
    startX: rng(),
    startY: rng() * 0.5,
    angle: Math.PI * 0.15 + rng() * Math.PI * 0.2,
    length: 80 + rng() * 120,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CosmicStarfield: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const stars = React.useMemo(buildStars, []);
  const nebulae = React.useMemo(buildNebulae, []);
  const constellations = React.useMemo(buildConstellations, []);
  const shootingStars = React.useMemo(buildShootingStars, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives
  const cosmicGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const haloBright = interpolate(snap.energy, [0.02, 0.32], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const giantPulse = 1 + snap.bass * 0.35;
  const twinkleAmp = 0.4 + snap.beatDecay * 0.4;
  const flareBurst = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Palette
  const baseHue = 220;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.55) % 360 + 360) % 360;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 50%, 4%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 50%, 7%)`;
  const skyBot = `hsl(${(tintHue + 200) % 360}, 45%, 10%)`;

  // Stars
  const starNodes = stars.map((s, i) => {
    const t = frame * s.twinkleSpeed * tempoFactor + s.phase;
    const twinkle = 0.55 + Math.sin(t) * twinkleAmp;
    const sx = s.x * width;
    const sy = s.y * height;
    const r = s.baseR * (s.type === "giant" ? giantPulse : 1) * (0.85 + twinkle * 0.3);
    const sHue = (tintHue + s.hueOffset + 360) % 360;
    const sat = s.type === "blue" ? 80 : s.type === "red" ? 70 : 60;
    const lite = s.type === "giant" ? 90 : 80;
    const flare = s.hasFlare ? flareBurst * 0.6 : 0;
    return (
      <g key={`star-${i}`}>
        {(s.type === "giant" || s.type === "blue") && (
          <circle cx={sx} cy={sy} r={r * 6} fill={`hsl(${sHue}, ${sat}%, ${lite}%)`} opacity={0.06 * twinkle * haloBright} />
        )}
        <circle cx={sx} cy={sy} r={r * 3} fill={`hsl(${sHue}, ${sat}%, ${lite}%)`} opacity={0.18 * twinkle * haloBright} />
        <circle cx={sx} cy={sy} r={r * 1.6} fill={`hsl(${sHue}, ${sat}%, ${lite + 5}%)`} opacity={0.40 * twinkle} />
        <circle cx={sx} cy={sy} r={r} fill={`hsl(${sHue}, ${sat - 10}%, ${lite + 10}%)`} opacity={0.95 * twinkle + flare} />
        {s.hasFlare && flareBurst > 0.2 && (
          <>
            <line x1={sx - r * 8} y1={sy} x2={sx + r * 8} y2={sy}
              stroke={`hsl(${sHue}, ${sat}%, 92%)`} strokeWidth={0.6} opacity={flare} />
            <line x1={sx} y1={sy - r * 8} x2={sx} y2={sy + r * 8}
              stroke={`hsl(${sHue}, ${sat}%, 92%)`} strokeWidth={0.6} opacity={flare} />
          </>
        )}
      </g>
    );
  });

  // Nebulae
  const nebulaNodes = nebulae.map((n, i) => {
    const drift = ((n.x + frame * n.drift) + 1) % 1;
    const nx = drift * width;
    const ny = n.y * height;
    const nHue = (tintHue + n.hueOffset + 360) % 360;
    return (
      <g key={`neb-${i}`} transform={`translate(${nx}, ${ny}) rotate(${n.rotation + frame * 0.008})`}>
        <ellipse rx={n.rx * width * 1.55} ry={n.ry * height * 1.55} fill={`hsl(${nHue}, 60%, 45%)`} opacity={0.04 * cosmicGlow} />
        <ellipse rx={n.rx * width * 1.15} ry={n.ry * height * 1.15} fill={`hsl(${nHue}, 70%, 55%)`} opacity={0.07 * cosmicGlow} />
        <ellipse rx={n.rx * width * 0.75} ry={n.ry * height * 0.75} fill={`hsl(${nHue}, 80%, 65%)`} opacity={0.10 * cosmicGlow} />
        <ellipse rx={n.rx * width * 0.40} ry={n.ry * height * 0.40} fill={`hsl(${nHue}, 90%, 78%)`} opacity={0.13 * cosmicGlow} />
        <ellipse rx={n.rx * width * 0.18} ry={n.ry * height * 0.18} fill={`hsl(${nHue}, 100%, 88%)`} opacity={0.16 * cosmicGlow} />
      </g>
    );
  });

  // Constellation lines + bright stars
  const constellationNodes = constellations.map((c, ci) => {
    const cHue = (tintHue + c.baseHueOffset + 360) % 360;
    const lineColor = `hsl(${cHue}, 75%, 75%)`;
    const lineOpacity = 0.32 + Math.sin(frame * 0.012 + ci) * 0.12;
    const lines = c.edges.map(([a, b], ei) => {
      const sa = c.stars[a];
      const sb = c.stars[b];
      return (
        <line key={`cl-${ci}-${ei}`}
          x1={sa.x * width} y1={sa.y * height}
          x2={sb.x * width} y2={sb.y * height}
          stroke={lineColor} strokeWidth={1.0} opacity={lineOpacity * cosmicGlow} />
      );
    });
    const cstars = c.stars.map((s, si) => {
      const t = frame * 0.04 + ci + si;
      const tw = 0.7 + Math.sin(t) * 0.25;
      const r = s.size * (0.9 + tw * 0.3);
      return (
        <g key={`cs-${ci}-${si}`}>
          <circle cx={s.x * width} cy={s.y * height} r={r * 4} fill={lineColor} opacity={0.10 * tw * haloBright} />
          <circle cx={s.x * width} cy={s.y * height} r={r * 2} fill={lineColor} opacity={0.30 * tw * haloBright} />
          <circle cx={s.x * width} cy={s.y * height} r={r} fill={`hsl(${cHue}, 90%, 92%)`} opacity={0.95 * tw} />
        </g>
      );
    });
    return <g key={`con-${ci}`}>{lines}{cstars}</g>;
  });

  // Shooting stars
  const shootingNodes = shootingStars.map((s, i) => {
    const phase = frame - s.startFrame;
    if (phase < 0) return null;
    const period = 60;
    const cyclePhase = phase % period;
    if (cyclePhase > 25) return null;
    const t = cyclePhase / 25;
    const fade = Math.sin(t * Math.PI);
    const sx0 = s.startX * width;
    const sy0 = s.startY * height;
    const dx = Math.cos(s.angle) * s.length * (1 + t);
    const dy = Math.sin(s.angle) * s.length * (1 + t);
    return (
      <g key={`ss-${i}`}>
        <line x1={sx0} y1={sy0} x2={sx0 + dx} y2={sy0 + dy}
          stroke="rgba(220, 240, 255, 0.95)" strokeWidth={2.4} opacity={fade} strokeLinecap="round" />
        <line x1={sx0} y1={sy0} x2={sx0 + dx * 0.7} y2={sy0 + dy * 0.7}
          stroke="rgba(255, 255, 255, 1)" strokeWidth={1.0} opacity={fade} strokeLinecap="round" />
        <circle cx={sx0 + dx} cy={sy0 + dy} r={3.6 * fade} fill="#fff" opacity={fade} />
      </g>
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="cs-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <radialGradient id="cs-deep">
            <stop offset="0%" stopColor={`hsl(${tintHue}, 50%, 16%)`} stopOpacity={0.5} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <filter id="cs-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width={width} height={height} fill="url(#cs-sky)" />
        <ellipse cx={width * 0.5} cy={height * 0.5} rx={width * 0.55} ry={height * 0.55}
          fill="url(#cs-deep)" />

        {/* Distant background scatter (already inside stars) */}
        <g filter="url(#cs-blur)">{nebulaNodes}</g>
        {starNodes}
        {constellationNodes}
        <g style={{ mixBlendMode: "screen" }}>{shootingNodes}</g>
      </svg>
    </div>
  );
};
