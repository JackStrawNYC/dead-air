import React from 'react';
import {
  AbsoluteFill, Audio, interpolate, spring,
  staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { COLORS, FPS } from '../styles/themes';
import { CINEMA_FONTS } from '../styles/fonts';
import { FilmGrain } from '../components/FilmGrain';

interface BrandIntroProps {
  /** Optional ambient audio to bridge energy from cold open */
  ambientSrc?: string;
  /** Peak ambient volume (default: 0.15) */
  ambientVolume?: number;
}

/**
 * Brand Intro — cinematic title sequence.
 *
 * HBO-quality 5-second opening with:
 * 1. Dark background with animated radial light bloom
 * 2. Thin accent rules that spring outward
 * 3. Series badge ("A DOCUMENTARY SERIES")
 * 4. "DEAD AIR" in display serif with animated letter spacing
 * 5. Soft glow halo behind title
 * 6. Horizontal light rays radiating from center
 * 7. Film grain overlay
 * 8. Ambient audio bridge from cold open
 */
export const BrandIntro: React.FC<BrandIntroProps> = ({
  ambientSrc,
  ambientVolume = 0.15,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // === Animation phases ===

  // Light bloom: radial warmth grows from center
  const bloomProgress = interpolate(
    frame,
    [0, 60],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const bloomSize = 20 + bloomProgress * 30; // 20% → 50% radius

  // Rules spring outward
  const ruleProgress = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 18, mass: 0.6, stiffness: 100 },
  });

  // Series badge fade
  const badgeOpacity = interpolate(
    frame,
    [15, 40],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Title letter spacing animation (wide → settled)
  const titleProgress = spring({
    frame: Math.max(0, frame - 20),
    fps,
    config: { damping: 12, mass: 0.8, stiffness: 70 },
  });
  const letterSpacing = interpolate(titleProgress, [0, 1], [40, 14]);
  const titleOpacity = interpolate(titleProgress, [0, 0.3], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Glow halo behind title
  const glowIntensity = spring({
    frame: Math.max(0, frame - 40),
    fps,
    config: { damping: 8, mass: 1, stiffness: 50 },
  });

  // Light rays
  const rayOpacity = interpolate(
    frame,
    [30, 60, durationInFrames - 20, durationInFrames],
    [0, 0.12, 0.12, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Fade out
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 25, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Ambient audio envelope
  const ambientVol = ambientSrc
    ? interpolate(
        frame,
        [0, durationInFrames * 0.6, durationInFrames - 10, durationInFrames],
        [0.02, ambientVolume, ambientVolume, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        overflow: 'hidden',
        opacity: fadeOut,
      }}
    >
      {/* Radial light bloom */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(
            ellipse ${bloomSize}% ${bloomSize * 0.7}% at 50% 48%,
            rgba(80, 60, 30, ${bloomProgress * 0.25}) 0%,
            rgba(40, 30, 15, ${bloomProgress * 0.1}) 50%,
            transparent 100%
          )`,
        }}
      />

      {/* Horizontal light rays */}
      <AbsoluteFill
        style={{
          opacity: rayOpacity,
          background: `
            linear-gradient(
              90deg,
              transparent 0%,
              rgba(212, 168, 83, 0.03) 20%,
              rgba(212, 168, 83, 0.08) 45%,
              rgba(212, 168, 83, 0.12) 50%,
              rgba(212, 168, 83, 0.08) 55%,
              rgba(212, 168, 83, 0.03) 80%,
              transparent 100%
            )
          `,
          mixBlendMode: 'screen',
        }}
      />

      {/* Vertical light ray (subtle cross) */}
      <AbsoluteFill
        style={{
          opacity: rayOpacity * 0.5,
          background: `
            linear-gradient(
              0deg,
              transparent 0%,
              rgba(212, 168, 83, 0.02) 30%,
              rgba(212, 168, 83, 0.06) 48%,
              rgba(212, 168, 83, 0.06) 52%,
              rgba(212, 168, 83, 0.02) 70%,
              transparent 100%
            )
          `,
          mixBlendMode: 'screen',
        }}
      />

      {/* Content */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Top rule */}
        <div
          style={{
            width: ruleProgress * 160,
            height: 1,
            backgroundColor: COLORS.accent,
            opacity: ruleProgress * 0.5,
            marginBottom: 24,
          }}
        />

        {/* Series badge */}
        <div
          style={{
            fontFamily: CINEMA_FONTS.sans,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: COLORS.accent,
            opacity: badgeOpacity,
            marginBottom: 16,
          }}
        >
          A Documentary Series
        </div>

        {/* Title with glow */}
        <div style={{ position: 'relative' }}>
          {/* Glow halo */}
          <div
            style={{
              position: 'absolute',
              inset: -40,
              background: `radial-gradient(
                ellipse 60% 50% at 50% 50%,
                rgba(212, 168, 83, ${glowIntensity * 0.08}) 0%,
                transparent 70%
              )`,
              filter: 'blur(20px)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              fontFamily: CINEMA_FONTS.display,
              fontSize: 86,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing,
              color: COLORS.text,
              opacity: titleOpacity,
              position: 'relative',
            }}
          >
            Dead Air
          </div>
        </div>

        {/* Bottom rule */}
        <div
          style={{
            width: ruleProgress * 100,
            height: 1,
            backgroundColor: COLORS.accent,
            opacity: ruleProgress * 0.35,
            marginTop: 20,
          }}
        />
      </AbsoluteFill>

      {/* Ambient audio bridge */}
      {ambientSrc && ambientVol > 0 && (
        <Audio src={staticFile(ambientSrc)} volume={ambientVol} />
      )}

      <FilmGrain intensity={0.06} />
    </AbsoluteFill>
  );
};
