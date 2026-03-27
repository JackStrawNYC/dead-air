/**
 * Harmonic Response — per-frame visual modulation from chord progression context.
 *
 * Analyzes the harmonic relationship between the current chord and the
 * song's tonic (most common root pitch class) to produce brightness and
 * saturation offsets. Chords close to the tonic on the circle of fifths
 * feel "resolved" (brighter, more saturated); distant chords feel
 * "departed" (darker, slightly desaturated).
 *
 * Pure function — no side effects, no caching.
 */

import type { EnhancedFrameData } from "../data/types";
import type { AudioSnapshot } from "./audio-reactive";

export interface HarmonicResponse {
  /** Brightness offset applied to the scene (-0.08 to +0.12) */
  brightnessOffset: number;
  /** Saturation multiplier applied to the scene (0.85 to 1.15) */
  saturationMult: number;
  /** Strength of resolution feeling (0-1) */
  resolutionStrength: number;
  /** Strength of departure feeling (0-1) */
  departureStrength: number;
}

/** Neutral response — no harmonic modulation */
const NEUTRAL: HarmonicResponse = {
  brightnessOffset: 0,
  saturationMult: 1,
  resolutionStrength: 0,
  departureStrength: 0,
};

/**
 * Circle of fifths ordering of the 12 pitch classes.
 * Index into this array gives the "fifths position" of a pitch class.
 * C=0, G=7, D=2, A=9, E=4, B=11, F#=6, Db=1, Ab=8, Eb=3, Bb=10, F=5
 */
const FIFTHS_ORDER = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5] as const;

/**
 * Compute the position of a pitch class on the circle of fifths (0-11).
 */
function fifthsPosition(pitchClass: number): number {
  return FIFTHS_ORDER.indexOf(pitchClass as (typeof FIFTHS_ORDER)[number]);
}

/**
 * Compute circle-of-fifths distance between two pitch classes (0-6).
 * The circle has 12 positions; maximum distance is 6 (diametrically opposite).
 */
function fifthsDistance(a: number, b: number): number {
  const posA = fifthsPosition(a);
  const posB = fifthsPosition(b);
  const raw = Math.abs(posA - posB);
  return Math.min(raw, 12 - raw);
}

/**
 * Detect the tonic pitch class from a window of frames using chroma data.
 * Finds the pitch class with the highest chroma energy most frequently
 * across the window. Returns 0-11 or -1 if no chroma data is available.
 */
function detectTonic(frames: EnhancedFrameData[], idx: number, windowSize = 300): number {
  const half = Math.floor(windowSize / 2);
  const lo = Math.max(0, idx - half);
  const hi = Math.min(frames.length - 1, idx + half);

  const counts = new Array(12).fill(0);
  let validFrames = 0;

  for (let i = lo; i <= hi; i++) {
    const chroma = frames[i].chroma;
    if (!chroma) continue;

    // Find pitch class with highest chroma energy
    let maxVal = -1;
    let maxBin = 0;
    for (let j = 0; j < 12; j++) {
      if (chroma[j] > maxVal) {
        maxVal = chroma[j];
        maxBin = j;
      }
    }

    // Only count if there's meaningful chroma energy
    if (maxVal > 0) {
      counts[maxBin]++;
      validFrames++;
    }
  }

  if (validFrames === 0) return -1;

  // Most common dominant pitch class = tonic
  let tonicBin = 0;
  for (let j = 1; j < 12; j++) {
    if (counts[j] > counts[tonicBin]) tonicBin = j;
  }

  return tonicBin;
}

/**
 * Compute harmonic response from chord data.
 *
 * - Detects tonic (most common root pitch class over 300-frame window)
 * - Measures circle-of-fifths distance from current chord to tonic
 * - Resolution (near tonic + major + low tension): +brightness, +saturation
 * - Departure (far from tonic + high tension): -brightness, slight desaturation
 */
export function computeHarmonicResponse(
  frames: EnhancedFrameData[],
  idx: number,
  snapshot: AudioSnapshot,
): HarmonicResponse {
  // Bail to neutral if no chord data
  if (snapshot.chordIndex === undefined || snapshot.chordIndex < 0.5) {
    return { ...NEUTRAL };
  }

  // chordIndex arrives as raw 0-23 integer from Python (0-11 major, 12-23 minor)
  const chordIdx = Math.round(snapshot.chordIndex);
  const rootPitchClass = chordIdx % 12;
  const isMajor = chordIdx < 12;
  const tension = snapshot.harmonicTension;

  // Detect tonic from surrounding frames
  const tonic = detectTonic(frames, idx, 300);
  if (tonic === -1) {
    return { ...NEUTRAL };
  }

  // Circle-of-fifths distance (0-6)
  const distance = fifthsDistance(rootPitchClass, tonic);

  // Resolution: near tonic (distance <= 1), major chord, low tension (< 0.4)
  let resolutionStrength = 0;
  if (distance <= 1 && isMajor && tension < 0.4) {
    // Stronger when distance is 0 (tonic itself) and tension is very low
    const distanceFactor = 1 - distance; // 1.0 at tonic, 0.0 at distance 1
    const tensionFactor = 1 - tension / 0.4; // 1.0 at tension 0, 0.0 at tension 0.4
    resolutionStrength = 0.5 * (1 + distanceFactor) * tensionFactor;
    resolutionStrength = Math.min(1, Math.max(0, resolutionStrength));
  }

  // Departure: far from tonic (distance >= 4), high tension (> 0.5)
  let departureStrength = 0;
  if (distance >= 4 && tension > 0.5) {
    // Stronger when distance is 6 (tritone) and tension is very high
    const distanceFactor = (distance - 4) / 2; // 0.0 at distance 4, 1.0 at distance 6
    const tensionFactor = (tension - 0.5) / 0.5; // 0.0 at tension 0.5, 1.0 at tension 1.0
    departureStrength = 0.5 * (1 + distanceFactor) * tensionFactor;
    departureStrength = Math.min(1, Math.max(0, departureStrength));
  }

  // Interpolate brightness offset: resolution → +0.12, departure → -0.08
  const brightnessOffset = resolutionStrength * 0.12 - departureStrength * 0.08;

  // Interpolate saturation multiplier: resolution → 1.15, departure → 0.85
  const saturationMult = 1 + resolutionStrength * 0.15 - departureStrength * 0.15;

  return {
    brightnessOffset: Math.max(-0.08, Math.min(0.12, brightnessOffset)),
    saturationMult: Math.max(0.85, Math.min(1.15, saturationMult)),
    resolutionStrength,
    departureStrength,
  };
}
