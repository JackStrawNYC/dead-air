/**
 * GarciaQuotes — Jerry Garcia quotes typed out letter by letter.
 * Warm serif italic on transparent background — precious, not persistent.
 * Once per song, only during quiet passages. Energy-gated.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { BAND_CONFIG } from "../data/band-config";
import { useAudioSnapshot } from "./parametric/audio-helpers";

// Quotes from band config — portable across artists
const QUOTES = BAND_CONFIG.quotes.map((q) => q.text);

const INITIAL_DELAY = 2400; // 80s — deep enough to feel earned
const CYCLE = 999999;       // once per song
const DURATION = 360;       // 12 seconds — shorter is more precious
const CHARS_PER_FRAME = 0.5; // ~15 chars/sec

interface Props {
  frames: EnhancedFrameData[];
}

export const GarciaQuotes: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const snap = useAudioSnapshot(frames);
  const { energy, spaceScore, chromaHue } = snap;

  // Energy gate: quotes only during quiet/spacey passages
  // Use spaceScore when available for more accurate quiet detection
  const isQuiet = (spaceScore ?? 0) > 0.4 || energy < 0.15;
  if (!isQuiet) return null;

  const delayedFrame = frame - INITIAL_DELAY;
  if (delayedFrame < 0) return null;

  const cycleIndex = Math.floor(delayedFrame / CYCLE);
  const cycleFrame = delayedFrame % CYCLE;

  if (cycleFrame >= DURATION) return null;

  const rng = seeded(cycleIndex * 41 + 19420801);
  const quoteIdx = Math.floor(rng() * QUOTES.length);
  const quote = QUOTES[quoteIdx];

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const fadeOpacity = Math.min(fadeIn, fadeOut);

  // Typewriter: reveal characters one at a time
  const charsRevealed = Math.floor(cycleFrame * CHARS_PER_FRAME);
  const visibleText = quote.slice(0, Math.min(charsRevealed, quote.length));

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          bottom: "12%",
          left: "50%",
          transform: "translateX(-50%)",
          maxWidth: "75%",
          opacity: fadeOpacity,
        }}
      >
        <div
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 18,
            fontStyle: "italic",
            color: "rgba(255, 245, 225, 0.75)",
            textShadow: `0 0 20px hsla(${chromaHue}, 40%, 60%, 0.15)`,
            lineHeight: 1.6,
            letterSpacing: 0.3,
          }}
        >
          {visibleText}
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 11,
            fontStyle: "italic",
            color: "rgba(255, 245, 225, 0.45)",
            letterSpacing: 2,
          }}
        >
          — {BAND_CONFIG.musicians[0]?.toUpperCase() ?? "UNKNOWN"}
        </div>
      </div>
    </div>
  );
};
