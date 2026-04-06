/**
 * MoonPhases — A+++ lunar centerpiece overlay.
 * The Dead are deeply lunar — Mountains of the Moon, Cosmic Charlie, all the
 * cosmic jams. A detailed centerpiece moon with a ring of 7 phase-satellites
 * cycling through new → waxing → full → waning. Pairs with space drums, Dark
 * Star, ballads. Audio: slowEnergy→halo, energy→star twinkle, chromaHue→moon
 * tint (cool blue↔warm gold), beatDecay→halo pulse, musicalTime→phase cycle,
 * tempoFactor→orbital drift. Cycles on/off: 60s on, 60s off.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ---------- Types & seed-driven generators ---------- */

interface Crater { cx: number; cy: number; r: number; depth: number; }
interface Maria { cx: number; cy: number; rx: number; ry: number; rotate: number; depth: number; }
interface Star { x: number; y: number; r: number; twinkleSeed: number; }

function generateCraters(seed: number, count: number): Crater[] {
  const rng = seeded(seed);
  const out: Crater[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = Math.sqrt(rng()) * 0.78;
    out.push({
      cx: Math.cos(angle) * dist,
      cy: Math.sin(angle) * dist,
      r: 0.035 + rng() * 0.085,
      depth: 0.25 + rng() * 0.55,
    });
  }
  return out;
}

function generateMaria(seed: number, count: number): Maria[] {
  const rng = seeded(seed);
  const out: Maria[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * 0.55;
    out.push({
      cx: Math.cos(angle) * dist,
      cy: Math.sin(angle) * dist,
      rx: 0.14 + rng() * 0.18,
      ry: 0.10 + rng() * 0.14,
      rotate: rng() * 360,
      depth: 0.18 + rng() * 0.22,
    });
  }
  return out;
}

function generateStars(seed: number, count: number): Star[] {
  const rng = seeded(seed);
  const out: Star[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: rng(),
      y: rng() * 0.7,
      r: 0.6 + rng() * 1.6,
      twinkleSeed: rng() * Math.PI * 2,
    });
  }
  return out;
}

/* ---------- Phase shadow path (proper crescent/gibbous via two arcs) ---------- */
/**
 * Builds an SVG path for the DARK side of a moon at phase ∈ [0,1):
 *   0 = new (fully dark) · 0.25 = first quarter · 0.5 = full · 0.75 = last quarter
 * Outer arc = semicircle on the shadow side; inner arc = the curved terminator.
 */
function buildPhaseShadowPath(cx: number, cy: number, r: number, phase: number): string {
  const phaseAngle = phase * Math.PI * 2;
  const cosPhase = Math.cos(phaseAngle); // +1 new, -1 full, 0 quarters
  const waxing = phase < 0.5;
  const termRx = Math.abs(cosPhase) * r;
  const shadowOnLeft = waxing;
  const top = `${cx},${cy - r}`;
  const bot = `${cx},${cy + r}`;
  const outerSweep = shadowOnLeft ? 0 : 1;
  const innerSweep = shadowOnLeft ? (cosPhase > 0 ? 1 : 0) : (cosPhase > 0 ? 0 : 1);
  if (Math.abs(cosPhase + 1) < 0.001) return ""; // full moon: no shadow
  if (Math.abs(cosPhase - 1) < 0.001) {
    return `M ${cx},${cy - r} A ${r},${r} 0 1 0 ${cx},${cy + r} A ${r},${r} 0 1 0 ${cx},${cy - r} Z`;
  }
  return `M ${top} A ${r},${r} 0 0 ${outerSweep} ${bot} A ${termRx},${r} 0 0 ${innerSweep} ${top} Z`;
}

/* ---------- Cycle constants ---------- */
const CYCLE = 3600; // 120s at 30fps
const DURATION = 1800; // 60s visible
const FADE = 0.10;

interface Props { frames: EnhancedFrameData[]; }


