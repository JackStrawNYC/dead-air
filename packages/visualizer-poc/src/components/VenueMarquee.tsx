/**
 * VenueMarquee — Period-style venue sign overlay.
 * Vintage-styled text: venue name + subtitle from ShowContext.
 * Neon-sign aesthetic: glowing text with outer bloom. Positioned top-center.
 * Very low opacity (5-10%), appearing intermittently via 15% duty cycle
 * (~4.5 seconds visible every 30 seconds). Text glow pulses gently with beat.
 * Warm amber/red neon color.
 * Layer 7, any energy.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

// Duty cycle: 15% visible. ~4.5s on, ~25.5s off (30s total cycle = 900 frames)
const CYCLE_FRAMES = 900;
const ON_FRAMES = 135; // ~4.5 seconds at 30fps
const FADE_FRAMES = 30; // 1 second fade in/out
const STAGGER_START = 150; // 5 seconds initial delay

interface Props {
  frames: EnhancedFrameData[];
}

export const VenueMarquee: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Duty cycle: 15% on-time
  const delayedFrame = frame - STAGGER_START;
  if (delayedFrame < 0) return null;

  const cycleFrame = delayedFrame % CYCLE_FRAMES;
  if (cycleFrame >= ON_FRAMES) return null;

  // Fade in/out within the visible window
  const fadeIn = interpolate(cycleFrame, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(cycleFrame, [ON_FRAMES - FADE_FRAMES, ON_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const windowFade = Math.min(fadeIn, fadeOut);

  // Base opacity: very low (5-10%)
  const baseOpacity = 0.07;
  const masterOpacity = baseOpacity * masterFade * windowFade;

  if (masterOpacity < 0.005) return null;

  // Beat detection for glow pulse
  let framesSinceBeat = 999;
  for (let i = idx; i >= Math.max(0, idx - 15); i--) {
    if (frames[i].beat) {
      framesSinceBeat = idx - i;
      break;
    }
  }
  const beatPulse = framesSinceBeat < 12 ? 1.0 + 0.4 * Math.exp(-framesSinceBeat * 0.25) : 1.0;

  // Neon flicker: subtle variation for realism
  const rng = seeded((ctx?.showSeed ?? 19770508) + 777);
  const flickerSeed = rng();
  // Deterministic micro-dropout: use sine hash instead of Math.random()
  const dropoutHash = Math.sin(frame * 0.73 + flickerSeed * 137) * 43758.5453;
  const dropoutVal = dropoutHash - Math.floor(dropoutHash); // 0-1 deterministic pseudo-random
  const neonFlicker =
    0.85 +
    Math.sin(frame * 0.13 + flickerSeed * 100) * 0.08 +
    Math.sin(frame * 0.31 + flickerSeed * 50) * 0.05 +
    (dropoutVal < 0.02 ? -0.15 : 0); // rare micro-dropout

  // Venue text from context
  const venueName = (ctx?.venueShort ?? "Concert").toUpperCase();
  const subtitle = ctx?.venueLocation ?? "";

  // Neon colors: warm amber/red
  const neonColor = `hsla(15, 90%, 55%, 1)`;
  const glowColor = `hsla(15, 100%, 50%, 0.6)`;
  const outerGlowColor = `hsla(10, 80%, 45%, 0.3)`;

  const glowIntensity = beatPulse * neonFlicker;
  const textX = width / 2;
  const textY = height * 0.08;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity: masterOpacity, mixBlendMode: "screen" }}
      >
        <defs>
          <filter id="venue-neon-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={4 * glowIntensity} result="blur1" />
            <feGaussianBlur in="SourceGraphic" stdDeviation={8 * glowIntensity} result="blur2" />
            <feGaussianBlur in="SourceGraphic" stdDeviation={16 * glowIntensity} result="blur3" />
            <feMerge>
              <feMergeNode in="blur3" />
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer bloom layer */}
        <text
          x={textX}
          y={textY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="'Georgia', 'Times New Roman', serif"
          fontSize={36}
          fontWeight="bold"
          letterSpacing={6}
          fill={outerGlowColor}
          style={{ filter: `blur(${12 * glowIntensity}px)` }}
        >
          {venueName.toUpperCase()}
        </text>

        {/* Mid glow layer */}
        <text
          x={textX}
          y={textY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="'Georgia', 'Times New Roman', serif"
          fontSize={36}
          fontWeight="bold"
          letterSpacing={6}
          fill={glowColor}
          style={{ filter: `blur(${5 * glowIntensity}px)` }}
        >
          {venueName.toUpperCase()}
        </text>

        {/* Core neon text */}
        <text
          x={textX}
          y={textY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="'Georgia', 'Times New Roman', serif"
          fontSize={36}
          fontWeight="bold"
          letterSpacing={6}
          fill={neonColor}
          opacity={neonFlicker}
          filter="url(#venue-neon-glow)"
        >
          {venueName.toUpperCase()}
        </text>

        {/* Subtitle: softer, smaller */}
        <text
          x={textX}
          y={textY + 36}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="'Georgia', 'Times New Roman', serif"
          fontSize={16}
          fontStyle="italic"
          letterSpacing={3}
          fill={`hsla(20, 80%, 60%, ${0.7 * neonFlicker})`}
          style={{ filter: `blur(${2 * glowIntensity}px)` }}
        >
          {subtitle}
        </text>

        {/* Decorative line under subtitle */}
        <line
          x1={textX - 100}
          y1={textY + 54}
          x2={textX + 100}
          y2={textY + 54}
          stroke={`hsla(15, 90%, 50%, ${0.3 * neonFlicker})`}
          strokeWidth={1}
          style={{ filter: `blur(${1.5 * glowIntensity}px)` }}
        />
      </svg>
    </div>
  );
};
