import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { sampleEnergy } from '../utils/energy';
import { COLORS } from '../styles/themes';

interface WaveformBarProps {
  energyData: number[];
  colorAccent?: string;
  secondaryColor?: string;
  height?: number;
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

export const WaveformBar: React.FC<WaveformBarProps> = ({
  energyData,
  colorAccent = COLORS.accent,
  secondaryColor,
  height = 60,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeOpacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

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

          // Normalize to 0-1 range
          const minE = Math.min(...energyData);
          const maxE = Math.max(...energyData);
          const range = maxE - minE || 1;
          const normalized = (energy - minE) / range;

          const barHeight = Math.max(2, normalized * height);

          const barColor = secondaryColor
            ? lerpColor(secondaryColor, colorAccent, i / (BAR_COUNT - 1))
            : colorAccent;

          return (
            <div
              key={i}
              style={{
                width: `${80 / BAR_COUNT}%`,
                height: barHeight,
                backgroundColor: barColor,
                opacity: 0.6 + normalized * 0.4,
                borderRadius: 1,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
