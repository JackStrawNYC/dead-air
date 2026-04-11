/**
 * RollingAudioState — EMA smoothing replacing Gaussian windows.
 * Core mapping: alpha = 2 / (window + 1), halved for 60fps (vs 30fps originals).
 *
 * Also handles: section synthesis, climax state machine, dynamic time,
 * afterglow hue, chroma shift, and rolling percentile estimation.
 */

import type { RawAudioFeatures, SmoothedAudioState } from "./types";
import type { BeatState } from "./BeatDetector";
import { ChordDetector } from "./ChordDetector";
import { BeatStabilityEstimator } from "./BeatStabilityEstimator";
import { SectionEstimator } from "./SectionEstimator";
import { VocalEstimator } from "./VocalEstimator";
import { JamDensityEstimator } from "./JamDensityEstimator";

/** EMA alpha for a given original 30fps window, adapted to 60fps */
function emaAlpha(window30fps: number): number {
  return 2 / (window30fps * 2 + 1);
}

// Pre-computed alphas
const ALPHA = {
  energy: emaAlpha(60),        // 0.0164
  slowEnergy: emaAlpha(180),   // 0.0055
  fastEnergy: emaAlpha(8),     // 0.111
  bass: emaAlpha(10),          // 0.095
  mids: emaAlpha(8),           // 0.111
  highs: emaAlpha(5),          // 0.167  (faster for shimmer)
  centroid: emaAlpha(18),      // 0.053
  onset: emaAlpha(6),          // 0.143
  onsetEnvelope: emaAlpha(18), // 0.053
  chromaHue: emaAlpha(15),     // 0.063
  flatness: emaAlpha(15),      // 0.063
  spectralFlux: emaAlpha(8),   // 0.111
  fastBass: emaAlpha(6),       // 0.143
} as const;

// Climax phases
const PHASE_IDLE = 0;
const PHASE_BUILD = 1;
const PHASE_CLIMAX = 2;
const PHASE_SUSTAIN = 3;
const PHASE_RELEASE = 4;

// Section timing
const SECTION_DURATION_S = 30;

export class RollingAudioState {
  // EMA values
  private emaEnergy = 0;
  private emaSlowEnergy = 0;
  private emaFastEnergy = 0;
  private emaBass = 0;
  private emaMids = 0;
  private emaHighs = 0;
  private emaCentroid = 0;
  private emaOnset = 0;
  private emaFlatness = 0;
  private emaSpectralFlux = 0;
  private emaFastBass = 0;

  // Transient envelopes
  private onsetSnapValue = 0;
  private beatSnapValue = 0;
  private beatDecayValue = 0;
  private drumOnsetValue = 0;
  private drumBeatValue = 0;

  // Chroma
  private chromaHueValue = 0;
  private prevChromaHue = 0;
  private chromaShiftValue = 0;

  // Afterglow
  private afterglowHueValue = 0;
  private afterglowScore = 0;

  // Sections
  private sectionIndex = 0;
  private sectionStartTime = 0;

  // Climax state machine
  private climaxPhase = PHASE_IDLE;
  private climaxIntensity = 0;
  private climaxTimer = 0;

  // Dynamic time
  private dynamicTimeAccum = 0;

  // Rolling percentiles (30s buffer, sampled every 60 frames)
  private percentileBuffer: number[] = [];
  private percentileSampleCounter = 0;
  private readonly percentileBufferSize = 1800; // 30s at 60fps
  private quietThreshold = 0.05;
  private loudThreshold = 0.35;

  // Musical time
  private musicalTimeAccum = 0;

  // Chroma array
  private chromaArray: number[] = new Array(12).fill(0);
  // Contrast placeholder (7 bands)
  private contrastArray: number[] = new Array(7).fill(0);

  // New detectors (Item 9: real-time audio feature detectors)
  private chordDetector = new ChordDetector();
  private beatStabilityEstimator = new BeatStabilityEstimator();
  private sectionEstimator = new SectionEstimator();
  private vocalEstimator = new VocalEstimator();
  private jamDensityEstimator = new JamDensityEstimator();

