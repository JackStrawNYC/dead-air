/**
 * VenetaSwimmers — A+++ river-swimming scene for Veneta 8/27/72.
 *
 * Veneta was 100°F. The river ran behind the stage. The crowd stripped
 * naked and swam to escape the heat. This overlay paints that joyful,
 * sun-baked freedom along the bottom of the frame: a curved riverbank,
 * rippling water, golden sun reflection, splash bursts, and 8-12 swimmer
 * silhouettes — wading, floating, swimming, diving, sunbathing.
 *
 * All silhouettes are tasteful figure shapes — no anatomical detail,
 * just dark joyful bodies cooling off in the river.
 *
 * Audio reactivity:
 *   - slowEnergy → water rippling intensity (calm vs rolling)
 *   - energy     → splash intensity + droplet count
 *   - bass       → wave amplitude
 *   - chromaHue  → tints sun reflection (warm gold ↔ cooler amber)
 *   - beatDecay  → pulses sun glints
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SwimmerPose = "wading" | "swimming" | "floating" | "diving" | "sitting";

interface SwimmerData {
  pose: SwimmerPose;
  x: number; y: number; scale: number; phase: number; drift: number;
  facing: -1 | 1; armsUp: boolean;
}

interface SplashData {
  x: number; y: number; period: number; phase: number; maxR: number;
}

interface BankElement {
  type: "tree" | "clothes" | "sunbather";
  x: number; scale: number; variant: number;
}

interface SunGlint {
  t: number; jitter: number; phase: number; freq: number; r: number;
}

/* ------------------------------------------------------------------ */
/*  Deterministic data generators                                      */
/* ------------------------------------------------------------------ */

const SWIMMER_COUNT = 11;
const SPLASH_COUNT = 4;
const GLINT_COUNT = 22;

function generateSwimmers(seed: number): SwimmerData[] {
  const rng = seeded(seed);
  const poses: SwimmerPose[] = [
    "wading", "swimming", "floating", "diving", "wading",
    "swimming", "floating", "sitting", "wading", "swimming", "floating",
  ];
  return poses.slice(0, SWIMMER_COUNT).map((pose, i) => ({
    pose,
    x: 0.06 + (i / SWIMMER_COUNT) * 0.88 + (rng() - 0.5) * 0.05,
    y: 0.25 + rng() * 0.6,
    scale: 0.85 + rng() * 0.45,
    phase: rng() * Math.PI * 2,
    drift: 0.0008 + rng() * 0.0014,
    facing: rng() > 0.5 ? 1 : -1,
    armsUp: rng() > 0.55,
  }));
}

function generateSplashes(seed: number): SplashData[] {
  const rng = seeded(seed * 7 + 11);
  return Array.from({ length: SPLASH_COUNT }, (_, i) => ({
    x: 0.18 + (i / SPLASH_COUNT) * 0.7 + rng() * 0.05,
    y: 0.35 + rng() * 0.4,
    period: 90 + Math.floor(rng() * 110),
    phase: rng() * 200,
    maxR: 18 + rng() * 22,
  }));
}

function generateBank(seed: number): BankElement[] {
  const rng = seeded(seed * 13 + 5);
  return ([
    { type: "tree", x: 0.05, scale: 1.15, variant: 0 },
    { type: "tree", x: 0.92, scale: 0.95, variant: 1 },
    { type: "clothes", x: 0.22, scale: 1.0, variant: 0 },
    { type: "clothes", x: 0.78, scale: 0.9, variant: 1 },
    { type: "sunbather", x: 0.48, scale: 1.05, variant: 0 },
    { type: "tree", x: 0.65, scale: 0.85, variant: 2 },
  ] as BankElement[]).map((e) => ({ ...e, x: e.x + (rng() - 0.5) * 0.02 }));
}

