import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, EASE, FONTS } from '../styles/themes';

interface TextOverlayProps {
  text: string;
  style: 'fact' | 'quote' | 'analysis' | 'transition';
  startFrame: number;
  durationInFrames: number;
  colorAccent?: string;
}

const ENTER = 15;
const EXIT = 15;

const FROSTED_PANEL: React.CSSProperties = {
  backgroundColor: 'rgba(10, 10, 10, 0.55)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  padding: '16px 24px',
  borderRadius: 8,
};

export const TextOverlay: React.FC<TextOverlayProps> = ({
  text,
  style,
  startFrame,
  durationInFrames,
  colorAccent = COLORS.accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  if (local < 0 || local > durationInFrames) return null;

  const holdEnd = durationInFrames - EXIT;
  const exitOpacity = interpolate(
    local,
    [holdEnd, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // ── FACT: Typewriter reveal with monospace accent + data-pulse glow ──
  if (style === 'fact') {
    const chars = text.split('');
    const charsPerFrame = chars.length / Math.max(1, Math.min(durationInFrames * 0.4, 45));
    const revealedCount = Math.min(chars.length, Math.floor(local * charsPerFrame));

    // Data-pulse glow on the accent bar
    const pulsePhase = Math.sin(local * 0.15) * 0.5 + 0.5;
    const glowSize = 4 + pulsePhase * 8;
    const barOpacity = interpolate(local, [0, 8], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

    // Cursor blink (visible while typing, fades after completion)
    const cursorVisible = revealedCount < chars.length
      ? Math.floor(local / 8) % 2 === 0
      : local - (chars.length / charsPerFrame) < 20 && Math.floor(local / 8) % 2 === 0;

    return (
      <div
        style={{
          position: 'absolute',
          left: 120,
          right: 120,
          bottom: 160,
          opacity: exitOpacity,
          color: COLORS.text,
          textShadow: '0 2px 12px rgba(0,0,0,0.8)',
        }}
      >
        <div
          style={{
            width: 60,
            height: 3,
            backgroundColor: colorAccent,
            marginBottom: 16,
            opacity: barOpacity,
            boxShadow: `0 0 ${glowSize}px ${colorAccent}`,
          }}
        />
        <div
          style={{
            ...FROSTED_PANEL,
            fontFamily: FONTS.mono,
            fontSize: 40,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            lineHeight: 1.4,
          }}
        >
          {chars.slice(0, revealedCount).join('')}
          {cursorVisible && (
            <span
              style={{
                display: 'inline-block',
                width: 3,
                height: '0.85em',
                backgroundColor: colorAccent,
                marginLeft: 2,
                verticalAlign: 'baseline',
                boxShadow: `0 0 6px ${colorAccent}`,
              }}
            />
          )}
        </div>
      </div>
    );
  }

  // ── QUOTE: Per-word spring animation with enhanced typography ──
  if (style === 'quote') {
    const words = text.split(/\s+/);
    const enterOpacity = interpolate(local, [0, 10], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

    // Subtle quote mark animation
    const quoteMarkProgress = spring({
      frame: local,
      fps,
      config: { damping: 15, mass: 0.8, stiffness: 80 },
    });

    return (
      <div
        style={{
          position: 'absolute',
          left: 200,
          right: 200,
          bottom: 160,
          textAlign: 'center',
          opacity: exitOpacity * enterOpacity,
          color: COLORS.text,
          textShadow: '0 2px 12px rgba(0,0,0,0.8)',
        }}
      >
        <div
          style={{
            ...FROSTED_PANEL,
            padding: '28px 36px',
            display: 'inline-block',
            fontFamily: FONTS.heading,
            fontSize: 46,
            fontStyle: 'italic',
            lineHeight: 1.5,
            borderLeft: `3px solid ${colorAccent}`,
          }}
        >
          <span
            style={{
              opacity: quoteMarkProgress,
              color: colorAccent,
              fontSize: 60,
              lineHeight: 0,
              verticalAlign: -8,
              marginRight: 4,
            }}
          >
            &ldquo;
          </span>
          {words.map((word, wi) => {
            const delay = wi * 3;
            const wordProgress = spring({
              frame: Math.max(0, local - delay),
              fps,
              config: { damping: 20, mass: 0.5, stiffness: 120 },
            });
            const wordSlide = (1 - wordProgress) * 15;
            return (
              <span
                key={wi}
                style={{
                  display: 'inline-block',
                  opacity: wordProgress,
                  transform: `translateY(${wordSlide}px)`,
                  marginRight: '0.3em',
                }}
              >
                {word}
              </span>
            );
          })}
          <span
            style={{
              opacity: quoteMarkProgress,
              color: colorAccent,
              fontSize: 60,
              lineHeight: 0,
              verticalAlign: -8,
              marginLeft: 2,
            }}
          >
            &rdquo;
          </span>
        </div>
      </div>
    );
  }

  // ── ANALYSIS: Slide from left with accent bar + staggered line reveal ──
  if (style === 'analysis') {
    const lines = text.split(/[.!?]+/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) {
      // Single line: slide from left with accent bar
      const slideX = interpolate(local, [0, ENTER], [-40, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(...EASE.out),
      });
      const enterOpacity = interpolate(local, [0, ENTER], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });

      return (
        <div
          style={{
            position: 'absolute',
            left: 120,
            right: 120,
            bottom: 160,
            opacity: exitOpacity * enterOpacity,
            transform: `translateX(${slideX}px)`,
            color: COLORS.text,
            textShadow: '0 2px 12px rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'stretch',
            gap: 0,
          }}
        >
          <div
            style={{
              width: 4,
              backgroundColor: colorAccent,
              borderRadius: 2,
              flexShrink: 0,
              boxShadow: `0 0 8px ${colorAccent}40`,
            }}
          />
          <div
            style={{
              ...FROSTED_PANEL,
              borderRadius: '0 8px 8px 0',
              fontFamily: FONTS.body,
              fontSize: 38,
              fontWeight: 400,
              lineHeight: 1.5,
            }}
          >
            {text}
          </div>
        </div>
      );
    }

    // Multi-line: stagger each sentence
    return (
      <div
        style={{
          position: 'absolute',
          left: 120,
          right: 120,
          bottom: 160,
          opacity: exitOpacity,
          color: COLORS.text,
          textShadow: '0 2px 12px rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
        }}
      >
        <div
          style={{
            width: 4,
            backgroundColor: colorAccent,
            borderRadius: 2,
            flexShrink: 0,
            boxShadow: `0 0 8px ${colorAccent}40`,
          }}
        />
        <div
          style={{
            ...FROSTED_PANEL,
            borderRadius: '0 8px 8px 0',
            fontFamily: FONTS.body,
            fontSize: 38,
            fontWeight: 400,
            lineHeight: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {lines.map((line, li) => {
            const lineDelay = li * 10;
            const lineSlide = interpolate(local - lineDelay, [0, ENTER], [-30, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(...EASE.out),
            });
            const lineOpacity = interpolate(local - lineDelay, [0, ENTER], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <span
                key={li}
                style={{
                  opacity: lineOpacity,
                  transform: `translateX(${lineSlide}px)`,
                  display: 'block',
                }}
              >
                {line.trim()}.
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  // ── TRANSITION: Scale up from center with blur-to-sharp resolve ──
  const scaleProgress = spring({
    frame: local,
    fps,
    config: { damping: 14, mass: 0.6, stiffness: 100 },
  });
  const scale = interpolate(scaleProgress, [0, 1], [0.7, 1]);
  const blurAmount = interpolate(scaleProgress, [0, 1], [12, 0]);
  const enterOpacity = interpolate(scaleProgress, [0, 1], [0, 1]);

  return (
    <div
      style={{
        position: 'absolute',
        left: 120,
        right: 120,
        top: '50%',
        transform: `translateY(-50%) scale(${scale})`,
        textAlign: 'center',
        opacity: exitOpacity * enterOpacity,
        filter: `blur(${blurAmount}px)`,
        color: COLORS.text,
        textShadow: `0 2px 12px rgba(0,0,0,0.8), 0 0 40px ${colorAccent}20`,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.heading,
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: 6,
          textTransform: 'uppercase',
        }}
      >
        {text}
      </div>
    </div>
  );
};
