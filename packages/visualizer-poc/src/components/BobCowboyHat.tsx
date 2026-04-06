/**
 * BobCowboyHat — Bob Weir iconic cowboy-hat portrait silhouette, A+++ quality.
 *
 * The 80s/90s era Bobby: head-and-shoulders silhouette dominated by his signature
 * wide-brim Stetson — front/back curl, tall pinched crown, hat band with concho.
 * Profile turned slightly forward-right: hair cascading from under the brim,
 * beard suggestion, neck and upper shoulders. A vintage SM58 microphone on a
 * stand stands in front, and a warm amber follow-spot pours down from above.
 *
 * Distinct from BobWeir.tsx (which is a full-body guitarist with ES-335) — this
 * one is a portrait piece, the kind of silhouette frame from a 1989 Long Beach
 * or 1990 Cap Center bootleg.
 *
 * Audio reactivity:
 *   vocalPresence — drives overall opacity (Bobby appears when he's at the mic)
 *   vocalEnergy — pulses spotlight intensity and rim glow
 *   energy      — gentle scale + brim halo
 *   beatDecay   — pulses spotlight core, mic glow ring
 *   chromaHue   — tints warm amber spotlight wash (+/- 18deg)
 *   tempoFactor — sways head tilt subtly to the meter
 *
 * Continuous rendering — rotation engine controls visibility externally.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Color utility — HSL to rgba                                        */
/* ------------------------------------------------------------------ */

