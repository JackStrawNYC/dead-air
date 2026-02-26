import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

interface HalationProps {
  /** Base intensity 0-1 (default: 0.06) */
  intensity?: number;
  /** Energy-reactive: current normalized energy 0-1 */
  currentEnergy?: number;
  /** Warm color tint for the bloom (default: warm amber) */
  tintColor?: string;
}

/**
 * Halation — film-like bloom around bright areas.
 *
 * Real film stocks (especially Kodak Vision3) exhibit halation:
 * light scatters through the film base and reflects off the
 * pressure plate, creating a warm glow around highlights.
 *
 * This is what gives HBO/Netflix concert footage that organic,
 * "shot on film" quality vs. the clinical look of digital.
 *
 * Implementation:
 * - Multiple radial gradients at different positions
 * - Slow drift simulating light movement
 * - Energy-reactive: more halation at intensity peaks
 * - Screen blend mode for natural light addition
 * - Warm amber tint (characteristic of film halation)
 */
export const Halation: React.FC<HalationProps> = ({
  intensity = 0.06,
  currentEnergy = 0,
  tintColor = 'rgba(220, 180, 100',
}) => {
  const frame = useCurrentFrame();

  // Energy boost: halation intensifies at peaks
  const energyBoost = currentEnergy > 0.6 ? (currentEnergy - 0.6) * 0.15 : 0;
  const totalIntensity = intensity + energyBoost;

  if (totalIntensity < 0.01) return null;

  // Slow drifting positions for organic movement
  const x1 = 50 + Math.sin(frame * 0.015) * 15;
  const y1 = 40 + Math.cos(frame * 0.012) * 10;
  const x2 = 35 + Math.sin(frame * 0.018 + 2) * 20;
  const y2 = 55 + Math.cos(frame * 0.014 + 1) * 12;
  const x3 = 65 + Math.sin(frame * 0.013 + 4) * 18;
  const y3 = 35 + Math.cos(frame * 0.016 + 3) * 10;

  // Breathing intensity variation
  const breathe = 0.85 + Math.sin(frame * 0.08) * 0.15;
  const alpha = totalIntensity * breathe;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Primary halation bloom — large, soft, centered */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(
            ellipse 45% 40% at ${x1}% ${y1}%,
            ${tintColor}, ${alpha * 0.8}) 0%,
            ${tintColor}, ${alpha * 0.3}) 40%,
            transparent 70%
          )`,
          mixBlendMode: 'screen',
          filter: 'blur(30px)',
        }}
      />

      {/* Secondary bloom — offset, smaller */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(
            ellipse 30% 25% at ${x2}% ${y2}%,
            ${tintColor}, ${alpha * 0.5}) 0%,
            transparent 60%
          )`,
          mixBlendMode: 'screen',
          filter: 'blur(25px)',
        }}
      />

      {/* Tertiary bloom — highlight catch */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(
            ellipse 25% 20% at ${x3}% ${y3}%,
            ${tintColor}, ${alpha * 0.4}) 0%,
            transparent 55%
          )`,
          mixBlendMode: 'screen',
          filter: 'blur(20px)',
        }}
      />

      {/* Edge warmth — subtle halation at frame edges (film gate scatter) */}
      <AbsoluteFill
        style={{
          boxShadow: `inset 0 0 200px rgba(180, 140, 60, ${alpha * 0.3})`,
          mixBlendMode: 'screen',
        }}
      />
    </AbsoluteFill>
  );
};
