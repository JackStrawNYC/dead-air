/**
 * CameraMotion — virtual camera wrapper that adds pans/zooms/shakes
 * synced to audio energy.
 *
 * - Base scale 1.04x (always slightly overscaled, cropped by overflow:hidden)
 * - Quiet passages: slow zoom-in to 1.08x
 * - Peak energy: pull-back to 1.03x
 * - Beat hits: ±3px micro-shake with 8-frame exponential decay
 * - Long jams: phase-driven zoom/drift (exploration → build → peak → resolution)
 * - Pure CSS transforms — negligible performance cost
 */

import React from "react";
import { useCurrentFrame } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import type { JamEvolution, JamPhase } from "../utils/jam-evolution";

interface Props {
  frames: EnhancedFrameData[];
  children: React.ReactNode;
  jamEvolution?: JamEvolution;
  /** Bass energy from AudioSnapshot (0-1) for bass-driven shake scaling */
  bass?: number;
}

const QUIET_SCALE = 1.08;
const PEAK_SCALE = 1.03;
const SHAKE_PX = 3;
const SHAKE_DECAY_FRAMES = 12;

/** Phase-driven camera parameters for long jams */
const PHASE_CAMERA: Record<JamPhase, {
  zoomStart: number; zoomEnd: number;
  driftAmp: number; driftHz: number;
}> = {
  exploration: { zoomStart: 1.04, zoomEnd: 1.04, driftAmp: 6, driftHz: 0.03 },
  building:    { zoomStart: 1.04, zoomEnd: 1.07, driftAmp: 4, driftHz: 0.04 },
  peak_space:  { zoomStart: 1.07, zoomEnd: 1.06, driftAmp: 1.5, driftHz: 0.02 },
  resolution:  { zoomStart: 1.06, zoomEnd: 1.03, driftAmp: 5, driftHz: 0.025 },
};

/** Simple seeded hash for deterministic shake direction */
function shakeHash(frame: number): { x: number; y: number } {
  const s = Math.sin(frame * 12.9898 + 78.233) * 43758.5453;
  const x = (s - Math.floor(s)) * 2 - 1;
  const s2 = Math.sin(frame * 78.233 + 12.9898) * 23421.6312;
  const y = (s2 - Math.floor(s2)) * 2 - 1;
  return { x, y };
}

export const CameraMotion: React.FC<Props> = ({ frames, children, jamEvolution, bass }) => {
  const frame = useCurrentFrame();
  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Smoothed energy for zoom (rolling 90-frame window)
  let energySum = 0;
  let count = 0;
  for (let i = Math.max(0, idx - 45); i <= Math.min(frames.length - 1, idx + 45); i++) {
    energySum += frames[i].rms;
    count++;
  }
  const smoothEnergy = count > 0 ? energySum / count : 0;

  // Energy-based zoom (existing behavior)
  const energyT = Math.min(1, smoothEnergy * 5);
  const energyScale = QUIET_SCALE + (PEAK_SCALE - QUIET_SCALE) * energyT;

  // Determine final scale and drift
  let scale: number;
  let driftX = 0;
  let driftY = 0;

  if (jamEvolution && jamEvolution.isLongJam) {
    // Phase-driven camera for long jams: 60% phase zoom + 40% energy zoom
    const phaseParams = PHASE_CAMERA[jamEvolution.phase];
    const phaseProgress = jamEvolution.phaseProgress;
    const phaseZoom = phaseParams.zoomStart + (phaseParams.zoomEnd - phaseParams.zoomStart) * phaseProgress;
    scale = phaseZoom * 0.6 + energyScale * 0.4;

    // Sinusoidal lateral drift
    const time = frame / 30; // seconds
    driftX = Math.sin(time * phaseParams.driftHz * Math.PI * 2) * phaseParams.driftAmp;
    driftY = Math.cos(time * phaseParams.driftHz * Math.PI * 2 * 0.7 + 1.3) * phaseParams.driftAmp * 0.6;
  } else {
    // Short songs: existing energy-only behavior
    scale = energyScale;
  }

  // Micro-shake on beat hits
  let shakeX = 0;
  let shakeY = 0;
  for (let ago = 0; ago < SHAKE_DECAY_FRAMES; ago++) {
    const checkIdx = idx - ago;
    if (checkIdx < 0) break;
    if (frames[checkIdx].beat && frames[checkIdx].onset > 0.35) {
      const decay = Math.exp(-ago * 0.7);
      const dir = shakeHash(checkIdx);
      shakeX += dir.x * SHAKE_PX * decay;
      shakeY += dir.y * SHAKE_PX * decay;
      break; // use the most recent beat
    }
  }

  // Bass-driven continuous micro-sway
  const bassAmp = (bass ?? 0) * 8.0;
  const bassT = frame / 30;
  shakeX += Math.sin(bassT * 3.7) * bassAmp * 0.5;
  shakeY += Math.cos(bassT * 2.3) * bassAmp * 0.3;

  const totalX = shakeX + driftX;
  const totalY = shakeY + driftY;

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
          transform: `scale(${scale.toFixed(4)}) translate(${totalX.toFixed(2)}px, ${totalY.toFixed(2)}px)`,
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
};
