import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

interface LightLeakProps {
  /** Intensity 0-1 (default: 0.3) */
  intensity?: number;
  /** Current normalized energy 0-1 for reactive leaks */
  currentEnergy?: number;
}

/**
 * Animated light leak overlay — warm amber drift across frame.
 * Simulates lens flare / light bleed from anamorphic lenses.
 *
 * Three layers:
 * 1. Primary warm leak (large, slow drift)
 * 2. Secondary cool leak (smaller, opposite drift)
 * 3. Anamorphic horizontal streak (thin, follows primary)
 *
 * Energy-reactive: leaks intensify during peaks.
 */
export const LightLeak: React.FC<LightLeakProps> = ({
  intensity = 0.3,
  currentEnergy = 0,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Slow drift across frame (~10s cycle)
  const drift = (frame % 300) / 300;
  const x = 20 + Math.sin(drift * Math.PI * 2) * 30;
  const y = 30 + Math.cos(drift * Math.PI * 2 * 0.7) * 20;

  // Breathing intensity
  const breathe = 0.7 + Math.sin(frame * 0.04) * 0.3;

  // Energy boost: leaks bloom during peaks
  const energyBoost = currentEnergy > 0.6 ? (currentEnergy - 0.6) * 2.5 : 0;
  const effectiveIntensity = intensity * breathe + energyBoost * 0.15;

  // Fade in/out
  const fade = interpolate(frame, [0, 30, durationInFrames - 30, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const alpha = effectiveIntensity * fade;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 85 }}>
      {/* Primary leak — warm horizontal bloom */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(
            ellipse 60% 30% at ${x}% ${y}%,
            rgba(212, 168, 83, ${alpha * 0.12}) 0%,
            rgba(212, 168, 83, ${alpha * 0.04}) 40%,
            transparent 80%
          )`,
          mixBlendMode: 'screen',
        }}
      />
      {/* Secondary leak — cooler, opposite drift */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(
            ellipse 40% 20% at ${100 - x}% ${60 - y * 0.3}%,
            rgba(180, 200, 255, ${alpha * 0.04}) 0%,
            transparent 70%
          )`,
          mixBlendMode: 'screen',
        }}
      />
      {/* Anamorphic horizontal streak */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(
            to right,
            transparent ${x - 10}%,
            rgba(255, 240, 200, ${alpha * 0.02}) ${x}%,
            rgba(255, 240, 200, ${alpha * 0.04}) ${x + 2}%,
            rgba(255, 240, 200, ${alpha * 0.02}) ${x + 4}%,
            transparent ${x + 14}%
          )`,
          mixBlendMode: 'screen',
        }}
      />
    </AbsoluteFill>
  );
};
