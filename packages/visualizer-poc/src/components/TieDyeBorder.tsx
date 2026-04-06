/**
 * TieDyeBorder — A+++ flowing psychedelic tie-dye frame around the edges.
 *
 * NOT a fullscreen wash (that's TieDyeWash). This hugs the four edges of the
 * video, leaving the center clear so the underlying shader stays the hero.
 * Inspired by hand-dyed Haight-Ashbury tapestries and 60s Fillmore poster trim.
 *
 * Composition:
 *   - Four strips (top/bottom/left/right) ~12% of min dimension wide
 *   - 5-7 SVG radialGradient swirl centers per strip, drifting via dual-freq sine
 *   - Each swirl is a 6-stop tie-dye palette wrapped around chromaHue
 *   - Bezier-curved, soft-blurred inner mask gives an organic dissolve to center
 *   - 5 Archimedean spiral motifs scattered around the border, beat-pulsed
 *
 * Audio mapping:
 *   energy         -> overall border opacity
 *   slowEnergy     -> swirl breathing (positions + radius)
 *   beatDecay      -> spiral rotation pulse + brightness spike
 *   onsetEnvelope  -> bright color flash injected through all swirls
 *   chromaHue      -> entire palette base hue (whole-spectrum cycling)
 *   tempoFactor    -> swirl drift speed
 *
 * Cycle: 60s visible window every 90s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Types + constants                                                  */
/* ------------------------------------------------------------------ */

type Edge = "top" | "bottom" | "left" | "right";

interface SwirlCenter {
  along: number; across: number;
  driftFreqA: number; driftAmpA: number;
  driftFreqB: number; driftAmpB: number;
  phase: number; radius: number;
  hueOffset: number; breathFreq: number;
}

interface SpiralMotif {
  perimeterPos: number; radius: number;
  rotPhase: number; rotSpeed: number;
  hueOffset: number; beatPhase: number;
}

const CYCLE = 2700;          // 90s @ 30fps
const VISIBLE = 1800;        // 60s visible per cycle
const BORDER_FRAC = 0.12;    // 12% of min dimension
const SWIRLS_PER_LONG = 7;   // top/bottom strips
const SWIRLS_PER_SHORT = 5;  // left/right strips
const NUM_SPIRALS = 5;
const STOP_COUNT = 6;
const SEED = 0x71ed3e;

const CL = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

function hsl(h: number, s: number, l: number, a = 1): string {
  const hh = (((h % 360) + 360) % 360).toFixed(1);
  return `hsla(${hh}, ${(s * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%, ${a.toFixed(3)})`;
}

/** 6-stop tie-dye palette around a base hue, brightened by onset flashes. */
function paletteStops(
  baseHue: number,
  hueOffset: number,
  energy: number,
  flashAmt: number,
): { color: string; pct: number }[] {
  const eSat = interpolate(energy, [0.04, 0.35], [0.92, 0.78], CL);
  const eL = interpolate(energy, [0.04, 0.35], [0.5, 0.62], CL);
  const stops: { color: string; pct: number }[] = [];
  for (let i = 0; i < STOP_COUNT; i++) {
    const t = i / (STOP_COUNT - 1);
    const h = baseHue + hueOffset * 360 + t * 360 - 30 * Math.sin(t * Math.PI * 2);
    const lift = Math.sin(t * Math.PI);
    const s = Math.min(1, eSat + 0.08 * lift);
    const l = Math.min(0.9, eL + 0.18 * lift + flashAmt * 0.25);
    const a = 0.85 - 0.55 * Math.abs(t - 0.4);
    stops.push({ color: hsl(h, s, l, a), pct: t * 100 });
  }
  return stops;
}

/* ------------------------------------------------------------------ */
/*  Seeded swirl + spiral generation                                   */
/* ------------------------------------------------------------------ */

