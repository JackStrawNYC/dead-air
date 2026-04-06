/**
 * WichitaTulsa — A+++ outlaw train robbery sunset for Jack Straw.
 *
 * Bob Weir's classic outlaw ballad: "leaving Texas, fourth day of July…
 * Wichita to Tulsa." A steam locomotive rolls slowly across a vast prairie
 * sunset while two masked horsemen ride alongside, pistols raised, kicking
 * up dust. Telegraph poles tick past, mesas brood in the distance, the sky
 * burns red and purple, and heat haze ripples up off the plain.
 *
 * Audio reactivity:
 *   - energy        → action intensity, dust density, hoof kick amplitude
 *   - bass          → train rumble, hoof beat thumps
 *   - beatDecay     → smokestack puff pulse, locomotive piston flash
 *   - slowEnergy    → sunset progression (gold → blood → purple)
 *   - chromaHue     → warm sunset tint (amber ↔ rose ↔ violet)
 *   - onsetEnvelope → pistol muzzle flash + powder smoke puff
 *   - tempoFactor   → chase speed (train + horses ride faster on uptempo)
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Cycle timing                                                       */
/* ------------------------------------------------------------------ */

const CYCLE_TOTAL = 1860; // 62s
const VISIBLE_DURATION = 660; // 22s

/* ------------------------------------------------------------------ */
/*  Deterministic data                                                 */
/* ------------------------------------------------------------------ */

interface Sage { x: number; y: number; s: number; lean: number; }
interface Pole { x: number; sag: number; }
interface DustPuff { x: number; y: number; r: number; phase: number; drift: number; }
interface Tumble { startX: number; y: number; speed: number; r: number; phaseOffset: number; }
interface Star { x: number; y: number; tw: number; }

function generateSagebrush(seed: number, count: number): Sage[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: rng(),
    y: 0.78 + rng() * 0.18,
    s: 0.5 + rng() * 0.9,
    lean: -0.4 + rng() * 0.8,
  }));
}

function generatePoles(seed: number, count: number): Pole[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: i / (count - 1),
    sag: 0.7 + rng() * 0.5,
  }));
}

function generateDust(seed: number, count: number): DustPuff[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: rng(),
    y: rng(),
    r: 1.5 + rng() * 4,
    phase: rng() * Math.PI * 2,
    drift: 0.3 + rng() * 0.7,
  }));
}

function generateTumbles(seed: number, count: number): Tumble[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    startX: rng() * 1.4,
    y: 0.81 + rng() * 0.1,
    speed: 0.4 + rng() * 0.5,
    r: 6 + rng() * 6,
    phaseOffset: rng() * 1000,
  }));
}

function generateStars(seed: number, count: number): Star[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: rng(),
    y: rng() * 0.35,
    tw: rng() * Math.PI * 2,
  }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props { frames: EnhancedFrameData[]; }

