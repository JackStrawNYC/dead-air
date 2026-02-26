import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, EASE, FONTS } from '../styles/themes';

export interface ListenForProps {
  text: string;
  startFrame: number;
  durationInFrames: number;
  colorAccent?: string;
}

const FADE_IN = 20;
const FADE_OUT = 20;

/** Pulsing headphone icon with animated sound waves */
const HeadphoneIcon: React.FC<{ color: string; size: number; pulse: number }> = ({ color, size, pulse }) => {
  // Pulse scales between 0.9 and 1.1
  const scale = 0.95 + pulse * 0.1;
  const waveOpacity = 0.2 + pulse * 0.4;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0, transform: `scale(${scale})` }}
    >
      {/* Outer glow ring */}
      <circle
        cx="12"
        cy="12"
        r={9 + pulse * 2}
        stroke={color}
        strokeWidth="0.8"
        fill="none"
        opacity={waveOpacity * 0.3}
      />
      {/* Base ring */}
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" fill="none" opacity={0.5} />
      {/* Headphone arc */}
      <path
        d="M8 16 C8 13 9 10 12 10 C15 10 16 13 16 16"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Center dot */}
      <circle cx="12" cy="12" r="2" fill={color} opacity={0.5 + pulse * 0.3} />
      {/* Sound wave arcs */}
      <path
        d="M18 9 C19.5 11 19.5 13 18 15"
        stroke={color}
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
        opacity={waveOpacity}
      />
      <path
        d="M6 9 C4.5 11 4.5 13 6 15"
        stroke={color}
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
        opacity={waveOpacity}
      />
    </svg>
  );
};

/** Mini waveform visualization */
const WaveformViz: React.FC<{ color: string; frame: number; barCount?: number }> = ({
  color,
  frame,
  barCount = 5,
}) => {
  const bars = Array.from({ length: barCount }, (_, i) => {
    const phase = (frame * 0.12) + i * 1.3;
    const height = 6 + Math.sin(phase) * 5 + Math.sin(phase * 1.7) * 3;
    return Math.max(3, height);
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 8, opacity: 0.5 }}>
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 2,
            height: h,
            backgroundColor: color,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
};

export const ListenFor: React.FC<ListenForProps> = ({
  text,
  startFrame,
  durationInFrames,
  colorAccent = COLORS.accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  if (local < 0 || local > durationInFrames) return null;

  const holdEnd = durationInFrames - FADE_OUT;
  const opacity = interpolate(
    local,
    [0, FADE_IN, holdEnd, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(...EASE.smooth) },
  );

  const slideY = interpolate(local, [0, FADE_IN], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(...EASE.out),
  });

  // Pulsing animation for icon (continuous sine wave)
  const pulse = Math.sin(local * 0.12) * 0.5 + 0.5;

  // Per-word reveal with spring animation
  const words = text.split(/\s+/);

  return (
    <div
      style={{
        position: 'absolute',
        top: 120,
        left: '15%',
        right: '15%',
        opacity,
        transform: `translateY(${slideY}px)`,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <div
        style={{
          background: 'rgba(10, 10, 10, 0.35)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderRadius: 8,
          padding: '14px 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          borderLeft: `2px solid ${colorAccent}40`,
        }}
      >
        <HeadphoneIcon color={colorAccent} size={26} pulse={pulse} />
        <div
          style={{
            fontFamily: FONTS.heading,
            fontSize: 32,
            fontStyle: 'italic',
            fontWeight: 400,
            color: COLORS.textMuted,
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
            lineHeight: 1.3,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0 0.3em',
          }}
        >
          {words.map((word, wi) => {
            const delay = wi * 3;
            const wordProgress = spring({
              frame: Math.max(0, local - delay),
              fps,
              config: { damping: 22, mass: 0.4, stiffness: 140 },
            });
            return (
              <span
                key={wi}
                style={{
                  opacity: wordProgress,
                  transform: `translateY(${(1 - wordProgress) * 8}px)`,
                  display: 'inline-block',
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
        <WaveformViz color={colorAccent} frame={local} />
      </div>
    </div>
  );
};
