/**
 * GarciaQuotes — Jerry Garcia quotes typed out letter by letter.
 * Warm serif italic on transparent background — precious, not persistent.
 * Once per song, only during quiet passages. Energy-gated.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

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

const INITIAL_DELAY = 2400; // 80s — deep enough to feel earned
const CYCLE = 999999;       // once per song
const DURATION = 360;       // 12 seconds — shorter is more precious
const CHARS_PER_FRAME = 0.5; // ~15 chars/sec

interface Props {
  frames: EnhancedFrameData[];
}

export const GarciaQuotes: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();

  // Rolling energy (75-frame window each side)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Energy gate: quotes only during quiet passages
  if (energy > 0.15) return null;

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
            textShadow: "0 0 20px rgba(255, 200, 100, 0.15)",
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
          — JERRY GARCIA
        </div>
      </div>
    </div>
  );
};
