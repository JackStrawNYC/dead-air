/**
 * MarchingTerrapins — A+++ parade of 5 richly-detailed terrapins.
 *
 * Each terrapin features:
 *   - Domed shell with radial gradient fill:
 *       - 7 central hexagonal scutes with inner detail hexes + cross-hatch growth lines
 *       - 14 marginal scutes along the rim with individual inner arcs
 *       - Shell highlight sheen overlay + rim stroke
 *   - Angular head with:
 *       - Beak mouth, nostril, jaw line
 *       - Brow ridge, cheek scale marks
 *       - Full eye (socket, iris, pupil, catchlight)
 *       - Scaled neck bridge (3 arc segments + wrinkle lines)
 *   - 4 independently-animated legs:
 *       - Each with joint detail ellipse, wrinkle texture arcs
 *       - 3 claw/toe bumps per foot
 *       - Alternating left-right gait locked to musicalTime
 *   - Segmented tail (4 segments + tip)
 *   - Plastron (belly) visible between legs
 *   - Ground shadow ellipse
 *   - Neon glow colored by chromaHue, energy-modulated
 *
 * March choreography: each terrapin at a different gait phase so they don't
 * step in unison. musicalTime drives gait, beatDecay drives bounce,
 * energy drives glow intensity, chromaHue drives palette, tempoFactor drives speed.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import {
  useAudioSnapshot,
  precomputeMarchWindows,
  findActiveMarch,
  type MarchConfig,
} from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ── constants ── */
const NUM_TURTLES = 5;
const TURTLE_SPACING = 280;
const TURTLE_SIZE = 200;

const MARCH_CONFIG: MarchConfig = {
  enterThreshold: 0.05,
  exitThreshold: 0.03,
  sustainFrames: 60,
  cooldownFrames: 250,
  marchDuration: 600,
};

/** Flat-top hex points centered at (cx, cy) with radius r */
const hexPts = (cx: number, cy: number, r: number): string => {
  let s = "";
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k - Math.PI / 2;
    s += `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)} `;
  }
  return s.trim();
};

const hsl = (h: number, s = 100, l = 60) => `hsl(${h % 360},${s}%,${l}%)`;

/* Leg layout: [cx, cy, rx, ry, baseRotation, clawDir] for FL / FR / BL / BR */
const LEG_DEFS: [number, number, number, number, number, number][] = [
  [36, 75, 11, 6.5, -8, -1],   // front-left
  [87, 75, 11, 6.5, 8, 1],     // front-right
  [28, 78, 12, 7, -12, -1],    // back-left
  [95, 78, 12, 7, 12, 1],      // back-right
];

/* 7 central scute positions: [cx, cy, outerR, innerR] */
const SCUTES: [number, number, number, number][] = [
  [62, 42, 9, 5],      // center (largest)
  [62, 28, 7.5, 4],    // top
  [49, 34, 7, 3.5],    // top-left
  [75, 34, 7, 3.5],    // top-right
  [62, 54, 7, 3.5],    // bottom
  [50, 49, 6.5, 3.2],  // bottom-left
  [74, 49, 6.5, 3.2],  // bottom-right
];

