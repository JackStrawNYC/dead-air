/**
 * SetBreakCard — Cinematic interstitial between sets.
 * Elegant text on black with venue context. Feels like a chapter break
 * in a documentary, not just dead air.
 *
 * Duration: 10 seconds (300 frames at 30fps)
 *   - 60 frames fade in (2s)
 *   - 180 frames hold (6s)
 *   - 60 frames fade out (2s)
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { loadFont, loadMonoFont as loadMono } from "../utils/font-shim";

const { fontFamily: cormorant } = loadFont("normal", {
  weights: ["300", "400", "600"],
  subsets: ["latin"],
});

const { fontFamily: mono } = loadMono("normal", {
  weights: ["300"],
  subsets: ["latin"],
});

const FADE_IN = 60;    // 2s
const HOLD = 180;      // 6s
const FADE_OUT = 60;   // 2s

export interface SetBreakCardProps {
  /** Venue name */
  venue?: string;
  /** Show date string */
  date?: string;
  /** Set number just completed */
  setNumber?: number;
  /** Narrative bridging text (from show-context.json chapters) */
  narrative?: string;
  /** Anticipation text for the next set */
  nextSetNarrative?: string;
}

export const SetBreakCard: React.FC<SetBreakCardProps> = ({
  venue,
  date,
  setNumber = 1,
  narrative,
  nextSetNarrative,
}) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();

  const total = FADE_IN + HOLD + FADE_OUT;

  // Main opacity envelope
  const opacity = interpolate(
    frame,
    [0, FADE_IN, FADE_IN + HOLD, total],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    },
  );

  // "SET BREAK" text fades in first
  const titleOpacity = interpolate(
    frame,
    [0, FADE_IN * 0.6],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Venue/date text fades in slightly after
  const detailOpacity = interpolate(
    frame,
    [FADE_IN * 0.4, FADE_IN * 1.2],
    [0, 0.7],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Narrative text fades in after the title settles
  const narrativeOpacity = interpolate(
    frame,
    [FADE_IN * 1.0, FADE_IN * 1.8],
    [0, 0.85],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Next set anticipation text fades in late
  const nextSetOpacity = interpolate(
    frame,
    [FADE_IN + HOLD * 0.4, FADE_IN + HOLD * 0.7],
    [0, 0.7],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Decorative rule width animates
  const ruleWidth = interpolate(
    frame,
    [FADE_IN * 0.5, FADE_IN + 30],
    [0, 80],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  // Subtle vertical drift
  const translateY = interpolate(
    frame,
    [0, total],
    [8, -8],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Ambient cosmic backdrop: slow-drifting gradient + star particles
  const gradientX = interpolate(frame, [0, total], [40, 60], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const gradientY = interpolate(frame, [0, total], [45, 55], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const gradientOpacity = interpolate(
    frame, [0, FADE_IN * 0.8, FADE_IN + HOLD * 0.5, total - FADE_OUT * 0.5, total], [0, 0.35, 0.45, 0.35, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Deterministic star positions (seeded by setNumber for variety)
  const starCount = 24;
  const starSeed = (setNumber ?? 1) * 7919;
  const stars = Array.from({ length: starCount }, (_, i) => {
    const hash = ((starSeed + i * 31337) * 2654435761) >>> 0;
    const x = (hash % 1000) / 10;
    const y = ((hash >> 10) % 1000) / 10;
    const size = 1 + (hash % 3);
    const phase = (hash % 628) / 100; // 0-6.28 for twinkle offset
    const starAlpha = interpolate(
      frame, [0, total], [0, Math.PI * 2],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const twinkle = 0.15 + 0.25 * Math.sin(starAlpha * 1.5 + phase);
    return { x, y, size, alpha: twinkle * opacity };
  });

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Cosmic ambient gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at ${gradientX}% ${gradientY}%, rgba(40, 20, 80, ${gradientOpacity}) 0%, rgba(15, 8, 40, ${gradientOpacity * 0.6}) 40%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      {/* Second gradient layer for depth */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at ${100 - gradientX}% ${100 - gradientY}%, rgba(20, 40, 80, ${gradientOpacity * 0.5}) 0%, transparent 50%)`,
          pointerEvents: "none",
        }}
      />
      {/* Star particles */}
      {stars.map((star, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            borderRadius: "50%",
            backgroundColor: `rgba(200, 190, 255, ${star.alpha})`,
            pointerEvents: "none",
          }}
        />
      ))}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          opacity,
          transform: `translateY(${translateY}px)`,
        }}
      >
        {/* SET BREAK header */}
        <div
          style={{
            fontFamily: `${mono}, monospace`,
            fontSize: 14,
            fontWeight: 300,
            color: "rgba(255, 200, 140, 0.5)",
            letterSpacing: 8,
            textTransform: "uppercase",
            opacity: titleOpacity,
          }}
        >
          Set {setNumber} Complete
        </div>

        {/* Decorative rule */}
        <div
          style={{
            width: ruleWidth,
            height: 1,
            backgroundColor: "rgba(255, 200, 140, 0.3)",
          }}
        />

        {/* INTERMISSION */}
        <div
          style={{
            fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
            fontSize: 42,
            fontWeight: 300,
            color: "rgba(255, 248, 240, 0.85)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            opacity: titleOpacity,
          }}
        >
          Intermission
        </div>

        {/* Decorative rule */}
        <div
          style={{
            width: ruleWidth,
            height: 1,
            backgroundColor: "rgba(255, 200, 140, 0.3)",
          }}
        />

        {/* Venue + date */}
        {(venue || date) && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              marginTop: 8,
              opacity: detailOpacity,
            }}
          >
            {venue && (
              <div
                style={{
                  fontFamily: `${cormorant}, Georgia, serif`,
                  fontSize: 20,
                  fontWeight: 400,
                  color: "rgba(255, 248, 240, 0.6)",
                  letterSpacing: 3,
                  textAlign: "center",
                }}
              >
                {venue}
              </div>
            )}
            {date && (
              <div
                style={{
                  fontFamily: `${mono}, monospace`,
                  fontSize: 13,
                  fontWeight: 300,
                  color: "rgba(255, 248, 240, 0.4)",
                  letterSpacing: 4,
                  textAlign: "center",
                }}
              >
                {date}
              </div>
            )}
          </div>
        )}

        {/* Narrative bridging text — documentary chapter feel */}
        {narrative && (
          <div
            style={{
              maxWidth: 800,
              marginTop: 32,
              opacity: narrativeOpacity,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
                fontSize: 26,
                fontWeight: 300,
                fontStyle: "italic",
                color: "rgba(255, 248, 240, 0.75)",
                lineHeight: 1.7,
                letterSpacing: "0.02em",
              }}
            >
              {narrative}
            </div>
          </div>
        )}

        {/* Next set anticipation — builds tension */}
        {nextSetNarrative && (
          <div
            style={{
              maxWidth: 700,
              marginTop: 24,
              opacity: nextSetOpacity,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
                fontSize: 20,
                fontWeight: 300,
                color: "rgba(255, 200, 140, 0.55)",
                lineHeight: 1.6,
                letterSpacing: "0.03em",
              }}
            >
              {nextSetNarrative}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
