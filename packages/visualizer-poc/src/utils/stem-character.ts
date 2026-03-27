/**
 * Stem Character — musician-specific visual personality from stem features.
 *
 * Maps the 4 stem separations (vocals, other/guitar, bass, drums) into
 * distinct visual identities that evoke each musician's sonic character:
 *
 *   Jerry Garcia (guitar/other, high centroid):
 *     → Golden warmth, fluid motion, ascending pitch drives brightness surge
 *     → When Jerry soars, the visuals glow golden and the camera floats
 *
 *   Phil Lesh (bass):
 *     → Indigo/purple depth, fractal complexity, deep resonance
 *     → When Phil drops bombs, the visuals pulse with deep cosmic blue
 *
 *   The Rhythm Devils (drums):
 *     → Tribal earth tones, rhythmic geometry, primal pulse
 *     → When drums lock in, the visuals throb with grounded warmth
 *
 *   Bobby Weir (rhythm guitar, low centroid):
 *     → Grounded amber, structured patterns, steady driving texture
 *     → When Bobby holds it down, the visuals are warm and steady
 *
 *   Vocals (any singer):
 *     → Human warmth, intimate glow, reduced camera shake
 *     → When singing, everything softens and warms
 *
 * Pure function — deterministic, per-frame computation.
 */

import type { AudioSnapshot } from "./audio-reactive";
import type { EnhancedFrameData } from "../data/types";

export interface StemCharacter {
  /** Dominant musician driving the visual character */
  dominant: "jerry" | "phil" | "drums" | "bobby" | "vocals" | "ensemble";
  /** Hue shift in degrees: Jerry=+60 (golden hour), Phil=-40 (indigo), drums=+15 (amber) */
  hueShift: number;
  /** Saturation modifier: 0.9-1.3 */
  saturationMult: number;
  /** Brightness offset: -0.05 to +0.08 */
  brightnessOffset: number;
  /** Color temperature shift: -1 (cool/Phil) to +1 (warm/Jerry) */
  temperature: number;
  /** Overlay density multiplier: Phil=0.8 (sparse depth), drums=1.2 (dense) */
  overlayDensityMult: number;
  /** Camera motion multiplier: vocals=0.6 (intimate), drums=1.3 (primal) */
  motionMult: number;
  /** Confidence 0-1: how clearly one musician dominates the mix */
  confidence: number;
}

/**
 * Compute the visual character from stem analysis.
 *
 * Decision tree:
 *   1. Vocals singing? → vocal warmth mode
 *   2. Other (guitar) dominant + high centroid? → Jerry golden
 *   3. Other (guitar) dominant + low centroid? → Bobby grounded
 *   4. Bass dominant? → Phil cosmic depth
 *   5. Drums dominant? → tribal pulse
 *   6. Balanced → ensemble mode (neutral)
 */
