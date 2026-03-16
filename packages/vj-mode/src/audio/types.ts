/**
 * Audio types for VJ mode real-time audio analysis.
 * Maps Web Audio API FFT data to shader-compatible features.
 */

/** Raw features extracted from a single FFT frame (pre-smoothing) */
export interface RawAudioFeatures {
  rms: number;
  bass: number;
  mids: number;
  highs: number;
  centroid: number;
  onset: number;
  flatness: number;
  chromaBins: Float32Array;
  spectralFlux: number;
}

/** Smoothed audio state passed to shader uniforms each frame */
export interface SmoothedAudioState {
  // Core levels
  rms: number;
  bass: number;
  mids: number;
  highs: number;
  centroid: number;

  // Envelopes
  energy: number;
  slowEnergy: number;
  fastEnergy: number;
  fastBass: number;

  // Transients
  onset: number;
  onsetSnap: number;
  beatSnap: number;
  beatDecay: number;
  drumOnset: number;
  drumBeat: number;
  spectralFlux: number;

  // Pitch / timbre
  chromaHue: number;
  chromaShift: number;
  afterglowHue: number;
  flatness: number;
  chroma: number[];
  contrast: number[];

  // Sections (synthesized)
  sectionProgress: number;
  sectionIndex: number;

  // Stem placeholders (0 in real-time mode)
  stemBass: number;
  vocalEnergy: number;
  vocalPresence: number;
  otherEnergy: number;
  otherCentroid: number;

  // Musical timing
  musicalTime: number;
  tempo: number;
  isBeat: boolean;

  // Climax state machine
  climaxPhase: number;
  climaxIntensity: number;

  // Time
  time: number;
  dynamicTime: number;

  // Palette (set from UI controls)
  palettePrimary: number;
  paletteSecondary: number;
  paletteSaturation: number;

  // Extras
  jamDensity: number;
  coherence: number;
  isLocked: boolean;
}