/* ── Single Terrapin SVG ── */
const Terrapin: React.FC<{
  size: number;
  hue: number;
  legPhases: [number, number, number, number];
  beatDecay: number;
  energy: number;
  index: number;
}> = ({ size, hue, legPhases, beatDecay, energy, index }) => {
  const rng = seeded(index * 7919 + 31);

  // Color palette derived from hue
  const primary = hsl(hue);
  const accent = hsl(hue + 30, 100, 70);
  const dark = hsl(hue, 80, 30);
  const mid = hsl(hue, 90, 45);
  const highlight = hsl(hue + 15, 100, 80);
  const belly = hsl(hue + 10, 60, 55);

  // Gradient IDs (unique per turtle to avoid SVG id collision)
  const gId = `shell-grad-${index}`;
  const sId = `shell-sheen-${index}`;

  // Beat bounce scales the shell dome slightly
  const shellScale = 1 + beatDecay * 0.03;

  return (
    <svg width={size} height={size * 0.78} viewBox="0 0 140 109" fill="none">
      <defs>
        {/* Shell radial gradient: highlight center -> primary -> dark rim */}
        <radialGradient id={gId} cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor={highlight} stopOpacity="0.9" />
          <stop offset="45%" stopColor={primary} stopOpacity="0.85" />
          <stop offset="100%" stopColor={dark} stopOpacity="0.7" />
        </radialGradient>
        {/* Shell highlight sheen */}
        <radialGradient id={sId} cx="42%" cy="30%" r="30%">
          <stop offset="0%" stopColor="white" stopOpacity="0.35" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── Ground shadow ellipse ── */}
      <ellipse
        cx="65"
        cy="104"
        rx={52 + energy * 4}
        ry="5"
        fill="black"
        opacity={0.25 + energy * 0.15}
      />

      {/* ── Segmented tail (4 segments + rounded tip) ── */}
      <g opacity="0.7">
        <path
          d="M14 55 Q10 57 7 56 Q4 54.5 3 52 Q1.5 50 2.5 48"
          stroke={primary}
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
        {/* Segment marks */}
        <line x1="11" y1="55.5" x2="9.5" y2="53.5" stroke={mid} strokeWidth="0.8" opacity="0.5" />
        <line x1="8" y1="55" x2="6.5" y2="53" stroke={mid} strokeWidth="0.8" opacity="0.45" />
        <line x1="5.5" y1="53.5" x2="4.2" y2="51.8" stroke={mid} strokeWidth="0.7" opacity="0.4" />
        <line x1="3.5" y1="51.5" x2="2.8" y2="49.5" stroke={mid} strokeWidth="0.6" opacity="0.35" />
        {/* Tail tip */}
        <circle cx="2.5" cy="48" r="1.3" fill={primary} opacity="0.6" />
      </g>

      {/* ── Plastron (belly) visible between legs ── */}
      <ellipse cx="62" cy="78" rx="28" ry="6" fill={belly} opacity="0.3" />
      <ellipse cx="62" cy="78" rx="20" ry="4" fill={belly} opacity="0.15" />

      {/* ── 4 legs with joint detail, wrinkle arcs, and 3 claws each ── */}
      {LEG_DEFS.map(([cx, cy, rx, ry, baseRot, dir], li) => {
        const ph = legPhases[li];
        const lift = Math.sin(ph) * 5;
        const rot = Math.sin(ph) * 8;
        const stride = Math.cos(ph) * 3;

        return (
          <g key={li} transform={`translate(${stride} ${lift})`}>
            <g transform={`rotate(${baseRot + rot * (dir < 0 ? 1 : -1)} ${cx} ${cy})`}>
              {/* Main leg shape */}
              <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={mid} opacity="0.8" />

              {/* Joint detail (lighter band at top of leg) */}
              <ellipse
                cx={cx}
                cy={cy - 4}
                rx={rx * 0.5}
                ry={ry * 0.43}
                fill={primary}
                opacity="0.4"
              />

              {/* Wrinkle/skin texture arcs on leg */}
              <path
                d={`M${cx - rx * 0.4} ${cy - 1} Q${cx} ${cy - 3} ${cx + rx * 0.4} ${cy - 1}`}
                stroke={dark}
                strokeWidth="0.5"
                fill="none"
                opacity="0.25"
              />
              <path
                d={`M${cx - rx * 0.3} ${cy + 1} Q${cx} ${cy - 0.5} ${cx + rx * 0.3} ${cy + 1}`}
                stroke={dark}
                strokeWidth="0.4"
                fill="none"
                opacity="0.2"
              />

              {/* 3 claw/toe bumps */}
              {[0, 1, 2].map((c) => (
                <circle
                  key={c}
                  cx={cx + dir * (rx - c * 4)}
                  cy={cy + ry - 2 + c * 1.5}
                  r={2 - c * 0.2}
                  fill={dark}
                  opacity={0.6 - c * 0.025}
                />
              ))}
            </g>
          </g>
        );
      })}

      {/* ── Shell (beat-scaled dome) ── */}
      <g transform={`translate(62 48) scale(${shellScale}) translate(-62 -48)`}>
        {/* Shell dome base with gradient fill */}
        <ellipse cx="62" cy="52" rx="40" ry="28" fill={`url(#${gId})`} />

        {/* ── 14 marginal scutes along the rim ── */}
        {Array.from({ length: 14 }, (_, k) => {
          const a = (Math.PI / 13) * k + Math.PI * 0.08;
          const mx = 62 + 37 * Math.cos(a - Math.PI);
          const my = 53 + 10 * Math.sin(a - Math.PI);
          const sw = 6 + rng() * 1.5;
          const sh = 4 + rng();
          const op = 0.35 + rng() * 0.15;
          return (
            <g key={k}>
              {/* Marginal scute body */}
              <ellipse
                cx={mx}
                cy={my}
                rx={sw}
                ry={sh}
                stroke={accent}
                strokeWidth="0.7"
                fill={mid}
                opacity={op}
              />
              {/* Inner detail arc on each marginal scute */}
              <path
                d={`M${mx - sw * 0.5} ${my} Q${mx} ${my - sh * 0.6} ${mx + sw * 0.5} ${my}`}
                stroke={accent}
                strokeWidth="0.4"
                fill="none"
                opacity={op * 0.5}
              />
            </g>
          );
        })}

        {/* Shell rim */}
        <ellipse
          cx="62"
          cy="58"
          rx="38"
          ry="11"
          stroke={accent}
          strokeWidth="1.2"
          fill="none"
          opacity="0.5"
        />

        {/* ── 7 central hexagonal scutes ── */}
        {SCUTES.map(([cx, cy, outerR, innerR], si) => {
          const isCenter = si === 0;
          return (
            <g key={si}>
              {/* Outer hex */}
              <polygon
                points={hexPts(cx, cy, outerR)}
                stroke={accent}
                strokeWidth={isCenter ? 1.4 : 1.1}
                fill={mid}
                opacity={0.45 - si * 0.015}
              />
              {/* Inner hex (growth ring) */}
              <polygon
                points={hexPts(cx, cy, innerR)}
                stroke={accent}
                strokeWidth={isCenter ? 0.6 : 0.5}
                fill="none"
                opacity={0.3 - si * 0.012}
              />
              {/* Tiny innermost hex (second growth ring) */}
              <polygon
                points={hexPts(cx, cy, innerR * 0.5)}
                stroke={accent}
                strokeWidth="0.3"
                fill="none"
                opacity={0.15}
              />
            </g>
          );
        })}

        {/* Center scute cross-hatch growth lines (3 radial lines) */}
        <line x1="62" y1="33" x2="62" y2="51" stroke={accent} strokeWidth="0.4" opacity="0.2" />
        <line x1="54" y1="37.5" x2="70" y2="46.5" stroke={accent} strokeWidth="0.4" opacity="0.2" />
        <line x1="70" y1="37.5" x2="54" y2="46.5" stroke={accent} strokeWidth="0.4" opacity="0.2" />

        {/* Shell dome highlight sheen overlay */}
        <ellipse cx="55" cy="36" rx="22" ry="14" fill={`url(#${sId})`} />

        {/* Specular crescent on dome top */}
        <path d="M42 34Q55 24 72 34" stroke="white" strokeWidth="1.2" fill="none" opacity="0.12" />
      </g>

      {/* ── Neck bridge: 3 scale arcs + wrinkle lines ── */}
      <rect x="98" y="44" width="16" height="12" rx="6" fill={mid} opacity="0.75" />
      {[0, 1, 2].map((n) => (
        <path key={`arc-${n}`} d={`M${100 + n} ${47 + n * 3}Q${103 + n} ${45 + n * 3} ${106 + n} ${47 + n * 3}`}
          stroke={accent} strokeWidth="0.6" fill="none" opacity={0.35 - n * 0.05} />
      ))}
      <line x1="99" y1="49" x2="113" y2="49" stroke={dark} strokeWidth="0.35" opacity="0.15" />
      <line x1="100" y1="52" x2="112" y2="52" stroke={dark} strokeWidth="0.3" opacity="0.12" />

      {/* ── Angular head with full anatomy ── */}
      <g>
        <path d="M112 42L126 44L128 48L124 53L114 54L110 50Z" fill={primary} opacity="0.85" />
        {/* Jaw line */}
        <path d="M114 54Q120 56 124 53" stroke={dark} strokeWidth="0.8" fill="none" opacity="0.3" />
        {/* Brow ridges (primary + secondary) */}
        <path d="M113 43Q119 40 125 43" stroke={accent} strokeWidth="1.2" fill="none" opacity="0.5" />
        <path d="M114 44Q119 41.5 124 44" stroke={dark} strokeWidth="0.5" fill="none" opacity="0.2" />
        {/* Cheek scales */}
        <path d="M115 50Q117 49 116 51" stroke={dark} strokeWidth="0.4" fill="none" opacity="0.2" />
        <path d="M117 51Q119 50 118 52" stroke={dark} strokeWidth="0.4" fill="none" opacity="0.18" />
        {/* Eye: socket, iris, pupil, catchlight */}
        <ellipse cx="120" cy="46" rx="4" ry="3.5" fill={dark} opacity="0.3" />
        <circle cx="120" cy="46" r="2.8" fill={hsl(hue + 60, 70, 40)} opacity="0.9" />
        <circle cx="120.5" cy="45.8" r="1.4" fill="black" opacity="0.85" />
        <circle cx="121.3" cy="44.8" r="0.7" fill="white" opacity="0.9" />
        {/* Beak / mouth + nostril */}
        <path d="M126 48L131 49L127 51" stroke={dark} strokeWidth="1.3" fill={hsl(hue, 60, 50)} opacity="0.7" />
        <circle cx="127" cy="47.5" r="0.6" fill="black" opacity="0.4" />
      </g>
    </svg>
  );
};

