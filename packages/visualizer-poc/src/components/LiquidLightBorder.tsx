/**
 * LiquidLightBorder — A+++ 60s acid-test liquid light show frame.
 *
 * Joshua Light Show / Headlights aesthetic: oil + water + colored dyes pressed
 * between glass clock-face dishes on an overhead projector, heated and flexed
 * to make iridescent blobs bloom, merge and drift across a giant Fillmore
 * screen behind the band. The visual grandparent of every Dead show ever.
 *
 * Bezier-morphed organic blobs along four edges, multi-layer concentric color
 * rings (the way real oil refracts on a water meniscus), bevel highlight glints,
 * slow birth/death cycle, soft alpha mask into the center (no hard cutoff).
 *
 * Audio mapping:
 *   energy      -> opacity + blob count
 *   slowEnergy  -> morph rate (slow at quiet, faster when loud)
 *   beatDecay   -> per-blob pulse (some blobs flash brighter)
 *   bass        -> blob expansion / contraction
 *   chromaHue   -> base hue for the iridescent rainbow palette
 *   tempoFactor -> drift speed along the strip
 *
 * Cycle: 50s visible window every 95s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Types + constants                                                  */
/* ------------------------------------------------------------------ */

type Edge = "top" | "bottom" | "left" | "right";

interface OilBlob {
  along: number;            // position along the strip [0..1]
  across: number;           // position across the strip [0..1]
  driftFreqAlong: number;
  driftAmpAlong: number;
  driftFreqAcross: number;
  driftAmpAcross: number;
  driftPhase: number;
  radius: number;           // base radius (fraction of strip thickness)
  morphFreqs: number[];     // per-control-point morph frequencies
  morphPhases: number[];
  morphAmps: number[];
  hueOffset: number;        // hue offset within the iridescent palette
  lifePeriod: number;       // birth/death period (frames)
  lifeOffset: number;
  beatGain: number;         // some blobs pulse harder than others
  bevelAngle: number;       // bevel highlight angle (radians)
}

const CYCLE = 2850;             // 95s @ 30fps
const VISIBLE = 1500;           // 50s visible per cycle
const BORDER_FRAC = 0.14;       // 14% of min dimension
const BLOBS_PER_LONG = 12;      // top/bottom strips
const BLOBS_PER_SHORT = 9;      // left/right strips
const SEED = 0x11d_11d;
const RING_COUNT = 4;           // concentric color rings per blob
const CONTROL_POINTS = 8;       // points around each blob outline

const CL = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

function hsl(h: number, s: number, l: number, a = 1): string {
  const hh = (((h % 360) + 360) % 360).toFixed(1);
  return `hsla(${hh}, ${(s * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%, ${a.toFixed(3)})`;
}

/**
 * Iridescent oil palette: 4 concentric rings sweeping the rainbow around
 * a base hue. Outer ring is darker/more transparent, inner is brightest.
 * Mimics the way real oil refraction layers cyan -> magenta -> yellow.
 */
function oilRingColor(
  ringIndex: number,
  baseHue: number,
  hueOffset: number,
  energy: number,
  beatBoost: number,
): string {
  // Ring 0 = outermost halo, Ring (RING_COUNT-1) = innermost core
  const t = ringIndex / (RING_COUNT - 1);
  const hueSpread = 220;          // degrees swept across the rings
  const h = baseHue + hueOffset * 360 + (1 - t) * hueSpread - 90;
  // Saturation peaks in the middle rings
  const satCurve = 0.78 + 0.22 * Math.sin(t * Math.PI);
  const s = Math.min(1, satCurve + 0.06 * energy);
  // Lightness rises toward the core
  const l = Math.min(0.9, 0.42 + t * 0.36 + beatBoost * 0.12);
  // Alpha: outer rings more transparent for soft falloff
  const a = (0.18 + t * 0.55) * (0.85 + energy * 0.25);
  return hsl(h, s, l, Math.min(0.95, a));
}

