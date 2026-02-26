/**
 * Zeppelin -- A large airship/zeppelin floating slowly across upper screen.
 * Cigar-shaped body with gondola underneath. Body has panel lines.
 * Propellers spin (small circles at rear). Navigation lights blink.
 * Searchlight beam sweeps below. Metallic silver/gray with warm accent lights.
 * Energy drives drift speed. Cycle: 80s, 24s visible.
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

const VISIBLE_DURATION = 720; // 24s at 30fps
const CYCLE_GAP = 1680;       // 56s gap (80s total - 24s visible)
const CYCLE_TOTAL = VISIBLE_DURATION + CYCLE_GAP;
const ZEPPELIN_WIDTH = 400;
const ZEPPELIN_HEIGHT = 200;

interface Props {
  frames: EnhancedFrameData[];
}

export const Zeppelin: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Memo for searchlight sweep parameters
  const sweepParams = React.useMemo(() => {
    const rng = seeded(19370506);
    return {
      sweepFreq: 0.015 + rng() * 0.01,
      sweepPhase: rng() * Math.PI * 2,
      bobFreq: 0.008 + rng() * 0.005,
      bobPhase: rng() * Math.PI * 2,
    };
  }, []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleIndex = Math.floor(frame / CYCLE_TOTAL);
  const cycleFrame = frame % CYCLE_TOTAL;
  const goingRight = cycleIndex % 2 === 0;

  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.75;

  if (masterOpacity < 0.01) return null;

  // Horizontal drift
  const startX = goingRight ? -ZEPPELIN_WIDTH - 50 : width + 50;
  const endX = goingRight ? width + 50 : -ZEPPELIN_WIDTH - 50;
  const driftSpeed = 1 + energy * 0.5;
  const x = interpolate(progress * driftSpeed, [0, 1], [startX, endX], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Gentle vertical bob
  const bobAmp = 8 + energy * 6;
  const bob = Math.sin(frame * sweepParams.bobFreq + sweepParams.bobPhase) * bobAmp;
  const y = height * 0.12 + bob;

  // Slight pitch variation
  const pitch = Math.sin(frame * 0.012 + 1.7) * 1.5;

  // Propeller rotation
  const propRotation = frame * (8 + energy * 12);

  // Navigation lights blink
  const navBlink = Math.sin(frame * 0.15) > 0.3 ? 0.9 : 0.2;
  const navBlink2 = Math.sin(frame * 0.15 + Math.PI) > 0.3 ? 0.9 : 0.2;

  // Searchlight sweep angle
  const searchAngle = Math.sin(frame * sweepParams.sweepFreq + sweepParams.sweepPhase) * 25;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `scaleX(${goingRight ? 1 : -1}) rotate(${pitch}deg)`,
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 10px rgba(180, 190, 200, 0.3)) drop-shadow(0 0 30px rgba(180, 190, 200, 0.15))`,
          willChange: "transform, opacity",
        }}
      >
        <svg width={ZEPPELIN_WIDTH} height={ZEPPELIN_HEIGHT + 120} viewBox="0 0 400 320" fill="none">
          <defs>
            {/* Body gradient for metallic look */}
            <linearGradient id="zep-body-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#B0BEC5" />
              <stop offset="30%" stopColor="#CFD8DC" />
              <stop offset="60%" stopColor="#90A4AE" />
              <stop offset="100%" stopColor="#607D8B" />
            </linearGradient>
            {/* Searchlight cone */}
            <radialGradient id="zep-search-grad" cx="50%" cy="0%" r="100%">
              <stop offset="0%" stopColor="#FFD54F" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#FFD54F" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Main envelope (cigar shape) */}
          <ellipse cx="200" cy="75" rx="180" ry="55" fill="url(#zep-body-grad)" opacity="0.85" />

          {/* Panel lines (longitudinal) */}
          <ellipse cx="200" cy="75" rx="180" ry="55" stroke="#78909C" strokeWidth="0.8" fill="none" opacity="0.4" />
          <path d="M 20 75 Q 200 20, 380 75" stroke="#78909C" strokeWidth="0.6" fill="none" opacity="0.3" />
          <path d="M 20 75 Q 200 130, 380 75" stroke="#78909C" strokeWidth="0.6" fill="none" opacity="0.3" />

          {/* Transverse panel lines */}
          {[80, 140, 200, 260, 320].map((lx) => (
            <line key={lx} x1={lx} y1="22" x2={lx} y2="128" stroke="#78909C" strokeWidth="0.5" opacity="0.25" />
          ))}

          {/* Tail fins */}
          {/* Upper fin */}
          <path d="M 30 40 L 5 10 L 5 40 Z" fill="#90A4AE" opacity="0.7" />
          {/* Lower fin */}
          <path d="M 30 110 L 5 140 L 5 110 Z" fill="#90A4AE" opacity="0.7" />
          {/* Left fin */}
          <path d="M 25 75 L 0 55 L 0 95 Z" fill="#78909C" opacity="0.6" />

          {/* Gondola */}
          <rect x="155" y="135" width="90" height="22" rx="5" fill="#455A64" opacity="0.8" />
          <rect x="160" y="138" width="12" height="8" rx="1" fill="#FFD54F" opacity="0.35" />
          <rect x="178" y="138" width="12" height="8" rx="1" fill="#FFD54F" opacity="0.35" />
          <rect x="196" y="138" width="12" height="8" rx="1" fill="#FFD54F" opacity="0.35" />
          <rect x="214" y="138" width="12" height="8" rx="1" fill="#FFD54F" opacity="0.35" />

          {/* Gondola struts */}
          <line x1="170" y1="128" x2="165" y2="135" stroke="#546E7A" strokeWidth="1.5" opacity="0.6" />
          <line x1="230" y1="128" x2="235" y2="135" stroke="#546E7A" strokeWidth="1.5" opacity="0.6" />
          <line x1="200" y1="128" x2="200" y2="135" stroke="#546E7A" strokeWidth="1.5" opacity="0.6" />

          {/* Propellers at rear (2 small) */}
          <g transform={`rotate(${propRotation} 50 90)`}>
            <line x1="38" y1="90" x2="62" y2="90" stroke="#78909C" strokeWidth="2" opacity="0.6" />
            <line x1="50" y1="78" x2="50" y2="102" stroke="#78909C" strokeWidth="2" opacity="0.6" />
          </g>
          <circle cx="50" cy="90" r="2" fill="#546E7A" opacity="0.8" />

          {/* Navigation lights */}
          <circle cx="380" cy="75" r="3" fill="#EF5350" opacity={navBlink} />
          <circle cx="20" cy="75" r="3" fill="#4CAF50" opacity={navBlink2} />
          {/* Belly light */}
          <circle cx="200" cy="130" r="2" fill="#FFD54F" opacity={0.4 + Math.sin(frame * 0.1) * 0.2} />

          {/* Searchlight beam from gondola */}
          <g transform={`rotate(${searchAngle} 200 157)`}>
            <polygon
              points="192,157 160,320 240,320 208,157"
              fill="url(#zep-search-grad)"
              opacity={0.15 + energy * 0.15}
            />
          </g>
        </svg>
      </div>
    </div>
  );
};
