/**
 * SteamLocomotive — "Driving that train, high on cocaine. Casey Jones you better
 * watch your speed."
 *
 * A vintage American 4-6-2 Pacific steam locomotive in profile (side view),
 * thundering across the frame. This is the actual locomotive — pistons,
 * connecting rods, drive wheels with 8 spokes, billowing smoke, glowing
 * firebox. The hot iron embodiment of Casey Jones himself.
 *
 * Distinct from HeadlightTrain (which is the headlight beam piercing toward
 * the viewer down the rails). This is the broadside profile shot — the entire
 * machine, from cowcatcher to tender, in motion.
 *
 * Geometry (anatomically accurate American Pacific):
 *  - Boiler: long horizontal cylinder with rivet bands and a top horizon line.
 *  - Smokebox: rounded front of the boiler with the central headlight, number
 *    plate, and a domed cap.
 *  - Smokestack: tall stack with a flared "diamond" top (American style).
 *  - Steam dome and sand dome: two squat domes on top of the boiler.
 *  - Cab: rectangular crew compartment at the back with two yellow-lit windows
 *    (firebox glow visible inside).
 *  - Tender: coal/water car trailing behind the cab with stacked coal piles and
 *    iron strap reinforcements.
 *  - Cowcatcher (pilot): angled metal grille at the front lower edge.
 *
 * Running gear (the iconic mechanical signature):
 *  - 2 small leading truck wheels at the front (Pacific = 4-6-2, drawn as 2
 *    visible from the side).
 *  - 3 large drive wheels in the middle (the powered wheels), each with 8
 *    visible spokes that ROTATE in lockstep with bass.
 *  - 1 small trailing truck wheel under the cab.
 *  - 4 wheels under the tender.
 *  - Connecting rod (main rod) linking the cylinder piston to the central drive
 *    wheel via a crank pin that orbits the wheel center.
 *  - Side rod linking all three drive wheels together via crank pins on each
 *    wheel — when one wheel turns, they all turn (mechanical truth).
 *  - Piston cylinder mounted just behind the cowcatcher, with a piston rod
 *    sliding in/out of the cylinder in time with the crank.
 *
 * Smoke and steam:
 *  - Massive dark smoke plume billowing from the smokestack (12 overlapping
 *    cloud puffs of varying size, drifting up and back behind the train).
 *  - Steam venting from the cylinder cocks at the front lower sides.
 *  - Steam from the safety valve on top of the steam dome.
 *  - Smoke trails behind the train as it moves, dragged by the slipstream.
 *
 * Atmospheric:
 *  - Glowing firebox visible through cab windows (warm orange light, tinted by
 *    chromaHue).
 *  - Sparks flying from the smokestack on onset transients.
 *  - Heat distortion (subtle vertical wobble) above the boiler.
 *  - Train tracks beneath with wooden ties.
 *  - Ground beside the tracks.
 *  - Slight bouncing motion as it rolls (suspension wobble locked to musical
 *    time).
 *
 * Audio reactivity:
 *  - energy        → smoke plume intensity, density, steam volume
 *  - bass          → drive wheel rotation speed multiplier (chuga-chuga)
 *  - musicalTime   → wheel phase (locked to beat for the chuga-chuga rhythm)
 *  - beatDecay     → steam puff pulses, body bounce amplitude
 *  - onsetEnvelope → firebox flares, smokestack sparks
 *  - chromaHue     → tints the firebox glow toward the dominant pitch
 *  - tempoFactor   → train horizontal travel speed
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

const SKY_TOP = "#0B0E18";
const SKY_BOTTOM = "#1A1410";
const GROUND_COLOR = "#0E0B07";
const RAIL_COLOR = "#5C5852";
const TIE_COLOR = "#3A2A1C";

const LOCO_BODY = "#0A0806";
const LOCO_HIGHLIGHT = "#26201A";
const LOCO_RIVET = "#3A322A";
const LOCO_OUTLINE = "#04030A";

const SMOKE_DARK = "#181410";
const SMOKE_MID = "#2A241E";
const STEAM_LIGHT = "#D8D2C4";

const HEADLIGHT_CORE = "#FFFCEC";
const HEADLIGHT_WARM = "#FFE89E";
const FIREBOX_BASE = "#FF7A1F";
const SPARK_COLOR = "#FFC766";

const PLUME_PUFF_COUNT = 12;
const TRAIL_PUFF_COUNT = 8;
const SPARK_COUNT = 10;
const TIE_COUNT = 18;

/* ------------------------------------------------------------------ */
/*  Deterministic pseudo-random                                        */
/* ------------------------------------------------------------------ */