function generateSwirls(seed: number, count: number): SwirlCenter[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const slot = (i + 0.5) / count;
    const jitter = (rng() - 0.5) * (0.6 / count);
    return {
      along: Math.max(0.02, Math.min(0.98, slot + jitter)),
      across: 0.32 + rng() * 0.36,
      driftFreqA: 0.0018 + rng() * 0.003,
      driftAmpA: 0.025 + rng() * 0.04,
      driftFreqB: 0.0022 + rng() * 0.0035,
      driftAmpB: 0.05 + rng() * 0.08,
      phase: rng() * Math.PI * 2,
      radius: 0.55 + rng() * 0.5,
      hueOffset: rng(),
      breathFreq: 0.005 + rng() * 0.008,
    };
  });
}

function generateSpirals(seed: number): SpiralMotif[] {
  const rng = seeded(seed);
  const slots = [0.10, 0.30, 0.50, 0.70, 0.90];
  return slots.slice(0, NUM_SPIRALS).map((slot) => ({
    perimeterPos: slot + (rng() - 0.5) * 0.05,
    radius: 28 + rng() * 14,
    rotPhase: rng() * Math.PI * 2,
    rotSpeed: 0.5 + rng() * 1.0,
    hueOffset: rng(),
    beatPhase: rng() * Math.PI * 2,
  }));
}

/* ------------------------------------------------------------------ */
/*  Strip geometry                                                     */
/* ------------------------------------------------------------------ */

interface StripBox { edge: Edge; x: number; y: number; w: number; h: number }

function buildStrips(width: number, height: number, t: number): StripBox[] {
  return [
    { edge: "top",    x: 0,         y: 0,          w: width,  h: t },
    { edge: "bottom", x: 0,         y: height - t, w: width,  h: t },
    { edge: "left",   x: 0,         y: t,          w: t,      h: height - t * 2 },
    { edge: "right",  x: width - t, y: t,          w: t,      h: height - t * 2 },
  ];
}

