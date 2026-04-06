/**
 * PrismRainbow — A+++ triangular prism refracting white light into seven
 * frequency-mapped rainbow bands. Rich glass detail with beveled edges,
 * internal caustics, 3-layer beams (glow / body / core), per-band audio
 * reactivity, refraction-point bloom, and scattered light particles.
 *
 * Audio mapping:
 *   bass/mids/highs  → per-band brightness (red→violet)
 *   energy           → rainbow spread angle + prism rotation
 *   onsetEnvelope    → flash intensity on all bands + refraction glow
 *   chromaHue        → prism face tint
 *   beatDecay        → sparkle pulse
 *   spectralFlux     → caustic shimmer inside glass
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";

interface Props {
  frames: EnhancedFrameData[];
}

// 7 rainbow bands: color, hex, frequency source, and chroma weight
const RAINBOW_BANDS = [
  { name: "red", hex: "#FF1A1A", glow: "#FF0000", freq: "bass" as const, w: [1.0, 0.0, 0.0] },
  { name: "orange", hex: "#FF7700", glow: "#FF5500", freq: "bass" as const, w: [0.6, 0.4, 0.0] },
  { name: "yellow", hex: "#FFD500", glow: "#FFCC00", freq: "bass" as const, w: [0.3, 0.7, 0.0] },
  { name: "green", hex: "#00DD44", glow: "#00CC33", freq: "mids" as const, w: [0.0, 1.0, 0.0] },
  { name: "cyan", hex: "#00AAFF", glow: "#0088EE", freq: "mids" as const, w: [0.0, 0.6, 0.4] },
  { name: "blue", hex: "#3333FF", glow: "#2200EE", freq: "highs" as const, w: [0.0, 0.2, 0.8] },
  { name: "violet", hex: "#9900FF", glow: "#7700DD", freq: "highs" as const, w: [0.0, 0.0, 1.0] },
] as const;

/** Simple seeded pseudo-random for deterministic sparkle positions */
function sparkleHash(seed: number): number {
  let h = (seed * 2654435761) >>> 0;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  return ((h >> 16) ^ h) / 0xffffffff;
}