/* ------------------------------------------------------------------ */
/*  Seeded blob generation                                             */
/* ------------------------------------------------------------------ */

function generateBlobs(seed: number, count: number): OilBlob[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    // Distribute along the strip with jitter so blobs don't queue up
    const slot = (i + 0.5) / count;
    const jitter = (rng() - 0.5) * (0.7 / count);
    const morphFreqs: number[] = [];
    const morphPhases: number[] = [];
    const morphAmps: number[] = [];
    for (let p = 0; p < CONTROL_POINTS; p++) {
      morphFreqs.push(0.012 + rng() * 0.022);
      morphPhases.push(rng() * Math.PI * 2);
      morphAmps.push(0.18 + rng() * 0.32);
    }
    return {
      along: Math.max(0.02, Math.min(0.98, slot + jitter)),
      across: 0.34 + rng() * 0.32,
      driftFreqAlong: 0.0011 + rng() * 0.0022,
      driftAmpAlong: 0.04 + rng() * 0.08,
      driftFreqAcross: 0.0014 + rng() * 0.0026,
      driftAmpAcross: 0.06 + rng() * 0.10,
      driftPhase: rng() * Math.PI * 2,
      radius: 0.55 + rng() * 0.55,
      morphFreqs,
      morphPhases,
      morphAmps,
      hueOffset: rng(),
      lifePeriod: 360 + rng() * 540,    // 12-30s lifetime
      lifeOffset: rng() * 1000,
      beatGain: 0.4 + rng() * 0.8,
      bevelAngle: rng() * Math.PI * 2,
    };
  });
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

/* ------------------------------------------------------------------ */
/*  Bezier blob path generation                                        */
/* ------------------------------------------------------------------ */

/**
 * Build a closed cubic-bezier blob outline by sampling N control points around
 * a circle and offsetting each radius by a slow per-point oscillation. This is
 * what gives the blob its organic, breathing-oil shape.
 */