/** Map perimeter position 0-1 (clockwise from top-left) to a centerline point. */
function perimeterPoint(
  pos: number, width: number, height: number, thickness: number,
): { x: number; y: number } {
  const half = thickness / 2;
  const innerW = width - thickness;
  const innerH = height - thickness;
  const perim = 2 * (innerW + innerH);
  const d = (((pos % 1) + 1) % 1) * perim;
  if (d < innerW) return { x: half + d, y: half };
  if (d < innerW + innerH) return { x: width - half, y: half + (d - innerW) };
  if (d < innerW * 2 + innerH) return { x: width - half - (d - innerW - innerH), y: height - half };
  return { x: half, y: height - half - (d - innerW * 2 - innerH) };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const TieDyeBorder: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  /* ---- Visibility cycle ---- */
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= VISIBLE) return null;
  const progress = cycleFrame / VISIBLE;
  const fadeIn = interpolate(progress, [0, 0.05], [0, 1], CL);
  const fadeOut = interpolate(progress, [0.94, 1], [1, 0], CL);
  const cycleOp = Math.min(fadeIn, fadeOut);
  if (cycleOp < 0.01) return null;

  /* ---- Audio scalars ---- */
  const { energy, slowEnergy, beatDecay, chromaHue, onsetEnvelope } = snap;
  const energyOp = interpolate(energy, [0.04, 0.32], [0.32, 0.78], CL);
  const masterOp = energyOp * cycleOp;
  const t = frame * tempoFactor;
  const breath = 0.85 + slowEnergy * 0.4;
  const flashAmt = Math.min(1, onsetEnvelope * 1.4);
  const beatPulse = beatDecay;
  const baseHue = ((chromaHue % 360) + 360) % 360;

  /* ---- Geometry + seeded data ---- */
  const thickness = Math.round(Math.min(width, height) * BORDER_FRAC);
  const strips = React.useMemo(
    () => buildStrips(width, height, thickness),
    [width, height, thickness],
  );
  const swirlMap = React.useMemo<Record<Edge, SwirlCenter[]>>(() => ({
    top:    generateSwirls(SEED + 11, SWIRLS_PER_LONG),
    bottom: generateSwirls(SEED + 23, SWIRLS_PER_LONG),
    left:   generateSwirls(SEED + 37, SWIRLS_PER_SHORT),
    right:  generateSwirls(SEED + 53, SWIRLS_PER_SHORT),
  }), []);
  const spirals = React.useMemo(() => generateSpirals(SEED + 71), []);

  /* ---- Bezier inner-edge path (organic, slightly wobbling) ---- */
  const wobble = 4 + slowEnergy * 6;
  const wobblePhase = t * 0.012;
  const innerPath = React.useMemo(() => {
    const x0 = thickness, y0 = thickness;
    const x1 = width - thickness, y1 = height - thickness;
    const pts = [
      { x: x0, y: y0 }, { x: (x0 + x1) / 2, y: y0 }, { x: x1, y: y0 },
      { x: x1, y: (y0 + y1) / 2 }, { x: x1, y: y1 },
      { x: (x0 + x1) / 2, y: y1 }, { x: x0, y: y1 },
      { x: x0, y: (y0 + y1) / 2 },
    ];
    const off = (i: number, axis: "x" | "y") =>
      Math.sin(wobblePhase + i * 0.7 + (axis === "x" ? 0 : Math.PI / 3)) * wobble;
    const px = pts.map((p, i) => ({ x: p.x + off(i, "x"), y: p.y + off(i, "y") }));
    let d = `M ${px[0].x.toFixed(2)} ${px[0].y.toFixed(2)} `;
    for (let i = 0; i < px.length; i++) {
      const a = px[i], b = px[(i + 1) % px.length];
      const cx1 = a.x + (b.x - a.x) * 0.55 + Math.sin(wobblePhase + i) * wobble * 0.5;
      const cy1 = a.y + (b.y - a.y) * 0.45 + Math.cos(wobblePhase + i) * wobble * 0.5;
      const cx2 = a.x + (b.x - a.x) * 0.45 + Math.cos(wobblePhase + i * 1.3) * wobble * 0.5;
      const cy2 = a.y + (b.y - a.y) * 0.55 + Math.sin(wobblePhase + i * 1.3) * wobble * 0.5;
      d += `C ${cx1.toFixed(2)} ${cy1.toFixed(2)}, ${cx2.toFixed(2)} ${cy2.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)} `;
    }
    return d + "Z";
  }, [width, height, thickness, wobble, wobblePhase]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity: masterOp,
        mixBlendMode: "screen",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <filter id="tdb-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="tdb-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>

          {/* Border mask: white outside the bezier inner edge, black inside.
              Soft alpha gradient prevents a hard cutoff against the center. */}
          <mask id="tdb-mask">
            <rect x={0} y={0} width={width} height={height} fill="white" />
            <path d={innerPath} fill="black" filter="url(#tdb-soft)" />
          </mask>

          {/* Per-edge per-swirl radial gradients */}
          {(["top", "bottom", "left", "right"] as Edge[]).flatMap((edge) =>
            swirlMap[edge].map((sw, si) => {
              const stops = paletteStops(
                baseHue, sw.hueOffset + frame * 0.0006, energy, flashAmt,
              );
              return (
                <radialGradient
                  key={`g-${edge}-${si}`}
                  id={`tdb-grad-${edge}-${si}`}
                  cx="50%" cy="50%" r="50%"
                >
                  {stops.map((s, i) => (
                    <stop key={i} offset={`${s.pct.toFixed(1)}%`} stopColor={s.color} />
                  ))}
                </radialGradient>
              );
            }),
          )}

          {/* Single spiral gradient (hue rotated per spiral by hsl) */}
          <radialGradient id="tdb-spiral-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={hsl(baseHue + 30, 0.95, 0.78, 0.95)} />
            <stop offset="35%"  stopColor={hsl(baseHue + 90, 0.9, 0.6, 0.7)} />
            <stop offset="70%"  stopColor={hsl(baseHue + 200, 0.85, 0.5, 0.4)} />
            <stop offset="100%" stopColor={hsl(baseHue + 280, 0.8, 0.4, 0)} />
          </radialGradient>
        </defs>

        {/* Masked border content */}
        <g mask="url(#tdb-mask)">
          <rect
            x={0} y={0} width={width} height={height}
            fill={hsl(baseHue + 180, 0.55, 0.18, 0.35)}
          />

          {(["top", "bottom", "left", "right"] as Edge[]).map((edge) => {
            const strip = strips.find((s) => s.edge === edge)!;
            const isHorizontal = edge === "top" || edge === "bottom";
            return (
              <g key={`s-${edge}`}>
                {swirlMap[edge].map((sw, si) => {
                  const driftA =
                    Math.sin(t * sw.driftFreqA + sw.phase) * sw.driftAmpA +
                    Math.sin(t * sw.driftFreqA * 0.4 + sw.phase * 1.3) * sw.driftAmpA * 0.35;
                  const driftB = Math.sin(t * sw.driftFreqB + sw.phase * 1.7) * sw.driftAmpB;
                  const along = Math.max(-0.05, Math.min(1.05, sw.along + driftA));
                  const across = Math.max(0.05, Math.min(0.95, sw.across + driftB));

                  const cx = isHorizontal
                    ? strip.x + along * strip.w
                    : strip.x + across * strip.w;
                  const cy = isHorizontal
                    ? strip.y + across * strip.h
                    : strip.y + along * strip.h;

                  const rPx = thickness * sw.radius * breath *
                    (1 + 0.18 * Math.sin(frame * sw.breathFreq + sw.phase));

                  return (
                    <circle
                      key={`c-${edge}-${si}`}
                      cx={cx} cy={cy} r={rPx}
                      fill={`url(#tdb-grad-${edge}-${si})`}
                      filter="url(#tdb-blur)"
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Onset flash — bright sweep across the border on transients */}
          {flashAmt > 0.05 && (
            <rect
              x={0} y={0} width={width} height={height}
              fill={hsl(baseHue + 60, 0.4, 0.85, flashAmt * 0.35)}
            />
          )}
        </g>

        {/* Spiral motifs — drawn unmasked so they sit cleanly atop the border */}
        {spirals.map((sp, i) => {
          const pt = perimeterPoint(sp.perimeterPos, width, height, thickness);
          const baseRot = (frame * sp.rotSpeed * 0.8 + sp.rotPhase * 30) % 360;
          const pulseKick = beatPulse * 18 * Math.sin(sp.beatPhase + frame * 0.1);
          const rot = baseRot + pulseKick;
          const scale = 1 + beatPulse * 0.18;
          const sR = sp.radius * scale;
          const sHue = baseHue + sp.hueOffset * 360;

          // 3-arm Archimedean spiral
          const arms = 3, turns = 2.2, segs = 28;
          let pathD = "";
          for (let a = 0; a < arms; a++) {
            const armPhase = (a / arms) * Math.PI * 2;
            for (let k = 0; k <= segs; k++) {
              const tt = k / segs;
              const ang = armPhase + tt * Math.PI * 2 * turns;
              const rr = tt * sR;
              const x = Math.cos(ang) * rr;
              const y = Math.sin(ang) * rr;
              pathD += k === 0
                ? `M ${x.toFixed(2)} ${y.toFixed(2)} `
                : `L ${x.toFixed(2)} ${y.toFixed(2)} `;
            }
          }

          const armAlpha = 0.55 + beatPulse * 0.4;
          const coreAlpha = 0.85 + beatPulse * 0.15;

          return (
            <g
              key={`sp-${i}`}
              transform={`translate(${pt.x.toFixed(2)} ${pt.y.toFixed(2)}) rotate(${rot.toFixed(2)})`}
              opacity={0.85}
            >
              <circle
                cx={0} cy={0} r={sR * 1.15}
                fill="url(#tdb-spiral-grad)"
                opacity={0.35 + beatPulse * 0.4}
                filter="url(#tdb-soft)"
              />
              <path
                d={pathD}
                stroke={hsl(sHue + 20, 0.95, 0.7, armAlpha)}
                strokeWidth={2.2 + beatPulse * 1.4}
                strokeLinecap="round"
                fill="none"
              />
              <g transform={`rotate(${(-rot * 0.6).toFixed(2)})`}>
                <path
                  d={pathD}
                  stroke={hsl(sHue + 140, 0.9, 0.6, armAlpha * 0.7)}
                  strokeWidth={1.4 + beatPulse * 0.8}
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.7}
                />
              </g>
              <circle
                cx={0} cy={0} r={3 + beatPulse * 2}
                fill={hsl(sHue + 60, 0.4, 0.92, coreAlpha)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