/** HSL to CSS string */
function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${h % 360}, ${s}%, ${l}%, ${a})`;
}

export const PrismRainbow: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const { energy, bass, mids, highs, onsetEnvelope, chromaHue, beatDecay, spectralFlux } = snap;

  // Master opacity — fade in from silence
  const opacity = interpolate(energy, [0.02, 0.15], [0.35, 0.92], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (opacity < 0.01) return null;

  // Layout constants
  const prismCx = width * 0.38;
  const prismCy = height * 0.5;
  const prismSize = Math.min(width, height) * 0.155;

  // Prism rotation: slow drift + energy push
  const prismRotation = Math.sin(frame * 0.006) * 2.5 + energy * 6;

  // Equilateral triangle vertices
  const h0 = prismSize; // half-height
  const w0 = prismSize * 0.866; // half-width
  const triPts = [
    { x: 0, y: -h0 },
    { x: w0, y: h0 * 0.5 },
    { x: -w0, y: h0 * 0.5 },
  ];
  const triPath = `M ${triPts[0].x} ${triPts[0].y} L ${triPts[1].x} ${triPts[1].y} L ${triPts[2].x} ${triPts[2].y} Z`;

  // Slightly inset triangle for bevel highlight
  const bevelInset = 0.92;
  const bevelPath = `M ${triPts[0].x * bevelInset} ${triPts[0].y * bevelInset} L ${triPts[1].x * bevelInset} ${triPts[1].y * bevelInset} L ${triPts[2].x * bevelInset} ${triPts[2].y * bevelInset} Z`;

  // Internal caustic triangle (smaller, shimmering)
  const causticScale = 0.55 + spectralFlux * 0.15;
  const causticPath = `M ${triPts[0].x * causticScale} ${triPts[0].y * causticScale} L ${triPts[1].x * causticScale} ${triPts[1].y * causticScale} L ${triPts[2].x * causticScale} ${triPts[2].y * causticScale} Z`;

  // White input beam geometry
  const beamStartX = -prismCx - 40; // extends past left edge
  const beamEntryX = -w0;
  const beamY = 0;

  // Beam narrows as it enters prism
  const beamOuterWidth = 14;
  const beamBodyWidth = 6;
  const beamCoreWidth = 2;
  const beamEntryOuter = 8;
  const beamEntryBody = 3.5;
  const beamEntryCore = 1.2;

  // Rainbow spread driven by energy
  const spreadAngle = interpolate(energy, [0.03, 0.35], [7, 30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Exit point on right face of prism
  const exitX = w0;
  const exitY = 0;
  const beamLength = width * 0.58;

  // Per-band brightness from frequency mapping
  const bandBrightness = RAINBOW_BANDS.map((b) => {
    const raw = b.w[0] * bass + b.w[1] * mids + b.w[2] * highs;
    return interpolate(raw, [0, 0.5], [0.25, 1.0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) + onsetEnvelope * 0.18;
  });

  // Band width driven by energy
  const bandWidthOuter = interpolate(energy, [0.03, 0.35], [10, 20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bandWidthBody = interpolate(energy, [0.03, 0.35], [3.5, 7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bandWidthCore = interpolate(energy, [0.03, 0.35], [1.0, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Onset flash for refraction point
  const refractionGlow = 5 + onsetEnvelope * 12 + energy * 4;
  const refractionAlpha = 0.7 + onsetEnvelope * 0.3;

  // ChromaHue tints prism face
  const prismHue = chromaHue;

  // Sparkle positions (deterministic per frame chunk)
  const sparkleCount = 7;
  const sparkles: { x: number; y: number; bandIdx: number; alpha: number }[] = [];
  for (let s = 0; s < sparkleCount; s++) {
    const seed = Math.floor(frame / 8) * 100 + s;
    const bandIdx = Math.floor(sparkleHash(seed * 3 + 1) * RAINBOW_BANDS.length);
    const dist = 0.2 + sparkleHash(seed * 3 + 2) * 0.7; // 20-90% along beam
    const bandAngle = ((bandIdx - (RAINBOW_BANDS.length - 1) / 2) / RAINBOW_BANDS.length) * spreadAngle;
    const rad = (bandAngle * Math.PI) / 180;
    const sx = exitX + Math.cos(rad) * beamLength * dist;
    const sy = exitY + Math.sin(rad) * beamLength * dist;
    const pulse = 0.4 + beatDecay * 0.6;
    const flicker = 0.5 + 0.5 * Math.sin(frame * 0.3 + s * 1.7);
    sparkles.push({ x: sx, y: sy, bandIdx, alpha: pulse * flicker * bandBrightness[bandIdx] });
  }

  // Unique IDs for this component instance
  const uid = "prism-rb";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity, willChange: "opacity" }}
      >
        <defs>
          {/* Prism glass gradient — multi-stop with chromaHue tint */}
          <linearGradient id={`${uid}-glass`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={hsl(prismHue, 30, 85, 0.14)} />
            <stop offset="25%" stopColor={hsl(prismHue + 20, 25, 75, 0.08)} />
            <stop offset="50%" stopColor={hsl(prismHue + 10, 20, 90, 0.12)} />
            <stop offset="75%" stopColor={hsl(prismHue - 10, 25, 70, 0.06)} />
            <stop offset="100%" stopColor={hsl(prismHue + 30, 35, 80, 0.15)} />
          </linearGradient>

          {/* Bevel edge highlight gradient */}
          <linearGradient id={`${uid}-bevel`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
            <stop offset="50%" stopColor="rgba(200,220,255,0.08)" />
            <stop offset="100%" stopColor="rgba(180,200,255,0.20)" />
          </linearGradient>

          {/* Internal rainbow caustic gradient */}
          <linearGradient id={`${uid}-caustic`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={`rgba(255,50,50,${0.06 + spectralFlux * 0.08})`} />
            <stop offset="17%" stopColor={`rgba(255,160,0,${0.05 + spectralFlux * 0.07})`} />
            <stop offset="33%" stopColor={`rgba(255,255,0,${0.05 + spectralFlux * 0.06})`} />
            <stop offset="50%" stopColor={`rgba(0,220,80,${0.06 + spectralFlux * 0.08})`} />
            <stop offset="67%" stopColor={`rgba(0,150,255,${0.05 + spectralFlux * 0.07})`} />
            <stop offset="83%" stopColor={`rgba(80,0,255,${0.05 + spectralFlux * 0.06})`} />
            <stop offset="100%" stopColor={`rgba(160,0,255,${0.06 + spectralFlux * 0.08})`} />
          </linearGradient>

          {/* White beam glow filter */}
          <filter id={`${uid}-beamglow`}>
            <feGaussianBlur stdDeviation="6" result="b1" />
            <feMerge>
              <feMergeNode in="b1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Rainbow band glow filter — softer, wider */}
          <filter id={`${uid}-bandglow`}>
            <feGaussianBlur stdDeviation="5" result="b1" />
            <feMerge>
              <feMergeNode in="b1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Prism body glow */}
          <filter id={`${uid}-prismglow`}>
            <feGaussianBlur stdDeviation="4" result="b1" />
            <feMerge>
              <feMergeNode in="b1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Refraction point intense bloom */}
          <filter id={`${uid}-refbloom`}>
            <feGaussianBlur stdDeviation="8" result="b1" />
            <feGaussianBlur stdDeviation="3" result="b2" />
            <feMerge>
              <feMergeNode in="b1" />
              <feMergeNode in="b2" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Sparkle bloom */}
          <filter id={`${uid}-sparkle`}>
            <feGaussianBlur stdDeviation="2.5" result="b1" />
            <feMerge>
              <feMergeNode in="b1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Tapering beam: polygon clip for narrowing white beam */}
          <clipPath id={`${uid}-beamtaper`}>
            <polygon points={`${beamStartX},${-beamOuterWidth} ${beamEntryX},${-beamEntryOuter} ${beamEntryX},${beamEntryOuter} ${beamStartX},${beamOuterWidth}`} />
          </clipPath>
        </defs>

        <g transform={`translate(${prismCx}, ${prismCy}) rotate(${prismRotation})`}>

          {/* ═══════════ WHITE INPUT BEAM (3 layers, tapering) ═══════════ */}

          {/* Layer 1: Outer glow */}
          <line
            x1={beamStartX}
            y1={beamY}
            x2={beamEntryX}
            y2={beamY}
            stroke="rgba(200,210,255,0.12)"
            strokeWidth={beamOuterWidth}
            clipPath={`url(#${uid}-beamtaper)`}
          />

          {/* Layer 2: Main body */}
          <line
            x1={beamStartX}
            y1={beamY}
            x2={beamEntryX}
            y2={beamY}
            stroke={`rgba(255,255,255,${0.7 + onsetEnvelope * 0.2})`}
            strokeWidth={beamBodyWidth}
            filter={`url(#${uid}-beamglow)`}
          />

          {/* Narrowing polygon overlay for body (shows taper visually) */}
          <polygon
            points={`${beamStartX},${-beamBodyWidth / 2} ${beamEntryX},${-beamEntryBody / 2} ${beamEntryX},${beamEntryBody / 2} ${beamStartX},${beamBodyWidth / 2}`}
            fill={`rgba(255,255,255,${0.55 + onsetEnvelope * 0.15})`}
          />

          {/* Layer 3: Bright core */}
          <polygon
            points={`${beamStartX},${-beamCoreWidth / 2} ${beamEntryX},${-beamEntryCore / 2} ${beamEntryX},${beamEntryCore / 2} ${beamStartX},${beamCoreWidth / 2}`}
            fill={`rgba(255,255,255,${0.9 + onsetEnvelope * 0.1})`}
            filter={`url(#${uid}-beamglow)`}
          />

          {/* Entry point glow on prism face */}
          <circle
            cx={beamEntryX}
            cy={beamY}
            r={3.5 + onsetEnvelope * 2}
            fill={`rgba(255,255,255,${0.5 + onsetEnvelope * 0.3})`}
            filter={`url(#${uid}-prismglow)`}
          />

          {/* ═══════════ PRISM BODY ═══════════ */}

          {/* Outer edge stroke (beveled look) */}
          <path
            d={triPath}
            fill="none"
            stroke="url(#prism-rb-bevel)"
            strokeWidth={3}
            strokeLinejoin="round"
            filter={`url(#${uid}-prismglow)`}
          />

          {/* Glass body fill */}
          <path
            d={triPath}
            fill={`url(#${uid}-glass)`}
            stroke={hsl(prismHue + 15, 40, 78, 0.45)}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />

          {/* Bevel inner highlight */}
          <path
            d={bevelPath}
            fill="none"
            stroke="rgba(220,230,255,0.12)"
            strokeWidth={1}
            strokeLinejoin="round"
          />

          {/* Internal rainbow caustic (visible through glass) */}
          <path
            d={causticPath}
            fill={`url(#${uid}-caustic)`}
            stroke="none"
            opacity={0.5 + spectralFlux * 0.4 + onsetEnvelope * 0.1}
          />

          {/* Specular highlight on top face */}
          <line
            x1={triPts[2].x * 0.95}
            y1={triPts[2].y * 0.95 + (triPts[0].y - triPts[2].y) * 0.6}
            x2={triPts[0].x * 0.95}
            y2={triPts[0].y * 0.95 + (triPts[2].y - triPts[0].y) * 0.05}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />

          {/* ═══════════ RAINBOW OUTPUT BANDS (7 bands, 3 layers each) ═══════════ */}

          {RAINBOW_BANDS.map((band, i) => {
            const bandAngle =
              ((i - (RAINBOW_BANDS.length - 1) / 2) / RAINBOW_BANDS.length) * spreadAngle;
            const rad = (bandAngle * Math.PI) / 180;
            const endX = exitX + Math.cos(rad) * beamLength;
            const endY = exitY + Math.sin(rad) * beamLength;
            const bright = Math.min(bandBrightness[i], 1.0);

            return (
              <React.Fragment key={band.name}>
                {/* Layer 1: Outer soft glow */}
                <line
                  x1={exitX}
                  y1={exitY}
                  x2={endX}
                  y2={endY}
                  stroke={band.glow}
                  strokeWidth={bandWidthOuter}
                  opacity={bright * 0.12}
                />

                {/* Layer 2: Main body with full color */}
                <line
                  x1={exitX}
                  y1={exitY}
                  x2={endX}
                  y2={endY}
                  stroke={band.hex}
                  strokeWidth={bandWidthBody}
                  opacity={bright * 0.75}
                  filter={`url(#${uid}-bandglow)`}
                />

                {/* Layer 3: Inner bright edge (lighter tint) */}
                <line
                  x1={exitX}
                  y1={exitY}
                  x2={endX}
                  y2={endY}
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth={bandWidthCore}
                  opacity={bright * 0.6}
                />
              </React.Fragment>
            );
          })}

          {/* ═══════════ REFRACTION POINT GLOW (exit face) ═══════════ */}

          {/* Outer bloom */}
          <circle
            cx={exitX}
            cy={exitY}
            r={refractionGlow}
            fill={`rgba(255,255,255,${refractionAlpha * 0.15})`}
            filter={`url(#${uid}-refbloom)`}
          />

          {/* Inner bright core */}
          <circle
            cx={exitX}
            cy={exitY}
            r={refractionGlow * 0.35}
            fill={`rgba(255,255,255,${refractionAlpha})`}
            filter={`url(#${uid}-prismglow)`}
          />

          {/* Rainbow halo at refraction point */}
          <circle
            cx={exitX}
            cy={exitY}
            r={refractionGlow * 0.6}
            fill="none"
            stroke={`url(#${uid}-caustic)`}
            strokeWidth={1.5}
            opacity={0.4 + onsetEnvelope * 0.3}
          />

          {/* ═══════════ LIGHT SCATTER SPARKLES ═══════════ */}

          {sparkles.map((sp, i) => {
            const clampedAlpha = Math.min(Math.max(sp.alpha, 0), 1);
            if (clampedAlpha < 0.05) return null;
            const bandColor = RAINBOW_BANDS[sp.bandIdx].hex;
            const sparkleSize = 2 + beatDecay * 3;
            return (
              <React.Fragment key={i}>
                {/* Sparkle glow */}
                <circle
                  cx={sp.x}
                  cy={sp.y}
                  r={sparkleSize * 2.5}
                  fill={bandColor}
                  opacity={clampedAlpha * 0.15}
                />
                {/* Sparkle core */}
                <circle
                  cx={sp.x}
                  cy={sp.y}
                  r={sparkleSize}
                  fill="rgba(255,255,255,0.9)"
                  opacity={clampedAlpha}
                  filter={`url(#${uid}-sparkle)`}
                />
              </React.Fragment>
            );
          })}

        </g>
      </svg>
    </div>
  );
};
