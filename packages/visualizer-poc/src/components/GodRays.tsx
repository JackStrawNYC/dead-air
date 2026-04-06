/**
 * GodRays — A+++ volumetric light beams radiating from the upper frame.
 *
 * 9 rays originating from different points across the top edge. Each ray is a
 * 3-layer trapezoid: outer atmospheric glow (gaussian blur), main gradient body,
 * and inner bright core stripe. Rays drift slowly with independent angular sweep.
 * Varying widths (2 wide, 4 medium, 3 narrow). Dust motes float within wider
 * rays (5 small dots per wide ray). Floor illumination pools where rays hit bottom.
 * Atmospheric haze where rays overlap (additive screen blend).
 *
 * Audio mapping:
 *   energy      -> ray brightness + visible ray count (6-9)
 *   slowEnergy  -> atmospheric haze density
 *   beatDecay   -> individual ray pulse (phase-offset per ray)
 *   chromaHue   -> golden <-> cool blue color shift
 *   bass        -> floor pool glow intensity
 *
 * Cycle: 60s (1800 frames), 20s (600 frames) visible window.
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

type RayWidth = "wide" | "medium" | "narrow";

interface RayData {
  originX: number;       // 0-1 across top of screen
  sweepFreq: number;     // radians per frame
  sweepAmp: number;      // fraction of width
  sweepPhase: number;    // phase offset
  coneAngle: number;     // half-spread of beam (radians)
  length: number;        // beam length as fraction of height
  opacityMult: number;   // base opacity 0-1
  widthCategory: RayWidth;
  beatPhase: number;     // per-ray pulse phase offset
}

interface DustMote {
  xOff: number;          // offset from ray center (-0.5..0.5)
  yPos: number;          // position along ray (0=top, 1=bottom)
  driftSpd: number;      // drift speed multiplier
  driftPh: number;       // drift phase
  radius: number;        // px
  opacity: number;       // 0-1
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NUM_RAYS = 9;
const CYCLE = 1800;   // 60s at 30fps
const DURATION = 600; // 20s visible
const MOTES_PER_WIDE = 5;

/** 2 wide, 4 medium, 3 narrow */
const WIDTH_SEQ: RayWidth[] = [
  "wide", "narrow", "medium", "wide", "medium", "narrow", "medium", "medium", "narrow",
];

/** Cone angle range per width category */
const CONE: Record<RayWidth, [number, number]> = {
  wide: [0.07, 0.10],
  medium: [0.04, 0.065],
  narrow: [0.02, 0.035],
};

/** Shared extrapolation config */
const CL = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/* ------------------------------------------------------------------ */
/*  Seeded generation                                                  */
/* ------------------------------------------------------------------ */

function generateRays(seed: number): RayData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_RAYS }, (_, i) => {
    // Distribute origins evenly across top edge with controlled jitter
    const slot = (i + 0.5) / NUM_RAYS;
    const jitter = (rng() - 0.5) * (0.9 / NUM_RAYS) * 0.6;
    const ox = Math.max(0.03, Math.min(0.97, 0.05 + slot * 0.9 + jitter));
    const cat = WIDTH_SEQ[i];
    const [cMin, cMax] = CONE[cat];
    return {
      originX: ox,
      sweepFreq: 0.0015 + rng() * 0.004,
      sweepAmp: 0.02 + rng() * 0.05,
      sweepPhase: rng() * Math.PI * 2,
      coneAngle: cMin + rng() * (cMax - cMin),
      length: 0.7 + rng() * 0.3,
      opacityMult: 0.55 + rng() * 0.45,
      widthCategory: cat,
      beatPhase: rng() * Math.PI * 2,
    };
  });
}

function generateMotes(seed: number, n: number): DustMote[] {
  const rng = seeded(seed);
  return Array.from({ length: n }, () => ({
    xOff: (rng() - 0.5) * 0.7,
    yPos: 0.15 + rng() * 0.7,
    driftSpd: 0.3 + rng() * 0.7,
    driftPh: rng() * Math.PI * 2,
    radius: 1.5 + rng() * 2.5,
    opacity: 0.3 + rng() * 0.5,
  }));
}

/* ------------------------------------------------------------------ */
/*  Color + geometry helpers                                           */
/* ------------------------------------------------------------------ */

/**
 * Map chromaHue (0-360) to ray color.
 * Default warm golden (hue ~42). Shifts toward cool blue (~220) as
 * chromaHue enters the 60-300 range.
 */