function buildBlobPath(
  cx: number,
  cy: number,
  baseRadius: number,
  blob: OilBlob,
  morphTime: number,
  bassBoost: number,
): string {
  const pts: { x: number; y: number }[] = [];
  for (let p = 0; p < CONTROL_POINTS; p++) {
    const ang = (p / CONTROL_POINTS) * Math.PI * 2;
    const wob =
      Math.sin(morphTime * blob.morphFreqs[p] + blob.morphPhases[p]) *
        blob.morphAmps[p] +
      Math.sin(morphTime * blob.morphFreqs[p] * 1.7 + blob.morphPhases[p] * 1.3) *
        blob.morphAmps[p] *
        0.4;
    const r = baseRadius * (1 + wob + bassBoost * 0.18);
    pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
  }
  // Closed Catmull-Rom-ish bezier through the points
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} `;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[(i + 2) % pts.length];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `;
  }
  return d + "Z";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const LiquidLightBorder: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  /* ---- Visibility cycle ---- */
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= VISIBLE) return null;
  const progress = cycleFrame / VISIBLE;
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], CL);
  const fadeOut = interpolate(progress, [0.93, 1], [1, 0], CL);
  const cycleOp = Math.min(fadeIn, fadeOut);
  if (cycleOp < 0.01) return null;

  /* ---- Audio scalars ---- */
  const { energy, slowEnergy, beatDecay, chromaHue, bass } = snap;
  const energyOp = interpolate(energy, [0.04, 0.32], [0.34, 0.85], CL);
  const masterOp = energyOp * cycleOp;

  // Morph rate scales with slowEnergy: slow oily drift at quiet, faster when loud
  const morphRate = 0.6 + slowEnergy * 1.4;
  const driftTime = frame * tempoFactor;
  const morphTime = frame * morphRate;

  // Bass-driven expansion/contraction (oil pushed by speaker pressure)
  const bassPulse = interpolate(bass, [0, 0.6], [0, 0.45], CL);

  // ChromaHue base for the iridescent rainbow
  const baseHue = ((chromaHue % 360) + 360) % 360;

  // Active blob count scales with energy (more blobs when loud)
  const blobFraction = interpolate(energy, [0.05, 0.4], [0.55, 1.0], CL);

  /* ---- Geometry + seeded data ---- */
  const thickness = Math.round(Math.min(width, height) * BORDER_FRAC);
  const strips = React.useMemo(
    () => buildStrips(width, height, thickness),
    [width, height, thickness],
  );
  const blobMap = React.useMemo<Record<Edge, OilBlob[]>>(() => ({
    top:    generateBlobs(SEED + 13, BLOBS_PER_LONG),
    bottom: generateBlobs(SEED + 29, BLOBS_PER_LONG),
    left:   generateBlobs(SEED + 41, BLOBS_PER_SHORT),
    right:  generateBlobs(SEED + 59, BLOBS_PER_SHORT),
  }), []);

  /* ---- Bezier inner-edge path for soft mask ---- */
  const wobble = 5 + slowEnergy * 7;
  const wobblePhase = morphTime * 0.009;
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
      Math.sin(wobblePhase + i * 0.6 + (axis === "x" ? 0 : Math.PI / 4)) * wobble;
    const px = pts.map((p, i) => ({ x: p.x + off(i, "x"), y: p.y + off(i, "y") }));
    let d = `M ${px[0].x.toFixed(2)} ${px[0].y.toFixed(2)} `;
    for (let i = 0; i < px.length; i++) {
      const a = px[i], b = px[(i + 1) % px.length];
      const cx1 = a.x + (b.x - a.x) * 0.55 + Math.sin(wobblePhase + i) * wobble * 0.4;
      const cy1 = a.y + (b.y - a.y) * 0.45 + Math.cos(wobblePhase + i) * wobble * 0.4;
      const cx2 = a.x + (b.x - a.x) * 0.45 + Math.cos(wobblePhase + i * 1.4) * wobble * 0.4;
      const cy2 = a.y + (b.y - a.y) * 0.55 + Math.sin(wobblePhase + i * 1.4) * wobble * 0.4;
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
          {/* Blurs for soft halos and bevel highlights */}
          <filter id="llb-halo" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
          <filter id="llb-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="llb-glint" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
          <filter id="llb-mask-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>

          {/* Border mask: white outside the bezier inner edge, black inside */}
          <mask id="llb-mask">
            <rect x={0} y={0} width={width} height={height} fill="white" />
            <path d={innerPath} fill="black" filter="url(#llb-mask-blur)" />
          </mask>

          {/* Bevel highlight gradient — wet glossy oil glint */}
          <radialGradient id="llb-bevel" cx="35%" cy="30%" r="55%">
            <stop offset="0%"  stopColor="hsla(0, 0%, 100%, 0.85)" />
            <stop offset="40%" stopColor="hsla(0, 0%, 100%, 0.18)" />
            <stop offset="100%" stopColor="hsla(0, 0%, 100%, 0)" />
          </radialGradient>
        </defs>

        {/* Masked border content */}
        <g mask="url(#llb-mask)">
          {/* Faint warm wash so the border has a base presence even between blobs */}
          <rect
            x={0} y={0} width={width} height={height}
            fill={hsl(baseHue + 200, 0.42, 0.14, 0.32)}
          />

          {(["top", "bottom", "left", "right"] as Edge[]).map((edge) => {
            const strip = strips.find((s) => s.edge === edge)!;
            const isHorizontal = edge === "top" || edge === "bottom";
            const all = blobMap[edge];
            const activeCount = Math.max(3, Math.round(all.length * blobFraction));
            const blobs = all.slice(0, activeCount);
            return (
              <g key={`strip-${edge}`}>
                {blobs.map((blob, bi) => {
                  // Slow oil drift along + across the strip
                  const driftA =
                    Math.sin(driftTime * blob.driftFreqAlong + blob.driftPhase) *
                      blob.driftAmpAlong +
                    Math.sin(driftTime * blob.driftFreqAlong * 0.42 + blob.driftPhase * 1.3) *
                      blob.driftAmpAlong *
                      0.35;
                  const driftC =
                    Math.sin(driftTime * blob.driftFreqAcross + blob.driftPhase * 1.7) *
                    blob.driftAmpAcross;
                  const along = Math.max(-0.06, Math.min(1.06, blob.along + driftA));
                  const across = Math.max(0.08, Math.min(0.92, blob.across + driftC));

                  const cx = isHorizontal
                    ? strip.x + along * strip.w
                    : strip.x + across * strip.w;
                  const cy = isHorizontal
                    ? strip.y + across * strip.h
                    : strip.y + along * strip.h;

                  // Birth/death life cycle: triangular envelope per blob
                  const lifePhase = ((frame + blob.lifeOffset) % blob.lifePeriod) / blob.lifePeriod;
                  const lifeEnv = Math.sin(lifePhase * Math.PI); // 0..1..0
                  const lifeOp = Math.max(0.05, lifeEnv);
                  if (lifeOp < 0.06) return null;

                  // Per-blob beat pulse
                  const beatBoost = beatDecay * blob.beatGain;
                  const baseRadius =
                    thickness * blob.radius * (0.7 + lifeEnv * 0.4) * (1 + beatBoost * 0.22);

                  // Build the morphed bezier path
                  const path = buildBlobPath(
                    cx, cy, baseRadius, blob, morphTime, bassPulse,
                  );

                  // Per-blob hue: base + offset + slow chroma drift
                  const hueOffset = blob.hueOffset + frame * 0.0004;

                  // Render concentric rings: outer halo to inner core
                  const rings = [];
                  for (let r = 0; r < RING_COUNT; r++) {
                    const ringT = r / (RING_COUNT - 1);
                    // Inner rings smaller — built by re-running buildBlobPath at scaled radius
                    const ringRadius = baseRadius * (1 - ringT * 0.55);
                    const ringPath = buildBlobPath(
                      cx, cy, ringRadius, blob, morphTime + r * 7, bassPulse,
                    );
                    const color = oilRingColor(r, baseHue, hueOffset, energy, beatBoost);
                    rings.push(
                      <path
                        key={`ring-${edge}-${bi}-${r}`}
                        d={ringPath}
                        fill={color}
                        opacity={lifeOp}
                        filter={r === 0 ? "url(#llb-halo)" : "url(#llb-soft)"}
                      />,
                    );
                  }

                  // Bevel highlight glint (specular wet-oil top-left)
                  const bevelR = baseRadius * 0.62;
                  const bevelOff = baseRadius * 0.32;
                  const bevelCx = cx + Math.cos(blob.bevelAngle) * bevelOff;
                  const bevelCy = cy + Math.sin(blob.bevelAngle) * bevelOff;

                  return (
                    <g key={`blob-${edge}-${bi}`}>
                      {rings}
                      {/* Bevel glint */}
                      <ellipse
                        cx={bevelCx}
                        cy={bevelCy}
                        rx={bevelR * 0.85}
                        ry={bevelR * 0.55}
                        fill="url(#llb-bevel)"
                        opacity={lifeOp * (0.45 + beatBoost * 0.4)}
                        filter="url(#llb-glint)"
                        transform={`rotate(${(blob.bevelAngle * 180) / Math.PI} ${bevelCx} ${bevelCy})`}
                      />
                      {/* Tiny pinpoint specular hotspot */}
                      <circle
                        cx={bevelCx - bevelR * 0.18}
                        cy={bevelCy - bevelR * 0.22}
                        r={Math.max(1.4, bevelR * 0.08)}
                        fill={hsl(baseHue + 60, 0.3, 0.96, 0.85 * lifeOp)}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Gentle bass-driven rim flash across the whole border on heavy hits */}
          {bassPulse > 0.18 && (
            <rect
              x={0} y={0} width={width} height={height}
              fill={hsl(baseHue + 40, 0.55, 0.78, bassPulse * 0.22)}
            />
          )}
        </g>
      </svg>
    </div>
  );
};
