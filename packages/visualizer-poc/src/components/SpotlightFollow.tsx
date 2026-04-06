/**
 * SpotlightFollow — Volumetric followspot with dust motes, haze, and secondary accent beam.
 *
 * Primary beam: warm amber cone from stage rigging (top of frame) with feathered edges,
 * visible dust particles drifting inside the cone, and an elliptical light pool on the
 * "floor". Secondary accent beam: narrower, complementary color, lower opacity, different
 * angle. Atmospheric haze bands cross through both beams simulating smoky venue air.
 *
 * Audio: energy gates (>0.05), bass drives beam intensity, beatDecay pulses the pool
 * glow, chromaHue shifts the warm amber tint. Beam width breathes with energy (tight
 * when quiet, wide when loud). Dust motes and pool drift at tempo-scaled speeds.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import type { EnhancedFrameData } from "../data/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

interface DustMote {
  /** Phase offset so each mote moves independently */
  phase: number;
  /** Horizontal drift frequency multiplier */
  freqX: number;
  /** Vertical drift frequency multiplier */
  freqY: number;
  /** Base size in px */
  size: number;
  /** Opacity multiplier 0-1 */
  brightness: number;
  /** Depth factor: 0 = near beam edge, 1 = beam center */
  depth: number;
}

interface HazeBand {
  /** Vertical position as fraction of frame height (0=top, 1=bottom) */
  yFrac: number;
  /** Height as fraction of frame height */
  heightFrac: number;
  /** Horizontal drift speed multiplier */
  driftSpeed: number;
  /** Phase offset for drift */
  phase: number;
  /** Opacity multiplier */
  opacity: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Pre-computed dust motes — deterministic, no RNG needed per frame */
const DUST_MOTES: DustMote[] = [
  { phase: 0.0,  freqX: 0.007, freqY: 0.004, size: 2.5, brightness: 0.9,  depth: 0.8 },
  { phase: 1.3,  freqX: 0.005, freqY: 0.006, size: 1.8, brightness: 0.7,  depth: 0.5 },
  { phase: 2.7,  freqX: 0.009, freqY: 0.003, size: 3.0, brightness: 0.6,  depth: 0.9 },
  { phase: 3.9,  freqX: 0.004, freqY: 0.007, size: 2.0, brightness: 0.8,  depth: 0.3 },
  { phase: 5.2,  freqX: 0.006, freqY: 0.005, size: 2.2, brightness: 0.75, depth: 0.6 },
  { phase: 0.8,  freqX: 0.008, freqY: 0.004, size: 1.5, brightness: 0.65, depth: 0.7 },
  { phase: 4.1,  freqX: 0.003, freqY: 0.008, size: 2.8, brightness: 0.85, depth: 0.4 },
  { phase: 1.9,  freqX: 0.006, freqY: 0.006, size: 1.6, brightness: 0.55, depth: 0.95 },
  { phase: 3.3,  freqX: 0.010, freqY: 0.003, size: 2.4, brightness: 0.7,  depth: 0.2 },
  { phase: 5.8,  freqX: 0.005, freqY: 0.009, size: 1.9, brightness: 0.8,  depth: 0.65 },
];

/** Pre-computed haze bands */
const HAZE_BANDS: HazeBand[] = [
  { yFrac: 0.18, heightFrac: 0.10, driftSpeed: 0.0012, phase: 0.0,  opacity: 0.35 },
  { yFrac: 0.36, heightFrac: 0.12, driftSpeed: 0.0008, phase: 2.1,  opacity: 0.28 },
  { yFrac: 0.55, heightFrac: 0.14, driftSpeed: 0.0015, phase: 4.5,  opacity: 0.22 },
  { yFrac: 0.72, heightFrac: 0.08, driftSpeed: 0.0010, phase: 1.3,  opacity: 0.18 },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Clamp value between min and max */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Build a cone polygon from origin to target with given widths */
function conePoints(
  ox: number, oy: number, tx: number, ty: number,
  sourceHalfW: number, targetHalfW: number,
): string {
  const dx = tx - ox;
  const dy = ty - oy;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular unit vector
  const nx = -dy / dist;
  const ny = dx / dist;
  return [
    `${ox + nx * sourceHalfW},${oy + ny * sourceHalfW}`,
    `${ox - nx * sourceHalfW},${oy - ny * sourceHalfW}`,
    `${tx - nx * targetHalfW},${ty - ny * targetHalfW}`,
    `${tx + nx * targetHalfW},${ty + ny * targetHalfW}`,
  ].join(" ");
}

/** Test if a point is roughly inside a beam cone (used for mote visibility) */
function pointInCone(
  px: number, py: number,
  ox: number, oy: number, tx: number, ty: number,
  targetRadius: number,
): number {
  const dx = tx - ox;
  const dy = ty - oy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Project point onto beam axis
  const t = clamp(((px - ox) * dx + (py - oy) * dy) / (len * len), 0, 1);
  // Distance from axis at projected point
  const projX = ox + dx * t;
  const projY = oy + dy * t;
  const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  // Cone radius at this t
  const radius = 4 + targetRadius * t;
  return clamp(1 - dist / radius, 0, 1);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const SpotlightFollow: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, bass, chromaHue, beatDecay } = snap;

  // ── Energy gate ──
  if (energy <= 0.05) return null;

  const drift = tempoFactor;

  // ── Warm amber hue that shifts with chromaHue ──
  // Base: warm amber ~42. chromaHue blends in gently (max +/- 15 degrees)
  const baseHue = 42 + Math.sin(chromaHue * Math.PI / 180) * 15;
  const complementHue = (baseHue + 180) % 360;

  // ── Flicker (subtle filament / atmospheric shimmer) ──
  const flicker =
    0.88
    + Math.sin(frame * 0.11 + 0.7) * 0.06
    + Math.sin(frame * 0.23 + 2.3) * 0.04
    + Math.sin(frame * 0.37 + 5.1) * 0.02;

  // ── Bass-driven beam intensity ──
  const bassIntensity = interpolate(bass, [0, 0.4], [0.6, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Energy-driven beam width: tight when quiet, wide when loud ──
  const beamRadiusPrimary = interpolate(energy, [0.05, 0.5], [45, 140], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const beamRadiusSecondary = beamRadiusPrimary * 0.55;

  // ── beatDecay pool glow pulse ──
  const poolPulse = 1.0 + beatDecay * 0.35;

  /* ================================================================ */
  /*  PRIMARY BEAM — warm amber, from rigging to wandering pool       */
  /* ================================================================ */

  // Origin: stage rigging, top of frame, drifts slightly
  const primaryOriginX = width * 0.38 + Math.sin(frame * 0.0015) * width * 0.04;
  const primaryOriginY = -10;

  // Target: slow wandering pool, tempo-scaled
  const primaryTargetX =
    width * 0.35
    + Math.sin(frame * 0.006 * drift + 1.2) * width * 0.18
    + Math.sin(frame * 0.011 * drift + 3.7) * width * 0.08;
  const primaryTargetY =
    height * 0.62
    + Math.sin(frame * 0.005 * drift + 0.5) * height * 0.10
    + Math.sin(frame * 0.009 * drift + 2.1) * height * 0.05;

  /* ================================================================ */
  /*  SECONDARY BEAM — complementary color, narrower, different angle */
  /* ================================================================ */

  const secondaryOriginX = width * 0.72 + Math.sin(frame * 0.0018 + 1.5) * width * 0.03;
  const secondaryOriginY = -10;

  const secondaryTargetX =
    width * 0.58
    + Math.sin(frame * 0.005 * drift + 4.0) * width * 0.14
    + Math.sin(frame * 0.009 * drift + 1.1) * width * 0.06;
  const secondaryTargetY =
    height * 0.58
    + Math.sin(frame * 0.004 * drift + 2.8) * height * 0.08
    + Math.sin(frame * 0.008 * drift + 5.3) * height * 0.04;

  /* ================================================================ */
  /*  DUST MOTES — small bright dots drifting inside the primary cone */
  /* ================================================================ */

  const moteElements: React.ReactNode[] = [];

  for (let i = 0; i < DUST_MOTES.length; i++) {
    const m = DUST_MOTES[i];
    const t = frame * drift;

    // Mote wanders in a lissajous-like pattern within the beam area
    // Interpolate between origin and target based on depth
    const beamT = 0.2 + m.depth * 0.7; // stay within the visible cone body
    const centerX = primaryOriginX + (primaryTargetX - primaryOriginX) * beamT;
    const centerY = primaryOriginY + (primaryTargetY - primaryOriginY) * beamT;

    // Wander radius grows with distance from origin (wider part of cone)
    const wanderRadius = beamRadiusPrimary * beamT * 0.6;

    const mx = centerX + Math.sin(t * m.freqX + m.phase) * wanderRadius;
    const my = centerY + Math.sin(t * m.freqY + m.phase * 1.7) * wanderRadius * 0.5;

    // Check visibility inside cone
    const insideness = pointInCone(
      mx, my,
      primaryOriginX, primaryOriginY,
      primaryTargetX, primaryTargetY,
      beamRadiusPrimary,
    );

    if (insideness < 0.05) continue;

    const moteOpacity = m.brightness * insideness * bassIntensity * energy * flicker;
    if (moteOpacity < 0.02) continue;

    const moteSize = m.size + energy * 1.5;

    moteElements.push(
      <circle
        key={`mote-${i}`}
        cx={mx}
        cy={my}
        r={moteSize}
        fill={`hsla(${baseHue + 5}, 70%, 92%, ${clamp(moteOpacity, 0, 0.85)})`}
        style={{ filter: `blur(${0.8 + (1 - m.depth) * 1.2}px)` }}
      />,
    );
  }

  /* ================================================================ */
  /*  HAZE BANDS — horizontal smoke layers crossing through the beams */
  /* ================================================================ */

  const hazeElements: React.ReactNode[] = [];

  for (let i = 0; i < HAZE_BANDS.length; i++) {
    const h = HAZE_BANDS[i];
    const bandY = h.yFrac * height;
    const bandH = h.heightFrac * height;

    // Horizontal drift
    const driftX = Math.sin(frame * h.driftSpeed * drift + h.phase) * width * 0.12;

    // Opacity modulated by energy and bass
    const hazeOp = h.opacity * energy * bassIntensity * flicker;
    if (hazeOp < 0.01) continue;

    // Width wider than frame for seamless drift
    const bandW = width * 1.6;
    const bandX = -width * 0.3 + driftX;

    hazeElements.push(
      <ellipse
        key={`haze-${i}`}
        cx={bandX + bandW / 2}
        cy={bandY + bandH / 2}
        rx={bandW / 2}
        ry={bandH / 2}
        fill={`hsla(${baseHue + 10}, 20%, 75%, ${clamp(hazeOp, 0, 0.35)})`}
        style={{ mixBlendMode: "screen", filter: `blur(${25 + i * 8}px)` }}
      />,
    );
  }

  /* ================================================================ */
  /*  SVG gradient IDs (unique per frame isn't needed — static IDs)   */
  /* ================================================================ */

  const primaryBeamColor = `hsla(${baseHue}, 75%, 82%, ${0.30 * bassIntensity * flicker})`;
  const primaryBeamEdge = `hsla(${baseHue}, 65%, 75%, ${0.06 * bassIntensity})`;
  const primaryPoolCenter = `hsla(${baseHue}, 80%, 92%, ${clamp(0.40 * poolPulse * bassIntensity, 0, 0.6)})`;
  const primaryPoolMid = `hsla(${baseHue}, 72%, 82%, ${clamp(0.18 * poolPulse * bassIntensity, 0, 0.35)})`;
  const primaryPoolEdge = `hsla(${baseHue}, 65%, 75%, 0)`;

  const secondaryBeamColor = `hsla(${complementHue}, 55%, 72%, ${0.14 * bassIntensity * flicker})`;
  const secondaryBeamEdge = `hsla(${complementHue}, 45%, 65%, ${0.03 * bassIntensity})`;
  const secondaryPoolCenter = `hsla(${complementHue}, 60%, 85%, ${clamp(0.18 * poolPulse * bassIntensity, 0, 0.3)})`;
  const secondaryPoolMid = `hsla(${complementHue}, 50%, 75%, ${clamp(0.08 * poolPulse * bassIntensity, 0, 0.18)})`;
  const secondaryPoolEdge = `hsla(${complementHue}, 45%, 70%, 0)`;

  // Source glow colors
  const primarySourceGlow = `hsla(${baseHue}, 80%, 92%, ${clamp(0.6 * bassIntensity * flicker, 0, 0.85)})`;
  const secondarySourceGlow = `hsla(${complementHue}, 60%, 85%, ${clamp(0.3 * bassIntensity * flicker, 0, 0.5)})`;

  // Hot center of pool
  const primaryHotspot = `hsla(${baseHue}, 90%, 97%, ${clamp(0.22 * poolPulse * energy, 0, 0.35)})`;
  const secondaryHotspot = `hsla(${complementHue}, 70%, 92%, ${clamp(0.10 * poolPulse * energy, 0, 0.18)})`;

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: flicker }}>
        <defs>
          {/* Primary beam gradient (along beam axis) */}
          <linearGradient id="sf-pbeam" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={primaryBeamColor} />
            <stop offset="70%" stopColor={primaryBeamEdge} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>

          {/* Secondary beam gradient */}
          <linearGradient id="sf-sbeam" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={secondaryBeamColor} />
            <stop offset="70%" stopColor={secondaryBeamEdge} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>

          {/* Primary pool radial gradient */}
          <radialGradient id="sf-ppool" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={primaryPoolCenter} />
            <stop offset="40%" stopColor={primaryPoolMid} />
            <stop offset="100%" stopColor={primaryPoolEdge} />
          </radialGradient>

          {/* Secondary pool radial gradient */}
          <radialGradient id="sf-spool" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={secondaryPoolCenter} />
            <stop offset="40%" stopColor={secondaryPoolMid} />
            <stop offset="100%" stopColor={secondaryPoolEdge} />
          </radialGradient>

          {/* Feathered edge filter for beam cones */}
          <filter id="sf-beam-soft" x="-20%" y="-10%" width="140%" height="120%">
            <feGaussianBlur stdDeviation="12" />
          </filter>

          {/* Softer filter for pools */}
          <filter id="sf-pool-soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="18" />
          </filter>

          {/* Extra-soft for hotspots */}
          <filter id="sf-hotspot" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>

          {/* Source glow filter */}
          <filter id="sf-source" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* ── HAZE BANDS (behind beams) ── */}
        {hazeElements}

        {/* ── SECONDARY BEAM CONE ── */}
        <polygon
          points={conePoints(
            secondaryOriginX, secondaryOriginY,
            secondaryTargetX, secondaryTargetY,
            3, beamRadiusSecondary,
          )}
          fill={secondaryBeamColor}
          filter="url(#sf-beam-soft)"
          style={{ mixBlendMode: "screen" }}
        />

        {/* Secondary beam inner core (brighter, narrower) */}
        <polygon
          points={conePoints(
            secondaryOriginX, secondaryOriginY,
            secondaryTargetX, secondaryTargetY,
            2, beamRadiusSecondary * 0.4,
          )}
          fill={`hsla(${complementHue}, 60%, 80%, ${clamp(0.08 * bassIntensity * flicker, 0, 0.15)})`}
          filter="url(#sf-beam-soft)"
          style={{ mixBlendMode: "screen" }}
        />

        {/* ── PRIMARY BEAM CONE (outer soft edge) ── */}
        <polygon
          points={conePoints(
            primaryOriginX, primaryOriginY,
            primaryTargetX, primaryTargetY,
            5, beamRadiusPrimary,
          )}
          fill={primaryBeamColor}
          filter="url(#sf-beam-soft)"
          style={{ mixBlendMode: "screen" }}
        />

        {/* Primary beam inner core (brighter, narrower) */}
        <polygon
          points={conePoints(
            primaryOriginX, primaryOriginY,
            primaryTargetX, primaryTargetY,
            3, beamRadiusPrimary * 0.35,
          )}
          fill={`hsla(${baseHue}, 82%, 88%, ${clamp(0.18 * bassIntensity * flicker, 0, 0.3)})`}
          filter="url(#sf-beam-soft)"
          style={{ mixBlendMode: "screen" }}
        />

        {/* ── SECONDARY POOL OF LIGHT ── */}
        <ellipse
          cx={secondaryTargetX}
          cy={secondaryTargetY}
          rx={beamRadiusSecondary * 1.4 * poolPulse}
          ry={beamRadiusSecondary * 0.7 * poolPulse}
          fill="url(#sf-spool)"
          filter="url(#sf-pool-soft)"
          style={{ mixBlendMode: "screen" }}
        />

        {/* Secondary pool hotspot */}
        <circle
          cx={secondaryTargetX}
          cy={secondaryTargetY}
          r={beamRadiusSecondary * 0.25 * poolPulse}
          fill={secondaryHotspot}
          filter="url(#sf-hotspot)"
          style={{ mixBlendMode: "screen" }}
        />

        {/* ── PRIMARY POOL OF LIGHT ── */}
        <ellipse
          cx={primaryTargetX}
          cy={primaryTargetY}
          rx={beamRadiusPrimary * 1.4 * poolPulse}
          ry={beamRadiusPrimary * 0.75 * poolPulse}
          fill="url(#sf-ppool)"
          filter="url(#sf-pool-soft)"
          style={{ mixBlendMode: "screen" }}
        />

        {/* Primary pool hotspot */}
        <circle
          cx={primaryTargetX}
          cy={primaryTargetY}
          r={beamRadiusPrimary * 0.22 * poolPulse}
          fill={primaryHotspot}
          filter="url(#sf-hotspot)"
          style={{ mixBlendMode: "screen" }}
        />

        {/* ── DUST MOTES (inside primary beam) ── */}
        {moteElements}

        {/* ── SOURCE GLOWS (rigging fixtures) ── */}
        {/* Primary source: warm bright point */}
        <circle
          cx={primaryOriginX}
          cy={primaryOriginY + 12}
          r={10 + energy * 6}
          fill={primarySourceGlow}
          filter="url(#sf-source)"
        />
        {/* Primary source halo */}
        <circle
          cx={primaryOriginX}
          cy={primaryOriginY + 12}
          r={18 + energy * 10}
          fill={`hsla(${baseHue}, 70%, 88%, ${clamp(0.15 * bassIntensity, 0, 0.25)})`}
          filter="url(#sf-pool-soft)"
          style={{ mixBlendMode: "screen" }}
        />

        {/* Secondary source: cooler, dimmer */}
        <circle
          cx={secondaryOriginX}
          cy={secondaryOriginY + 12}
          r={7 + energy * 4}
          fill={secondarySourceGlow}
          filter="url(#sf-source)"
        />
        {/* Secondary source halo */}
        <circle
          cx={secondaryOriginX}
          cy={secondaryOriginY + 12}
          r={14 + energy * 7}
          fill={`hsla(${complementHue}, 50%, 80%, ${clamp(0.08 * bassIntensity, 0, 0.15)})`}
          filter="url(#sf-pool-soft)"
          style={{ mixBlendMode: "screen" }}
        />
      </svg>
    </div>
  );
};
