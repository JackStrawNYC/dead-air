/**
 * CowboySaloon — A+++ Western saloon scene for cowboy songs.
 *
 * Built for Veneta 8/27/72 to cover Me And My Uncle, El Paso, and
 * Mexicali Blues — the trio of Garcia/Weir cowboy ballads. One overlay
 * does the work: a sun-bleached false-front saloon with swinging doors,
 * cowboy silhouettes leaning, lounging, and framed in the doorway, a
 * lone tumbleweed crossing the dusty street, a hitched horse at the
 * post, a creaking sign with bullet holes, a warm lantern, and a
 * sunset behind a distant mesa.
 *
 * Audio reactivity:
 *   - bass         → swinging-door amplitude
 *   - beatDecay    → lantern glow pulse, light spill from doorway
 *   - slowEnergy   → sky color shift (sunset progression)
 *   - chromaHue    → warm western light tint (gold ↔ amber ↔ rose)
 *   - energy       → dust intensity, dust kicks
 *   - tempoFactor  → tumbleweed roll speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Cycle timing                                                       */
/* ------------------------------------------------------------------ */

const CYCLE_TOTAL = 1800; // 60s
const VISIBLE_DURATION = 600; // 20s

/* ------------------------------------------------------------------ */
/*  Deterministic data generators                                      */
/* ------------------------------------------------------------------ */

interface DustMote {
  x: number; y: number; r: number; phase: number; speed: number; drift: number;
}

interface BoardPlank {
  x: number; w: number; tone: number; knot: number;
}

interface BulletHole {
  x: number; y: number; r: number;
}

function generateDustMotes(seed: number, count: number): DustMote[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: rng(),
    y: 0.6 + rng() * 0.35,
    r: 0.6 + rng() * 1.8,
    phase: rng() * Math.PI * 2,
    speed: 0.4 + rng() * 1.2,
    drift: 0.2 + rng() * 0.6,
  }));
}

function generatePlanks(seed: number, count: number): BoardPlank[] {
  const rng = seeded(seed);
  const planks: BoardPlank[] = [];
  let x = 0;
  for (let i = 0; i < count; i++) {
    const w = 0.07 + rng() * 0.05;
    planks.push({ x, w, tone: rng(), knot: rng() });
    x += w;
  }
  return planks;
}