function generateGlints(seed: number): SunGlint[] {
  const rng = seeded(seed * 23 + 19);
  return Array.from({ length: GLINT_COUNT }, () => ({
    t: rng(),
    jitter: (rng() - 0.5) * 24,
    phase: rng() * Math.PI * 2,
    freq: 0.06 + rng() * 0.12,
    r: 1.4 + rng() * 2.6,
  }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props { frames: EnhancedFrameData[]; }

export const VenetaSwimmers: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const swimmers = React.useMemo(() => generateSwimmers(8271972), []);
  const splashes = React.useMemo(() => generateSplashes(8271972), []);
  const bank = React.useMemo(() => generateBank(8271972), []);
  const glints = React.useMemo(() => generateGlints(8271972), []);

  /* River band geometry — bottom 38% of frame */
  const bandTop = height * 0.62;
  const bandHeight = height * 0.38;
  const waterTop = bandTop + bandHeight * 0.18;
  const waterHeight = bandHeight - (waterTop - bandTop);

  /* Audio drives */
  const rippleIntensity = interpolate(snap.slowEnergy, [0.02, 0.25], [0.45, 1.25],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const splashIntensity = interpolate(snap.energy, [0.03, 0.32], [0.5, 1.4],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const waveAmp = interpolate(snap.bass, [0.0, 0.6], [2.2, 7.5],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sunHueShift = interpolate(snap.chromaHue, [0, 1], [-18, 22]);
  const sunPulse = 0.78 + snap.beatDecay * 0.32;

  /* Sun reflection vertical streak */
  const sunPathX = width * 0.58;
  const sunPathTop = waterTop + 4;
  const sunPathBot = bandTop + bandHeight - 8;
  const sunPathLen = sunPathBot - sunPathTop;

  /* Curved riverbank polyline (gently waving) */
  const bankPoints: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const px = (i / 60) * width;
    const py = waterTop + Math.sin(i * 0.35 + frame * 0.01) * 3
      + Math.sin(i * 0.12 - frame * 0.005) * 5;
    bankPoints.push(`${px},${py}`);
  }
  const bankPath = `M 0,${bandTop} L ${bankPoints.join(" L ")} L ${width},${bandTop} Z`;
  const bankEdge = `M ${bankPoints.join(" L ")}`;

  /* Multi-layer ripple builder */
  const ripple = (yFrac: number, freq: number, ph: number, amp: number): string => {
    const baseY = waterTop + waterHeight * yFrac;
    const pts: string[] = [];
    for (let i = 0; i <= 50; i++) {
      const px = (i / 50) * width;
      const wy = baseY + Math.sin(i * freq + frame * 0.04 + ph) * amp * rippleIntensity
        + Math.sin(i * freq * 2.3 + frame * 0.025 + ph * 0.7) * amp * 0.4 * rippleIntensity;
      pts.push(`${px},${wy}`);
    }
    return `M ${pts.join(" L ")}`;
  };

  /* Hue-shifted sun gold */
  const goldG = Math.max(120, Math.min(240, Math.round(195 + sunHueShift * 0.8)));
  const goldB = Math.max(20, Math.min(140, Math.round(70 + sunHueShift * -1.5)));
  const sunColor = `rgb(255, ${goldG}, ${goldB})`;

  /* ----------------------------------------------------------------- */
  /*  Swimmer renderer                                                  */
  /* ----------------------------------------------------------------- */
  const renderSwimmer = (s: SwimmerData, idx: number) => {
    const cx = s.x * width;
    const baseY = waterTop + s.y * waterHeight;
    const sc = s.scale;
    const flip = s.facing;
    const bob = Math.sin(frame * 0.04 + s.phase) * 1.6 * rippleIntensity;
    const drift = Math.sin(frame * s.drift + s.phase) * 6;
    const fill = "rgba(18,14,10,0.85)";
    const stroke = (x1: number, y1: number, x2: number, y2: number, w = 3 * sc) =>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={fill} strokeWidth={w} strokeLinecap="round" />;

    if (s.pose === "wading") {
      const headR = 7 * sc, torsoH = 28 * sc;
      const handY = s.armsUp ? -torsoH - 22 : -torsoH * 0.4;
      const handX = s.armsUp ? 13 * sc * flip : 11 * sc;
      return (
        <g key={idx} transform={`translate(${cx + drift}, ${baseY + bob})`}>
          <ellipse cx={0} cy={2} rx={14 * sc} ry={2.5} fill="rgba(0,0,0,0.35)" />
          <circle cx={0} cy={-torsoH - headR} r={headR} fill={fill} />
          <path d={`M ${-7 * sc} ${-torsoH} Q 0 ${-torsoH - 4} ${7 * sc} ${-torsoH} L ${5 * sc} 0 Q 0 2 ${-5 * sc} 0 Z`} fill={fill} />
          {stroke(-6 * sc, -torsoH + 4, -handX, handY, 3.2 * sc)}
          {stroke(6 * sc, -torsoH + 4, handX, s.armsUp ? -torsoH - 24 : handY, 3.2 * sc)}
        </g>
      );
    }
    if (s.pose === "swimming") {
      const armSweep = Math.sin(frame * 0.18 + s.phase) * 0.9;
      return (
        <g key={idx} transform={`translate(${cx + drift}, ${baseY + bob}) scale(${flip}, 1)`}>
          <ellipse cx={0} cy={3} rx={20 * sc} ry={2.8} fill="rgba(0,0,0,0.3)" />
          <circle cx={4 * sc} cy={-3 * sc} r={5.5 * sc} fill={fill} />
          <path d={`M ${-14 * sc} 0 Q ${-2 * sc} ${-6 * sc} ${10 * sc} ${-2 * sc} Q ${-2 * sc} ${4 * sc} ${-14 * sc} 2 Z`} fill={fill} />
          {stroke(6 * sc, -2 * sc, (18 + armSweep * 4) * sc, (-10 - armSweep * 5) * sc, 3.4 * sc)}
        </g>
      );
    }
    if (s.pose === "floating") {
      const armSpread = 14 * sc;
      return (
        <g key={idx} transform={`translate(${cx + drift}, ${baseY + bob})`}>
          <ellipse cx={0} cy={3} rx={20 * sc} ry={3} fill="rgba(0,0,0,0.3)" />
          <ellipse cx={0} cy={0} rx={16 * sc} ry={5 * sc} fill={fill} />
          <circle cx={-14 * sc} cy={-1} r={5 * sc} fill={fill} />
          {stroke(-2 * sc, -2 * sc, -2 * sc, -armSpread)}
          {stroke(2 * sc, -2 * sc, 2 * sc, armSpread)}
        </g>
      );
    }
    if (s.pose === "diving") {
      const arc = Math.sin(((frame + s.phase * 30) * 0.04) % Math.PI);
      const dy = -28 * sc - arc * 18 * sc;
      return (
        <g key={idx}>
          <g transform={`translate(${cx}, ${baseY + dy}) rotate(${20 * flip})`}>
            <circle cx={0} cy={-12 * sc} r={5 * sc} fill={fill} />
            <ellipse cx={0} cy={2} rx={4 * sc} ry={14 * sc} fill={fill} />
            {stroke(-3 * sc, -8 * sc, -9 * sc, -2 * sc)}
            {stroke(3 * sc, -8 * sc, 9 * sc, -2 * sc)}
          </g>
          <ellipse cx={cx} cy={baseY + 4} rx={9 * sc * (0.6 + arc * 0.7)} ry={2.4} fill="rgba(255,255,255,0.55)" />
        </g>
      );
    }
    // sitting on rock at edge
    return (
      <g key={idx} transform={`translate(${cx + drift}, ${waterTop - 2})`}>
        <ellipse cx={0} cy={6} rx={18 * sc} ry={5 * sc} fill="rgba(40,30,20,0.7)" />
        <circle cx={0} cy={-22 * sc} r={6 * sc} fill={fill} />
        <path d={`M ${-7 * sc} ${-16 * sc} Q 0 ${-22 * sc} ${7 * sc} ${-16 * sc} L ${10 * sc} ${-2 * sc} Q 0 ${2 * sc} ${-10 * sc} ${-2 * sc} Z`} fill={fill} />
        {stroke(-6 * sc, -12 * sc, -13 * sc, -4 * sc)}
        {stroke(6 * sc, -12 * sc, 12 * sc, -2 * sc)}
        {stroke(-4 * sc, -2 * sc, -10 * sc, 6 * sc, 3.2 * sc)}
      </g>
    );
  };

  /* ----------------------------------------------------------------- */
  /*  Splash renderer                                                   */
  /* ----------------------------------------------------------------- */
  const renderSplash = (sp: SplashData, idx: number) => {
    const cycleT = ((frame + sp.phase) % sp.period) / sp.period;
    if (cycleT > 0.55) return null;
    const t = cycleT / 0.55;
    const r = sp.maxR * t * splashIntensity;
    const cx = sp.x * width;
    const cy = waterTop + sp.y * waterHeight;
    const op = (1 - t) * 0.85;
    const dropletCount = Math.floor(6 + splashIntensity * 4);
    return (
      <g key={idx}>
        <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.45} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={2} opacity={op} />
        <ellipse cx={cx} cy={cy} rx={r * 0.7} ry={r * 0.32} fill="none" stroke="rgba(220,240,255,0.7)" strokeWidth={1.4} opacity={op} />
        <ellipse cx={cx} cy={cy} rx={r * 1.6} ry={r * 0.7} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1} opacity={op * 0.6} />
        {Array.from({ length: dropletCount }, (_, i) => {
          const ang = (i / dropletCount) * Math.PI * 2;
          const dr = r + 6 + t * 12;
          const dx = Math.cos(ang) * dr;
          const dy = Math.sin(ang) * dr * 0.6 - t * 14;
          return <circle key={i} cx={cx + dx} cy={cy + dy} r={1.8 + (1 - t) * 1.6} fill="rgba(255,255,255,0.85)" opacity={op} />;
        })}
      </g>
    );
  };

  /* ----------------------------------------------------------------- */
  /*  Bank element renderer                                             */
  /* ----------------------------------------------------------------- */
  const renderBank = (el: BankElement, idx: number) => {
    const cx = el.x * width;
    const baseY = waterTop - 2;
    if (el.type === "tree") {
      const h = 95 * el.scale;
      const trunkW = 6 * el.scale;
      return (
        <g key={`b${idx}`}>
          <rect x={cx - trunkW / 2} y={baseY - h * 0.4} width={trunkW} height={h * 0.4} fill="rgba(18,12,8,0.85)" />
          <ellipse cx={cx + (el.variant - 1) * 4} cy={baseY - h * 0.55} rx={26 * el.scale} ry={28 * el.scale} fill="rgba(14,18,10,0.9)" />
          <ellipse cx={cx - 8 * el.scale} cy={baseY - h * 0.7} rx={18 * el.scale} ry={20 * el.scale} fill="rgba(14,18,10,0.85)" />
          <ellipse cx={cx + 10 * el.scale} cy={baseY - h * 0.75} rx={16 * el.scale} ry={18 * el.scale} fill="rgba(14,18,10,0.85)" />
        </g>
      );
    }
    if (el.type === "clothes") {
      return (
        <g key={`b${idx}`}>
          <ellipse cx={cx} cy={baseY - 4 * el.scale} rx={14 * el.scale} ry={5 * el.scale} fill="rgba(180,140,90,0.75)" />
          <ellipse cx={cx - 4 * el.scale} cy={baseY - 6 * el.scale} rx={9 * el.scale} ry={3.5 * el.scale} fill="rgba(220,80,60,0.65)" />
          <ellipse cx={cx + 5 * el.scale} cy={baseY - 7 * el.scale} rx={7 * el.scale} ry={3 * el.scale} fill="rgba(80,140,180,0.6)" />
        </g>
      );
    }
    // sunbather reclining on bank
    return (
      <g key={`b${idx}`}>
        <ellipse cx={cx} cy={baseY - 2} rx={28 * el.scale} ry={4 * el.scale} fill="rgba(0,0,0,0.3)" />
        <ellipse cx={cx} cy={baseY - 5 * el.scale} rx={22 * el.scale} ry={4 * el.scale} fill="rgba(20,14,10,0.85)" />
        <circle cx={cx + 18 * el.scale} cy={baseY - 6 * el.scale} r={4 * el.scale} fill="rgba(20,14,10,0.85)" />
      </g>
    );
  };

  /* ----------------------------------------------------------------- */
  /*  Render                                                            */
  /* ----------------------------------------------------------------- */
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}>
        <defs>
          <linearGradient id="vs-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(40,75,110,0.55)" />
            <stop offset="0.5" stopColor="rgba(28,55,85,0.7)" />
            <stop offset="1" stopColor="rgba(14,30,52,0.85)" />
          </linearGradient>
          <linearGradient id="vs-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(255,220,170,0)" />
            <stop offset="0.5" stopColor="rgba(255,210,150,0.18)" />
            <stop offset="1" stopColor="rgba(255,200,140,0)" />
          </linearGradient>
          <radialGradient id="vs-sunglow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={sunColor} stopOpacity="0.85" />
            <stop offset="1" stopColor={sunColor} stopOpacity="0" />
          </radialGradient>
          <filter id="vs-blur"><feGaussianBlur stdDeviation="1.2" /></filter>
        </defs>

        {/* Hot summer haze band above water */}
        <rect x={0} y={bandTop - 60} width={width} height={120} fill="url(#vs-haze)"
          opacity={0.7 + Math.sin(frame * 0.012) * 0.1} />

        {/* Water body */}
        <path d={bankPath} fill="url(#vs-water)" />

        {/* Reflection depth lines */}
        {Array.from({ length: 8 }).map((_, i) => {
          const yFrac = 0.15 + (i / 8) * 0.85;
          const y = waterTop + waterHeight * yFrac;
          return <line key={`refl${i}`} x1={0} y1={y} x2={width} y2={y + Math.sin(frame * 0.02 + i) * 2}
            stroke="rgba(180,210,235,1)" strokeWidth={0.6} opacity={0.06 + (1 - yFrac) * 0.08} />;
        })}

        {/* Multi-layer ripple paths */}
        <path d={ripple(0.22, 0.28, 0, waveAmp * 0.8)} fill="none" stroke="rgba(200,220,240,0.4)" strokeWidth={1.1} />
        <path d={ripple(0.4, 0.34, 1.2, waveAmp * 0.95)} fill="none" stroke="rgba(180,210,235,0.35)" strokeWidth={1} />
        <path d={ripple(0.55, 0.22, 2.4, waveAmp)} fill="none" stroke="rgba(160,195,225,0.32)" strokeWidth={1.2} />
        <path d={ripple(0.72, 0.4, 0.6, waveAmp * 0.75)} fill="none" stroke="rgba(150,185,215,0.28)" strokeWidth={0.9} />
        <path d={ripple(0.88, 0.18, 3.1, waveAmp * 0.6)} fill="none" stroke="rgba(140,175,205,0.22)" strokeWidth={0.8} />

        {/* Subtle current flow lines */}
        {Array.from({ length: 6 }).map((_, i) => {
          const yFrac = 0.3 + (i / 6) * 0.6;
          const y = waterTop + waterHeight * yFrac;
          const flowPhase = frame * 0.015 * tempoFactor + i * 0.6;
          const xs = Array.from({ length: 12 }, (_, k) => {
            const px = (k / 11) * width;
            return `${px},${y + Math.sin(px * 0.005 + flowPhase) * 4}`;
          });
          return <path key={`flow${i}`} d={`M ${xs.join(" L ")}`} fill="none"
            stroke="rgba(220,235,250,0.18)" strokeWidth={0.7} strokeDasharray="14 22" />;
        })}

        {/* Sun reflection glow column */}
        <ellipse cx={sunPathX} cy={(sunPathTop + sunPathBot) / 2} rx={42} ry={sunPathLen * 0.55}
          fill="url(#vs-sunglow)" opacity={0.65 * sunPulse} />

        {/* Twinkling sun glints along the path */}
        {glints.map((g, i) => {
          const py = sunPathTop + g.t * sunPathLen;
          const px = sunPathX + g.jitter + Math.sin(frame * g.freq + g.phase) * 6;
          const twinkle = 0.4 + (Math.sin(frame * g.freq * 2.4 + g.phase) * 0.5 + 0.5) * 0.6;
          const r = g.r * (0.7 + twinkle * 0.6) * sunPulse;
          return (
            <g key={`glint${i}`}>
              <circle cx={px} cy={py} r={r * 2.4} fill={sunColor} opacity={twinkle * 0.18} filter="url(#vs-blur)" />
              <circle cx={px} cy={py} r={r} fill="rgba(255,250,220,1)" opacity={twinkle * 0.95} />
              {twinkle > 0.7 && (
                <>
                  <line x1={px - r * 4} y1={py} x2={px + r * 4} y2={py}
                    stroke="rgba(255,250,220,1)" strokeWidth={0.6} opacity={twinkle * 0.6} />
                  <line x1={px} y1={py - r * 3} x2={px} y2={py + r * 3}
                    stroke="rgba(255,250,220,1)" strokeWidth={0.6} opacity={twinkle * 0.6} />
                </>
              )}
            </g>
          );
        })}

        {/* Riverbank edge highlight */}
        <path d={bankEdge} fill="none" stroke="rgba(220,200,160,0.55)" strokeWidth={1.5} />

        {/* Riverbank elements (trees, clothes piles, sunbather) */}
        {bank.map(renderBank)}

        {/* Wisps of steam rising from water */}
        {Array.from({ length: 7 }).map((_, i) => {
          const sx = (i / 7) * width + Math.sin(frame * 0.008 + i) * 18;
          const sy0 = waterTop + 6 + Math.sin(i * 1.4) * 4;
          const drift = Math.sin(frame * 0.02 + i * 1.3) * 12;
          const len = 32 + Math.sin(i * 2.1) * 10;
          return (
            <path key={`steam${i}`}
              d={`M ${sx} ${sy0} Q ${sx + drift} ${sy0 - len * 0.5} ${sx + drift * 1.4} ${sy0 - len}`}
              fill="none" stroke="rgba(255,250,235,0.18)" strokeWidth={3.5}
              strokeLinecap="round" filter="url(#vs-blur)"
              opacity={0.55 + Math.sin(frame * 0.03 + i) * 0.2} />
          );
        })}

        {/* Swimmers — y-sorted so back swimmers draw first */}
        {[...swimmers].sort((a, b) => a.y - b.y).map((s, i) => renderSwimmer(s, i))}

        {/* Splash bursts on top */}
        {splashes.map(renderSplash)}
      </svg>
    </div>
  );
};
