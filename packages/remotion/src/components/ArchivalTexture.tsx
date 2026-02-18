import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

type Era = 'colonial' | 'victorian' | 'early_modern' | 'modern' | 'none';

interface ArchivalTextureProps {
  /** Historical era determines the visual treatment */
  era?: Era;
  /** Intensity 0-1 (default: 0.5) */
  intensity?: number;
}

/**
 * Era-specific archival texture overlay.
 *
 * - colonial (1600-1800): Heavy sepia wash, paper grain, ink bleed edges
 * - victorian (1800-1920): Amber tint, film scratches, heavy vignette
 * - early_modern (1920-1980): Film grain flicker, scan lines, warm desaturation
 * - modern (1980+): Subtle chromatic aberration, cool tint, clean digital
 */
export const ArchivalTexture: React.FC<ArchivalTextureProps> = ({
  era = 'early_modern',
  intensity = 0.5,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  if (era === 'none' || intensity <= 0) return null;

  // Fade in/out to avoid harsh appearance
  const fade = interpolate(frame, [0, 15, durationInFrames - 15, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const op = fade * intensity;

  if (era === 'colonial') {
    const flickerSeed = Math.floor(frame / 3);
    const flickerOp = 0.03 + Math.sin(flickerSeed * 1.7) * 0.01;

    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(139, 109, 56, ${0.08 * op})`,
            mixBlendMode: 'color',
          }}
        />
        <AbsoluteFill
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' seed='${flickerSeed}' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E")`,
            backgroundSize: '256px 256px',
            opacity: flickerOp * op * 8,
            mixBlendMode: 'overlay',
          }}
        />
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, transparent 30%, rgba(80,50,20,${0.25 * op}) 90%, rgba(40,20,5,${0.4 * op}) 100%)`,
          }}
        />
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(201, 168, 76, ${0.03 * op})`,
            mixBlendMode: 'screen',
          }}
        />
      </AbsoluteFill>
    );
  }

  if (era === 'victorian') {
    const scratchPhase = frame * 0.7;
    const scratch1 = Math.sin(scratchPhase) * 0.5 + 0.5;
    const scratch2 = Math.cos(scratchPhase * 1.3 + 2) * 0.5 + 0.5;

    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(160, 120, 60, ${0.06 * op})`,
            mixBlendMode: 'color',
          }}
        />
        <AbsoluteFill
          style={{
            background: `
              linear-gradient(to right, transparent ${scratch1 * 70}%, rgba(255,255,255,${0.04 * op}) ${scratch1 * 70 + 0.1}%, transparent ${scratch1 * 70 + 0.3}%),
              linear-gradient(to right, transparent ${scratch2 * 85}%, rgba(255,255,255,${0.03 * op}) ${scratch2 * 85 + 0.1}%, transparent ${scratch2 * 85 + 0.2}%)
            `,
            mixBlendMode: 'screen',
          }}
        />
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, transparent 25%, rgba(20,10,0,${0.35 * op}) 100%)`,
          }}
        />
      </AbsoluteFill>
    );
  }

  if (era === 'early_modern') {
    const grainSeed = Math.floor(frame / 2);

    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(180, 160, 140, ${0.04 * op})`,
            mixBlendMode: 'color',
          }}
        />
        <AbsoluteFill
          style={{
            backgroundImage: `repeating-linear-gradient(
              to bottom,
              transparent,
              transparent 2px,
              rgba(0,0,0,${0.03 * op}) 2px,
              rgba(0,0,0,${0.03 * op}) 4px
            )`,
            backgroundSize: '100% 4px',
          }}
        />
        <AbsoluteFill
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='3' seed='${grainSeed}' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")`,
            backgroundSize: '200px 200px',
            opacity: 0.3 * op,
            mixBlendMode: 'overlay',
          }}
        />
      </AbsoluteFill>
    );
  }

  if (era === 'modern') {
    const aberrationPx = 0.8 * op;

    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(100, 130, 180, ${0.03 * op})`,
            mixBlendMode: 'color',
          }}
        />
        <AbsoluteFill
          style={{
            boxShadow: `inset ${aberrationPx}px 0 ${aberrationPx * 2}px rgba(255,0,0,${0.02 * op}), inset -${aberrationPx}px 0 ${aberrationPx * 2}px rgba(0,255,255,${0.02 * op})`,
          }}
        />
      </AbsoluteFill>
    );
  }

  return null;
};
