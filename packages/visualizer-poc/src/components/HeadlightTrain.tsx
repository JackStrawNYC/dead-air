/**
 * HeadlightTrain — "I wish I was a headlight on a northbound train."
 *
 * THE iconic Grateful Dead lyric from "I Know You Rider." A single piercing
 * headlight beam barreling toward the viewer down a pair of converging rails,
 * dragging a steam locomotive silhouette out of the fog. Built for hero use:
 *
 *  - Two parallel rails in extreme one-point perspective, converging at the
 *    vanishing point in the upper-center of the frame.
 *  - 24 wooden ties/sleepers crossing the rails. Tie spacing is computed in
 *    perspective space (closer ties further apart, distant ties compressed).
 *  - A gravel/ballast bed feathered around and between the rails.
 *  - A single bright headlight at the vanishing point, rendered in three
 *    layers: an enormous gaussian-blurred atmospheric halo, a mid-body cone,
 *    and a bright white-hot inner core. Color biased toward warm sodium
 *    yellow-white, slightly tinted by chromaHue.
 *  - A volumetric beam: a wide cone of light extending from the headlight
 *    forward, with two soft gradient layers approximating volumetric scatter,
 *    plus 14 dust motes floating inside the beam.
 *  - The light spills onto the rails near the vanishing point (illuminated
 *    rail strokes that fade with distance), and onto the ground around the
 *    tracks (a warm radial pool).
 *  - A dark steam locomotive silhouette emerges from the glow: smokestack,
 *    boiler, cab outline, cowcatcher hint — mostly hidden, just a shape.
 *  - A drifting dark plume of smoke rising from the smokestack, plus 4 small
 *    steam puffs along the sides of the boiler. Plume sways with bass.
 *  - A dark night sky with 28 procedurally-placed stars and a faint moon glow.
 *  - Foggy/dusty air around the entire scene to make the beam read volumetric.
 *  - The headlight slowly grows larger over a ~30s approach cycle, then
 *    resets — the train is approaching, never quite arriving.
 *
 * Audio reactivity:
 *  - energy → headlight brightness, beam intensity, halo size
 *  - beatDecay → beam pulses (subtle width + brightness throbbing)
 *  - bass → smoke/steam intensity and plume sway
 *  - onsetEnvelope → flashes the headlight white-hot
 *  - chromaHue → tints the beam color slightly toward the dominant pitch
 *  - tempoFactor → speeds/slows the approach cycle
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

interface Props {
  frames: EnhancedFrameData[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SKY_COLOR = "#06080F";
const GROUND_COLOR = "#0E0B08";
const RAIL_COLOR = "#5C5852";
const RAIL_LIT_COLOR = "#FFE9B0";
const TIE_COLOR = "#3A2A1C";
const TIE_DARK_COLOR = "#1F1610";
const BALLAST_COLOR = "#1B1714";
const HEADLIGHT_CORE = "#FFFCEC";
const HEADLIGHT_WARM = "#FFE89E";
const HEADLIGHT_HALO = "#FFD978";
const TRAIN_SILHOUETTE = "#0A0806";
const SMOKE_COLOR = "#1A1612";
const STAR_COLOR = "#E6E2D6";

const TIE_COUNT = 24;
const STAR_COUNT = 28;
const DUST_MOTE_COUNT = 14;
const STEAM_PUFF_COUNT = 4;

/* ------------------------------------------------------------------ */
/*  Deterministic pseudo-random                                        */
/* ------------------------------------------------------------------ */

function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------ */
/*  Perspective math                                                   */
/* ------------------------------------------------------------------ */

/**
 * Map a "depth" parameter t in [0, 1] to a perspective-correct y position
 * between the vanishing point (t=0) and the foreground (t=1). Uses a
 * hyperbolic mapping so closer ties spread out and distant ties compress.
 */
