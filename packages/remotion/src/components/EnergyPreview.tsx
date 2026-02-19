import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../styles/themes';

export interface EnergyPreviewProps {
  energyData: number[];
  colorAccent?: string;
  secondaryColor?: string;
}

const WIDTH = 200;
const HEIGHT = 40;
const SAMPLE_POINTS = 50;
const FADE_DELAY = 60; // 2s at 30fps
const FADE_FRAMES = 30;

/**
 * Downsample energy data to a fixed number of points.
 */
function downsample(data: number[], targetPoints: number): number[] {
  if (data.length <= targetPoints) return data;
  const result: number[] = [];
  const step = data.length / targetPoints;
  for (let i = 0; i < targetPoints; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    const slice = data.slice(start, end);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    result.push(avg);
  }
  return result;
}

/**
 * Build an SVG path string for a filled energy curve.
 */
function buildPath(samples: number[], w: number, h: number): string {
  if (samples.length === 0) return '';

  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min || 1;

  const points = samples.map((val, i) => {
    const x = (i / (samples.length - 1)) * w;
    const normalized = (val - min) / range;
    const y = h - normalized * h * 0.9; // 90% of height
    return `${x},${y}`;
  });

  return `M0,${h} L${points.join(' L')} L${w},${h} Z`;
}

export const EnergyPreview: React.FC<EnergyPreviewProps> = ({
  energyData,
  colorAccent = COLORS.accent,
  secondaryColor,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  if (!energyData || energyData.length === 0) return null;

  // Fade in after 2s, fade out in last 2s
  const fadeIn = interpolate(
    frame,
    [FADE_DELAY, FADE_DELAY + FADE_FRAMES],
    [0, 0.4],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const fadeOut = interpolate(
    frame,
    [durationInFrames - FADE_DELAY - FADE_FRAMES, durationInFrames - FADE_DELAY],
    [0.4, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  if (opacity <= 0) return null;

  const samples = downsample(energyData, SAMPLE_POINTS);
  const path = buildPath(samples, WIDTH, HEIGHT);

  // Playhead position
  const progress = frame / durationInFrames;
  const playheadX = progress * WIDTH;

  const gradientId = 'energy-preview-grad';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 50,
        right: 40,
        width: WIDTH,
        height: HEIGHT,
        opacity,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={secondaryColor ?? colorAccent} stopOpacity={0.6} />
            <stop offset="100%" stopColor={colorAccent} stopOpacity={0.8} />
          </linearGradient>
        </defs>
        {/* Energy curve */}
        <path d={path} fill={`url(#${gradientId})`} />
        {/* Playhead */}
        <line
          x1={playheadX}
          y1={0}
          x2={playheadX}
          y2={HEIGHT}
          stroke={COLORS.text}
          strokeWidth={1.5}
          opacity={0.8}
        />
      </svg>
    </div>
  );
};
