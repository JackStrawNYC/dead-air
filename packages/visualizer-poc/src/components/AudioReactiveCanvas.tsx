/**
 * AudioReactiveCanvas — ThreeCanvas wrapper for Remotion + Three.js.
 * Uses @remotion/three's ThreeCanvas for proper frame-by-frame rendering.
 * Provides audio data context for child Three.js components.
 */

import React, { createContext, useContext, useMemo, useRef } from "react";
import { ThreeCanvas } from "@remotion/three";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData, SectionBoundary, ColorPalette } from "../data/types";
import { findCurrentSection } from "../utils/section-lookup";
import { computeClimaxState, climaxModulation, type ClimaxPhase } from "../utils/climax-state";
import { computeHeroIconState } from "../utils/hero-icon";
import { detectPhilBomb } from "../utils/phil-bomb";
import { computeAudioSnapshot as computeSnapshot, buildBeatArray as buildBeatArrayUtil, computeMusicalTime as computeMusicalTimeUtil, computeSpectralFlux, computeEnergyAcceleration, computeEnergyTrend, computeEnergyForecast, computePeakApproaching, computeBeatStability } from "../utils/audio-reactive";
import { energyGate } from "../utils/math";
import { useHeroPermitted } from "../data/HeroPermittedContext";
import { useJamPhase } from "../data/JamPhaseContext";
import { usePeakOfShow } from "../data/PeakOfShowContext";
import { useTimeDilation } from "../data/TimeDilationContext";
import { useDeadAirFactor } from "../data/DeadAirContext";
import { GaussianSmoother } from "../utils/gaussian-smoother";
import { classifyAllFrames } from "../utils/section-classifier";

