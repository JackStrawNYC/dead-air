/**
 * LyricFlash — Famous Dead lyrics appearing in psychedelic text.
 * One lyric appears every 45s for 6s. Large neon text with heavy glow.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

// Pre-1977 Dead lyrics only — no anachronistic songs for '77 shows
const LYRICS = [
  "What a long strange trip it's been",
  "Ripple in still water",
  "Once in a while you get shown the light",
  "Shall we go, you and I, while we can?",
  "Nothing left to do but smile, smile, smile",
  "Driving that train, high on cocaine",
  "Wake up to find out that you are the eyes of the world",
  "Let there be songs to fill the air",
  "If I knew the way, I would take you home",
  "Without love in the dream it will never come true",
  "Sometimes the light's all shining on me",
  "Such a long long time to be gone, and a short time to be there",
  "Believe it if you need it, if you don't just pass it on",
  "Into the closing of my mind",
  "Let it be known there is a fountain that was not made by the hands of men",
  "Going where the wind don't blow so strange",
  "There is a road, no simple highway",
  "In the land of the dark the ship of the sun is drawn by the Grateful Dead",
  "Comes a time when the blind man takes your hand",
  "The bus came by and I got on, that's when it all began",
  "Ain't no time to hate, barely time to wait",
  "Saint Stephen with a rose, in and out of the garden he goes",
];

const CYCLE = 1350; // 45 seconds
const DURATION = 180; // 6 seconds

interface Props {
  frames: EnhancedFrameData[];
}

export const LyricFlash: React.FC<Props> = ({ frames }) => {
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

  const rng = seeded(cycleIndex * 37 + 5081977);
  const lyricIdx = Math.floor(rng() * LYRICS.length);
  const lyric = LYRICS[lyricIdx];

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.8, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.85;

  const hue = (frame * 1.2 + cycleIndex * 80) % 360;
  const color = `hsl(${hue}, 100%, 65%)`;
  const color2 = `hsl(${(hue + 60) % 360}, 100%, 70%)`;

  const scale = 1 + energy * 0.15;
  const yOffset = Math.sin(frame * 0.03) * 8;
  const fontSize = lyric.length > 40 ? 30 : lyric.length > 25 ? 36 : 42;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${scale}) translateY(${yOffset}px)`,
          opacity,
          textAlign: "center",
          maxWidth: "80%",
          fontSize,
          fontWeight: 900,
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontStyle: "italic",
          color,
          textShadow: `
            0 0 8px ${color},
            0 0 16px ${color},
            0 0 30px ${color2}
          `,
          letterSpacing: 2,
          lineHeight: 1.3,
        }}
      >
        {lyric}
      </div>
    </div>
  );
};
