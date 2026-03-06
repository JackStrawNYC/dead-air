/**
 * CameraMotion — virtual camera wrapper that adds pans/zooms/shakes
 * synced to audio energy.
 *
 * - Base scale 1.04x (always slightly overscaled, cropped by overflow:hidden)
 * - Quiet passages: slow zoom-in to 1.08x
 * - Peak energy: pull-back to 1.03x
 * - Beat hits: ±2px micro-shake with 4-frame exponential decay
 * - Pure CSS transforms — negligible performance cost
 */

import React from "react";
import { useCurrentFrame } from "remotion";
import type { EnhancedFrameData } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
  children: React.ReactNode;
}

const BASE_SCALE = 1.04;
const QUIET_SCALE = 1.08;
const PEAK_SCALE = 1.03;
const SHAKE_PX = 1;
const SHAKE_DECAY_FRAMES = 8;

/** Simple seeded hash for deterministic shake direction */
function shakeHash(frame: number): { x: number; y: number } {
  const s = Math.sin(frame * 12.9898 + 78.233) * 43758.5453;
  const x = (s - Math.floor(s)) * 2 - 1;
  const s2 = Math.sin(frame * 78.233 + 12.9898) * 23421.6312;
  const y = (s2 - Math.floor(s2)) * 2 - 1;
  return { x, y };
}

export const CameraMotion: React.FC<Props> = ({ frames, children }) => {
  const frame = useCurrentFrame();
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const f = frames[idx];

  // Smoothed energy for zoom (rolling 30-frame window)
  let energySum = 0;
  let count = 0;
  for (let i = Math.max(0, idx - 45); i <= Math.min(frames.length - 1, idx + 45); i++) {
    energySum += frames[i].rms;
    count++;
  }
  const smoothEnergy = count > 0 ? energySum / count : 0;

  // Zoom: interpolate between quiet (zoom in) and peak (pull back)
  const t = Math.min(1, smoothEnergy * 5); // 0-1 energy mapping
  const scale = QUIET_SCALE + (PEAK_SCALE - QUIET_SCALE) * t;

  // Micro-shake on beat hits
  let shakeX = 0;
  let shakeY = 0;
  for (let ago = 0; ago < SHAKE_DECAY_FRAMES; ago++) {
    const checkIdx = idx - ago;
    if (checkIdx < 0) break;
    if (frames[checkIdx].beat && frames[checkIdx].onset > 0.6) {
      const decay = Math.exp(-ago * 1.5);
      const dir = shakeHash(checkIdx);
      shakeX += dir.x * SHAKE_PX * decay;
      shakeY += dir.y * SHAKE_PX * decay;
      break; // use the most recent beat
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${scale.toFixed(4)}) translate(${shakeX.toFixed(2)}px, ${shakeY.toFixed(2)}px)`,
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
};
