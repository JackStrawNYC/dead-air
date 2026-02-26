import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { sampleEnergy, normalizeEnergy } from '../utils/energy';

interface ChromaticAberrationProps {
  energyData: number[];
  /** Energy threshold to start aberration (default: 0.6) */
  threshold?: number;
  /** Maximum pixel offset at peak energy (default: 4) */
  maxOffset?: number;
}

/**
 * Chromatic Aberration — energy-reactive RGB channel split.
 *
 * At low energy: invisible.
 * Above threshold: RGB channels separate with increasing offset.
 * At peaks: dramatic color fringing creates psychedelic concert feel.
 *
 * Uses SVG feOffset + feColorMatrix to split channels without
 * duplicating the entire frame — lightweight overlay approach.
 */
export const ChromaticAberration: React.FC<ChromaticAberrationProps> = ({
  energyData,
  threshold = 0.6,
  maxOffset = 4,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { min, range } = normalizeEnergy(energyData);

  const rawEnergy = sampleEnergy(energyData, frame, durationInFrames);
  const normalized = (rawEnergy - min) / range;

  if (normalized < threshold) return null;

  // Scale offset based on how far above threshold
  const intensity = (normalized - threshold) / (1 - threshold);
  const offset = intensity * maxOffset;

  // Slight oscillation for organic feel
  const wobble = Math.sin(frame * 0.7) * 0.3;
  const redX = offset + wobble;
  const blueX = -(offset + wobble);
  const redY = wobble * 0.5;
  const blueY = -wobble * 0.5;

  const filterId = `chroma-aberration-${frame % 1000}`;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen' }}>
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0, opacity: intensity * 0.25 }}
      >
        <defs>
          <filter id={filterId}>
            {/* Red channel offset */}
            <feOffset dx={redX} dy={redY} in="SourceGraphic" result="redShift" />
            <feColorMatrix
              type="matrix"
              in="redShift"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0"
              result="red"
            />
            {/* Blue channel offset */}
            <feOffset dx={blueX} dy={blueY} in="SourceGraphic" result="blueShift" />
            <feColorMatrix
              type="matrix"
              in="blueShift"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 0.5 0"
              result="blue"
            />
            {/* Composite */}
            <feBlend mode="screen" in="red" in2="blue" />
          </filter>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="transparent"
          filter={`url(#${filterId})`}
        />
      </svg>
      {/* CSS-based edge color fringing (simpler, works on composition) */}
      <AbsoluteFill
        style={{
          boxShadow: `inset ${offset}px 0 ${offset * 2}px rgba(255, 0, 0, ${intensity * 0.08}), inset ${blueX}px 0 ${offset * 2}px rgba(0, 100, 255, ${intensity * 0.08})`,
        }}
      />
    </AbsoluteFill>
  );
};
