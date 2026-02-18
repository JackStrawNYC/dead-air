import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

export type GradeMood = 'warm' | 'cold' | 'neutral';

interface DynamicGradeProps {
  /** Starting mood for the scene */
  startMood: GradeMood;
  /** Ending mood — grade shifts toward this over the scene duration */
  endMood: GradeMood;
  /** Frame within the scene where the shift begins (default: 40% through) */
  shiftStartFraction?: number;
  /** Intensity 0-1 (default: 0.6) */
  intensity?: number;
  children: React.ReactNode;
}

// Grade parameters for each mood
const MOOD_GRADES: Record<GradeMood, {
  brightness: number;
  contrast: number;
  saturate: number;
  tealR: number; tealG: number; tealB: number; tealA: number;
  warmR: number; warmG: number; warmB: number; warmA: number;
}> = {
  warm: {
    brightness: 0.96, contrast: 1.08, saturate: 0.85,
    tealR: 10, tealG: 20, tealB: 15, tealA: 0.03,
    warmR: 201, warmG: 168, warmB: 76, warmA: 0.06,
  },
  cold: {
    brightness: 0.90, contrast: 1.14, saturate: 0.60,
    tealR: 10, tealG: 30, tealB: 35, tealA: 0.12,
    warmR: 100, warmG: 120, warmB: 160, warmA: 0.04,
  },
  neutral: {
    brightness: 0.94, contrast: 1.10, saturate: 0.75,
    tealR: 10, tealG: 25, tealB: 25, tealA: 0.06,
    warmR: 180, warmG: 160, warmB: 120, warmA: 0.03,
  },
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Intra-scene dynamic color grading.
 *
 * Smoothly shifts between two mood grades within a single scene.
 * The shift is subliminal — felt more than seen.
 */
export const DynamicGrade: React.FC<DynamicGradeProps> = ({
  startMood,
  endMood,
  shiftStartFraction = 0.4,
  intensity = 0.6,
  children,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // No shift needed if same mood
  if (startMood === endMood) {
    const g = MOOD_GRADES[startMood];
    return (
      <AbsoluteFill>
        <AbsoluteFill
          style={{
            filter: `brightness(${g.brightness}) contrast(${g.contrast}) saturate(${g.saturate})`,
          }}
        >
          {children}
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(${g.tealR},${g.tealG},${g.tealB},${g.tealA * intensity})`,
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
          }}
        />
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(${g.warmR},${g.warmG},${g.warmB},${g.warmA * intensity})`,
            mixBlendMode: 'screen',
            pointerEvents: 'none',
          }}
        />
      </AbsoluteFill>
    );
  }

  const shiftStart = Math.floor(durationInFrames * shiftStartFraction);
  const shiftEnd = durationInFrames;

  // Smoothstep interpolation for the shift
  const rawT = interpolate(frame, [shiftStart, shiftEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const t = rawT * rawT * (3 - 2 * rawT); // smoothstep

  const a = MOOD_GRADES[startMood];
  const b = MOOD_GRADES[endMood];

  const brightness = lerp(a.brightness, b.brightness, t);
  const contrast = lerp(a.contrast, b.contrast, t);
  const saturate = lerp(a.saturate, b.saturate, t);
  const tealA = lerp(a.tealA, b.tealA, t) * intensity;
  const warmA = lerp(a.warmA, b.warmA, t) * intensity;
  const tealR = lerp(a.tealR, b.tealR, t);
  const tealG = lerp(a.tealG, b.tealG, t);
  const tealB = lerp(a.tealB, b.tealB, t);
  const warmR = lerp(a.warmR, b.warmR, t);
  const warmG = lerp(a.warmG, b.warmG, t);
  const warmB = lerp(a.warmB, b.warmB, t);

  return (
    <AbsoluteFill>
      {/* Base filter */}
      <AbsoluteFill
        style={{
          filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})`,
        }}
      >
        {children}
      </AbsoluteFill>

      {/* Teal shadow overlay */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(${Math.round(tealR)},${Math.round(tealG)},${Math.round(tealB)},${tealA})`,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
        }}
      />

      {/* Warm/cool highlight overlay */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(${Math.round(warmR)},${Math.round(warmG)},${Math.round(warmB)},${warmA})`,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
