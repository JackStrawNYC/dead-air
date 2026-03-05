/**
 * AudioReactiveCanvas — ThreeCanvas wrapper for Remotion + Three.js.
 * Uses @remotion/three's ThreeCanvas for proper frame-by-frame rendering.
 * Provides audio data context for child Three.js components.
 */

import React, { createContext, useContext, useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";
import { findCurrentSection } from "../utils/section-lookup";
import { computeClimaxState, type ClimaxPhase } from "../utils/climax-state";
import { computeAudioSnapshot as computeSnapshot } from "../utils/audio-reactive";

/** Audio data context passed to all Three.js children */
export interface AudioDataContext {
  frame: EnhancedFrameData;
  frameIndex: number;
  /** Continuous time in seconds */
  time: number;
  /** Beat decay: slow exponential falloff from last beat (0-1) */
  beatDecay: number;
  /** Heavily smoothed values for flowing, organic motion */
  smooth: {
    rms: number;
    centroid: number;
    bass: number;
    mids: number;
    highs: number;
    onset: number;
    /** Rolling energy: 150-frame (~5s) RMS window, tracks actual loudness envelope */
    energy: number;
    /** Position within current section (0-1) */
    sectionProgress: number;
    /** Current section index */
    sectionIndex: number;
    /** Dominant pitch class as normalized hue (0-1) */
    chromaHue: number;
    /** 7-band spectral contrast, smoothed */
    contrast: number[];
    /** Spectral flatness: 0=tonal, 1=noisy */
    flatness: number;
    /** Onset snap: fast attack / slow release for sharp transient visuals */
    onsetSnap: number;
    /** Beat snap: fast attack / slow release for punchy beat visuals */
    beatSnap: number;
    /** Chroma shift: magnitude of key change (0-1) */
    chromaShift: number;
    /** Afterglow hue: decaying peak hue from recent loud moments (0-1) */
    afterglowHue: number;
  };
  /** Per-song palette primary hue (0-1 normalized) */
  palettePrimary: number;
  /** Per-song palette secondary hue (0-1 normalized) */
  paletteSecondary: number;
  /** Per-song palette saturation multiplier (0-1, default 1) */
  paletteSaturation: number;
  /** Track tempo in BPM (default 120) */
  tempo: number;
  /** Musical time: beat count + fractional interpolation, phase-locked to detected tempo */
  musicalTime: number;
  /** Current climax phase (0=idle, 1=build, 2=climax, 3=sustain, 4=release) */
  climaxPhase: number;
  /** Climax intensity (0-1) within current phase */
  climaxIntensity: number;
}

const AudioCtx = createContext<AudioDataContext | null>(null);

export function useAudioData(): AudioDataContext {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudioData must be used inside AudioReactiveCanvas");
  return ctx;
}

/**
 * Compute beat decay — slow, gentle swell rather than strobe.
 * halfLife=20 frames (~0.67s) gives a slow breathing pulse.
 */
function beatDecay(frames: EnhancedFrameData[], idx: number, halfLife = 20): number {
  for (let ago = 0; ago < 45; ago++) {
    if (idx - ago < 0) break;
    if (frames[idx - ago].beat) return Math.pow(0.5, ago / halfLife);
  }
  return 0;
}

/**
 * Smoothed value over a wide window for flowing motion.
 * Uses Gaussian-weighted average (center-heavy) for organic feel.
 */
function smoothValue(
  frames: EnhancedFrameData[],
  idx: number,
  accessor: (f: EnhancedFrameData) => number,
  window = 10,
): number {
  let sum = 0;
  let weightSum = 0;
  const sigma = window * 0.5;
  for (let i = Math.max(0, idx - window); i <= Math.min(frames.length - 1, idx + window); i++) {
    const dist = i - idx;
    const weight = Math.exp(-(dist * dist) / (2 * sigma * sigma));
    sum += accessor(frames[i]) * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? sum / weightSum : 0;
}

/**
 * Fast-attack / slow-release envelope for transients.
 * Current frame passes at full strength, previous frames decay exponentially.
 * Creates snappy visual response to drum hits and attacks.
 */
function transientEnvelope(
  frames: EnhancedFrameData[],
  idx: number,
  accessor: (f: EnhancedFrameData) => number,
  releaseFrames = 15,
): number {
  let peak = 0;
  for (let ago = 0; ago <= releaseFrames; ago++) {
    if (idx - ago < 0) break;
    const val = accessor(frames[idx - ago]);
    const decay = Math.exp((-ago * 3.0) / releaseFrames);
    peak = Math.max(peak, val * decay);
  }
  return peak;
}

/** Smooth a 7-element contrast array, each band independently */
function smoothContrast(
  frames: EnhancedFrameData[],
  idx: number,
  window = 12,
): number[] {
  const result: number[] = [];
  for (let band = 0; band < 7; band++) {
    result.push(smoothValue(frames, idx, (f) => f.contrast[band], window));
  }
  return result;
}

/** Find dominant pitch class from chroma array, return normalized hue (0-1) */
function dominantChromaHue(chroma: number[]): number {
  let maxIdx = 0;
  for (let i = 1; i < 12; i++) {
    if (chroma[i] > chroma[maxIdx]) maxIdx = i;
  }
  return maxIdx / 12;
}

/**
 * Stroboscopic freeze: when a strong onset occurs, hold the time value
 * for a few frames. Creates a brief freeze-frame then snap-forward effect.
 */
function computeDisplayTime(frames: EnhancedFrameData[], idx: number, fps: number): number {
  const FREEZE_THRESHOLD = 0.85;
  const FREEZE_FRAMES = 3;
  for (let ago = 0; ago < FREEZE_FRAMES; ago++) {
    if (idx - ago < 0) break;
    if (frames[idx - ago].onset > FREEZE_THRESHOLD) {
      return (idx - ago) / fps;
    }
  }
  return idx / fps;
}

/**
 * Detect key changes: magnitude of chroma shift over a window.
 * Returns 0-1 where high values indicate harmonic movement.
 */
function chromaShiftMagnitude(frames: EnhancedFrameData[], idx: number, lookback = 15): number {
  if (idx < lookback) return 0;
  const current = dominantChromaHue(frames[idx].chroma);
  const past = dominantChromaHue(frames[idx - lookback].chroma);
  const diff = Math.abs(current - past);
  return Math.min(diff, 1 - diff) * 2; // 0-1, wrapping-aware
}

/**
 * Color afterglow: find the dominant hue from the loudest recent moment.
 * The peak hue lingers and slowly fades, creating visual memory of peaks.
 */
function colorAfterglowHue(frames: EnhancedFrameData[], idx: number, decayFrames = 60): number {
  let peakHue = 0;
  let peakScore = 0;
  for (let ago = 0; ago < decayFrames; ago++) {
    if (idx - ago < 0) break;
    const e = frames[idx - ago].rms;
    const decay = Math.exp((-ago * 2.0) / decayFrames);
    const score = e * decay;
    if (score > peakScore) {
      peakScore = score;
      peakHue = dominantChromaHue(frames[idx - ago].chroma);
    }
  }
  return peakHue;
}

/**
 * Pre-compute cumulative beat indices for O(1) musical time lookups.
 * Returns array of frame indices where beat=true.
 */
function buildBeatArray(frames: EnhancedFrameData[]): number[] {
  const beats: number[] = [];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].beat) beats.push(i);
  }
  return beats;
}

