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
  // ─── Overlay density curve (audit Tier 1 #4 — INVERTED) ───
  // Audit identified the prior values as backwards: chorus at 1.3 added
  // overlays during peaks (where clarity is needed), while intro/outro at
  // 0.3 stripped atmosphere from quiet sections (where layered fill makes
  // the show feel alive instead of empty).
  //
  // The corrected curve:
  //   peaks (chorus / solo / jam):      LOW density — clarity at the moment
  //   quiet (verse / intro / outro):    HIGH density — atmospheric fill
  //   space:                            MINIMAL — void by design
  //   bridge:                           NEUTRAL — transitional
  verse: {
    overlayDensityMult: 1.2,         // ↑ from 0.7 — intimate atmospheric layering
    cameraSteadiness: 0.8,
    driftSpeedMult: 0.8,
    saturationOffset: 0,
    cutsPermitted: false,
    brightnessOffset: 0,
  },
  chorus: {
    overlayDensityMult: 0.6,         // ↓ from 1.3 — peak clarity, 2-3 iconic
    cameraSteadiness: 0.5,
    driftSpeedMult: 1.2,
    saturationOffset: +0.15,
    cutsPermitted: true,
    brightnessOffset: +0.06,
  },
  jam: {
    overlayDensityMult: 0.5,         // unchanged — exploratory needs space
    cameraSteadiness: 0.3,
    driftSpeedMult: 1.3,
    saturationOffset: -0.03,
    cutsPermitted: true,
    brightnessOffset: 0,
  },
  space: {
    overlayDensityMult: 0.25,        // unchanged — void by design
    cameraSteadiness: 0.9,
    driftSpeedMult: 0.4,
    saturationOffset: -0.12,
    cutsPermitted: false,
    brightnessOffset: -0.03,
  },
  solo: {
    overlayDensityMult: 0.3,         // ↓ from 0.4 — laser focus on the solo
    cameraSteadiness: 0.4,
    driftSpeedMult: 1.5,
    saturationOffset: +0.20,
    cutsPermitted: true,
    brightnessOffset: +0.06,
  },
  bridge: {
    overlayDensityMult: 1.1,         // ↑ from 0.6 — transitional, layered
    cameraSteadiness: 0.6,
    driftSpeedMult: 0.9,
    saturationOffset: +0.04,
    cutsPermitted: false,
    brightnessOffset: 0,
  },
  intro: {
    overlayDensityMult: 1.5,         // ↑ from 0.3 — atmosphere fills the room
    cameraSteadiness: 0.7,
    driftSpeedMult: 0.6,
    saturationOffset: -0.05,
    cutsPermitted: false,
    brightnessOffset: -0.02,
  },
  outro: {
    overlayDensityMult: 1.4,         // ↑ from 0.4 — final atmosphere lingers
    cameraSteadiness: 0.8,
    driftSpeedMult: 0.5,
    saturationOffset: -0.08,
    cutsPermitted: false,
    brightnessOffset: -0.03,
  },
};

/** Per-section-type preferred shader family. Soft bias (not a hard gate)
 *  — section type is always present; a hard gate would be too aggressive
 *  and would conflict with stem / semantic / song-identity routing.
 *  Used by getModeForSection to weight matching shaders 2x in the pool.
 *
 *  All entries are post-blocklist + non-BUSTED, drawn from the catalog of
 *  bar-setter atmospheric shaders. Each section's family is chosen so the
 *  visual character matches the musical character:
 *
 *    verse / intro / outro → still / intimate (low motion)
 *    chorus / solo         → vivid / dramatic (high contrast)
 *    jam                   → expansive / exploratory (deep + drift)
 *    space                 → void / transcendent (still + cosmic)
 *    bridge                → transitional (atmospheric)
 */
import type { VisualMode } from "../data/types";

export const SECTION_TYPE_FAMILIES: Record<string, VisualMode[]> = {
  verse:  ["porch_twilight", "ember_meadow", "aurora", "nimitz_aurora", "honeycomb_cathedral", "firelit_room", "highway_horizon", "desert_cantina"],
  chorus: ["fractal_temple", "sacred_geometry", "mandala_engine", "dance_floor_prism", "kaleidoscope", "concert_lighting"],
  jam:    ["deep_ocean", "cosmic_dust", "fractal_temple", "nimitz_aurora", "void_light", "highway_horizon", "cosmic_railroad"],
  space:  ["deep_ocean", "cosmic_dust", "void_light", "dark_star_void", "nimitz_aurora", "fractal_temple"],
  solo:   ["electric_arc", "dance_floor_prism", "mandala_engine", "fractal_temple", "kaleidoscope", "concert_lighting"],
  bridge: ["aurora", "nimitz_aurora", "fractal_temple", "honeycomb_cathedral", "vintage_film"],
  intro:  ["aurora", "ember_meadow", "porch_twilight", "fractal_temple", "nimitz_aurora", "firelit_room", "vintage_film"],
  outro:  ["porch_twilight", "ember_meadow", "aurora", "nimitz_aurora", "firelit_room", "vintage_film"],
};

/** Get the preferred shader family for a section type. Returns null when
 *  the type is unknown — caller falls through to existing routing. */
export function getSectionShaderFamily(sectionType: string | undefined): VisualMode[] | null {
  if (!sectionType) return null;
  const family = SECTION_TYPE_FAMILIES[sectionType.toLowerCase()];
  return family && family.length > 0 ? family : null;
}

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

/**
 * Compose section vocabulary with jam cycle phase for within-jam evolution.
 * Static vocabularies feel flat during 10-minute jams; this modulates them
 * based on the current build→peak→release sub-cycle.
 */
export function composeSectionWithJamCycle(
  vocab: SectionVocabulary,
  jamPhase: string | undefined,
  jamProgress: number,
): SectionVocabulary {
  if (!jamPhase) return vocab;

  switch (jamPhase) {
    case "explore":
      // Sparser, cooler — listening to each other
      return {
        ...vocab,
        overlayDensityMult: vocab.overlayDensityMult * (0.7 + jamProgress * 0.1),
        driftSpeedMult: vocab.driftSpeedMult * 0.8,
        saturationOffset: vocab.saturationOffset - 0.05,
        brightnessOffset: vocab.brightnessOffset - 0.02,
      };
    case "build":
      // Ramping up — progressive intensification
      return {
        ...vocab,
        overlayDensityMult: vocab.overlayDensityMult * (0.9 + jamProgress * 0.4),
        driftSpeedMult: vocab.driftSpeedMult * (1.0 + jamProgress * 0.3),
        saturationOffset: vocab.saturationOffset + jamProgress * 0.10,
        brightnessOffset: vocab.brightnessOffset + jamProgress * 0.03,
      };
    case "peak":
      // Dense, vivid — the moment
      return {
        ...vocab,
        overlayDensityMult: vocab.overlayDensityMult * 1.4,
        driftSpeedMult: vocab.driftSpeedMult * 1.3,
        saturationOffset: vocab.saturationOffset + 0.12,
        brightnessOffset: vocab.brightnessOffset + 0.04,
        cutsPermitted: true,
      };
    case "release":
      // Thinning out — exhale
      return {
        ...vocab,
        overlayDensityMult: vocab.overlayDensityMult * (1.0 - jamProgress * 0.4),
        driftSpeedMult: vocab.driftSpeedMult * (1.1 - jamProgress * 0.3),
        saturationOffset: vocab.saturationOffset - jamProgress * 0.06,
        brightnessOffset: vocab.brightnessOffset - jamProgress * 0.02,
      };
    default:
      return vocab;
  }
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
