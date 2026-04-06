/**
 * BobWeir — Bobby Weir rhythm guitarist silhouette, A+++ quality.
 *
 * Detailed figure: cowboy hat silhouette, shoulders/torso with vest suggestion,
 * arms in strumming pose (right hand near soundhole, left on fretboard),
 * iconic wide-legged stance. ES-335 semi-hollow guitar with f-holes, neck,
 * headstock, fret suggestions, and 6 vibrating strings.
 *
 * Volumetric spotlight cone from above with dust motes, pool of light at feet,
 * warm amber color palette, rim lighting on figure edges, stage floor reflection.
 *
 * Audio: energy drives strumming intensity, beatDecay for spotlight pulse,
 * chromaHue for glow tint, musicalTime for strum timing, bass for body sway.
 * Continuous rendering — rotation engine controls visibility externally.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Color utility                                                      */
/* ------------------------------------------------------------------ */

function hslToRgba(h: number, s: number, l: number, a: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return `rgba(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)},${a})`;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STRING_COUNT = 6;
const STRING_SPACING = 3.8;

interface Props {
  frames: EnhancedFrameData[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const BobWeir: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const {
    energy,
    mids,
    bass,
    highs,
    beatDecay,
    chromaHue: chromaHueDeg,
    onsetEnvelope,
    musicalTime,
    otherEnergy,
    slowEnergy,
    drumBeat,
    fastEnergy,
  } = snap;

  /* -- Energy gating: Bobby appears at moderate energy -- */
  const energyGate = interpolate(energy, [0.06, 0.14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const otherBoost = interpolate(otherEnergy ?? 0, [0.05, 0.3], [0, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = energyGate * (0.55 + otherBoost);
  if (opacity < 0.01) return null;

  /* -- Warm amber base hue shifted by chromaHue -- */
  const baseHue = 35; // warm amber
  const hueShift = (chromaHueDeg / 360) * 30 - 15; // +/-15 degree shift from chroma
  const hue = baseHue + hueShift;

  /* -- Figure position: right-center stage -- */
  const figureX = width * 0.64;
  const figureBaseY = height * 0.48;
  const scale = Math.min(width, height) / 1080; // normalize to 1080 baseline

  /* -- Sway: Bobby's rhythmic body movement, bass-driven -- */
  const swayAmount = interpolate(bass, [0.05, 0.35], [2, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sway =
    Math.sin(musicalTime * Math.PI * 2 * 0.5) * swayAmount +
    Math.sin(musicalTime * Math.PI * 2 * 0.25) * swayAmount * 0.4;

  /* -- Breathing / pulse -- */
  const breathe =
    1.0 +
    Math.sin(frame * 0.04) * 0.008 +
    beatDecay * 0.015;

  /* -- Strumming: energy-driven right arm motion, synced to musicalTime -- */
  const strumIntensity = interpolate(energy, [0.05, 0.4], [3, 18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const strumAngle =
    Math.sin(musicalTime * Math.PI * 2) * strumIntensity +
    Math.sin(musicalTime * Math.PI * 4) * strumIntensity * 0.35 +
    onsetEnvelope * 8;

  /* -- Spotlight parameters -- */
  const spotlightIntensity = interpolate(energy, [0.05, 0.35], [0.25, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const spotlightPulse = spotlightIntensity + beatDecay * 0.12;
  const spotlightRadius = interpolate(energy, [0.05, 0.4], [80, 160], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* -- Flicker -- */
  const flicker =
    0.92 +
    Math.sin(frame * 0.11 + 1.7) * 0.04 +
    Math.sin(frame * 0.29 + 3.1) * 0.025;

  /* -- Rim light intensity -- */
  const rimIntensity = interpolate(energy, [0.1, 0.35], [0.12, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) + beatDecay * 0.15;

  /* -- Figure dimensions (in local SVG coords, viewBox 0 0 300 500) -- */
  const headR = 16;
  const hatBrimW = 38;
  const hatCrownH = 22;
  const shoulderW = 56;
  const torsoH = 70;
  const hipW = 44;
  const legH = 80;
  const stanceW = 50; // Bobby's iconic wide stance

  // Guitar body (ES-335 semi-hollow)
  const guitarBodyW = 48;
  const guitarBodyH = 34;
  const guitarBodyCx = 10;
  const guitarBodyCy = 15;

  /* -- Colors -- */
  const ambientColor = hslToRgba(hue, 0.7, 0.6, spotlightPulse * flicker);
  const ambientColorDim = hslToRgba(hue, 0.6, 0.45, spotlightPulse * flicker * 0.5);
  const silhouetteColor = hslToRgba(hue, 0.3, 0.06, 0.92);
  const silhouetteDark = hslToRgba(hue, 0.25, 0.04, 0.95);
  const rimColor = hslToRgba(hue, 0.75, 0.65, rimIntensity);
  const rimColorSoft = hslToRgba(hue, 0.7, 0.6, rimIntensity * 0.6);
  const guitarColor = hslToRgba(hue + 5, 0.35, 0.08, 0.93);
  const guitarRim = hslToRgba(hue, 0.7, 0.6, rimIntensity * 0.7);
  const stringColor = hslToRgba(hue + 10, 0.5, 0.7, 0.5 + energy * 0.3);
  const fholeColor = hslToRgba(hue, 0.4, 0.03, 0.9);
  const spotCoreColor = hslToRgba(hue, 0.5, 0.85, spotlightPulse * 0.45);
  const spotMidColor = hslToRgba(hue, 0.55, 0.65, spotlightPulse * 0.2);
  const spotEdgeColor = hslToRgba(hue, 0.5, 0.5, 0);
  const dustColor = hslToRgba(hue, 0.4, 0.75, 0.15 + beatDecay * 0.1);
  const groundColor = hslToRgba(hue, 0.5, 0.55, spotlightPulse * 0.15);
  const reflectionColor = hslToRgba(hue, 0.3, 0.08, spotlightPulse * 0.12);
  const vestEdge = hslToRgba(hue - 10, 0.4, 0.12, 0.3);

  /* -- Dust mote positions (deterministic from frame) -- */
  const dustMotes: Array<{ x: number; y: number; r: number; opacity: number }> = [];
  for (let i = 0; i < 18; i++) {
    const seed = i * 137.508; // golden angle
    const phase = seed + frame * (0.008 + i * 0.002);
    const driftX = Math.sin(phase) * (25 + i * 3);
    const driftY = Math.cos(phase * 0.7 + i) * 120 - 60 + i * 12;
    const moteR = 0.6 + Math.sin(seed * 3.7) * 0.4;
    const moteOpacity =
      (0.12 + Math.sin(phase * 1.3) * 0.08) *
      interpolate(
        Math.abs(driftX),
        [0, spotlightRadius * 0.4],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
    dustMotes.push({ x: driftX, y: driftY, r: moteR, opacity: moteOpacity });
  }

  /* -- String vibration paths -- */
  const vibAmp = interpolate(energy, [0.03, 0.4], [0.2, 2.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const stringPaths: string[] = [];
  // Strings run across the guitar body, roughly from bridge to where neck meets body
  const stringStartX = guitarBodyCx - guitarBodyW * 0.35;
  const stringEndX = guitarBodyCx + guitarBodyW * 0.5;
  const stringCenterY = guitarBodyCy;
  for (let si = 0; si < STRING_COUNT; si++) {
    const y = stringCenterY - (STRING_COUNT / 2 - si) * STRING_SPACING + STRING_SPACING * 0.5;
    const freq = 3.0 + si * 0.8;
    const amp = vibAmp * (0.5 + si * 0.15);
    const pts: string[] = [];
    for (let x = stringStartX; x <= stringEndX; x += 1.5) {
      const t = (x - stringStartX) / (stringEndX - stringStartX);
      const env = Math.sin(t * Math.PI);
      const dy =
        Math.sin(musicalTime * Math.PI * 2 * freq * tempoFactor + x * 0.12 + si * 1.5) *
        amp *
        env;
      pts.push(`${x.toFixed(1)},${(y + dy).toFixed(2)}`);
    }
    stringPaths.push(pts.join(" "));
  }

  /* -- Head tilt driven by slow energy -- */
  const headTilt = interpolate(slowEnergy, [0.08, 0.3], [-2, 3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) + Math.sin(frame * 0.025) * 1.5;

  /* -- Unique SVG gradient IDs -- */
  const spotGradId = `bob-spot-${frame % 1000}`;
  const coneGradId = `bob-cone-${frame % 1000}`;
  const reflGradId = `bob-refl-${frame % 1000}`;
  const bodyGradId = `bob-body-${frame % 1000}`;

  /* ================================================================ */
  /*  SVG figure center: 150, 250 in a 300x500 viewBox                */
  /* ================================================================ */
  const cx = 150;
  const neckY = -torsoH / 2 - headR - 6; // base of head/top of neck
  const headCy = neckY - headR + 2;
  const hipY = torsoH / 2;
  const feetY = hipY + legH;

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
        style={{
          opacity: opacity * flicker,
          mixBlendMode: "screen",
        }}
      >
        <defs>
          {/* Spotlight radial gradient */}
          <radialGradient id={spotGradId} cx="50%" cy="30%" r="50%">
            <stop offset="0%" stopColor={spotCoreColor} />
            <stop offset="40%" stopColor={spotMidColor} />
            <stop offset="100%" stopColor={spotEdgeColor} />
          </radialGradient>

          {/* Volumetric cone gradient (top-down) */}
          <linearGradient id={coneGradId} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop
              offset="0%"
              stopColor={hslToRgba(hue, 0.5, 0.85, spotlightPulse * 0.35)}
            />
            <stop
              offset="30%"
              stopColor={hslToRgba(hue, 0.5, 0.7, spotlightPulse * 0.15)}
            />
            <stop
              offset="100%"
              stopColor={hslToRgba(hue, 0.5, 0.5, 0)}
            />
          </linearGradient>

          {/* Stage reflection gradient */}
          <linearGradient id={reflGradId} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={reflectionColor} />
            <stop
              offset="100%"
              stopColor={hslToRgba(hue, 0.2, 0.05, 0)}
            />
          </linearGradient>

          {/* Guitar body gradient */}
          <radialGradient id={bodyGradId} cx="45%" cy="40%" r="55%">
            <stop
              offset="0%"
              stopColor={hslToRgba(hue + 5, 0.35, 0.1, 0.95)}
            />
            <stop
              offset="100%"
              stopColor={hslToRgba(hue + 5, 0.3, 0.04, 0.95)}
            />
          </radialGradient>
        </defs>

        {/* ============================================================ */}
        {/*  VOLUMETRIC SPOTLIGHT CONE from above                         */}
        {/* ============================================================ */}
        <g transform={`translate(${figureX + sway}, ${figureBaseY})`}>
          {/* Wide cone trapezoid */}
          <polygon
            points={`${-12 * scale},${-240 * scale} ${12 * scale},${-240 * scale} ${spotlightRadius * scale * 0.9},${(feetY + 30) * scale * breathe} ${-spotlightRadius * scale * 0.9},${(feetY + 30) * scale * breathe}`}
            fill={`url(#${coneGradId})`}
            style={{ filter: `blur(${12 * scale}px)` }}
          />

          {/* Cone core — brighter narrow beam */}
          <polygon
            points={`${-6 * scale},${-240 * scale} ${6 * scale},${-240 * scale} ${spotlightRadius * 0.35 * scale},${(feetY + 10) * scale * breathe} ${-spotlightRadius * 0.35 * scale},${(feetY + 10) * scale * breathe}`}
            fill={hslToRgba(hue, 0.45, 0.8, spotlightPulse * 0.12)}
            style={{ filter: `blur(${8 * scale}px)` }}
          />
        </g>

        {/* ============================================================ */}
        {/*  SPOTLIGHT GLOW — ambient wash behind figure                   */}
        {/* ============================================================ */}
        <ellipse
          cx={figureX + sway}
          cy={figureBaseY - 20 * scale}
          rx={spotlightRadius * 1.2 * scale}
          ry={spotlightRadius * 1.8 * scale}
          fill={`url(#${spotGradId})`}
          style={{ filter: `blur(${20 * scale}px)` }}
        />

        {/* ============================================================ */}
        {/*  GROUND POOL OF LIGHT                                          */}
        {/* ============================================================ */}
        <ellipse
          cx={figureX + sway}
          cy={figureBaseY + (feetY + 15) * scale * breathe}
          rx={spotlightRadius * 0.9 * scale}
          ry={spotlightRadius * 0.18 * scale}
          fill={groundColor}
          style={{ filter: `blur(${10 * scale}px)` }}
        />

        {/* Secondary ground warmth */}
        <ellipse
          cx={figureX + sway}
          cy={figureBaseY + (feetY + 10) * scale * breathe}
          rx={spotlightRadius * 0.5 * scale}
          ry={spotlightRadius * 0.08 * scale}
          fill={hslToRgba(hue, 0.6, 0.65, spotlightPulse * 0.1)}
          style={{ filter: `blur(${6 * scale}px)` }}
        />

        {/* ============================================================ */}
        {/*  DUST MOTES in spotlight beam                                   */}
        {/* ============================================================ */}
        <g transform={`translate(${figureX + sway}, ${figureBaseY})`}>
          {dustMotes.map((m, i) => (
            <circle
              key={`dust-${i}`}
              cx={m.x * scale}
              cy={m.y * scale}
              r={m.r * scale}
              fill={dustColor}
              opacity={m.opacity}
            />
          ))}
        </g>

        {/* ============================================================ */}
        {/*  STAGE FLOOR REFLECTION (inverted, faded)                      */}
        {/* ============================================================ */}
        <g
          transform={`translate(${figureX + sway}, ${figureBaseY + (feetY + 20) * scale * breathe}) scale(${breathe * scale}, ${-0.25 * scale})`}
          opacity={spotlightPulse * 0.15}
          style={{ filter: `blur(${3 * scale}px)` }}
        >
          {/* Simplified reflection silhouette */}
          <path
            d={`M 0,${headCy} L ${-shoulderW / 2},${-torsoH / 2 + 5} L ${-shoulderW / 2},${torsoH * 0.3} L ${-stanceW / 2},${feetY} L ${stanceW / 2},${feetY} L ${shoulderW / 2},${torsoH * 0.3} L ${shoulderW / 2},${-torsoH / 2 + 5} Z`}
            fill={reflectionColor}
          />
        </g>

        {/* ============================================================ */}
        {/*  FIGURE SILHOUETTE GROUP                                       */}
        {/* ============================================================ */}
        <g
          transform={`translate(${figureX + sway}, ${figureBaseY}) scale(${breathe * scale})`}
        >
          {/* ---------------------------------------------------------- */}
          {/*  LEGS — Bobby's iconic wide stance                          */}
          {/* ---------------------------------------------------------- */}

          {/* Left leg */}
          <path
            d={`M ${-hipW * 0.22},${hipY}
                C ${-hipW * 0.25},${hipY + legH * 0.3} ${-stanceW * 0.85},${hipY + legH * 0.5} ${-stanceW * 0.9},${feetY}
                L ${-stanceW * 0.9 + 12},${feetY}
                L ${-stanceW * 0.75},${feetY - 3}
                C ${-stanceW * 0.55},${hipY + legH * 0.45} ${-hipW * 0.1},${hipY + legH * 0.2} ${-2},${hipY}`}
            fill={silhouetteColor}
          />
          {/* Left boot */}
          <path
            d={`M ${-stanceW * 0.9},${feetY}
                L ${-stanceW * 0.9 - 6},${feetY + 4}
                L ${-stanceW * 0.9 + 14},${feetY + 4}
                L ${-stanceW * 0.9 + 12},${feetY} Z`}
            fill={silhouetteDark}
          />

          {/* Right leg */}
          <path
            d={`M ${2},${hipY}
                C ${hipW * 0.1},${hipY + legH * 0.2} ${stanceW * 0.55},${hipY + legH * 0.45} ${stanceW * 0.75},${feetY - 3}
                L ${stanceW * 0.9 - 12},${feetY}
                L ${stanceW * 0.9},${feetY}
                C ${stanceW * 0.85},${hipY + legH * 0.5} ${hipW * 0.25},${hipY + legH * 0.3} ${hipW * 0.22},${hipY}`}
            fill={silhouetteColor}
          />
          {/* Right boot */}
          <path
            d={`M ${stanceW * 0.9 - 12},${feetY}
                L ${stanceW * 0.9 - 14},${feetY + 4}
                L ${stanceW * 0.9 + 6},${feetY + 4}
                L ${stanceW * 0.9},${feetY} Z`}
            fill={silhouetteDark}
          />

          {/* Leg rim light — left inner edge */}
          <path
            d={`M ${-hipW * 0.1},${hipY + legH * 0.15}
                C ${-stanceW * 0.4},${hipY + legH * 0.45} ${-stanceW * 0.7},${feetY - 15} ${-stanceW * 0.78},${feetY - 3}`}
            fill="none"
            stroke={rimColorSoft}
            strokeWidth={1}
          />
          {/* Leg rim light — right inner edge */}
          <path
            d={`M ${hipW * 0.1},${hipY + legH * 0.15}
                C ${stanceW * 0.4},${hipY + legH * 0.45} ${stanceW * 0.7},${feetY - 15} ${stanceW * 0.78},${feetY - 3}`}
            fill="none"
            stroke={rimColorSoft}
            strokeWidth={1}
          />

          {/* ---------------------------------------------------------- */}
          {/*  TORSO with vest suggestion                                  */}
          {/* ---------------------------------------------------------- */}
          <path
            d={`M ${-shoulderW / 2},${-torsoH / 2 + 8}
                Q ${-shoulderW / 2 - 4},${-torsoH / 2 + 2} ${-shoulderW / 2 + 6},${-torsoH / 2}
                L ${shoulderW / 2 - 6},${-torsoH / 2}
                Q ${shoulderW / 2 + 4},${-torsoH / 2 + 2} ${shoulderW / 2},${-torsoH / 2 + 8}
                L ${hipW / 2},${hipY}
                L ${-hipW / 2},${hipY} Z`}
            fill={silhouetteColor}
          />

          {/* Vest suggestion — open front V, slightly lighter edges */}
          <path
            d={`M ${-6},${-torsoH / 2 + 2}
                L ${-shoulderW * 0.12},${hipY - 5}
                L ${-shoulderW * 0.08},${hipY - 5}
                L ${-2},${-torsoH / 2 + 4} Z`}
            fill={vestEdge}
          />
          <path
            d={`M ${6},${-torsoH / 2 + 2}
                L ${shoulderW * 0.12},${hipY - 5}
                L ${shoulderW * 0.08},${hipY - 5}
                L ${2},${-torsoH / 2 + 4} Z`}
            fill={vestEdge}
          />

          {/* Vest side seam hints */}
          <line
            x1={-shoulderW * 0.35}
            y1={-torsoH / 2 + 12}
            x2={-hipW * 0.4}
            y2={hipY - 2}
            stroke={vestEdge}
            strokeWidth={0.6}
          />
          <line
            x1={shoulderW * 0.35}
            y1={-torsoH / 2 + 12}
            x2={hipW * 0.4}
            y2={hipY - 2}
            stroke={vestEdge}
            strokeWidth={0.6}
          />

          {/* Torso rim light — left edge (spotlight backlight) */}
          <path
            d={`M ${-shoulderW / 2},${-torsoH / 2 + 8}
                L ${-hipW / 2},${hipY}`}
            fill="none"
            stroke={rimColor}
            strokeWidth={1.2}
          />
          {/* Torso rim light — right edge */}
          <path
            d={`M ${shoulderW / 2},${-torsoH / 2 + 8}
                L ${hipW / 2},${hipY}`}
            fill="none"
            stroke={rimColor}
            strokeWidth={1.2}
          />

          {/* ---------------------------------------------------------- */}
          {/*  NECK (body part)                                            */}
          {/* ---------------------------------------------------------- */}
          <rect
            x={-5}
            y={-torsoH / 2 - 8}
            width={10}
            height={12}
            rx={3}
            fill={silhouetteColor}
          />

          {/* ---------------------------------------------------------- */}
          {/*  HEAD with cowboy hat                                         */}
          {/* ---------------------------------------------------------- */}
          <g transform={`rotate(${headTilt}, 0, ${headCy})`}>
            {/* Head */}
            <ellipse
              cx={0}
              cy={headCy}
              rx={headR}
              ry={headR * 1.05}
              fill={silhouetteColor}
            />

            {/* Hair suggestion — slightly wider around sides/back */}
            <ellipse
              cx={0}
              cy={headCy + 2}
              rx={headR * 1.08}
              ry={headR * 0.9}
              fill={silhouetteDark}
            />

            {/* Cowboy hat — brim */}
            <ellipse
              cx={0}
              cy={headCy - headR * 0.7}
              rx={hatBrimW}
              ry={7}
              fill={silhouetteDark}
            />

            {/* Cowboy hat — crown */}
            <path
              d={`M ${-headR * 0.85},${headCy - headR * 0.7}
                  Q ${-headR * 0.9},${headCy - headR * 0.7 - hatCrownH * 0.8} ${-headR * 0.3},${headCy - headR * 0.7 - hatCrownH}
                  Q ${0},${headCy - headR * 0.7 - hatCrownH - 3} ${headR * 0.3},${headCy - headR * 0.7 - hatCrownH}
                  Q ${headR * 0.9},${headCy - headR * 0.7 - hatCrownH * 0.8} ${headR * 0.85},${headCy - headR * 0.7}
                  Z`}
              fill={silhouetteDark}
            />

            {/* Hat band */}
            <line
              x1={-headR * 0.82}
              y1={headCy - headR * 0.7 - 2}
              x2={headR * 0.82}
              y2={headCy - headR * 0.7 - 2}
              stroke={hslToRgba(hue, 0.5, 0.2, 0.4)}
              strokeWidth={1.5}
            />

            {/* Hat rim light — top edge of crown catches spotlight */}
            <path
              d={`M ${-headR * 0.25},${headCy - headR * 0.7 - hatCrownH}
                  Q ${0},${headCy - headR * 0.7 - hatCrownH - 2.5} ${headR * 0.25},${headCy - headR * 0.7 - hatCrownH}`}
              fill="none"
              stroke={rimColor}
              strokeWidth={1.3}
            />

            {/* Hat brim rim light — front edge */}
            <ellipse
              cx={0}
              cy={headCy - headR * 0.7}
              rx={hatBrimW + 1}
              ry={8}
              fill="none"
              stroke={rimColorSoft}
              strokeWidth={0.8}
              strokeDasharray="4,6"
            />

            {/* Head rim light — catches edge of spotlight */}
            <ellipse
              cx={0}
              cy={headCy}
              rx={headR + 1.5}
              ry={headR * 1.05 + 1.5}
              fill="none"
              stroke={rimColor}
              strokeWidth={1}
              strokeDasharray="8,12"
            />
          </g>

          {/* ---------------------------------------------------------- */}
          {/*  LEFT ARM — on fretboard (extended outward and up)           */}
          {/* ---------------------------------------------------------- */}
          {/* Upper arm */}
          <path
            d={`M ${-shoulderW / 2},${-torsoH / 2 + 8}
                C ${-shoulderW / 2 - 8},${-torsoH / 2 + 15} ${-shoulderW / 2 - 18},${-10} ${-shoulderW / 2 - 22},${-5}
                L ${-shoulderW / 2 - 18},${-3}
                C ${-shoulderW / 2 - 12},${-8} ${-shoulderW / 2 - 4},${-torsoH / 2 + 18} ${-shoulderW / 2 + 5},${-torsoH / 2 + 10}`}
            fill={silhouetteColor}
          />
          {/* Forearm reaching to fretboard */}
          <path
            d={`M ${-shoulderW / 2 - 22},${-5}
                C ${-shoulderW / 2 - 30},${0} ${-shoulderW / 2 - 38},${-8} ${-shoulderW / 2 - 40},${-12}
                L ${-shoulderW / 2 - 37},${-14}
                C ${-shoulderW / 2 - 34},${-10} ${-shoulderW / 2 - 26},${-3} ${-shoulderW / 2 - 18},${-3}`}
            fill={silhouetteColor}
          />
          {/* Hand on fretboard */}
          <ellipse
            cx={-shoulderW / 2 - 39}
            cy={-13}
            rx={5}
            ry={4}
            fill={silhouetteColor}
          />
          {/* Left arm rim light */}
          <path
            d={`M ${-shoulderW / 2 - 2},${-torsoH / 2 + 12}
                C ${-shoulderW / 2 - 10},${-torsoH / 2 + 18} ${-shoulderW / 2 - 20},${-8} ${-shoulderW / 2 - 22},${-4}`}
            fill="none"
            stroke={rimColorSoft}
            strokeWidth={0.8}
          />

          {/* ---------------------------------------------------------- */}
          {/*  RIGHT ARM — strumming (animated angle)                      */}
          {/* ---------------------------------------------------------- */}
          <g
            transform={`rotate(${strumAngle * 0.3}, ${shoulderW / 2}, ${-torsoH / 2 + 8})`}
          >
            {/* Upper arm */}
            <path
              d={`M ${shoulderW / 2},${-torsoH / 2 + 8}
                  C ${shoulderW / 2 + 6},${-torsoH / 2 + 15} ${shoulderW / 2 + 10},${0} ${shoulderW / 2 + 8},${8}
                  L ${shoulderW / 2 + 4},${10}
                  C ${shoulderW / 2 + 2},${2} ${shoulderW / 2},${-torsoH / 2 + 18} ${shoulderW / 2 - 4},${-torsoH / 2 + 10}`}
              fill={silhouetteColor}
            />
            {/* Forearm — strumming motion */}
            <g transform={`rotate(${strumAngle * 0.7}, ${shoulderW / 2 + 8}, ${8})`}>
              <path
                d={`M ${shoulderW / 2 + 8},${8}
                    C ${shoulderW / 2 + 12},${14} ${shoulderW / 2 + 8},${22} ${shoulderW / 2 + 4},${26}
                    L ${shoulderW / 2},${24}
                    C ${shoulderW / 2 + 4},${20} ${shoulderW / 2 + 8},${12} ${shoulderW / 2 + 4},${10}`}
                fill={silhouetteColor}
              />
              {/* Strumming hand near soundhole */}
              <ellipse
                cx={shoulderW / 2 + 3}
                cy={26}
                rx={4.5}
                ry={3.5}
                fill={silhouetteColor}
              />
            </g>
            {/* Right arm rim light */}
            <path
              d={`M ${shoulderW / 2 + 2},${-torsoH / 2 + 12}
                  C ${shoulderW / 2 + 8},${-torsoH / 2 + 18} ${shoulderW / 2 + 12},${2} ${shoulderW / 2 + 10},${8}`}
              fill="none"
              stroke={rimColorSoft}
              strokeWidth={0.8}
            />
          </g>

          {/* ---------------------------------------------------------- */}
          {/*  ES-335 GUITAR — semi-hollow body                            */}
          {/* ---------------------------------------------------------- */}
          <g>
            {/* Guitar body — double-cutaway semi-hollow shape */}
            <path
              d={`M ${guitarBodyCx - guitarBodyW * 0.15},${guitarBodyCy - guitarBodyH * 0.5}
                  C ${guitarBodyCx - guitarBodyW * 0.4},${guitarBodyCy - guitarBodyH * 0.55} ${guitarBodyCx - guitarBodyW * 0.5},${guitarBodyCy - guitarBodyH * 0.3} ${guitarBodyCx - guitarBodyW * 0.48},${guitarBodyCy}
                  C ${guitarBodyCx - guitarBodyW * 0.5},${guitarBodyCy + guitarBodyH * 0.3} ${guitarBodyCx - guitarBodyW * 0.4},${guitarBodyCy + guitarBodyH * 0.55} ${guitarBodyCx - guitarBodyW * 0.15},${guitarBodyCy + guitarBodyH * 0.5}
                  C ${guitarBodyCx + guitarBodyW * 0.05},${guitarBodyCy + guitarBodyH * 0.6} ${guitarBodyCx + guitarBodyW * 0.25},${guitarBodyCy + guitarBodyH * 0.55} ${guitarBodyCx + guitarBodyW * 0.35},${guitarBodyCy + guitarBodyH * 0.4}
                  C ${guitarBodyCx + guitarBodyW * 0.42},${guitarBodyCy + guitarBodyH * 0.25} ${guitarBodyCx + guitarBodyW * 0.42},${guitarBodyCy + guitarBodyH * 0.1} ${guitarBodyCx + guitarBodyW * 0.38},${guitarBodyCy}
                  C ${guitarBodyCx + guitarBodyW * 0.42},${guitarBodyCy - guitarBodyH * 0.1} ${guitarBodyCx + guitarBodyW * 0.42},${guitarBodyCy - guitarBodyH * 0.25} ${guitarBodyCx + guitarBodyW * 0.35},${guitarBodyCy - guitarBodyH * 0.4}
                  C ${guitarBodyCx + guitarBodyW * 0.25},${guitarBodyCy - guitarBodyH * 0.55} ${guitarBodyCx + guitarBodyW * 0.05},${guitarBodyCy - guitarBodyH * 0.6} ${guitarBodyCx - guitarBodyW * 0.15},${guitarBodyCy - guitarBodyH * 0.5}
                  Z`}
              fill={`url(#${bodyGradId})`}
              stroke={guitarRim}
              strokeWidth={0.6}
            />

            {/* F-hole left */}
            <path
              d={`M ${guitarBodyCx - 10},${guitarBodyCy - 8}
                  C ${guitarBodyCx - 12},${guitarBodyCy - 5} ${guitarBodyCx - 12},${guitarBodyCy + 5} ${guitarBodyCx - 10},${guitarBodyCy + 8}
                  C ${guitarBodyCx - 9},${guitarBodyCy + 5} ${guitarBodyCx - 9},${guitarBodyCy - 5} ${guitarBodyCx - 10},${guitarBodyCy - 8} Z`}
              fill={fholeColor}
              stroke={guitarRim}
              strokeWidth={0.3}
            />

            {/* F-hole right */}
            <path
              d={`M ${guitarBodyCx + 10},${guitarBodyCy - 8}
                  C ${guitarBodyCx + 12},${guitarBodyCy - 5} ${guitarBodyCx + 12},${guitarBodyCy + 5} ${guitarBodyCx + 10},${guitarBodyCy + 8}
                  C ${guitarBodyCx + 9},${guitarBodyCy + 5} ${guitarBodyCx + 9},${guitarBodyCy - 5} ${guitarBodyCx + 10},${guitarBodyCy - 8} Z`}
              fill={fholeColor}
              stroke={guitarRim}
              strokeWidth={0.3}
            />

            {/* Bridge */}
            <rect
              x={guitarBodyCx - 8}
              y={guitarBodyCy + 6}
              width={16}
              height={2.5}
              rx={0.5}
              fill={hslToRgba(hue, 0.3, 0.15, 0.7)}
            />

            {/* Tailpiece */}
            <rect
              x={guitarBodyCx - 5}
              y={guitarBodyCy + 11}
              width={10}
              height={3}
              rx={1}
              fill={hslToRgba(hue, 0.3, 0.12, 0.6)}
            />

            {/* Pickguard suggestion */}
            <path
              d={`M ${guitarBodyCx - 2},${guitarBodyCy - guitarBodyH * 0.35}
                  C ${guitarBodyCx - 12},${guitarBodyCy - guitarBodyH * 0.25} ${guitarBodyCx - 14},${guitarBodyCy + guitarBodyH * 0.15} ${guitarBodyCx - 6},${guitarBodyCy + guitarBodyH * 0.3}
                  L ${guitarBodyCx + 2},${guitarBodyCy + guitarBodyH * 0.25}
                  C ${guitarBodyCx + 4},${guitarBodyCy} ${guitarBodyCx + 2},${guitarBodyCy - guitarBodyH * 0.2} ${guitarBodyCx - 2},${guitarBodyCy - guitarBodyH * 0.35} Z`}
              fill={hslToRgba(hue, 0.2, 0.06, 0.3)}
            />

            {/* Neck pickup */}
            <rect
              x={guitarBodyCx - 7}
              y={guitarBodyCy - 5}
              width={14}
              height={3.5}
              rx={1}
              fill={hslToRgba(hue, 0.3, 0.1, 0.6)}
              stroke={guitarRim}
              strokeWidth={0.3}
            />

            {/* Bridge pickup */}
            <rect
              x={guitarBodyCx - 7}
              y={guitarBodyCy + 2}
              width={14}
              height={3.5}
              rx={1}
              fill={hslToRgba(hue, 0.3, 0.1, 0.6)}
              stroke={guitarRim}
              strokeWidth={0.3}
            />

            {/* Knobs */}
            <circle cx={guitarBodyCx - 14} cy={guitarBodyCy + 10} r={1.8} fill={hslToRgba(hue, 0.3, 0.12, 0.5)} />
            <circle cx={guitarBodyCx - 14} cy={guitarBodyCy + 15} r={1.8} fill={hslToRgba(hue, 0.3, 0.12, 0.5)} />
            <circle cx={guitarBodyCx + 14} cy={guitarBodyCy + 10} r={1.8} fill={hslToRgba(hue, 0.3, 0.12, 0.5)} />
            <circle cx={guitarBodyCx + 14} cy={guitarBodyCy + 15} r={1.8} fill={hslToRgba(hue, 0.3, 0.12, 0.5)} />

            {/* Toggle switch */}
            <line
              x1={guitarBodyCx + guitarBodyW * 0.3}
              y1={guitarBodyCy - guitarBodyH * 0.25}
              x2={guitarBodyCx + guitarBodyW * 0.3}
              y2={guitarBodyCy - guitarBodyH * 0.15}
              stroke={hslToRgba(hue, 0.4, 0.2, 0.5)}
              strokeWidth={0.8}
            />
            <circle
              cx={guitarBodyCx + guitarBodyW * 0.3}
              cy={guitarBodyCy - guitarBodyH * 0.28}
              r={1}
              fill={hslToRgba(hue, 0.4, 0.25, 0.5)}
            />

            {/* Guitar body rim light — catches spotlight edge */}
            <path
              d={`M ${guitarBodyCx - guitarBodyW * 0.15},${guitarBodyCy - guitarBodyH * 0.5}
                  C ${guitarBodyCx - guitarBodyW * 0.4},${guitarBodyCy - guitarBodyH * 0.55} ${guitarBodyCx - guitarBodyW * 0.5},${guitarBodyCy - guitarBodyH * 0.3} ${guitarBodyCx - guitarBodyW * 0.48},${guitarBodyCy}`}
              fill="none"
              stroke={rimColor}
              strokeWidth={0.8}
            />

            {/* ---------------------------------------------------------- */}
            {/*  GUITAR NECK — angled up-left toward fret hand              */}
            {/* ---------------------------------------------------------- */}
            <g transform={`rotate(-28, ${guitarBodyCx + guitarBodyW * 0.38}, ${guitarBodyCy})`}>
              {/* Neck body */}
              <rect
                x={guitarBodyCx + guitarBodyW * 0.38}
                y={guitarBodyCy - 5}
                width={52}
                height={10}
                rx={1.5}
                fill={guitarColor}
                stroke={guitarRim}
                strokeWidth={0.4}
              />

              {/* Fretboard */}
              <rect
                x={guitarBodyCx + guitarBodyW * 0.4}
                y={guitarBodyCy - 3.5}
                width={48}
                height={7}
                rx={1}
                fill={hslToRgba(hue, 0.25, 0.05, 0.7)}
              />

              {/* Fret markers */}
              {[8, 16, 24, 32].map((fx, i) => (
                <line
                  key={`fret-${i}`}
                  x1={guitarBodyCx + guitarBodyW * 0.4 + fx}
                  y1={guitarBodyCy - 3}
                  x2={guitarBodyCx + guitarBodyW * 0.4 + fx}
                  y2={guitarBodyCy + 3}
                  stroke={hslToRgba(hue, 0.3, 0.3, 0.25)}
                  strokeWidth={0.5}
                />
              ))}

              {/* Dot markers */}
              {[12, 20, 28].map((fx, i) => (
                <circle
                  key={`dot-${i}`}
                  cx={guitarBodyCx + guitarBodyW * 0.4 + fx}
                  cy={guitarBodyCy}
                  r={0.8}
                  fill={hslToRgba(hue, 0.4, 0.4, 0.3)}
                />
              ))}

              {/* 12th fret double dot */}
              <circle cx={guitarBodyCx + guitarBodyW * 0.4 + 36} cy={guitarBodyCy - 1.5} r={0.7} fill={hslToRgba(hue, 0.4, 0.4, 0.3)} />
              <circle cx={guitarBodyCx + guitarBodyW * 0.4 + 36} cy={guitarBodyCy + 1.5} r={0.7} fill={hslToRgba(hue, 0.4, 0.4, 0.3)} />

              {/* Headstock */}
              <path
                d={`M ${guitarBodyCx + guitarBodyW * 0.4 + 48},${guitarBodyCy - 5}
                    L ${guitarBodyCx + guitarBodyW * 0.4 + 58},${guitarBodyCy - 7}
                    C ${guitarBodyCx + guitarBodyW * 0.4 + 62},${guitarBodyCy - 7} ${guitarBodyCx + guitarBodyW * 0.4 + 62},${guitarBodyCy + 7} ${guitarBodyCx + guitarBodyW * 0.4 + 58},${guitarBodyCy + 7}
                    L ${guitarBodyCx + guitarBodyW * 0.4 + 48},${guitarBodyCy + 5} Z`}
                fill={guitarColor}
                stroke={guitarRim}
                strokeWidth={0.4}
              />

              {/* Tuning pegs — 3 per side */}
              {[0, 1, 2].map((i) => (
                <React.Fragment key={`tpeg-t-${i}`}>
                  <rect
                    x={guitarBodyCx + guitarBodyW * 0.4 + 50 + i * 3}
                    y={guitarBodyCy - 8 - 2}
                    width={2}
                    height={2.5}
                    rx={0.5}
                    fill={hslToRgba(hue, 0.3, 0.2, 0.4)}
                  />
                </React.Fragment>
              ))}
              {[0, 1, 2].map((i) => (
                <React.Fragment key={`tpeg-b-${i}`}>
                  <rect
                    x={guitarBodyCx + guitarBodyW * 0.4 + 50 + i * 3}
                    y={guitarBodyCy + 7.5}
                    width={2}
                    height={2.5}
                    rx={0.5}
                    fill={hslToRgba(hue, 0.3, 0.2, 0.4)}
                  />
                </React.Fragment>
              ))}
            </g>

            {/* ---------------------------------------------------------- */}
            {/*  VIBRATING STRINGS across guitar body                       */}
            {/* ---------------------------------------------------------- */}
            {stringPaths.map((path, si) => {
              const thickness = 0.4 + si * 0.1;
              const stringGlow = 1 + energy * 3;
              const stringOp = 0.35 + energy * 0.35;
              return (
                <polyline
                  key={`str-${si}`}
                  points={path}
                  stroke={stringColor}
                  strokeWidth={thickness}
                  fill="none"
                  opacity={stringOp}
                  style={{
                    filter: `drop-shadow(0 0 ${stringGlow}px ${stringColor})`,
                  }}
                />
              );
            })}
          </g>

          {/* ---------------------------------------------------------- */}
          {/*  SHOULDER RIM LIGHT — top-down spotlight edge                 */}
          {/* ---------------------------------------------------------- */}
          <path
            d={`M ${-shoulderW / 2 + 6},${-torsoH / 2}
                Q ${-shoulderW / 2 - 2},${-torsoH / 2 + 2} ${-shoulderW / 2},${-torsoH / 2 + 8}`}
            fill="none"
            stroke={rimColor}
            strokeWidth={1.4}
            style={{ filter: `blur(1px)` }}
          />
          <line
            x1={-shoulderW / 2 + 6}
            y1={-torsoH / 2}
            x2={shoulderW / 2 - 6}
            y2={-torsoH / 2}
            stroke={rimColor}
            strokeWidth={1.2}
            style={{ filter: `blur(1px)` }}
          />
          <path
            d={`M ${shoulderW / 2 - 6},${-torsoH / 2}
                Q ${shoulderW / 2 + 2},${-torsoH / 2 + 2} ${shoulderW / 2},${-torsoH / 2 + 8}`}
            fill="none"
            stroke={rimColor}
            strokeWidth={1.4}
            style={{ filter: `blur(1px)` }}
          />

          {/* ---------------------------------------------------------- */}
          {/*  AMBIENT GLOW on figure — warm spotlight wash                 */}
          {/* ---------------------------------------------------------- */}
          <ellipse
            cx={0}
            cy={-10}
            rx={shoulderW * 0.8}
            ry={torsoH * 0.6}
            fill={ambientColorDim}
            style={{ filter: `blur(${25}px)`, mixBlendMode: "screen" }}
          />

          {/* Beat-reactive highlight burst */}
          {beatDecay > 0.3 && (
            <ellipse
              cx={0}
              cy={-torsoH * 0.2}
              rx={shoulderW * 0.5 * beatDecay}
              ry={torsoH * 0.3 * beatDecay}
              fill={hslToRgba(hue, 0.6, 0.75, beatDecay * 0.1)}
              style={{ filter: `blur(${15}px)`, mixBlendMode: "screen" }}
            />
          )}

          {/* Drum hit flash on figure */}
          {drumBeat > 0.5 && (
            <ellipse
              cx={0}
              cy={0}
              rx={shoulderW * 0.3}
              ry={torsoH * 0.2}
              fill={hslToRgba(hue + 15, 0.7, 0.8, drumBeat * 0.08)}
              style={{ filter: `blur(${12}px)`, mixBlendMode: "screen" }}
            />
          )}
        </g>

        {/* ============================================================ */}
        {/*  SECONDARY ATMOSPHERIC EFFECTS                                 */}
        {/* ============================================================ */}

        {/* Haze at feet level */}
        <ellipse
          cx={figureX + sway}
          cy={figureBaseY + (feetY + 5) * scale * breathe}
          rx={stanceW * 1.5 * scale}
          ry={8 * scale}
          fill={hslToRgba(hue, 0.3, 0.5, 0.06 + energy * 0.04)}
          style={{ filter: `blur(${8 * scale}px)` }}
        />

        {/* Warm ambient bloom behind upper body (highs-reactive) */}
        <ellipse
          cx={figureX + sway}
          cy={figureBaseY + headCy * scale * breathe}
          rx={40 * scale}
          ry={30 * scale}
          fill={hslToRgba(hue + 10, 0.5, 0.7, highs * 0.08)}
          style={{ filter: `blur(${15 * scale}px)`, mixBlendMode: "screen" }}
        />
      </svg>
    </div>
  );
};