/**
 * Compute musical time: beat count + fractional interpolation between beats.
 * Phase-locks to detected tempo so visuals breathe with the music.
 * Returns a continuously incrementing value where integer crossings = beat hits.
 */
function computeMusicalTime(
  beatArray: number[],
  frameIdx: number,
  fps: number,
  tempo: number,
): number {
  if (beatArray.length === 0) {
    // No beats detected — fall back to tempo-based estimate
    return (frameIdx / fps) * (tempo / 60);
  }

  // Binary search for the last beat at or before frameIdx
  let lo = 0;
  let hi = beatArray.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (beatArray[mid] <= frameIdx) lo = mid;
    else hi = mid - 1;
  }

  if (beatArray[lo] > frameIdx) {
    // Before first beat — interpolate from frame 0 to first beat
    const expectedSpacing = (fps * 60) / tempo;
    return frameIdx / expectedSpacing;
  }

  const beatCount = lo;
  const beatFrame = beatArray[lo];

  // Fractional interpolation to next beat
  const nextBeatFrame = lo + 1 < beatArray.length
    ? beatArray[lo + 1]
    : beatFrame + (fps * 60) / tempo; // estimate next beat from tempo

  const spacing = nextBeatFrame - beatFrame;
  const fraction = spacing > 0 ? (frameIdx - beatFrame) / spacing : 0;

  return beatCount + Math.min(fraction, 1);
}

