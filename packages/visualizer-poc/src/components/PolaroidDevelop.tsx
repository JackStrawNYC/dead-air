/**
 * PolaroidDevelop — Polaroid instant photos that develop and float away.
 * White bordered square (polaroid frame) appears, inner image area starts black
 * and gradually reveals a color gradient (simulating photo development over 120
 * frames). Photo then drifts upward and rotates slightly as it fades.
 * One photo every 65s, 8s visible. Colors from chroma hue.
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

const PHOTO_INTERVAL = 65 * 30; // 65 seconds = 1950 frames
const PHOTO_VISIBLE = 8 * 30;   // 8 seconds = 240 frames
const DEVELOP_FRAMES = 120;

const PHOTO_W = 160;
const PHOTO_H = 190;
const IMAGE_SIZE = 130;

interface PhotoEvent {
  startFrame: number;
  x: number;
  y: number;
  rotation: number;
  hue1: number;
  hue2: number;
  hue3: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PolaroidDevelop: React.FC<Props> = ({ frames }) => {
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

  // Pre-compute photo events
  const photoEvents = React.useMemo(() => {
    const events: PhotoEvent[] = [];
    const rng = seeded(19770508);
    const totalFrames = frames.length;
    let f = PHOTO_INTERVAL;
    while (f < totalFrames) {
      // Get chroma hue near that frame
      const fIdx = Math.min(f, totalFrames - 1);
      const chroma = frames[fIdx].chroma;
      let maxC = 0;
      let maxIdx = 0;
      for (let c = 0; c < 12; c++) {
        if (chroma[c] > maxC) {
          maxC = chroma[c];
          maxIdx = c;
        }
      }
      const baseHue = maxIdx * 30; // 12 chroma bins = 30 degrees each

      events.push({
        startFrame: f,
        x: 100 + rng() * (width - PHOTO_W - 200),
        y: height * 0.3 + rng() * (height * 0.4),
        rotation: (rng() - 0.5) * 20,
        hue1: baseHue,
        hue2: (baseHue + 60 + rng() * 60) % 360,
        hue3: (baseHue + 180 + rng() * 40) % 360,
      });
      f += PHOTO_INTERVAL;
    }
    return events;
  }, [frames, width, height]);

  // Find active photo
  const activePhoto = photoEvents.find(
    (p) => frame >= p.startFrame && frame < p.startFrame + PHOTO_VISIBLE
  );

  if (!activePhoto) return null;

  const age = frame - activePhoto.startFrame;
  const progress = age / PHOTO_VISIBLE;

  // Development: image reveals over first 120 frames
  const developAmount = interpolate(age, [0, DEVELOP_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Drift upward and rotate as it ages
  const driftY = interpolate(progress, [0, 0.3, 1], [-10, 0, -80], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rotateExtra = interpolate(progress, [0, 1], [0, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fade in and out
  const opacity = interpolate(progress, [0, 0.05, 0.75, 1], [0, 0.85, 0.85, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Shake on entry
  const entryShake = interpolate(age, [0, 30], [3, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rng = seeded(activePhoto.startFrame + age);
  const shakeX = (rng() - 0.5) * entryShake;

  const totalRotation = activePhoto.rotation + rotateExtra;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: activePhoto.x + shakeX,
          top: activePhoto.y + driftY,
          width: PHOTO_W,
          height: PHOTO_H,
          opacity,
          transform: `rotate(${totalRotation}deg)`,
          filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))",
        }}
      >
        {/* Polaroid white frame */}
        <div
          style={{
            width: PHOTO_W,
            height: PHOTO_H,
            background: "#F5F0E8",
            borderRadius: 3,
            padding: "12px 15px 40px 15px",
            boxSizing: "border-box",
          }}
        >
          {/* Image area — develops from black to color gradient */}
          <div
            style={{
              width: IMAGE_SIZE,
              height: IMAGE_SIZE,
              borderRadius: 1,
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* Black undeveloped base */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "#0A0A0A",
              }}
            />
            {/* Developing color gradient */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(135deg,
                  hsl(${activePhoto.hue1}, 70%, 45%) 0%,
                  hsl(${activePhoto.hue2}, 60%, 35%) 50%,
                  hsl(${activePhoto.hue3}, 50%, 25%) 100%)`,
                opacity: developAmount,
              }}
            />
            {/* Chemical wash effect during development */}
            {developAmount < 0.9 && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `radial-gradient(ellipse at ${30 + developAmount * 40}% ${40 + developAmount * 20}%,
                    rgba(180, 140, 80, ${0.3 * (1 - developAmount)}) 0%,
                    transparent 60%)`,
                }}
              />
            )}
          </div>
        </div>

        {/* Polaroid bottom text area */}
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: "monospace",
            fontSize: 8,
            color: "rgba(80, 70, 60, 0.5)",
            letterSpacing: 1,
          }}
        >
          1977
        </div>
      </div>
    </div>
  );
};
