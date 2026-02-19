import React from 'react';
import { useCurrentFrame } from 'remotion';

export type PsychedelicVariant = 'liquid' | 'aurora' | 'fractal';

interface PsychedelicLoopProps {
  variant?: PsychedelicVariant;
  colorPalette?: string[];
  speed?: number;
  durationInFrames: number;
}

const DEFAULT_PALETTES: Record<PsychedelicVariant, string[]> = {
  liquid: ['#8B4513', '#D2691E', '#FFD700', '#1a0a00'],
  aurora: ['#2E1065', '#7C3AED', '#06B6D4', '#10B981'],
  fractal: ['#FF006E', '#8338EC', '#3A86FF', '#FB5607'],
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/**
 * Procedural psychedelic visuals — zero-cost gap filler using SVG filters.
 * Three variants: liquid (morphing gradients), aurora (drifting bands),
 * fractal (animated turbulence). All driven by useCurrentFrame().
 */
export const PsychedelicLoop: React.FC<PsychedelicLoopProps> = ({
  variant = 'liquid',
  colorPalette,
  speed = 1,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const palette = colorPalette?.length ? colorPalette : DEFAULT_PALETTES[variant];
  const t = (frame * speed) / 30; // time in seconds, speed-adjusted
  const filterId = `psychedelic-${variant}-${frame}`;

  if (variant === 'fractal') {
    return <FractalVariant t={t} palette={palette} filterId={filterId} />;
  }

  if (variant === 'aurora') {
    return <AuroraVariant t={t} palette={palette} />;
  }

  return <LiquidVariant t={t} palette={palette} filterId={filterId} />;
};

const LiquidVariant: React.FC<{ t: number; palette: string[]; filterId: string }> = ({
  t,
  palette,
  filterId,
}) => {
  const baseFreq = 0.005 + Math.sin(t * 0.3) * 0.003;
  const scale = 80 + Math.sin(t * 0.5) * 40;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="turbulence"
              baseFrequency={baseFreq}
              numOctaves={3}
              seed={Math.floor(t * 2) % 100}
              stitchTiles="stitch"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={scale}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <radialGradient id={`${filterId}-grad`} cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor={palette[0] ?? '#D2691E'} />
            <stop offset="40%" stopColor={palette[1] ?? '#8B4513'} />
            <stop offset="80%" stopColor={palette[2] ?? '#FFD700'} />
            <stop offset="100%" stopColor={palette[3] ?? '#1a0a00'} />
          </radialGradient>
        </defs>
        <rect
          width="140%"
          height="140%"
          x="-20%"
          y="-20%"
          fill={`url(#${filterId}-grad)`}
          filter={`url(#${filterId})`}
        />
      </svg>
    </div>
  );
};

const AuroraVariant: React.FC<{ t: number; palette: string[] }> = ({ t, palette }) => {
  const bands = palette.slice(0, 4);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {bands.map((color, i) => {
        const [r, g, b] = hexToRgb(color);
        const yOffset = Math.sin(t * 0.4 + i * 1.8) * 30;
        const xOffset = Math.cos(t * 0.3 + i * 2.1) * 15;
        const bandTop = 15 + i * 20 + yOffset;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${-10 + xOffset}%`,
              top: `${bandTop}%`,
              width: '120%',
              height: '30%',
              background: `radial-gradient(ellipse 120% 100% at 50% 50%, rgba(${r},${g},${b},0.6) 0%, rgba(${r},${g},${b},0.15) 50%, transparent 80%)`,
              filter: 'blur(30px)',
              mixBlendMode: 'screen',
            }}
          />
        );
      })}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#0a0a14',
          zIndex: -1,
        }}
      />
    </div>
  );
};

const FractalVariant: React.FC<{ t: number; palette: string[]; filterId: string }> = ({
  t,
  palette,
  filterId,
}) => {
  const baseFreq = 0.008 + Math.sin(t * 0.7) * 0.004;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id={filterId} x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={baseFreq}
              numOctaves={5}
              seed={Math.floor(t * 3) % 200}
              stitchTiles="stitch"
              result="noise"
            />
            <feColorMatrix
              type="matrix"
              values={`
                ${Math.sin(t * 0.5) * 0.5 + 0.5} 0 0 0 0
                0 ${Math.cos(t * 0.7) * 0.5 + 0.5} 0 0 0
                0 0 ${Math.sin(t * 0.3 + 1) * 0.5 + 0.5} 0 0
                0 0 0 1 0
              `}
            />
          </filter>
          <linearGradient id={`${filterId}-overlay`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={palette[0] ?? '#FF006E'} stopOpacity="0.3" />
            <stop offset="50%" stopColor={palette[1] ?? '#8338EC'} stopOpacity="0.2" />
            <stop offset="100%" stopColor={palette[2] ?? '#3A86FF'} stopOpacity="0.3" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" filter={`url(#${filterId})`} />
        <rect width="100%" height="100%" fill={`url(#${filterId}-overlay)`} style={{ mixBlendMode: 'overlay' }} />
      </svg>
    </div>
  );
};
