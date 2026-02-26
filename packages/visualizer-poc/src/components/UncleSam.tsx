/**
 * UncleSam — Uncle Sam skeleton pointing at camera ("I WANT YOU" Dead style).
 * Large SVG figure: skeleton wearing a top hat with stars, pointing finger extended toward viewer.
 * Appears during high energy peaks (energy > 0.2).
 * Zooms in from small (0.3) to large (1.2) then zooms past (2.5x) and fades.
 * Appears every 90 seconds for 6 seconds (short and impactful).
 * Bold neon colors, heavy glow. The pointing hand is prominent.
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

const APPEAR_DURATION = 180; // 6 seconds at 30fps
const APPEAR_GAP = 2520;     // 84 second gap (90s total cycle)
const APPEAR_CYCLE = APPEAR_DURATION + APPEAR_GAP;

const NEON_PALETTES = [
  { primary: "#FF1744", accent: "#00E5FF", hat: "#651FFF", stars: "#FFD700" },
  { primary: "#FF00FF", accent: "#76FF03", hat: "#FF1493", stars: "#00FFFF" },
  { primary: "#FF4500", accent: "#ADFF2F", hat: "#DA70D6", stars: "#FFD700" },
  { primary: "#00FF7F", accent: "#FF69B4", hat: "#00CED1", stars: "#FFEA00" },
];

/** Uncle Sam skeleton SVG — tall hat with stars, pointing hand prominent */
const UncleSamSkeleton: React.FC<{
  size: number;
  primary: string;
  accent: string;
  hatColor: string;
  starColor: string;
}> = ({ size, primary, accent, hatColor, starColor }) => (
  <svg width={size} height={size * 1.5} viewBox="0 0 140 210" fill="none">
    {/* ─── TOP HAT ─── */}
    {/* Hat brim */}
    <ellipse cx="70" cy="42" rx="38" ry="8" fill={hatColor} opacity="0.85" />
    {/* Hat body (tall cylinder) */}
    <rect x="45" y="2" width="50" height="42" rx="3" fill={hatColor} opacity="0.8" />
    {/* Hat band */}
    <rect x="45" y="30" width="50" height="8" fill={accent} opacity="0.7" />
    {/* Stars on hat */}
    {[54, 66, 78].map((sx, i) => (
      <g key={i} transform={`translate(${sx}, ${14 + i * 5})`}>
        <polygon
          points="0,-5 1.5,-1.5 5.5,-1.5 2.5,1 3.5,5 0,2.5 -3.5,5 -2.5,1 -5.5,-1.5 -1.5,-1.5"
          fill={starColor}
          opacity="0.9"
        />
      </g>
    ))}
    {/* Hat stripe pattern */}
    {[6, 13, 20, 27].map((sy) => (
      <line key={sy} x1="47" y1={sy} x2="93" y2={sy} stroke={primary} strokeWidth="1.5" opacity="0.3" />
    ))}

    {/* ─── SKULL ─── */}
    <ellipse cx="70" cy="62" rx="18" ry="20" fill={primary} opacity="0.85" />
    {/* Eye sockets (large, menacing) */}
    <circle cx="62" cy="58" r="6" fill="black" opacity="0.6" />
    <circle cx="78" cy="58" r="6" fill="black" opacity="0.6" />
    {/* Eye glow dots */}
    <circle cx="62" cy="58" r="2" fill={accent} opacity="0.7" />
    <circle cx="78" cy="58" r="2" fill={accent} opacity="0.7" />
    {/* Nose hole */}
    <ellipse cx="70" cy="66" rx="3" ry="4.5" fill="black" opacity="0.5" />
    {/* Teeth — grinning */}
    <rect x="58" y="73" width="24" height="7" rx="1" fill={primary} opacity="0.7" />
    {[60, 63, 66, 69, 72, 75, 78].map((tx) => (
      <line
        key={tx}
        x1={tx}
        y1="73"
        x2={tx}
        y2="80"
        stroke="black"
        strokeWidth="1"
        opacity="0.35"
      />
    ))}
    {/* Cheekbones */}
    <line x1="52" y1="62" x2="48" y2="56" stroke={primary} strokeWidth="2" opacity="0.4" />
    <line x1="88" y1="62" x2="92" y2="56" stroke={primary} strokeWidth="2" opacity="0.4" />

    {/* ─── SPINE / TORSO ─── */}
    <line x1="70" y1="82" x2="70" y2="130" stroke={primary} strokeWidth="4" />
    {/* Ribs */}
    {[90, 98, 106, 114].map((ry) => (
      <path
        key={ry}
        d={`M 54 ${ry} Q 70 ${ry - 4} 86 ${ry}`}
        stroke={primary}
        strokeWidth="2.5"
        opacity="0.5"
        fill="none"
      />
    ))}
    {/* Sternum */}
    <line x1="70" y1="86" x2="70" y2="118" stroke={primary} strokeWidth="1.5" opacity="0.3" />

    {/* Pelvis */}
    <ellipse cx="70" cy="134" rx="16" ry="6" fill={primary} opacity="0.55" />

    {/* ─── LEFT ARM (at side, slight gesture) ─── */}
    <line x1="56" y1="90" x2="32" y2="108" stroke={primary} strokeWidth="4" strokeLinecap="round" />
    <line x1="32" y1="108" x2="24" y2="130" stroke={primary} strokeWidth="3.5" strokeLinecap="round" />
    {/* Left hand (relaxed fist) */}
    <circle cx="22" cy="133" r="5" fill={primary} opacity="0.7" />

    {/* ─── RIGHT ARM (POINTING AT VIEWER) ─── */}
    {/* Upper arm — extends forward/out */}
    <line x1="84" y1="90" x2="110" y2="80" stroke={primary} strokeWidth="5" strokeLinecap="round" />
    {/* Forearm — angled toward camera */}
    <line x1="110" y1="80" x2="132" y2="68" stroke={primary} strokeWidth="4.5" strokeLinecap="round" />
    {/* Hand — open with pointing index finger */}
    <circle cx="134" cy="66" r="5" fill={primary} opacity="0.8" />
    {/* POINTING INDEX FINGER (prominent, extended) */}
    <line x1="136" y1="63" x2="140" y2="48" stroke={accent} strokeWidth="5" strokeLinecap="round" />
    {/* Finger bone segments */}
    <line x1="138" y1="56" x2="140" y2="55" stroke={primary} strokeWidth="2" opacity="0.5" />
    {/* Other fingers curled */}
    <line x1="133" y1="62" x2="130" y2="58" stroke={primary} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
    <line x1="131" y1="64" x2="127" y2="61" stroke={primary} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
    <line x1="130" y1="67" x2="126" y2="65" stroke={primary} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />

    {/* ─── LEGS ─── */}
    <line x1="62" y1="138" x2="50" y2="180" stroke={primary} strokeWidth="4" strokeLinecap="round" />
    <line x1="78" y1="138" x2="90" y2="180" stroke={primary} strokeWidth="4" strokeLinecap="round" />
    {/* Knee joints */}
    <circle cx="56" cy="160" r="3" fill={primary} opacity="0.4" />
    <circle cx="84" cy="160" r="3" fill={primary} opacity="0.4" />
    {/* Boots */}
    <ellipse cx="47" cy="184" rx="11" ry="5" fill={primary} opacity="0.7" />
    <ellipse cx="93" cy="184" rx="11" ry="5" fill={primary} opacity="0.7" />
    {/* Boot stripes */}
    <line x1="39" y1="182" x2="55" y2="182" stroke={accent} strokeWidth="1.5" opacity="0.4" />
    <line x1="85" y1="182" x2="101" y2="182" stroke={accent} strokeWidth="1.5" opacity="0.4" />

    {/* ─── COAT TAILS (ghostly outline) ─── */}
    <path
      d="M 54 120 Q 44 145 38 170"
      stroke={primary}
      strokeWidth="2"
      opacity="0.25"
      fill="none"
      strokeDasharray="4 3"
    />
    <path
      d="M 86 120 Q 96 145 102 170"
      stroke={primary}
      strokeWidth="2"
      opacity="0.25"
      fill="none"
      strokeDasharray="4 3"
    />
  </svg>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const UncleSam: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Rolling energy
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Only appear during high energy
  if (energy < 0.2) return null;

  const cycleIndex = Math.floor(frame / APPEAR_CYCLE);
  const cycleFrame = frame % APPEAR_CYCLE;

  // Only render during appear portion
  if (cycleFrame >= APPEAR_DURATION) return null;

  const progress = cycleFrame / APPEAR_DURATION;

  // Deterministic palette selection
  const rng = seeded(cycleIndex * 67 + 1776);
  const palette = NEON_PALETTES[Math.floor(rng() * NEON_PALETTES.length)];

  // Zoom: 0.3 -> 1.2 -> 2.5 (three-phase zoom)
  const scale = interpolate(
    progress,
    [0, 0.4, 0.7, 1],
    [0.3, 1.2, 1.2, 2.5],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    },
  );

  // Opacity: quick fade in, hold, then fade as it zooms past
  const fadeIn = interpolate(progress, [0, 0.15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.7, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.quad),
  });
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0.2, 0.35], [0.7, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Center position with slight drift
  const centerX = width * 0.5 + Math.sin(progress * Math.PI * 0.5) * width * 0.02;
  const centerY = height * 0.45;

  // Slight menacing tilt
  const tilt = interpolate(progress, [0, 0.3, 0.7, 1], [5, 0, 0, -3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow intensity increases with zoom
  const glowIntensity = interpolate(progress, [0, 0.5, 1], [10, 30, 50], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Color cycling on glow for psychedelic effect
  const hueShift = (frame * 2) % 360;
  const dynamicGlow = `hsl(${hueShift}, 100%, 60%)`;

  const charSize = 200;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: centerX,
          top: centerY,
          transform: `translate(-50%, -50%) scale(${scale}) rotate(${tilt}deg)`,
          opacity,
          filter: `drop-shadow(0 0 ${glowIntensity}px ${palette.primary}) drop-shadow(0 0 ${glowIntensity * 1.5}px ${dynamicGlow}) drop-shadow(0 0 ${glowIntensity * 2}px ${palette.accent})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <UncleSamSkeleton
          size={charSize}
          primary={palette.primary}
          accent={palette.accent}
          hatColor={palette.hat}
          starColor={palette.stars}
        />
      </div>
    </div>
  );
};
