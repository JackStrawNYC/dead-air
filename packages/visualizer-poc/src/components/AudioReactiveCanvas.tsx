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
import { computeClimaxState, climaxModulation, type ClimaxPhase } from "../utils/climax-state";
import { computeHeroIconState } from "../utils/hero-icon";
import { computeAudioSnapshot as computeSnapshot, buildBeatArray as buildBeatArrayUtil, computeMusicalTime as computeMusicalTimeUtil, computeSpectralFlux, computeEnergyAcceleration, computeEnergyTrend, computeEnergyForecast, computePeakApproaching, computeBeatStability } from "../utils/audio-reactive";
import { energyGate } from "../utils/math";
import { useHeroPermitted } from "../data/HeroPermittedContext";
import { useJamPhase } from "../data/JamPhaseContext";
import { usePeakOfShow } from "../data/PeakOfShowContext";

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

export const AudioReactiveCanvas: React.FC<Props> = ({ frames, children, style, sections, palette, tempo, jamDensity, coherence: coherenceProp, isLocked: isLockedProp, snapToMusicalTime: snapToMusicalTimeProp }) => {
  const frameIdx = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frameIdx), frames.length - 1);
  const fd = frames[idx];

  // Pre-compute cumulative beat array (once per song, avoids O(n) per frame)
  const beatArray = useMemo(() => buildBeatArrayUtil(frames), [frames]);

  // Dynamic time accumulator: advances proportionally to energy.
  // Auto-calibrated to song's own percentiles so the quietest 20% of the song
  // runs at near-zero speed and only the loudest passages reach full speed.
  const dynamicTimeLookup = useMemo(() => {
    // Auto-calibrate: P15 = quiet threshold, P85 = loud threshold
    const samples = frames.filter((_, i) => i % 5 === 0).map(f => f.rms).sort((a, b) => a - b);
    const quietThresh = samples[Math.floor(samples.length * 0.15)] ?? 0.05;
    const loudThresh = samples[Math.floor(samples.length * 0.85)] ?? 0.35;
    const range = Math.max(0.05, loudThresh - quietThresh);

    const dt = 1 / fps;
    const lookup = new Float64Array(frames.length);
    let accum = 0;
    for (let i = 0; i < frames.length; i++) {
      const lo = Math.max(0, i - 90);
      const hi = Math.min(frames.length - 1, i + 90);
      let eSum = 0, eCount = 0;
      for (let j = lo; j <= hi; j++) { eSum += frames[j].rms; eCount++; }
      const localEnergy = eCount > 0 ? eSum / eCount : 0;
      const t = Math.max(0, Math.min(1, (localEnergy - quietThresh) / range));
      const factor = t * t * (3 - 2 * t); // smoothstep
      const speed = 0.12 + factor * 0.88; // 12% at quiet → 100% at peak
      accum += dt * speed;
      lookup[i] = accum;
    }
    return lookup;
  }, [frames, fps]);

  const sectionList = sections ?? [];
  const { sectionIndex, sectionProgress } = findCurrentSection(sectionList, idx);

  const energy = smoothValue(frames, idx, (f) => f.rms, 15);
  const egate = energyGate(energy);
  const chromaHue = smoothValue(frames, idx, (f) => dominantChromaHue(f.chroma), 15);
  const contrast = smoothContrast(frames, idx, 12);
  const flatness = smoothValue(frames, idx, (f) => f.flatness, 15);

  // Snappy transient envelopes: fast attack, slow exponential release, energy-gated
  const onsetSnap = transientEnvelope(frames, idx, (f) => f.onset, 10) * Math.max(0.35, egate);
  const beatSnap = transientEnvelope(frames, idx, (f) => (f.beat ? 1 : 0), 15) * Math.max(0.35, egate);

  // Stem-separated bass: use stemBassRms if available, else fallback to (sub+low)/2
  const hasStemBass = frames[idx].stemBassRms != null;
  const stemBass = hasStemBass
    ? smoothValue(frames, idx, (f) => f.stemBassRms ?? 0, 10)
    : smoothValue(frames, idx, (f) => f.sub + f.low, 10) * 0.5;

  // Key change detection + color afterglow
  const chromaShift = chromaShiftMagnitude(frames, idx);
  const afterglowHue = colorAfterglowHue(frames, idx);

  // Fast-responding signals for transient punch
  const fastEnergy = smoothValue(frames, idx, (f) => f.rms, 8);
  const fastBass = smoothValue(frames, idx, (f) => f.sub + f.low, 6) * 0.5;
  const drumOnset = transientEnvelope(frames, idx, (f) => f.stemDrumOnset ?? 0, 8) * Math.max(0.45, egate);
  const drumBeat = transientEnvelope(frames, idx, (f) => (f.stemDrumBeat ? 1 : 0), 12) * Math.max(0.45, egate);
  const spectralFlux = computeSpectralFlux(frames, idx, 8);

  // Stem-separated vocal + other features
  const vocalEnergy = smoothValue(frames, idx, (f) => f.stemVocalRms ?? 0, 12);
  const vocalPresence = smoothValue(frames, idx, (f) => f.stemVocalPresence ? 1 : 0, 20);
  const hasOtherStem = frames[idx].stemOtherRms != null;
  const otherEnergy = hasOtherStem
    ? smoothValue(frames, idx, (f) => f.stemOtherRms ?? 0, 10)
    : smoothValue(frames, idx, (f) => (f.mid + f.high) * 0.5, 10);
  const otherCentroid = hasOtherStem
    ? smoothValue(frames, idx, (f) => f.stemOtherCentroid ?? 0, 15)
    : smoothValue(frames, idx, (f) => f.centroid, 15);

  // Climax state for shader uniforms
  const phaseMap: Record<ClimaxPhase, number> = { idle: 0, build: 1, climax: 2, sustain: 3, release: 4 };
  const climaxEnergy = smoothValue(frames, idx, (f) => f.rms, 25);
  const climaxState = computeClimaxState(frames, idx, sectionList, climaxEnergy);
  const climaxPhaseNum = phaseMap[climaxState.phase];
  const climaxMod = climaxModulation(climaxState);
  const climaxSpeedMult = climaxMod.shaderSpeedMult;
  const heroPermitted = useHeroPermitted();
  const jamPhaseCtx = useJamPhase();
  const peakOfShowIntensity = usePeakOfShow();
  const heroIcon = heroPermitted !== false
    ? computeHeroIconState(climaxPhaseNum, climaxState.intensity)
    : { trigger: 0, progress: 0 };

  const pal = palette ?? DEFAULT_PALETTE;
  // Energy-driven hue evolution: quiet = base palette, peak = +30° shift
  const energyHueShift = energy * (30 / 360);
  const palettePrimary = pal.primary / 360 + energyHueShift;
  const paletteSecondary = pal.secondary / 360 + energyHueShift;
  const paletteSaturation = pal.saturation ?? 1;

  // New audio snapshot fields — smoothed for shader consumption
  const melodicPitch = smoothValue(frames, idx, (f) => f.melodicPitch ?? 0, 8);
  const melodicDirection = smoothValue(frames, idx, (f) => f.melodicDirection ?? 0, 5);
  const chordIndex = frames[idx].chordIndex ?? 0; // discrete, no smoothing
  const harmonicTension = smoothValue(frames, idx, (f) => f.harmonicTension ?? 0, 15);
  const sectionTypeFloat = encodeSectionType(frames[idx].sectionType ?? "jam");
  const energyForecast = computeEnergyForecast(frames, idx);
  const peakApproaching = computePeakApproaching(frames, idx);
  const beatStabilityVal = computeBeatStability(frames, idx);
  const downbeatPulse = transientEnvelope(frames, idx, (f) => (f.downbeat ? 1 : 0), 12) * Math.max(0.4, egate);
  const beatConfidenceSmooth = smoothValue(frames, idx, (f) => f.beatConfidence ?? 0.5, 20);
  const melodicConfidenceSmooth = smoothValue(frames, idx, (f) => f.melodicConfidence ?? 0.5, 20);

  const audioData: AudioDataContext = {
    frame: fd,
    frameIndex: idx,
    time: frameIdx / fps,
    beatDecay: beatDecay(frames, idx) * Math.max(0.4, egate),
    smooth: {
      rms: smoothValue(frames, idx, (f) => f.rms, 12),
      centroid: smoothValue(frames, idx, (f) => f.centroid, 18),
      bass: smoothValue(frames, idx, (f) => f.sub + f.low, 12) * 0.5 * (0.6 + 0.4 * egate),
      mids: smoothValue(frames, idx, (f) => f.mid, 8),
      highs: smoothValue(frames, idx, (f) => f.high, 3),
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
      slowEnergy: smoothValue(frames, idx, (f) => f.rms, 180),
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
      localTempo: smoothValue(frames, idx, (f) => f.localTempo ?? (tempo ?? 120), 30),
      melodicPitch,
      melodicDirection,
      chordIndex,
      harmonicTension,
      sectionTypeFloat,
      energyForecast,
      peakApproaching,
      beatStability: beatStabilityVal,
      improvisationScore: smoothValue(frames, idx, (f) => f.improvisationScore ?? 0, 30),
      downbeat: downbeatPulse,
      beatConfidence: beatConfidenceSmooth,
      melodicConfidence: melodicConfidenceSmooth,
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
      const fluxMult = 1.0 + Math.min(0.3, spectralFlux * 0.8);
      return baseDT * climaxSpeedMult * fluxMult;
    })(),
    jamPhase: jamPhaseCtx.phase,
    jamProgress: jamPhaseCtx.progress,
    peakOfShow: peakOfShowIntensity,
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