function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export const SteamLocomotive: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  /* ---- Audio reactive values ---- */
  const energy = snap.energy;
  const bass = snap.bass;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue;
  const onsetEnv = snap.onsetEnvelope;
  const musicalTime = snap.musicalTime;

  /* ---- Master opacity (hero overlay) ---- */
  const masterOpacity = 0.97;

  /* ---- Travel cycle: locomotive crosses screen left to right ---- */
  // ~24s crossing scaled by tempo. Faster songs = faster Casey.
  const crossPeriod = 720 / Math.max(0.7, tempoFactor);
  const crossT = (frame % crossPeriod) / crossPeriod;
  // Linear traverse with a small ease-in/ease-out at the edges.
  const easedCross = crossT < 0.1
    ? crossT * crossT * 50
    : crossT > 0.9
      ? 1 - (1 - crossT) * (1 - crossT) * 50
      : crossT;

  /* ---- Geometry: ground line and locomotive footprint ---- */
  const horizonY = height * 0.62;
  const groundY = height * 0.78;
  const railY = height * 0.78;

  // Locomotive size: takes up roughly 60% of the screen width when on screen.
  const locoLength = width * 0.62;
  const locoHeight = locoLength * 0.33;

  // Locomotive anchor: front of the cowcatcher in screen space.
  // Travel from -length to width+length so it fully exits both sides.
  const startX = -locoLength * 1.05;
  const endX = width + locoLength * 0.05;
  const frontX = startX + (endX - startX) * easedCross;

  // Boiler centerline (the long cylinder).
  const boilerY = railY - locoHeight * 0.62;

  // Bouncing motion locked to musical time (subtle suspension wobble).
  const bounceAmp = 1.4 + beatDecay * 2.2;
  const bounce = Math.sin(musicalTime * Math.PI * 2) * bounceAmp;

  /* ---- Layout coordinates (all relative to frontX, the cowcatcher tip) ---- */
  // Locomotive faces right by convention; we render in local coordinates and
  // translate. Local x=0 is at the front (cowcatcher tip), x grows backward.
  const cowcatcherW = locoLength * 0.06;
  const cylinderX = cowcatcherW + locoLength * 0.005;
  const cylinderW = locoLength * 0.075;
  const smokeboxX = cylinderX + cylinderW * 0.5;
  const smokeboxW = locoLength * 0.13;
  const boilerX = smokeboxX + smokeboxW * 0.7;
  const boilerW = locoLength * 0.34;
  const cabX = boilerX + boilerW;
  const cabW = locoLength * 0.13;
  const tenderGap = locoLength * 0.012;
  const tenderX = cabX + cabW + tenderGap;
  const tenderW = locoLength * 0.22;

  // Vertical layout (local y, where y grows downward; railY is local 0).
  const localRailY = 0;
  const wheelHubY = -locoHeight * 0.18;
  const driveWheelR = locoHeight * 0.36;
  const truckWheelR = locoHeight * 0.18;
  const tenderWheelR = locoHeight * 0.18;

  const boilerTop = -locoHeight * 0.78;
  const boilerBottom = -locoHeight * 0.34;
  const cabTop = -locoHeight * 1.02;
  const cabBottom = -locoHeight * 0.32;
  const stackBaseY = boilerTop;
  const stackTopY = boilerTop - locoHeight * 0.45;

  /* ---- Wheel rotation ---- */
  // Drive wheels rotate in lockstep. Phase locked to musical time so the
  // chuga-chuga visually syncs with the beat. Bass adds a speed multiplier.
  // One full rotation per 2 beats, plus bass-driven extra.
  const baseWheelPhase = musicalTime * Math.PI; // half rotation per beat
  const bassBoost = bass * Math.PI * 0.6;
  const wheelAngle = baseWheelPhase + bassBoost + frame * 0.04 * tempoFactor;

  /* ---- Drive wheels ---- */
  // 3 large drive wheels evenly spaced under the boiler.
  const driveCount = 3;
  const driveSpacing = boilerW / (driveCount + 0.4);
  const driveStartLocalX = boilerX + driveSpacing * 0.7;
  const driveLocalCenters: number[] = [];
  for (let i = 0; i < driveCount; i++) {
    driveLocalCenters.push(driveStartLocalX + i * driveSpacing);
  }

  // Leading truck wheels (2 small, in front under smokebox).
  const leadCount = 2;
  const leadSpacing = locoLength * 0.045;
  const leadLocalCenters: number[] = [];
  for (let i = 0; i < leadCount; i++) {
    leadLocalCenters.push(smokeboxX - locoLength * 0.005 + i * leadSpacing);
  }

  // Trailing truck wheel (1 small, under cab).
  const trailLocalCenters: number[] = [cabX + cabW * 0.55];

  // Tender wheels (4 small).
  const tenderWheelCount = 4;
  const tenderWheelSpacing = tenderW / (tenderWheelCount + 0.5);
  const tenderWheelCenters: number[] = [];
  for (let i = 0; i < tenderWheelCount; i++) {
    tenderWheelCenters.push(tenderX + tenderWheelSpacing * (0.55 + i));
  }

  /* ---- Connecting rod geometry ---- */
  // Crank pin offset from wheel center (orbits the hub).
  const crankRadius = driveWheelR * 0.62;
  const crankPins = driveLocalCenters.map((cx) => ({
    x: cx + Math.cos(wheelAngle) * crankRadius,
    y: wheelHubY + Math.sin(wheelAngle) * crankRadius,
  }));

  // Piston: slides horizontally with the same crank cycle.
  const pistonStrokeAmp = locoLength * 0.018;
  const pistonExtension = (Math.cos(wheelAngle) + 1) * 0.5 * pistonStrokeAmp;

  /* ---- Headlight ---- */
  const headlightR = locoLength * 0.018;
  const headlightLocalX = smokeboxX - smokeboxW * 0.05;
  const headlightLocalY = boilerY - railY - locoHeight * 0.05;
  const headlightFlare = 1 + onsetEnv * 0.6;

  /* ---- Firebox glow ---- */
  // Tinted by chromaHue, modulated by onset and bass.
  const fireboxIntensity =
    0.55 + onsetEnv * 0.35 + bass * 0.18 + Math.sin(frame * 0.18) * 0.06;
  const fireboxHue = (chromaHue * 0.4 + 18) % 360; // bias toward orange
  const fireboxGlow = `hsla(${fireboxHue.toFixed(0)}, 90%, 58%, ${(fireboxIntensity * 0.95).toFixed(3)})`;
  const fireboxCore = `hsla(${fireboxHue.toFixed(0)}, 95%, 70%, ${Math.min(1, fireboxIntensity + 0.12).toFixed(3)})`;

  /* ---- Smokestack plume ---- */
  // 12 overlapping cloud puffs drifting up and back from the smokestack.
  // Energy controls density / size; bass controls vertical drift speed.
  const stackLocalX = boilerX + boilerW * 0.12;
  const stackTipLocalY = stackTopY - locoHeight * 0.04;
  const plumeIntensity = 0.55 + energy * 0.55;

  const plumePuffs: {
    cx: number;
    cy: number;
    r: number;
    o: number;
    color: string;
  }[] = [];
  for (let i = 0; i < PLUME_PUFF_COUNT; i++) {
    const t = i / (PLUME_PUFF_COUNT - 1);
    const driftPhase = (frame * 0.012 * tempoFactor + i * 0.13) % 1;
    const tt = (t + driftPhase * 0.04) % 1;
    // Plume rises up and drifts backward (opposite of train motion = leftward
    // in local coords, since train faces right).
    const dx = stackLocalX + tt * locoLength * 0.18 + Math.sin(tt * 4 + frame * 0.02) * 6;
    const dy = stackTipLocalY - tt * (locoHeight * 1.6 + energy * locoHeight * 1.2);
    const baseR = (locoHeight * 0.07) + tt * locoHeight * 0.14;
    const r = baseR * (0.85 + plumeIntensity * 0.6) * (1 + beatDecay * 0.08);
    const opacity = (1 - tt * 0.8) * 0.85 * plumeIntensity;
    const color = i % 3 === 0 ? SMOKE_MID : SMOKE_DARK;
    plumePuffs.push({ cx: dx, cy: dy, r, o: opacity, color });
  }

  /* ---- Trailing smoke (drags behind the train as it moves) ---- */
  const trailPuffs: { cx: number; cy: number; r: number; o: number }[] = [];
  for (let i = 0; i < TRAIL_PUFF_COUNT; i++) {
    const t = i / (TRAIL_PUFF_COUNT - 1);
    const tx = stackLocalX + locoLength * 0.18 + t * locoLength * 0.55;
    const ty =
      stackTipLocalY - locoHeight * (1.4 + energy * 0.8) - Math.sin(t * 3 + frame * 0.015) * 8;
    const r = (locoHeight * 0.12 + t * locoHeight * 0.18) * (0.8 + plumeIntensity * 0.6);
    const opacity = (1 - t) * 0.55 * plumeIntensity;
    trailPuffs.push({ cx: tx, cy: ty, r, o: opacity });
  }

  /* ---- Cylinder cock steam (small white puffs at front lower sides) ---- */
  const cockPuffs: { cx: number; cy: number; r: number; o: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const t = ((frame * 0.04 + i * 0.27) % 1);
    const cx = cylinderX + cylinderW * 0.5 + Math.cos(wheelAngle * 2 + i) * 6 - t * locoLength * 0.04;
    const cy = -locoHeight * 0.18 - t * locoHeight * 0.18;
    const r = (locoHeight * 0.04 + t * locoHeight * 0.05) * (0.7 + beatDecay * 0.4);
    const opacity = (1 - t) * 0.65 * (0.5 + energy * 0.6);
    cockPuffs.push({ cx, cy, r, o: opacity });
  }

  /* ---- Safety valve steam (top of steam dome) ---- */
  const safetyValveX = boilerX + boilerW * 0.36;
  const safetyValveY = boilerTop - locoHeight * 0.08;
  const safetyPuffs: { cx: number; cy: number; r: number; o: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const t = ((frame * 0.018 + i * 0.21) % 1);
    const cx = safetyValveX + Math.sin(t * 6 + i) * 4;
    const cy = safetyValveY - t * locoHeight * 0.4;
    const r = (locoHeight * 0.03 + t * locoHeight * 0.05) * (0.7 + bass * 0.4);
    const opacity = (1 - t) * 0.55 * (0.4 + bass * 0.5);
    safetyPuffs.push({ cx, cy, r, o: opacity });
  }

  /* ---- Sparks from the smokestack (onset-driven) ---- */
  const sparkBurst = Math.max(onsetEnv, beatDecay * 0.6);
  const sparks: { cx: number; cy: number; r: number; o: number }[] = [];
  for (let i = 0; i < SPARK_COUNT; i++) {
    const t = ((frame * 0.05 + rand(i * 3.7) * 0.7) % 1);
    const wobble = Math.sin(t * 8 + i) * 8;
    const cx = stackLocalX + wobble + (rand(i * 5.1) - 0.5) * 12;
    const cy = stackTipLocalY - t * locoHeight * 0.9;
    const r = (1 + (1 - t) * 1.6) * (0.6 + sparkBurst * 0.9);
    const opacity = (1 - t) * 0.95 * sparkBurst;
    sparks.push({ cx, cy, r, o: opacity });
  }

  /* ---- Heat distortion above boiler (subtle wavy lines) ---- */
  const heatLines: { x1: number; x2: number; y: number; o: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const x = boilerX + locoLength * 0.05 + t * boilerW * 0.7;
    const y = boilerTop - 4 + Math.sin(frame * 0.08 + i * 1.3) * 3;
    heatLines.push({ x1: x, x2: x + 14, y, o: 0.18 + energy * 0.18 });
  }

  /* ---- Background ties (rendered across the full width) ---- */
  const ties: { x: number; w: number }[] = [];
  const tieSpacing = width / TIE_COUNT;
  // Ties scroll with the train motion to enhance the sense of speed.
  const tieScroll = (frame * 8 * tempoFactor) % tieSpacing;
  for (let i = -1; i < TIE_COUNT + 1; i++) {
    ties.push({ x: i * tieSpacing - tieScroll, w: tieSpacing * 0.55 });
  }

  /* ---- Wheel spoke generator ---- */
  // Each drive wheel has 8 spokes that rotate with wheelAngle.
  const renderSpokes = (cx: number, cy: number, r: number, angle: number) => {
    const spokes: React.ReactNode[] = [];
    for (let s = 0; s < 8; s++) {
      const a = angle + (s * Math.PI) / 4;
      const x2 = cx + Math.cos(a) * r * 0.9;
      const y2 = cy + Math.sin(a) * r * 0.9;
      spokes.push(
        <line
          key={`sp-${s}`}
          x1={cx}
          y1={cy}
          x2={x2}
          y2={y2}
          stroke={LOCO_HIGHLIGHT}
          strokeWidth={Math.max(1.2, r * 0.11)}
          strokeLinecap="round"
        />,
      );
    }
    return spokes;
  };

  /* ---- Locomotive translation (front anchor → SVG translate) ---- */
  // The local coordinate system has x=0 at the cowcatcher tip and y=0 at the
  // rail line. We translate to (frontX, railY + bounce) and render.
  const txX = frontX;
  const txY = railY + bounce;

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
          <linearGradient id="sl-sky" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={SKY_TOP} />
            <stop offset="70%" stopColor="#0F0C0A" />
            <stop offset="100%" stopColor={SKY_BOTTOM} />
          </linearGradient>
          <linearGradient id="sl-ground" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#120E0A" />
            <stop offset="100%" stopColor={GROUND_COLOR} />
          </linearGradient>
          <linearGradient id="sl-boiler" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={LOCO_HIGHLIGHT} />
            <stop offset="35%" stopColor={LOCO_BODY} />
            <stop offset="100%" stopColor="#020202" />
          </linearGradient>
          <radialGradient id="sl-firebox" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor={fireboxCore} />
            <stop offset="60%" stopColor={fireboxGlow} />
            <stop offset="100%" stopColor={FIREBOX_BASE} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="sl-headlight">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
            <stop offset="55%" stopColor={HEADLIGHT_CORE} stopOpacity={0.95} />
            <stop offset="100%" stopColor={HEADLIGHT_WARM} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="sl-headlight-halo">
            <stop offset="0%" stopColor={HEADLIGHT_WARM} stopOpacity={0.55} />
            <stop offset="100%" stopColor={HEADLIGHT_WARM} stopOpacity={0} />
          </radialGradient>
          <filter id="sl-blur-soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          <filter id="sl-blur-smoke" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="sl-blur-firebox" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4.2" />
          </filter>
        </defs>

        {/* Sky */}
        <rect x={0} y={0} width={width} height={horizonY + 4} fill="url(#sl-sky)" />
        {/* Ground */}
        <rect
          x={0}
          y={horizonY}
          width={width}
          height={height - horizonY}
          fill="url(#sl-ground)"
        />

        {/* Distant horizon line glow (warm sodium light) */}
        <rect
          x={0}
          y={horizonY - 1}
          width={width}
          height={2}
          fill="#3A2E1E"
          opacity={0.55}
        />

        {/* Train tracks (two parallel rails) */}
        <line
          x1={0}
          y1={railY - 4}
          x2={width}
          y2={railY - 4}
          stroke={RAIL_COLOR}
          strokeWidth={3}
        />
        <line
          x1={0}
          y1={railY + 4}
          x2={width}
          y2={railY + 4}
          stroke={RAIL_COLOR}
          strokeWidth={3}
        />

        {/* Wooden ties */}
        {ties.map((t, i) => (
          <rect
            key={`tie-${i}`}
            x={t.x}
            y={railY - 8}
            width={t.w}
            height={16}
            fill={TIE_COLOR}
            opacity={0.85}
          />
        ))}

        {/* Ballast (gravel under the rails) */}
        <rect
          x={0}
          y={railY + 8}
          width={width}
          height={groundY - (railY + 8)}
          fill="#1B1410"
          opacity={0.6}
        />

        {/* ---- Locomotive group ---- */}
        <g transform={`translate(${txX} ${txY})`}>
          {/* Trail smoke (rendered first so locomotive sits in front) */}
          <g filter="url(#sl-blur-smoke)">
            {trailPuffs.map((p, i) => (
              <circle
                key={`tr-${i}`}
                cx={p.cx}
                cy={p.cy}
                r={p.r}
                fill={SMOKE_DARK}
                opacity={p.o}
              />
            ))}
          </g>

          {/* Plume puffs (smokestack column) */}
          <g filter="url(#sl-blur-smoke)">
            {plumePuffs.map((p, i) => (
              <circle
                key={`pl-${i}`}
                cx={p.cx}
                cy={p.cy}
                r={p.r}
                fill={p.color}
                opacity={p.o}
              />
            ))}
          </g>

          {/* Sparks from smokestack */}
          {sparks.map((s, i) => (
            <circle
              key={`spark-${i}`}
              cx={s.cx}
              cy={s.cy}
              r={s.r}
              fill={SPARK_COLOR}
              opacity={s.o}
            />
          ))}

          {/* Safety valve steam */}
          {safetyPuffs.map((p, i) => (
            <circle
              key={`sv-${i}`}
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              fill={STEAM_LIGHT}
              opacity={p.o}
              filter="url(#sl-blur-soft)"
            />
          ))}

          {/* ---- Tender (drawn first so cab overlaps it) ---- */}
          <rect
            x={tenderX}
            y={cabBottom - locoHeight * 0.18}
            width={tenderW}
            height={locoHeight * 0.55}
            fill="url(#sl-boiler)"
            stroke={LOCO_OUTLINE}
            strokeWidth={1.5}
          />
          {/* Coal pile inside tender (jagged top) */}
          <polygon
            points={`
              ${tenderX + tenderW * 0.06},${cabBottom - locoHeight * 0.18}
              ${tenderX + tenderW * 0.16},${cabBottom - locoHeight * 0.32}
              ${tenderX + tenderW * 0.32},${cabBottom - locoHeight * 0.24}
              ${tenderX + tenderW * 0.48},${cabBottom - locoHeight * 0.36}
              ${tenderX + tenderW * 0.62},${cabBottom - locoHeight * 0.22}
              ${tenderX + tenderW * 0.78},${cabBottom - locoHeight * 0.34}
              ${tenderX + tenderW * 0.92},${cabBottom - locoHeight * 0.2}
              ${tenderX + tenderW * 0.94},${cabBottom - locoHeight * 0.18}
            `}
            fill="#050405"
          />
          {/* Tender iron strap reinforcements */}
          {[0.2, 0.4, 0.6, 0.8].map((t, i) => (
            <line
              key={`ts-${i}`}
              x1={tenderX + tenderW * t}
              y1={cabBottom - locoHeight * 0.18}
              x2={tenderX + tenderW * t}
              y2={cabBottom + locoHeight * 0.37}
              stroke={LOCO_RIVET}
              strokeWidth={1.2}
              opacity={0.7}
            />
          ))}

          {/* ---- Cab ---- */}
          <rect
            x={cabX}
            y={cabTop}
            width={cabW}
            height={cabBottom - cabTop}
            fill="url(#sl-boiler)"
            stroke={LOCO_OUTLINE}
            strokeWidth={1.5}
          />
          {/* Cab roof overhang */}
          <rect
            x={cabX - cabW * 0.05}
            y={cabTop - locoHeight * 0.03}
            width={cabW * 1.1}
            height={locoHeight * 0.04}
            fill={LOCO_BODY}
            stroke={LOCO_OUTLINE}
            strokeWidth={1}
          />
          {/* Cab windows — firebox glow visible inside */}
          <rect
            x={cabX + cabW * 0.12}
            y={cabTop + locoHeight * 0.12}
            width={cabW * 0.32}
            height={locoHeight * 0.32}
            fill="url(#sl-firebox)"
          />
          <rect
            x={cabX + cabW * 0.56}
            y={cabTop + locoHeight * 0.12}
            width={cabW * 0.32}
            height={locoHeight * 0.32}
            fill="url(#sl-firebox)"
          />
          {/* Window frames */}
          <rect
            x={cabX + cabW * 0.12}
            y={cabTop + locoHeight * 0.12}
            width={cabW * 0.32}
            height={locoHeight * 0.32}
            fill="none"
            stroke={LOCO_RIVET}
            strokeWidth={1.2}
          />
          <rect
            x={cabX + cabW * 0.56}
            y={cabTop + locoHeight * 0.12}
            width={cabW * 0.32}
            height={locoHeight * 0.32}
            fill="none"
            stroke={LOCO_RIVET}
            strokeWidth={1.2}
          />
          {/* Big firebox glow halo behind the cab */}
          <ellipse
            cx={cabX + cabW * 0.5}
            cy={cabBottom - locoHeight * 0.08}
            rx={cabW * 0.55}
            ry={locoHeight * 0.16}
            fill={fireboxGlow}
            filter="url(#sl-blur-firebox)"
            opacity={0.85}
          />

          {/* ---- Boiler (the long horizontal cylinder) ---- */}
          <rect
            x={boilerX}
            y={boilerTop}
            width={boilerW}
            height={boilerBottom - boilerTop}
            fill="url(#sl-boiler)"
            stroke={LOCO_OUTLINE}
            strokeWidth={1.6}
          />
          {/* Boiler horizon highlight (top edge catching light) */}
          <line
            x1={boilerX + 2}
            y1={boilerTop + 2}
            x2={boilerX + boilerW - 2}
            y2={boilerTop + 2}
            stroke={LOCO_HIGHLIGHT}
            strokeWidth={1.4}
            opacity={0.55}
          />
          {/* Rivet bands across the boiler */}
          {[0.18, 0.36, 0.54, 0.72, 0.9].map((t, i) => (
            <line
              key={`rb-${i}`}
              x1={boilerX + boilerW * t}
              y1={boilerTop + 1}
              x2={boilerX + boilerW * t}
              y2={boilerBottom - 1}
              stroke={LOCO_RIVET}
              strokeWidth={0.9}
              opacity={0.65}
            />
          ))}

          {/* Steam dome */}
          <ellipse
            cx={boilerX + boilerW * 0.36}
            cy={boilerTop}
            rx={locoHeight * 0.13}
            ry={locoHeight * 0.1}
            fill={LOCO_BODY}
            stroke={LOCO_OUTLINE}
            strokeWidth={1.2}
          />
          <rect
            x={boilerX + boilerW * 0.36 - locoHeight * 0.04}
            y={boilerTop - locoHeight * 0.06}
            width={locoHeight * 0.08}
            height={locoHeight * 0.06}
            fill={LOCO_BODY}
            stroke={LOCO_OUTLINE}
            strokeWidth={1}
          />

          {/* Sand dome */}
          <ellipse
            cx={boilerX + boilerW * 0.6}
            cy={boilerTop}
            rx={locoHeight * 0.11}
            ry={locoHeight * 0.085}
            fill={LOCO_BODY}
            stroke={LOCO_OUTLINE}
            strokeWidth={1.2}
          />

          {/* ---- Smokestack (American diamond stack) ---- */}
          <rect
            x={stackLocalX - locoHeight * 0.06}
            y={stackBaseY - locoHeight * 0.32}
            width={locoHeight * 0.12}
            height={locoHeight * 0.32}
            fill={LOCO_BODY}
            stroke={LOCO_OUTLINE}
            strokeWidth={1.2}
          />
          {/* Flared diamond top */}
          <polygon
            points={`
              ${stackLocalX - locoHeight * 0.1},${stackBaseY - locoHeight * 0.32}
              ${stackLocalX + locoHeight * 0.1},${stackBaseY - locoHeight * 0.32}
              ${stackLocalX + locoHeight * 0.13},${stackBaseY - locoHeight * 0.42}
              ${stackLocalX - locoHeight * 0.13},${stackBaseY - locoHeight * 0.42}
            `}
            fill={LOCO_BODY}
            stroke={LOCO_OUTLINE}
            strokeWidth={1.2}
          />

          {/* ---- Smokebox (rounded front of boiler) ---- */}
          <rect
            x={smokeboxX}
            y={boilerTop + 2}
            width={smokeboxW}
            height={boilerBottom - boilerTop - 2}
            fill="url(#sl-boiler)"
            stroke={LOCO_OUTLINE}
            strokeWidth={1.6}
          />
          {/* Smokebox rounded face — circle on the front */}
          <circle
            cx={smokeboxX + locoHeight * 0.05}
            cy={(boilerTop + boilerBottom) * 0.5}
            r={(boilerBottom - boilerTop) * 0.5}
            fill={LOCO_BODY}
            stroke={LOCO_OUTLINE}
            strokeWidth={1.6}
          />
          {/* Smokebox rivet ring */}
          <circle
            cx={smokeboxX + locoHeight * 0.05}
            cy={(boilerTop + boilerBottom) * 0.5}
            r={(boilerBottom - boilerTop) * 0.42}
            fill="none"
            stroke={LOCO_RIVET}
            strokeWidth={0.9}
            opacity={0.65}
          />
          {/* Number plate */}
          <ellipse
            cx={smokeboxX + locoHeight * 0.05}
            cy={(boilerTop + boilerBottom) * 0.5 - locoHeight * 0.18}
            rx={locoHeight * 0.1}
            ry={locoHeight * 0.06}
            fill={LOCO_HIGHLIGHT}
            stroke={LOCO_OUTLINE}
            strokeWidth={1}
          />

          {/* Headlight halo (atmospheric) */}
          <circle
            cx={headlightLocalX}
            cy={headlightLocalY}
            r={headlightR * 4 * headlightFlare}
            fill="url(#sl-headlight-halo)"
            filter="url(#sl-blur-soft)"
          />
          {/* Headlight core */}
          <circle
            cx={headlightLocalX}
            cy={headlightLocalY}
            r={headlightR * headlightFlare}
            fill="url(#sl-headlight)"
          />
          {/* Forward beam cone (small, since we see the train in profile) */}
          <polygon
            points={`
              ${headlightLocalX - headlightR * 0.6},${headlightLocalY - headlightR * 0.6}
              ${headlightLocalX - headlightR * 5},${headlightLocalY - headlightR * 2.2}
              ${headlightLocalX - headlightR * 5},${headlightLocalY + headlightR * 2.2}
              ${headlightLocalX - headlightR * 0.6},${headlightLocalY + headlightR * 0.6}
            `}
            fill={HEADLIGHT_WARM}
            opacity={0.18 + onsetEnv * 0.25}
            filter="url(#sl-blur-soft)"
          />

          {/* ---- Cylinder (steam cylinder mounted at front lower) ---- */}
          <rect
            x={cylinderX}
            y={-locoHeight * 0.32}
            width={cylinderW}
            height={locoHeight * 0.18}
            fill={LOCO_BODY}
            stroke={LOCO_OUTLINE}
            strokeWidth={1.2}
          />
          {/* Piston rod sliding from the cylinder */}
          <rect
            x={cylinderX + cylinderW - 1}
            y={-locoHeight * 0.235 + pistonExtension * 0.12}
            width={locoLength * 0.05 + pistonExtension}
            height={2.2}
            fill={LOCO_HIGHLIGHT}
          />

          {/* ---- Cowcatcher (pilot) ---- */}
          <polygon
            points={`
              0,${-locoHeight * 0.05}
              ${cowcatcherW},${-locoHeight * 0.32}
              ${cowcatcherW},0
              0,0
            `}
            fill={LOCO_BODY}
            stroke={LOCO_OUTLINE}
            strokeWidth={1.4}
          />
          {/* Cowcatcher slats */}
          {[0.2, 0.4, 0.6, 0.8].map((t, i) => (
            <line
              key={`cc-${i}`}
              x1={cowcatcherW * (1 - t * 0.85)}
              y1={-locoHeight * 0.05 - t * locoHeight * 0.27 * 0.85}
              x2={cowcatcherW * 0.05}
              y2={-t * locoHeight * 0.05}
              stroke={LOCO_HIGHLIGHT}
              strokeWidth={1}
              opacity={0.7}
            />
          ))}

          {/* ---- Cylinder cock steam ---- */}
          {cockPuffs.map((p, i) => (
            <circle
              key={`cp-${i}`}
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              fill={STEAM_LIGHT}
              opacity={p.o}
              filter="url(#sl-blur-soft)"
            />
          ))}

          {/* ---- Drive wheels ---- */}
          {driveLocalCenters.map((cx, idx) => (
            <g key={`dw-${idx}`}>
              {/* Tire (outer rim) */}
              <circle
                cx={cx}
                cy={wheelHubY}
                r={driveWheelR}
                fill={LOCO_BODY}
                stroke={LOCO_RIVET}
                strokeWidth={2}
              />
              {/* Counterweight (curved arc on one spoke) */}
              <path
                d={`M ${cx + Math.cos(wheelAngle - 0.7) * driveWheelR * 0.85} ${wheelHubY + Math.sin(wheelAngle - 0.7) * driveWheelR * 0.85}
                    A ${driveWheelR * 0.85} ${driveWheelR * 0.85} 0 0 1
                    ${cx + Math.cos(wheelAngle + 0.7) * driveWheelR * 0.85} ${wheelHubY + Math.sin(wheelAngle + 0.7) * driveWheelR * 0.85}
                    L ${cx} ${wheelHubY} Z`}
                fill={LOCO_HIGHLIGHT}
                opacity={0.6}
              />
              {/* Spokes */}
              {renderSpokes(cx, wheelHubY, driveWheelR, wheelAngle)}
              {/* Hub */}
              <circle cx={cx} cy={wheelHubY} r={driveWheelR * 0.18} fill={LOCO_RIVET} />
              {/* Crank pin */}
              <circle
                cx={cx + Math.cos(wheelAngle) * crankRadius}
                cy={wheelHubY + Math.sin(wheelAngle) * crankRadius}
                r={driveWheelR * 0.085}
                fill="#5C5852"
                stroke={LOCO_OUTLINE}
                strokeWidth={0.8}
              />
            </g>
          ))}

          {/* ---- Side rod (links all 3 drive wheels through their crank pins) ---- */}
          <line
            x1={crankPins[0].x}
            y1={crankPins[0].y}
            x2={crankPins[crankPins.length - 1].x}
            y2={crankPins[crankPins.length - 1].y}
            stroke={LOCO_HIGHLIGHT}
            strokeWidth={driveWheelR * 0.18}
            strokeLinecap="round"
          />
          <line
            x1={crankPins[0].x}
            y1={crankPins[0].y}
            x2={crankPins[crankPins.length - 1].x}
            y2={crankPins[crankPins.length - 1].y}
            stroke={LOCO_RIVET}
            strokeWidth={driveWheelR * 0.06}
          />

          {/* ---- Main connecting rod (from piston to center drive wheel) ---- */}
          <line
            x1={cylinderX + cylinderW - 1 + locoLength * 0.05 + pistonExtension}
            y1={-locoHeight * 0.225}
            x2={crankPins[1].x}
            y2={crankPins[1].y}
            stroke={LOCO_HIGHLIGHT}
            strokeWidth={driveWheelR * 0.14}
            strokeLinecap="round"
          />

          {/* ---- Leading truck wheels (small, in front under smokebox) ---- */}
          {leadLocalCenters.map((cx, idx) => (
            <g key={`lw-${idx}`}>
              <circle
                cx={cx}
                cy={-truckWheelR + 0}
                r={truckWheelR}
                fill={LOCO_BODY}
                stroke={LOCO_RIVET}
                strokeWidth={1.4}
              />
              {/* 4 simple spokes */}
              {[0, 1, 2, 3].map((s) => {
                const a = wheelAngle * 1.6 + (s * Math.PI) / 2;
                return (
                  <line
                    key={`lws-${s}`}
                    x1={cx}
                    y1={-truckWheelR}
                    x2={cx + Math.cos(a) * truckWheelR * 0.85}
                    y2={-truckWheelR + Math.sin(a) * truckWheelR * 0.85}
                    stroke={LOCO_HIGHLIGHT}
                    strokeWidth={1.2}
                  />
                );
              })}
              <circle cx={cx} cy={-truckWheelR} r={truckWheelR * 0.22} fill={LOCO_RIVET} />
            </g>
          ))}

          {/* ---- Trailing truck wheel (under cab) ---- */}
          {trailLocalCenters.map((cx, idx) => (
            <g key={`tw-${idx}`}>
              <circle
                cx={cx}
                cy={-truckWheelR}
                r={truckWheelR}
                fill={LOCO_BODY}
                stroke={LOCO_RIVET}
                strokeWidth={1.4}
              />
              {[0, 1, 2, 3].map((s) => {
                const a = wheelAngle * 1.4 + (s * Math.PI) / 2;
                return (
                  <line
                    key={`tws-${s}`}
                    x1={cx}
                    y1={-truckWheelR}
                    x2={cx + Math.cos(a) * truckWheelR * 0.85}
                    y2={-truckWheelR + Math.sin(a) * truckWheelR * 0.85}
                    stroke={LOCO_HIGHLIGHT}
                    strokeWidth={1.2}
                  />
                );
              })}
              <circle cx={cx} cy={-truckWheelR} r={truckWheelR * 0.22} fill={LOCO_RIVET} />
            </g>
          ))}

          {/* ---- Tender wheels ---- */}
          {tenderWheelCenters.map((cx, idx) => (
            <g key={`tdw-${idx}`}>
              <circle
                cx={cx}
                cy={-tenderWheelR}
                r={tenderWheelR}
                fill={LOCO_BODY}
                stroke={LOCO_RIVET}
                strokeWidth={1.4}
              />
              {[0, 1, 2, 3].map((s) => {
                const a = wheelAngle * 1.5 + (s * Math.PI) / 2;
                return (
                  <line
                    key={`tdws-${s}`}
                    x1={cx}
                    y1={-tenderWheelR}
                    x2={cx + Math.cos(a) * tenderWheelR * 0.85}
                    y2={-tenderWheelR + Math.sin(a) * tenderWheelR * 0.85}
                    stroke={LOCO_HIGHLIGHT}
                    strokeWidth={1.2}
                  />
                );
              })}
              <circle cx={cx} cy={-tenderWheelR} r={tenderWheelR * 0.22} fill={LOCO_RIVET} />
            </g>
          ))}

          {/* ---- Heat distortion lines above boiler ---- */}
          {heatLines.map((h, i) => (
            <line
              key={`hl-${i}`}
              x1={h.x1}
              y1={h.y}
              x2={h.x2}
              y2={h.y}
              stroke="#3A2E1E"
              strokeWidth={1.5}
              opacity={h.o}
              filter="url(#sl-blur-soft)"
            />
          ))}
        </g>
      </svg>
    </div>
  );
};

export default SteamLocomotive;
