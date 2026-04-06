/**
 * VWBusParade — A+++ convoy of 5 detailed VW Type 2 Microbuses cruising
 * across the bottom third of the frame, full Dead lot energy.
 *
 * Each bus has:
 *   - Detailed silhouette: split V-windshield, rounded roof, flat front face
 *   - 3 side windows with reflection highlights
 *   - VW logo circle on front panel
 *   - Peace sign OR stealie decal on the side (alternating per bus)
 *   - Chrome bumper highlight
 *   - Two wheels with hubcap cross-spokes
 *   - Round headlights with audio-driven glow halo
 *   - Roof rack with surfboard/gear outline (buses 1 and 3)
 *   - Tie-dye paint swirl suggestion (radial gradient overlay per bus)
 *   - Exhaust puff cloud trailing behind, fading with distance
 *
 * Convoy animation:
 *   - Buses drive L-to-R or R-to-L (alternating per march)
 *   - Gentle sine-wave bounce (phased per bus) simulates road bumps
 *   - Slight body wobble (old VW suspension sway)
 *   - Speed tied to tempoFactor
 *
 * Audio mapping:
 *   - tempoFactor → convoy speed
 *   - beatDecay → bounce amplitude
 *   - chromaHue → headlight + exhaust glow tint
 *   - energy → headlight brightness, exhaust opacity, body glow radius
 *   - bass → wheel rotation speed
 *   - drumOnset → extra bounce kick
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import {
  useAudioSnapshot,
  precomputeMarchWindows,
  findActiveMarch,
  type MarchConfig,
} from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Color palettes — 5 tie-dye-inspired Dead lot buses                */
/* ------------------------------------------------------------------ */

const BUS_COLORS: Array<{
  body: string;
  roof: string;
  accent: string;
  tieA: string;
  tieB: string;
}> = [
  { body: "#FF6B35", roof: "#FFF3E0", accent: "#E65100", tieA: "#FFD54F", tieB: "#E53935" },
  { body: "#2196F3", roof: "#E3F2FD", accent: "#0D47A1", tieA: "#80DEEA", tieB: "#7E57C2" },
  { body: "#E53935", roof: "#FFEBEE", accent: "#B71C1C", tieA: "#FF8A65", tieB: "#FFEE58" },
  { body: "#43A047", roof: "#E8F5E9", accent: "#1B5E20", tieA: "#AED581", tieB: "#00BCD4" },
  { body: "#AB47BC", roof: "#F3E5F5", accent: "#6A1B9A", tieA: "#F48FB1", tieB: "#42A5F5" },
];

const NUM_BUSES = 5;
const BUS_SPACING = 380;
const BUS_WIDTH = 280;
const BUS_HEIGHT = 185;

const MARCH_CONFIG: MarchConfig = {
  enterThreshold: 0.07,
  exitThreshold: 0.04,
  sustainFrames: 45,
  cooldownFrames: 200,
  marchDuration: 600,
};

/* ------------------------------------------------------------------ */
/*  Stealie (Steal Your Face) mini icon — simplified SDF-style         */
/* ------------------------------------------------------------------ */

const StealieDecal: React.FC<{ cx: number; cy: number; r: number; color: string }> = ({
  cx, cy, r, color,
}) => (
  <g opacity="0.55">
    {/* Outer circle */}
    <circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth="1" fill="none" />
    {/* Lightning bolt divider */}
    <path
      d={`M${cx - r * 0.15} ${cy - r * 0.8} L${cx + r * 0.2} ${cy - r * 0.05} L${cx - r * 0.2} ${cy + r * 0.05} L${cx + r * 0.15} ${cy + r * 0.8}`}
      stroke={color}
      strokeWidth="0.8"
      fill="none"
      strokeLinejoin="round"
    />
    {/* Horizontal bisect */}
    <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={color} strokeWidth="0.6" />
  </g>
);

/* ------------------------------------------------------------------ */
/*  Peace Sign decal                                                   */
/* ------------------------------------------------------------------ */

