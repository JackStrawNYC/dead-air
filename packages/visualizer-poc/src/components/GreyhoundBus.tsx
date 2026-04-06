/**
 * GreyhoundBus — A+++ vintage 1960s/70s Greyhound Scenicruiser
 * cruising across the frame for "The Promised Land".
 *
 * Detail:
 *   - Sleek aluminum-bodied Scenicruiser silhouette with rounded 60s/70s curves
 *   - Long body with 13 small side windows
 *   - Panoramic windshield, rounded nose, dual round headlights, chrome bumper, grille
 *   - Running greyhound dog silhouette + "GREYHOUND" wordmark on the side
 *   - Rear destination sign + tail lights
 *   - 6 wheels (front + dual rear) with chrome hubcaps and rotating spokes
 *   - Luggage doors along the bottom
 *   - Brushed-aluminum gradients, body panel seams, reflection highlights
 *   - "PROMISED LAND" destination roller above the windshield
 *
 * Animation:
 *   - Bus drives across frame (alternating direction per emergence)
 *   - Suspension bounce on the road
 *   - Rotating wheels
 *   - Exhaust trail and dust cloud behind the bus
 *   - Speed scales with tempoFactor
 *
 * Atmospheric:
 *   - Heat shimmer rising from the road surface
 *   - Dust trail behind the bus
 *   - Sun glint sweeping the chrome
 *   - Gentle rim glow tinted by chromaHue
 *
 * Audio:
 *   - tempoFactor → bus speed
 *   - energy → visibility, glow radius, exhaust intensity
 *   - beatDecay → suspension bounce amplitude
 *   - bass → wheel rotation speed
 *   - onsetEnvelope → headlight flash
 *   - chromaHue → rim glow tint
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BUS_WIDTH = 760;
const BUS_HEIGHT = 240;
const NUM_WINDOWS = 13;

// Emergence cycle: bus appears every CYCLE frames, drives for DRIVE frames
const EMERGENCE_CYCLE = 720;
const DRIVE_FRAMES = 540;

/* ------------------------------------------------------------------ */
/*  Running Greyhound silhouette — stylized leaping dog                */
/* ------------------------------------------------------------------ */

const GreyhoundLogo: React.FC<{ x: number; y: number; scale: number; color: string }> = ({
  x, y, scale, color,
}) => (
  <g transform={`translate(${x}, ${y}) scale(${scale})`} opacity="0.92">
    {/* Body — elongated streamlined oval */}
    <path
      d="M2 14 Q8 6 22 5 Q34 5 44 9 Q52 12 58 11 Q62 10 64 13 Q63 16 58 17 Q50 19 42 18 Q30 22 18 22 Q8 22 4 18 Z"
      fill={color}
    />
    {/* Head — pointed snout */}
    <path
      d="M58 11 Q66 8 70 6 Q73 6 72 9 Q70 12 64 13 Z"
      fill={color}
    />
    {/* Pricked ear */}
    <path d="M62 8 L65 4 L66 8 Z" fill={color} />
    {/* Eye highlight (negative space) */}
    <circle cx="67" cy="9" r="0.6" fill="#000" opacity="0.4" />
    {/* Front legs — leaping forward */}
    <path d="M50 18 L48 28 L50 28 L52 19 Z" fill={color} />
    <path d="M44 18 L41 30 L43 30 L46 19 Z" fill={color} />
    {/* Rear legs — pushing off */}
    <path d="M14 21 L8 31 L11 31 L17 22 Z" fill={color} />
    <path d="M20 22 L16 30 L18 30 L22 23 Z" fill={color} />
    {/* Whip tail */}
    <path
      d="M4 17 Q-4 14 -8 18 Q-4 17 2 19 Z"
      fill={color}
    />
  </g>
);

/* ------------------------------------------------------------------ */
/*  Heat shimmer — wavy lines beneath the bus                          */
/* ------------------------------------------------------------------ */