  update(
    raw: RawAudioFeatures,
    beat: BeatState,
    deltaTime: number,
    elapsedTime: number,
  ): SmoothedAudioState {
    const dt60 = deltaTime * 60; // normalize to 60fps frame units

    // === EMA smoothing ===
    this.emaEnergy += ALPHA.energy * dt60 * (raw.rms - this.emaEnergy);
    this.emaSlowEnergy += ALPHA.slowEnergy * dt60 * (raw.rms - this.emaSlowEnergy);
    this.emaFastEnergy += ALPHA.fastEnergy * dt60 * (raw.rms - this.emaFastEnergy);
    this.emaBass += ALPHA.bass * dt60 * (raw.bass - this.emaBass);
    this.emaMids += ALPHA.mids * dt60 * (raw.mids - this.emaMids);
    this.emaHighs += ALPHA.highs * dt60 * (raw.highs - this.emaHighs);
    this.emaCentroid += ALPHA.centroid * dt60 * (raw.centroid - this.emaCentroid);
    this.emaOnset += ALPHA.onset * dt60 * (raw.onset - this.emaOnset);
    this.emaFlatness += ALPHA.flatness * dt60 * (raw.flatness - this.emaFlatness);
    this.emaSpectralFlux += ALPHA.spectralFlux * dt60 * (raw.spectralFlux - this.emaSpectralFlux);
    this.emaFastBass += ALPHA.fastBass * dt60 * (raw.bass - this.emaFastBass);

    // === Transient envelopes (fast attack, slow release) ===
    // Onset snap
    if (raw.onset > this.onsetSnapValue) {
      this.onsetSnapValue = raw.onset; // instant attack
    } else {
      this.onsetSnapValue *= Math.pow(0.85, dt60); // exponential release
    }

    // Beat snap
    if (beat.isBeat) {
      this.beatSnapValue = 1.0;
      this.beatDecayValue = 1.0;
    } else {
      this.beatSnapValue *= Math.pow(0.88, dt60);
      this.beatDecayValue *= Math.pow(0.5, dt60 / 15); // halfLife=15 frames
    }

    // Drum placeholders (use main onset/beat since no stems in real-time)
    this.drumOnsetValue = this.onsetSnapValue * 0.7;
    this.drumBeatValue = this.beatDecayValue * 0.7;

    // === Chroma ===
    const newHue = this.dominantHue(raw.chromaBins);
    this.prevChromaHue = this.chromaHueValue;
    this.chromaHueValue += ALPHA.chromaHue * dt60 * (newHue - this.chromaHueValue);

    // Chroma shift (key change detection)
    const hueDiff = Math.abs(this.chromaHueValue - this.prevChromaHue);
    this.chromaShiftValue = Math.min(hueDiff, 1 - hueDiff) * 2;

    // Afterglow: track peak hue from loud moments
    const score = raw.rms * Math.pow(0.95, dt60);
    if (score > this.afterglowScore) {
      this.afterglowScore = score;
      this.afterglowHueValue = newHue;
    } else {
      this.afterglowScore *= Math.pow(0.98, dt60);
    }

    // Chroma array
    for (let i = 0; i < 12; i++) {
      this.chromaArray[i] = raw.chromaBins[i] ?? 0;
    }

    // Contrast placeholder from bass/mids/highs bands
    this.contrastArray[0] = this.emaBass * 0.8;
    this.contrastArray[1] = this.emaBass * 0.6;
    this.contrastArray[2] = this.emaMids * 0.8;
    this.contrastArray[3] = this.emaMids;
    this.contrastArray[4] = this.emaHighs * 0.6;
    this.contrastArray[5] = this.emaHighs * 0.8;
    this.contrastArray[6] = this.emaHighs;

    // === Section synthesis ===
    const timeSinceSection = elapsedTime - this.sectionStartTime;
    const energySpike = this.emaFastEnergy > this.emaSlowEnergy * 2.5;

    if (timeSinceSection >= SECTION_DURATION_S || (energySpike && timeSinceSection > 10)) {
      this.sectionIndex++;
      this.sectionStartTime = elapsedTime;
    }

    // === Rolling percentiles (dynamic range calibration) ===
    this.percentileSampleCounter++;
    if (this.percentileSampleCounter >= 1) { // sample every frame
      this.percentileBuffer.push(raw.rms);
      if (this.percentileBuffer.length > this.percentileBufferSize) {
        this.percentileBuffer.shift();
      }
      this.percentileSampleCounter = 0;

      if (this.percentileBuffer.length >= 60) {
        const sorted = [...this.percentileBuffer].sort((a, b) => a - b);
        this.quietThreshold = sorted[Math.floor(sorted.length * 0.15)] ?? 0.05;
        this.loudThreshold = sorted[Math.floor(sorted.length * 0.85)] ?? 0.35;
      }
    }

    // === Dynamic time ===
    const range = Math.max(0.05, this.loudThreshold - this.quietThreshold);
    const t = Math.max(0, Math.min(1, (this.emaEnergy - this.quietThreshold) / range));
    const factor = t * t * (3 - 2 * t); // smoothstep
    const speed = 0.01 + factor * 0.99;
    this.dynamicTimeAccum += deltaTime * speed;

    // === Musical time ===
    const bps = beat.estimatedTempo / 60;
    this.musicalTimeAccum += deltaTime * bps;
    if (beat.isBeat) {
      // Snap to nearest integer on beat
      this.musicalTimeAccum = Math.round(this.musicalTimeAccum);
    }

    // === Climax state machine ===
    this.updateClimaxState(deltaTime);

    // Energy gate for transients
    const egate = this.energyGate(this.emaEnergy);

    // === New detectors (Item 9) ===
    const timeMs = elapsedTime * 1000;
    const chord = this.chordDetector.detect(raw.chromaBins);
    const stability = this.beatStabilityEstimator.update(beat.isBeat, timeMs);
    const section = this.sectionEstimator.update(
      this.emaEnergy,
      stability.beatStability,
      stability.beatConfidence,
      this.emaFlatness,
      elapsedTime,
    );
    const vocal = this.vocalEstimator.update(
      raw.mids,
      raw.highs,
      raw.centroid,
      raw.flatness,
      raw.rms,
    );
    const jam = this.jamDensityEstimator.update(
      raw.onset,
      beat.isBeat,
      timeMs,
      section.sectionType,
    );

    return {
      rms: this.emaEnergy,
      bass: this.emaBass * (0.3 + 0.7 * egate),
      mids: this.emaMids,
      highs: this.emaHighs,
      centroid: this.emaCentroid,
      energy: this.emaEnergy,
      slowEnergy: this.emaSlowEnergy,
      fastEnergy: this.emaFastEnergy,
      fastBass: this.emaFastBass,
      onset: this.emaOnset,
      onsetSnap: this.onsetSnapValue * egate,
      beatSnap: this.beatSnapValue * egate,
      beatDecay: this.beatDecayValue * egate,
      drumOnset: this.drumOnsetValue * egate,
      drumBeat: this.drumBeatValue * egate,
      spectralFlux: this.emaSpectralFlux,
      chromaHue: this.chromaHueValue,
      chromaShift: this.chromaShiftValue,
      afterglowHue: this.afterglowHueValue,
      flatness: this.emaFlatness,
      chroma: this.chromaArray,
      contrast: this.contrastArray,
      sectionProgress: section.sectionProgress,
      sectionIndex: this.sectionIndex,
      stemBass: this.emaBass,
      // Vocal estimation from VocalEstimator (replaces old inline heuristic)
      vocalEnergy: vocal.vocalEnergy,
      vocalPresence: vocal.vocalPresence,
      // Other (guitar/keys): mid-high frequencies
      otherEnergy: (this.emaMids * 0.4 + this.emaHighs * 0.6) * 0.7,
      // Other centroid: normalized spectral centroid in non-bass range
      otherCentroid: Math.min(1, this.emaCentroid * 1.2),
      musicalTime: this.musicalTimeAccum,
      tempo: beat.estimatedTempo,
      isBeat: beat.isBeat,
      climaxPhase: this.climaxPhase,
      climaxIntensity: this.climaxIntensity,
      time: elapsedTime,
      dynamicTime: this.dynamicTimeAccum,
      // Chord detection from ChordDetector
      chordIndex: chord.chordIndex,
      chordConfidence: chord.confidence,
      harmonicTension: chord.harmonicTension,

      // Beat stability from BeatStabilityEstimator
      beatStability: stability.beatStability,
      beatConfidence: stability.beatConfidence,

      // Section estimation from SectionEstimator
      sectionType: section.sectionType,

      palettePrimary: 0, // set by VJStore
      paletteSecondary: 0,
      paletteSaturation: 1,
      jamDensity: jam.jamDensity,
      isLongJam: jam.isLongJam,
      coherence: 0,
      isLocked: false,
    };
  }

