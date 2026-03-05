/**
 * LyricFlash — Famous Dead lyrics appearing in psychedelic text.
 * One lyric appears every 45s for 6s. Large neon text with heavy glow.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useShowContext } from "../data/ShowContext";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { BAND_CONFIG } from "../data/band-config";

// Lyrics from band config — portable across artists
const LYRICS = BAND_CONFIG.lyrics;

const CYCLE = 1350; // 45 seconds
const DURATION = 180; // 6 seconds

interface Props {
  frames: EnhancedFrameData[];
}

export const LyricFlash: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();
  const snap = useAudioSnapshot(frames);

  const energy = snap.energy;

  const cycleIndex = Math.floor(frame / CYCLE);
  const cycleFrame = frame % CYCLE;

  if (cycleFrame >= DURATION) return null;

  const rng = seeded(cycleIndex * 37 + (ctx?.showSeed ?? 19770508));
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