export const MoonPhases: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const slowEnergy = snap.slowEnergy;
  const energy = snap.energy;
  const chromaHue = snap.chromaHue; // 0..360
  const beatDecay = snap.beatDecay;
  const musicalTime = snap.musicalTime;

  // Pre-generated geometry (deterministic per overlay instance)
  const craters = React.useMemo(() => generateCraters(29979245, 11), []);
  const maria = React.useMemo(() => generateMaria(31415926, 4), []);
  const stars = React.useMemo(() => generateStars(27182818, 18), []);

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;
  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, FADE], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(progress, [1 - FADE, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.55 + slowEnergy * 0.35);
  if (masterOpacity < 0.005) return null;

  // Layout — centerpiece on right side, satellites encircle it
  const centerX = width * 0.72;
  const centerY = height * 0.34;
  const moonRadius = Math.min(width, height) * 0.085;
  const orbitRadius = moonRadius * 2.45;
  const satelliteRadius = moonRadius * 0.36;

  // Centerpiece phase progression: slow lunar cycle driven by musicalTime
  // One full lunar cycle every ~64 musical beats (very slow drift)
  const phase = ((musicalTime / 64) + 0.05) % 1;

  // Satellite ring rotation: gentle drift, scaled by tempo
  const orbitAngle = frame * 0.0015 * (0.6 + tempoFactor * 0.6);

  // Chroma-tinted moonlight: cool blue (220°) ↔ warm gold (45°)
  // Map chromaHue (0..360) onto a constrained moonlight palette via H interp
  const moonHue = interpolate(
    Math.cos((chromaHue * Math.PI) / 180),
    [-1, 1],
    [220, 42],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const moonSat = 18 + slowEnergy * 22;
  const moonLight = 88;
  const moonlightColor = `hsl(${moonHue.toFixed(1)}, ${moonSat.toFixed(0)}%, ${moonLight}%)`;
  const haloColor = `hsl(${moonHue.toFixed(1)}, ${(moonSat + 25).toFixed(0)}%, 78%)`;
  const coronaColor = `hsl(${moonHue.toFixed(1)}, ${(moonSat + 35).toFixed(0)}%, 65%)`;

  // Halo intensity
  const haloPulse = beatDecay * 0.35;
  const haloIntensity = (0.18 + slowEnergy * 0.45) * (1 + haloPulse);

  // Light-beam intensity (column under the moon)
  const beamIntensity = (0.10 + slowEnergy * 0.18) * (1 + beatDecay * 0.6);

  // Subtle wobble for life
  const wobbleX = Math.sin(frame * 0.0061) * 2.4;
  const wobbleY = Math.cos(frame * 0.0047) * 1.8;
  const cx = centerX + wobbleX;
  const cy = centerY + wobbleY;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          {/* Outer atmospheric corona — large soft falloff */}
          <radialGradient id="moon-corona" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={coronaColor} stopOpacity="0.22" />
            <stop offset="35%" stopColor={coronaColor} stopOpacity="0.10" />
            <stop offset="70%" stopColor={coronaColor} stopOpacity="0.03" />
            <stop offset="100%" stopColor={coronaColor} stopOpacity="0" />
          </radialGradient>
          {/* Inner halo — closer, brighter */}
          <radialGradient id="moon-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={haloColor} stopOpacity="0.55" />
            <stop offset="40%" stopColor={haloColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={haloColor} stopOpacity="0" />
          </radialGradient>
          {/* Moon surface — offset radial for sphere illusion */}
          <radialGradient id="moon-surface" cx="42%" cy="38%" r="62%">
            <stop offset="0%" stopColor="#FBF7EC" />
            <stop offset="35%" stopColor={moonlightColor} />
            <stop offset="70%" stopColor="#D6CFBE" />
            <stop offset="100%" stopColor="#A89F8C" />
          </radialGradient>
          {/* Maria gradient (dark patches) */}
          <radialGradient id="moon-maria" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5B5648" stopOpacity="0.55" />
            <stop offset="70%" stopColor="#5B5648" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#5B5648" stopOpacity="0" />
          </radialGradient>
          {/* Light beam vertical gradient */}
          <linearGradient id="moon-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={moonlightColor} stopOpacity="0.0" />
            <stop offset="20%" stopColor={moonlightColor} stopOpacity="0.35" />
            <stop offset="65%" stopColor={moonlightColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={moonlightColor} stopOpacity="0" />
          </linearGradient>
          <clipPath id="moon-clip">
            <circle cx={cx} cy={cy} r={moonRadius} />
          </clipPath>
          <filter id="soft-blur">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        {/* ---- Layer 1: Star field (background twinkles) ---- */}
        {stars.map((s, i) => {
          const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(frame * 0.04 + s.twinkleSeed));
          const opacity = tw * (0.4 + energy * 0.6);
          return (
            <circle
              key={`star${i}`}
              cx={s.x * width}
              cy={s.y * height}
              r={s.r}
              fill="#FFFFFF"
              opacity={opacity}
            />
          );
        })}

        {/* ---- Layer 2: Lunar light beam ---- */}
        <rect
          x={cx - moonRadius * 0.55}
          y={cy + moonRadius * 0.6}
          width={moonRadius * 1.1}
          height={height - cy - moonRadius * 0.6}
          fill="url(#moon-beam)"
          opacity={beamIntensity}
        />

        {/* ---- Layer 3: Outer corona (refraction ring) ---- */}
        <circle
          cx={cx}
          cy={cy}
          r={moonRadius * 4.6}
          fill="url(#moon-corona)"
          opacity={haloIntensity * 0.85}
        />
        {/* Atmospheric ring — subtle outer circle for refraction suggestion */}
        <circle
          cx={cx}
          cy={cy}
          r={moonRadius * 2.85}
          fill="none"
          stroke={coronaColor}
          strokeWidth={0.7}
          opacity={0.18 + slowEnergy * 0.18}
        />

        {/* ---- Layer 4: Inner halo ---- */}
        <circle
          cx={cx}
          cy={cy}
          r={moonRadius * 1.85}
          fill="url(#moon-halo)"
          opacity={haloIntensity}
        />

        {/* ---- Layer 5: Centerpiece moon ---- */}
        <g clipPath="url(#moon-clip)">
          {/* Surface base */}
          <circle cx={cx} cy={cy} r={moonRadius} fill="url(#moon-surface)" />

          {/* Maria (dark gradient blobs) */}
          {maria.map((m, i) => {
            const mX = cx + m.cx * moonRadius;
            const mY = cy + m.cy * moonRadius;
            return (
              <ellipse
                key={`mar${i}`}
                cx={mX}
                cy={mY}
                rx={m.rx * moonRadius}
                ry={m.ry * moonRadius}
                fill="url(#moon-maria)"
                transform={`rotate(${m.rotate}, ${mX}, ${mY})`}
                opacity={m.depth * 1.2}
              />
            );
          })}

          {/* Craters */}
          {craters.map((c, i) => {
            const crX = cx + c.cx * moonRadius;
            const crY = cy + c.cy * moonRadius;
            const cr = c.r * moonRadius;
            return (
              <g key={`cr${i}`}>
                {/* Crater rim shadow (lower-right) */}
                <circle
                  cx={crX + cr * 0.18}
                  cy={crY + cr * 0.18}
                  r={cr}
                  fill={`rgba(70, 65, 55, ${c.depth * 0.45})`}
                />
                {/* Crater highlight (upper-left rim) */}
                <circle
                  cx={crX - cr * 0.12}
                  cy={crY - cr * 0.12}
                  r={cr * 0.95}
                  fill={`rgba(255, 250, 235, ${c.depth * 0.18})`}
                />
                {/* Crater floor */}
                <circle
                  cx={crX}
                  cy={crY}
                  r={cr * 0.7}
                  fill={`rgba(120, 110, 95, ${c.depth * 0.3})`}
                />
              </g>
            );
          })}

          {/* Phase shadow (proper crescent/gibbous shape) */}
          <path
            d={buildPhaseShadowPath(cx, cy, moonRadius, phase)}
            fill="rgba(8, 10, 22, 0.93)"
          />
        </g>

        {/* Rim light on the lit edge */}
        <circle
          cx={cx}
          cy={cy}
          r={moonRadius}
          fill="none"
          stroke={haloColor}
          strokeWidth={1.2}
          opacity={0.45 + beatDecay * 0.25}
          filter="url(#soft-blur)"
        />

        {/* ---- Layer 6: Seven satellite phase moons orbiting the centerpiece ---- */}
        {Array.from({ length: 7 }).map((_, i) => {
          // Phase ranges: skip new moon (invisible) and full (rendered above);
          // distribute 7 satellites across the 8 canonical phases.
          const satPhase = (i + 0.5) / 8; // 0.0625, 0.1875, ..., 0.8125
          const angle = orbitAngle + (i / 7) * Math.PI * 2;
          const sx = cx + Math.cos(angle) * orbitRadius;
          const sy = cy + Math.sin(angle) * orbitRadius * 0.85; // slight ellipse
          const satOpacity = 0.55 + 0.25 * Math.sin(frame * 0.02 + i);
          return (
            <g key={`sat${i}`} opacity={satOpacity}>
              {/* Tiny halo */}
              <circle
                cx={sx}
                cy={sy}
                r={satelliteRadius * 1.7}
                fill={haloColor}
                opacity={0.10 + slowEnergy * 0.10}
              />
              {/* Satellite body */}
              <circle
                cx={sx}
                cy={sy}
                r={satelliteRadius}
                fill="url(#moon-surface)"
              />
              {/* Phase shadow */}
              <path
                d={buildPhaseShadowPath(sx, sy, satelliteRadius, satPhase)}
                fill="rgba(6, 8, 18, 0.92)"
              />
              {/* Rim */}
              <circle
                cx={sx}
                cy={sy}
                r={satelliteRadius}
                fill="none"
                stroke={haloColor}
                strokeWidth={0.6}
                opacity={0.5}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
