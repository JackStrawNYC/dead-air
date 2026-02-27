/**
 * BumperStickers -- classic Grateful Dead bumper stickers shooting across the screen.
 * One sticker at a time, bright psychedelic colors with neon glow.
 * Cycles every 40 seconds. Motion paths similar to DeadIcons.
 * Deterministic via mulberry32 PRNG.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

// -- Sticker text -----------------------------------------------------------

const STICKER_TEXTS = [
  "What a long strange trip it's been",
  "Keep on truckin'",
  "Not all who wander are lost",
  "Further",
  "NFA",
  "~*~",
  "Dead Head",
  "Touch of Grey",
  "One more Saturday night",
];

// -- Colors -----------------------------------------------------------------

const STICKER_BG_COLORS = [
  "#FF1493", // deep pink
  "#FF4500", // orange red
  "#7B68EE", // slate blue
  "#00CED1", // dark turquoise
  "#FFD700", // gold
  "#FF00FF", // magenta
  "#32CD32", // lime green
  "#FF6347", // tomato
  "#00FF7F", // spring green
  "#DA70D6", // orchid
  "#651FFF", // deep purple
  "#00E5FF", // neon cyan
  "#F50057", // neon pink
  "#76FF03", // neon green
  "#FFEA00", // neon yellow
];

// -- Motion types -----------------------------------------------------------

type MotionType = "streak_lr" | "streak_rl" | "arc_up" | "diagonal_tl_br" | "diagonal_tr_bl" | "rise_spin";
const MOTION_TYPES: MotionType[] = [
  "streak_lr", "streak_rl", "arc_up", "diagonal_tl_br", "diagonal_tr_bl", "rise_spin",
];

// -- Timing -----------------------------------------------------------------

const STICKER_CYCLE = 3600; // 2 minutes between stickers
const STICKER_LIFETIME = 300; // 10 seconds on screen (travel time)

// -- Schedule ---------------------------------------------------------------

interface ScheduledSticker {
  textIndex: number;
  startFrame: number;
  motion: MotionType;
  bgColor: string;
  yOffset: number;
  seed: number;
  tiltDeg: number;
  fontSize: number;
}

function generateSchedule(totalFrames: number, masterSeed: number): ScheduledSticker[] {
  const rng = seeded(masterSeed);
  const stickers: ScheduledSticker[] = [];

  let nextStart = 90; // first sticker after 3 seconds
  let textIdx = 0;

  while (nextStart < totalFrames) {
    const motionIdx = Math.floor(rng() * MOTION_TYPES.length);
    const bgIdx = Math.floor(rng() * STICKER_BG_COLORS.length);

    stickers.push({
      textIndex: textIdx % STICKER_TEXTS.length,
      startFrame: nextStart,
      motion: MOTION_TYPES[motionIdx],
      bgColor: STICKER_BG_COLORS[bgIdx],
      yOffset: 0.15 + rng() * 0.6,
      seed: rng() * 100,
      tiltDeg: -8 + rng() * 16, // -8 to +8 degrees
      fontSize: 18 + Math.floor(rng() * 10), // 18-28px
    });

    textIdx++;
    nextStart += STICKER_CYCLE;
  }

  return stickers;
}

// -- Motion computation -----------------------------------------------------

interface MotionState {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
}

function computeMotion(
  motion: MotionType,
  progress: number,
  screenW: number,
  screenH: number,
  yOffset: number,
  seed: number,
  baseTilt: number,
): MotionState {
  // Fade envelope
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const p = progress;

  switch (motion) {
    case "streak_lr": {
      const x = interpolate(p, [0, 1], [-0.2 * screenW, 1.2 * screenW], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const y = screenH * yOffset;
      const wobble = Math.sin(p * Math.PI * 3 + seed) * 15;
      return { x, y: y + wobble, rotation: baseTilt + Math.sin(p * Math.PI * 2) * 3, scale: 1, opacity };
    }
    case "streak_rl": {
      const x = interpolate(p, [0, 1], [1.2 * screenW, -0.2 * screenW], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const y = screenH * yOffset;
      const wobble = Math.sin(p * Math.PI * 2.5 + seed) * 18;
      return { x, y: y + wobble, rotation: baseTilt - Math.sin(p * Math.PI * 2) * 4, scale: 1, opacity };
    }
    case "arc_up": {
      const x = interpolate(p, [0, 1], [screenW * 0.1, screenW * 0.9], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const arcHeight = screenH * 0.35;
      const y = screenH * yOffset - Math.sin(p * Math.PI) * arcHeight;
      return { x, y, rotation: baseTilt + p * 15, scale: 0.9 + Math.sin(p * Math.PI) * 0.2, opacity };
    }
    case "diagonal_tl_br": {
      const x = interpolate(p, [0, 1], [-0.15 * screenW, 1.15 * screenW], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const y = interpolate(p, [0, 1], [screenH * 0.1, screenH * 0.8], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      return { x, y, rotation: baseTilt + p * 10, scale: 1, opacity };
    }
    case "diagonal_tr_bl": {
      const x = interpolate(p, [0, 1], [1.15 * screenW, -0.15 * screenW], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const y = interpolate(p, [0, 1], [screenH * 0.15, screenH * 0.75], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      return { x, y, rotation: baseTilt - p * 12, scale: 1, opacity };
    }
    case "rise_spin": {
      const cx = screenW * (0.25 + yOffset * 0.5);
      const x = cx + Math.sin(p * Math.PI * 2 + seed) * 100;
      const y = interpolate(p, [0, 1], [screenH * 0.9, screenH * 0.1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      return { x, y, rotation: baseTilt + p * 360, scale: 0.7 + p * 0.5, opacity };
    }
  }
}

// -- Component --------------------------------------------------------------

interface Props {
  frames: EnhancedFrameData[];
}

export const BumperStickers: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  // Rolling energy
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let energySum = 0;
  let energyCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    energySum += frames[i].rms;
    energyCount++;
  }
  const energy = energyCount > 0 ? energySum / energyCount : 0;

  // Energy drives glow intensity and speed
  const energyMult = interpolate(energy, [0.05, 0.3], [0.7, 1.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowIntensity = interpolate(energy, [0.05, 0.35], [8, 25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const schedule = React.useMemo(
    () => generateSchedule(durationInFrames, 50877),
    [durationInFrames],
  );

  // Find the active sticker (only one at a time)
  let activeSticker: ScheduledSticker | null = null;
  let activeAge = 0;
  for (const sticker of schedule) {
    const age = frame - sticker.startFrame;
    if (age >= 0 && age < STICKER_LIFETIME) {
      activeSticker = sticker;
      activeAge = age;
      break;
    }
  }

  if (!activeSticker) return null;

  const progress = activeAge / STICKER_LIFETIME;
  const state = computeMotion(
    activeSticker.motion,
    progress,
    width,
    height,
    activeSticker.yOffset,
    activeSticker.seed,
    activeSticker.tiltDeg,
  );

  const finalOpacity = state.opacity * 0.9;
  if (finalOpacity < 0.01) return null;

  const text = STICKER_TEXTS[activeSticker.textIndex];
  const bgColor = activeSticker.bgColor;

  // Parse hex for glow color
  const glowColor = bgColor;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: state.x,
          top: state.y,
          transform: `translate(-50%, -50%) rotate(${state.rotation}deg) scale(${state.scale * energyMult})`,
          opacity: finalOpacity,
          filter: `drop-shadow(0 0 ${glowIntensity}px ${glowColor}) drop-shadow(0 0 ${glowIntensity * 2}px ${glowColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <div
          style={{
            background: bgColor,
            borderRadius: 12,
            padding: "10px 22px",
            whiteSpace: "nowrap",
            border: "2px solid rgba(255, 255, 255, 0.5)",
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.2)`,
          }}
        >
          <span
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: activeSticker.fontSize,
              fontWeight: 700,
              color: "#FFFFFF",
              textShadow: "1px 1px 2px rgba(0,0,0,0.4)",
              letterSpacing: 0.8,
            }}
          >
            {text}
          </span>
        </div>
      </div>
    </div>
  );
};