export function computeStemCharacter(snapshot: AudioSnapshot): StemCharacter {
  const vocal = snapshot.vocalEnergy;
  const guitar = snapshot.otherEnergy;
  const bass = snapshot.bass;
  const drums = snapshot.drumOnset;
  const centroid = snapshot.otherCentroid;
  const vocalPresence = snapshot.vocalPresence;

  const total = vocal + guitar + bass + drums;
  if (total < 0.05) {
    return neutralCharacter();
  }

  // Vocal dominance check first (singing overrides instrument character)
  if (vocalPresence > 0.5 && vocal > 0.15) {
    const conf = Math.min(1, vocalPresence * vocal * 3);
    return {
      dominant: "vocals",
      hueShift: 20 * conf,          // warm golden
      saturationMult: 1 + 0.10 * conf,
      brightnessOffset: 0.04 * conf,
      temperature: 0.5 * conf,      // warm
      overlayDensityMult: 1,
      motionMult: 1 - 0.4 * conf,   // intimate, less shake
      confidence: conf,
    };
  }

  // Compute dominance ratios
  const guitarRatio = guitar / total;
  const bassRatio = bass / total;
  const drumRatio = drums / total;

  // Jerry: high guitar energy + high centroid (soaring leads)
  if (guitarRatio > 0.35 && centroid > 0.5) {
    const jerryConf = Math.min(1, guitarRatio * centroid * 3);
    return {
      dominant: "jerry",
      hueShift: 60 * jerryConf,         // GOLDEN HOUR: drench in warm amber
      saturationMult: 1 + 0.40 * jerryConf,  // vivid golden during Jerry leads
      brightnessOffset: 0.08 * jerryConf,     // brighter glow
      temperature: 1.0 * jerryConf,     // maximum warm
      overlayDensityMult: 0.9,          // let the shader glow
      motionMult: 1 + 0.15 * jerryConf, // fluid, floating
      confidence: jerryConf,
    };
  }

  // Bobby: guitar energy + low centroid (rhythm chords)
  if (guitarRatio > 0.35 && centroid <= 0.5) {
    const bobbyConf = Math.min(1, guitarRatio * (1 - centroid) * 2.5);
    return {
      dominant: "bobby",
      hueShift: 12 * bobbyConf,         // amber warmth
      saturationMult: 1 + 0.05 * bobbyConf,
      brightnessOffset: 0.02 * bobbyConf,
      temperature: 0.3 * bobbyConf,     // warm but grounded
      overlayDensityMult: 1.05,         // steady texture
      motionMult: 1 - 0.1 * bobbyConf,  // steady, driving
      confidence: bobbyConf,
    };
  }

  // Phil: bass dominance → cosmic depth
  if (bassRatio > 0.35) {
    const philConf = Math.min(1, bassRatio * bass * 4);
    return {
      dominant: "phil",
      hueShift: -40 * philConf,          // indigo/violet
      saturationMult: 1 + 0.15 * philConf, // deep saturated
      brightnessOffset: -0.03 * philConf,   // darker depth
      temperature: -0.6 * philConf,      // cool cosmic blue
      overlayDensityMult: 0.8,           // sparse, deep
      motionMult: 1 + 0.1 * philConf,   // slow undulation
      confidence: philConf,
    };
  }

  // Drums: drum dominance → tribal pulse
  if (drumRatio > 0.35) {
    const drumConf = Math.min(1, drumRatio * drums * 4);
    return {
      dominant: "drums",
      hueShift: 15 * drumConf,           // warm amber/earth
      saturationMult: 1 + 0.08 * drumConf,
      brightnessOffset: 0.03 * drumConf,
      temperature: 0.4 * drumConf,       // warm earth
      overlayDensityMult: 1.2,           // dense, tribal
      motionMult: 1 + 0.3 * drumConf,   // energetic, primal
      confidence: drumConf,
    };
  }

  return neutralCharacter();
}

function neutralCharacter(): StemCharacter {
  return {
    dominant: "ensemble",
    hueShift: 0,
    saturationMult: 1,
    brightnessOffset: 0,
    temperature: 0,
    overlayDensityMult: 1,
    motionMult: 1,
    confidence: 0,
  };
}

/**
 * Detect sustained stem dominance over a window.
 * Returns the fraction of frames where each stem dominated.
 */
export function computeSustainedDominance(
  frames: EnhancedFrameData[],
  idx: number,
  window = 30,
): { dominant: string; fraction: number } {
  if (frames.length === 0) return { dominant: "ensemble", fraction: 0 };

  const counts: Record<string, number> = {};
  let total = 0;

  for (let i = Math.max(0, idx - window); i <= idx && i < frames.length; i++) {
    const f = frames[i];
    const vocal = f.stemVocalRms ?? 0;
    const guitar = f.stemOtherRms ?? 0;
    const bass = f.stemBassRms ?? 0;
    const drums = f.stemDrumOnset ?? 0;
    const sum = vocal + guitar + bass + drums;
    if (sum < 0.05) continue;

    const guitarRatio = guitar / sum;
    const bassRatio = bass / sum;
    const drumRatio = drums / sum;

    let dom = "ensemble";
    if (vocal > 0.15) dom = "vocals";
    else if (guitarRatio > 0.35) dom = "guitar";
    else if (bassRatio > 0.35) dom = "phil";
    else if (drumRatio > 0.35) dom = "drums";

    counts[dom] = (counts[dom] ?? 0) + 1;
    total++;
  }

  if (total === 0) return { dominant: "ensemble", fraction: 0 };

  let best = "ensemble";
  let bestCount = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > bestCount) { best = k; bestCount = v; }
  }

  return { dominant: best, fraction: bestCount / total };
}
