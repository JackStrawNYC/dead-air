import React from 'react';
import { AbsoluteFill } from 'remotion';

/**
 * Film stock preset definitions.
 *
 * Each preset defines:
 * - colorMatrix: 5x4 SVG feColorMatrix values (row-major)
 *   Controls per-channel color mixing + offset
 * - overlay: optional tint overlay color + opacity
 * - contrast/brightness/saturate: CSS filter adjustments
 *
 * These emulate the color science of specific film stocks and
 * grading styles used in broadcast documentaries.
 */

export type FilmStock =
  | 'kodachrome'     // Warm, saturated, lifted blacks (vintage concert look)
  | 'ektachrome'     // Cool blue cast, high contrast (archival feel)
  | 'bleach_bypass'  // Desaturated, silver-toned, crushed blacks (gritty)
  | 'teal_orange'    // Cinematic complementary grade (modern default)
  | 'tobacco'        // Deep amber warmth (nostalgic, intimate)
  | 'noir_silver'    // Near-monochrome with slight warm tint
  | 'faded_polaroid' // Heavy black lift, desaturated pastels
  | 'cross_process'  // Shifted hues, cyan shadows, yellow highlights
  | 'none';          // Passthrough

interface FilmStockPreset {
  /** SVG feColorMatrix values (20 numbers: 4 rows x 5 cols) */
  colorMatrix: string;
  /** CSS filter chain */
  filter: string;
  /** Optional color overlay */
  overlayColor?: string;
  overlayOpacity?: number;
  overlayBlendMode?: string;
}

const PRESETS: Record<Exclude<FilmStock, 'none'>, FilmStockPreset> = {
  kodachrome: {
    // Warm reds boosted, greens pushed golden, blues muted, black lift
    colorMatrix: `
      1.15  0.05 -0.05  0  0.02
     -0.05  1.08  0.05  0  0.01
     -0.08 -0.03  0.90  0  0.03
      0     0     0     1  0
    `,
    filter: 'contrast(1.08) saturate(1.15) brightness(1.02)',
    overlayColor: 'rgba(180, 120, 40, 0.04)',
    overlayOpacity: 1,
    overlayBlendMode: 'multiply',
  },
  ektachrome: {
    // Cool shadows, slightly boosted blues, reduced reds in shadows
    colorMatrix: `
      0.95  0.0   0.05  0  0.0
      0.0   1.02  0.05  0  0.0
      0.05  0.08  1.10  0  0.02
      0     0     0     1  0
    `,
    filter: 'contrast(1.12) saturate(1.05) brightness(0.98)',
    overlayColor: 'rgba(40, 60, 120, 0.03)',
    overlayOpacity: 1,
    overlayBlendMode: 'multiply',
  },
  bleach_bypass: {
    // Desaturated, high contrast, silver metallic tones
    colorMatrix: `
      0.85  0.15  0.10  0  0.0
      0.10  0.80  0.15  0  0.0
      0.08  0.12  0.82  0  0.0
      0     0     0     1  0
    `,
    filter: 'contrast(1.25) saturate(0.55) brightness(1.0)',
    overlayColor: 'rgba(200, 200, 210, 0.04)',
    overlayOpacity: 1,
    overlayBlendMode: 'screen',
  },
  teal_orange: {
    // Orange highlights + teal shadows (Hollywood standard)
    colorMatrix: `
      1.12  0.08 -0.05  0  0.02
     -0.02  1.05  0.02  0  0.0
     -0.10 -0.02  1.15  0  0.03
      0     0     0     1  0
    `,
    filter: 'contrast(1.06) saturate(1.10) brightness(1.0)',
    overlayColor: 'rgba(0, 80, 100, 0.02)',
    overlayOpacity: 1,
    overlayBlendMode: 'multiply',
  },
  tobacco: {
    // Deep amber warmth — intimate, nostalgic
    colorMatrix: `
      1.20  0.10  0.0   0  0.03
      0.05  1.05  0.0   0  0.02
     -0.05 -0.05  0.80  0  0.01
      0     0     0     1  0
    `,
    filter: 'contrast(1.04) saturate(0.90) brightness(1.01)',
    overlayColor: 'rgba(140, 90, 30, 0.06)',
    overlayOpacity: 1,
    overlayBlendMode: 'multiply',
  },
  noir_silver: {
    // Near-monochrome with slight warm tint in highlights
    colorMatrix: `
      0.50  0.40  0.15  0  0.01
      0.35  0.55  0.15  0  0.0
      0.30  0.35  0.40  0  0.0
      0     0     0     1  0
    `,
    filter: 'contrast(1.15) saturate(0.25) brightness(1.02)',
  },
  faded_polaroid: {
    // Heavy black lift, desaturated pastels, dreamy
    colorMatrix: `
      1.0   0.05  0.02  0  0.08
      0.02  0.95  0.05  0  0.06
      0.05  0.02  0.88  0  0.10
      0     0     0     1  0
    `,
    filter: 'contrast(0.88) saturate(0.70) brightness(1.06)',
    overlayColor: 'rgba(255, 240, 220, 0.04)',
    overlayOpacity: 1,
    overlayBlendMode: 'screen',
  },
  cross_process: {
    // Shifted hues — cyan shadows, yellow highlights, high saturation
    colorMatrix: `
      1.05  0.15 -0.10  0  0.0
     -0.10  1.15  0.05  0  0.02
      0.10 -0.05  1.20  0  0.03
      0     0     0     1  0
    `,
    filter: 'contrast(1.10) saturate(1.25) brightness(1.0)',
    overlayColor: 'rgba(180, 255, 200, 0.03)',
    overlayOpacity: 1,
    overlayBlendMode: 'screen',
  },
};

