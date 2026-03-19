/**
 * Section-Type Visual Vocabularies — distinct visual treatment per section type.
 *
 * Each section type (verse, chorus, jam, space, solo, bridge, intro, outro)
 * receives characteristic visual modifiers that shape overlay density,
 * camera behavior, drift speed, saturation offsets, and cut permission.
 *
 * Integration: consumed by SongVisualizer / EnergyEnvelope to modulate
 * per-frame visual parameters based on the current section type.
 */

export interface SectionVocabulary {
  /** Overlay density multiplier (0-2, 1.0 = neutral) */
  overlayDensityMult: number;
  /** Camera steadiness: 0 = handheld chaos, 1 = locked tripod */
  cameraSteadiness: number;
  /** Drift speed multiplier (0-2, 1.0 = neutral) */
  driftSpeedMult: number;
  /** Saturation offset (-0.2 to +0.2) */
  saturationOffset: number;
  /** Whether camera cuts (applyCameraCut) are permitted */
  cutsPermitted: boolean;
  /** Brightness offset (-0.1 to +0.1) */
  brightnessOffset: number;
}

const VOCABULARIES: Record<string, SectionVocabulary> = {
  verse: {
    overlayDensityMult: 0.7,
    cameraSteadiness: 0.8,
    driftSpeedMult: 0.8,
    saturationOffset: 0,
    cutsPermitted: false,
    brightnessOffset: 0,
  },
  chorus: {
    overlayDensityMult: 1.3,
    cameraSteadiness: 0.5,
    driftSpeedMult: 1.2,
    saturationOffset: +0.15,
    cutsPermitted: true,
    brightnessOffset: +0.06,
  },
  jam: {
    overlayDensityMult: 0.5,
    cameraSteadiness: 0.3,
    driftSpeedMult: 1.3,
    saturationOffset: -0.03,
    cutsPermitted: true,
    brightnessOffset: 0,
  },
  space: {
    overlayDensityMult: 0.25,
    cameraSteadiness: 0.9,
    driftSpeedMult: 0.4,
    saturationOffset: -0.12,
    cutsPermitted: false,
    brightnessOffset: -0.03,
  },
  solo: {
    overlayDensityMult: 0.4,
    cameraSteadiness: 0.4,
    driftSpeedMult: 1.5,
    saturationOffset: +0.20,
    cutsPermitted: true,
    brightnessOffset: +0.06,
  },
  bridge: {
    overlayDensityMult: 0.6,
    cameraSteadiness: 0.6,
    driftSpeedMult: 0.9,
    saturationOffset: +0.04,
    cutsPermitted: false,
    brightnessOffset: 0,
  },
  intro: {
    overlayDensityMult: 0.3,
    cameraSteadiness: 0.7,
    driftSpeedMult: 0.6,
    saturationOffset: -0.05,
    cutsPermitted: false,
    brightnessOffset: -0.02,
  },
  outro: {
    overlayDensityMult: 0.4,
    cameraSteadiness: 0.8,
    driftSpeedMult: 0.5,
    saturationOffset: -0.08,
    cutsPermitted: false,
    brightnessOffset: -0.03,
  },
};

/** Default vocabulary for unknown section types */
const DEFAULT_VOCABULARY: SectionVocabulary = {
  overlayDensityMult: 1.0,
  cameraSteadiness: 0.5,
  driftSpeedMult: 1.0,
  saturationOffset: 0,
  cutsPermitted: true,
  brightnessOffset: 0,
};

/** Get the visual vocabulary for a section type string */
export function getSectionVocabulary(sectionType: string | undefined): SectionVocabulary {
  if (!sectionType) return DEFAULT_VOCABULARY;
  return VOCABULARIES[sectionType.toLowerCase()] ?? DEFAULT_VOCABULARY;
}

/** Blend between two vocabularies (for smooth section transitions) */
export function blendVocabularies(
  a: SectionVocabulary,
  b: SectionVocabulary,
  t: number,
): SectionVocabulary {
  const blend = Math.max(0, Math.min(1, t));
  return {
    overlayDensityMult: a.overlayDensityMult + (b.overlayDensityMult - a.overlayDensityMult) * blend,
    cameraSteadiness: a.cameraSteadiness + (b.cameraSteadiness - a.cameraSteadiness) * blend,
    driftSpeedMult: a.driftSpeedMult + (b.driftSpeedMult - a.driftSpeedMult) * blend,
    saturationOffset: a.saturationOffset + (b.saturationOffset - a.saturationOffset) * blend,
    cutsPermitted: blend < 0.5 ? a.cutsPermitted : b.cutsPermitted,
    brightnessOffset: a.brightnessOffset + (b.brightnessOffset - a.brightnessOffset) * blend,
  };
}
