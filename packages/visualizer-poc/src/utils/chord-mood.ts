/**
 * Chord-Driven Mood Detection — maps harmonic context to visual moods.
 *
 * Analyzes a 2-second window of chordIndex, harmonicTension, and chordConfidence
 * to classify the harmonic mood into one of 5 categories. Used by SceneRouter
 * to bias shader selection toward mood-matching modes.
 */

import type { EnhancedFrameData, VisualMode } from "../data/types";

export type HarmonicMood = "luminous" | "shadowed" | "turbulent" | "transcendent" | "grounded";

export interface ChordMoodResult {
  mood: HarmonicMood;
  confidence: number;
  preferredModes: VisualMode[];
}

/**
 * Major chord indices (from 24-template detection):
 * 0=C, 2=D, 4=E, 5=F, 7=G, 9=A, 11=B (major)
 * 12=Cm, 14=Dm, 16=Em, 17=Fm, 19=Gm, 21=Am, 23=Bm (minor)
 */
const MAJOR_INDICES = new Set([0, 2, 4, 5, 7, 9, 11]);
const MINOR_INDICES = new Set([12, 14, 16, 17, 19, 21, 23]);

/**
 * Detect the harmonic mood from a window of audio frames.
 * @param frames Full frame array
 * @param centerIdx Current frame index
 * @param windowSize Number of frames to analyze (default 60 = 2s at 30fps)
 */
export function detectChordMood(
  frames: EnhancedFrameData[],
  centerIdx: number,
  windowSize = 60,
): ChordMoodResult {
  const halfWindow = Math.floor(windowSize / 2);
  const start = Math.max(0, centerIdx - halfWindow);
  const end = Math.min(frames.length, centerIdx + halfWindow);

  let majorCount = 0;
  let minorCount = 0;
  let tensionSum = 0;
  let confidenceSum = 0;
  let energySum = 0;
  let count = 0;

  for (let i = start; i < end; i++) {
    const f = frames[i];
    const chordIdx = f.chordIndex;
    const tension = f.harmonicTension;
    const conf = f.chordConfidence;

    if (chordIdx != null) {
      const idx = Math.round(chordIdx * 23); // Denormalize from 0-1 to 0-23
      if (MAJOR_INDICES.has(idx)) majorCount++;
      else if (MINOR_INDICES.has(idx)) minorCount++;
    }

    tensionSum += tension ?? 0;
    confidenceSum += conf ?? 0.5;
    energySum += f.rms;
    count++;
  }

  if (count === 0) {
    return { mood: "grounded", confidence: 0, preferredModes: [] };
  }

  const avgTension = tensionSum / count;
  const avgConfidence = confidenceSum / count;
  const avgEnergy = energySum / count;
  const majorRatio = majorCount / Math.max(1, majorCount + minorCount);
  const isMajor = majorRatio > 0.55;
  const isMinor = majorRatio < 0.45;
  const isCalm = avgTension < 0.35;
  const isTense = avgTension > 0.55;

  let mood: HarmonicMood;
  let preferredModes: VisualMode[];

  if (isMajor && isCalm) {
    mood = "luminous";
    preferredModes = ["aurora", "crystal_cavern", "sacred_geometry", "kaleidoscope", "truchet_tiling"];
  } else if (isMinor && isCalm) {
    mood = "shadowed";
    preferredModes = ["deep_ocean", "cosmic_voyage", "void_light", "particle_nebula", "diffraction_rings"];
  } else if (isTense) {
    mood = "turbulent";
    preferredModes = ["fluid_2d", "reaction_diffusion", "fractal_zoom", "inferno", "fractal_flames", "feedback_recursion"];
  } else if (isMajor && isTense) {
    mood = "transcendent";
    preferredModes = ["liquid_light", "mandala_engine", "tie_dye", "kaleidoscope"];
  } else {
    mood = "grounded";
    preferredModes = ["oil_projector", "concert_lighting", "lo_fi_grain", "vintage_film"];
  }

  // Confidence is based on chord detection confidence + energy stability
  const moodConfidence = Math.min(1, avgConfidence * 0.7 + (1 - Math.abs(avgEnergy - 0.3)) * 0.3);

  return { mood, confidence: moodConfidence, preferredModes };
}