const PeaceDecal: React.FC<{ cx: number; cy: number; r: number; color: string }> = ({
  cx, cy, r, color,
}) => (
  <g opacity="0.55">
    <circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth="1" fill="none" />
    <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={color} strokeWidth="0.8" />
    <line x1={cx} y1={cy} x2={cx - r * 0.7} y2={cy + r * 0.7} stroke={color} strokeWidth="0.8" />
    <line x1={cx} y1={cy} x2={cx + r * 0.7} y2={cy + r * 0.7} stroke={color} strokeWidth="0.8" />
  </g>
);

/* ------------------------------------------------------------------ */
/*  Exhaust puff — 3 overlapping circles fading behind the bus         */
/* ------------------------------------------------------------------ */

const ExhaustPuff: React.FC<{
  x: number;
  y: number;
  phase: number;
  opacity: number;
  hue: number;
}> = ({ x, y, phase, opacity: baseOpacity, hue }) => {
  const puffs = [
    { dx: 0, dy: 0, r: 4, opacity: 0.35 },
    { dx: -7, dy: -2, r: 5.5, opacity: 0.22 },
    { dx: -15, dy: -4, r: 7, opacity: 0.12 },
  ];
  return (
    <g>
      {puffs.map((p, i) => {
        const drift = Math.sin(phase + i * 1.3) * 2;
        return (
          <circle
            key={i}
            cx={x + p.dx - Math.abs(drift)}
            cy={y + p.dy + drift * 0.5}
            r={p.r + Math.sin(phase * 0.7 + i) * 1.2}
            fill={`hsla(${hue}, 10%, 85%, ${p.opacity * baseOpacity})`}
          />
        );
      })}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Single VW Type 2 Microbus — full detail SVG                       */
/* ------------------------------------------------------------------ */

const VWBus: React.FC<{
  width: number;
  height: number;
  body: string;
  roof: string;
  accent: string;
  tieA: string;
  tieB: string;
  bobOffset: number;
  tiltDeg: number;
  wheelSpin: number;
  headlightBrightness: number;
  headlightHue: number;
  exhaustPhase: number;
  exhaustOpacity: number;
  busIndex: number;
  hasRoofRack: boolean;
}> = ({
  width, height, body, roof, accent, tieA, tieB,
  bobOffset, tiltDeg, wheelSpin, headlightBrightness, headlightHue,
  exhaustPhase, exhaustOpacity, busIndex, hasRoofRack,
}) => {
  const defId = `bus-${busIndex}`;
  const isEven = busIndex % 2 === 0;
  return (
    <svg width={width} height={height} viewBox="0 0 160 105" fill="none">
      <defs>
        {/* Tie-dye radial gradient for body paint */}
        <radialGradient id={`${defId}-tiedye`} cx="40%" cy="50%" r="60%">
          <stop offset="0%" stopColor={tieA} stopOpacity="0.25" />
          <stop offset="50%" stopColor={body} stopOpacity="0" />
          <stop offset="100%" stopColor={tieB} stopOpacity="0.2" />
        </radialGradient>
        {/* Window reflection gradient */}
        <linearGradient id={`${defId}-glass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="40%" stopColor="#B3E5FC" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#81D4FA" stopOpacity="0.5" />
        </linearGradient>
        {/* Headlight glow */}
        <radialGradient id={`${defId}-hlglow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={`hsl(${headlightHue}, 60%, 95%)`} stopOpacity={headlightBrightness} />
          <stop offset="100%" stopColor={`hsl(${headlightHue}, 40%, 80%)`} stopOpacity="0" />
        </radialGradient>
        {/* Chrome bumper gradient */}
        <linearGradient id={`${defId}-chrome`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E0E0E0" />
          <stop offset="40%" stopColor="#FAFAFA" />
          <stop offset="100%" stopColor="#9E9E9E" />
        </linearGradient>
      </defs>

      <g transform={`translate(0, ${bobOffset}) rotate(${tiltDeg}, 80, 52)`}>
        {/* ---- BODY ---- */}
        {/* Main body — rounded rectangle */}
        <rect x="12" y="28" width="132" height="48" rx="10" ry="10" fill={body} />
        {/* Tie-dye overlay on body */}
        <rect x="12" y="28" width="132" height="48" rx="10" ry="10" fill={`url(#${defId}-tiedye)`} />

        {/* ---- ROOF ---- */}
        <path d="M24 28 Q24 8 50 8 L110 8 Q136 8 136 28 Z" fill={roof} />
        {/* Roof accent stripe */}
        <path d="M34 12 L126 12" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
        {/* Secondary thin stripe */}
        <path d="M38 15 L122 15" stroke={accent} strokeWidth="0.8" strokeLinecap="round" opacity="0.4" />

        {/* ---- ROOF RACK (buses 0 and 2) ---- */}
        {hasRoofRack && (
          <g>
            {/* Rack rails */}
            <rect x="48" y="4" width="64" height="3" rx="1.5" fill="#8D6E63" opacity="0.7" />
            <rect x="52" y="1.5" width="2" height="3" rx="0.5" fill="#6D4C41" opacity="0.6" />
            <rect x="106" y="1.5" width="2" height="3" rx="0.5" fill="#6D4C41" opacity="0.6" />
            {/* Surfboard outline */}
            <ellipse cx="80" cy="3.5" rx="22" ry="2.5" fill="none" stroke="#FFB74D" strokeWidth="1" opacity="0.6" />
            {/* Surfboard fin */}
            <path d="M100 3.5 L104 1 L104 6 Z" fill="#FFB74D" opacity="0.45" />
          </g>
        )}

        {/* ---- FLAT FRONT FACE ---- */}
        <rect x="130" y="28" width="14" height="48" rx="4" fill={accent} opacity="0.3" />

        {/* ---- SPLIT WINDSHIELD (V-shape) ---- */}
        {/* Left pane */}
        <path
          d="M102 13 L114 11 L114 31 L102 31 Z"
          fill={`url(#${defId}-glass)`}
          stroke={accent}
          strokeWidth="0.8"
        />
        {/* Right pane */}
        <path
          d="M116 11 L128 13 L128 31 L116 31 Z"
          fill={`url(#${defId}-glass)`}
          stroke={accent}
          strokeWidth="0.8"
        />
        {/* Center V divider */}
        <line x1="115" y1="10" x2="115" y2="32" stroke={accent} strokeWidth="1.8" />
        {/* Window reflection highlights */}
        <line x1="105" y1="15" x2="111" y2="14" stroke="#ffffff" strokeWidth="0.6" opacity="0.5" strokeLinecap="round" />
        <line x1="119" y1="14" x2="125" y2="15" stroke="#ffffff" strokeWidth="0.6" opacity="0.5" strokeLinecap="round" />

        {/* ---- SIDE WINDOWS (3 with reflections) ---- */}
        {[0, 1, 2].map((wi) => {
          const wx = 30 + wi * 22;
          return (
            <g key={wi}>
              <rect x={wx} y="14" width="18" height="16" rx="2.5" fill={`url(#${defId}-glass)`} stroke={accent} strokeWidth="0.5" />
              {/* Reflection highlight — diagonal streak */}
              <line
                x1={wx + 2} y1={16} x2={wx + 7} y2={14.5}
                stroke="#ffffff" strokeWidth="0.7" opacity="0.45" strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* ---- VW LOGO on front ---- */}
        <circle cx="128" cy="50" r="8.5" fill={roof} stroke={accent} strokeWidth="1.4" />
        {/* V */}
        <path d="M123 46 L128 55 L133 46" stroke={accent} strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* W */}
        <path d="M123.5 49 L125.8 55 L128 50.5 L130.2 55 L132.5 49" stroke={accent} strokeWidth="0.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* ---- SIDE DECAL: peace or stealie (alternating) ---- */}
        {isEven ? (
          <PeaceDecal cx={54} cy={52} r={8} color={roof} />
        ) : (
          <StealieDecal cx={54} cy={52} r={8} color={roof} />
        )}

        {/* ---- CHROME BUMPER ---- */}
        <rect x="10" y="72" width="138" height="4.5" rx="2" fill={`url(#${defId}-chrome)`} />
        {/* Bumper highlight line */}
        <line x1="18" y1="73" x2="140" y2="73" stroke="#ffffff" strokeWidth="0.6" opacity="0.3" strokeLinecap="round" />

        {/* ---- REAR TAILLIGHT ---- */}
        <rect x="13" y="56" width="4" height="8" rx="1.5" fill="#EF5350" opacity="0.7" />

        {/* ---- WHEELS with hubcap spokes ---- */}
        {[42, 114].map((wcx) => (
          <g key={wcx}>
            {/* Tire */}
            <circle cx={wcx} cy={80} r="11" fill="#303030" />
            {/* Tire tread ring */}
            <circle cx={wcx} cy={80} r="11" fill="none" stroke="#424242" strokeWidth="1.5" />
            {/* Hubcap */}
            <circle cx={wcx} cy={80} r="5.5" fill="#9E9E9E" />
            <circle cx={wcx} cy={80} r="5.5" fill="none" stroke="#BDBDBD" strokeWidth="0.5" />
            {/* Cross spokes — rotate with wheel spin */}
            <g transform={`rotate(${wheelSpin}, ${wcx}, 80)`}>
              <line x1={wcx} y1={75} x2={wcx} y2={85} stroke="#757575" strokeWidth="1" />
              <line x1={wcx - 5} y1={80} x2={wcx + 5} y2={80} stroke="#757575" strokeWidth="1" />
              {/* Diagonal spokes */}
              <line x1={wcx - 3.5} y1={76.5} x2={wcx + 3.5} y2={83.5} stroke="#757575" strokeWidth="0.6" />
              <line x1={wcx + 3.5} y1={76.5} x2={wcx - 3.5} y2={83.5} stroke="#757575" strokeWidth="0.6" />
            </g>
            {/* Center cap */}
            <circle cx={wcx} cy={80} r="1.8" fill="#BDBDBD" />
          </g>
        ))}

        {/* ---- HEADLIGHTS (round, with glow halo) ---- */}
        {/* Glow halo */}
        <circle cx="142" cy="42" r="12" fill={`url(#${defId}-hlglow)`} />
        <circle cx="142" cy="56" r="10" fill={`url(#${defId}-hlglow)`} opacity="0.5" />
        {/* Headlight lens */}
        <circle cx="142" cy="42" r="4.5" fill={`hsl(${headlightHue}, 40%, 92%)`} />
        <circle cx="142" cy="42" r="3" fill={`hsl(${headlightHue}, 30%, 98%)`} opacity={0.5 + headlightBrightness * 0.5} />
        {/* Lower running light */}
        <circle cx="142" cy="56" r="3" fill={`hsl(${headlightHue}, 30%, 88%)`} opacity="0.6" />

        {/* ---- EXHAUST PUFF ---- */}
        <ExhaustPuff x={12} y={70} phase={exhaustPhase} opacity={exhaustOpacity} hue={headlightHue} />

        {/* ---- BODY PANEL LINES (subtle detail) ---- */}
        <line x1="96" y1="28" x2="96" y2="72" stroke={accent} strokeWidth="0.5" opacity="0.25" />
        <line x1="12" y1="44" x2="96" y2="44" stroke={accent} strokeWidth="0.4" opacity="0.15" />
      </g>
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  VWBusParade — master component                                     */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const VWBusParade: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const bass = snap.bass;
  const chromaHue = snap.chromaHue;
  const beatDecay = snap.beatDecay;
  const drumOnset = snap.drumOnset;

  // Seeded RNG for deterministic per-bus spacing jitter and phase offsets
  const busJitter = React.useMemo(() => {
    const r = seeded(77_050_886);
    return Array.from({ length: NUM_BUSES }, () => ({
      spacingOffset: (r() - 0.5) * 40,  // +/-20px convoy spacing variation
      phaseOffset: r() * Math.PI * 2,    // unique bounce phase
      wobblePhase: r() * Math.PI * 2,    // unique wobble phase
    }));
  }, []);

  const marchWindows = React.useMemo(
    () => precomputeMarchWindows(frames, MARCH_CONFIG),
    [frames],
  );

  const activeMarch = findActiveMarch(marchWindows, frame);
  if (!activeMarch) return null;

  const marchFrame = frame - activeMarch.startFrame;
  const marchDuration = activeMarch.endFrame - activeMarch.startFrame;
  const progress = marchFrame / marchDuration;
  const goingRight = activeMarch.direction === 1;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(progress, [0.94, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const totalWidth = NUM_BUSES * BUS_SPACING;
  const yBase = height - BUS_HEIGHT - 20;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {BUS_COLORS.map((colors, i) => {
        const jit = busJitter[i];
        // Stagger each bus in the convoy
        const busProgress = progress - i * 0.025;

        // Position — convoy scrolls across frame, with seeded spacing jitter
        const spacedOffset = i * BUS_SPACING + jit.spacingOffset;
        let x: number;
        if (goingRight) {
          x =
            interpolate(busProgress, [0, 1], [-totalWidth, width + BUS_SPACING], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }) + spacedOffset;
        } else {
          x =
            interpolate(busProgress, [0, 1], [width + BUS_SPACING, -totalWidth], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }) -
            spacedOffset +
            totalWidth;
        }

        // Bounce: road bump sine wave, phased per bus, amplified by beat + drum onset
        const bobFreq = (5 + energy * 3) * tempoFactor;
        const bobAmp = 3 + energy * 6 + beatDecay * 8 + drumOnset * 5;
        const bob = Math.sin(frame * bobFreq * 0.008 + jit.phaseOffset) * bobAmp;

        // Body wobble: old VW suspension sway — slower, wider phase
        const wobble =
          Math.sin(frame * 0.035 * tempoFactor + jit.wobblePhase) *
          (2 + beatDecay * 3.5);

        // Wheel rotation: bass drives speed, accumulates over march progress
        const wheelBaseSpeed = 4 + bass * 12;
        const wheelSpin = (frame * wheelBaseSpeed * tempoFactor + i * 45) % 360;

        // Headlight brightness: energy + slight flicker on beats
        const hlBright = interpolate(energy, [0, 0.3, 1], [0.3, 0.6, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }) + beatDecay * 0.2;

        // Exhaust: visible at higher energy, phase for cloud drift
        const exhaustPhase = frame * 0.12 + i * 2.1;
        const exhaustOp = interpolate(energy, [0, 0.15, 0.6], [0.05, 0.2, 0.6], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        // Glow radius scales with energy
        const glowRadius = 5 + energy * 14;
        const glowColor = `hsla(${chromaHue}, 50%, 60%, 0.35)`;
        const glow = [
          `drop-shadow(0 0 ${glowRadius}px ${colors.body}66)`,
          `drop-shadow(0 0 ${glowRadius * 1.8}px ${glowColor})`,
        ].join(" ");

        // Roof rack on buses 0 and 2
        const hasRoofRack = i === 0 || i === 2;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: yBase + bob,
              opacity,
              filter: glow,
              transform: `scaleX(${goingRight ? 1 : -1})`,
              willChange: "transform, opacity",
            }}
          >
            <VWBus
              width={BUS_WIDTH}
              height={BUS_HEIGHT}
              body={colors.body}
              roof={colors.roof}
              accent={colors.accent}
              tieA={colors.tieA}
              tieB={colors.tieB}
              bobOffset={0}
              tiltDeg={wobble}
              wheelSpin={wheelSpin}
              headlightBrightness={Math.min(hlBright, 1)}
              headlightHue={chromaHue}
              exhaustPhase={exhaustPhase}
              exhaustOpacity={exhaustOp}
              busIndex={i}
              hasRoofRack={hasRoofRack}
            />
          </div>
        );
      })}
    </div>
  );
};
