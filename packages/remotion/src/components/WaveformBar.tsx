import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { sampleEnergy } from '../utils/energy';
import { COLORS } from '../styles/themes';

interface WaveformBarProps {
  energyData: number[];
  colorAccent?: string;
  secondaryColor?: string;
  height?: number;
  /** Spectral centroid data for frequency-aware coloring */
  spectralCentroid?: number[];
}

const BAR_COUNT = 64;
const FADE_FRAMES = 30;

function lerpColor(a: string, b: string, t: number): string {
  const parseHex = (hex: string) => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
}

/**
 * Map energy level to spectral color: cool blue → warm gold → hot white.
 */
function energyToColor(energy: number, accent: string, secondary: string | undefined): string {
  if (energy < 0.3) {
    // Cool: secondary or muted accent
    return secondary ?? lerpColor('#334455', accent, energy / 0.3);
  }
  if (energy < 0.7) {
    // Warm: accent color
    const t = (energy - 0.3) / 0.4;
    return secondary ? lerpColor(secondary, accent, t) : accent;
  }
  // Hot: accent → white
  const t = (energy - 0.7) / 0.3;
  return lerpColor(accent, '#ffffff', t * 0.6);
}

export const WaveformBar: React.FC<WaveformBarProps> = ({
  energyData,
  colorAccent = COLORS.accent,
  secondaryColor,
  height = 60,
  spectralCentroid,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeOpacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Precompute normalization once
  const minE = Math.min(...energyData);
  const maxE = Math.max(...energyData);
  const rangeE = maxE - minE || 1;

  // Current overall energy for glow effect
  const currentEnergy = sampleEnergy(energyData, frame, durationInFrames);
  const currentNorm = (currentEnergy - minE) / rangeE;

  // Spectral brightness (0-1) — higher = brighter/warmer color shift
  let spectralBrightness = 0.5;
  if (spectralCentroid && spectralCentroid.length > 0) {
    const t = Math.max(0, Math.min(1, frame / durationInFrames));
    const idx = Math.min(Math.floor(t * spectralCentroid.length), spectralCentroid.length - 1);
    spectralBrightness = spectralCentroid[idx];
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: height + 20,
        opacity: fadeOpacity,
        pointerEvents: 'none',
      }}
    >
      {/* Dark strip behind bars */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)',
        }}
      />
      {/* Glow effect at high energy */}
      {currentNorm > 0.7 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: '10%',
            right: '10%',
            height: height * 1.5,
            background: `radial-gradient(ellipse 100% 100% at 50% 100%, ${colorAccent}${Math.round((currentNorm - 0.7) * 60).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
            filter: 'blur(8px)',
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 0,
          right: 0,
          height,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-around',
          padding: '0 20px',
        }}
      >
        {Array.from({ length: BAR_COUNT }, (_, i) => {
          // Sample energy at a slightly offset frame for each bar to create wave effect
          const offset = (i / BAR_COUNT) * 3 - 1.5;
          const energy = sampleEnergy(energyData, frame + offset, durationInFrames);
          const normalized = (energy - minE) / rangeE;

          const barHeight = Math.max(2, normalized * height);

          // Spectral coloring: energy level determines warmth
          const barColor = energyToColor(
            normalized * (0.5 + spectralBrightness * 0.5),
            colorAccent,
            secondaryColor,
          );

          // Peak bars get glow
          const isHot = normalized > 0.85;

          return (
            <div
              key={i}
              style={{
                width: `${80 / BAR_COUNT}%`,
                height: barHeight,
                backgroundColor: barColor,
                opacity: 0.6 + normalized * 0.4,
                borderRadius: 1,
                boxShadow: isHot
                  ? `0 0 ${4 + normalized * 4}px ${barColor}`
                  : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
