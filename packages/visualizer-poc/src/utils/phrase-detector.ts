/**
 * Phrase-Level Breathing — detect musical phrases and compute progress arcs.
 *
 * Musical phrases (typically 4-8 bars) create natural breathing cycles.
 * Instead of modulating visuals at the frame level (too fast) or section
 * level (too slow), phrase-level breathing operates at the 2-8 second
 * timescale — matching how musicians naturally group ideas.
 *
 * Detection approach:
 *   1. Estimate bar duration from tempo (4 beats per bar)
 *   2. Detect phrase boundaries from energy contour peaks/valleys
 *   3. Compute phraseProgress (0→1) and phraseIntensity within each phrase
 *
 * Visual modulations:
 *   phraseProgress  → brightness/saturation arc within phrase (inhale/exhale)
 *   phraseIntensity → phrase-level zoom breathing for camera
 */

import type { FrameData } from "../data/types";

export interface PhraseState {
  /** Progress through current phrase (0 = start, 1 = end) */
  phraseProgress: number;
  /** Energy intensity of current phrase relative to recent phrases (0-1) */
  phraseIntensity: number;
  /** Whether this frame is near a phrase boundary (transition zone) */
  isPhraseBoundary: boolean;
  /** Brightness breathing offset (-0.03 to +0.03) — inhale/exhale */
  brightnessBreathing: number;
  /** Saturation breathing offset (-0.04 to +0.04) */
  saturationBreathing: number;
  /** Zoom breathing factor (0.98-1.02) — phrase-locked camera pulse */
  zoomBreathing: number;
}

/**
 * Compute phrase state for the current frame.
 *
 * @param frames - Full frame array
 * @param frameIdx - Current frame index
 * @param tempo - Song tempo in BPM
 * @param fps - Frames per second (default 30)
 */