function depthToY(t: number, vy: number, fy: number): number {
  // Hyperbolic perspective: small t stays near vy, large t accelerates to fy.
  // y = vy + (fy - vy) * (t^2.4) gives that nice perspective compression.
  return vy + (fy - vy) * Math.pow(t, 2.4);
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export const HeadlightTrain: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  /* ---- Audio reactive values ---- */
  const energy = snap.energy;
  const beatDecay = snap.beatDecay;
  const bass = snap.bass;
  const chromaHue = snap.chromaHue;
  const onsetEnv = snap.onsetEnvelope;

  /* ---- Approach cycle ---- */
  // ~30s approach cycle scaled by tempo. Faster songs = faster approach.
  const approachPeriod = 900 / Math.max(0.65, tempoFactor);
  const tApproach = (frame % approachPeriod) / approachPeriod;
  // Approach grows slowly then accelerates near the end (ease-in cubic).
  const approach = Math.pow(tApproach, 1.6);

  /* ---- Geometry: vanishing point + foreground ---- */
  const vpX = width * 0.5;
  // Vanishing point sits in the upper-middle area.
  const vpY = height * 0.48;
  const fgY = height * 1.02;
  const horizonY = height * 0.5;

  // Rail spread at the foreground (closer = wider apart).
  const railSpreadFg = width * 0.62;
  // Rail spread at the vanishing point (just barely separated).
  const railSpreadVp = width * 0.012;

  // X coordinate of each rail at depth t in [0,1].
  const railX = (t: number, side: -1 | 1): number => {
    const spread = railSpreadVp + (railSpreadFg - railSpreadVp) * Math.pow(t, 1.6);
    return vpX + side * spread * 0.5;
  };

  // Tie half-width at depth t.
  const tieHalf = (t: number): number => {
    const spread = railSpreadVp + (railSpreadFg - railSpreadVp) * Math.pow(t, 1.6);
    return spread * 0.78;
  };

  // Tie thickness in pixels at depth t.
  const tieThick = (t: number): number => Math.max(1.2, 2 + Math.pow(t, 1.8) * 18);

  /* ---- Headlight scaling ---- */
  // Base size grows with the approach cycle. Train never fully arrives.
  const headlightBaseR = interpolate(
    approach,
    [0, 1],
    [width * 0.012, width * 0.052],
  );
  // Energy adds extra scale.
  const headlightR = headlightBaseR * (0.85 + energy * 0.6);
  // Onset envelope flashes a brief white-hot bloom.
  const onsetFlash = interpolate(onsetEnv, [0, 1], [0, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Headlight position — anchored at the vanishing point but lifts up slightly
  // as the train approaches (perspective rise).
  const hlX = vpX;
  const hlY = vpY - 6 - approach * 14;

  /* ---- Beam cone ---- */
  // Beam extends from the headlight forward to the foreground.
  // Beam half-width at the foreground. Bigger as the train gets closer.
  const beamFgHalfWidth = interpolate(approach, [0, 1], [width * 0.18, width * 0.34]);
  const beamFgHalfWidthEnergized =
    beamFgHalfWidth * (0.9 + energy * 0.35) * (1 + beatDecay * 0.06);

  const beamLeftX = vpX - beamFgHalfWidthEnergized;
  const beamRightX = vpX + beamFgHalfWidthEnergized;
  const beamBottomY = height * 1.05;

  /* ---- Beam color (slightly chroma-tinted) ---- */
  // Map chromaHue (0..360) to a soft tint added on top of warm yellow-white.
  const tintHue = chromaHue;
  const tintSat = 22;
  const tintL = 86;
  const beamTint = `hsl(${tintHue.toFixed(0)}, ${tintSat}%, ${tintL}%)`;

  /* ---- Brightness intensities ---- */
  const haloOpacity = interpolate(energy, [0.02, 0.4], [0.45, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const beamOpacity =
    interpolate(energy, [0.02, 0.4], [0.18, 0.45], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) *
    (0.92 + beatDecay * 0.18) *
    (1 + onsetFlash * 0.55);
  const coreOpacity = Math.min(1, 0.85 + energy * 0.15 + onsetFlash * 0.4);

  /* ---- Smoke / steam intensity ---- */
  const smokeIntensity = interpolate(bass, [0.02, 0.4], [0.4, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const plumeSway = Math.sin(frame * 0.025 + bass * 6) * (8 + bass * 22);

  /* ---- Master opacity (always on — this is a hero overlay) ---- */
  const masterOpacity = 0.96;

  /* ---- Compute ties ---- */
  const ties: { y: number; halfW: number; thick: number; t: number }[] = [];
  for (let i = 0; i < TIE_COUNT; i++) {
    // Distribute t with bias toward foreground (more visible ties up close).
    const u = i / (TIE_COUNT - 1);
    const t = Math.pow(u, 0.85);
    const y = depthToY(t, vpY, fgY);
    ties.push({ y, halfW: tieHalf(t), thick: tieThick(t), t });
  }

  /* ---- Compute stars ---- */
  const stars: { x: number; y: number; r: number; flicker: number }[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const sx = rand(i * 1.7) * width;
    const sy = rand(i * 2.3 + 11) * horizonY * 0.92;
    const sr = 0.6 + rand(i * 3.1 + 5) * 1.8;
    // Twinkle phase.
    const flicker = 0.55 + 0.45 * Math.sin(frame * 0.04 + i * 1.7);
    stars.push({ x: sx, y: sy, r: sr, flicker });
  }

  /* ---- Compute dust motes inside the beam ---- */
  const dustMotes: { x: number; y: number; r: number; o: number }[] = [];
  for (let i = 0; i < DUST_MOTE_COUNT; i++) {
    // depth t along the beam
    const dT = ((i / DUST_MOTE_COUNT) + (frame * 0.0015) + rand(i * 5.1) * 0.3) % 1;
    const dY = depthToY(dT, hlY, beamBottomY);
    // beam half-width at this depth (linear from headlight to foreground)
    const dHalf =
      interpolate(dT, [0, 1], [headlightR * 1.1, beamFgHalfWidthEnergized]) *
      0.92;
    const dxOff = (rand(i * 7.7 + 3) - 0.5) * dHalf * 1.4;
    const dr = 1 + rand(i * 11.3) * 2.4 + dT * 2.2;
    const dOpac = interpolate(dT, [0, 0.15, 0.85, 1], [0, 0.85, 0.7, 0]) *
      (0.5 + energy * 0.6);
    dustMotes.push({ x: hlX + dxOff, y: dY, r: dr, o: dOpac });
  }

  /* ---- Train silhouette geometry ---- */
  // The train sits behind the headlight at the vanishing point. As approach
  // grows the silhouette enlarges with the headlight.
  const trainScale = 0.6 + approach * 1.4;
  const trainCx = hlX;
  const trainBaseY = hlY + headlightR * 0.8;
  const boilerW = headlightR * 4.6 * trainScale;
  const boilerH = headlightR * 2.2 * trainScale;
  const cabW = headlightR * 2.0 * trainScale;
  const cabH = headlightR * 2.4 * trainScale;
  const stackW = headlightR * 0.7 * trainScale;
  const stackH = headlightR * 1.6 * trainScale;

  /* ---- Smoke plume polyline ---- */
  // Plume drifts up from smokestack with bass-driven sway.
  const plumePts: { x: number; y: number; r: number; o: number }[] = [];
  const plumeBaseX = trainCx - boilerW * 0.18;
  const plumeBaseY = trainBaseY - boilerH * 0.5 - stackH;
  for (let i = 0; i < 9; i++) {
    const pT = i / 8;
    const px = plumeBaseX + Math.sin(pT * 3.1 + frame * 0.02) * (4 + pT * plumeSway * 0.5);
    const py = plumeBaseY - pT * (60 + smokeIntensity * 70) * trainScale;
    const pr = (4 + pT * 14) * trainScale * (0.7 + smokeIntensity * 0.55);
    const po = (1 - pT) * 0.7 * smokeIntensity;
    plumePts.push({ x: px, y: py, r: pr, o: po });
  }

  /* ---- Steam side puffs ---- */
  const steamPuffs: { x: number; y: number; r: number; o: number }[] = [];
  for (let i = 0; i < STEAM_PUFF_COUNT; i++) {
    const side = i < 2 ? -1 : 1;
    const driftPhase = (frame * 0.018 + i * 1.3) % 1;
    const sx =
      trainCx + side * (boilerW * 0.42 + driftPhase * 30 * trainScale);
    const sy =
      trainBaseY - boilerH * 0.1 - driftPhase * 36 * trainScale;
    const sr = (3 + driftPhase * 10) * trainScale * (0.6 + smokeIntensity * 0.6);
    const so = (1 - driftPhase) * 0.55 * smokeIntensity;
    steamPuffs.push({ x: sx, y: sy, r: sr, o: so });
  }

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
        viewBox={`0 0 ${width} ${height}`}
        style={{ opacity: masterOpacity, willChange: "opacity" }}
      >
        <defs>
          {/* Sky / horizon gradient */}
          <linearGradient id="ht-sky" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#03050B" />
            <stop offset="55%" stopColor="#0A0D17" />
            <stop offset="100%" stopColor="#181410" />
          </linearGradient>
          {/* Ground gradient — darker far, slightly warmer near */}
          <linearGradient id="ht-ground" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0A0805" />
            <stop offset="100%" stopColor="#1A130A" />
          </linearGradient>
          {/* Ballast pool — radial warm glow on the gravel under the headlight */}
          <radialGradient id="ht-ground-pool" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEADLIGHT_WARM} stopOpacity={0.32} />
            <stop offset="40%" stopColor={HEADLIGHT_HALO} stopOpacity={0.14} />
            <stop offset="100%" stopColor={HEADLIGHT_HALO} stopOpacity={0} />
          </radialGradient>
          {/* Volumetric beam outer (atmospheric) */}
          <linearGradient id="ht-beam-outer" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={HEADLIGHT_HALO} stopOpacity={0.0} />
            <stop offset="20%" stopColor={HEADLIGHT_HALO} stopOpacity={0.18} />
            <stop offset="100%" stopColor={HEADLIGHT_HALO} stopOpacity={0.0} />
          </linearGradient>
          {/* Volumetric beam mid */}
          <linearGradient id="ht-beam-mid" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={HEADLIGHT_WARM} stopOpacity={0.0} />
            <stop offset="15%" stopColor={HEADLIGHT_WARM} stopOpacity={0.42} />
            <stop offset="80%" stopColor={HEADLIGHT_WARM} stopOpacity={0.06} />
            <stop offset="100%" stopColor={HEADLIGHT_WARM} stopOpacity={0.0} />
          </linearGradient>
          {/* Volumetric beam inner core */}
          <linearGradient id="ht-beam-inner" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={HEADLIGHT_CORE} stopOpacity={0.0} />
            <stop offset="10%" stopColor={HEADLIGHT_CORE} stopOpacity={0.7} />
            <stop offset="55%" stopColor={HEADLIGHT_CORE} stopOpacity={0.18} />
            <stop offset="100%" stopColor={HEADLIGHT_CORE} stopOpacity={0.0} />
          </linearGradient>
          {/* Headlight halo radial */}
          <radialGradient id="ht-halo">
            <stop offset="0%" stopColor={HEADLIGHT_CORE} stopOpacity={1} />
            <stop offset="18%" stopColor={HEADLIGHT_WARM} stopOpacity={0.85} />
            <stop offset="45%" stopColor={HEADLIGHT_HALO} stopOpacity={0.35} />
            <stop offset="100%" stopColor={HEADLIGHT_HALO} stopOpacity={0} />
          </radialGradient>
          {/* Headlight inner core */}
          <radialGradient id="ht-core">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
            <stop offset="55%" stopColor={HEADLIGHT_CORE} stopOpacity={0.95} />
            <stop offset="100%" stopColor={HEADLIGHT_WARM} stopOpacity={0} />
          </radialGradient>
          {/* Moon glow */}
          <radialGradient id="ht-moon">
            <stop offset="0%" stopColor="#E8E4D0" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#E8E4D0" stopOpacity={0} />
          </radialGradient>
          {/* Fog overlay near vanishing point */}
          <radialGradient id="ht-fog">
            <stop offset="0%" stopColor="#1A1A22" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#1A1A22" stopOpacity={0} />
          </radialGradient>
          {/* Filter for blurring the outer beam (volumetric softness) */}
          <filter id="ht-blur-outer" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="ht-blur-mid" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="ht-blur-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        {/* Sky */}
        <rect x={0} y={0} width={width} height={horizonY + 4} fill="url(#ht-sky)" />
        {/* Ground */}
        <rect x={0} y={horizonY} width={width} height={height - horizonY} fill="url(#ht-ground)" />

        {/* Stars */}
        {stars.map((s, i) => (
          <circle
            key={`st-${i}`}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={STAR_COLOR}
            opacity={0.55 * s.flicker}
          />
        ))}

        {/* Faint moon */}
        <circle
          cx={width * 0.82}
          cy={height * 0.16}
          r={Math.min(width, height) * 0.045}
          fill="url(#ht-moon)"
        />
        <circle
          cx={width * 0.82}
          cy={height * 0.16}
          r={Math.min(width, height) * 0.012}
          fill="#D8D2BC"
          opacity={0.42}
        />

        {/* Ballast bed (gravel) — wide trapezoid in perspective */}
        <polygon
          points={`${vpX - railSpreadVp * 0.7},${vpY} ${vpX + railSpreadVp * 0.7},${vpY} ${vpX + railSpreadFg * 0.95},${fgY} ${vpX - railSpreadFg * 0.95},${fgY}`}
          fill={BALLAST_COLOR}
          opacity={0.75}
        />
        {/* Ballast texture — scattered grit dots */}
        {Array.from({ length: 90 }).map((_, i) => {
          const r1 = rand(i * 13.7 + 0.1);
          const r2 = rand(i * 5.3 + 7.1);
          const t = 0.05 + r1 * 0.95;
          const gy = depthToY(t, vpY, fgY);
          const halfW = tieHalf(t) * 1.25;
          const gx = vpX + (r2 - 0.5) * halfW * 2;
          const gr = 0.6 + rand(i * 9.9) * (0.6 + t * 1.6);
          return (
            <circle
              key={`grit-${i}`}
              cx={gx}
              cy={gy}
              r={gr}
              fill="#2C241B"
              opacity={0.55}
            />
          );
        })}

        {/* Warm ground pool around headlight base */}
        <ellipse
          cx={vpX}
          cy={vpY + 18 + approach * 24}
          rx={width * (0.18 + approach * 0.14)}
          ry={height * (0.06 + approach * 0.05)}
          fill="url(#ht-ground-pool)"
          opacity={0.85 * (0.6 + energy * 0.6)}
        />

        {/* Wooden ties (rendered back-to-front so foreground covers distant) */}
        {ties.map((tie, i) => {
          const lit = interpolate(tie.t, [0, 0.45], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          // Lit color blends warm light into the wood near the vanishing point.
          const r = Math.round(58 + (255 - 58) * lit * 0.8);
          const g = Math.round(42 + (220 - 42) * lit * 0.8);
          const b = Math.round(28 + (140 - 28) * lit * 0.5);
          const tieColor = lit > 0.05 ? `rgb(${r},${g},${b})` : TIE_COLOR;
          return (
            <g key={`tie-${i}`}>
              {/* Tie shadow under */}
              <rect
                x={vpX - tie.halfW}
                y={tie.y + tie.thick * 0.45}
                width={tie.halfW * 2}
                height={Math.max(0.8, tie.thick * 0.35)}
                fill={TIE_DARK_COLOR}
                opacity={0.65}
              />
              {/* Tie body */}
              <rect
                x={vpX - tie.halfW}
                y={tie.y - tie.thick * 0.5}
                width={tie.halfW * 2}
                height={tie.thick}
                fill={tieColor}
                opacity={0.92}
              />
            </g>
          );
        })}

        {/* Rails — drawn as polylines along depth so we can color-fade them
            from lit-near-VP to dark-near-foreground. We split each rail into
            10 segments for the gradient illusion. */}
        {([-1, 1] as const).map((side) => {
          const segs = 12;
          return Array.from({ length: segs }).map((_, i) => {
            const t1 = i / segs;
            const t2 = (i + 1) / segs;
            const y1 = depthToY(t1, vpY, fgY);
            const y2 = depthToY(t2, vpY, fgY);
            const x1 = railX(t1, side);
            const x2 = railX(t2, side);
            // Lit factor: high near vanishing point, fades with distance from VP.
            const litFactor = Math.pow(1 - (t1 + t2) * 0.5, 2.2);
            const litMix = litFactor * (0.6 + energy * 0.6);
            // Blend rail base color toward warm lit color.
            const r = Math.round(92 + (255 - 92) * litMix);
            const g = Math.round(88 + (233 - 88) * litMix);
            const b = Math.round(82 + (176 - 82) * litMix);
            const sw = Math.max(1.6, 2 + Math.pow((t1 + t2) * 0.5, 1.6) * 6);
            return (
              <line
                key={`rail-${side}-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={`rgb(${r},${g},${b})`}
                strokeWidth={sw}
                strokeLinecap="round"
                opacity={0.94}
              />
            );
          });
        })}

        {/* ============== VOLUMETRIC BEAM CONE ============== */}
        {/* Outer atmospheric beam — heavily blurred wide cone */}
        <polygon
          points={`${hlX - headlightR * 0.9},${hlY} ${hlX + headlightR * 0.9},${hlY} ${beamRightX + 60},${beamBottomY} ${beamLeftX - 60},${beamBottomY}`}
          fill="url(#ht-beam-outer)"
          opacity={beamOpacity * 1.0}
          filter="url(#ht-blur-outer)"
        />
        {/* Mid beam body */}
        <polygon
          points={`${hlX - headlightR * 0.55},${hlY} ${hlX + headlightR * 0.55},${hlY} ${beamRightX * 0.78 + vpX * 0.22},${beamBottomY} ${beamLeftX * 0.78 + vpX * 0.22},${beamBottomY}`}
          fill="url(#ht-beam-mid)"
          opacity={beamOpacity * 1.25}
          filter="url(#ht-blur-mid)"
        />
        {/* Inner bright core beam */}
        <polygon
          points={`${hlX - headlightR * 0.28},${hlY} ${hlX + headlightR * 0.28},${hlY} ${beamRightX * 0.45 + vpX * 0.55},${beamBottomY} ${beamLeftX * 0.45 + vpX * 0.55},${beamBottomY}`}
          fill="url(#ht-beam-inner)"
          opacity={beamOpacity * 1.4}
          filter="url(#ht-blur-soft)"
        />
        {/* Chroma-tinted thin streak — pure tint hint */}
        <polygon
          points={`${hlX - headlightR * 0.18},${hlY} ${hlX + headlightR * 0.18},${hlY} ${vpX + (beamRightX - vpX) * 0.32},${beamBottomY} ${vpX - (vpX - beamLeftX) * 0.32},${beamBottomY}`}
          fill={beamTint}
          opacity={beamOpacity * 0.32}
          filter="url(#ht-blur-soft)"
        />

        {/* ============== TRAIN SILHOUETTE ============== */}
        {/* Cab (rear, bigger box) */}
        <rect
          x={trainCx - cabW * 0.5}
          y={trainBaseY - boilerH - cabH * 0.4}
          width={cabW}
          height={cabH}
          fill={TRAIN_SILHOUETTE}
          opacity={0.92}
          rx={cabW * 0.05}
        />
        {/* Boiler (cylindrical, in front of cab) */}
        <rect
          x={trainCx - boilerW * 0.5}
          y={trainBaseY - boilerH}
          width={boilerW}
          height={boilerH}
          fill={TRAIN_SILHOUETTE}
          opacity={0.95}
          rx={boilerH * 0.42}
        />
        {/* Smokebox (front of boiler) — slightly larger circle */}
        <ellipse
          cx={trainCx}
          cy={trainBaseY - boilerH * 0.5}
          rx={boilerW * 0.34}
          ry={boilerH * 0.62}
          fill={TRAIN_SILHOUETTE}
          opacity={0.95}
        />
        {/* Smokestack */}
        <rect
          x={trainCx - boilerW * 0.18 - stackW * 0.5}
          y={trainBaseY - boilerH * 0.5 - stackH}
          width={stackW}
          height={stackH}
          fill={TRAIN_SILHOUETTE}
          opacity={0.96}
        />
        {/* Smokestack flare top */}
        <rect
          x={trainCx - boilerW * 0.18 - stackW * 0.85}
          y={trainBaseY - boilerH * 0.5 - stackH - stackH * 0.12}
          width={stackW * 1.7}
          height={stackH * 0.16}
          fill={TRAIN_SILHOUETTE}
          opacity={0.96}
        />
        {/* Steam dome (small bump on boiler) */}
        <ellipse
          cx={trainCx + boilerW * 0.05}
          cy={trainBaseY - boilerH - 1}
          rx={boilerW * 0.08}
          ry={boilerH * 0.18}
          fill={TRAIN_SILHOUETTE}
          opacity={0.95}
        />
        {/* Cowcatcher hint (angled wedge in front) */}
        <polygon
          points={`${trainCx - boilerW * 0.42},${trainBaseY - boilerH * 0.05} ${trainCx + boilerW * 0.42},${trainBaseY - boilerH * 0.05} ${trainCx + boilerW * 0.18},${trainBaseY + boilerH * 0.18} ${trainCx - boilerW * 0.18},${trainBaseY + boilerH * 0.18}`}
          fill={TRAIN_SILHOUETTE}
          opacity={0.92}
        />

        {/* ============== HEADLIGHT (3-layer) ============== */}
        {/* Outer halo (largest) */}
        <circle
          cx={hlX}
          cy={hlY}
          r={headlightR * (4.2 + onsetFlash * 1.4)}
          fill="url(#ht-halo)"
          opacity={haloOpacity * 0.55}
          filter="url(#ht-blur-mid)"
        />
        {/* Mid headlight body */}
        <circle
          cx={hlX}
          cy={hlY}
          r={headlightR * (1.9 + onsetFlash * 0.6)}
          fill="url(#ht-halo)"
          opacity={haloOpacity}
          filter="url(#ht-blur-soft)"
        />
        {/* Bright inner core (white-hot) */}
        <circle
          cx={hlX}
          cy={hlY}
          r={headlightR * (0.85 + onsetFlash * 0.35)}
          fill="url(#ht-core)"
          opacity={coreOpacity}
        />
        {/* Solid white pinpoint */}
        <circle
          cx={hlX}
          cy={hlY}
          r={headlightR * (0.32 + onsetFlash * 0.18)}
          fill="#FFFFFF"
          opacity={Math.min(1, 0.95 + onsetFlash * 0.05)}
        />

        {/* ============== STEAM / SMOKE ============== */}
        {/* Side steam puffs */}
        {steamPuffs.map((p, i) => (
          <circle
            key={`steam-${i}`}
            cx={p.x}
            cy={p.y}
            r={p.r}
            fill="#3A332C"
            opacity={p.o}
            filter="url(#ht-blur-soft)"
          />
        ))}
        {/* Smoke plume from smokestack */}
        {plumePts.map((p, i) => (
          <circle
            key={`plume-${i}`}
            cx={p.x}
            cy={p.y}
            r={p.r}
            fill={SMOKE_COLOR}
            opacity={p.o}
            filter="url(#ht-blur-soft)"
          />
        ))}

        {/* ============== DUST MOTES IN BEAM ============== */}
        {dustMotes.map((d, i) => (
          <circle
            key={`dust-${i}`}
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill={HEADLIGHT_CORE}
            opacity={d.o * (0.6 + beatDecay * 0.4)}
            filter="url(#ht-blur-soft)"
          />
        ))}

        {/* ============== FOG NEAR VANISHING POINT ============== */}
        <ellipse
          cx={vpX}
          cy={vpY + 20}
          rx={width * 0.42}
          ry={height * 0.18}
          fill="url(#ht-fog)"
          opacity={0.6}
        />
      </svg>
    </div>
  );
};
