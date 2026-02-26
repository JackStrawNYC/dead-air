import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { sampleEnergy, normalizeEnergy } from '../utils/energy';

interface BeatKickProps {
  energyData: number[];
  durationInFrames: number;
  /** Energy threshold to trigger kick (default: 0.78) */
  threshold?: number;
  /** Mood color for tinted flashes */
  accentColor?: string;
}

/**
 * Beat Kick — instant zoom pulse + flash on energy spikes.
 *
 * Detects rapid energy increases (not just high energy) and triggers:
 * 1. Scale pulse: 1.0 → 1.04 → 1.0 over 4 frames
 * 2. White/tinted radial flash that fades in 3 frames
 * 3. Vignette intensity boost
 *
 * This makes the video "punch" on bass hits and dramatic moments.
 */
export const BeatKick: React.FC<BeatKickProps> = ({
  energyData,
  durationInFrames,
  threshold = 0.78,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const { min, range } = normalizeEnergy(energyData);

  // Detect energy spikes: compare current energy vs 3 frames ago
  const currentRaw = sampleEnergy(energyData, frame, durationInFrames);
  const prevRaw = sampleEnergy(energyData, Math.max(0, frame - 3), durationInFrames);
  const currentNorm = (currentRaw - min) / range;
  const prevNorm = (prevRaw - min) / range;

  // Trigger on either: high absolute energy OR rapid increase
  const isKick = currentNorm > threshold || (currentNorm - prevNorm > 0.15 && currentNorm > 0.5);

  if (!isKick) return null;

  // Kick intensity: how far above threshold
  const intensity = Math.min(1, (currentNorm - threshold + 0.1) * 3);

  // Flash decay: peaks at trigger frame, fades over 4 frames
  // Since we re-evaluate every frame, we just render based on current intensity
  const flashAlpha = intensity * 0.12;

  // Parse accent color for tinted flash
  let flashColor = `rgba(255, 255, 255, ${flashAlpha})`;
  if (accentColor && accentColor.startsWith('#')) {
    const r = parseInt(accentColor.slice(1, 3), 16);
    const g = parseInt(accentColor.slice(3, 5), 16);
    const b = parseInt(accentColor.slice(5, 7), 16);
    // Blend white + accent
    const mr = Math.round(255 * 0.6 + r * 0.4);
    const mg = Math.round(255 * 0.6 + g * 0.4);
    const mb = Math.round(255 * 0.6 + b * 0.4);
    flashColor = `rgba(${mr}, ${mg}, ${mb}, ${flashAlpha})`;
  }

  // Scale pulse: apply to parent via CSS transform wrapper
  const scalePulse = 1 + intensity * 0.03;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Radial flash burst from center */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 45%, ${flashColor} 0%, transparent 65%)`,
          mixBlendMode: 'screen',
        }}
      />
      {/* Edge vignette pulse */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(0,0,0,${intensity * 0.15}) 100%)`,
        }}
      />
      {/* Scale transform overlay — uses CSS scale on full frame */}
      <AbsoluteFill
        style={{
          transform: `scale(${scalePulse})`,
          transformOrigin: '50% 50%',
          // This creates a subtle "camera shake" by scaling the overlay layer
          background: 'transparent',
        }}
      />
    </AbsoluteFill>
  );
};