export function detectPhrase(
  frames: FrameData[],
  frameIdx: number,
  tempo: number,
  fps = 30,
): PhraseState {
  if (frames.length < 10 || frameIdx < 0) {
    return {
      phraseProgress: 0,
      phraseIntensity: 0,
      isPhraseBoundary: false,
      brightnessBreathing: 0,
      saturationBreathing: 0,
      zoomBreathing: 1,
    };
  }

  // Estimate phrase length in frames: 4 bars × 4 beats per bar ÷ tempo × 60 × fps
  const beatsPerPhrase = 16; // 4 bars of 4/4
  const safeTempo = Math.max(60, Math.min(240, tempo));
  const phraseDurationFrames = Math.round((beatsPerPhrase / safeTempo) * 60 * fps);

  // Find phrase boundaries using energy valleys (local minima in smoothed energy)
  // We look at a ±2 phrase window around the current frame
  const searchStart = Math.max(0, frameIdx - phraseDurationFrames * 2);
  const searchEnd = Math.min(frames.length, frameIdx + phraseDurationFrames * 2);

  // Smooth energy over ~0.5 second windows for boundary detection
  const smoothWindow = Math.max(5, Math.round(fps * 0.5));

  // Find the phrase boundary just before the current frame
  let phraseStart = 0;
  let phraseEnd = frames.length;

  // Scan backward for the most recent energy valley (phrase start)
  let minEnergy = Infinity;
  let minIdx = searchStart;

  for (let i = Math.max(searchStart, frameIdx - phraseDurationFrames * 1.5 | 0); i <= frameIdx; i++) {
    const e = smoothedEnergy(frames, i, smoothWindow);
    if (e <= minEnergy) {
      minEnergy = e;
      minIdx = i;
    }
  }
  // Only use as boundary if it's a genuine valley (energy drops then rises)
  if (minIdx > searchStart + smoothWindow && minIdx < frameIdx - 5) {
    phraseStart = minIdx;
  } else {
    // Quantize to nearest phrase grid
    phraseStart = Math.floor(frameIdx / phraseDurationFrames) * phraseDurationFrames;
  }

  // Scan forward for the next energy valley (phrase end)
  minEnergy = Infinity;
  minIdx = Math.min(searchEnd - 1, frameIdx + phraseDurationFrames);

  for (let i = frameIdx + 1; i < Math.min(searchEnd, frameIdx + phraseDurationFrames * 1.5 | 0); i++) {
    const e = smoothedEnergy(frames, i, smoothWindow);
    if (e <= minEnergy) {
      minEnergy = e;
      minIdx = i;
    }
  }
  if (minIdx > frameIdx + 5 && minIdx < searchEnd - smoothWindow) {
    phraseEnd = minIdx;
  } else {
    phraseEnd = phraseStart + phraseDurationFrames;
  }

  // Clamp phrase end to valid range
  phraseEnd = Math.min(phraseEnd, frames.length);
  const phraseLen = Math.max(1, phraseEnd - phraseStart);

  // Compute progress within phrase
  const rawProgress = (frameIdx - phraseStart) / phraseLen;
  const phraseProgress = Math.max(0, Math.min(1, rawProgress));

  // Compute phrase intensity: average energy in this phrase vs recent average
  let phraseEnergySum = 0;
  let phraseFrameCount = 0;
  for (let i = phraseStart; i < Math.min(phraseEnd, frames.length); i += 3) {
    phraseEnergySum += frames[i].rms;
    phraseFrameCount++;
  }
  const phraseAvgEnergy = phraseFrameCount > 0 ? phraseEnergySum / phraseFrameCount : 0;

  // Recent energy baseline (last 3 phrases worth of frames)
  const baselineStart = Math.max(0, phraseStart - phraseDurationFrames * 3);
  let baselineSum = 0;
  let baselineCount = 0;
  for (let i = baselineStart; i < phraseStart; i += 5) {
    baselineSum += frames[i].rms;
    baselineCount++;
  }
  const baselineEnergy = baselineCount > 0 ? baselineSum / baselineCount : phraseAvgEnergy;

  const phraseIntensity = baselineEnergy > 0.01
    ? Math.max(0, Math.min(1, phraseAvgEnergy / (baselineEnergy * 2)))
    : Math.min(1, phraseAvgEnergy * 5);

  // Phrase boundary detection (within 10% of phrase start or end)
  const boundaryZone = phraseLen * 0.1;
  const isPhraseBoundary = (frameIdx - phraseStart) < boundaryZone
    || (phraseEnd - frameIdx) < boundaryZone;

  // --- Visual breathing modulations ---

  // Brightness: sinusoidal arc — peaks at mid-phrase, dips at boundaries
  // Creates "inhale → hold → exhale" cycle
  const breathPhase = Math.sin(phraseProgress * Math.PI);
  const brightnessBreathing = breathPhase * 0.03 * phraseIntensity;

  // Saturation: slightly behind brightness (peaks 60% through phrase)
  const satPhase = Math.sin((phraseProgress - 0.1) * Math.PI);
  const saturationBreathing = satPhase * 0.04 * phraseIntensity;

  // Zoom: very subtle phrase-locked camera breathing (nearly imperceptible)
  const zoomPhase = Math.sin(phraseProgress * Math.PI);
  const zoomBreathing = 1 + zoomPhase * 0.015 * phraseIntensity;

  return {
    phraseProgress,
    phraseIntensity,
    isPhraseBoundary,
    brightnessBreathing,
    saturationBreathing,
    zoomBreathing,
  };
}

/** Smoothed energy at a frame index */
function smoothedEnergy(frames: FrameData[], idx: number, window: number): number {
  const halfW = Math.floor(window / 2);
  const start = Math.max(0, idx - halfW);
  const end = Math.min(frames.length, idx + halfW + 1);
  let sum = 0;
  for (let i = start; i < end; i++) sum += frames[i].rms;
  return sum / (end - start);
}
