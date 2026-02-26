import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { sampleEnergy, normalizeEnergy } from '../utils/energy';

interface ParticleBurstProps {
  energyData: number[];
  /** Mood palette colors for particles */
  colorPalette?: string[];
  /** Energy threshold to emit particles (default: 0.75) */
  threshold?: number;
  /** Maximum particle count at peak energy (default: 24) */
  maxParticles?: number;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  angle: number;
  color: string;
  opacity: number;
  age: number; // 0-1 lifecycle
}

/**
 * Deterministic seeded random for consistent renders.
 */
function seeded(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Particle Burst — mood-colored particles emitted on energy peaks.
 *
 * When energy exceeds threshold, particles spray from center/edges:
 * - Particle count scales with energy intensity
 * - Colors drawn from mood palette
 * - Additive blend mode for sparkle/glow effect
 * - Particles drift outward with gravity + fade
 *
 * All positions are deterministic (seeded) for consistent Lambda renders.
 */
export const ParticleBurst: React.FC<ParticleBurstProps> = ({
  energyData,
  colorPalette = ['#d4a853', '#ffffff', '#ff6ec7'],
  threshold = 0.75,
  maxParticles = 24,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { min, range } = normalizeEnergy(energyData);

  const rawEnergy = sampleEnergy(energyData, frame, durationInFrames);
  const normalized = (rawEnergy - min) / range;

  if (normalized < threshold) return null;

  const intensity = (normalized - threshold) / (1 - threshold);
  const particleCount = Math.ceil(intensity * maxParticles);

  // Generate particles deterministically
  const particles: Particle[] = [];
  for (let i = 0; i < particleCount; i++) {
    const seed = frame * 100 + i;
    const angle = seeded(seed) * Math.PI * 2;
    const speed = 2 + seeded(seed + 1) * 4;
    const size = 2 + seeded(seed + 2) * 4;
    const colorIdx = Math.floor(seeded(seed + 3) * colorPalette.length);

    // Particle lifecycle: born at current frame, drift outward
    // Since we render per-frame, compute position based on seeded origin
    const age = seeded(seed + 4); // Stagger ages for variety
    const distance = speed * (1 + age * 3); // Distance from center
    const x = 50 + Math.cos(angle) * distance * 3; // percentage
    const y = 50 + Math.sin(angle) * distance * 2 + age * 2; // slight gravity

    // Fade based on distance
    const fadeOut = Math.max(0, 1 - age * 0.8);

    particles.push({
      x,
      y,
      size: size * (1 + intensity * 0.5),
      speed,
      angle,
      color: colorPalette[colorIdx] ?? '#d4a853',
      opacity: fadeOut * intensity * 0.7,
      age,
    });
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            backgroundColor: p.color,
            opacity: p.opacity,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            mixBlendMode: 'screen',
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
      {/* Central glow at high intensity */}
      {intensity > 0.5 && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 200 + intensity * 200,
            height: 200 + intensity * 200,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${colorPalette[0] ?? '#d4a853'}22 0%, transparent 70%)`,
            transform: 'translate(-50%, -50%)',
            mixBlendMode: 'screen',
          }}
        />
      )}
    </AbsoluteFill>
  );
};
