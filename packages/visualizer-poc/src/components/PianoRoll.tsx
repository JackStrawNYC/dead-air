/**
 * PianoRoll — Piano keyboard along bottom edge with keys pressing down.
 * 2 octaves of keys (14 white + 10 black). Maps 12 chroma values to 12 pitch
 * classes (C through B). When a chroma value is high, that key "presses"
 * (translates down 4px + lights up). White keys are light gray, black keys dark.
 * Pressed keys glow with neon color per pitch. Note particles (small circles)
 * rise from pressed keys. Always visible at 20-35% opacity.
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

// Pitch class names and chroma index mapping
// chroma[0]=C, chroma[1]=C#, chroma[2]=D, ..., chroma[11]=B
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Which pitch classes are white keys vs black keys
const IS_BLACK: boolean[] = [false, true, false, true, false, false, true, false, true, false, true, false];

// Neon glow color per pitch class (hue spread across spectrum)
const PITCH_HUES: number[] = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

// White key layout for 2 octaves: C D E F G A B C D E F G A B
// Map each white key to its chroma index
const WHITE_KEY_CHROMA = [0, 2, 4, 5, 7, 9, 11, 0, 2, 4, 5, 7, 9, 11];

// Black key layout: C# D# _ F# G# A# _ C# D# _ F# G# A# _
// Position relative to white key index (sits between white keys)
interface BlackKeyDef {
  chromaIdx: number;
  afterWhiteKey: number; // index of white key it sits after (0-based)
}
const BLACK_KEYS: BlackKeyDef[] = [
  { chromaIdx: 1, afterWhiteKey: 0 },
  { chromaIdx: 3, afterWhiteKey: 1 },
  { chromaIdx: 6, afterWhiteKey: 3 },
  { chromaIdx: 8, afterWhiteKey: 4 },
  { chromaIdx: 10, afterWhiteKey: 5 },
  { chromaIdx: 1, afterWhiteKey: 7 },
  { chromaIdx: 3, afterWhiteKey: 8 },
  { chromaIdx: 6, afterWhiteKey: 10 },
  { chromaIdx: 8, afterWhiteKey: 11 },
  { chromaIdx: 10, afterWhiteKey: 12 },
];

const NUM_WHITE = 14;
const NUM_PARTICLES = 40;

interface ParticleData {
  pitchClass: number;
  xOffset: number;
  speed: number;
  size: number;
  phase: number;
  drift: number;
}

function generateParticles(seed: number): ParticleData[] {
  const rng = seeded(seed);
  const particles: ParticleData[] = [];
  for (let i = 0; i < NUM_PARTICLES; i++) {
    particles.push({
      pitchClass: Math.floor(rng() * 12),
      xOffset: (rng() - 0.5) * 0.6,
      speed: 0.8 + rng() * 1.5,
      size: 2 + rng() * 3,
      phase: rng() * 200,
      drift: (rng() - 0.5) * 0.3,
    });
  }
  return particles;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PianoRoll: React.FC<Props> = ({ frames }) => {
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

  // ALL useMemo BEFORE any return null
  const particles = React.useMemo(() => generateParticles(19770508), []);

  const fd = frames[idx];
  const chroma = fd.chroma;

  // Always visible at 20-35% opacity
  const opacity = interpolate(energy, [0.02, 0.25], [0.2, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Keyboard dimensions
  const keyboardWidth = width * 0.7;
  const keyboardLeft = (width - keyboardWidth) / 2;
  const whiteKeyWidth = keyboardWidth / NUM_WHITE;
  const whiteKeyHeight = 80;
  const blackKeyWidth = whiteKeyWidth * 0.6;
  const blackKeyHeight = 50;
  const keyboardTop = height - whiteKeyHeight - 20;

  // Press threshold
  const PRESS_THRESHOLD = 0.35;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        {/* White keys */}
        {WHITE_KEY_CHROMA.map((chromaIdx, i) => {
          const chromaVal = chroma[chromaIdx];
          const pressed = chromaVal > PRESS_THRESHOLD;
          const pressAmount = interpolate(chromaVal, [PRESS_THRESHOLD, 1], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const translateY = pressed ? pressAmount * 4 : 0;
          const hue = PITCH_HUES[chromaIdx];
          const x = keyboardLeft + i * whiteKeyWidth;
          const y = keyboardTop + translateY;

          const fillColor = pressed
            ? `hsl(${hue}, 80%, ${70 + pressAmount * 20}%)`
            : "rgba(220, 220, 220, 0.8)";
          const glowFilter = pressed
            ? `drop-shadow(0 0 ${4 + pressAmount * 8}px hsl(${hue}, 100%, 60%))`
            : "none";

          return (
            <rect
              key={`w-${i}`}
              x={x + 1}
              y={y}
              width={whiteKeyWidth - 2}
              height={whiteKeyHeight}
              rx={3}
              fill={fillColor}
              stroke="rgba(100, 100, 100, 0.5)"
              strokeWidth={0.5}
              style={{ filter: glowFilter }}
            />
          );
        })}

        {/* Black keys */}
        {BLACK_KEYS.map((bk, i) => {
          const chromaVal = chroma[bk.chromaIdx];
          const pressed = chromaVal > PRESS_THRESHOLD;
          const pressAmount = interpolate(chromaVal, [PRESS_THRESHOLD, 1], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const translateY = pressed ? pressAmount * 4 : 0;
          const hue = PITCH_HUES[bk.chromaIdx];
          const x = keyboardLeft + (bk.afterWhiteKey + 1) * whiteKeyWidth - blackKeyWidth / 2;
          const y = keyboardTop + translateY;

          const fillColor = pressed
            ? `hsl(${hue}, 90%, ${40 + pressAmount * 30}%)`
            : "rgba(30, 30, 30, 0.9)";
          const glowFilter = pressed
            ? `drop-shadow(0 0 ${4 + pressAmount * 10}px hsl(${hue}, 100%, 55%))`
            : "none";

          return (
            <rect
              key={`b-${i}`}
              x={x}
              y={y}
              width={blackKeyWidth}
              height={blackKeyHeight}
              rx={2}
              fill={fillColor}
              stroke="rgba(60, 60, 60, 0.6)"
              strokeWidth={0.5}
              style={{ filter: glowFilter }}
            />
          );
        })}

        {/* Note particles rising from pressed keys */}
        {particles.map((p, i) => {
          const chromaVal = chroma[p.pitchClass];
          if (chromaVal < PRESS_THRESHOLD) return null;

          // Find the key position for this pitch class
          const isBlack = IS_BLACK[p.pitchClass];
          let keyX: number;
          if (!isBlack) {
            // White key: find the first occurrence in WHITE_KEY_CHROMA
            const wIdx = WHITE_KEY_CHROMA.indexOf(p.pitchClass);
            keyX = keyboardLeft + (wIdx + 0.5) * whiteKeyWidth;
          } else {
            // Black key: find in BLACK_KEYS
            const bIdx = BLACK_KEYS.findIndex((bk) => bk.chromaIdx === p.pitchClass);
            if (bIdx < 0) return null;
            const bk = BLACK_KEYS[bIdx];
            keyX = keyboardLeft + (bk.afterWhiteKey + 1) * whiteKeyWidth;
          }

          // Particle rises over time
          const age = (frame + p.phase) % 120;
          const progress = age / 120;
          const px = keyX + p.xOffset * whiteKeyWidth + Math.sin(frame * 0.05 + p.phase) * p.drift * 30;
          const py = keyboardTop - progress * 150 * p.speed;
          const particleOpacity = interpolate(progress, [0, 0.1, 0.7, 1], [0, 0.8, 0.5, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const hue = PITCH_HUES[p.pitchClass];
          return (
            <circle
              key={`p-${i}`}
              cx={px}
              cy={py}
              r={p.size * (1 - progress * 0.5)}
              fill={`hsla(${hue}, 100%, 70%, ${particleOpacity * chromaVal})`}
              style={{
                filter: `drop-shadow(0 0 3px hsl(${hue}, 100%, 60%))`,
              }}
            />
          );
        })}

        {/* Keyboard frame */}
        <rect
          x={keyboardLeft - 4}
          y={keyboardTop - 4}
          width={keyboardWidth + 8}
          height={whiteKeyHeight + 8}
          rx={5}
          fill="none"
          stroke="rgba(150, 150, 150, 0.2)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
};
