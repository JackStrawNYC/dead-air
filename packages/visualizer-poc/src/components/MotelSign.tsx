/**
 * MotelSign — Neon "VACANCY" motel sign.
 * Retro-style sign shape with arrow outline. Letters flicker independently
 * with neon buzz effect. "NO" occasionally flickers on before "VACANCY"
 * (alternating states). Hot pink/blue/green neon tubes.
 * Sign pole/frame structure. Energy drives flicker rate.
 * Cycle: 60s (1800 frames), 18s (540 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE_TOTAL = 1800; // 60s
const VISIBLE_DURATION = 540; // 18s

const VACANCY_LETTERS = ["V", "A", "C", "A", "N", "C", "Y"];

interface LetterFlickerData {
  flickerFreq: number;
  flickerPhase: number;
  flickerDepth: number; // how much it dims during flicker
}

function generateFlickerData(seed: number): LetterFlickerData[] {
  const rng = seeded(seed);
  return VACANCY_LETTERS.map(() => ({
    flickerFreq: 0.15 + rng() * 0.3,
    flickerPhase: rng() * Math.PI * 2,
    flickerDepth: 0.2 + rng() * 0.5,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const MotelSign: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const flickerData = React.useMemo(() => generateFlickerData(33445566), []);

  // Pre-compute "NO" on/off schedule using seeded PRNG
  const noSchedule = React.useMemo(() => {
    const rng = seeded(77665544);
    // Generate on/off periods for "NO" across many cycles
    return Array.from({ length: 500 }, () => ({
      onStart: rng() * 0.8, // when within visible duration "NO" turns on
      onDuration: 0.05 + rng() * 0.15, // how long it stays on
    }));
  }, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  const cycleIndex = Math.floor(frame / CYCLE_TOTAL);

  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.85;

  if (opacity < 0.01) return null;

  // Sign position: right side of screen
  const signCx = width * 0.72;
  const signCy = height * 0.35;
  const signW = 340;
  const signH = 120;

  // Flicker speed from energy
  const flickerMult = 1 + energy * 4;

  // "NO" visibility check
  const noData = noSchedule[cycleIndex % noSchedule.length];
  const noVisible =
    progress >= noData.onStart &&
    progress < noData.onStart + noData.onDuration;

  // Neon colors
  const pinkNeon = "#FF1493";
  const blueNeon = "#00BFFF";
  const greenNeon = "#39FF14";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          <filter id="neon-glow-pink">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feFlood floodColor={pinkNeon} floodOpacity="0.6" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="neon-glow-blue">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feFlood floodColor={blueNeon} floodOpacity="0.5" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="neon-glow-green">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feFlood floodColor={greenNeon} floodOpacity="0.5" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Sign pole */}
        <rect
          x={signCx + signW * 0.3}
          y={signCy + signH / 2}
          width={6}
          height={height - signCy - signH / 2 + 20}
          fill="#4A4A4A"
          opacity={0.6}
        />
        {/* Pole base */}
        <rect
          x={signCx + signW * 0.3 - 15}
          y={height - 25}
          width={36}
          height={8}
          rx={2}
          fill="#4A4A4A"
          opacity={0.5}
        />

        {/* Sign frame background */}
        <rect
          x={signCx - signW / 2}
          y={signCy - signH / 2}
          width={signW}
          height={signH}
          rx={6}
          fill="rgba(20,10,30,0.85)"
          stroke="#555"
          strokeWidth={2}
        />

        {/* Arrow outline on left side */}
        <polygon
          points={`${signCx - signW / 2 - 30},${signCy} ${signCx - signW / 2},${signCy - signH / 2 + 10} ${signCx - signW / 2},${signCy + signH / 2 - 10}`}
          fill="none"
          stroke={blueNeon}
          strokeWidth={2}
          filter="url(#neon-glow-blue)"
          opacity={0.5 + energy * 0.3}
        />

        {/* Border neon outline */}
        <rect
          x={signCx - signW / 2 + 6}
          y={signCy - signH / 2 + 6}
          width={signW - 12}
          height={signH - 12}
          rx={3}
          fill="none"
          stroke={blueNeon}
          strokeWidth={1.5}
          filter="url(#neon-glow-blue)"
          opacity={0.4}
        />

        {/* "MOTEL" text at top */}
        <text
          x={signCx}
          y={signCy - signH / 2 + 28}
          textAnchor="middle"
          fill={blueNeon}
          fontSize={18}
          fontFamily="sans-serif"
          fontWeight="bold"
          letterSpacing={8}
          filter="url(#neon-glow-blue)"
          opacity={0.7 + energy * 0.3}
        >
          MOTEL
        </text>

        {/* "NO" text — flickers on occasionally */}
        {noVisible && (
          <text
            x={signCx - signW / 2 + 45}
            y={signCy + 18}
            textAnchor="middle"
            fill={pinkNeon}
            fontSize={28}
            fontFamily="sans-serif"
            fontWeight="bold"
            filter="url(#neon-glow-pink)"
            opacity={0.6 + Math.sin(frame * 0.8) * 0.3}
          >
            NO
          </text>
        )}

        {/* "VACANCY" letters — each flickers independently */}
        {VACANCY_LETTERS.map((letter, li) => {
          const fd = flickerData[li];

          // Flicker: rapid sine with some noise feel
          const flickerWave = Math.sin(frame * fd.flickerFreq * flickerMult + fd.flickerPhase);
          const flickerWave2 = Math.sin(frame * fd.flickerFreq * flickerMult * 2.7 + fd.flickerPhase * 1.5);
          const combined = flickerWave * 0.6 + flickerWave2 * 0.4;

          // Letter is mostly on, occasionally dims
          const letterOpacity = combined < -0.5
            ? 1 - fd.flickerDepth  // flickering dim
            : 1;

          const letterX = signCx - 100 + li * 34;
          const letterY = signCy + 18;

          return (
            <text
              key={li}
              x={letterX}
              y={letterY}
              textAnchor="middle"
              fill={greenNeon}
              fontSize={36}
              fontFamily="sans-serif"
              fontWeight="bold"
              letterSpacing={2}
              filter="url(#neon-glow-green)"
              opacity={letterOpacity * (0.7 + energy * 0.3)}
            >
              {letter}
            </text>
          );
        })}

        {/* Ambient glow around the whole sign */}
        <rect
          x={signCx - signW / 2 - 10}
          y={signCy - signH / 2 - 10}
          width={signW + 20}
          height={signH + 20}
          rx={10}
          fill={`rgba(255,20,147,${0.03 + energy * 0.04})`}
        />
      </svg>
    </div>
  );
};
