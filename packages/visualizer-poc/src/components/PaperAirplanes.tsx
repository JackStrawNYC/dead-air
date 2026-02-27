/**
 * PaperAirplanes — 5-7 paper airplanes gliding in formation across screen.
 * Each plane is a simple triangular dart shape. Planes dip and rise slightly
 * in gentle sine waves. White paper with blue ink doodle lines. Formation
 * loosens/tightens with energy. Lead plane is slightly larger.
 * Cycle: 45s, 14s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useShowContext } from "../data/ShowContext";

const CYCLE = 1350;    // 45 seconds at 30fps
const DURATION = 420;  // 14 seconds
const NUM_PLANES = 6;

interface PlaneData {
  offsetX: number;    // offset from formation center
  offsetY: number;    // offset from formation center
  size: number;       // 30-55, lead plane largest
  bobFreq: number;    // sine wave frequency
  bobPhase: number;   // phase offset
  bobAmp: number;     // amplitude of dip/rise
  rollFreq: number;   // slight roll oscillation
  rollPhase: number;
  isLead: boolean;
}

function generatePlanes(seed: number): PlaneData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_PLANES }, (_, i) => {
    const isLead = i === 0;
    // V-formation offsets: lead at front, others fan out behind
    const row = isLead ? 0 : Math.ceil(i / 2);
    const side = isLead ? 0 : (i % 2 === 1 ? -1 : 1);
    return {
      offsetX: side * row * 80 + (rng() - 0.5) * 15,
      offsetY: row * 60 + (rng() - 0.5) * 10,
      size: isLead ? 55 : 32 + rng() * 15,
      bobFreq: 0.025 + rng() * 0.02,
      bobPhase: rng() * Math.PI * 2,
      bobAmp: 15 + rng() * 20,
      rollFreq: 0.015 + rng() * 0.01,
      rollPhase: rng() * Math.PI * 2,
      isLead,
    };
  });
}

/** Single paper airplane SVG */
const Airplane: React.FC<{ size: number; roll: number }> = ({ size, roll }) => {
  const s = size;
  return (
    <svg width={s * 2.2} height={s * 1.2} viewBox="-5 -15 55 30" fill="none">
      {/* Main body triangle */}
      <polygon
        points="50,0 0,-10 5,0"
        fill="#FAFAFA"
        stroke="#DDD"
        strokeWidth={0.5}
      />
      <polygon
        points="50,0 0,10 5,0"
        fill="#F0F0F0"
        stroke="#DDD"
        strokeWidth={0.5}
      />
      {/* Wing fold line */}
      <line x1="5" y1="0" x2="50" y2="0" stroke="#CCC" strokeWidth={0.6} />
      {/* Blue doodle lines on wings */}
      <line x1="10" y1={-3 * Math.cos(roll * 0.5)} x2="30" y2={-5 * Math.cos(roll * 0.5)} stroke="#4A90D9" strokeWidth={0.4} opacity={0.5} strokeDasharray="3 2" />
      <line x1="10" y1={3 * Math.cos(roll * 0.5)} x2="30" y2={5 * Math.cos(roll * 0.5)} stroke="#4A90D9" strokeWidth={0.4} opacity={0.5} strokeDasharray="3 2" />
      {/* Nose accent */}
      <circle cx="48" cy="0" r="0.8" fill="#4A90D9" opacity={0.4} />
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const PaperAirplanes: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const planes = React.useMemo(() => generatePlanes(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.8;

  // Formation center moves across screen
  const centerX = interpolate(progress, [0, 1], [-120, width + 120], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const centerY = height * 0.4;

  // Formation spread loosens with energy
  const spreadFactor = 0.6 + energy * 1.2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {planes.map((plane, i) => {
        const bob = Math.sin(frame * plane.bobFreq + plane.bobPhase) * plane.bobAmp;
        const roll = Math.sin(frame * plane.rollFreq + plane.rollPhase) * 12;

        const px = centerX + plane.offsetX * spreadFactor;
        const py = centerY + plane.offsetY * spreadFactor + bob;

        // Slight pitch following bob direction
        const pitch = Math.cos(frame * plane.bobFreq + plane.bobPhase) * 5;

        const glow = plane.isLead
          ? "drop-shadow(0 0 6px rgba(255,255,255,0.4)) drop-shadow(0 0 15px rgba(74,144,217,0.2))"
          : "drop-shadow(0 0 4px rgba(255,255,255,0.25))";

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px - plane.size,
              top: py - plane.size * 0.3,
              transform: `rotate(${pitch}deg) perspective(200px) rotateX(${roll * 0.3}deg)`,
              opacity: opacity * (plane.isLead ? 1 : 0.85),
              filter: glow,
              willChange: "transform, opacity",
            }}
          >
            <Airplane size={plane.size} roll={roll} />
          </div>
        );
      })}
    </div>
  );
};
