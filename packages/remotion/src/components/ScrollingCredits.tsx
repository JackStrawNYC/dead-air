import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../styles/themes';
import { CINEMA_FONTS } from '../styles/fonts';

interface CreditSection {
  heading: string;
  names: string[];
}

interface ScrollingCreditsProps {
  /** Credit sections to display */
  sections?: CreditSection[];
  /** Show title at the top of the scroll */
  showTitle?: string;
  /** Accent color for section headings */
  accentColor?: string;
}

const DEFAULT_SECTIONS: CreditSection[] = [
  {
    heading: 'Created By',
    names: ['Dead Air Documentary Engine'],
  },
  {
    heading: 'Narration',
    names: ['AI Voice Performance'],
  },
  {
    heading: 'Research & Archives',
    names: [
      'Internet Archive',
      'Grateful Dead Archive',
      'David Lemieux Collection',
      'UCSC Dead Collection',
    ],
  },
  {
    heading: 'Audio Analysis',
    names: ['Librosa Audio Intelligence'],
  },
  {
    heading: 'Visual Design',
    names: ['Remotion Engine', 'Replicate AI'],
  },
  {
    heading: 'Music',
    names: ['Grateful Dead', 'Ice Nine Publishing'],
  },
  {
    heading: 'Special Thanks',
    names: [
      'The Deadhead Community',
      'Archive.org Tapers',
      'The Betty Boards',
    ],
  },
];

/**
 * Scrolling Credits — HBO-style rolling credits.
 *
 * Features:
 * - Smooth upward scroll over entire duration
 * - Section headings in accent color with display serif
 * - Names in clean serif with generous spacing
 * - Top/bottom gradient masks for elegant fade
 * - Subtle vignette backdrop
 */
export const ScrollingCredits: React.FC<ScrollingCreditsProps> = ({
  sections = DEFAULT_SECTIONS,
  showTitle,
  accentColor = COLORS.accent,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Total content height estimate: each section = heading + names
  const lineHeight = 44;
  const sectionGap = 80;
  const headerHeight = 60;
  const totalLines = sections.reduce((sum, s) => sum + s.names.length, 0);
  const totalContentHeight =
    (showTitle ? 200 : 0) +
    sections.length * (headerHeight + sectionGap) +
    totalLines * lineHeight +
    400; // bottom padding

  // Scroll from bottom of screen to top
  const scrollRange = totalContentHeight + 1080;
  const scrollY = interpolate(
    frame,
    [0, durationInFrames],
    [1080, -totalContentHeight],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Fade in/out
  const opacity = interpolate(
    frame,
    [0, 30, durationInFrames - 30, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        overflow: 'hidden',
        opacity,
      }}
    >
      {/* Subtle radial vignette */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 50%, rgba(20,20,20,0) 0%, ${COLORS.bg} 100%)`,
        }}
      />

      {/* Scrolling content */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          transform: `translateY(${scrollY}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 100,
        }}
      >
        {/* Show title */}
        {showTitle && (
          <div style={{ marginBottom: 80, textAlign: 'center' }}>
            <div
              style={{
                fontFamily: CINEMA_FONTS.display,
                fontSize: 20,
                fontWeight: 400,
                letterSpacing: 6,
                textTransform: 'uppercase',
                color: COLORS.textMuted,
                marginBottom: 16,
              }}
            >
              A Dead Air Production
            </div>
            <div
              style={{
                fontFamily: CINEMA_FONTS.display,
                fontSize: 48,
                fontWeight: 700,
                color: COLORS.text,
                letterSpacing: 2,
              }}
            >
              {showTitle}
            </div>
            <div
              style={{
                width: 120,
                height: 2,
                backgroundColor: accentColor,
                margin: '24px auto 0',
              }}
            />
          </div>
        )}

        {/* Credit sections */}
        {sections.map((section, si) => (
          <div
            key={si}
            style={{
              textAlign: 'center',
              marginBottom: sectionGap,
            }}
          >
            {/* Section heading */}
            <div
              style={{
                fontFamily: CINEMA_FONTS.sans,
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: 5,
                textTransform: 'uppercase',
                color: accentColor,
                marginBottom: 20,
              }}
            >
              {section.heading}
            </div>
            {/* Names */}
            {section.names.map((name, ni) => (
              <div
                key={ni}
                style={{
                  fontFamily: CINEMA_FONTS.serif,
                  fontSize: 28,
                  fontWeight: 400,
                  color: COLORS.text,
                  lineHeight: `${lineHeight}px`,
                  letterSpacing: 1,
                }}
              >
                {name}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Top gradient mask */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 200,
          background: `linear-gradient(to bottom, ${COLORS.bg} 0%, transparent 100%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Bottom gradient mask */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 200,
          background: `linear-gradient(to top, ${COLORS.bg} 0%, transparent 100%)`,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