function rayColor(chromaHue: number, energy: number) {
  const nh = ((chromaHue % 360) + 360) % 360;
  let h: number;
  if (nh < 60) h = 38 + nh * 0.1;
  else if (nh < 180) h = interpolate(nh, [60, 180], [42, 220], CL);
  else if (nh < 300) h = interpolate(nh, [180, 300], [220, 260], CL);
  else h = interpolate(nh, [300, 360], [260, 42], CL);

  // Energy washes out: lower sat, higher lightness at peaks
  const s = interpolate(energy, [0.05, 0.4], [75, 30], CL);
  const l = interpolate(energy, [0.05, 0.4], [68, 92], CL);
  return { h, s, l };
}

const hs = (h: number, s: number, l: number) =>
  `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;

/** Build a trapezoid path (narrow at top, wide at bottom). */
function trapPath(
  cx: number, y0: number, htTop: number, htBot: number, len: number,
): string {
  const by = y0 + len;
  return `M ${cx - htTop} ${y0} L ${cx + htTop} ${y0} L ${cx + htBot} ${by} L ${cx - htBot} ${by} Z`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const GodRays: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const rays = React.useMemo(() => generateRays(19775508), []);
  const dustMotes = React.useMemo(
    () => rays.map((r, i) =>
      r.widthCategory === "wide" ? generateMotes(19775508 + 1000 + i * 137, MOTES_PER_WIDE) : [],
    ),
    [rays],
  );

  /* ---- Timing gate ---- */
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    ...CL, easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    ...CL, easing: Easing.in(Easing.quad),
  });
  const masterOp = Math.min(fadeIn, fadeOut) * 0.55;
  if (masterOp < 0.01) return null;

  /* ---- Audio-reactive values ---- */
  const { energy, slowEnergy, beatDecay, chromaHue, bass } = snap;

  const bright = interpolate(energy, [0.04, 0.35], [0.45, 1.3], CL);
  const visCount = Math.round(interpolate(energy, [0.03, 0.3], [6, NUM_RAYS], CL));
  const haze = interpolate(slowEnergy, [0.03, 0.25], [0.08, 0.35], CL);
  const floorGlow = interpolate(bass, [0.02, 0.3], [0.1, 0.6], CL);

  const { h: rH, s: rS, l: rL } = rayColor(chromaHue, energy);
  const originY = -12;
  const t = frame * tempoFactor;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: masterOp, pointerEvents: "none", mixBlendMode: "screen" }}
      >
        <defs>
          {/* Per-ray gradients: outer glow, main body, inner core, floor pool */}
          {rays.map((ray, ri) => {
            if (ri >= visCount) return null;

            // Per-ray beat pulse — phase offset so they don't all pulse together
            const pulse = 1 + beatDecay * 0.25 * Math.sin(ray.beatPhase + frame * 0.1);
            const eb = bright * ray.opacityMult * pulse; // effective brightness

            return (
              <React.Fragment key={`d-${ri}`}>
                {/* Outer atmospheric glow gradient */}
                <linearGradient id={`go-${ri}`} x1="0.5" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor={hs(rH, rS * 0.6, rL + 8)} stopOpacity={0.18 * eb} />
                  <stop offset="35%" stopColor={hs(rH, rS * 0.5, rL + 5)} stopOpacity={0.10 * eb} />
                  <stop offset="75%" stopColor={hs(rH, rS * 0.4, rL)} stopOpacity={0.04 * eb} />
                  <stop offset="100%" stopColor={hs(rH, rS * 0.3, rL)} stopOpacity={0} />
                </linearGradient>

                {/* Main body gradient */}
                <linearGradient id={`gm-${ri}`} x1="0.5" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor={hs(rH, rS, rL)} stopOpacity={0.35 * eb} />
                  <stop offset="20%" stopColor={hs(rH, rS * 0.9, rL + 3)} stopOpacity={0.28 * eb} />
                  <stop offset="55%" stopColor={hs(rH, rS * 0.7, rL + 2)} stopOpacity={0.14 * eb} />
                  <stop offset="85%" stopColor={hs(rH, rS * 0.5, rL)} stopOpacity={0.05 * eb} />
                  <stop offset="100%" stopColor={hs(rH, rS * 0.3, rL)} stopOpacity={0} />
                </linearGradient>

                {/* Inner bright core gradient */}
                <linearGradient id={`gc-${ri}`} x1="0.5" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor={hs(rH, rS * 0.3, Math.min(rL + 20, 98))} stopOpacity={0.55 * eb} />
                  <stop offset="15%" stopColor={hs(rH, rS * 0.4, Math.min(rL + 15, 96))} stopOpacity={0.40 * eb} />
                  <stop offset="50%" stopColor={hs(rH, rS * 0.5, rL + 8)} stopOpacity={0.18 * eb} />
                  <stop offset="80%" stopColor={hs(rH, rS * 0.4, rL)} stopOpacity={0.06 * eb} />
                  <stop offset="100%" stopColor={hs(rH, rS * 0.3, rL)} stopOpacity={0} />
                </linearGradient>

                {/* Floor illumination pool radial gradient */}
                <radialGradient id={`gp-${ri}`} cx="0.5" cy="0" r="0.7">
                  <stop offset="0%" stopColor={hs(rH, rS * 0.6, rL + 5)} stopOpacity={floorGlow * eb * 0.5} />
                  <stop offset="50%" stopColor={hs(rH, rS * 0.4, rL)} stopOpacity={floorGlow * eb * 0.2} />
                  <stop offset="100%" stopColor={hs(rH, rS * 0.3, rL)} stopOpacity={0} />
                </radialGradient>
              </React.Fragment>
            );
          })}

          {/* Blur filters — different stdDeviation per layer */}
          <filter id="gbo"><feGaussianBlur stdDeviation="18" /></filter>
          <filter id="gbm"><feGaussianBlur stdDeviation="6" /></filter>
          <filter id="gbc"><feGaussianBlur stdDeviation="2" /></filter>
          <filter id="gbp"><feGaussianBlur stdDeviation="30" /></filter>
          <filter id="gbmo"><feGaussianBlur stdDeviation="1.5" /></filter>
          <filter id="gbh"><feGaussianBlur stdDeviation="40" /></filter>
        </defs>

        {/* Atmospheric haze layer — diffuse glow where rays overlap */}
        <rect
          x={0} y={0} width={width} height={height}
          fill={hs(rH, rS * 0.3, rL + 5)}
          opacity={haze * masterOp * 0.4}
          filter="url(#gbh)"
        />

        {/* Render each visible ray */}
        {rays.map((ray, ri) => {
          if (ri >= visCount) return null;

          // Dual-frequency angular drift (slow primary + subtle secondary)
          const sweep =
            Math.sin(t * ray.sweepFreq + ray.sweepPhase) * ray.sweepAmp +
            Math.sin(t * ray.sweepFreq * 0.37 + ray.sweepPhase * 1.7) * ray.sweepAmp * 0.3;

          const bLen = height * ray.length;
          const cx = (ray.originX + sweep) * width;

          // Trapezoid half-spreads: narrow at top, wide at bottom
          const htTop = ray.coneAngle * bLen * 0.05;
          const htBot = ray.coneAngle * bLen;

          const motes = dustMotes[ri];

          return (
            <g key={`r-${ri}`}>
              {/* Layer 1: Outer atmospheric glow (widest, most blurred) */}
              <path
                d={trapPath(cx, originY, htTop * 2.24, htBot * 1.6, bLen * 1.05)}
                fill={`url(#go-${ri})`}
                filter="url(#gbo)"
              />

              {/* Layer 2: Main gradient body */}
              <path
                d={trapPath(cx, originY, htTop * 0.8, htBot, bLen)}
                fill={`url(#gm-${ri})`}
                filter="url(#gbm)"
              />

              {/* Layer 3: Inner bright core stripe (narrowest, sharpest) */}
              <path
                d={trapPath(cx, originY, htTop * 0.15, htBot * 0.3, bLen * 0.92)}
                fill={`url(#gc-${ri})`}
                filter="url(#gbc)"
              />

              {/* Floor illumination pool */}
              <ellipse
                cx={cx} cy={originY + bLen}
                rx={htBot * 1.8} ry={height * 0.08}
                fill={`url(#gp-${ri})`}
                filter="url(#gbp)"
              />

              {/* Dust motes floating within wide rays */}
              {motes.map((m, mi) => {
                const mt = t * m.driftSpd * 0.008;
                const dx = Math.sin(mt + m.driftPh) * htBot * 0.15;
                const dy = Math.cos(mt * 0.7 + m.driftPh * 1.3) * bLen * 0.03;
                const mx = cx + m.xOff * htBot * 2 * m.yPos + dx;
                const my = originY + m.yPos * bLen + dy;
                const mp = 1 + beatDecay * 0.3 * Math.sin(m.driftPh + frame * 0.15);
                const mo = m.opacity * bright * ray.opacityMult * mp * 0.6;

                return (
                  <circle
                    key={`m-${ri}-${mi}`}
                    cx={mx} cy={my} r={m.radius}
                    fill={hs(rH, rS * 0.5, Math.min(rL + 15, 96))}
                    opacity={Math.min(mo, 0.7)}
                    filter="url(#gbmo)"
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
