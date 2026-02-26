/**
 * DeadIcons — psychedelic Grateful Dead iconography overlay.
 * Bold, colorful icons that shoot, spin, and streak across the frame.
 * 1-2 at a time, large, bright neon colors, kinetic motion paths.
 * Deterministic via frame-based seed — no Math.random().
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type IconFC = React.FC<{ size: number; color: string }>;

// ── Psychedelic Color Palette ───────────────────────────────────

const PSYCHEDELIC_COLORS = [
  "#FF1493", // deep pink
  "#FF4500", // orange red
  "#FFD700", // gold
  "#00FF7F", // spring green
  "#00FFFF", // cyan
  "#FF00FF", // magenta
  "#7B68EE", // medium slate blue
  "#FF6347", // tomato
  "#ADFF2F", // green yellow
  "#FF69B4", // hot pink
  "#00CED1", // dark turquoise
  "#FFA500", // orange
  "#DA70D6", // orchid
  "#32CD32", // lime green
  "#FF1744", // neon red
  "#651FFF", // deep purple
  "#00E5FF", // neon cyan
  "#FFEA00", // neon yellow
  "#F50057", // neon pink
  "#76FF03", // neon green
];

// ── SVG Icon Library (16 icons) ─────────────────────────────────

const StealYourFace: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="46" stroke={color} strokeWidth="4" />
    <line x1="4" y1="50" x2="96" y2="50" stroke={color} strokeWidth="3" />
    <polygon points="50,8 42,42 54,42 38,92 58,52 46,52 58,8" fill={color} />
    <circle cx="34" cy="38" r="8" stroke={color} strokeWidth="3" />
    <circle cx="66" cy="38" r="8" stroke={color} strokeWidth="3" />
  </svg>
);

const LightningBolt: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 60 100" fill="none">
    <polygon points="35,0 10,55 28,55 18,100 50,40 32,40 45,0" fill={color} />
  </svg>
);

const DancingBear: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 80 100" fill="none">
    <ellipse cx="40" cy="55" rx="20" ry="25" fill={color} />
    <circle cx="40" cy="22" r="14" fill={color} />
    <circle cx="28" cy="12" r="6" fill={color} />
    <circle cx="52" cy="12" r="6" fill={color} />
    <ellipse cx="40" cy="26" rx="6" ry="4" fill={color} opacity="0.6" />
    <line x1="25" y1="42" x2="8" y2="25" stroke={color} strokeWidth="7" strokeLinecap="round" />
    <line x1="55" y1="42" x2="72" y2="35" stroke={color} strokeWidth="7" strokeLinecap="round" />
    <line x1="32" y1="75" x2="22" y2="98" stroke={color} strokeWidth="7" strokeLinecap="round" />
    <line x1="48" y1="75" x2="62" y2="92" stroke={color} strokeWidth="7" strokeLinecap="round" />
  </svg>
);

const DeadRose: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 80 100" fill="none">
    <circle cx="40" cy="28" r="14" fill={color} opacity="0.85" />
    <circle cx="30" cy="34" r="12" fill={color} opacity="0.75" />
    <circle cx="50" cy="34" r="12" fill={color} opacity="0.75" />
    <circle cx="34" cy="42" r="11" fill={color} opacity="0.65" />
    <circle cx="46" cy="42" r="11" fill={color} opacity="0.65" />
    <circle cx="40" cy="35" r="6" fill={color} />
    <line x1="40" y1="50" x2="40" y2="95" stroke={color} strokeWidth="4" strokeLinecap="round" />
    <ellipse cx="50" cy="70" rx="10" ry="5" fill={color} opacity="0.7" transform="rotate(-30 50 70)" />
    <ellipse cx="30" cy="80" rx="9" ry="4" fill={color} opacity="0.7" transform="rotate(25 30 80)" />
  </svg>
);

const Terrapin: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 100 80" fill="none">
    <ellipse cx="50" cy="40" rx="30" ry="22" fill={color} opacity="0.75" />
    <ellipse cx="50" cy="38" rx="18" ry="14" stroke={color} strokeWidth="2" opacity="0.5" />
    <line x1="50" y1="20" x2="50" y2="58" stroke={color} strokeWidth="1.5" opacity="0.4" />
    <line x1="32" y1="30" x2="68" y2="30" stroke={color} strokeWidth="1.5" opacity="0.4" />
    <line x1="32" y1="48" x2="68" y2="48" stroke={color} strokeWidth="1.5" opacity="0.4" />
    <ellipse cx="82" cy="40" rx="8" ry="6" fill={color} opacity="0.8" />
    <ellipse cx="30" cy="58" rx="6" ry="4" fill={color} opacity="0.6" transform="rotate(20 30 58)" />
    <ellipse cx="70" cy="58" rx="6" ry="4" fill={color} opacity="0.6" transform="rotate(-20 70 58)" />
    <ellipse cx="30" cy="24" rx="6" ry="4" fill={color} opacity="0.6" transform="rotate(-20 30 24)" />
    <ellipse cx="70" cy="24" rx="6" ry="4" fill={color} opacity="0.6" transform="rotate(20 70 24)" />
    <line x1="20" y1="40" x2="10" y2="42" stroke={color} strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const Bertha: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <ellipse cx="50" cy="45" rx="28" ry="32" fill={color} opacity="0.8" />
    <circle cx="38" cy="38" r="8" fill="black" opacity="0.5" />
    <circle cx="62" cy="38" r="8" fill="black" opacity="0.5" />
    <ellipse cx="50" cy="52" rx="4" ry="6" fill="black" opacity="0.4" />
    <rect x="38" y="60" width="24" height="10" rx="3" fill={color} opacity="0.7" />
    <line x1="42" y1="60" x2="42" y2="70" stroke="black" strokeWidth="1.5" opacity="0.3" />
    <line x1="50" y1="60" x2="50" y2="70" stroke="black" strokeWidth="1.5" opacity="0.3" />
    <line x1="58" y1="60" x2="58" y2="70" stroke="black" strokeWidth="1.5" opacity="0.3" />
    <circle cx="22" cy="30" r="9" fill={color} opacity="0.6" />
    <circle cx="78" cy="30" r="9" fill={color} opacity="0.6" />
    <circle cx="18" cy="50" r="8" fill={color} opacity="0.55" />
    <circle cx="82" cy="50" r="8" fill={color} opacity="0.55" />
    <circle cx="30" cy="15" r="7" fill={color} opacity="0.5" />
    <circle cx="70" cy="15" r="7" fill={color} opacity="0.5" />
    <circle cx="50" cy="8" r="8" fill={color} opacity="0.6" />
  </svg>
);

const SkeletonHand: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 80 100" fill="none">
    <rect x="25" y="50" width="30" height="30" rx="5" fill={color} opacity="0.8" />
    <rect x="28" y="10" width="8" height="42" rx="4" fill={color} opacity="0.85" />
    <rect x="40" y="5" width="8" height="47" rx="4" fill={color} opacity="0.85" />
    <rect x="52" y="12" width="8" height="40" rx="4" fill={color} opacity="0.85" />
    <rect x="16" y="18" width="8" height="35" rx="4" fill={color} opacity="0.8" />
    <rect x="55" y="55" width="20" height="8" rx="4" fill={color} opacity="0.8" transform="rotate(-30 55 55)" />
    <rect x="30" y="80" width="8" height="18" rx="2" fill={color} opacity="0.7" />
    <rect x="42" y="80" width="8" height="18" rx="2" fill={color} opacity="0.7" />
  </svg>
);

const Mushroom: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 80 100" fill="none">
    <ellipse cx="40" cy="35" rx="35" ry="28" fill={color} opacity="0.8" />
    <circle cx="28" cy="28" r="6" fill={color} opacity="0.5" />
    <circle cx="50" cy="22" r="8" fill={color} opacity="0.45" />
    <circle cx="38" cy="40" r="5" fill={color} opacity="0.5" />
    <circle cx="58" cy="35" r="4" fill={color} opacity="0.45" />
    <rect x="32" y="48" width="16" height="40" rx="6" fill={color} opacity="0.75" />
    <ellipse cx="40" cy="58" rx="14" ry="4" fill={color} opacity="0.6" />
    <ellipse cx="40" cy="92" rx="18" ry="6" fill={color} opacity="0.6" />
  </svg>
);

const SunFace: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="25" fill={color} opacity="0.75" />
    <circle cx="42" cy="44" r="4" fill="black" opacity="0.5" />
    <circle cx="58" cy="44" r="4" fill="black" opacity="0.5" />
    <path d="M 40 56 Q 50 65 60 56" stroke="black" strokeWidth="2" fill="none" opacity="0.5" />
    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return (
        <line
          key={deg}
          x1={50 + 28 * Math.cos(rad)} y1={50 + 28 * Math.sin(rad)}
          x2={50 + 46 * Math.cos(rad)} y2={50 + 46 * Math.sin(rad)}
          stroke={color} strokeWidth={deg % 60 === 0 ? "4" : "2.5"}
          strokeLinecap="round" opacity="0.7"
        />
      );
    })}
  </svg>
);

const CrescentMoon: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 80 100" fill="none">
    <path d="M 55 10 A 40 40 0 1 1 55 90 A 28 40 0 1 0 55 10" fill={color} opacity="0.8" />
    <circle cx="38" cy="42" r="3" fill="black" opacity="0.5" />
    <path d="M 32 52 Q 38 58 44 54" stroke="black" strokeWidth="2" fill="none" opacity="0.5" />
  </svg>
);

const DeadSpiral: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <path
      d={`M 50 50 C 50 45, 55 40, 55 50 C 55 60, 45 65, 40 50
        C 35 35, 45 25, 60 30 C 75 35, 75 65, 55 70
        C 35 75, 20 60, 25 40 C 30 20, 55 10, 70 25
        C 85 40, 80 70, 55 80 C 30 90, 10 65, 15 35
        C 20 5, 60 -5, 80 20`}
      stroke={color} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"
    />
  </svg>
);

const PeaceSign: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="44" stroke={color} strokeWidth="4" />
    <line x1="50" y1="6" x2="50" y2="94" stroke={color} strokeWidth="4" />
    <line x1="50" y1="50" x2="20" y2="80" stroke={color} strokeWidth="4" />
    <line x1="50" y1="50" x2="80" y2="80" stroke={color} strokeWidth="4" />
  </svg>
);

const SkeletonGuitar: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="18" r="14" fill={color} opacity="0.85" />
    <circle cx="45" cy="15" r="3" fill="black" opacity="0.5" />
    <circle cx="55" cy="15" r="3" fill="black" opacity="0.5" />
    <rect x="44" y="22" width="12" height="5" rx="1" fill={color} opacity="0.6" />
    <line x1="50" y1="32" x2="50" y2="65" stroke={color} strokeWidth="4" />
    <path d="M 38 40 Q 44 44 50 40 Q 56 44 62 40" stroke={color} strokeWidth="2.5" opacity="0.6" />
    <path d="M 40 47 Q 45 50 50 47 Q 55 50 60 47" stroke={color} strokeWidth="2.5" opacity="0.6" />
    <line x1="42" y1="42" x2="22" y2="55" stroke={color} strokeWidth="4" strokeLinecap="round" />
    <line x1="58" y1="42" x2="72" y2="58" stroke={color} strokeWidth="4" strokeLinecap="round" />
    <ellipse cx="68" cy="62" rx="14" ry="10" fill={color} opacity="0.6" />
    <ellipse cx="68" cy="72" rx="12" ry="9" fill={color} opacity="0.55" />
    <circle cx="68" cy="65" r="3" fill="black" opacity="0.3" />
    <line x1="56" y1="58" x2="22" y2="52" stroke={color} strokeWidth="4" opacity="0.7" />
    <line x1="46" y1="65" x2="35" y2="95" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.75" />
    <line x1="54" y1="65" x2="65" y2="95" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.75" />
  </svg>
);

const DancingSkeleton: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="16" r="13" fill={color} opacity="0.85" />
    <circle cx="45" cy="13" r="3" fill="black" opacity="0.5" />
    <circle cx="55" cy="13" r="3" fill="black" opacity="0.5" />
    <path d="M 44 20 Q 50 25 56 20" stroke="black" strokeWidth="2" fill="none" opacity="0.5" />
    <line x1="50" y1="29" x2="50" y2="58" stroke={color} strokeWidth="4" />
    <path d="M 36 36 Q 43 40 50 36 Q 57 40 64 36" stroke={color} strokeWidth="2.5" opacity="0.6" />
    <path d="M 38 43 Q 44 46 50 43 Q 56 46 62 43" stroke={color} strokeWidth="2.5" opacity="0.6" />
    <ellipse cx="50" cy="60" rx="12" ry="5" fill={color} opacity="0.65" />
    <line x1="40" y1="36" x2="18" y2="22" stroke={color} strokeWidth="4" strokeLinecap="round" />
    <line x1="18" y1="22" x2="25" y2="8" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="60" y1="36" x2="82" y2="30" stroke={color} strokeWidth="4" strokeLinecap="round" />
    <line x1="82" y1="30" x2="90" y2="22" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="42" y1="63" x2="20" y2="78" stroke={color} strokeWidth="4" strokeLinecap="round" />
    <line x1="20" y1="78" x2="12" y2="92" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="58" y1="63" x2="65" y2="82" stroke={color} strokeWidth="4" strokeLinecap="round" />
    <line x1="65" y1="82" x2="62" y2="98" stroke={color} strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const EyeOfProvidence: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <polygon points="50,8 8,88 92,88" stroke={color} strokeWidth="3" opacity="0.8" />
    <ellipse cx="50" cy="52" rx="20" ry="12" stroke={color} strokeWidth="3" />
    <circle cx="50" cy="52" r="7" fill={color} opacity="0.8" />
    <circle cx="50" cy="52" r="3" fill="black" opacity="0.5" />
    <line x1="50" y1="38" x2="50" y2="25" stroke={color} strokeWidth="2" opacity="0.6" />
    <line x1="62" y1="42" x2="70" y2="32" stroke={color} strokeWidth="2" opacity="0.6" />
    <line x1="38" y1="42" x2="30" y2="32" stroke={color} strokeWidth="2" opacity="0.6" />
  </svg>
);

const ThirteenBolt: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="44" stroke={color} strokeWidth="3" />
    <text
      x="50" y="58" textAnchor="middle" dominantBaseline="middle"
      fontSize="42" fontWeight="bold" fontFamily="serif"
      fill={color}
    >
      13
    </text>
    <polygon points="50,2 46,16 54,16 50,2" fill={color} />
    <polygon points="50,98 46,84 54,84 50,98" fill={color} />
  </svg>
);

// ── Icon Registry + Weights ─────────────────────────────────────

const ICONS: IconFC[] = [
  StealYourFace, LightningBolt, DancingBear, DeadRose, Terrapin,
  Bertha, SkeletonHand, Mushroom, SunFace, CrescentMoon,
  DeadSpiral, PeaceSign, SkeletonGuitar, DancingSkeleton,
  EyeOfProvidence, ThirteenBolt,
];

const ICON_WEIGHTS = [
  0, 0, 0,    // SYF x3
  1, 1,       // Bolt x2
  2, 2, 2,    // Bear x3
  3, 3,       // Rose x2
  4,          // Terrapin
  5,          // Bertha
  6,          // SkeletonHand
  7,          // Mushroom
  8,          // SunFace
  9,          // Moon
  10,         // Spiral
  11,         // Peace
  12, 12,     // SkeletonGuitar x2
  13, 13,     // DancingSkeleton x2
  14,         // Eye
  15,         // Thirteen
];

// ── Motion Paths ────────────────────────────────────────────────

type MotionType = "streak_lr" | "streak_rl" | "streak_up" | "rise_spin" | "zoom_through" | "orbit" | "diagonal_tumble";
const MOTION_TYPES: MotionType[] = ["streak_lr", "streak_rl", "streak_up", "rise_spin", "zoom_through", "orbit", "diagonal_tumble"];

interface MotionState {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
}

/** Compute position/rotation/scale/opacity for a given motion type at progress 0-1 */
function computeMotion(
  motion: MotionType,
  progress: number, // 0-1 through lifetime
  screenW: number,
  screenH: number,
  yOffset: number, // 0-1 random vertical offset
  seed: number, // per-icon seed for variation
): MotionState {
  // Fade envelope: quick in, hold, quick out
  const fadeIn = Math.min(1, progress * 5); // 0-20% fade in
  const fadeOut = Math.min(1, (1 - progress) * 5); // 80-100% fade out
  const opacity = Math.min(fadeIn, fadeOut);

  const p = progress; // shorthand

  switch (motion) {
    case "streak_lr": {
      // Shoot left to right across screen
      const x = interpolate(p, [0, 1], [-0.15 * screenW, 1.15 * screenW], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const y = screenH * (0.15 + yOffset * 0.7);
      const wobble = Math.sin(p * Math.PI * 4 + seed) * 20;
      return { x, y: y + wobble, rotation: p * 360 * 2, scale: 1 + Math.sin(p * Math.PI) * 0.3, opacity };
    }
    case "streak_rl": {
      // Shoot right to left
      const x = interpolate(p, [0, 1], [1.15 * screenW, -0.15 * screenW], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const y = screenH * (0.15 + yOffset * 0.7);
      const wobble = Math.sin(p * Math.PI * 3 + seed) * 25;
      return { x, y: y + wobble, rotation: -p * 360 * 2.5, scale: 1 + Math.sin(p * Math.PI) * 0.25, opacity };
    }
    case "streak_up": {
      // Rise from bottom to top
      const x = screenW * (0.15 + yOffset * 0.7);
      const y = interpolate(p, [0, 1], [screenH * 1.15, -screenH * 0.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const sway = Math.sin(p * Math.PI * 3 + seed) * 40;
      return { x: x + sway, y, rotation: p * 360 * 1.5, scale: 0.8 + Math.sin(p * Math.PI) * 0.5, opacity };
    }
    case "rise_spin": {
      // Float up from center-bottom with fast spin
      const cx = screenW * (0.3 + yOffset * 0.4);
      const x = cx + Math.sin(p * Math.PI * 2 + seed) * 80;
      const y = interpolate(p, [0, 1], [screenH * 0.95, screenH * 0.05], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      return { x, y, rotation: p * 360 * 4, scale: 0.5 + p * 0.8, opacity };
    }
    case "zoom_through": {
      // Start small in center, zoom past camera
      const cx = screenW * (0.3 + yOffset * 0.4);
      const cy = screenH * (0.3 + seed * 0.4 - Math.floor(seed * 0.4));
      const scale = interpolate(p, [0, 0.7, 1], [0.2, 1.2, 2.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const drift = (p * p) * 100;
      return { x: cx + drift * (yOffset - 0.5), y: cy - drift * 0.3, rotation: p * 180, scale, opacity: opacity * interpolate(p, [0.7, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) };
    }
    case "orbit": {
      // Circular orbit around center
      const cx = screenW * 0.5;
      const cy = screenH * 0.5;
      const angle = p * Math.PI * 2 + seed * Math.PI;
      const radius = screenW * (0.2 + yOffset * 0.15);
      return {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius * 0.6,
        rotation: p * 360 * 3,
        scale: 0.8 + Math.sin(p * Math.PI) * 0.4,
        opacity,
      };
    }
    case "diagonal_tumble": {
      // Corner to corner diagonal with tumble
      const startLeft = seed > 0.5;
      const x = startLeft
        ? interpolate(p, [0, 1], [-0.1 * screenW, 1.1 * screenW], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        : interpolate(p, [0, 1], [1.1 * screenW, -0.1 * screenW], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const y = interpolate(p, [0, 1], [screenH * (0.1 + yOffset * 0.3), screenH * (0.6 + yOffset * 0.3)], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const bounce = Math.abs(Math.sin(p * Math.PI * 5)) * 30;
      return { x, y: y + bounce, rotation: p * 360 * 3 * (startLeft ? 1 : -1), scale: 1, opacity };
    }
  }
}

// ── Scheduled Icon ──────────────────────────────────────────────

interface ScheduledIcon {
  iconIndex: number;
  startFrame: number;
  lifetime: number;
  motion: MotionType;
  colorIndex: number;
  colorIndex2: number; // second color for cycling
  yOffset: number;
  seed: number;
  size: number;
  glowColor: string;
}

const BASE_INTERVAL = 180; // new icon every 6 seconds
const MAX_CONCURRENT = 2;  // 1-2 at a time

function generateSchedule(totalFrames: number, masterSeed: number): ScheduledIcon[] {
  const rng = seeded(masterSeed);
  const icons: ScheduledIcon[] = [];

  let nextStart = 30; // first icon after 1 second
  while (nextStart < totalFrames) {
    const lifetime = 150 + Math.floor(rng() * 120); // 5-9 seconds
    const weightIdx = Math.floor(rng() * ICON_WEIGHTS.length);
    const motionIdx = Math.floor(rng() * MOTION_TYPES.length);
    const colorIdx = Math.floor(rng() * PSYCHEDELIC_COLORS.length);
    const colorIdx2 = Math.floor(rng() * PSYCHEDELIC_COLORS.length);

    icons.push({
      iconIndex: ICON_WEIGHTS[weightIdx],
      startFrame: nextStart,
      lifetime,
      motion: MOTION_TYPES[motionIdx],
      colorIndex: colorIdx,
      colorIndex2: colorIdx2,
      yOffset: rng(),
      seed: rng() * 100,
      size: 140 + Math.floor(rng() * 120), // 140-260px (big!)
      glowColor: PSYCHEDELIC_COLORS[colorIdx],
    });

    // Gap between icons: 4-8 seconds
    nextStart += lifetime + Math.floor(60 + rng() * 120);
  }
  return icons;
}

// ── Component ───────────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
  baseOpacity?: number;
}

export const DeadIcons: React.FC<Props> = ({ frames, baseOpacity = 1 }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  // Rolling energy
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let energySum = 0;
  let energyCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    energySum += frames[i].rms;
    energyCount++;
  }
  const energy = energyCount > 0 ? energySum / energyCount : 0;

  // Energy drives spin speed multiplier and brightness
  const energyMult = interpolate(energy, [0.05, 0.3], [0.6, 1.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const schedule = React.useMemo(
    () => generateSchedule(durationInFrames, 77508),
    [durationInFrames],
  );

  // Collect active icons (max 2 concurrent)
  const active: Array<{ icon: ScheduledIcon; age: number }> = [];
  for (const icon of schedule) {
    const age = frame - icon.startFrame;
    if (age >= 0 && age < icon.lifetime) {
      active.push({ icon, age });
      if (active.length >= MAX_CONCURRENT) break;
    }
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {active.map(({ icon, age }, i) => {
        const progress = age / icon.lifetime;
        const state = computeMotion(icon.motion, progress, width, height, icon.yOffset, icon.seed);

        const finalOpacity = state.opacity * baseOpacity * 0.7;
        if (finalOpacity < 0.01) return null;

        // Cycle between two psychedelic colors over the lifetime
        const colorMix = Math.sin(progress * Math.PI * 3) * 0.5 + 0.5;
        const c1 = PSYCHEDELIC_COLORS[icon.colorIndex];
        const c2 = PSYCHEDELIC_COLORS[icon.colorIndex2];

        // Parse hex to RGB for mixing
        const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
        const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
        const r = Math.round(r1 + (r2 - r1) * colorMix);
        const g = Math.round(g1 + (g2 - g1) * colorMix);
        const b = Math.round(b1 + (b2 - b1) * colorMix);
        const mixedColor = `rgb(${r},${g},${b})`;

        const scale = state.scale * energyMult;

        const IconComponent = ICONS[icon.iconIndex];

        return (
          <div
            key={icon.startFrame}
            style={{
              position: "absolute",
              left: state.x,
              top: state.y,
              transform: `translate(-50%, -50%) rotate(${state.rotation}deg) scale(${scale})`,
              opacity: finalOpacity,
              filter: `drop-shadow(0 0 12px ${mixedColor}) drop-shadow(0 0 25px ${mixedColor})`,
              willChange: "transform, opacity, filter",
            }}
          >
            <IconComponent size={icon.size} color={mixedColor} />
          </div>
        );
      })}
    </div>
  );
};