/** Map moods to film stock presets */
export const MOOD_FILM_STOCK: Record<string, FilmStock> = {
  warm: 'kodachrome',
  earthy: 'tobacco',
  cosmic: 'ektachrome',
  psychedelic: 'cross_process',
  electric: 'teal_orange',
  dark: 'bleach_bypass',
};

interface FilmStockGradeProps {
  /** Film stock preset to apply */
  stock: FilmStock;
  /** Intensity 0-1 (default: 1.0). Blends between original and graded. */
  intensity?: number;
  children: React.ReactNode;
}

/**
 * Film Stock Grade — broadcast-quality color grading via SVG color matrices.
 *
 * Wraps children in an SVG filter that applies:
 * 1. feColorMatrix for per-channel color science (the core of the look)
 * 2. CSS filters for contrast/saturation/brightness
 * 3. Optional color overlay tint (multiply or screen blend)
 *
 * Each preset emulates a real film stock or professional grading style.
 * Mood-aware: use MOOD_FILM_STOCK mapping for automatic selection.
 */
export const FilmStockGrade: React.FC<FilmStockGradeProps> = ({
  stock,
  intensity = 1.0,
  children,
}) => {
  if (stock === 'none' || intensity < 0.01) {
    return <>{children}</>;
  }

  const preset = PRESETS[stock];
  const filterId = `film-stock-${stock}`;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* SVG filter definition */}
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values={preset.colorMatrix}
            />
          </filter>
        </defs>
      </svg>

      {/* Graded layer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          filter: `url(#${filterId}) ${preset.filter}`,
          opacity: intensity,
        }}
      >
        {children}
      </div>

      {/* Ungraded layer (for blend when intensity < 1) */}
      {intensity < 1 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 1 - intensity,
          }}
        >
          {children}
        </div>
      )}

      {/* Color overlay tint */}
      {preset.overlayColor && (
        <AbsoluteFill
          style={{
            backgroundColor: preset.overlayColor,
            opacity: (preset.overlayOpacity ?? 0.05) * intensity,
            mixBlendMode: (preset.overlayBlendMode ?? 'multiply') as React.CSSProperties['mixBlendMode'],
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
};
