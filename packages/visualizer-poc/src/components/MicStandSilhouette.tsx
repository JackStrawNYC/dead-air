/**
 * MicStandSilhouette — Jerry Garcia at the microphone, A+++ quality.
 *
 * Iconic silhouette of the singer at a microphone stand: tall figure with
 * Jerry's signature long-hair-and-beard outline, glasses suggestion, one
 * hand on the mic stand and the other gesturing or holding lyrics. The mic
 * stand is rendered in detail — splayed tripod base, vertical pole, boom
 * arm with counterweight, cylindrical microphone with grille, and an XLR
 * cable draping naturally toward the floor.
 *
 * Volumetric spotlight cone from above, dust motes drifting through the
 * beam, warm pool of light at the feet, stage floor reflection, and rim
 * lighting along the figure's edges. Warm amber palette shifts with
 * chromaHue. Mic glow flashes on vocal accents.
 *
 * Audio: vocalEnergy/vocalPresence drive overall visibility — Jerry only
 * shows up when he's actually singing. beatDecay pulses the spotlight,
 * onsetEnvelope flashes mic glow on vocal accents, chromaHue tints the
 * warm light, and musicalTime drives subtle body sway.
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
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const MicStandSilhouette: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const {
    energy,
    bass,
    beatDecay,
    chromaHue: chromaHueDeg,
    onsetEnvelope,
    musicalTime,
    vocalEnergy,
    vocalPresence,
    slowEnergy,
  } = snap;

  /* -- Vocal gating: Jerry only appears when he's singing -- */
  const vocalGate = interpolate(
    Math.max(vocalEnergy ?? 0, (vocalPresence ?? 0) * 0.6),
    [0.04, 0.18],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const energyFloor = interpolate(energy, [0.04, 0.12], [0, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(1, vocalGate * (0.65 + energyFloor));
  if (opacity < 0.01) return null;

  /* -- Warm amber base hue, shifted by chromaHue -- */
  const baseHue = 32; // warm amber, slightly warmer than Bobby
  const hueShift = (chromaHueDeg / 360) * 28 - 14;
  const hue = baseHue + hueShift;

  /* -- Figure position: left-center stage (Jerry's typical spot) -- */
  const figureX = width * 0.36;
  const figureBaseY = height * 0.48;
  const scale = Math.min(width, height) / 1080;

  /* -- Sway: Jerry's gentle rhythmic sway, vocal-driven -- */
  const swayAmount = interpolate(vocalEnergy ?? 0, [0.05, 0.3], [1.5, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) + interpolate(bass, [0.05, 0.35], [0, 3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sway =
    Math.sin(musicalTime * Math.PI * 2 * 0.4 * tempoFactor) * swayAmount +
    Math.sin(musicalTime * Math.PI * 2 * 0.18 * tempoFactor) * swayAmount * 0.5;

  /* -- Breathing / pulse — bigger on vocal accents -- */
  const breathe =
    1.0 +
    Math.sin(frame * 0.035) * 0.01 +
    beatDecay * 0.012 +
    (onsetEnvelope ?? 0) * 0.018;

  /* -- Spotlight parameters -- */
  const spotlightIntensity = interpolate(
    Math.max(vocalEnergy ?? 0, energy * 0.8),
    [0.05, 0.32],
    [0.28, 0.6],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const spotlightPulse = spotlightIntensity + beatDecay * 0.14;
  const spotlightRadius = interpolate(energy, [0.05, 0.4], [85, 165], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* -- Flicker -- */
  const flicker =
    0.93 +
    Math.sin(frame * 0.10 + 1.3) * 0.035 +
    Math.sin(frame * 0.27 + 2.7) * 0.025;

  /* -- Rim light intensity -- */
  const rimIntensity = interpolate(
    Math.max(vocalEnergy ?? 0, energy * 0.7),
    [0.08, 0.32],
    [0.14, 0.38],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  ) + beatDecay * 0.16;

  /* -- Mic glow flash on vocal onsets -- */
  const micGlow = 0.35 + (onsetEnvelope ?? 0) * 0.7 + beatDecay * 0.15;

  /* -- Head tilt — Jerry's contemplative head movement -- */
  const headTilt =
    interpolate(slowEnergy, [0.08, 0.3], [-1.5, 2], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) +
    Math.sin(frame * 0.022) * 1.2 +
    (onsetEnvelope ?? 0) * 1.5;

  /* -- Hand gesture (free hand) — small motion on vocal phrases -- */
  const gestureAngle =
    Math.sin(musicalTime * Math.PI * 2 * 0.5 * tempoFactor) * 8 +
    (onsetEnvelope ?? 0) * 12;

  /* -- Figure dimensions (in local SVG coords) -- */
  const headR = 17;
  const shoulderW = 52;
  const torsoH = 72;
  const hipW = 40;
  const legH = 84;
  const stanceW = 22; // narrower stance than Bobby

  /* -- Mic stand dimensions -- */
  const micStandX = -shoulderW * 0.5 - 32; // mic stand to figure's left
  const micPoleTopY = -torsoH / 2 - 4; // boom arm height roughly at mouth
  const micPoleBaseY = torsoH / 2 + legH; // base at floor

  /* -- Colors -- */
  const silhouetteColor = hslToRgba(hue, 0.32, 0.06, 0.93);
  const silhouetteDark = hslToRgba(hue, 0.28, 0.04, 0.96);
  const silhouetteHair = hslToRgba(hue - 5, 0.35, 0.05, 0.95);
  const rimColor = hslToRgba(hue, 0.78, 0.66, rimIntensity);
  const rimColorSoft = hslToRgba(hue, 0.7, 0.6, rimIntensity * 0.6);
  const standColor = hslToRgba(hue, 0.25, 0.07, 0.92);
  const standRim = hslToRgba(hue, 0.7, 0.55, rimIntensity * 0.65);
  const micBodyColor = hslToRgba(hue + 4, 0.3, 0.09, 0.95);
  const micGrilleColor = hslToRgba(hue + 8, 0.45, 0.18, 0.92);
  const micGlowColor = hslToRgba(hue + 5, 0.85, 0.7, micGlow * 0.55);
  const cableColor = hslToRgba(hue, 0.2, 0.05, 0.85);
  const spotCoreColor = hslToRgba(hue, 0.5, 0.85, spotlightPulse * 0.45);
  const spotMidColor = hslToRgba(hue, 0.55, 0.65, spotlightPulse * 0.2);
  const spotEdgeColor = hslToRgba(hue, 0.5, 0.5, 0);
  const dustColor = hslToRgba(hue, 0.4, 0.78, 0.16 + beatDecay * 0.12);
  const groundColor = hslToRgba(hue, 0.55, 0.6, spotlightPulse * 0.16);
  const reflectionColor = hslToRgba(hue, 0.3, 0.08, spotlightPulse * 0.13);
  const glassEdge = hslToRgba(hue, 0.5, 0.2, 0.55);

  /* -- Dust mote positions (deterministic) -- */
  const dustMotes: Array<{ x: number; y: number; r: number; opacity: number }> = [];
  for (let i = 0; i < 22; i++) {
    const seed = i * 137.508; // golden angle
    const phase = seed + frame * (0.007 + i * 0.0018);
    const driftX = Math.sin(phase) * (28 + i * 2.5);
    const driftY = Math.cos(phase * 0.7 + i) * 130 - 70 + i * 11;
    const moteR = 0.55 + Math.sin(seed * 3.7) * 0.45;
    const moteOpacity =
      (0.13 + Math.sin(phase * 1.3) * 0.08) *
      interpolate(
        Math.abs(driftX),
        [0, spotlightRadius * 0.42],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
    dustMotes.push({ x: driftX, y: driftY, r: moteR, opacity: moteOpacity });
  }

  /* -- Unique SVG gradient IDs -- */
  const spotGradId = `mic-spot-${frame % 1000}`;
  const coneGradId = `mic-cone-${frame % 1000}`;
  const reflGradId = `mic-refl-${frame % 1000}`;
  const micGradId = `mic-body-${frame % 1000}`;
  const grilleGradId = `mic-grille-${frame % 1000}`;

  /* ================================================================ */
  /*  Local-coordinate anchors                                          */
  /* ================================================================ */
  const neckY = -torsoH / 2 - headR - 4;
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
            <stop offset="42%" stopColor={spotMidColor} />
            <stop offset="100%" stopColor={spotEdgeColor} />
          </radialGradient>

          {/* Volumetric cone gradient (top-down) */}
          <linearGradient id={coneGradId} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop
              offset="0%"
              stopColor={hslToRgba(hue, 0.5, 0.86, spotlightPulse * 0.38)}
            />
            <stop
              offset="32%"
              stopColor={hslToRgba(hue, 0.5, 0.7, spotlightPulse * 0.16)}
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

          {/* Mic body gradient (cylindrical shading) */}
          <linearGradient id={micGradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={hslToRgba(hue, 0.25, 0.04, 0.95)} />
            <stop offset="50%" stopColor={hslToRgba(hue + 5, 0.32, 0.13, 0.95)} />
            <stop offset="100%" stopColor={hslToRgba(hue, 0.25, 0.04, 0.95)} />
          </linearGradient>

          {/* Mic grille gradient — glows on vocal accents */}
          <radialGradient id={grilleGradId} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor={hslToRgba(hue + 8, 0.7, 0.55, micGlow * 0.85)} />
            <stop offset="50%" stopColor={hslToRgba(hue + 5, 0.55, 0.25, micGlow * 0.6)} />
            <stop offset="100%" stopColor={micBodyColor} />
          </radialGradient>
        </defs>

        {/* ============================================================ */}
        {/*  VOLUMETRIC SPOTLIGHT CONE from above                         */}
        {/* ============================================================ */}
        <g transform={`translate(${figureX + sway}, ${figureBaseY})`}>
          {/* Wide cone trapezoid */}
          <polygon
            points={`${-14 * scale},${-250 * scale} ${14 * scale},${-250 * scale} ${spotlightRadius * scale * 0.95},${(feetY + 32) * scale * breathe} ${-spotlightRadius * scale * 0.95},${(feetY + 32) * scale * breathe}`}
            fill={`url(#${coneGradId})`}
            style={{ filter: `blur(${13 * scale}px)` }}
          />

          {/* Cone core — brighter narrow beam */}
          <polygon
            points={`${-7 * scale},${-250 * scale} ${7 * scale},${-250 * scale} ${spotlightRadius * 0.36 * scale},${(feetY + 12) * scale * breathe} ${-spotlightRadius * 0.36 * scale},${(feetY + 12) * scale * breathe}`}
            fill={hslToRgba(hue, 0.45, 0.82, spotlightPulse * 0.13)}
            style={{ filter: `blur(${9 * scale}px)` }}
          />
        </g>

        {/* ============================================================ */}
        {/*  AMBIENT WASH behind figure                                    */}
        {/* ============================================================ */}
        <ellipse
          cx={figureX + sway}
          cy={figureBaseY - 22 * scale}
          rx={spotlightRadius * 1.25 * scale}
          ry={spotlightRadius * 1.85 * scale}
          fill={`url(#${spotGradId})`}
          style={{ filter: `blur(${22 * scale}px)` }}
        />

        {/* ============================================================ */}
        {/*  GROUND POOL OF LIGHT                                          */}
        {/* ============================================================ */}
        <ellipse
          cx={figureX + sway}
          cy={figureBaseY + (feetY + 16) * scale * breathe}
          rx={spotlightRadius * 0.92 * scale}
          ry={spotlightRadius * 0.19 * scale}
          fill={groundColor}
          style={{ filter: `blur(${11 * scale}px)` }}
        />

        {/* Secondary ground warmth */}
        <ellipse
          cx={figureX + sway}
          cy={figureBaseY + (feetY + 11) * scale * breathe}
          rx={spotlightRadius * 0.5 * scale}
          ry={spotlightRadius * 0.085 * scale}
          fill={hslToRgba(hue, 0.6, 0.66, spotlightPulse * 0.11)}
          style={{ filter: `blur(${6 * scale}px)` }}
        />

        {/* ============================================================ */}
        {/*  DUST MOTES in spotlight beam                                  */}
        {/* ============================================================ */}
        <g transform={`translate(${figureX + sway}, ${figureBaseY})`}>
          {dustMotes.map((m, i) => (
            <circle
              key={`mic-dust-${i}`}
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
          transform={`translate(${figureX + sway}, ${figureBaseY + (feetY + 22) * scale * breathe}) scale(${breathe * scale}, ${-0.26 * scale})`}
          opacity={spotlightPulse * 0.16}
          style={{ filter: `blur(${3.2 * scale}px)` }}
        >
          {/* Simplified figure + stand reflection */}
          <path
            d={`M 0,${headCy}
                L ${-shoulderW / 2},${-torsoH / 2 + 5}
                L ${-shoulderW / 2},${torsoH * 0.3}
                L ${-stanceW / 2},${feetY}
                L ${stanceW / 2},${feetY}
                L ${shoulderW / 2},${torsoH * 0.3}
                L ${shoulderW / 2},${-torsoH / 2 + 5} Z`}
            fill={reflectionColor}
          />
          {/* Mic stand reflection */}
          <line
            x1={micStandX}
            y1={micPoleBaseY}
            x2={micStandX}
            y2={micPoleTopY}
            stroke={reflectionColor}
            strokeWidth={1.4}
          />
        </g>

        {/* ============================================================ */}
        {/*  MIC STAND (drawn behind figure)                               */}
        {/* ============================================================ */}
        <g
          transform={`translate(${figureX + sway}, ${figureBaseY}) scale(${breathe * scale})`}
        >
          {/* Tripod base — 3 splayed legs */}
          <line
            x1={micStandX}
            y1={feetY + 1}
            x2={micStandX - 14}
            y2={feetY + 7}
            stroke={standColor}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <line
            x1={micStandX}
            y1={feetY + 1}
            x2={micStandX + 13}
            y2={feetY + 7}
            stroke={standColor}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <line
            x1={micStandX}
            y1={feetY + 1}
            x2={micStandX - 2}
            y2={feetY + 8}
            stroke={standColor}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          {/* Tripod hub */}
          <circle cx={micStandX} cy={feetY + 1} r={2.2} fill={standColor} />

          {/* Vertical pole */}
          <line
            x1={micStandX}
            y1={feetY + 1}
            x2={micStandX}
            y2={micPoleTopY + 2}
            stroke={standColor}
            strokeWidth={1.8}
          />
          {/* Pole rim light */}
          <line
            x1={micStandX + 0.8}
            y1={feetY - 4}
            x2={micStandX + 0.8}
            y2={micPoleTopY + 4}
            stroke={standRim}
            strokeWidth={0.5}
          />

          {/* Boom clamp at top of pole */}
          <rect
            x={micStandX - 2.5}
            y={micPoleTopY}
            width={5}
            height={4}
            rx={1}
            fill={standColor}
          />

          {/* Boom arm (angled toward figure's mouth) */}
          {(() => {
            const boomStartX = micStandX;
            const boomStartY = micPoleTopY + 2;
            const boomEndX = -shoulderW * 0.18; // ends in front of figure's mouth
            const boomEndY = headCy + headR * 0.55;
            // Counterweight extension behind pivot
            const counterX = micStandX - 10;
            const counterY = micPoleTopY - 1;
            return (
              <g>
                {/* Counterweight arm (back of boom) */}
                <line
                  x1={boomStartX}
                  y1={boomStartY}
                  x2={counterX}
                  y2={counterY}
                  stroke={standColor}
                  strokeWidth={1.6}
                />
                {/* Counterweight cylinder */}
                <ellipse
                  cx={counterX - 1.5}
                  cy={counterY}
                  rx={3.2}
                  ry={2.2}
                  fill={standColor}
                />
                <ellipse
                  cx={counterX - 1.5}
                  cy={counterY}
                  rx={3.2}
                  ry={2.2}
                  fill="none"
                  stroke={standRim}
                  strokeWidth={0.5}
                />

                {/* Main boom forward */}
                <line
                  x1={boomStartX}
                  y1={boomStartY}
                  x2={boomEndX}
                  y2={boomEndY}
                  stroke={standColor}
                  strokeWidth={1.8}
                />
                {/* Boom rim light */}
                <line
                  x1={boomStartX + 0.4}
                  y1={boomStartY - 0.6}
                  x2={boomEndX + 0.4}
                  y2={boomEndY - 0.6}
                  stroke={standRim}
                  strokeWidth={0.5}
                />

                {/* Mic clip / shock mount */}
                <ellipse
                  cx={boomEndX}
                  cy={boomEndY}
                  rx={3.2}
                  ry={2}
                  fill={standColor}
                />

                {/* Microphone glow (behind body) */}
                <circle
                  cx={boomEndX + 4}
                  cy={boomEndY}
                  r={9}
                  fill={micGlowColor}
                  style={{ filter: `blur(${4}px)` }}
                />

                {/* Microphone body — cylindrical */}
                <rect
                  x={boomEndX + 1}
                  y={boomEndY - 2.6}
                  width={6}
                  height={5.2}
                  rx={1}
                  fill={`url(#${micGradId})`}
                />
                {/* Mic body rim */}
                <rect
                  x={boomEndX + 1}
                  y={boomEndY - 2.6}
                  width={6}
                  height={5.2}
                  rx={1}
                  fill="none"
                  stroke={standRim}
                  strokeWidth={0.4}
                />

                {/* Mic grille (rounded ball at end) */}
                <ellipse
                  cx={boomEndX + 9.5}
                  cy={boomEndY}
                  rx={3.6}
                  ry={3.4}
                  fill={`url(#${grilleGradId})`}
                  stroke={micGrilleColor}
                  strokeWidth={0.4}
                />
                {/* Grille mesh suggestion (vertical lines) */}
                {[-1.5, 0, 1.5].map((dx, i) => (
                  <line
                    key={`grille-${i}`}
                    x1={boomEndX + 9.5 + dx}
                    y1={boomEndY - 2.6}
                    x2={boomEndX + 9.5 + dx}
                    y2={boomEndY + 2.6}
                    stroke={hslToRgba(hue, 0.4, 0.12, 0.6)}
                    strokeWidth={0.3}
                  />
                ))}
                {/* Grille mesh horizontal lines */}
                {[-1.2, 0, 1.2].map((dy, i) => (
                  <line
                    key={`grille-h-${i}`}
                    x1={boomEndX + 6}
                    y1={boomEndY + dy}
                    x2={boomEndX + 13}
                    y2={boomEndY + dy}
                    stroke={hslToRgba(hue, 0.4, 0.12, 0.5)}
                    strokeWidth={0.25}
                  />
                ))}
                {/* Grille rim highlight on top */}
                <path
                  d={`M ${boomEndX + 7},${boomEndY - 2.8}
                      Q ${boomEndX + 9.5},${boomEndY - 4} ${boomEndX + 12},${boomEndY - 2.4}`}
                  fill="none"
                  stroke={rimColor}
                  strokeWidth={0.7}
                />

                {/* XLR cable — drapes from base of mic body downward to floor */}
                <path
                  d={`M ${boomEndX + 1},${boomEndY + 2.4}
                      Q ${boomEndX - 4},${boomEndY + 18} ${micStandX + 4},${boomEndY + 38}
                      T ${micStandX - 1},${boomEndY + 70}
                      T ${micStandX + 2},${feetY - 2}`}
                  fill="none"
                  stroke={cableColor}
                  strokeWidth={1.1}
                  strokeLinecap="round"
                />
                {/* Cable rim highlight */}
                <path
                  d={`M ${boomEndX + 1},${boomEndY + 2.4}
                      Q ${boomEndX - 4},${boomEndY + 18} ${micStandX + 4},${boomEndY + 38}`}
                  fill="none"
                  stroke={standRim}
                  strokeWidth={0.35}
                  opacity={0.7}
                />
              </g>
            );
          })()}
        </g>

        {/* ============================================================ */}
        {/*  FIGURE SILHOUETTE GROUP                                       */}
        {/* ============================================================ */}
        <g
          transform={`translate(${figureX + sway}, ${figureBaseY}) scale(${breathe * scale})`}
        >
          {/* ---------------------------------------------------------- */}
          {/*  LEGS — standing pose                                        */}
          {/* ---------------------------------------------------------- */}
          {/* Left leg */}
          <path
            d={`M ${-hipW * 0.32},${hipY}
                C ${-hipW * 0.36},${hipY + legH * 0.35} ${-stanceW * 0.55},${hipY + legH * 0.6} ${-stanceW * 0.6},${feetY}
                L ${-stanceW * 0.6 + 9},${feetY}
                L ${-stanceW * 0.45},${feetY - 3}
                C ${-stanceW * 0.3},${hipY + legH * 0.55} ${-hipW * 0.18},${hipY + legH * 0.25} ${-2},${hipY}`}
            fill={silhouetteColor}
          />
          {/* Left shoe */}
          <path
            d={`M ${-stanceW * 0.6},${feetY}
                L ${-stanceW * 0.6 - 5},${feetY + 3}
                L ${-stanceW * 0.6 + 11},${feetY + 3}
                L ${-stanceW * 0.6 + 9},${feetY} Z`}
            fill={silhouetteDark}
          />

          {/* Right leg */}
          <path
            d={`M ${2},${hipY}
                C ${hipW * 0.18},${hipY + legH * 0.25} ${stanceW * 0.3},${hipY + legH * 0.55} ${stanceW * 0.45},${feetY - 3}
                L ${stanceW * 0.6 - 9},${feetY}
                L ${stanceW * 0.6},${feetY}
                C ${stanceW * 0.55},${hipY + legH * 0.6} ${hipW * 0.36},${hipY + legH * 0.35} ${hipW * 0.32},${hipY}`}
            fill={silhouetteColor}
          />
          {/* Right shoe */}
          <path
            d={`M ${stanceW * 0.6 - 9},${feetY}
                L ${stanceW * 0.6 - 11},${feetY + 3}
                L ${stanceW * 0.6 + 5},${feetY + 3}
                L ${stanceW * 0.6},${feetY} Z`}
            fill={silhouetteDark}
          />

          {/* Leg rim lights */}
          <path
            d={`M ${-hipW * 0.18},${hipY + legH * 0.15}
                C ${-stanceW * 0.3},${hipY + legH * 0.45} ${-stanceW * 0.5},${feetY - 18} ${-stanceW * 0.55},${feetY - 4}`}
            fill="none"
            stroke={rimColorSoft}
            strokeWidth={0.8}
          />
          <path
            d={`M ${hipW * 0.18},${hipY + legH * 0.15}
                C ${stanceW * 0.3},${hipY + legH * 0.45} ${stanceW * 0.5},${feetY - 18} ${stanceW * 0.55},${feetY - 4}`}
            fill="none"
            stroke={rimColorSoft}
            strokeWidth={0.8}
          />

          {/* ---------------------------------------------------------- */}
          {/*  TORSO — Jerry's slightly relaxed posture                    */}
          {/* ---------------------------------------------------------- */}
          <path
            d={`M ${-shoulderW / 2},${-torsoH / 2 + 8}
                Q ${-shoulderW / 2 - 5},${-torsoH / 2 + 1} ${-shoulderW / 2 + 7},${-torsoH / 2}
                L ${shoulderW / 2 - 7},${-torsoH / 2}
                Q ${shoulderW / 2 + 5},${-torsoH / 2 + 1} ${shoulderW / 2},${-torsoH / 2 + 8}
                L ${hipW / 2 + 2},${hipY}
                L ${-hipW / 2 - 2},${hipY} Z`}
            fill={silhouetteColor}
          />
          {/* T-shirt seam suggestion */}
          <line
            x1={0}
            y1={-torsoH / 2 + 4}
            x2={0}
            y2={hipY - 3}
            stroke={hslToRgba(hue - 5, 0.3, 0.04, 0.4)}
            strokeWidth={0.4}
          />
          {/* Torso rim light edges */}
          <path
            d={`M ${-shoulderW / 2},${-torsoH / 2 + 8} L ${-hipW / 2 - 2},${hipY}`}
            fill="none"
            stroke={rimColor}
            strokeWidth={1.2}
          />
          <path
            d={`M ${shoulderW / 2},${-torsoH / 2 + 8} L ${hipW / 2 + 2},${hipY}`}
            fill="none"
            stroke={rimColor}
            strokeWidth={1.2}
          />

          {/* ---------------------------------------------------------- */}
          {/*  NECK                                                        */}
          {/* ---------------------------------------------------------- */}
          <rect
            x={-5.5}
            y={-torsoH / 2 - 8}
            width={11}
            height={12}
            rx={3}
            fill={silhouetteColor}
          />

          {/* ---------------------------------------------------------- */}
          {/*  HEAD with Jerry's hair, beard, glasses                      */}
          {/* ---------------------------------------------------------- */}
          <g transform={`rotate(${headTilt}, 0, ${headCy})`}>
            {/* Hair backdrop — fuller, slightly long, frames the face */}
            <ellipse
              cx={0}
              cy={headCy + 3}
              rx={headR * 1.22}
              ry={headR * 1.18}
              fill={silhouetteHair}
            />
            {/* Hair strands flowing slightly outward (right side) */}
            <path
              d={`M ${headR * 1.05},${headCy - 2}
                  Q ${headR * 1.35},${headCy + 6} ${headR * 1.15},${headCy + 14}`}
              fill="none"
              stroke={silhouetteHair}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
            <path
              d={`M ${-headR * 1.05},${headCy - 2}
                  Q ${-headR * 1.35},${headCy + 6} ${-headR * 1.15},${headCy + 14}`}
              fill="none"
              stroke={silhouetteHair}
              strokeWidth={2.2}
              strokeLinecap="round"
            />

            {/* Head */}
            <ellipse
              cx={0}
              cy={headCy}
              rx={headR}
              ry={headR * 1.05}
              fill={silhouetteColor}
            />

            {/* Beard — covers lower half of face, flows down a bit */}
            <path
              d={`M ${-headR * 0.9},${headCy + 1}
                  Q ${-headR * 1.05},${headCy + headR * 0.7} ${-headR * 0.55},${headCy + headR * 1.1}
                  Q ${0},${headCy + headR * 1.35} ${headR * 0.55},${headCy + headR * 1.1}
                  Q ${headR * 1.05},${headCy + headR * 0.7} ${headR * 0.9},${headCy + 1}
                  Q ${headR * 0.55},${headCy + headR * 0.45} ${0},${headCy + headR * 0.5}
                  Q ${-headR * 0.55},${headCy + headR * 0.45} ${-headR * 0.9},${headCy + 1} Z`}
              fill={silhouetteHair}
            />

            {/* Beard inner shadow texture */}
            <path
              d={`M ${-headR * 0.55},${headCy + headR * 0.65}
                  Q ${0},${headCy + headR * 0.85} ${headR * 0.55},${headCy + headR * 0.65}`}
              fill="none"
              stroke={hslToRgba(hue - 8, 0.3, 0.02, 0.5)}
              strokeWidth={0.5}
            />

            {/* Glasses — small round/oval frames */}
            <g>
              {/* Left lens */}
              <ellipse
                cx={-headR * 0.42}
                cy={headCy - headR * 0.05}
                rx={headR * 0.28}
                ry={headR * 0.22}
                fill="none"
                stroke={glassEdge}
                strokeWidth={0.7}
              />
              {/* Right lens */}
              <ellipse
                cx={headR * 0.42}
                cy={headCy - headR * 0.05}
                rx={headR * 0.28}
                ry={headR * 0.22}
                fill="none"
                stroke={glassEdge}
                strokeWidth={0.7}
              />
              {/* Bridge */}
              <line
                x1={-headR * 0.16}
                y1={headCy - headR * 0.05}
                x2={headR * 0.16}
                y2={headCy - headR * 0.05}
                stroke={glassEdge}
                strokeWidth={0.6}
              />
              {/* Lens highlight (catches spotlight) */}
              <ellipse
                cx={-headR * 0.36}
                cy={headCy - headR * 0.12}
                rx={headR * 0.08}
                ry={headR * 0.05}
                fill={hslToRgba(hue, 0.7, 0.75, rimIntensity * 1.4)}
              />
              <ellipse
                cx={headR * 0.48}
                cy={headCy - headR * 0.12}
                rx={headR * 0.07}
                ry={headR * 0.045}
                fill={hslToRgba(hue, 0.7, 0.75, rimIntensity * 1.2)}
              />
            </g>

            {/* Head rim light */}
            <ellipse
              cx={0}
              cy={headCy}
              rx={headR + 1.6}
              ry={headR * 1.05 + 1.6}
              fill="none"
              stroke={rimColor}
              strokeWidth={1}
              strokeDasharray="9,11"
            />

            {/* Hair top rim light catching spotlight */}
            <path
              d={`M ${-headR * 0.9},${headCy - headR * 0.6}
                  Q ${0},${headCy - headR * 1.05} ${headR * 0.9},${headCy - headR * 0.6}`}
              fill="none"
              stroke={rimColor}
              strokeWidth={1.2}
            />
          </g>

          {/* ---------------------------------------------------------- */}
          {/*  LEFT ARM — hand on mic stand pole                           */}
          {/* ---------------------------------------------------------- */}
          {/* Upper arm */}
          <path
            d={`M ${-shoulderW / 2 + 2},${-torsoH / 2 + 9}
                C ${-shoulderW / 2 - 4},${-torsoH / 2 + 18} ${-shoulderW / 2 - 10},${-8} ${-shoulderW / 2 - 12},${4}
                L ${-shoulderW / 2 - 7},${6}
                C ${-shoulderW / 2 - 4},${-4} ${-shoulderW / 2 + 2},${-torsoH / 2 + 20} ${-shoulderW / 2 + 7},${-torsoH / 2 + 11}`}
            fill={silhouetteColor}
          />
          {/* Forearm reaching for mic stand */}
          <path
            d={`M ${-shoulderW / 2 - 12},${4}
                C ${-shoulderW / 2 - 18},${10} ${-shoulderW / 2 - 26},${14} ${-shoulderW / 2 - 30},${18}
                L ${-shoulderW / 2 - 26},${22}
                C ${-shoulderW / 2 - 22},${18} ${-shoulderW / 2 - 14},${10} ${-shoulderW / 2 - 8},${6}`}
            fill={silhouetteColor}
          />
          {/* Hand on pole — wraps around */}
          <ellipse
            cx={-shoulderW / 2 - 30}
            cy={20}
            rx={5}
            ry={4}
            fill={silhouetteColor}
          />
          {/* Knuckle suggestion */}
          <path
            d={`M ${-shoulderW / 2 - 33},${18}
                Q ${-shoulderW / 2 - 30},${16} ${-shoulderW / 2 - 27},${18}`}
            fill="none"
            stroke={silhouetteDark}
            strokeWidth={0.5}
          />
          {/* Left arm rim light */}
          <path
            d={`M ${-shoulderW / 2 - 2},${-torsoH / 2 + 14}
                C ${-shoulderW / 2 - 8},${-torsoH / 2 + 20} ${-shoulderW / 2 - 12},${-4} ${-shoulderW / 2 - 14},${5}`}
            fill="none"
            stroke={rimColorSoft}
            strokeWidth={0.8}
          />

          {/* ---------------------------------------------------------- */}
          {/*  RIGHT ARM — gesturing / holding lyrics (animated)           */}
          {/* ---------------------------------------------------------- */}
          <g
            transform={`rotate(${gestureAngle * 0.25}, ${shoulderW / 2}, ${-torsoH / 2 + 9})`}
          >
            {/* Upper arm — hangs slightly forward */}
            <path
              d={`M ${shoulderW / 2 - 2},${-torsoH / 2 + 9}
                  C ${shoulderW / 2 + 5},${-torsoH / 2 + 17} ${shoulderW / 2 + 9},${-2} ${shoulderW / 2 + 8},${10}
                  L ${shoulderW / 2 + 3},${12}
                  C ${shoulderW / 2 + 1},${0} ${shoulderW / 2 - 3},${-torsoH / 2 + 19} ${shoulderW / 2 - 7},${-torsoH / 2 + 11}`}
              fill={silhouetteColor}
            />
            {/* Forearm gesture */}
            <g transform={`rotate(${gestureAngle * 0.5}, ${shoulderW / 2 + 8}, ${10})`}>
              <path
                d={`M ${shoulderW / 2 + 8},${10}
                    C ${shoulderW / 2 + 12},${16} ${shoulderW / 2 + 14},${22} ${shoulderW / 2 + 13},${28}
                    L ${shoulderW / 2 + 9},${27}
                    C ${shoulderW / 2 + 9},${22} ${shoulderW / 2 + 7},${16} ${shoulderW / 2 + 3},${12}`}
                fill={silhouetteColor}
              />
              {/* Open hand at end (slightly cupped, gesturing) */}
              <ellipse
                cx={shoulderW / 2 + 11}
                cy={29}
                rx={4}
                ry={3.2}
                fill={silhouetteColor}
              />
              {/* Finger suggestion */}
              <path
                d={`M ${shoulderW / 2 + 13},${27}
                    L ${shoulderW / 2 + 15},${24}`}
                stroke={silhouetteColor}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            </g>
            {/* Right arm rim light */}
            <path
              d={`M ${shoulderW / 2 + 2},${-torsoH / 2 + 13}
                  C ${shoulderW / 2 + 7},${-torsoH / 2 + 19} ${shoulderW / 2 + 11},${4} ${shoulderW / 2 + 10},${10}`}
              fill="none"
              stroke={rimColorSoft}
              strokeWidth={0.8}
            />
          </g>
        </g>
      </svg>
    </div>
  );
};

export default MicStandSilhouette;