/** When true, use TS-side section classifier (with Python fallback below 0.5 confidence) */
const USE_TS_SECTION_CLASSIFIER = true;

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
    /** Rolling energy: 25-frame (~0.8s) RMS window, tracks actual loudness envelope */
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
    /** Slow energy: 180-frame (~6s) Gaussian window for ambient drift signals */
    slowEnergy: number;
    /** Stem-separated bass energy (falls back to (sub+low)/2 when stems unavailable) */
    stemBass: number;
    /** Raw 12-element chroma array at current frame (C, C#, D, ..., B) */
    chroma: number[];
    /** Fast-responding energy: 8-frame Gaussian (~0.27s) for transient punch */
    fastEnergy: number;
    /** Fast bass: 6-frame window for punchy bass response */
    fastBass: number;
    /** Stem-separated drum onset transient envelope */
    drumOnset: number;
    /** Stem-separated drum beat decay */
    drumBeat: number;
    /** Spectral flux: timbral change rate */
    spectralFlux: number;
    /** Smoothed vocal energy from stem separation (0-1) */
    vocalEnergy: number;
    /** Smoothed vocal presence from stem separation (0-1) */
    vocalPresence: number;
    /** Smoothed other (guitar/keys) energy from stem separation (0-1) */
    otherEnergy: number;
    /** Smoothed other spectral centroid (guitar brightness) from stem separation (0-1) */
    otherCentroid: number;
    /** Rate of change of energy delta (second derivative, 30-frame windows) */
    energyAcceleration: number;
    /** Sustained energy direction: -1 falling, 0 stable, +1 rising */
    energyTrend: number;
    /** Per-frame local tempo (BPM, smoothed from analysis data) */
    localTempo: number;
    /** Melodic pitch (0-1 MIDI-normalized) */
    melodicPitch: number;
    /** Melodic direction: +1 rising, -1 falling, 0 steady */
    melodicDirection: number;
    /** Chord index (0-23: 12 major + 12 minor), discrete */
    chordIndex: number;
    /** Harmonic tension: rate of chord change (0-1) */
    harmonicTension: number;
    /** Chord detection confidence (0-1) */
    chordConfidence: number;
    /** Section type encoded as float (0-7) */
    sectionTypeFloat: number;
    /** Energy forecast: smoothed future energy (0-1) */
    energyForecast: number;
    /** Peak approaching: 0-1 ramp when energy rising toward peak */
    peakApproaching: number;
    /** Beat stability: 0-1 consistency of beat spacing */
    beatStability: number;
    /** Improvisation score: 0 = structured, 1 = highly improvisational */
    improvisationScore: number;
    /** Downbeat pulse: transient envelope on measure starts (0-1) */
    downbeat: number;
    /** Beat confidence: consistency of beat detection (0-1) */
    beatConfidence: number;
    /** Melodic confidence: reliability of pitch tracking (0-1) */
    melodicConfidence: number;
    /** Tempo rate of change: -1 decelerating, 0 steady, +1 accelerating */
    tempoDerivative: number;
    /** Dynamic range: 0 compressed, 1 open/wide */
    dynamicRange: number;
    /** Space passage score: 0-1 composite */
    spaceScore: number;
    /** Timbral brightness: 0 dark, 1 bright */
    timbralBrightness: number;
    /** Timbral flux: 0-1 rate of timbral change */
    timbralFlux: number;
    /** Vocal pitch from isolated vocal stem (0-1 MIDI-normalized) */
    vocalPitch: number;
    /** Vocal pitch confidence from isolated vocal stem (0-1) */
    vocalPitchConfidence: number;
    /** CLAP semantic: psychedelic (0-1) */
    semanticPsychedelic: number;
    /** CLAP semantic: aggressive (0-1) */
    semanticAggressive: number;
    /** CLAP semantic: tender (0-1) */
    semanticTender: number;
    /** CLAP semantic: cosmic (0-1) */
    semanticCosmic: number;
    /** CLAP semantic: rhythmic (0-1) */
    semanticRhythmic: number;
    /** CLAP semantic: ambient (0-1) */
    semanticAmbient: number;
    /** CLAP semantic: chaotic (0-1) */
    semanticChaotic: number;
    /** CLAP semantic: triumphant (0-1) */
    semanticTriumphant: number;
    /** Phil Bomb shockwave intensity (0-1) */
    philBombWave: number;
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
  /** Hero icon trigger: 1.0 when active during climax peaks, 0.0 otherwise */
  heroTrigger: number;
  /** Hero icon progress: 0-1 lifecycle intensity */
  heroProgress: number;
  /** Jam density: normalized 0-1 from jam evolution system (0.5 = neutral) */
  jamDensity: number;
  /** Coherence: 0-1 band lock-in score */
  coherence: number;
  /** Whether band is in "locked in" state */
  isLocked: boolean;
  /** Dynamic time: accumulates proportionally to energy (freezes in silence, full speed at peaks) */
  dynamicTime: number;
  /** Jam phase index: 0=exploration, 1=building, 2=peak_space, 3=resolution, -1=not a long jam */
  jamPhase: number;
  /** Jam phase progress: 0-1 within current jam phase */
  jamProgress: number;
  /** Peak-of-show intensity: 0 = not in peak, 1 = peak transcendence */
  peakOfShow: number;
  /** Song progress: 0 at song start, 1 at song end */
  songProgress: number;
  /** Show progress: 0 at show start, 1 at show end (drives time-of-day arc).
   *  Defaults to songProgress when no show context is available (single-song
   *  preview). Production runtime path should override this from a show-aware
   *  context provider. */
  showProgress: number;
  /** Shader hold progress: 0 at section start, 1 at section end (spans full hold) */
  shaderHoldProgress: number;
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
function beatDecay(frames: EnhancedFrameData[], idx: number, halfLife = 15): number {
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

// buildBeatArray and computeMusicalTime are imported from ../utils/audio-reactive

/** Encode section type string to float 0-7 for shader consumption */
const SECTION_TYPE_MAP: Record<string, number> = {
  intro: 0, verse: 1, chorus: 2, bridge: 3, solo: 4, jam: 5, outro: 6, space: 7,
};
function encodeSectionType(sectionType: string): number {
  return SECTION_TYPE_MAP[sectionType] ?? 5; // default to "jam"
}

interface Props {
  frames: EnhancedFrameData[];
  children: React.ReactNode;
  style?: React.CSSProperties;
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  /** Normalized jam density from jam evolution system (0-1, default 0.5) */
  jamDensity?: number;
  /** Coherence score (0-1) from coherence detector */
  coherence?: number;
  /** Whether band is in "locked in" state */
  isLocked?: boolean;
  /** When true, shaders snap to musical time instead of organic drift */
  snapToMusicalTime?: boolean;
}

const DEFAULT_PALETTE: ColorPalette = { primary: 210, secondary: 270 };

/**
 * Named smoother bank: one GaussianSmoother per smoothed audio feature.
 * Created once per component mount via useRef. On seek (non-sequential frame),
 * each smoother falls back to brute-force recompute so the ring buffer is
 * re-seeded and subsequent sequential frames are O(window) again.
 */
interface SmootherBank {
  energy: GaussianSmoother;          // 15
  chromaHue: GaussianSmoother;       // 15
  flatness: GaussianSmoother;        // 15
  stemBassA: GaussianSmoother;       // 10 (stemBassRms path)
  stemBassB: GaussianSmoother;       // 10 (sub+low fallback path)
  fastEnergy: GaussianSmoother;      // 6
  fastBass: GaussianSmoother;        // 5
  vocalEnergy: GaussianSmoother;     // 12
  vocalPresence: GaussianSmoother;   // 20
  otherEnergyA: GaussianSmoother;    // 10 (stemOtherRms path)
  otherEnergyB: GaussianSmoother;    // 10 (mid+high fallback)
  otherCentroidA: GaussianSmoother;  // 15 (stemOtherCentroid path)
  otherCentroidB: GaussianSmoother;  // 15 (centroid fallback)
  climaxEnergy: GaussianSmoother;    // 25
  rms: GaussianSmoother;             // 12
  centroid: GaussianSmoother;        // 18
  bass: GaussianSmoother;            // 12
  mids: GaussianSmoother;            // 12
  highs: GaussianSmoother;           // 10
  onset: GaussianSmoother;           // 12
  slowEnergy: GaussianSmoother;      // 90
  localTempo: GaussianSmoother;      // 30
  melodicPitch: GaussianSmoother;    // 8
  melodicDirection: GaussianSmoother; // 12
  harmonicTension: GaussianSmoother; // 15
  chordConfidence: GaussianSmoother; // 10
  improvScore: GaussianSmoother;     // 30
  beatConfidence: GaussianSmoother;  // 20
  melodicConfidence: GaussianSmoother; // 20
  tempoDerivative: GaussianSmoother; // 10
  dynamicRange: GaussianSmoother;    // 15
  spaceScore: GaussianSmoother;      // 20
  timbralBrightness: GaussianSmoother; // 12
  timbralFlux: GaussianSmoother;     // 8
  vocalPitch: GaussianSmoother;      // 8
  vocalPitchConfidence: GaussianSmoother; // 10
  semanticPsychedelic: GaussianSmoother;  // 15
  semanticAggressive: GaussianSmoother;   // 15
  semanticTender: GaussianSmoother;       // 15
  semanticCosmic: GaussianSmoother;       // 15
  semanticRhythmic: GaussianSmoother;     // 15
  semanticAmbient: GaussianSmoother;      // 15
  semanticChaotic: GaussianSmoother;      // 15
  semanticTriumphant: GaussianSmoother;   // 15
  contrast0: GaussianSmoother;       // 12
  contrast1: GaussianSmoother;       // 12
  contrast2: GaussianSmoother;       // 12
  contrast3: GaussianSmoother;       // 12
  contrast4: GaussianSmoother;       // 12
  contrast5: GaussianSmoother;       // 12
  contrast6: GaussianSmoother;       // 12
}

function createSmootherBank(): SmootherBank {
  return {
    energy: new GaussianSmoother(15),
    chromaHue: new GaussianSmoother(15),
    flatness: new GaussianSmoother(15),
    stemBassA: new GaussianSmoother(10),
    stemBassB: new GaussianSmoother(10),
    fastEnergy: new GaussianSmoother(6),
    fastBass: new GaussianSmoother(5),
    vocalEnergy: new GaussianSmoother(12),
    vocalPresence: new GaussianSmoother(20),
    otherEnergyA: new GaussianSmoother(10),
    otherEnergyB: new GaussianSmoother(10),
    otherCentroidA: new GaussianSmoother(15),
    otherCentroidB: new GaussianSmoother(15),
    climaxEnergy: new GaussianSmoother(25),
    rms: new GaussianSmoother(12),
    centroid: new GaussianSmoother(18),
    bass: new GaussianSmoother(12),
    mids: new GaussianSmoother(12),
    highs: new GaussianSmoother(10),
    onset: new GaussianSmoother(12),
    slowEnergy: new GaussianSmoother(90),
    localTempo: new GaussianSmoother(30),
    melodicPitch: new GaussianSmoother(8),
    melodicDirection: new GaussianSmoother(12),
    harmonicTension: new GaussianSmoother(15),
    chordConfidence: new GaussianSmoother(10),
    improvScore: new GaussianSmoother(30),
    beatConfidence: new GaussianSmoother(20),
    melodicConfidence: new GaussianSmoother(20),
    tempoDerivative: new GaussianSmoother(10),
    dynamicRange: new GaussianSmoother(15),
    spaceScore: new GaussianSmoother(20),
    timbralBrightness: new GaussianSmoother(12),
    timbralFlux: new GaussianSmoother(8),
    vocalPitch: new GaussianSmoother(8),
    vocalPitchConfidence: new GaussianSmoother(10),
    semanticPsychedelic: new GaussianSmoother(15),
    semanticAggressive: new GaussianSmoother(15),
    semanticTender: new GaussianSmoother(15),
    semanticCosmic: new GaussianSmoother(15),
    semanticRhythmic: new GaussianSmoother(15),
    semanticAmbient: new GaussianSmoother(15),
    semanticChaotic: new GaussianSmoother(15),
    semanticTriumphant: new GaussianSmoother(15),
    contrast0: new GaussianSmoother(12),
    contrast1: new GaussianSmoother(12),
    contrast2: new GaussianSmoother(12),
    contrast3: new GaussianSmoother(12),
    contrast4: new GaussianSmoother(12),
    contrast5: new GaussianSmoother(12),
    contrast6: new GaussianSmoother(12),
  };
}

/**
 * Use a smoother: on sequential frames, update incrementally (O(window));
 * on seek, brute-force recompute from full frame array (O(window) scan).
 */
function useSmoother(
  smoother: GaussianSmoother,
  frames: EnhancedFrameData[],
  idx: number,
  accessor: (f: EnhancedFrameData) => number,
  isSeek: boolean,
): number {
  if (isSeek) {
    return smoother.recompute(frames, idx, accessor);
  }
  return smoother.update(idx, accessor(frames[idx]));
}

export const AudioReactiveCanvas: React.FC<Props> = ({ frames, children, style, sections, palette, tempo, jamDensity, coherence: coherenceProp, isLocked: isLockedProp, snapToMusicalTime: snapToMusicalTimeProp }) => {
  const frameIdx = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  const idx = Math.min(Math.max(0, frameIdx), frames.length - 1);
  const fd = frames[idx];

  // Smoother bank: created once, persists across renders
  const smoothersRef = useRef<SmootherBank>(createSmootherBank());
  const lastFrameRef = useRef<number>(-1);

  // Detect non-sequential frame access (Remotion can render any frame in any order)
  const isSeek = lastFrameRef.current !== -1 && idx !== lastFrameRef.current + 1 && idx !== lastFrameRef.current;
  lastFrameRef.current = idx;

  const S = smoothersRef.current;

  // Pre-compute cumulative beat array (once per song, avoids O(n) per frame)
  const beatArray = useMemo(() => buildBeatArrayUtil(frames), [frames]);

  // Precompute TS-side section classifications for the entire song.
  // This runs once at mount (or when frames change), not per-frame.
  // Remotion renders frames non-sequentially, so batch precompute is required.
  const tsClassifications = useMemo(() => {
    if (!USE_TS_SECTION_CLASSIFIER || !frames || frames.length === 0) return null;
    return classifyAllFrames(frames.map(f => ({
      energy: f.rms,
      flatness: f.flatness,
      beatConfidence: f.beatConfidence ?? 0,
      vocalPresence: f.stemVocalPresence ? 1 : 0,
    })));
  }, [frames]);

  // Dynamic time accumulator: advances proportionally to energy AND tempo.
  // Auto-calibrated to song's own percentiles. The previous version clamped
  // tempo scaling to 0.6–1.2x and energy speed to 0.65–1.40x — combined max
  // contrast of ~2.8x between a 60bpm ballad section and a 140bpm peak. Real
  // viewer perception needs more swing than that to feel like "the visuals
  // are moving with the music". New ranges:
  //   tempo: 0.50–1.65x (~3.3x swing across BPM range)
  //   energy: 0.50–1.55x (~3.1x swing across loud/quiet)
  //   combined max contrast: ~5.2x (slow ballad ≈ 0.25x natural, fast peak ≈ 2.6x)
  const dynamicTimeLookup = useMemo(() => {
    // Auto-calibrate: P15 = quiet threshold, P85 = loud threshold
    const samples = frames.filter((_, i) => i % 5 === 0).map(f => f.rms).sort((a, b) => a - b);
    const quietThresh = samples[Math.floor(samples.length * 0.15)] ?? 0.05;
    const loudThresh = samples[Math.floor(samples.length * 0.85)] ?? 0.35;
    const range = Math.max(0.05, loudThresh - quietThresh);

    // Tempo scaling: normalize to 120 BPM baseline, wider clamp so 60bpm and
    // 140bpm visuals actually feel different (was clamped 0.6-1.2x = ±20%).
    const bpm = tempo ?? 120;
    const tempoScale = Math.max(0.50, Math.min(1.65, bpm / 120));

    const dt = 1 / fps;
    const lookup = new Float64Array(frames.length);
    let accum = 0;
    // O(n) rolling window instead of O(n²) nested loop. Each frame adds one
    // RMS value to the window and removes one, maintaining a running sum.
    const HALF_WIN = 90;
    let windowSum = 0;
    let windowCount = 0;
    // Seed the window with frames [0..HALF_WIN]
    for (let j = 0; j <= Math.min(HALF_WIN, frames.length - 1); j++) {
      windowSum += frames[j].rms;
      windowCount++;
    }
    for (let i = 0; i < frames.length; i++) {
      // Expand window right edge
      const addIdx = i + HALF_WIN;
      if (addIdx < frames.length && addIdx > HALF_WIN) {
        windowSum += frames[addIdx].rms;
        windowCount++;
      }
      // Shrink window left edge
      const removeIdx = i - HALF_WIN - 1;
      if (removeIdx >= 0) {
        windowSum -= frames[removeIdx].rms;
        windowCount--;
      }
      const localEnergy = windowCount > 0 ? windowSum / windowCount : 0;
      const t = Math.max(0, Math.min(1, (localEnergy - quietThresh) / range));
      const factor = t * t * (3 - 2 * t); // smoothstep
      const speed = (0.50 + factor * 1.05) * tempoScale;
      accum += dt * speed;
      lookup[i] = accum;
    }
    return lookup;
  }, [frames, fps, tempo]);

  const sectionList = sections ?? [];
  const { sectionIndex, section: currentSectionObj, sectionProgress } = findCurrentSection(sectionList, idx);

  // Song progress: 0 at start, 1 at end
  const songProgress = durationInFrames > 0 ? frameIdx / durationInFrames : 0;
  // Show progress: in single-song preview we fall back to songProgress so
  // the time-of-day arc still has a sensible signal. Production multi-song
  // shows pass this through from the manifest (manifest-generator computes
  // the show-spanning value across all frames at line ~3260).
  const showProgress = songProgress;

  // Shader hold progress: 0 at section start, 1 at section end
  // For long holds (jam/space), this spans the full multi-section hold
  const shaderHoldProgress = currentSectionObj
    ? (idx - currentSectionObj.frameStart) / Math.max(1, currentSectionObj.frameEnd - currentSectionObj.frameStart)
    : 0;

  const energy = useSmoother(S.energy, frames, idx, (f) => f.rms, isSeek);
  const egate = energyGate(energy);
  const chromaHue = useSmoother(S.chromaHue, frames, idx, (f) => dominantChromaHue(f.chroma), isSeek);
  const contrast: number[] = [];
  const contrastSmoothers = [S.contrast0, S.contrast1, S.contrast2, S.contrast3, S.contrast4, S.contrast5, S.contrast6];
  for (let band = 0; band < 7; band++) {
    contrast.push(useSmoother(contrastSmoothers[band], frames, idx, (f) => f.contrast[band], isSeek));
  }
  const flatness = useSmoother(S.flatness, frames, idx, (f) => f.flatness, isSeek);

  // Snappy transient envelopes: fast attack, slow exponential release, energy-gated
  const onsetSnap = transientEnvelope(frames, idx, (f) => f.onset, 18) * Math.max(0.35, egate);
  const beatSnap = transientEnvelope(frames, idx, (f) => (f.beat ? 1 : 0), 15) * Math.max(0.35, egate);

  // Stem-separated bass: use stemBassRms if available, else fallback to (sub+low)/2
  const hasStemBass = frames[idx].stemBassRms != null;
  const stemBass = hasStemBass
    ? useSmoother(S.stemBassA, frames, idx, (f) => f.stemBassRms ?? 0, isSeek)
    : useSmoother(S.stemBassB, frames, idx, (f) => f.sub + f.low, isSeek) * 0.5;

  // Key change detection + color afterglow
  const chromaShift = chromaShiftMagnitude(frames, idx);
  const afterglowHue = colorAfterglowHue(frames, idx);

  // Fast-responding signals for transient punch. Was 15-frame window which is
  // identical to `energy` above (line 391) — fastEnergy provided no actual
  // distinction. New window is 6 frames (~0.2s) for genuine snap-attack.
  const fastEnergy = useSmoother(S.fastEnergy, frames, idx, (f) => f.rms, isSeek);
  const fastBass = useSmoother(S.fastBass, frames, idx, (f) => f.sub + f.low, isSeek) * 0.5;
  const drumOnset = transientEnvelope(frames, idx, (f) => f.stemDrumOnset ?? 0, 8) * Math.max(0.45, egate);
  const drumBeat = transientEnvelope(frames, idx, (f) => (f.stemDrumBeat ? 1 : 0), 18) * Math.max(0.45, egate);
  const spectralFlux = computeSpectralFlux(frames, idx, 8);

  // Stem-separated vocal + other features
  const vocalEnergy = useSmoother(S.vocalEnergy, frames, idx, (f) => f.stemVocalRms ?? 0, isSeek);
  const vocalPresence = useSmoother(S.vocalPresence, frames, idx, (f) => f.stemVocalPresence ? 1 : 0, isSeek);
  const hasOtherStem = frames[idx].stemOtherRms != null;
  const otherEnergy = hasOtherStem
    ? useSmoother(S.otherEnergyA, frames, idx, (f) => f.stemOtherRms ?? 0, isSeek)
    : useSmoother(S.otherEnergyB, frames, idx, (f) => (f.mid + f.high) * 0.5, isSeek);
  const otherCentroid = hasOtherStem
    ? useSmoother(S.otherCentroidA, frames, idx, (f) => f.stemOtherCentroid ?? 0, isSeek)
    : useSmoother(S.otherCentroidB, frames, idx, (f) => f.centroid, isSeek);

  // Climax state for shader uniforms
  const phaseMap: Record<ClimaxPhase, number> = { idle: 0, build: 1, climax: 2, sustain: 3, release: 4 };
  const climaxEnergy = useSmoother(S.climaxEnergy, frames, idx, (f) => f.rms, isSeek);
  const climaxState = computeClimaxState(frames, idx, sectionList, climaxEnergy);
  const climaxPhaseNum = phaseMap[climaxState.phase];
  const climaxMod = climaxModulation(climaxState);
  const climaxSpeedMult = climaxMod.shaderSpeedMult;
  const heroPermitted = useHeroPermitted();
  const jamPhaseCtx = useJamPhase();
  const peakOfShowIntensity = usePeakOfShow();
  const spaceTimeDilation = useTimeDilation();
  const deadAirFactorCtx = useDeadAirFactor();
  const heroIcon = heroPermitted !== false
    ? computeHeroIconState(climaxPhaseNum, climaxState.intensity)
    : { trigger: 0, progress: 0 };

  const philBombWave = detectPhilBomb(frames, idx);

  const pal = palette ?? DEFAULT_PALETTE;
  // Energy-driven hue evolution: quiet = base palette, peak = +30° shift
  const energyHueShift = energy * (30 / 360);
  const palettePrimary = pal.primary / 360 + energyHueShift;
  const paletteSecondary = pal.secondary / 360 + energyHueShift;
  const paletteSaturation = pal.saturation ?? 1;

  // New audio snapshot fields — smoothed for shader consumption
  const melodicPitch = useSmoother(S.melodicPitch, frames, idx, (f) => f.melodicPitch ?? 0, isSeek);
  const melodicDirection = useSmoother(S.melodicDirection, frames, idx, (f) => f.melodicDirection ?? 0, isSeek);
  const chordIndex = frames[idx].chordIndex ?? 0; // discrete, no smoothing
  const harmonicTension = useSmoother(S.harmonicTension, frames, idx, (f) => f.harmonicTension ?? 0, isSeek);
  const chordConfidence = useSmoother(S.chordConfidence, frames, idx, (f) => f.chordConfidence ?? 0.5, isSeek);
  // Use TS classifier when available and confident, fall back to Python-derived
  const pythonSectionType = frames[idx].sectionType ?? "jam";
  const tsSectionType = tsClassifications?.[idx]?.sectionType;
  const tsConfidence = tsClassifications?.[idx]?.confidence ?? 0;
  const effectiveSectionType = (tsSectionType && tsConfidence > 0.5) ? tsSectionType : pythonSectionType;
  const sectionTypeFloat = encodeSectionType(effectiveSectionType);
  const energyForecast = computeEnergyForecast(frames, idx);
  const peakApproaching = computePeakApproaching(frames, idx);
  const beatStabilityVal = computeBeatStability(frames, idx);
  const downbeatPulse = transientEnvelope(frames, idx, (f) => (f.downbeat ? 1 : 0), 12) * Math.max(0.4, egate);
  const beatConfidenceSmooth = useSmoother(S.beatConfidence, frames, idx, (f) => f.beatConfidence ?? 0.5, isSeek);
  const melodicConfidenceSmooth = useSmoother(S.melodicConfidence, frames, idx, (f) => f.melodicConfidence ?? 0.5, isSeek);
  const tempoDerivativeSmooth = useSmoother(S.tempoDerivative, frames, idx, (f) => f.tempoDerivative ?? 0, isSeek);
  const dynamicRangeSmooth = useSmoother(S.dynamicRange, frames, idx, (f) => f.dynamicRange ?? 0.5, isSeek);
  const spaceScoreSmooth = useSmoother(S.spaceScore, frames, idx, (f) => f.spaceScore ?? 0, isSeek);
  const timbralBrightnessSmooth = useSmoother(S.timbralBrightness, frames, idx, (f) => f.timbralBrightness ?? 0.5, isSeek);
  const timbralFluxSmooth = useSmoother(S.timbralFlux, frames, idx, (f) => f.timbralFlux ?? 0, isSeek);
  const vocalPitchSmooth = useSmoother(S.vocalPitch, frames, idx, (f) => f.vocalPitch ?? 0, isSeek);
  const vocalPitchConfidenceSmooth = useSmoother(S.vocalPitchConfidence, frames, idx, (f) => f.vocalPitchConfidence ?? 0, isSeek);
  const semanticPsychedelicSmooth = useSmoother(S.semanticPsychedelic, frames, idx, (f) => f.semantic_psychedelic ?? 0, isSeek);
  const semanticAggressiveSmooth = useSmoother(S.semanticAggressive, frames, idx, (f) => f.semantic_aggressive ?? 0, isSeek);
  const semanticTenderSmooth = useSmoother(S.semanticTender, frames, idx, (f) => f.semantic_tender ?? 0, isSeek);
  const semanticCosmicSmooth = useSmoother(S.semanticCosmic, frames, idx, (f) => f.semantic_cosmic ?? 0, isSeek);
  const semanticRhythmicSmooth = useSmoother(S.semanticRhythmic, frames, idx, (f) => f.semantic_rhythmic ?? 0, isSeek);
  const semanticAmbientSmooth = useSmoother(S.semanticAmbient, frames, idx, (f) => f.semantic_ambient ?? 0, isSeek);
  const semanticChaoticSmooth = useSmoother(S.semanticChaotic, frames, idx, (f) => f.semantic_chaotic ?? 0, isSeek);
  const semanticTriumphantSmooth = useSmoother(S.semanticTriumphant, frames, idx, (f) => f.semantic_triumphant ?? 0, isSeek);

  // Pre-compute remaining smoothed values that were previously inline in the audioData literal
  const smoothRms = useSmoother(S.rms, frames, idx, (f) => f.rms, isSeek);
  const smoothCentroid = useSmoother(S.centroid, frames, idx, (f) => f.centroid, isSeek);
  const smoothBass = useSmoother(S.bass, frames, idx, (f) => f.sub + f.low, isSeek) * 0.5 * (0.6 + 0.4 * egate);
  const smoothMids = useSmoother(S.mids, frames, idx, (f) => f.mid, isSeek);
  const smoothHighs = useSmoother(S.highs, frames, idx, (f) => f.high, isSeek);
  const smoothOnset = useSmoother(S.onset, frames, idx, (f) => f.onset, isSeek);
  // 90-frame Gaussian (~3s) instead of 180 (~6s) — still smooth enough for
  // ambient drift signals but no longer lags major dynamic shifts by 6 seconds
  const slowEnergy = useSmoother(S.slowEnergy, frames, idx, (f) => f.rms, isSeek);
  const localTempoSmooth = useSmoother(S.localTempo, frames, idx, (f) => f.localTempo ?? (tempo ?? 120), isSeek);
  const improvScoreSmooth = useSmoother(S.improvScore, frames, idx, (f) => f.improvisationScore ?? 0, isSeek);

  const audioData: AudioDataContext = {
    frame: fd,
    frameIndex: idx,
    time: frameIdx / fps,
    beatDecay: beatDecay(frames, idx) * Math.max(0.4, egate),
    smooth: {
      rms: smoothRms,
      centroid: smoothCentroid,
      bass: smoothBass,
      mids: smoothMids,
      highs: smoothHighs,
      onset: smoothOnset,
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
      slowEnergy,
      stemBass,
      chroma: Array.from(fd.chroma),
      fastEnergy,
      fastBass,
      drumOnset,
      drumBeat,
      spectralFlux,
      vocalEnergy,
      vocalPresence,
      otherEnergy,
      otherCentroid,
      energyAcceleration: computeEnergyAcceleration(frames, idx),
      energyTrend: computeEnergyTrend(frames, idx),
      localTempo: localTempoSmooth,
      melodicPitch,
      melodicDirection,
      chordIndex,
      harmonicTension,
      chordConfidence,
      sectionTypeFloat,
      energyForecast,
      peakApproaching,
      beatStability: beatStabilityVal,
      improvisationScore: improvScoreSmooth,
      downbeat: downbeatPulse,
      beatConfidence: beatConfidenceSmooth,
      melodicConfidence: melodicConfidenceSmooth,
      tempoDerivative: tempoDerivativeSmooth,
      dynamicRange: dynamicRangeSmooth,
      spaceScore: spaceScoreSmooth,
      timbralBrightness: timbralBrightnessSmooth,
      timbralFlux: timbralFluxSmooth,
      vocalPitch: vocalPitchSmooth,
      vocalPitchConfidence: vocalPitchConfidenceSmooth,
      semanticPsychedelic: semanticPsychedelicSmooth,
      semanticAggressive: semanticAggressiveSmooth,
      semanticTender: semanticTenderSmooth,
      semanticCosmic: semanticCosmicSmooth,
      semanticRhythmic: semanticRhythmicSmooth,
      semanticAmbient: semanticAmbientSmooth,
      semanticChaotic: semanticChaoticSmooth,
      semanticTriumphant: semanticTriumphantSmooth,
      philBombWave,
    },
    palettePrimary,
    paletteSecondary,
    paletteSaturation,
    tempo: tempo ?? 120,
    musicalTime: computeMusicalTimeUtil(beatArray, idx, fps, tempo ?? 120),
    climaxPhase: climaxPhaseNum,
    climaxIntensity: climaxState.intensity,
    heroTrigger: heroIcon.trigger,
    heroProgress: heroIcon.progress,
    jamDensity: jamDensity ?? 0.5,
    coherence: coherenceProp ?? 0,
    isLocked: isLockedProp ?? false,
    dynamicTime: (() => {
      const baseDT = snapToMusicalTimeProp
        ? computeMusicalTimeUtil(beatArray, idx, fps, tempo ?? 120) / (tempo ?? 120) * 60
        : (dynamicTimeLookup[idx] ?? (idx / fps));
      const fluxMult = 1.0 + Math.min(0.04, spectralFlux * 0.1);
      // Dead air slowdown: when music ends and crowd noise is playing, slow the
      // shader clock to 5% of normal so cosmic_dust (the dead-air shader) barely
      // drifts — reads as "between songs" screensaver, not "music is playing."
      // The 5% floor keeps a gentle drift so the visual doesn't fully freeze.
      const deadAirMult = 1 - deadAirFactorCtx * 0.95;
      return baseDT * climaxSpeedMult * fluxMult * spaceTimeDilation * deadAirMult;
    })(),
    jamPhase: jamPhaseCtx.phase,
    jamProgress: jamPhaseCtx.progress,
    peakOfShow: peakOfShowIntensity,
    songProgress,
    showProgress,
    shaderHoldProgress,
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
