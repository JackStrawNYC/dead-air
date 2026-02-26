/**
 * GarciaQuotes — Jerry Garcia quotes typed out letter by letter.
 * Typewriter effect, green-on-black terminal aesthetic.
 * One quote every 80s for 10s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const QUOTES = [
  "Somebody has to do something, and it's just incredibly pathetic that it has to be us.",
  "You do not merely want to be considered just the best of the best. You want to be considered the only ones who do what you do.",
  "What we do is as American as lynch mobs. America has always been a complex place.",
  "I read somewhere that 77 percent of all the mentally ill live in poverty. Actually, I'm more intrigued by the 23 percent who are apparently doing quite well for themselves.",
  "The feeling I get when I play music is something I can't get any other way.",
  "We're like licorice. Not everybody likes licorice, but the people who like licorice really like licorice.",
  "I'm not trying to be anything. I'm just trying to play music.",
  "Too much of a good thing is just about right.",
  "It's not enough to be the best at what you do. You have to be perceived as the only one who does what you do.",
  "I don't know why, the Grateful Dead is like bad beer or something. It's like an acquired taste.",
  "For me, the lame part of the sixties was the political part. The cool part was the spiritual part.",
  "The world is getting weirder every day. It's up to us to make it work.",
  "Music is the doorway that has led me to drawing, painting, and sculpting.",
  "I think it's too bad that everybody's decided to turn on drugs. I think drugs have been very useful to me.",
  "There is no shortcut to anywhere worth going.",
];

const CYCLE = 2400; // 80 seconds
const DURATION = 300; // 10 seconds
const CHARS_PER_FRAME = 0.35; // ~10.5 chars/sec

interface Props {
  frames: EnhancedFrameData[];
}

export const GarciaQuotes: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleIndex = Math.floor(frame / CYCLE);
  const cycleFrame = frame % CYCLE;

  if (cycleFrame >= DURATION) return null;

  const rng = seeded(cycleIndex * 41 + 19420801);
  const quoteIdx = Math.floor(rng() * QUOTES.length);
  const quote = QUOTES[quoteIdx];

  const progress = cycleFrame / DURATION;
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  // Typewriter: reveal characters one at a time
  const charsRevealed = Math.floor(cycleFrame * CHARS_PER_FRAME);
  const visibleText = quote.slice(0, Math.min(charsRevealed, quote.length));
  const showCursor = cycleFrame % 20 < 12; // Blink cursor

  const hue = (120 + Math.sin(frame * 0.01) * 30) % 360; // Green range
  const color = `hsl(${hue}, 80%, 55%)`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          bottom: "12%",
          left: "50%",
          transform: "translateX(-50%)",
          maxWidth: "75%",
          opacity: fadeOut,
          padding: "16px 24px",
          background: "rgba(0, 10, 0, 0.6)",
          borderRadius: 4,
          border: `1px solid ${color}`,
          boxShadow: `0 0 15px rgba(0, 255, 0, 0.15)`,
        }}
      >
        <div
          style={{
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: 20,
            color,
            textShadow: `0 0 6px ${color}, 0 0 12px ${color}`,
            lineHeight: 1.5,
            letterSpacing: 0.5,
          }}
        >
          {visibleText}
          {showCursor && charsRevealed < quote.length && (
            <span style={{ opacity: 0.9 }}>_</span>
          )}
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: 12,
            color,
            opacity: 0.5,
            letterSpacing: 1,
          }}
        >
          — JERRY GARCIA
        </div>
      </div>
    </div>
  );
};