function hslToRgba(h: number, s: number, l: number, a: number): string {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (hh < 60) {
    r = c;
    g = x;
  } else if (hh < 120) {
    r = x;
    g = c;
  } else if (hh < 180) {
    g = c;
    b = x;
  } else if (hh < 240) {
    g = x;
    b = c;
  } else if (hh < 300) {
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

export const BobCowboyHat: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const {
    energy,
    vocalEnergy,
    vocalPresence,
    beatDecay,
    chromaHue: chromaHueDeg,
    musicalTime,
  } = snap;

  /* ---- Visibility gating: vocalPresence is the master gate ---- */
  const presenceGate = interpolate(vocalPresence, [0.04, 0.18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const energyAssist = interpolate(energy, [0.05, 0.22], [0, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = presenceGate * (0.62 + energyAssist);
  if (opacity < 0.01) return null;

  /* ---- Warm amber base hue, chroma-shifted ---- */
  const baseHue = 32; // warm amber / Stetson tan
  const hueShift = (chromaHueDeg / 360) * 36 - 18;
  const hue = baseHue + hueShift;

  /* ---- Portrait position: right-of-center, upper third ---- */
  const figureX = width * 0.62;
  const figureBaseY = height * 0.46;
  const scale = Math.min(width, height) / 1080;

  /* ---- Subtle head sway on tempo ---- */
  const swayPhase = musicalTime * Math.PI * 2 * 0.5 * tempoFactor;
  const headTilt =
    Math.sin(swayPhase) * 1.6 +
    Math.sin(swayPhase * 0.5 + 1.2) * 0.8 +
    Math.sin(frame * 0.018) * 0.6;

  /* ---- Portrait sway (very gentle horizontal drift) ---- */
  const portraitSway =
    Math.sin(swayPhase * 0.5) * 1.4 + Math.sin(frame * 0.012) * 0.6;

  /* ---- Spotlight pulse: vocal-energy driven, beat-decay accent ---- */
  const spotlightBase = interpolate(vocalEnergy, [0.04, 0.35], [0.32, 0.62], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const spotlightPulse = spotlightBase + beatDecay * 0.18;
  const spotlightRadius = interpolate(vocalEnergy, [0.05, 0.4], [110, 175], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ---- Rim light intensity ---- */
  const rimIntensity =
    interpolate(vocalPresence, [0.1, 0.4], [0.2, 0.45], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) +
    beatDecay * 0.18;

  /* ---- Flicker (warm tungsten follow spot) ---- */
  const flicker =
    0.93 +
    Math.sin(frame * 0.13 + 1.1) * 0.035 +
    Math.sin(frame * 0.31 + 2.7) * 0.022;

  /* ---- Breathing pulse (very subtle) ---- */
  const breathe =
    1.0 + Math.sin(frame * 0.05) * 0.006 + beatDecay * 0.012;

  /* ---- Mic glow on vocal energy ---- */
  const micGlow = interpolate(vocalEnergy, [0.04, 0.35], [0.18, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ---- Color palette ---- */
  const silhouetteColor = hslToRgba(hue, 0.32, 0.06, 0.93);
  const silhouetteDark = hslToRgba(hue, 0.28, 0.04, 0.96);
  const silhouetteFace = hslToRgba(hue, 0.34, 0.07, 0.95);
  const hatColor = hslToRgba(hue, 0.22, 0.05, 0.97);
  const hatHighlight = hslToRgba(hue, 0.45, 0.18, 0.7);
  const hatBandColor = hslToRgba(hue + 6, 0.55, 0.22, 0.85);
  const hatConchoColor = hslToRgba(hue + 8, 0.7, 0.55, 0.75);
  const hairColor = hslToRgba(hue - 4, 0.3, 0.06, 0.92);
  const beardColor = hslToRgba(hue - 4, 0.28, 0.05, 0.85);

  const rimColor = hslToRgba(hue, 0.78, 0.66, rimIntensity);
  const rimColorSoft = hslToRgba(hue, 0.7, 0.6, rimIntensity * 0.55);
  const rimColorWarm = hslToRgba(hue + 6, 0.85, 0.7, rimIntensity * 0.85);

  const spotCoreColor = hslToRgba(hue, 0.52, 0.86, spotlightPulse * 0.5);
  const spotMidColor = hslToRgba(hue, 0.55, 0.65, spotlightPulse * 0.22);
  const spotEdgeColor = hslToRgba(hue, 0.5, 0.5, 0);

  const glowColor = hslToRgba(hue, 0.6, 0.55, spotlightPulse * 0.18);
  const dustColor = hslToRgba(hue, 0.45, 0.78, 0.16 + beatDecay * 0.1);

  const micBodyColor = hslToRgba(hue, 0.18, 0.08, 0.92);
  const micGrilleColor = hslToRgba(hue, 0.22, 0.14, 0.88);
  const micGrilleRim = hslToRgba(hue, 0.55, 0.55, micGlow);
  const micStandColor = hslToRgba(hue, 0.18, 0.05, 0.9);

  /* ---- Dust motes drifting through spotlight beam ---- */
  const dustMotes: Array<{ x: number; y: number; r: number; opacity: number }> = [];
  for (let i = 0; i < 22; i++) {
    const seed = i * 137.508; // golden angle
    const phase = seed + frame * (0.009 + i * 0.0018);
    const driftX = Math.sin(phase) * (28 + i * 2.5);
    const driftY = ((Math.cos(phase * 0.7 + i) * 130) - 60 + i * 11) % 240 - 100;
    const moteR = 0.55 + Math.sin(seed * 3.7) * 0.45;
    const distFalloff = interpolate(
      Math.abs(driftX),
      [0, spotlightRadius * 0.45],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const moteOpacity = (0.13 + Math.sin(phase * 1.3) * 0.08) * distFalloff;
    dustMotes.push({ x: driftX, y: driftY, r: moteR, opacity: moteOpacity });
  }

  /* ---- Unique gradient IDs to avoid Remotion frame collisions ---- */
  const idTag = `bch-${frame % 1000}`;
  const spotGradId = `${idTag}-spot`;
  const coneGradId = `${idTag}-cone`;
  const hatGradId = `${idTag}-hat`;
  const glowGradId = `${idTag}-glow`;
  const micGradId = `${idTag}-mic`;

  /* ================================================================ */
  /*  SVG layout — viewBox local coords (origin at chest)             */
  /*  Head sits ~ y = -90, hat brim ~ y = -120                         */
  /* ================================================================ */
  const headR = 24;
  const headCy = -82;
  const brimY = headCy - headR * 0.45;
  const brimWidth = 78;
  const brimHeight = 11;
  const crownH = 38;

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
          <radialGradient id={spotGradId} cx="50%" cy="28%" r="55%">
            <stop offset="0%" stopColor={spotCoreColor} />
            <stop offset="42%" stopColor={spotMidColor} />
            <stop offset="100%" stopColor={spotEdgeColor} />
          </radialGradient>

          {/* Volumetric cone */}
          <linearGradient id={coneGradId} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop
              offset="0%"
              stopColor={hslToRgba(hue, 0.55, 0.85, spotlightPulse * 0.42)}
            />
            <stop
              offset="35%"
              stopColor={hslToRgba(hue, 0.55, 0.7, spotlightPulse * 0.18)}
            />
            <stop
              offset="100%"
              stopColor={hslToRgba(hue, 0.5, 0.5, 0)}
            />
          </linearGradient>

          {/* Hat 3D shading — top to bottom darken */}
          <linearGradient id={hatGradId} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={hslToRgba(hue, 0.32, 0.11, 0.96)} />
            <stop offset="55%" stopColor={hslToRgba(hue, 0.25, 0.06, 0.97)} />
            <stop offset="100%" stopColor={hslToRgba(hue, 0.2, 0.03, 0.98)} />
          </linearGradient>

          {/* Soft warm glow behind portrait */}
          <radialGradient id={glowGradId} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={glowColor} />
            <stop offset="60%" stopColor={hslToRgba(hue, 0.6, 0.4, spotlightPulse * 0.07)} />
            <stop offset="100%" stopColor={hslToRgba(hue, 0.5, 0.3, 0)} />
          </radialGradient>

          {/* Mic grille glow */}
          <radialGradient id={micGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={hslToRgba(hue + 4, 0.6, 0.4, micGlow * 0.6)} />
            <stop offset="100%" stopColor={hslToRgba(hue + 4, 0.5, 0.2, 0)} />
          </radialGradient>
        </defs>

        {/* ============================================================ */}
        {/*  VOLUMETRIC SPOTLIGHT CONE from above                          */}
        {/* ============================================================ */}
        <g transform={`translate(${figureX + portraitSway}, ${figureBaseY})`}>
          <polygon
            points={`${-14 * scale},${-280 * scale} ${14 * scale},${-280 * scale} ${spotlightRadius * scale * 0.95},${100 * scale * breathe} ${-spotlightRadius * scale * 0.95},${100 * scale * breathe}`}
            fill={`url(#${coneGradId})`}
            style={{ filter: `blur(${14 * scale}px)` }}
          />
          {/* Inner brighter shaft */}
          <polygon
            points={`${-7 * scale},${-280 * scale} ${7 * scale},${-280 * scale} ${spotlightRadius * 0.4 * scale},${70 * scale * breathe} ${-spotlightRadius * 0.4 * scale},${70 * scale * breathe}`}
            fill={hslToRgba(hue, 0.5, 0.82, spotlightPulse * 0.14)}
            style={{ filter: `blur(${9 * scale}px)` }}
          />
        </g>

        {/* ============================================================ */}
        {/*  AMBIENT GLOW WASH behind portrait                             */}
        {/* ============================================================ */}
        <ellipse
          cx={figureX + portraitSway}
          cy={figureBaseY - 30 * scale}
          rx={spotlightRadius * 1.35 * scale}
          ry={spotlightRadius * 1.55 * scale}
          fill={`url(#${glowGradId})`}
          style={{ filter: `blur(${24 * scale}px)` }}
        />

        {/* ============================================================ */}
        {/*  SPOTLIGHT FOCAL OVAL                                          */}
        {/* ============================================================ */}
        <ellipse
          cx={figureX + portraitSway}
          cy={figureBaseY - 60 * scale}
          rx={spotlightRadius * 1.0 * scale}
          ry={spotlightRadius * 1.15 * scale}
          fill={`url(#${spotGradId})`}
          style={{ filter: `blur(${18 * scale}px)` }}
        />

        {/* ============================================================ */}
        {/*  DUST MOTES                                                    */}
        {/* ============================================================ */}
        <g transform={`translate(${figureX + portraitSway}, ${figureBaseY - 40 * scale})`}>
          {dustMotes.map((m, i) => (
            <circle
              key={`bch-dust-${i}`}
              cx={m.x * scale}
              cy={m.y * scale}
              r={m.r * scale}
              fill={dustColor}
              opacity={m.opacity}
            />
          ))}
        </g>

        {/* ============================================================ */}
        {/*  PORTRAIT GROUP                                                */}
        {/* ============================================================ */}
        <g
          transform={`translate(${figureX + portraitSway}, ${figureBaseY}) scale(${breathe * scale})`}
        >
          {/* -------------------------------------------------------- */}
          {/*  UPPER SHOULDERS (head and shoulders only)                */}
          {/* -------------------------------------------------------- */}
          {/* Shoulder line + neck base */}
          <path
            d={`M -82,40
                C -78,12 -52,-8 -34,-22
                L -10,-32
                L 10,-32
                L 34,-22
                C 52,-8 78,12 82,40
                L 82,80
                L -82,80 Z`}
            fill={silhouetteColor}
          />
          {/* Subtle vest collar V-neck hint */}
          <path
            d={`M -10,-30
                L -2,12
                L 0,12
                L 2,12
                L 10,-30 Z`}
            fill={silhouetteDark}
          />
          {/* Shoulder rim light — left edge */}
          <path
            d={`M -82,40
                C -78,12 -52,-8 -34,-22`}
            fill="none"
            stroke={rimColor}
            strokeWidth={1.4}
          />
          {/* Shoulder rim light — right edge */}
          <path
            d={`M 82,40
                C 78,12 52,-8 34,-22`}
            fill="none"
            stroke={rimColor}
            strokeWidth={1.4}
          />
          {/* Lower shoulder soft rim (warm) */}
          <line
            x1={-78}
            y1={56}
            x2={-44}
            y2={36}
            stroke={rimColorSoft}
            strokeWidth={0.8}
          />
          <line
            x1={78}
            y1={56}
            x2={44}
            y2={36}
            stroke={rimColorSoft}
            strokeWidth={0.8}
          />

          {/* -------------------------------------------------------- */}
          {/*  NECK                                                     */}
          {/* -------------------------------------------------------- */}
          <path
            d={`M -11,-32
                Q -10,-46 -9,-58
                L 9,-58
                Q 10,-46 11,-32 Z`}
            fill={silhouetteColor}
          />
          {/* Neck rim light (right side, catches spotlight) */}
          <line
            x1={11}
            y1={-32}
            x2={9}
            y2={-58}
            stroke={rimColorWarm}
            strokeWidth={1.0}
          />

          {/* -------------------------------------------------------- */}
          {/*  HEAD + HAT GROUP — rotates on subtle head tilt           */}
          {/* -------------------------------------------------------- */}
          <g transform={`rotate(${headTilt}, 0, ${headCy + 4})`}>
            {/* ---- HAIR — flowing from under brim, sides + back ---- */}
            <path
              d={`M -22,${headCy + 6}
                  C -28,${headCy + 14} -28,${headCy + 26} -22,${headCy + 34}
                  L -16,${headCy + 36}
                  C -20,${headCy + 26} -20,${headCy + 14} -18,${headCy + 6} Z`}
              fill={hairColor}
            />
            <path
              d={`M 22,${headCy + 6}
                  C 28,${headCy + 14} 28,${headCy + 26} 22,${headCy + 34}
                  L 16,${headCy + 36}
                  C 20,${headCy + 26} 20,${headCy + 14} 18,${headCy + 6} Z`}
              fill={hairColor}
            />
            {/* Back hair tuft visible behind shoulder */}
            <ellipse
              cx={-2}
              cy={headCy + 28}
              rx={20}
              ry={9}
              fill={hairColor}
            />

            {/* ---- HEAD/FACE PROFILE (slightly forward-right) ---- */}
            <path
              d={`M -16,${headCy + 6}
                  C -19,${headCy - 2} -18,${headCy - 12} -10,${headCy - 16}
                  C -2,${headCy - 19} 8,${headCy - 18} 14,${headCy - 12}
                  C 18,${headCy - 6} 19,${headCy + 2} 18,${headCy + 8}
                  C 17,${headCy + 14} 14,${headCy + 18} 10,${headCy + 20}
                  L 6,${headCy + 22}
                  C 2,${headCy + 24} -2,${headCy + 24} -6,${headCy + 22}
                  C -12,${headCy + 18} -16,${headCy + 14} -16,${headCy + 6} Z`}
              fill={silhouetteFace}
            />

            {/* Subtle nose bridge hint (right profile) */}
            <path
              d={`M 17,${headCy + 2}
                  Q 20,${headCy + 4} 19,${headCy + 7}
                  Q 17,${headCy + 9} 16,${headCy + 8} Z`}
              fill={silhouetteDark}
            />

            {/* Beard suggestion — soft jawline darkening */}
            <path
              d={`M -12,${headCy + 16}
                  C -8,${headCy + 22} 8,${headCy + 23} 12,${headCy + 18}
                  L 10,${headCy + 24}
                  C 4,${headCy + 27} -4,${headCy + 27} -10,${headCy + 24} Z`}
              fill={beardColor}
            />

            {/* Face rim light — front edge catches spotlight */}
            <path
              d={`M 14,${headCy - 12}
                  C 18,${headCy - 6} 19,${headCy + 2} 18,${headCy + 8}
                  C 17,${headCy + 14} 14,${headCy + 18} 10,${headCy + 20}`}
              fill="none"
              stroke={rimColorWarm}
              strokeWidth={1.2}
            />
            {/* Cheek highlight glint */}
            <ellipse
              cx={13}
              cy={headCy + 8}
              rx={1.6}
              ry={2.4}
              fill={hslToRgba(hue + 8, 0.6, 0.55, rimIntensity * 0.5)}
            />

            {/* ============================================== */}
            {/*  THE ICONIC COWBOY HAT                          */}
            {/* ============================================== */}

            {/* ---- BRIM (back layer) — wide ellipse ---- */}
            <ellipse
              cx={-1}
              cy={brimY}
              rx={brimWidth / 2}
              ry={brimHeight}
              fill={`url(#${hatGradId})`}
            />

            {/* ---- BRIM curl — front edge sweeps up ---- */}
            <path
              d={`M ${-brimWidth / 2 + 4},${brimY + 1}
                  Q ${-brimWidth / 2 + 12},${brimY + brimHeight + 4} ${-brimWidth / 2 + 22},${brimY + brimHeight + 5}
                  L ${brimWidth / 2 - 22},${brimY + brimHeight + 5}
                  Q ${brimWidth / 2 - 12},${brimY + brimHeight + 4} ${brimWidth / 2 - 4},${brimY + 1}
                  Q ${brimWidth / 2 - 14},${brimY - 2} 0,${brimY - 1}
                  Q ${-brimWidth / 2 + 14},${brimY - 2} ${-brimWidth / 2 + 4},${brimY + 1} Z`}
              fill={hatColor}
            />

            {/* ---- BRIM curl — left side sweeps up (Stetson curl) ---- */}
            <path
              d={`M ${-brimWidth / 2},${brimY}
                  Q ${-brimWidth / 2 - 4},${brimY - 6} ${-brimWidth / 2 + 6},${brimY - 4}
                  L ${-brimWidth / 2 + 10},${brimY + 1}
                  L ${-brimWidth / 2 + 2},${brimY + 3} Z`}
              fill={hatColor}
            />

            {/* ---- BRIM curl — right side sweeps up ---- */}
            <path
              d={`M ${brimWidth / 2},${brimY}
                  Q ${brimWidth / 2 + 4},${brimY - 6} ${brimWidth / 2 - 6},${brimY - 4}
                  L ${brimWidth / 2 - 10},${brimY + 1}
                  L ${brimWidth / 2 - 2},${brimY + 3} Z`}
              fill={hatColor}
            />

            {/* ---- CROWN — tall, with classic pinched top crease ---- */}
            <path
              d={`M ${-22},${brimY - 1}
                  C ${-26},${brimY - crownH * 0.4} ${-22},${brimY - crownH * 0.85} ${-16},${brimY - crownH}
                  Q ${-10},${brimY - crownH - 3} ${-6},${brimY - crownH + 1}
                  Q ${-2},${brimY - crownH + 4} 0,${brimY - crownH + 1}
                  Q ${2},${brimY - crownH + 4} ${6},${brimY - crownH + 1}
                  Q ${10},${brimY - crownH - 3} ${16},${brimY - crownH}
                  C ${22},${brimY - crownH * 0.85} ${26},${brimY - crownH * 0.4} ${22},${brimY - 1}
                  Z`}
              fill={`url(#${hatGradId})`}
            />

            {/* ---- Crown center crease — vertical pinch line ---- */}
            <path
              d={`M -1,${brimY - crownH + 2}
                  Q 0,${brimY - crownH * 0.55} -1,${brimY - 4}`}
              fill="none"
              stroke={hslToRgba(hue, 0.18, 0.02, 0.65)}
              strokeWidth={1}
            />
            {/* Side pinch creases */}
            <path
              d={`M -8,${brimY - crownH + 2}
                  Q -10,${brimY - crownH * 0.6} -9,${brimY - 4}`}
              fill="none"
              stroke={hslToRgba(hue, 0.18, 0.02, 0.45)}
              strokeWidth={0.7}
            />
            <path
              d={`M 8,${brimY - crownH + 2}
                  Q 10,${brimY - crownH * 0.6} 9,${brimY - 4}`}
              fill="none"
              stroke={hslToRgba(hue, 0.18, 0.02, 0.45)}
              strokeWidth={0.7}
            />

            {/* ---- HAT BAND ---- */}
            <path
              d={`M -22,${brimY - 4}
                  C -16,${brimY - 6} 16,${brimY - 6} 22,${brimY - 4}
                  L 22,${brimY - 1}
                  C 16,${brimY - 3} -16,${brimY - 3} -22,${brimY - 1} Z`}
              fill={hatBandColor}
            />

            {/* Hat band concho (decorative) */}
            <circle
              cx={-12}
              cy={brimY - 3}
              r={1.6}
              fill={hatConchoColor}
            />
            <circle
              cx={-12}
              cy={brimY - 3}
              r={0.6}
              fill={hslToRgba(hue + 12, 0.85, 0.75, rimIntensity)}
            />

            {/* Crown rim light — top catches spotlight */}
            <path
              d={`M -16,${brimY - crownH + 1}
                  Q -10,${brimY - crownH - 3} -6,${brimY - crownH + 1}
                  Q -2,${brimY - crownH + 4} 0,${brimY - crownH + 1}
                  Q 2,${brimY - crownH + 4} 6,${brimY - crownH + 1}
                  Q 10,${brimY - crownH - 3} 16,${brimY - crownH}`}
              fill="none"
              stroke={rimColorWarm}
              strokeWidth={1.4}
            />

            {/* Crown side rim — left edge */}
            <path
              d={`M -22,${brimY - 1}
                  C -26,${brimY - crownH * 0.4} -22,${brimY - crownH * 0.85} -16,${brimY - crownH + 1}`}
              fill="none"
              stroke={rimColorSoft}
              strokeWidth={0.9}
            />
            {/* Crown side rim — right edge */}
            <path
              d={`M 22,${brimY - 1}
                  C 26,${brimY - crownH * 0.4} 22,${brimY - crownH * 0.85} 16,${brimY - crownH}`}
              fill="none"
              stroke={rimColor}
              strokeWidth={1.1}
            />

            {/* Brim front edge highlight */}
            <path
              d={`M ${-brimWidth / 2 + 16},${brimY + brimHeight + 4}
                  Q 0,${brimY + brimHeight + 6} ${brimWidth / 2 - 16},${brimY + brimHeight + 4}`}
              fill="none"
              stroke={hatHighlight}
              strokeWidth={1.2}
            />
            {/* Brim front rim (warm spotlight catch) */}
            <path
              d={`M ${-brimWidth / 2 + 14},${brimY + brimHeight + 5}
                  Q 0,${brimY + brimHeight + 7} ${brimWidth / 2 - 14},${brimY + brimHeight + 5}`}
              fill="none"
              stroke={rimColorWarm}
              strokeWidth={0.9}
              strokeDasharray="6,9"
            />

            {/* Hat brim halo — extra glow on energy */}
            <ellipse
              cx={0}
              cy={brimY - 2}
              rx={brimWidth / 2 + 4}
              ry={brimHeight + 4}
              fill="none"
              stroke={hslToRgba(hue + 4, 0.7, 0.6, rimIntensity * 0.35 + energy * 0.15)}
              strokeWidth={0.7}
              strokeDasharray="3,8"
            />
          </g>

          {/* -------------------------------------------------------- */}
          {/*  MICROPHONE in front of Bobby                             */}
          {/* -------------------------------------------------------- */}
          {/* Stand pole (vertical) */}
          <line
            x1={-30}
            y1={20}
            x2={-30}
            y2={88}
            stroke={micStandColor}
            strokeWidth={1.4}
          />
          {/* Stand boom angled up to mic */}
          <line
            x1={-30}
            y1={20}
            x2={-12}
            y2={-2}
            stroke={micStandColor}
            strokeWidth={1.4}
          />
          {/* Boom clutch */}
          <circle cx={-30} cy={20} r={1.4} fill={micStandColor} />

          {/* Mic body (cylinder) */}
          <rect
            x={-13}
            y={-4}
            width={5}
            height={11}
            rx={1.2}
            fill={micBodyColor}
          />
          {/* Mic body rim line */}
          <line
            x1={-13}
            y1={6}
            x2={-8}
            y2={6}
            stroke={hslToRgba(hue, 0.4, 0.18, 0.7)}
            strokeWidth={0.5}
          />

          {/* Mic grille (ball) */}
          <ellipse
            cx={-10.5}
            cy={-9}
            rx={4.2}
            ry={4.6}
            fill={micGrilleColor}
          />
          {/* Grille mesh hint — concentric arcs */}
          <path
            d={`M -14,-9 Q -10.5,-13 -7,-9`}
            fill="none"
            stroke={hslToRgba(hue, 0.4, 0.25, 0.55)}
            strokeWidth={0.4}
          />
          <path
            d={`M -14,-9 Q -10.5,-5 -7,-9`}
            fill="none"
            stroke={hslToRgba(hue, 0.4, 0.25, 0.55)}
            strokeWidth={0.4}
          />
          <line
            x1={-10.5}
            y1={-13.6}
            x2={-10.5}
            y2={-4.4}
            stroke={hslToRgba(hue, 0.4, 0.25, 0.45)}
            strokeWidth={0.35}
          />

          {/* Mic grille rim glow — pulses with vocal energy */}
          <ellipse
            cx={-10.5}
            cy={-9}
            rx={5.4}
            ry={5.8}
            fill={`url(#${micGradId})`}
          />
          <ellipse
            cx={-10.5}
            cy={-9}
            rx={4.6}
            ry={5.0}
            fill="none"
            stroke={micGrilleRim}
            strokeWidth={0.9}
          />

          {/* Mic stand rim light */}
          <line
            x1={-29}
            y1={28}
            x2={-29}
            y2={84}
            stroke={rimColorSoft}
            strokeWidth={0.5}
          />
        </g>
      </svg>
    </div>
  );
};

export default BobCowboyHat;