interface Props {
  frames: EnhancedFrameData[];
  children: React.ReactNode;
  style?: React.CSSProperties;
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
}

const DEFAULT_PALETTE: ColorPalette = { primary: 210, secondary: 270 };

export const AudioReactiveCanvas: React.FC<Props> = ({ frames, children, style, sections, palette, tempo }) => {
  const frameIdx = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frameIdx), frames.length - 1);
  const fd = frames[idx];

  // Pre-compute cumulative beat array (once per song, avoids O(n) per frame)
  const beatArray = useMemo(() => buildBeatArray(frames), [frames]);

  const sectionList = sections ?? [];
  const { sectionIndex, sectionProgress } = findCurrentSection(sectionList, idx);

  const energy = smoothValue(frames, idx, (f) => f.rms, 150);
  const chromaHue = smoothValue(frames, idx, (f) => dominantChromaHue(f.chroma), 15);
  const contrast = smoothContrast(frames, idx, 12);
  const flatness = smoothValue(frames, idx, (f) => f.flatness, 15);

  // Snappy transient envelopes: fast attack, slow exponential release
  const onsetSnap = transientEnvelope(frames, idx, (f) => f.onset, 15);
  const beatSnap = transientEnvelope(frames, idx, (f) => (f.beat ? 1 : 0), 20);

  // Key change detection + color afterglow
  const chromaShift = chromaShiftMagnitude(frames, idx);
  const afterglowHue = colorAfterglowHue(frames, idx);

  // Climax state for shader uniforms
  const phaseMap: Record<ClimaxPhase, number> = { idle: 0, build: 1, climax: 2, sustain: 3, release: 4 };
  const climaxEnergy = smoothValue(frames, idx, (f) => f.rms, 150);
  const climaxState = computeClimaxState(frames, idx, sectionList, climaxEnergy);
  const climaxPhaseNum = phaseMap[climaxState.phase];

  const pal = palette ?? DEFAULT_PALETTE;
  const palettePrimary = pal.primary / 360;
  const paletteSecondary = pal.secondary / 360;
  const paletteSaturation = pal.saturation ?? 1;

  const audioData: AudioDataContext = {
    frame: fd,
    frameIndex: idx,
    time: frameIdx / fps,
    beatDecay: beatDecay(frames, idx),
    smooth: {
      rms: smoothValue(frames, idx, (f) => f.rms, 12),
      centroid: smoothValue(frames, idx, (f) => f.centroid, 18),
      bass: smoothValue(frames, idx, (f) => f.sub + f.low, 20) * 0.5,
      mids: smoothValue(frames, idx, (f) => f.mid, 10),
      highs: smoothValue(frames, idx, (f) => f.high, 4),
      onset: smoothValue(frames, idx, (f) => f.onset, 6),
      energy,
      sectionProgress,
      sectionIndex,
      chromaHue,
      contrast,
      flatness,
      onsetSnap,
      beatSnap,
      chromaShift,
      afterglowHue,
    },
    palettePrimary,
    paletteSecondary,
    paletteSaturation,
    tempo: tempo ?? 120,
    musicalTime: computeMusicalTime(beatArray, idx, fps, tempo ?? 120),
    climaxPhase: climaxPhaseNum,
    climaxIntensity: climaxState.intensity,
  };

  return (
    <AudioCtx.Provider value={audioData}>
      <ThreeCanvas
        width={width}
        height={height}
        style={style}
        orthographic={false}
        camera={{ position: [0, 0, 5], fov: 50 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
      >
        {children}
      </ThreeCanvas>
    </AudioCtx.Provider>
  );
};