  private dominantHue(chromaBins: Float32Array): number {
    let maxIdx = 0;
    for (let i = 1; i < 12; i++) {
      if ((chromaBins[i] ?? 0) > (chromaBins[maxIdx] ?? 0)) maxIdx = i;
    }
    return maxIdx / 12;
  }

  private energyGate(energy: number, lo = 0.08, hi = 0.20): number {
    const t = Math.max(0, Math.min(1, (energy - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  }

  private updateClimaxState(dt: number): void {
    this.climaxTimer += dt;
    const e = this.emaEnergy;
    const slow = this.emaSlowEnergy;

    switch (this.climaxPhase) {
      case PHASE_IDLE:
        if (e > slow * 1.3 && e > 0.3) {
          this.climaxPhase = PHASE_BUILD;
          this.climaxTimer = 0;
          this.climaxIntensity = 0;
        }
        break;
      case PHASE_BUILD:
        this.climaxIntensity = Math.min(1, this.climaxTimer / 8); // 8s build
        if (e > slow * 1.8 || this.climaxTimer > 10) {
          this.climaxPhase = PHASE_CLIMAX;
          this.climaxTimer = 0;
          this.climaxIntensity = 1;
        } else if (e < slow * 0.8) {
          this.climaxPhase = PHASE_IDLE;
          this.climaxIntensity = 0;
        }
        break;
      case PHASE_CLIMAX:
        this.climaxIntensity = 1;
        if (this.climaxTimer > 5 || e < slow * 1.2) {
          this.climaxPhase = PHASE_SUSTAIN;
          this.climaxTimer = 0;
        }
        break;
      case PHASE_SUSTAIN:
        this.climaxIntensity = Math.max(0, 1 - this.climaxTimer / 6);
        if (this.climaxTimer > 6 || e < slow * 0.9) {
          this.climaxPhase = PHASE_RELEASE;
          this.climaxTimer = 0;
        }
        break;
      case PHASE_RELEASE:
        this.climaxIntensity = Math.max(0, 0.3 - this.climaxTimer / 10 * 0.3);
        if (this.climaxTimer > 10) {
          this.climaxPhase = PHASE_IDLE;
          this.climaxIntensity = 0;
        }
        break;
    }
  }

  reset(): void {
    this.emaEnergy = 0;
    this.emaSlowEnergy = 0;
    this.emaFastEnergy = 0;
    this.emaBass = 0;
    this.emaMids = 0;
    this.emaHighs = 0;
    this.emaCentroid = 0;
    this.emaOnset = 0;
    this.emaFlatness = 0;
    this.emaSpectralFlux = 0;
    this.emaFastBass = 0;
    this.onsetSnapValue = 0;
    this.beatSnapValue = 0;
    this.beatDecayValue = 0;
    this.drumOnsetValue = 0;
    this.drumBeatValue = 0;
    this.chromaHueValue = 0;
    this.prevChromaHue = 0;
    this.chromaShiftValue = 0;
    this.afterglowHueValue = 0;
    this.afterglowScore = 0;
    this.sectionIndex = 0;
    this.sectionStartTime = 0;
    this.climaxPhase = PHASE_IDLE;
    this.climaxIntensity = 0;
    this.climaxTimer = 0;
    this.dynamicTimeAccum = 0;
    this.percentileBuffer = [];
    this.percentileSampleCounter = 0;
    this.quietThreshold = 0.05;
    this.loudThreshold = 0.35;
    this.musicalTimeAccum = 0;

    // Reset new detectors
    this.chordDetector.reset();
    this.beatStabilityEstimator.reset();
    this.sectionEstimator.reset();
    this.vocalEstimator.reset();
    this.jamDensityEstimator.reset();
  }
}