function generateBulletHoles(seed: number): BulletHole[] {
  const rng = seeded(seed);
  return [
    { x: 0.18, y: 0.42, r: 2.2 + rng() * 0.6 },
    { x: 0.72, y: 0.55, r: 2.0 + rng() * 0.6 },
  ];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props { frames: EnhancedFrameData[]; }

export const CowboySaloon: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const dustMotes = React.useMemo(() => generateDustMotes(8271972, 38), []);
  const planks = React.useMemo(() => generatePlanks(8271973, 18), []);
  const signHoles = React.useMemo(() => generateBulletHoles(8271974), []);

  /* Cycle gating */
  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;

  const fadeIn = interpolate(progress, [0, 0.07], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.93, 1], [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.92;
  if (masterOpacity < 0.01) return null;

  /* Audio drives */
  const doorSwing = interpolate(snap.bass, [0, 0.6], [2, 14],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lanternPulse = 0.7 + snap.beatDecay * 0.35;
  const sunsetT = interpolate(snap.slowEnergy, [0.02, 0.28], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dustIntensity = interpolate(snap.energy, [0.03, 0.32], [0.4, 1.3],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hueShift = interpolate(snap.chromaHue, [0, 1], [-22, 22]);

  /* Sky / sunset palette — interpolated by sunsetT and hue-shifted */
  const skyTopR = Math.round(interpolate(sunsetT, [0, 1], [120, 70]) + hueShift * 0.6);
  const skyTopG = Math.round(interpolate(sunsetT, [0, 1], [80, 30]) + hueShift * 0.2);
  const skyTopB = Math.round(interpolate(sunsetT, [0, 1], [120, 90]) - hueShift * 0.4);
  const skyMidR = Math.round(interpolate(sunsetT, [0, 1], [220, 240]) + hueShift * 0.5);
  const skyMidG = Math.round(interpolate(sunsetT, [0, 1], [130, 95]));
  const skyMidB = Math.round(interpolate(sunsetT, [0, 1], [80, 60]) - hueShift * 0.6);
  const skyBotR = Math.round(255 + hueShift * 0.2);
  const skyBotG = Math.round(interpolate(sunsetT, [0, 1], [180, 140]));
  const skyBotB = Math.round(interpolate(sunsetT, [0, 1], [110, 70]));

  const skyTop = `rgb(${skyTopR}, ${skyTopG}, ${skyTopB})`;
  const skyMid = `rgb(${skyMidR}, ${skyMidG}, ${skyMidB})`;
  const skyBot = `rgb(${skyBotR}, ${skyBotG}, ${skyBotB})`;

  /* Lantern color */
  const lanternColor = `rgb(${Math.round(255 + hueShift * 0.2)}, ${Math.round(190 + hueShift * 0.4)}, ${Math.round(110 - hueShift * 0.5)})`;

  /* Layout: ground at ~78% of height, building above */
  const groundY = height * 0.78;
  const horizonY = height * 0.62;
  const buildingTop = height * 0.18;
  const buildingLeft = width * 0.22;
  const buildingRight = width * 0.78;
  const buildingW = buildingRight - buildingLeft;
  const buildingCx = (buildingLeft + buildingRight) / 2;

  /* Door geometry */
  const doorTop = height * 0.45;
  const doorBot = groundY;
  const doorH = doorBot - doorTop;
  const doorCx = buildingCx;
  const doorHalfW = buildingW * 0.09;

  /* Sign creak — slow rotation */
  const signCreak = Math.sin(frame * 0.018) * 1.6 + Math.sin(frame * 0.041) * 0.6;

  /* Tumbleweed: rolls right→left across the dusty street */
  const tumbleSpeed = 0.5 + tempoFactor * 0.4;
  const tumbleProgress = ((frame * tumbleSpeed) % 600) / 600;
  const tumbleX = interpolate(tumbleProgress, [0, 1], [width + 60, -120]);
  const tumbleBounceY = groundY + 28 - Math.abs(Math.sin(frame * 0.18)) * 10;
  const tumbleRot = frame * 6;

  /* Doorway light pulse — warm spill onto boardwalk */
  const doorwayLight = 0.55 + snap.beatDecay * 0.4;

  /* Mesa silhouette path */
  const mesaPath =
    `M 0 ${horizonY} ` +
    `L ${width * 0.05} ${horizonY - 10} ` +
    `L ${width * 0.08} ${horizonY - 28} ` +
    `L ${width * 0.13} ${horizonY - 32} ` +
    `L ${width * 0.16} ${horizonY - 12} ` +
    `L ${width * 0.18} ${horizonY - 8} ` +
    `L ${width * 0.82} ${horizonY - 6} ` +
    `L ${width * 0.84} ${horizonY - 18} ` +
    `L ${width * 0.88} ${horizonY - 42} ` +
    `L ${width * 0.93} ${horizonY - 38} ` +
    `L ${width * 0.96} ${horizonY - 14} ` +
    `L ${width} ${horizonY - 4} ` +
    `L ${width} ${horizonY + 30} L 0 ${horizonY + 30} Z`;

  /* ----------------------------------------------------------------- */
  /*  Sub-renderers                                                     */
  /* ----------------------------------------------------------------- */

  const fillSil = "rgba(14,10,8,0.92)";
  const fillSilDark = "rgba(8,6,4,0.96)";

  /* Cowboy 1: leaning against the saloon wall (right side of facade) */
  const renderLeanCowboy = () => {
    const baseX = buildingRight - 40;
    const baseY = groundY;
    const sc = 1.0;
    return (
      <g key="lean" transform={`translate(${baseX}, ${baseY})`}>
        {/* Shadow on boardwalk */}
        <ellipse cx={6} cy={2} rx={20 * sc} ry={3 * sc} fill="rgba(0,0,0,0.45)" />
        {/* Boots */}
        <rect x={-8 * sc} y={-12 * sc} width={9 * sc} height={11 * sc} fill={fillSilDark} />
        <rect x={2 * sc} y={-12 * sc} width={9 * sc} height={11 * sc} fill={fillSilDark} />
        {/* Pants — slightly tilted because he's leaning */}
        <path d={`M ${-9 * sc} ${-12 * sc} L ${-7 * sc} ${-46 * sc} L ${12 * sc} ${-46 * sc} L ${11 * sc} ${-12 * sc} Z`} fill={fillSil} />
        {/* Gun belt */}
        <rect x={-9 * sc} y={-50 * sc} width={22 * sc} height={5 * sc} fill="rgba(50,30,15,0.95)" />
        {/* Holster bulge */}
        <path d={`M ${10 * sc} ${-49 * sc} L ${16 * sc} ${-43 * sc} L ${15 * sc} ${-36 * sc} L ${10 * sc} ${-38 * sc} Z`} fill="rgba(40,22,10,0.95)" />
        {/* Vest / torso — leaning (offset top right) */}
        <path d={`M ${-10 * sc} ${-50 * sc} L ${-6 * sc} ${-78 * sc} L ${16 * sc} ${-78 * sc} L ${14 * sc} ${-50 * sc} Z`} fill={fillSil} />
        {/* Vest opening */}
        <line x1={5 * sc} y1={-78 * sc} x2={5 * sc} y2={-50 * sc} stroke="rgba(80,55,30,0.85)" strokeWidth={1} />
        {/* Arm crossed in front */}
        <path d={`M ${-6 * sc} ${-72 * sc} L ${-14 * sc} ${-58 * sc} L ${-10 * sc} ${-54 * sc} L ${-2 * sc} ${-66 * sc} Z`} fill={fillSil} />
        {/* Other arm hanging down to thumb-in-belt */}
        <path d={`M ${14 * sc} ${-72 * sc} L ${20 * sc} ${-58 * sc} L ${17 * sc} ${-50 * sc} L ${12 * sc} ${-58 * sc} Z`} fill={fillSil} />
        {/* Neck */}
        <rect x={2 * sc} y={-84 * sc} width={6 * sc} height={6 * sc} fill={fillSil} />
        {/* Head — tilted down (hat shading the face) */}
        <ellipse cx={5 * sc} cy={-90 * sc} rx={6 * sc} ry={7 * sc} fill={fillSil} />
        {/* Cowboy hat — tilted down */}
        <path d={`M ${-7 * sc} ${-93 * sc} L ${-2 * sc} ${-104 * sc} L ${12 * sc} ${-104 * sc} L ${18 * sc} ${-93 * sc} L ${15 * sc} ${-91 * sc} L ${-4 * sc} ${-91 * sc} Z`} fill={fillSilDark} />
        <ellipse cx={5 * sc} cy={-92 * sc} rx={13 * sc} ry={1.8 * sc} fill={fillSilDark} />
        {/* Cigarette glow */}
        <circle cx={-1 * sc} cy={-87 * sc} r={0.8} fill="rgba(255,150,40,0.95)" opacity={0.6 + snap.beatDecay * 0.4} />
      </g>
    );
  };

  /* Cowboy 2: standing in the swinging doors (silhouette in doorway) */
  const renderDoorwayCowboy = () => {
    const baseX = doorCx;
    const baseY = doorBot;
    const sc = 0.95;
    return (
      <g key="doorway" transform={`translate(${baseX}, ${baseY})`}>
        {/* Boots */}
        <rect x={-7 * sc} y={-10 * sc} width={6 * sc} height={9 * sc} fill={fillSilDark} />
        <rect x={1 * sc} y={-10 * sc} width={6 * sc} height={9 * sc} fill={fillSilDark} />
        {/* Pants */}
        <path d={`M ${-8 * sc} ${-10 * sc} L ${-7 * sc} ${-44 * sc} L ${8 * sc} ${-44 * sc} L ${7 * sc} ${-10 * sc} Z`} fill={fillSilDark} />
        {/* Belt */}
        <rect x={-8 * sc} y={-48 * sc} width={16 * sc} height={4 * sc} fill={fillSilDark} />
        {/* Long duster coat — flares out */}
        <path d={`M ${-12 * sc} ${-44 * sc} L ${-14 * sc} ${-12 * sc} L ${-10 * sc} ${-12 * sc} L ${-8 * sc} ${-44 * sc} Z`} fill={fillSilDark} />
        <path d={`M ${12 * sc} ${-44 * sc} L ${14 * sc} ${-12 * sc} L ${10 * sc} ${-12 * sc} L ${8 * sc} ${-44 * sc} Z`} fill={fillSilDark} />
        {/* Torso */}
        <path d={`M ${-11 * sc} ${-48 * sc} L ${-9 * sc} ${-78 * sc} L ${9 * sc} ${-78 * sc} L ${11 * sc} ${-48 * sc} Z`} fill={fillSilDark} />
        {/* Arms hanging — gunslinger ready stance */}
        <path d={`M ${-9 * sc} ${-72 * sc} L ${-13 * sc} ${-50 * sc} L ${-9 * sc} ${-50 * sc} L ${-6 * sc} ${-72 * sc} Z`} fill={fillSilDark} />
        <path d={`M ${9 * sc} ${-72 * sc} L ${13 * sc} ${-50 * sc} L ${9 * sc} ${-50 * sc} L ${6 * sc} ${-72 * sc} Z`} fill={fillSilDark} />
        {/* Head */}
        <ellipse cx={0} cy={-86 * sc} rx={6 * sc} ry={7 * sc} fill={fillSilDark} />
        {/* Wide-brim hat */}
        <ellipse cx={0} cy={-90 * sc} rx={15 * sc} ry={2 * sc} fill={fillSilDark} />
        <path d={`M ${-8 * sc} ${-90 * sc} L ${-5 * sc} ${-102 * sc} L ${5 * sc} ${-102 * sc} L ${8 * sc} ${-90 * sc} Z`} fill={fillSilDark} />
      </g>
    );
  };

  /* Hitched horse — to the left of the saloon */
  const renderHorse = () => {
    const baseX = buildingLeft - 70;
    const baseY = groundY;
    const sc = 1.0;
    const tailSway = Math.sin(frame * 0.07) * 3;
    const headBob = Math.sin(frame * 0.04) * 1.5;
    return (
      <g key="horse" transform={`translate(${baseX}, ${baseY})`}>
        {/* Shadow */}
        <ellipse cx={0} cy={2} rx={48 * sc} ry={4 * sc} fill="rgba(0,0,0,0.45)" />
        {/* Legs */}
        <rect x={-32 * sc} y={-30 * sc} width={6 * sc} height={30 * sc} fill={fillSilDark} />
        <rect x={-18 * sc} y={-30 * sc} width={6 * sc} height={30 * sc} fill={fillSilDark} />
        <rect x={18 * sc} y={-30 * sc} width={6 * sc} height={30 * sc} fill={fillSilDark} />
        <rect x={32 * sc} y={-30 * sc} width={6 * sc} height={30 * sc} fill={fillSilDark} />
        {/* Body */}
        <ellipse cx={0} cy={-42 * sc} rx={42 * sc} ry={16 * sc} fill={fillSil} />
        {/* Saddle */}
        <path d={`M ${-12 * sc} ${-58 * sc} Q 0 ${-64 * sc} ${12 * sc} ${-58 * sc} L ${10 * sc} ${-50 * sc} L ${-10 * sc} ${-50 * sc} Z`} fill="rgba(60,35,18,0.95)" />
        {/* Saddle horn */}
        <rect x={-2 * sc} y={-66 * sc} width={4 * sc} height={6 * sc} rx={1} fill="rgba(70,42,22,0.95)" />
        {/* Tail */}
        <path d={`M ${42 * sc} ${-44 * sc} Q ${52 * sc + tailSway} ${-30 * sc} ${48 * sc + tailSway} ${-12 * sc} L ${44 * sc + tailSway * 0.7} ${-14 * sc} Q ${48 * sc + tailSway * 0.7} ${-30 * sc} ${40 * sc} ${-42 * sc} Z`} fill={fillSil} />
        {/* Neck */}
        <path d={`M ${-38 * sc} ${-50 * sc} L ${-50 * sc} ${-72 * sc + headBob} L ${-44 * sc} ${-74 * sc + headBob} L ${-32 * sc} ${-54 * sc} Z`} fill={fillSil} />
        {/* Head */}
        <ellipse cx={-50 * sc} cy={-78 * sc + headBob} rx={9 * sc} ry={6 * sc} fill={fillSil} />
        {/* Ears */}
        <path d={`M ${-52 * sc} ${-83 * sc + headBob} L ${-54 * sc} ${-89 * sc + headBob} L ${-49 * sc} ${-85 * sc + headBob} Z`} fill={fillSil} />
        <path d={`M ${-46 * sc} ${-83 * sc + headBob} L ${-47 * sc} ${-89 * sc + headBob} L ${-43 * sc} ${-85 * sc + headBob} Z`} fill={fillSil} />
        {/* Mane */}
        <path d={`M ${-44 * sc} ${-72 * sc + headBob * 0.6} L ${-40 * sc} ${-66 * sc} L ${-36 * sc} ${-72 * sc} L ${-32 * sc} ${-64 * sc} L ${-38 * sc} ${-58 * sc} Z`} fill={fillSilDark} />
        {/* Reins to hitching post */}
        <line x1={-54 * sc} y1={-76 * sc + headBob} x2={-72 * sc} y2={-46 * sc} stroke="rgba(60,38,20,0.9)" strokeWidth={1.6} />
      </g>
    );
  };

  /* ----------------------------------------------------------------- */
  /*  Render                                                            */
  /* ----------------------------------------------------------------- */
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", opacity: masterOpacity }}>
      <svg width={width} height={height}>
        <defs>
          <linearGradient id="cs-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={skyTop} />
            <stop offset="0.55" stopColor={skyMid} />
            <stop offset="1" stopColor={skyBot} />
          </linearGradient>
          <linearGradient id="cs-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(150,110,70,0.9)" />
            <stop offset="1" stopColor="rgba(100,70,40,0.95)" />
          </linearGradient>
          <linearGradient id="cs-facade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(120,80,45,0.95)" />
            <stop offset="1" stopColor="rgba(85,55,28,0.95)" />
          </linearGradient>
          <radialGradient id="cs-lantern" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={lanternColor} stopOpacity="0.95" />
            <stop offset="1" stopColor={lanternColor} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cs-doorglow" cx="0.5" cy="0.4" r="0.6">
            <stop offset="0" stopColor="rgba(255,200,100,0.85)" />
            <stop offset="1" stopColor="rgba(255,180,80,0)" />
          </radialGradient>
          <filter id="cs-blur"><feGaussianBlur stdDeviation="2" /></filter>
        </defs>

        {/* Sky */}
        <rect x={0} y={0} width={width} height={horizonY + 30} fill="url(#cs-sky)" />

        {/* Distant mesa silhouette */}
        <path d={mesaPath} fill="rgba(70,40,55,0.85)" />
        {/* Closer mesa ridge — slightly darker */}
        <path d={`M 0 ${horizonY + 4} L ${width * 0.3} ${horizonY - 4} L ${width * 0.32} ${horizonY + 8} L ${width * 0.6} ${horizonY + 2} L ${width * 0.62} ${horizonY - 6} L ${width * 0.95} ${horizonY + 2} L ${width} ${horizonY + 8} L ${width} ${horizonY + 30} L 0 ${horizonY + 30} Z`}
          fill="rgba(50,28,38,0.9)" />

        {/* Sun disc — sits on the horizon, drifts slightly with sunset */}
        <circle cx={width * 0.16} cy={horizonY - 18 + sunsetT * 8} r={26 + snap.beatDecay * 4}
          fill={`rgb(${Math.round(255 + hueShift * 0.3)}, ${Math.round(190 - sunsetT * 40)}, ${Math.round(110 - sunsetT * 50)})`}
          opacity={0.92} filter="url(#cs-blur)" />
        <circle cx={width * 0.16} cy={horizonY - 18 + sunsetT * 8} r={20}
          fill={`rgb(${Math.round(255)}, ${Math.round(220 - sunsetT * 40)}, ${Math.round(150 - sunsetT * 60)})`} />

        {/* Ground / dusty street */}
        <rect x={0} y={horizonY + 26} width={width} height={height - horizonY - 26} fill="url(#cs-ground)" />

        {/* Ground horizontal striations */}
        {Array.from({ length: 10 }).map((_, i) => {
          const yFrac = i / 10;
          const y = horizonY + 30 + yFrac * (height - horizonY - 30);
          return <line key={`gs${i}`} x1={0} y1={y} x2={width} y2={y + Math.sin(i * 1.7) * 1.5}
            stroke="rgba(70,45,22,0.4)" strokeWidth={0.6} opacity={0.4 + yFrac * 0.3} />;
        })}

        {/* Saloon shadow on ground */}
        <ellipse cx={buildingCx} cy={groundY + 4} rx={buildingW * 0.55} ry={6} fill="rgba(0,0,0,0.45)" />

        {/* False-front saloon facade — main rectangle */}
        <rect x={buildingLeft} y={buildingTop + 50} width={buildingW} height={groundY - buildingTop - 50}
          fill="url(#cs-facade)" stroke="rgba(40,22,10,0.95)" strokeWidth={2} />

        {/* False front (taller decorative wall above main building) */}
        <path d={`M ${buildingLeft - 8} ${buildingTop + 50} L ${buildingLeft - 8} ${buildingTop} L ${buildingRight + 8} ${buildingTop} L ${buildingRight + 8} ${buildingTop + 50} Z`}
          fill="rgba(105,68,38,0.95)" stroke="rgba(40,22,10,0.95)" strokeWidth={2} />
        {/* Decorative trim along the false-front top */}
        <rect x={buildingLeft - 12} y={buildingTop - 6} width={buildingW + 24} height={8} fill="rgba(60,35,18,0.95)" />
        {[...Array(8)].map((_, i) => {
          const tx = buildingLeft + (i + 0.5) * (buildingW / 8);
          return <rect key={`pin${i}`} x={tx - 3} y={buildingTop - 14} width={6} height={10} fill="rgba(80,50,25,0.95)" />;
        })}

        {/* Vertical plank lines on facade for texture */}
        {[...Array(14)].map((_, i) => {
          const px = buildingLeft + (i + 1) * (buildingW / 15);
          return <line key={`plk${i}`} x1={px} y1={buildingTop + 50} x2={px} y2={groundY}
            stroke="rgba(50,28,12,0.7)" strokeWidth={0.8} />;
        })}

        {/* Roof line shadow */}
        <rect x={buildingLeft} y={buildingTop + 50} width={buildingW} height={4} fill="rgba(30,18,8,0.9)" />

        {/* SALOON sign — hangs from creaking hinge */}
        <g transform={`translate(${buildingCx}, ${buildingTop + 20}) rotate(${signCreak})`}>
          {/* Hinge bracket */}
          <line x1={0} y1={-22} x2={0} y2={-8} stroke="rgba(40,25,10,1)" strokeWidth={2} />
          <circle cx={0} cy={-8} r={2} fill="rgba(120,80,40,1)" />
          {/* Sign board */}
          <rect x={-78} y={-8} width={156} height={36} rx={2} fill="rgba(180,140,80,0.95)" stroke="rgba(60,35,15,1)" strokeWidth={2} />
          {/* Wood grain */}
          <line x1={-78} y1={2} x2={78} y2={2} stroke="rgba(120,80,40,0.5)" strokeWidth={0.6} />
          <line x1={-78} y1={14} x2={78} y2={14} stroke="rgba(120,80,40,0.5)" strokeWidth={0.6} />
          {/* SALOON text */}
          <text x={0} y={18} textAnchor="middle" fontSize={26} fontWeight="bold"
            fontFamily="Georgia, serif" fill="rgba(50,25,5,1)" letterSpacing={4}>
            SALOON
          </text>
          {/* Bullet holes */}
          {signHoles.map((h, i) => {
            const hx = -78 + h.x * 156;
            const hy = -8 + h.y * 36;
            return (
              <g key={`bh${i}`}>
                <circle cx={hx} cy={hy} r={h.r + 1} fill="rgba(20,10,4,1)" />
                <circle cx={hx} cy={hy} r={h.r} fill="rgba(0,0,0,1)" />
                {/* Splinter cracks */}
                <line x1={hx} y1={hy} x2={hx + h.r * 3} y2={hy - 1} stroke="rgba(20,10,4,0.7)" strokeWidth={0.5} />
                <line x1={hx} y1={hy} x2={hx - h.r * 2.5} y2={hy + 1.5} stroke="rgba(20,10,4,0.7)" strokeWidth={0.5} />
                <line x1={hx} y1={hy} x2={hx + h.r * 0.5} y2={hy + h.r * 2} stroke="rgba(20,10,4,0.7)" strokeWidth={0.5} />
              </g>
            );
          })}
        </g>

        {/* Window left of door */}
        <rect x={buildingLeft + 20} y={doorTop - 30} width={60} height={70}
          fill="rgba(255,200,110,0.45)" stroke="rgba(40,22,10,0.95)" strokeWidth={2} />
        {/* Window cross frame */}
        <line x1={buildingLeft + 50} y1={doorTop - 30} x2={buildingLeft + 50} y2={doorTop + 40}
          stroke="rgba(40,22,10,0.95)" strokeWidth={1.5} />
        <line x1={buildingLeft + 20} y1={doorTop + 5} x2={buildingLeft + 80} y2={doorTop + 5}
          stroke="rgba(40,22,10,0.95)" strokeWidth={1.5} />
        {/* Curtain hint */}
        <path d={`M ${buildingLeft + 22} ${doorTop - 28} Q ${buildingLeft + 30} ${doorTop - 12} ${buildingLeft + 22} ${doorTop + 5}`}
          stroke="rgba(180,60,40,0.6)" strokeWidth={2} fill="none" />
        <path d={`M ${buildingLeft + 78} ${doorTop - 28} Q ${buildingLeft + 70} ${doorTop - 12} ${buildingLeft + 78} ${doorTop + 5}`}
          stroke="rgba(180,60,40,0.6)" strokeWidth={2} fill="none" />

        {/* Window right of door */}
        <rect x={buildingRight - 80} y={doorTop - 30} width={60} height={70}
          fill="rgba(255,200,110,0.45)" stroke="rgba(40,22,10,0.95)" strokeWidth={2} />
        <line x1={buildingRight - 50} y1={doorTop - 30} x2={buildingRight - 50} y2={doorTop + 40}
          stroke="rgba(40,22,10,0.95)" strokeWidth={1.5} />
        <line x1={buildingRight - 80} y1={doorTop + 5} x2={buildingRight - 20} y2={doorTop + 5}
          stroke="rgba(40,22,10,0.95)" strokeWidth={1.5} />
        <path d={`M ${buildingRight - 78} ${doorTop - 28} Q ${buildingRight - 70} ${doorTop - 12} ${buildingRight - 78} ${doorTop + 5}`}
          stroke="rgba(180,60,40,0.6)" strokeWidth={2} fill="none" />
        <path d={`M ${buildingRight - 22} ${doorTop - 28} Q ${buildingRight - 30} ${doorTop - 12} ${buildingRight - 22} ${doorTop + 5}`}
          stroke="rgba(180,60,40,0.6)" strokeWidth={2} fill="none" />

        {/* Doorway frame opening */}
        <rect x={doorCx - doorHalfW - 4} y={doorTop - 4} width={doorHalfW * 2 + 8} height={doorH + 4}
          fill="rgba(255,180,80,0.55)" />

        {/* Doorway warm light spill (radial) */}
        <ellipse cx={doorCx} cy={doorTop + doorH * 0.4} rx={doorHalfW * 1.6} ry={doorH * 0.55}
          fill="url(#cs-doorglow)" opacity={doorwayLight} />

        {/* Cowboy silhouette in doorway */}
        {renderDoorwayCowboy()}

        {/* Swinging doors — two half-doors at slightly different heights */}
        {/* Left half-door */}
        <g>
          <rect x={doorCx - doorHalfW - 1} y={doorTop + 24}
            width={doorHalfW - 2 + Math.sin(frame * 0.06) * doorSwing * 0.2}
            height={doorH * 0.5}
            fill="rgba(95,60,30,0.95)" stroke="rgba(40,22,10,1)" strokeWidth={1.2}
            transform={`rotate(${Math.sin(frame * 0.06) * (doorSwing * 0.4)} ${doorCx - doorHalfW} ${doorTop + 24})`}
          />
          {/* Slats */}
          {[0, 1, 2, 3].map((s) => (
            <line key={`lds${s}`}
              x1={doorCx - doorHalfW - 1} y1={doorTop + 30 + s * 12}
              x2={doorCx - 3} y2={doorTop + 30 + s * 12}
              stroke="rgba(40,22,10,0.95)" strokeWidth={1}
              transform={`rotate(${Math.sin(frame * 0.06) * (doorSwing * 0.4)} ${doorCx - doorHalfW} ${doorTop + 24})`}
            />
          ))}
        </g>
        {/* Right half-door — slightly shorter to suggest depth */}
        <g>
          <rect x={doorCx + 3} y={doorTop + 30}
            width={doorHalfW - 2 - Math.sin(frame * 0.06) * doorSwing * 0.2}
            height={doorH * 0.48}
            fill="rgba(105,68,34,0.95)" stroke="rgba(40,22,10,1)" strokeWidth={1.2}
            transform={`rotate(${-Math.sin(frame * 0.06) * (doorSwing * 0.4)} ${doorCx + doorHalfW} ${doorTop + 30})`}
          />
          {[0, 1, 2, 3].map((s) => (
            <line key={`rds${s}`}
              x1={doorCx + 3} y1={doorTop + 36 + s * 11}
              x2={doorCx + doorHalfW + 1} y2={doorTop + 36 + s * 11}
              stroke="rgba(40,22,10,0.95)" strokeWidth={1}
              transform={`rotate(${-Math.sin(frame * 0.06) * (doorSwing * 0.4)} ${doorCx + doorHalfW} ${doorTop + 30})`}
            />
          ))}
        </g>

        {/* Lantern hanging by the door */}
        <g transform={`translate(${buildingLeft + 100}, ${doorTop - 50})`}>
          {/* Glow halo */}
          <circle cx={0} cy={12} r={28 * lanternPulse} fill="url(#cs-lantern)" opacity={0.85 * lanternPulse} />
          <circle cx={0} cy={12} r={50 * lanternPulse} fill="url(#cs-lantern)" opacity={0.35 * lanternPulse} filter="url(#cs-blur)" />
          {/* Hanging chain */}
          <line x1={0} y1={-8} x2={0} y2={2} stroke="rgba(40,25,10,1)" strokeWidth={1.5} />
          {/* Lantern frame top */}
          <path d={`M -8 2 L 8 2 L 6 6 L -6 6 Z`} fill="rgba(40,25,10,1)" />
          {/* Lantern glass body */}
          <rect x={-7} y={6} width={14} height={16} rx={1} fill={lanternColor} opacity={0.85 * lanternPulse} stroke="rgba(40,25,10,1)" strokeWidth={1} />
          {/* Lantern wick highlight */}
          <ellipse cx={0} cy={14} rx={2} ry={4} fill="rgba(255,240,200,1)" opacity={0.95 * lanternPulse} />
          {/* Lantern frame bottom */}
          <path d={`M -8 22 L 8 22 L 6 26 L -6 26 Z`} fill="rgba(40,25,10,1)" />
        </g>

        {/* Boardwalk in front of saloon */}
        <rect x={buildingLeft - 12} y={groundY} width={buildingW + 24} height={20}
          fill="rgba(95,60,30,0.95)" stroke="rgba(40,22,10,1)" strokeWidth={1.5} />
        {/* Plank divisions */}
        {planks.map((p, i) => {
          const px = buildingLeft - 12 + p.x * (buildingW + 24);
          const pw = p.w * (buildingW + 24);
          const tone = 75 + p.tone * 35;
          return (
            <g key={`plank${i}`}>
              <rect x={px} y={groundY} width={pw} height={20} fill={`rgba(${tone}, ${tone * 0.65}, ${tone * 0.35}, 0.95)`} />
              <line x1={px + pw} y1={groundY} x2={px + pw} y2={groundY + 20} stroke="rgba(30,18,8,0.95)" strokeWidth={0.8} />
              {/* Knot */}
              {p.knot > 0.6 && (
                <ellipse cx={px + pw * 0.5} cy={groundY + 8 + p.knot * 6} rx={1.5} ry={1} fill="rgba(40,22,10,0.95)" />
              )}
            </g>
          );
        })}
        {/* Boardwalk shadow underneath */}
        <rect x={buildingLeft - 12} y={groundY + 20} width={buildingW + 24} height={4} fill="rgba(0,0,0,0.6)" />

        {/* Hitching post — left of the saloon */}
        <g>
          {/* Vertical posts */}
          <rect x={buildingLeft - 95} y={groundY - 36} width={6} height={42} fill="rgba(70,42,18,0.98)" />
          <rect x={buildingLeft - 55} y={groundY - 36} width={6} height={42} fill="rgba(70,42,18,0.98)" />
          {/* Horizontal rail */}
          <rect x={buildingLeft - 100} y={groundY - 36} width={50} height={5} fill="rgba(85,55,25,0.98)" />
          {/* Knot/wrap of reins */}
          <ellipse cx={buildingLeft - 70} cy={groundY - 32} rx={3} ry={2} fill="rgba(50,30,12,1)" />
        </g>

        {/* Horse hitched at post */}
        {renderHorse()}

        {/* Leaning cowboy against saloon */}
        {renderLeanCowboy()}

        {/* Tumbleweed rolling across the dusty street */}
        <g transform={`translate(${tumbleX}, ${tumbleBounceY}) rotate(${tumbleRot})`}>
          <circle cx={0} cy={0} r={20} fill="none" stroke="rgba(140,100,55,0.85)" strokeWidth={1.4} />
          <circle cx={0} cy={0} r={16} fill="none" stroke="rgba(155,115,65,0.7)" strokeWidth={1} />
          {Array.from({ length: 22 }).map((_, i) => {
            const a1 = (i / 22) * Math.PI * 2;
            const a2 = a1 + 1.7 + (i % 3) * 0.4;
            const r1 = 4 + (i % 5) * 3;
            const r2 = 12 + (i % 4) * 4;
            return (
              <line key={`tw${i}`}
                x1={Math.cos(a1) * r1} y1={Math.sin(a1) * r1}
                x2={Math.cos(a2) * r2} y2={Math.sin(a2) * r2}
                stroke="rgba(135,95,50,0.75)" strokeWidth={0.9} strokeLinecap="round" />
            );
          })}
          {/* A couple of cross strokes */}
          <line x1={-14} y1={-6} x2={12} y2={8} stroke="rgba(125,85,40,0.7)" strokeWidth={1} />
          <line x1={-8} y1={12} x2={14} y2={-10} stroke="rgba(125,85,40,0.7)" strokeWidth={1} />
        </g>

        {/* Dust kicked up behind the tumbleweed */}
        {Array.from({ length: 5 }).map((_, i) => {
          const dx = tumbleX + 30 + i * 8;
          const dy = tumbleBounceY + 18 - i * 1.5;
          const dr = 3 + i * 1.2;
          return <ellipse key={`tdust${i}`} cx={dx} cy={dy} rx={dr} ry={dr * 0.5}
            fill="rgba(180,140,90,0.4)" opacity={(0.7 - i * 0.12) * dustIntensity} filter="url(#cs-blur)" />;
        })}

        {/* Ambient dust motes drifting in the air */}
        {dustMotes.map((m, i) => {
          const mx = (m.x * width + Math.sin(frame * m.speed * 0.01 + m.phase) * 30) % width;
          const my = horizonY + 30 + m.y * (height - horizonY - 30) + Math.sin(frame * 0.02 + m.phase) * 4;
          const op = (0.18 + Math.sin(frame * 0.03 + m.phase) * 0.12) * dustIntensity;
          return <circle key={`dm${i}`} cx={mx} cy={my} r={m.r}
            fill="rgba(220,180,130,0.7)" opacity={op} />;
        })}

        {/* Hot dry-air shimmer near horizon */}
        {Array.from({ length: 6 }).map((_, i) => {
          const hy = horizonY + 14 + i * 3;
          const offset = Math.sin(frame * 0.03 + i * 0.8) * 4;
          return <line key={`shim${i}`} x1={0} y1={hy} x2={width} y2={hy + offset}
            stroke="rgba(255,200,140,0.18)" strokeWidth={0.8} opacity={0.4} filter="url(#cs-blur)" />;
        })}

        {/* Warm western light wash over the whole scene (hue-shifted) */}
        <rect x={0} y={0} width={width} height={height}
          fill={`rgba(${Math.round(255 + hueShift * 0.3)}, ${Math.round(180 - sunsetT * 30)}, ${Math.round(110 - sunsetT * 30)}, 0.06)`} />
      </svg>
    </div>
  );
};