export const WichitaTulsa: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const sage = React.useMemo(() => generateSagebrush(7041977, 24), []);
  const poles = React.useMemo(() => generatePoles(7041978, 9), []);
  const dust = React.useMemo(() => generateDust(7041979, 60), []);
  const tumbles = React.useMemo(() => generateTumbles(7041980, 3), []);
  const stars = React.useMemo(() => generateStars(7041981, 22), []);

  /* Cycle gating */
  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;

  const fadeIn = interpolate(progress, [0, 0.07], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.93, 1], [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.93;
  if (masterOpacity < 0.01) return null;

  /* Audio drives */
  const action = interpolate(snap.energy, [0.03, 0.32], [0.4, 1.4],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rumble = interpolate(snap.bass, [0, 0.6], [0.5, 4.5],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sunsetT = interpolate(snap.slowEnergy, [0.02, 0.28], [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hueShift = interpolate(snap.chromaHue, [0, 1], [-26, 26]);
  const smokePulse = 0.65 + snap.beatDecay * 0.45;
  const muzzleFire = snap.onsetEnvelope;

  /* Sky / sunset palette */
  const skyTopR = Math.round(interpolate(sunsetT, [0, 1], [55, 30]));
  const skyTopG = Math.round(interpolate(sunsetT, [0, 1], [40, 14]));
  const skyTopB = Math.round(interpolate(sunsetT, [0, 1], [95, 65]) - hueShift * 0.4);
  const skyMidR = Math.round(interpolate(sunsetT, [0, 1], [200, 230]) + hueShift * 0.5);
  const skyMidG = Math.round(interpolate(sunsetT, [0, 1], [85, 55]));
  const skyMidB = Math.round(interpolate(sunsetT, [0, 1], [110, 75]) - hueShift * 0.3);
  const skyBotR = Math.round(255 + hueShift * 0.2);
  const skyBotG = Math.round(interpolate(sunsetT, [0, 1], [165, 110]));
  const skyBotB = Math.round(interpolate(sunsetT, [0, 1], [70, 50]));
  const skyTop = `rgb(${skyTopR}, ${skyTopG}, ${skyTopB})`;
  const skyMid = `rgb(${skyMidR}, ${skyMidG}, ${skyMidB})`;
  const skyBot = `rgb(${skyBotR}, ${skyBotG}, ${skyBotB})`;

  /* Layout */
  const horizonY = height * 0.6;
  const groundTopY = height * 0.6;
  const trackY = height * 0.66;
  const sunY = horizonY - 6;
  const sunR = Math.round(56 + sunsetT * 18);

  /* Mesa silhouette */
  const mesaPath =
    `M 0 ${horizonY} ` +
    `L ${width * 0.04} ${horizonY - 4} ` +
    `L ${width * 0.07} ${horizonY - 22} ` +
    `L ${width * 0.13} ${horizonY - 28} ` +
    `L ${width * 0.16} ${horizonY - 18} ` +
    `L ${width * 0.19} ${horizonY - 8} ` +
    `L ${width * 0.36} ${horizonY - 6} ` +
    `L ${width * 0.40} ${horizonY - 24} ` +
    `L ${width * 0.46} ${horizonY - 32} ` +
    `L ${width * 0.51} ${horizonY - 30} ` +
    `L ${width * 0.55} ${horizonY - 18} ` +
    `L ${width * 0.60} ${horizonY - 12} ` +
    `L ${width * 0.78} ${horizonY - 10} ` +
    `L ${width * 0.82} ${horizonY - 26} ` +
    `L ${width * 0.88} ${horizonY - 38} ` +
    `L ${width * 0.93} ${horizonY - 30} ` +
    `L ${width * 0.96} ${horizonY - 12} ` +
    `L ${width} ${horizonY - 6} ` +
    `L ${width} ${horizonY + 8} L 0 ${horizonY + 8} Z`;

  /* Train motion: rolls slowly L→R across the frame */
  const trainSpeed = 0.55 + tempoFactor * 0.55;
  const trainProgress = ((cycleFrame * trainSpeed) % VISIBLE_DURATION) / VISIBLE_DURATION;
  const TRAIN_W = 720;
  const trainBaseX = interpolate(trainProgress, [0, 1], [-TRAIN_W * 0.6, width * 1.05]);
  const trainY = trackY - 50;
  const trainChug = Math.sin(frame * 0.45) * (0.6 + rumble * 0.3);
  const wheelRot = (frame * (3.2 + tempoFactor * 1.4)) % 360;

  /* Horsemen ride alongside train, slightly faster, parallel */
  const horseProgress = ((cycleFrame * (trainSpeed * 1.15)) % VISIBLE_DURATION) / VISIBLE_DURATION;
  const horseBaseX = interpolate(horseProgress, [0, 1], [-220, width * 1.02]);
  const horseY = trackY + 38;
  const gallop = Math.sin(frame * 0.6) * (1.5 + action * 1.5);

  /* Pistol fire flash — onset-driven, but only when horsemen are mid-frame */
  const horsemenOnscreen = horseBaseX > -50 && horseBaseX < width + 50;
  const pistolFlash = horsemenOnscreen ? muzzleFire : 0;

  /* Ground / dust palette tinted to sunset */
  const groundR = Math.round(120 - sunsetT * 25 + hueShift * 0.3);
  const groundG = Math.round(75 - sunsetT * 18);
  const groundB = Math.round(45 - sunsetT * 8);
  const groundTop = `rgb(${groundR}, ${groundG}, ${groundB})`;
  const groundBot = `rgb(${groundR - 35}, ${groundG - 28}, ${groundB - 18})`;

  const sil = "rgba(10,8,6,0.96)";
  const silSoft = "rgba(18,12,8,0.88)";
  const farSil = "rgba(35,22,30,0.85)";

  /* ----------------------------------------------------------------- */
  /*  Sub-renderers                                                     */
  /* ----------------------------------------------------------------- */

  const renderTrain = () => {
    const tx = trainBaseX;
    const ty = trainY + trainChug;
    return (
      <g transform={`translate(${tx}, ${ty})`}>
        {/* Long shadow under train */}
        <ellipse cx={360} cy={62} rx={380} ry={6} fill="rgba(0,0,0,0.55)" />
        {/* Coupling shadows for cars */}
        {/* Tracks under train (elevated detail) */}
        <line x1={-20} y1={62} x2={740} y2={62} stroke="rgba(40,28,18,0.9)" strokeWidth={2.4} />
        <line x1={-20} y1={66} x2={740} y2={66} stroke="rgba(20,14,8,0.95)" strokeWidth={1.6} />

        {/* === Locomotive === */}
        {/* Cowcatcher */}
        <path d="M 545 50 L 600 56 L 605 60 L 540 60 Z" fill={sil} />
        {/* Boiler (long cylinder) */}
        <rect x={420} y={20} width={185} height={40} rx={20} fill={sil} />
        {/* Boiler bands */}
        <line x1={440} y1={22} x2={440} y2={58} stroke="rgba(255,180,90,0.35)" strokeWidth={1.2} />
        <line x1={490} y1={22} x2={490} y2={58} stroke="rgba(255,180,90,0.3)" strokeWidth={1.2} />
        <line x1={540} y1={22} x2={540} y2={58} stroke="rgba(255,180,90,0.3)" strokeWidth={1.2} />
        {/* Headlight (warm glow on the front) */}
        <circle cx={595} cy={36} r={5} fill="rgba(255,210,120,0.95)"
          opacity={0.85 + snap.beatDecay * 0.15} />
        <circle cx={595} cy={36} r={11} fill="rgba(255,180,80,0.35)" />
        {/* Smokestack */}
        <rect x={446} y={-12} width={16} height={32} fill={sil} />
        <rect x={440} y={-16} width={28} height={6} rx={2} fill={sil} />
        {/* Steam dome */}
        <ellipse cx={495} cy={20} rx={12} ry={8} fill={sil} />
        {/* Sand dome */}
        <ellipse cx={520} cy={22} rx={9} ry={6} fill={sil} />
        {/* Cab */}
        <rect x={370} y={4} width={56} height={56} fill={sil} />
        <rect x={366} y={0} width={64} height={6} fill={sil} />
        {/* Cab window — warm interior glow */}
        <rect x={382} y={14} width={32} height={20} fill="rgba(255,165,75,0.85)"
          opacity={0.7 + snap.beatDecay * 0.25} />
        <rect x={384} y={16} width={28} height={16} fill="rgba(255,210,120,0.4)" />
        {/* Cab roof overhang */}
        <line x1={366} y1={6} x2={430} y2={6} stroke="rgba(255,140,60,0.35)" strokeWidth={1} />

        {/* Locomotive drive wheels (three big) */}
        {[450, 500, 550].map((cx, i) => (
          <g key={`dw${i}`} transform={`rotate(${wheelRot} ${cx} 60)`}>
            <circle cx={cx} cy={60} r={16} fill={sil} stroke="rgba(40,26,16,0.95)" strokeWidth={2} />
            {[0, 60, 120].map((a) => (
              <line key={a}
                x1={cx + Math.cos(a * Math.PI / 180) * 4}
                y1={60 + Math.sin(a * Math.PI / 180) * 4}
                x2={cx + Math.cos(a * Math.PI / 180) * 14}
                y2={60 + Math.sin(a * Math.PI / 180) * 14}
                stroke="rgba(60,40,22,0.9)" strokeWidth={2} />
            ))}
            <circle cx={cx} cy={60} r={3} fill="rgba(80,52,28,0.95)" />
          </g>
        ))}
        {/* Connecting rod between drive wheels (piston flash) */}
        <line
          x1={450 + Math.cos(wheelRot * Math.PI / 180) * 11}
          y1={60 + Math.sin(wheelRot * Math.PI / 180) * 11}
          x2={550 + Math.cos(wheelRot * Math.PI / 180) * 11}
          y2={60 + Math.sin(wheelRot * Math.PI / 180) * 11}
          stroke="rgba(255,170,70,0.75)"
          strokeWidth={2.4}
          opacity={0.55 + snap.beatDecay * 0.45}
        />
        {/* Pilot truck wheel */}
        <circle cx={580} cy={62} r={9} fill={sil} />

        {/* === Tender === */}
        <rect x={290} y={15} width={75} height={45} fill={sil} />
        <rect x={295} y={20} width={65} height={20} fill="rgba(35,22,12,0.95)" />
        <circle cx={310} cy={62} r={11} fill={sil} />
        <circle cx={345} cy={62} r={11} fill={sil} />

        {/* === Boxcar 1 === */}
        <rect x={195} y={8} width={90} height={52} fill={sil} />
        <rect x={203} y={12} width={74} height={4} fill="rgba(40,28,16,0.95)" />
        <rect x={233} y={20} width={14} height={32} fill="rgba(50,32,18,0.95)" />
        <line x1={240} y1={20} x2={240} y2={52} stroke="rgba(15,10,6,0.95)" strokeWidth={1} />
        <circle cx={210} cy={62} r={11} fill={sil} />
        <circle cx={270} cy={62} r={11} fill={sil} />

        {/* === Passenger car === */}
        <rect x={95} y={4} width={95} height={56} fill={sil} />
        <rect x={92} y={0} width={101} height={6} fill={sil} />
        {/* Passenger windows — warm lit */}
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={102 + i * 17} y={16} width={12} height={18}
            fill="rgba(255,170,70,0.85)" opacity={0.7 + snap.beatDecay * 0.2} />
        ))}
        <circle cx={112} cy={62} r={11} fill={sil} />
        <circle cx={172} cy={62} r={11} fill={sil} />

        {/* === Caboose === */}
        <rect x={20} y={14} width={70} height={46} fill={sil} />
        <rect x={28} y={2} width={54} height={14} fill={sil} />
        <rect x={40} y={6} width={30} height={8} fill="rgba(255,165,75,0.7)" opacity={0.65 + snap.beatDecay * 0.25} />
        <circle cx={36} cy={62} r={11} fill={sil} />
        <circle cx={76} cy={62} r={11} fill={sil} />

        {/* === Couplings === */}
        <rect x={88} y={50} width={9} height={4} fill={sil} />
        <rect x={188} y={50} width={9} height={4} fill={sil} />
        <rect x={283} y={50} width={9} height={4} fill={sil} />
        <rect x={363} y={50} width={9} height={4} fill={sil} />

        {/* === Smokestack billowing trail === */}
        <g opacity={smokePulse}>
          {Array.from({ length: 18 }).map((_, i) => {
            const t = i / 17;
            const px = 454 - i * 26 - Math.sin(frame * 0.04 + i) * 4;
            const py = -18 - i * 10 + Math.sin(frame * 0.03 + i * 0.5) * 3;
            const pr = 8 + i * 2.6 + smokePulse * 4;
            const op = (1 - t) * 0.55;
            return (
              <circle key={`sm${i}`} cx={px} cy={py} r={pr}
                fill={`rgba(${180 - i * 4},${165 - i * 4},${155 - i * 4},${op})`} />
            );
          })}
        </g>
      </g>
    );
  };

  const renderHorseman = (offsetX: number, leadOrTrail: "lead" | "trail", pistolUp: boolean) => {
    const hx = horseBaseX + offsetX;
    const hy = horseY + (leadOrTrail === "trail" ? 6 : 0) + gallop;
    const legPhase = Math.sin(frame * 0.55 + (leadOrTrail === "trail" ? 1.3 : 0));
    const legPhase2 = Math.sin(frame * 0.55 + Math.PI + (leadOrTrail === "trail" ? 1.3 : 0));
    return (
      <g transform={`translate(${hx}, ${hy})`}>
        {/* Shadow */}
        <ellipse cx={20} cy={48} rx={50} ry={4} fill="rgba(0,0,0,0.55)" />
        {/* Horse body */}
        <ellipse cx={20} cy={20} rx={42} ry={14} fill={sil} />
        {/* Horse chest */}
        <ellipse cx={-12} cy={18} rx={14} ry={12} fill={sil} />
        {/* Horse rump */}
        <ellipse cx={50} cy={16} rx={16} ry={14} fill={sil} />
        {/* Tail streaming back */}
        <path d={`M 64 18 Q ${74 + Math.sin(frame * 0.08) * 3} ${24 + Math.sin(frame * 0.12) * 2} ${68 + Math.sin(frame * 0.08) * 2} ${36}`}
          stroke={sil} strokeWidth={4} fill="none" strokeLinecap="round" />
        {/* Neck */}
        <path d="M -18 14 L -28 -2 L -22 -8 L -10 8 Z" fill={sil} />
        {/* Head */}
        <ellipse cx={-30} cy={-6} rx={9} ry={6} fill={sil} />
        {/* Snout */}
        <ellipse cx={-37} cy={-3} rx={4} ry={3} fill={sil} />
        {/* Ears */}
        <path d="M -28 -12 L -30 -18 L -25 -14 Z" fill={sil} />
        {/* Mane streaming */}
        <path d="M -22 -8 L -16 -2 L -12 -8 L -6 0 L -2 -6 L 4 2 Z" fill={silSoft} />

        {/* Galloping legs — alternating gallop pose */}
        <line x1={-2} y1={32} x2={-8 + legPhase * 6} y2={48 + legPhase * 2}
          stroke={sil} strokeWidth={5} strokeLinecap="round" />
        <line x1={6} y1={32} x2={2 + legPhase2 * 6} y2={48 + legPhase2 * 2}
          stroke={sil} strokeWidth={5} strokeLinecap="round" />
        <line x1={36} y1={30} x2={42 + legPhase2 * 6} y2={48 + legPhase2 * 2}
          stroke={sil} strokeWidth={5} strokeLinecap="round" />
        <line x1={46} y1={30} x2={50 + legPhase * 6} y2={48 + legPhase * 2}
          stroke={sil} strokeWidth={5} strokeLinecap="round" />

        {/* Saddle */}
        <path d="M 8 6 Q 20 0 32 6 L 30 14 L 10 14 Z" fill="rgba(50,28,12,0.95)" />
        <rect x={18} y={-2} width={4} height={6} rx={1} fill="rgba(60,34,16,0.95)" />

        {/* === Rider === */}
        {/* Legs astride saddle */}
        <path d="M 8 4 L 4 18 L 10 22 L 14 8 Z" fill={sil} />
        <path d="M 28 4 L 32 18 L 26 22 L 22 8 Z" fill={sil} />
        {/* Torso (slight forward lean) */}
        <path d="M 10 -4 L 14 -22 L 24 -22 L 28 -4 Z" fill={sil} />
        {/* Long duster coat flapping back */}
        <path d={`M 24 -4 L ${36 + Math.sin(frame * 0.18) * 3} ${4 + Math.sin(frame * 0.15) * 2} L ${34 + Math.sin(frame * 0.18) * 3} ${14} L 26 8 Z`}
          fill={silSoft} />
        {/* Bandana neck */}
        <rect x={14} y={-24} width={10} height={4} fill="rgba(140,28,28,0.95)" />
        {/* Head */}
        <ellipse cx={19} cy={-30} rx={5} ry={6} fill={sil} />
        {/* Bandana over face — outlaw mask */}
        <path d="M 14 -28 L 24 -28 L 23 -22 L 15 -22 Z" fill="rgba(140,28,28,0.92)" />
        <line x1={14} y1={-26} x2={24} y2={-26} stroke="rgba(80,14,14,0.85)" strokeWidth={0.8} />
        {/* Cowboy hat — wide brim */}
        <ellipse cx={19} cy={-34} rx={12} ry={2} fill={sil} />
        <path d="M 12 -34 L 15 -42 L 23 -42 L 26 -34 Z" fill={sil} />
        <ellipse cx={19} cy={-34} rx={12} ry={1} fill="rgba(255,140,50,0.25)" />

        {/* Pistol arm — raised if pistolUp */}
        {pistolUp ? (
          <g>
            {/* Arm raised */}
            <path d="M 24 -16 L 36 -32 L 40 -28 L 28 -12 Z" fill={sil} />
            {/* Pistol */}
            <rect x={36} y={-36} width={10} height={3} fill="rgba(40,28,18,0.98)" />
            <rect x={34} y={-34} width={4} height={6} fill="rgba(40,28,18,0.98)" />
            {/* Muzzle flash */}
            {pistolFlash > 0.05 && (
              <g opacity={pistolFlash}>
                <circle cx={50} cy={-34} r={4 + pistolFlash * 6} fill="rgba(255,220,140,0.95)" />
                <circle cx={52} cy={-34} r={2 + pistolFlash * 3} fill="rgba(255,255,200,1)" />
                <path d={`M 46 -34 L ${56 + pistolFlash * 8} -36 L ${56 + pistolFlash * 8} -32 Z`}
                  fill="rgba(255,180,60,0.9)" />
                {/* Powder smoke */}
                <circle cx={56 + pistolFlash * 6} cy={-34} r={5 + pistolFlash * 5}
                  fill="rgba(220,210,200,0.55)" />
              </g>
            )}
          </g>
        ) : (
          <g>
            {/* Arm forward gripping reins */}
            <path d="M 24 -14 L 32 -6 L 28 -2 L 22 -10 Z" fill={sil} />
            {/* Reins to horse head */}
            <line x1={32} y1={-6} x2={-30} y2={-4} stroke="rgba(40,26,14,0.85)" strokeWidth={1} />
          </g>
        )}

        {/* Hoof dust kicks — onset-amplified */}
        <g opacity={0.55 + action * 0.35}>
          {Array.from({ length: 5 }).map((_, i) => {
            const dxi = 36 - i * 14;
            const dy = 50 + Math.sin(frame * 0.3 + i) * 1.5;
            const r = 4 + i * 1.5 + action * 2;
            return (
              <circle key={`hd${i}`} cx={dxi} cy={dy} r={r}
                fill={`rgba(${180 - i * 6},${135 - i * 6},${90 - i * 4},${0.5 - i * 0.08})`} />
            );
          })}
        </g>
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
          <linearGradient id="wt-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={skyTop} />
            <stop offset="0.55" stopColor={skyMid} />
            <stop offset="1" stopColor={skyBot} />
          </linearGradient>
          <radialGradient id="wt-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor={`rgba(255,${230 - sunsetT * 50},${150 - sunsetT * 60},1)`} />
            <stop offset="0.5" stopColor={`rgba(255,${170 - sunsetT * 60},${80 - sunsetT * 30},0.95)`} />
            <stop offset="1" stopColor="rgba(255,120,40,0)" />
          </radialGradient>
          <linearGradient id="wt-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={groundTop} />
            <stop offset="1" stopColor={groundBot} />
          </linearGradient>
          <linearGradient id="wt-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(255,180,100,0)" />
            <stop offset="0.5" stopColor="rgba(255,160,80,0.16)" />
            <stop offset="1" stopColor="rgba(255,140,60,0)" />
          </linearGradient>
        </defs>

        {/* === Sky === */}
        <rect x={0} y={0} width={width} height={horizonY + 12} fill="url(#wt-sky)" />

        {/* Stars (faint, only show in upper dark band) */}
        <g opacity={0.6 - sunsetT * 0.4}>
          {stars.map((s, i) => {
            const tw = 0.4 + (Math.sin(frame * 0.05 + s.tw) * 0.5 + 0.5) * 0.6;
            return <circle key={`star${i}`} cx={s.x * width} cy={s.y * horizonY * 0.9} r={0.9} fill={`rgba(255,240,210,${tw})`} />;
          })}
        </g>

        {/* === Sun on horizon === */}
        <circle cx={width * 0.42} cy={sunY} r={sunR * 1.8} fill="url(#wt-sun)" opacity={0.55} />
        <circle cx={width * 0.42} cy={sunY} r={sunR} fill={`rgba(255,${200 - sunsetT * 70},${100 - sunsetT * 40},0.92)`} />
        <circle cx={width * 0.42} cy={sunY} r={sunR * 0.7} fill={`rgba(255,${230 - sunsetT * 60},${140 - sunsetT * 60},0.85)`} />

        {/* Wispy clouds (slight drift) */}
        <g opacity={0.55}>
          <ellipse cx={width * 0.18 + Math.sin(frame * 0.005) * 6} cy={horizonY * 0.45} rx={120} ry={6}
            fill="rgba(255,150,90,0.55)" />
          <ellipse cx={width * 0.6 + Math.sin(frame * 0.004) * 8} cy={horizonY * 0.35} rx={160} ry={5}
            fill="rgba(255,170,110,0.55)" />
          <ellipse cx={width * 0.85 + Math.sin(frame * 0.006) * 5} cy={horizonY * 0.5} rx={90} ry={4}
            fill="rgba(255,140,80,0.55)" />
        </g>

        {/* === Distant mesas / mountains === */}
        <path d={mesaPath} fill={farSil} />
        <path d={mesaPath} fill="rgba(60,30,40,0.6)" transform="translate(0,4)" />

        {/* === Heat haze band above ground === */}
        <rect x={0} y={horizonY - 10} width={width} height={28} fill="url(#wt-haze)"
          transform={`translate(${Math.sin(frame * 0.06) * 1.2}, 0)`} />

        {/* === Ground === */}
        <rect x={0} y={groundTopY} width={width} height={height - groundTopY} fill="url(#wt-ground)" />

        {/* Ground striations / perspective lines */}
        {Array.from({ length: 6 }).map((_, i) => {
          const ly = groundTopY + 18 + i * 28;
          return (
            <line key={`gl${i}`} x1={0} y1={ly} x2={width} y2={ly}
              stroke={`rgba(60,38,20,${0.25 - i * 0.03})`} strokeWidth={1} />
          );
        })}

        {/* === Sagebrush scattered === */}
        {sage.map((s, i) => {
          const sx = s.x * width;
          const sy = horizonY + s.y * (height - horizonY) * 0.55;
          const sw = 14 * s.s;
          const sh = 10 * s.s;
          return (
            <g key={`sg${i}`} transform={`translate(${sx},${sy})`} opacity={0.85}>
              <ellipse cx={0} cy={0} rx={sw} ry={sh * 0.4} fill="rgba(0,0,0,0.5)" />
              <path d={`M ${-sw * 0.6} 0 Q ${-sw * 0.3 + s.lean * 4} ${-sh * 1.2} 0 ${-sh * 0.4} Q ${sw * 0.3 + s.lean * 4} ${-sh * 1.4} ${sw * 0.5} 0 Z`}
                fill="rgba(40,32,16,0.92)" />
              <circle cx={-sw * 0.3} cy={-sh * 0.6} r={2} fill="rgba(70,52,22,0.85)" />
              <circle cx={sw * 0.2} cy={-sh * 0.7} r={2} fill="rgba(70,52,22,0.85)" />
            </g>
          );
        })}

        {/* === Tumbleweeds === */}
        {tumbles.map((t, i) => {
          const tx = ((cycleFrame * t.speed + t.phaseOffset) % (width + 200)) - 100;
          const screenX = width - tx; // roll right→left
          const ty = horizonY + t.y * (height - horizonY) * 0.5 - Math.abs(Math.sin(frame * 0.18 + i)) * 6;
          const rot = frame * (4 + i);
          return (
            <g key={`tw${i}`} transform={`translate(${screenX},${ty}) rotate(${rot})`}>
              <circle cx={0} cy={0} r={t.r} fill="none" stroke="rgba(60,42,20,0.85)" strokeWidth={1.2} />
              <line x1={-t.r} y1={0} x2={t.r} y2={0} stroke="rgba(80,55,25,0.7)" strokeWidth={1} />
              <line x1={0} y1={-t.r} x2={0} y2={t.r} stroke="rgba(80,55,25,0.7)" strokeWidth={1} />
              <line x1={-t.r * 0.7} y1={-t.r * 0.7} x2={t.r * 0.7} y2={t.r * 0.7} stroke="rgba(80,55,25,0.7)" strokeWidth={1} />
              <line x1={-t.r * 0.7} y1={t.r * 0.7} x2={t.r * 0.7} y2={-t.r * 0.7} stroke="rgba(80,55,25,0.7)" strokeWidth={1} />
            </g>
          );
        })}

        {/* === Telegraph poles + sagging wires along the tracks === */}
        {poles.map((p, i) => {
          const px = p.x * width;
          const ptop = trackY - 90 - p.sag * 4;
          const pbot = trackY + 6;
          return (
            <g key={`tp${i}`}>
              <line x1={px} y1={ptop} x2={px} y2={pbot} stroke="rgba(20,12,6,0.95)" strokeWidth={2.4} />
              <line x1={px - 14} y1={ptop + 6} x2={px + 14} y2={ptop + 6} stroke="rgba(20,12,6,0.95)" strokeWidth={1.8} />
              <line x1={px - 10} y1={ptop + 12} x2={px + 10} y2={ptop + 12} stroke="rgba(20,12,6,0.9)" strokeWidth={1.4} />
              {/* Insulators */}
              <circle cx={px - 12} cy={ptop + 6} r={1.5} fill="rgba(40,28,16,0.95)" />
              <circle cx={px + 12} cy={ptop + 6} r={1.5} fill="rgba(40,28,16,0.95)" />
            </g>
          );
        })}
        {/* Sagging wires between poles */}
        {poles.slice(0, -1).map((p, i) => {
          const x1 = p.x * width;
          const x2 = poles[i + 1].x * width;
          const y1 = trackY - 84 - p.sag * 4;
          const y2 = trackY - 84 - poles[i + 1].sag * 4;
          const ymid = (y1 + y2) / 2 + 14;
          return (
            <g key={`wire${i}`}>
              <path d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${ymid} ${x2} ${y2}`}
                stroke="rgba(15,10,6,0.85)" strokeWidth={1.1} fill="none" />
              <path d={`M ${x1} ${y1 + 6} Q ${(x1 + x2) / 2} ${ymid + 6} ${x2} ${y2 + 6}`}
                stroke="rgba(15,10,6,0.7)" strokeWidth={0.9} fill="none" />
            </g>
          );
        })}

        {/* === Train tracks (parallel rails + sleepers) === */}
        <line x1={0} y1={trackY} x2={width} y2={trackY} stroke="rgba(40,26,14,0.95)" strokeWidth={2.8} />
        <line x1={0} y1={trackY + 6} x2={width} y2={trackY + 6} stroke="rgba(20,14,8,0.92)" strokeWidth={2} />
        {Array.from({ length: 40 }).map((_, i) => {
          const tx = (i / 40) * width;
          return <rect key={`sl${i}`} x={tx} y={trackY - 2} width={width / 80} height={10} fill="rgba(35,22,10,0.9)" />;
        })}

        {/* === Train (foreground vehicle) === */}
        {renderTrain()}

        {/* === Horsemen riding alongside === */}
        {renderHorseman(0, "lead", true)}
        {renderHorseman(120, "trail", false)}

        {/* === Galloping dust trail behind horsemen === */}
        <g opacity={0.7 + action * 0.25}>
          {dust.map((d, i) => {
            const wave = Math.sin(frame * 0.07 + d.phase);
            const lifeT = (i / dust.length);
            const dx = horseBaseX - 40 - lifeT * 240 + wave * 6;
            const dy = horseY + 40 - d.y * 18 - wave * 3;
            const dr = d.r * (0.8 + action * 0.6) * (1 - lifeT * 0.4);
            const op = (1 - lifeT) * 0.55;
            return (
              <circle key={`dt${i}`} cx={dx} cy={dy} r={dr}
                fill={`rgba(${180 - i % 12 * 4},${140 - i % 12 * 4},${90 - i % 12 * 3},${op})`} />
            );
          })}
        </g>

        {/* === Sun glare across foreground === */}
        <rect x={0} y={trackY - 4} width={width} height={4} fill={`rgba(255,${180 - sunsetT * 50},${100 - sunsetT * 40},0.45)`} />

        {/* === Vignette (warm corners darken) === */}
        <radialGradient id="wt-vig" cx="50%" cy="55%" r="75%">
          <stop offset="0.55" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(20,8,12,0.55)" />
        </radialGradient>
        <rect x={0} y={0} width={width} height={height} fill="url(#wt-vig)" />
      </svg>
    </div>
  );
};
