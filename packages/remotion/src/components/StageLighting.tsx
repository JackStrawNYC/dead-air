import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { MOOD_PALETTES } from '../styles/themes';

interface StageLightingProps {
  mood: string;
  /** Normalized energy 0-1 */
  currentEnergy?: number;
  /** Intensity 0-1 (default: 0.4) */
  intensity?: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

/**
 * Concert stage lighting simulation — color wash overlays that pulse
 * with energy data, simulating stage lighting rigs.
 *
 * Features:
 * - Two sweeping color pools (primary + secondary from mood palette)
 * - Slow drift simulating moving stage lights
 * - Energy-reactive pulse intensity
 * - Flash burst at energy peaks (>0.85)
 */
export const StageLighting: React.FC<StageLightingProps> = ({
  mood,
  currentEnergy = 0,
  intensity = 0.4,
}) => {
  const frame = useCurrentFrame();
  const palette = (MOOD_PALETTES as Record<string, { primary: string; secondary: string; glow: string }>)[mood];
  if (!palette) return null;

  const primary = hexToRgb(palette.primary);
  const secondary = hexToRgb(palette.secondary);

  // Pulsing wash — slow base rhythm + energy overlay
  const basePulse = 0.3 + Math.sin(frame * 0.05) * 0.2;
  const energyPulse = currentEnergy > 0.5 ? (currentEnergy - 0.5) * 2 : 0;
  const combinedPulse = Math.min(1, basePulse + energyPulse) * intensity;

  // Sweeping position (slow drift simulating rig movement)
  const sweepX = 50 + Math.sin(frame * 0.02) * 30;
  const sweepY = 20 + Math.sin(frame * 0.015) * 15;

  const primaryAlpha = combinedPulse * 0.08;
  const secondaryAlpha = combinedPulse * 0.05;

  // Energy flash at peaks
  const flashAlpha = currentEnergy > 0.85
    ? (currentEnergy - 0.85) * 0.4 * intensity
    : 0;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Primary wash — sweeping pool */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(
            ellipse 50% 70% at ${sweepX}% ${sweepY}%,
            rgba(${primary.r},${primary.g},${primary.b},${primaryAlpha}) 0%,
            transparent 70%
          )`,
          mixBlendMode: 'screen',
        }}
      />
      {/* Secondary wash — opposite sweep */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(
            ellipse 40% 60% at ${100 - sweepX}% ${80 - sweepY}%,
            rgba(${secondary.r},${secondary.g},${secondary.b},${secondaryAlpha}) 0%,
            transparent 60%
          )`,
          mixBlendMode: 'screen',
        }}
      />
      {/* Energy flash burst */}
      {flashAlpha > 0.001 && (
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(255, 255, 255, ${flashAlpha})`,
            mixBlendMode: 'overlay',
          }}
        />
      )}
    </AbsoluteFill>
  );
};
