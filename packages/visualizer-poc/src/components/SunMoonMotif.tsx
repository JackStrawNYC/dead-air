/**
 * SunMoonMotif — A+++ overlay.
 * Sun and moon depicted together in alchemical/mystical fashion.
 * Sun on the left with rays + face, moon on the right with craters + face.
 * Each ~25% of frame width. Connected by celestial band/horizon.
 *
 * Audio reactivity:
 *   slowEnergy → cosmic warmth + corona
 *   energy     → sun ray brightness
 *   bass       → sun/moon pulse
 *   beatDecay  → ray rotation
 *   onsetEnvelope → flash
 *   chromaHue  → dusk-dawn tint shift
 *   tempoFactor → ray rotation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const SUN_RAY_COUNT = 18;
const STAR_COUNT = 110;
const CRATER_COUNT = 14;

interface Star {
  x: number;
  y: number;
  r: number;
  twinkleSpeed: number;
  phase: number;
}
interface Crater {
  cx: number;
  cy: number;
  r: number;
}

function buildStars(): Star[] {
  const rng = seeded(46_881_771);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.5 + rng() * 1.6,
    twinkleSpeed: 0.02 + rng() * 0.05,
    phase: rng() * Math.PI * 2,
  }));
}

function buildCraters(): Crater[] {
  const rng = seeded(98_117_553);
  return Array.from({ length: CRATER_COUNT }, () => {
    // distribute within unit circle
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 0.85;
    return {
      cx: Math.cos(a) * r,
      cy: Math.sin(a) * r,
      r: 0.04 + rng() * 0.10,
    };
  });
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SunMoonMotif: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const stars = React.useMemo(buildStars, []);
  const craters = React.useMemo(buildCraters, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  const cosmicWarmth = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sunBright = interpolate(snap.energy, [0.02, 0.32], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bodyPulse = 1 + snap.bass * 0.20;
  const rayRotation = (frame * 0.18 * tempoFactor + snap.beatDecay * 30) % 360;
  const flashBurst = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Palette: warm sun left, cool moon right, dusk middle
  const baseHue = 38; // gold
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const sunYellow = `hsl(${tintHue}, 95%, 65%)`;
  const sunBrightColor = `hsl(${tintHue}, 100%, 82%)`;
  const sunDeep = `hsl(${(tintHue - 12 + 360) % 360}, 90%, 42%)`;
  const moonHue = (tintHue + 200) % 360;
  const moonColor = `hsl(${moonHue}, 38%, 78%)`;
  const moonBright = `hsl(${moonHue}, 50%, 90%)`;
  const moonDeep = `hsl(${moonHue}, 30%, 50%)`;
  const skyTop = `hsl(${(tintHue + 220) % 360}, 50%, 6%)`;
  const skyMid = `hsl(${(tintHue + 240) % 360}, 50%, 12%)`;
  const skyBot = `hsl(${(tintHue + 260) % 360}, 30%, 14%)`;

  // Sun position - left
  const sunCx = width * 0.27;
  const sunCy = height * 0.50;
  const sunR = Math.min(width, height) * 0.16 * bodyPulse;

  // Moon position - right
  const moonCx = width * 0.73;
  const moonCy = height * 0.50;
  const moonR = Math.min(width, height) * 0.15 * bodyPulse;

  // Stars (only on right/moon side mostly)
  const starNodes = stars.map((s, i) => {
    const t = frame * s.twinkleSpeed + s.phase;
    const tw = 0.55 + Math.sin(t) * 0.4;
    const x = s.x * width;
    const y = s.y * height;
    // Stars are dimmer on the sun side
    const sunSideMul = x < width * 0.45 ? 0.3 : 1;
    return (
      <circle key={`star-${i}`} cx={x} cy={y}
        r={s.r * (0.85 + tw * 0.3)}
        fill={moonBright} opacity={0.7 * tw * sunSideMul} />
    );
  });

  // Sun rays
  const sunRays: React.ReactNode[] = [];
  for (let r = 0; r < SUN_RAY_COUNT; r++) {
    const a = (r / SUN_RAY_COUNT) * Math.PI * 2 + (rayRotation * Math.PI) / 180;
    const len = sunR * (1.6 + sunBright * 0.5) * (r % 2 === 0 ? 1.3 : 0.9);
    const x2 = Math.cos(a) * len;
    const y2 = Math.sin(a) * len;
    const w0 = 12 + sunBright * 14;
    sunRays.push(
      <g key={`sr-${r}`}>
        <path d={`M 0 0 L ${x2 - w0 * 0.6} ${y2} L ${x2 + w0 * 0.6} ${y2} Z`}
          fill={sunYellow} opacity={0.10 * sunBright * cosmicWarmth} />
        <path d={`M 0 0 L ${x2 - w0 * 0.32} ${y2} L ${x2 + w0 * 0.32} ${y2} Z`}
          fill={sunYellow} opacity={0.22 * sunBright * cosmicWarmth} />
        <path d={`M 0 0 L ${x2 - w0 * 0.12} ${y2} L ${x2 + w0 * 0.12} ${y2} Z`}
          fill={sunBrightColor} opacity={0.45 * sunBright * cosmicWarmth} />
      </g>
    );
  }

  // Crater nodes
  const craterNodes = craters.map((c, i) => (
    <g key={`cr-${i}`}>
      <circle cx={c.cx * moonR} cy={c.cy * moonR} r={c.r * moonR}
        fill={moonDeep} opacity={0.45} />
      <circle cx={c.cx * moonR + 1} cy={c.cy * moonR + 1} r={c.r * moonR * 0.85}
        fill="rgba(0, 0, 0, 0.12)" />
      <circle cx={c.cx * moonR - 1} cy={c.cy * moonR - 1} r={c.r * moonR * 0.6}
        fill={moonBright} opacity={0.25} />
    </g>
  ));

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="smm-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="50%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <radialGradient id="smm-sun-grad">
            <stop offset="0%" stopColor={sunBrightColor} />
            <stop offset="60%" stopColor={sunYellow} />
            <stop offset="100%" stopColor={sunDeep} />
          </radialGradient>
          <radialGradient id="smm-sun-corona">
            <stop offset="0%" stopColor={sunYellow} stopOpacity={0.5} />
            <stop offset="60%" stopColor={sunYellow} stopOpacity={0.18} />
            <stop offset="100%" stopColor={sunYellow} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="smm-moon-grad">
            <stop offset="0%" stopColor={moonBright} />
            <stop offset="80%" stopColor={moonColor} />
            <stop offset="100%" stopColor={moonDeep} />
          </radialGradient>
          <radialGradient id="smm-moon-glow">
            <stop offset="0%" stopColor={moonColor} stopOpacity={0.4} />
            <stop offset="60%" stopColor={moonColor} stopOpacity={0.15} />
            <stop offset="100%" stopColor={moonColor} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="smm-band" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={sunYellow} stopOpacity={0.45} />
            <stop offset="50%" stopColor={`hsl(${(tintHue + 120) % 360}, 60%, 55%)`} stopOpacity={0.35} />
            <stop offset="100%" stopColor={moonColor} stopOpacity={0.45} />
          </linearGradient>
        </defs>

        <rect width={width} height={height} fill="url(#smm-sky)" />

        {/* Stars */}
        {starNodes}

        {/* Celestial connecting band */}
        <rect x={0} y={height * 0.48} width={width} height={4} fill="url(#smm-band)" />
        <rect x={0} y={height * 0.50} width={width} height={1} fill="rgba(255, 250, 220, 0.7)" />

        {/* Distance ornaments */}
        {[width * 0.35, width * 0.45, width * 0.50, width * 0.55, width * 0.65].map((x, i) => (
          <g key={`mid-${i}`}>
            <circle cx={x} cy={height * 0.50} r={2.4} fill={sunBrightColor} opacity={0.85} />
            <line x1={x} y1={height * 0.46} x2={x} y2={height * 0.54}
              stroke={sunYellow} strokeWidth={0.8} opacity={0.6} />
          </g>
        ))}

        {/* Sun corona */}
        <circle cx={sunCx} cy={sunCy} r={sunR * 3 * cosmicWarmth}
          fill="url(#smm-sun-corona)" style={{ mixBlendMode: "screen" }} />

        {/* Sun rays */}
        <g transform={`translate(${sunCx}, ${sunCy})`} style={{ mixBlendMode: "screen" }}>
          {sunRays}
        </g>

        {/* Sun disc */}
        <circle cx={sunCx} cy={sunCy} r={sunR + 4} fill={sunYellow} opacity={0.5 * sunBright} />
        <circle cx={sunCx} cy={sunCy} r={sunR} fill="url(#smm-sun-grad)" stroke={sunDeep} strokeWidth={2} />

        {/* Sun face — eyes, mouth */}
        <circle cx={sunCx - sunR * 0.30} cy={sunCy - sunR * 0.15} r={sunR * 0.08} fill={sunDeep} />
        <circle cx={sunCx + sunR * 0.30} cy={sunCy - sunR * 0.15} r={sunR * 0.08} fill={sunDeep} />
        <circle cx={sunCx - sunR * 0.30 - 1} cy={sunCy - sunR * 0.15 - 1} r={sunR * 0.04} fill="#fff" />
        <circle cx={sunCx + sunR * 0.30 - 1} cy={sunCy - sunR * 0.15 - 1} r={sunR * 0.04} fill="#fff" />
        <path d={`M ${sunCx - sunR * 0.28} ${sunCy + sunR * 0.20}
          Q ${sunCx} ${sunCy + sunR * 0.42} ${sunCx + sunR * 0.28} ${sunCy + sunR * 0.20}`}
          stroke={sunDeep} strokeWidth={3.4} fill="none" strokeLinecap="round" />
        {/* Sun cheek blush */}
        <circle cx={sunCx - sunR * 0.42} cy={sunCy + sunR * 0.10} r={sunR * 0.10}
          fill={sunDeep} opacity={0.3} />
        <circle cx={sunCx + sunR * 0.42} cy={sunCy + sunR * 0.10} r={sunR * 0.10}
          fill={sunDeep} opacity={0.3} />

        {/* Moon glow */}
        <circle cx={moonCx} cy={moonCy} r={moonR * 2.4 * cosmicWarmth}
          fill="url(#smm-moon-glow)" style={{ mixBlendMode: "screen" }} />

        {/* Moon disc */}
        <circle cx={moonCx} cy={moonCy} r={moonR + 2} fill={moonBright} opacity={0.4} />
        <circle cx={moonCx} cy={moonCy} r={moonR} fill="url(#smm-moon-grad)" stroke={moonDeep} strokeWidth={1.4} />

        {/* Craters */}
        <g transform={`translate(${moonCx}, ${moonCy})`}>{craterNodes}</g>

        {/* Moon face — eyes closed in serenity */}
        <path d={`M ${moonCx - moonR * 0.30} ${moonCy - moonR * 0.10}
          Q ${moonCx - moonR * 0.20} ${moonCy - moonR * 0.20} ${moonCx - moonR * 0.10} ${moonCy - moonR * 0.10}`}
          stroke={moonDeep} strokeWidth={2.4} fill="none" strokeLinecap="round" />
        <path d={`M ${moonCx + moonR * 0.10} ${moonCy - moonR * 0.10}
          Q ${moonCx + moonR * 0.20} ${moonCy - moonR * 0.20} ${moonCx + moonR * 0.30} ${moonCy - moonR * 0.10}`}
          stroke={moonDeep} strokeWidth={2.4} fill="none" strokeLinecap="round" />
        <path d={`M ${moonCx - moonR * 0.18} ${moonCy + moonR * 0.22}
          Q ${moonCx} ${moonCy + moonR * 0.28} ${moonCx + moonR * 0.18} ${moonCy + moonR * 0.22}`}
          stroke={moonDeep} strokeWidth={2.0} fill="none" strokeLinecap="round" />
        {/* Crescent shadow on the right side */}
        <path d={`M ${moonCx + moonR * 0.55} ${moonCy - moonR * 0.85}
          A ${moonR * 1.1} ${moonR * 1.1} 0 0 1 ${moonCx + moonR * 0.55} ${moonCy + moonR * 0.85}
          A ${moonR * 0.85} ${moonR * 0.85} 0 0 0 ${moonCx + moonR * 0.55} ${moonCy - moonR * 0.85} Z`}
          fill="rgba(20, 14, 30, 0.25)" />

        {/* Alchemical glyphs around */}
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const gx = sunCx + Math.cos(a) * (sunR * 1.9);
          const gy = sunCy + Math.sin(a) * (sunR * 1.9);
          return (
            <g key={`glsun-${i}`} opacity={0.5 * cosmicWarmth}>
              <circle cx={gx} cy={gy} r={4} fill="none" stroke={sunYellow} strokeWidth={1} />
              <line x1={gx - 6} y1={gy} x2={gx + 6} y2={gy} stroke={sunYellow} strokeWidth={1} />
            </g>
          );
        })}
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const gx = moonCx + Math.cos(a) * (moonR * 1.9);
          const gy = moonCy + Math.sin(a) * (moonR * 1.9);
          return (
            <g key={`glmoon-${i}`} opacity={0.5 * cosmicWarmth}>
              <circle cx={gx} cy={gy} r={3.4} fill="none" stroke={moonColor} strokeWidth={1} />
              <line x1={gx} y1={gy - 5} x2={gx} y2={gy + 5} stroke={moonColor} strokeWidth={1} />
            </g>
          );
        })}

        {/* Flash burst around both */}
        {flashBurst > 0.1 && (
          <>
            <circle cx={sunCx} cy={sunCy} r={sunR * (1.4 + flashBurst * 0.6)}
              fill="none" stroke={sunBrightColor} strokeWidth={3} opacity={flashBurst * 0.9} />
            <circle cx={moonCx} cy={moonCy} r={moonR * (1.4 + flashBurst * 0.6)}
              fill="none" stroke={moonBright} strokeWidth={3} opacity={flashBurst * 0.7} />
          </>
        )}
      </svg>
    </div>
  );
};