const HeatShimmer: React.FC<{ width: number; phase: number; opacity: number }> = ({
  width, phase, opacity,
}) => {
  const lines = Array.from({ length: 7 }, (_, i) => i);
  return (
    <g opacity={opacity}>
      {lines.map((i) => {
        const yOff = i * 3.5;
        const ph = phase + i * 0.7;
        const path = Array.from({ length: 22 }, (_, k) => {
          const px = (k / 21) * width;
          const py = Math.sin(ph + k * 0.55) * 1.4 + yOff;
          return `${k === 0 ? "M" : "L"}${px} ${py}`;
        }).join(" ");
        return (
          <path
            key={i}
            d={path}
            stroke={`hsla(35, 50%, 90%, ${0.18 - i * 0.02})`}
            strokeWidth="0.7"
            fill="none"
          />
        );
      })}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Dust trail — particle puffs fading behind the bus                  */
/* ------------------------------------------------------------------ */

const DustTrail: React.FC<{
  startX: number;
  baseY: number;
  phase: number;
  opacity: number;
  hue: number;
}> = ({ startX, baseY, phase, opacity, hue }) => {
  const puffs = Array.from({ length: 8 }, (_, i) => i);
  return (
    <g>
      {puffs.map((i) => {
        const drift = Math.sin(phase * 0.6 + i * 0.8) * 4;
        const rise = Math.cos(phase * 0.5 + i * 0.9) * 2;
        const r = 8 + i * 2.5 + Math.sin(phase + i) * 1.5;
        const op = (1 - i / puffs.length) * 0.35 * opacity;
        return (
          <circle
            key={i}
            cx={startX - i * 22 + drift}
            cy={baseY - rise - i * 1.2}
            r={r}
            fill={`hsla(${hue}, 25%, 78%, ${op})`}
          />
        );
      })}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Exhaust puff — darker, behind/below the bus rear                   */
/* ------------------------------------------------------------------ */

const ExhaustPuff: React.FC<{
  x: number; y: number; phase: number; opacity: number;
}> = ({ x, y, phase, opacity }) => {
  const puffs = [
    { dx: 0, dy: 0, r: 5, op: 0.45 },
    { dx: -10, dy: -3, r: 7, op: 0.32 },
    { dx: -22, dy: -6, r: 9, op: 0.2 },
    { dx: -36, dy: -10, r: 11, op: 0.1 },
  ];
  return (
    <g>
      {puffs.map((p, i) => {
        const drift = Math.sin(phase + i * 1.4) * 1.8;
        return (
          <circle
            key={i}
            cx={x + p.dx - Math.abs(drift)}
            cy={y + p.dy + drift * 0.6}
            r={p.r + Math.sin(phase * 0.8 + i) * 1}
            fill={`hsla(220, 8%, 55%, ${p.op * opacity})`}
          />
        );
      })}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  GreyhoundScenicruiser — full SVG of the bus                        */
/* ------------------------------------------------------------------ */

const GreyhoundScenicruiser: React.FC<{
  width: number;
  height: number;
  bobOffset: number;
  wheelSpin: number;
  headlightBrightness: number;
  glintPos: number;
  exhaustPhase: number;
  exhaustOpacity: number;
  shimmerPhase: number;
  shimmerOpacity: number;
}> = ({
  width, height, bobOffset, wheelSpin, headlightBrightness,
  glintPos, exhaustPhase, exhaustOpacity, shimmerPhase, shimmerOpacity,
}) => {
  return (
    <svg width={width} height={height} viewBox="0 0 380 120" fill="none">
      <defs>
        {/* Brushed aluminum body gradient */}
        <linearGradient id="ghbus-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5F5F5" />
          <stop offset="20%" stopColor="#E8E8E8" />
          <stop offset="50%" stopColor="#D0D0D0" />
          <stop offset="80%" stopColor="#B8B8B8" />
          <stop offset="100%" stopColor="#9A9A9A" />
        </linearGradient>
        {/* Lower body panel — slightly darker accent stripe */}
        <linearGradient id="ghbus-lower" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A8A8A8" />
          <stop offset="100%" stopColor="#7A7A7A" />
        </linearGradient>
        {/* Top accent stripe — Greyhound red/blue band (darker classic blue) */}
        <linearGradient id="ghbus-stripe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1A3A6E" />
          <stop offset="100%" stopColor="#0E2452" />
        </linearGradient>
        {/* Roof — slight curvature shading */}
        <linearGradient id="ghbus-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FAFAFA" />
          <stop offset="100%" stopColor="#C8C8C8" />
        </linearGradient>
        {/* Window glass — dark teal with reflection */}
        <linearGradient id="ghbus-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1A2A38" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#2C4458" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#0F1A24" stopOpacity="0.95" />
        </linearGradient>
        {/* Chrome bumper / trim */}
        <linearGradient id="ghbus-chrome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="35%" stopColor="#F0F0F0" />
          <stop offset="65%" stopColor="#9E9E9E" />
          <stop offset="100%" stopColor="#5A5A5A" />
        </linearGradient>
        {/* Headlight glow */}
        <radialGradient id="ghbus-hlglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF8D8" stopOpacity={headlightBrightness} />
          <stop offset="50%" stopColor="#FFE49A" stopOpacity={headlightBrightness * 0.5} />
          <stop offset="100%" stopColor="#FFD060" stopOpacity="0" />
        </radialGradient>
        {/* Sun glint — moving white highlight strip */}
        <linearGradient id="ghbus-glint" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        {/* Destination sign backlight */}
        <linearGradient id="ghbus-dest" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF6C8" />
          <stop offset="100%" stopColor="#F2D66B" />
        </linearGradient>
        {/* Clip for the moving sun glint */}
        <clipPath id="ghbus-bodyclip">
          <path d="M16 42 Q16 28 32 26 L348 26 Q364 28 364 42 L364 80 L16 80 Z" />
        </clipPath>
      </defs>

      {/* ---- HEAT SHIMMER beneath the bus ---- */}
      <g transform="translate(20, 112)">
        <HeatShimmer width={340} phase={shimmerPhase} opacity={shimmerOpacity} />
      </g>

      <g transform={`translate(0, ${bobOffset})`}>
        {/* ---- ROOF (rounded top, slight curve) ---- */}
        <path
          d="M30 26 Q28 14 44 12 L336 12 Q352 14 350 26 Z"
          fill="url(#ghbus-roof)"
        />

        {/* ---- DESTINATION ROLLER above windshield ---- */}
        <rect x="278" y="16" width="62" height="10" rx="1" fill="url(#ghbus-dest)" stroke="#8A6A20" strokeWidth="0.5" />
        <text
          x="309"
          y="24"
          fontSize="6.2"
          fontFamily="Arial, sans-serif"
          fontWeight="900"
          textAnchor="middle"
          fill="#3A2A08"
          letterSpacing="0.3"
        >
          PROMISED LAND
        </text>

        {/* ---- TOP ACCENT STRIPE (Greyhound classic blue) ---- */}
        <rect x="20" y="26" width="340" height="3" fill="url(#ghbus-stripe)" />

        {/* ---- MAIN BODY ---- */}
        <path
          d="M16 42 Q16 28 32 26 L348 26 Q364 28 364 42 L364 80 L16 80 Z"
          fill="url(#ghbus-body)"
        />

        {/* ---- BODY PANEL SEAMS (subtle vertical lines) ---- */}
        {Array.from({ length: 12 }, (_, i) => {
          const sx = 36 + i * 26;
          return (
            <line
              key={`seam-${i}`}
              x1={sx}
              y1={32}
              x2={sx}
              y2={78}
              stroke="#888"
              strokeWidth="0.25"
              opacity="0.35"
            />
          );
        })}

        {/* ---- HORIZONTAL REFLECTION HIGHLIGHT on body ---- */}
        <line x1="22" y1="36" x2="358" y2="36" stroke="#FFFFFF" strokeWidth="1.2" opacity="0.45" />
        <line x1="22" y1="38" x2="358" y2="38" stroke="#FFFFFF" strokeWidth="0.4" opacity="0.25" />

        {/* ---- SIDE WINDOWS row ---- */}
        {Array.from({ length: NUM_WINDOWS }, (_, i) => {
          const wx = 32 + i * 19;
          return (
            <g key={`win-${i}`}>
              <rect
                x={wx}
                y={32}
                width={15}
                height={18}
                rx="1.2"
                fill="url(#ghbus-glass)"
                stroke="#5A5A5A"
                strokeWidth="0.4"
              />
              {/* Reflection streak */}
              <line
                x1={wx + 1.5}
                y1={34}
                x2={wx + 6}
                y2={33}
                stroke="#9CC9E6"
                strokeWidth="0.5"
                opacity="0.55"
                strokeLinecap="round"
              />
              {/* Lower glint */}
              <line
                x1={wx + 9}
                y1={47}
                x2={wx + 13}
                y2={48.5}
                stroke="#6BA0C0"
                strokeWidth="0.3"
                opacity="0.35"
              />
            </g>
          );
        })}

        {/* ---- GREYHOUND DOG SILHOUETTE on the side ---- */}
        <GreyhoundLogo x={48} y={56} scale={0.55} color="#1A3A6E" />

        {/* ---- "GREYHOUND" wordmark ---- */}
        <text
          x="200"
          y="66"
          fontSize="11"
          fontFamily="Arial, sans-serif"
          fontWeight="900"
          textAnchor="middle"
          fill="#1A3A6E"
          letterSpacing="1.2"
        >
          GREYHOUND
        </text>
        {/* Sub-tagline */}
        <text
          x="200"
          y="73"
          fontSize="3.4"
          fontFamily="Arial, sans-serif"
          fontWeight="600"
          textAnchor="middle"
          fill="#1A3A6E"
          letterSpacing="0.6"
          opacity="0.7"
        >
          AMERICA'S FAVORITE WAY TO GO
        </text>

        {/* ---- LOWER BODY PANEL (luggage compartment area) ---- */}
        <rect x="16" y="80" width="348" height="14" fill="url(#ghbus-lower)" />

        {/* ---- LUGGAGE DOORS ---- */}
        {Array.from({ length: 5 }, (_, i) => {
          const dx = 40 + i * 60;
          return (
            <g key={`door-${i}`}>
              <rect
                x={dx}
                y={82}
                width={50}
                height={10}
                rx="0.8"
                fill="none"
                stroke="#3A3A3A"
                strokeWidth="0.4"
              />
              {/* Door handle */}
              <rect x={dx + 22} y={86} width={6} height={1.4} rx="0.4" fill="#C8C8C8" />
              <rect x={dx + 22} y={86} width={6} height={1.4} rx="0.4" fill="none" stroke="#5A5A5A" strokeWidth="0.2" />
            </g>
          );
        })}

        {/* ---- SUN GLINT (clipped to body) ---- */}
        <g clipPath="url(#ghbus-bodyclip)">
          <rect x={glintPos - 60} y="26" width="120" height="58" fill="url(#ghbus-glint)" />
        </g>

        {/* ---- FRONT NOSE (rounded, panoramic windshield) ---- */}
        {/* Nose body curve */}
        <path
          d="M348 26 Q368 28 372 42 L372 78 L348 78 Z"
          fill="url(#ghbus-body)"
        />
        {/* Panoramic windshield */}
        <path
          d="M340 28 Q360 30 364 42 L364 56 L340 56 Z"
          fill="url(#ghbus-glass)"
          stroke="#5A5A5A"
          strokeWidth="0.5"
        />
        {/* Windshield wiper */}
        <line x1="346" y1="54" x2="354" y2="44" stroke="#2A2A2A" strokeWidth="0.6" />
        {/* Windshield reflection */}
        <line x1="344" y1="34" x2="358" y2="36" stroke="#9CC9E6" strokeWidth="0.5" opacity="0.6" />

        {/* ---- GRILLE (front, vertical slats) ---- */}
        <rect x="352" y="58" width="18" height="14" rx="1" fill="#2A2A2A" />
        {Array.from({ length: 6 }, (_, i) => (
          <line
            key={`grille-${i}`}
            x1={354 + i * 2.8}
            y1={60}
            x2={354 + i * 2.8}
            y2={70}
            stroke="#7A7A7A"
            strokeWidth="0.5"
          />
        ))}
        {/* Greyhound badge on grille */}
        <circle cx="361" cy="65" r="2.4" fill="#1A3A6E" />
        <circle cx="361" cy="65" r="2.4" fill="none" stroke="#C8C8C8" strokeWidth="0.3" />

        {/* ---- HEADLIGHTS — dual round, with glow ---- */}
        <circle cx="358" cy="76" r="9" fill="url(#ghbus-hlglow)" />
        <circle cx="372" cy="76" r="9" fill="url(#ghbus-hlglow)" />
        {/* Headlight lens */}
        <circle cx="358" cy="76" r="3.2" fill="#FFFAE0" />
        <circle cx="358" cy="76" r="3.2" fill="none" stroke="#C8C8C8" strokeWidth="0.4" />
        <circle cx="358" cy="75" r="1.2" fill="#FFFFFF" opacity={0.6 + headlightBrightness * 0.4} />
        <circle cx="372" cy="76" r="3.2" fill="#FFFAE0" />
        <circle cx="372" cy="76" r="3.2" fill="none" stroke="#C8C8C8" strokeWidth="0.4" />
        <circle cx="372" cy="75" r="1.2" fill="#FFFFFF" opacity={0.6 + headlightBrightness * 0.4} />

        {/* ---- CHROME BUMPER (front) ---- */}
        <rect x="346" y="92" width="28" height="4" rx="1.2" fill="url(#ghbus-chrome)" />
        <line x1="348" y1="93" x2="372" y2="93" stroke="#FFFFFF" strokeWidth="0.4" opacity="0.5" />

        {/* ---- CHROME SIDE TRIM ---- */}
        <rect x="16" y="78" width="348" height="2.5" fill="url(#ghbus-chrome)" />

        {/* ---- REAR (rectangular back) ---- */}
        <path d="M16 26 Q14 30 14 42 L14 80 L16 80 Z" fill="url(#ghbus-body)" />
        {/* Rear destination sign (small) */}
        <rect x="6" y="32" width="10" height="6" rx="0.6" fill="url(#ghbus-dest)" stroke="#8A6A20" strokeWidth="0.3" />
        {/* Rear taillights */}
        <rect x="8" y="58" width="6" height="6" rx="1" fill="#D14A2C" opacity="0.85" />
        <rect x="8" y="58" width="6" height="6" rx="1" fill="none" stroke="#7A1F0E" strokeWidth="0.3" />
        <rect x="8" y="68" width="6" height="3" rx="0.6" fill="#FFD060" opacity="0.8" />
        {/* Rear chrome bumper */}
        <rect x="6" y="92" width="14" height="4" rx="1" fill="url(#ghbus-chrome)" />

        {/* ---- WHEELS — 6 total: front + dual rear (rear shows as one wide pair) ---- */}
        {/* Front wheel */}
        <WheelGroup cx={332} spin={wheelSpin} />
        {/* Rear inner wheel */}
        <WheelGroup cx={62} spin={wheelSpin} />
        {/* Rear outer wheel (slightly forward — dual axle) */}
        <WheelGroup cx={88} spin={wheelSpin * 0.97} />

        {/* ---- WHEEL WELLS (dark arches) ---- */}
        <path d="M48 96 Q48 82 76 82 Q104 82 104 96" fill="none" stroke="#2A2A2A" strokeWidth="0.6" opacity="0.6" />
        <path d="M318 96 Q318 82 332 82 Q346 82 346 96" fill="none" stroke="#2A2A2A" strokeWidth="0.6" opacity="0.6" />

        {/* ---- ANTENNAS / MIRRORS on roof ---- */}
        <line x1="338" y1="12" x2="340" y2="4" stroke="#3A3A3A" strokeWidth="0.6" />
        {/* Side mirror */}
        <line x1="362" y1="40" x2="370" y2="36" stroke="#3A3A3A" strokeWidth="0.7" />
        <rect x="368" y="34" width="3" height="3.5" rx="0.4" fill="url(#ghbus-chrome)" />

        {/* ---- BODY PANEL CENTER LINE (long horizontal seam) ---- */}
        <line x1="16" y1="50" x2="364" y2="50" stroke="#888" strokeWidth="0.25" opacity="0.3" />

        {/* ---- EXHAUST PUFF (rear, lower) ---- */}
        <ExhaustPuff x={4} y={88} phase={exhaustPhase} opacity={exhaustOpacity} />
      </g>
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  WheelGroup — tire + hubcap + rotating spokes                       */
/* ------------------------------------------------------------------ */

const WheelGroup: React.FC<{ cx: number; spin: number }> = ({ cx, spin }) => {
  const cy = 96;
  return (
    <g>
      {/* Tire */}
      <circle cx={cx} cy={cy} r="11" fill="#1A1A1A" />
      <circle cx={cx} cy={cy} r="11" fill="none" stroke="#2A2A2A" strokeWidth="1.2" />
      {/* Tire tread dots */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <circle
            key={i}
            cx={cx + Math.cos(a) * 10}
            cy={cy + Math.sin(a) * 10}
            r="0.4"
            fill="#3A3A3A"
          />
        );
      })}
      {/* Chrome hubcap */}
      <circle cx={cx} cy={cy} r="6.5" fill="#E0E0E0" />
      <circle cx={cx} cy={cy} r="6.5" fill="none" stroke="#9A9A9A" strokeWidth="0.4" />
      <circle cx={cx} cy={cy} r="5" fill="#F0F0F0" />
      {/* Rotating spokes */}
      <g transform={`rotate(${spin}, ${cx}, ${cy})`}>
        <line x1={cx} y1={cy - 5} x2={cx} y2={cy + 5} stroke="#7A7A7A" strokeWidth="0.7" />
        <line x1={cx - 5} y1={cy} x2={cx + 5} y2={cy} stroke="#7A7A7A" strokeWidth="0.7" />
        <line x1={cx - 3.5} y1={cy - 3.5} x2={cx + 3.5} y2={cy + 3.5} stroke="#7A7A7A" strokeWidth="0.5" />
        <line x1={cx + 3.5} y1={cy - 3.5} x2={cx - 3.5} y2={cy + 3.5} stroke="#7A7A7A" strokeWidth="0.5" />
      </g>
      {/* Center cap */}
      <circle cx={cx} cy={cy} r="1.6" fill="#C8C8C8" />
      <circle cx={cx} cy={cy} r="1.6" fill="none" stroke="#7A7A7A" strokeWidth="0.2" />
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  GreyhoundBus — master component                                    */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const GreyhoundBus: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const bass = snap.bass;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue;
  const onsetEnv = snap.onsetEnvelope;

  // Emergence cycle: bus appears every EMERGENCE_CYCLE frames
  const cyclePos = frame % EMERGENCE_CYCLE;
  if (cyclePos >= DRIVE_FRAMES) return null;

  // Direction alternates every cycle
  const cycleIndex = Math.floor(frame / EMERGENCE_CYCLE);
  const goingRight = cycleIndex % 2 === 0;

  const driveProgress = cyclePos / DRIVE_FRAMES;

  // Fade in/out at the edges
  const fadeIn = interpolate(driveProgress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(driveProgress, [0.92, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Energy gates visibility (hide when song is too quiet)
  const energyGate = interpolate(energy, [0.05, 0.18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * energyGate * 0.92;

  if (opacity < 0.01) return null;

  // Position — drives across the frame, tempoFactor accelerates the cross
  const tempoBoost = 0.5 + tempoFactor * 0.5;
  const adjustedProgress = Math.min(driveProgress * tempoBoost, 1);
  const xStart = goingRight ? -BUS_WIDTH - 80 : width + 80;
  const xEnd = goingRight ? width + 80 : -BUS_WIDTH - 80;
  const x = interpolate(adjustedProgress, [0, 1], [xStart, xEnd], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Vertical baseline — lower third of frame
  const yBase = height * 0.62;

  // Suspension bounce: beat-driven, modulated by tempo
  const bounceFreq = (4 + energy * 4) * tempoFactor;
  const bounceAmp = 2 + beatDecay * 7 + onsetEnv * 4;
  const bob = Math.sin(frame * bounceFreq * 0.012) * bounceAmp;

  // Wheel rotation: bass-driven, accelerated by tempo
  const wheelBaseSpeed = 6 + bass * 18;
  const wheelSpin = (frame * wheelBaseSpeed * tempoFactor) % 360;

  // Headlight brightness: onset-driven flash
  const headlightBrightness = Math.min(
    0.4 + energy * 0.35 + onsetEnv * 0.45 + beatDecay * 0.15,
    1,
  );

  // Sun glint sweeping along the body — keyed to time, slower than the bus
  const glintPos = ((frame * 1.6) % 480) - 60;

  // Exhaust phase + opacity — visible at higher energies
  const exhaustPhase = frame * 0.14;
  const exhaustOpacity = interpolate(energy, [0, 0.2, 0.7], [0.15, 0.4, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Heat shimmer phase + opacity
  const shimmerPhase = frame * 0.08;
  const shimmerOpacity = interpolate(energy, [0, 0.4], [0.4, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Dust trail — chromaHue tinted
  const dustPhase = frame * 0.11;
  const dustOpacity = interpolate(energy, [0, 0.25, 0.7], [0.2, 0.55, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Rim glow — chromaHue tinted, scales with energy
  const glowRadius = 8 + energy * 22;
  const glowColorA = `hsla(${chromaHue}, 60%, 70%, 0.4)`;
  const glowColorB = "rgba(255, 240, 200, 0.35)";
  const filter = [
    `drop-shadow(0 0 ${glowRadius}px ${glowColorA})`,
    `drop-shadow(0 0 ${glowRadius * 0.5}px ${glowColorB})`,
  ].join(" ");

  // Dust trail anchor — behind the bus relative to direction
  const dustAnchorX = goingRight ? x + 30 : x + BUS_WIDTH - 30;
  const dustAnchorY = yBase + BUS_HEIGHT * 0.78 + bob;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Dust trail layer (behind bus) */}
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          inset: 0,
          opacity,
        }}
      >
        <DustTrail
          startX={dustAnchorX}
          baseY={dustAnchorY}
          phase={dustPhase}
          opacity={dustOpacity}
          hue={chromaHue}
        />
      </svg>

      {/* Bus layer */}
      <div
        style={{
          position: "absolute",
          left: x,
          top: yBase + bob,
          opacity,
          filter,
          transform: `scaleX(${goingRight ? 1 : -1})`,
          willChange: "transform, opacity",
        }}
      >
        <GreyhoundScenicruiser
          width={BUS_WIDTH}
          height={BUS_HEIGHT}
          bobOffset={0}
          wheelSpin={wheelSpin}
          headlightBrightness={headlightBrightness}
          glintPos={glintPos}
          exhaustPhase={exhaustPhase}
          exhaustOpacity={exhaustOpacity}
          shimmerPhase={shimmerPhase}
          shimmerOpacity={shimmerOpacity}
        />
      </div>
    </div>
  );
};