/* ── Main component ── */
interface Props {
  frames: EnhancedFrameData[];
}

export const MarchingTerrapins: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const { energy, beatDecay: bd, chromaHue, musicalTime } = snap;

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

  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], { ...clamp, easing: Easing.in(Easing.cubic) });
  const baseOpacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0, 0.15], [0.5, 0.85], clamp);

  const totalWidth = NUM_TURTLES * TURTLE_SPACING;
  const yBase = height - TURTLE_SIZE * 0.78 - 18;

  // Gait base speed driven by tempoFactor
  const gaitSpeed = 0.06 * tempoFactor;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {Array.from({ length: NUM_TURTLES }, (_, i) => {
        const tp = progress - i * 0.02; // stagger march progress

        // Position across screen
        const xRange: [number, number] = goingRight
          ? [-totalWidth, width + TURTLE_SPACING]
          : [width + TURTLE_SPACING, -totalWidth];
        const xBase = interpolate(tp, [0, 1], xRange, clamp);
        const x = goingRight
          ? xBase + i * TURTLE_SPACING
          : xBase - i * TURTLE_SPACING + totalWidth;

        // Beat-driven bob + gentle sine sway
        const bobBase = Math.sin(frame * (2 + energy * 1.5) * tempoFactor * 0.01 + i * 1.8);
        const bob = bobBase * (3 + energy * 4 + bd * 6);
        const tilt = Math.sin(frame * 0.02 * tempoFactor + i * 1.1) * 3;

        // 4 independent leg phases: alternating left-right gait locked to musicalTime
        const gaitBase = musicalTime > 0 ? musicalTime * Math.PI * 2 : frame * gaitSpeed;
        const po = i * 0.9;
        const legPhases: [number, number, number, number] = [
          gaitBase + po,                    // FL
          gaitBase + po + Math.PI,            // FR (opposite)
          gaitBase + po + Math.PI * 0.5,      // BL (quarter offset)
          gaitBase + po + Math.PI * 1.5,      // BR (opposite of BL)
        ];

        // Per-turtle staggered fade
        const fo = i * 0.03;
        const individualFade = interpolate(
          progress, [fo, fo + 0.08, 0.88 - fo, 0.96 - fo], [0, 1, 1, 0], clamp,
        );

        // Neon glow: chromaHue-colored, energy + beatDecay modulated
        const turtleHue = (chromaHue + i * 55) % 360;
        const gc = hsl(turtleHue, 100, 55);
        const gs = 8 + energy * 18 + bd * 10;
        const glow = `drop-shadow(0 0 ${gs * 0.5}px ${gc}) drop-shadow(0 0 ${gs}px ${gc}) drop-shadow(0 0 ${gs * 1.8}px ${gc})`;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: yBase + bob,
              transform: `rotate(${tilt}deg) scaleX(${goingRight ? 1 : -1})`,
              opacity: baseOpacity * individualFade,
              filter: glow,
              willChange: "transform, opacity",
            }}
          >
            <Terrapin
              size={TURTLE_SIZE} hue={turtleHue} legPhases={legPhases}
              beatDecay={bd} energy={energy} index={i}
            />
          </div>
        );
      })}
    </div>
  );
};
