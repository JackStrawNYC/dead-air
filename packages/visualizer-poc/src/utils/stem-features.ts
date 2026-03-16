/**
 * Stem-Derived Features — pure functions operating on AudioSnapshot.
 *
 * These classify musical sections and detect solos/vocals using
 * stem-separated audio features. All functions are deterministic
 * and side-effect-free — suitable for per-frame computation.
 *
 * When stem data is unavailable, features gracefully degrade using
 * fallback values already set in AudioSnapshot (e.g., otherEnergy
 * falls back to (mid+high)/2).
 */

import type { AudioSnapshot } from "./audio-reactive";

// ─── Section Classification ───

export type StemSectionType = "vocal" | "instrumental" | "solo" | "jam" | "quiet";

/**
 * Classify the current musical section based on stem-derived features.
 * Priority order: quiet → vocal → solo → instrumental → jam (default).
 */
export function classifyStemSection(snapshot: AudioSnapshot): StemSectionType {
  // Quiet: very low overall energy
  if (snapshot.energy < 0.08) return "quiet";

  // Vocal: singing detected with meaningful vocal energy
  if (snapshot.vocalPresence > 0.5 && snapshot.vocalEnergy > 0.15) return "vocal";

  // Solo: high other energy, no vocals, meaningful overall energy
  if (snapshot.otherEnergy > 0.3 && snapshot.vocalPresence < 0.2 && snapshot.energy > 0.15) return "solo";

  // Instrumental: playing without singing
  if (snapshot.energy > 0.1 && snapshot.vocalPresence < 0.3) return "instrumental";

  // Jam: everything else (band playing, mixed activity)
  return "jam";
}

// ─── Solo Detection ───

export interface SoloState {
  isSolo: boolean;
  intensity: number;
  instrument: "guitar" | "bass" | "none";
}

/**
 * Detect whether a solo is happening and which instrument is leading.
 * Guitar solo: high otherEnergy + high centroid (>0.5) + no vocals.
 * Bass solo: high bass (>0.35) + low otherEnergy + no vocals.
 */
export function detectSolo(snapshot: AudioSnapshot): SoloState {
  const noVocals = snapshot.vocalPresence < 0.2;

  // Guitar solo: Jerry soaring — high other energy with bright centroid
  if (noVocals && snapshot.otherEnergy > 0.25 && snapshot.otherCentroid > 0.5) {
    const intensity = Math.min(1, snapshot.otherEnergy * snapshot.otherCentroid * 3);
    return { isSolo: true, intensity, instrument: "guitar" };
  }

  // Bass solo: Phil leading — high bass, low other energy
  if (noVocals && snapshot.bass > 0.35 && snapshot.otherEnergy < 0.2) {
    const intensity = Math.min(1, snapshot.bass * 2);
    return { isSolo: true, intensity, instrument: "bass" };
  }

  return { isSolo: false, intensity: 0, instrument: "none" };
}

// ─── Vocal Warmth ───

/**
 * Compute vocal warmth factor (0-1).
 * When someone is singing, the visual palette shifts warm.
 * Combines presence (is singing happening?) with energy (how loud?).
 */
export function computeVocalWarmth(snapshot: AudioSnapshot): number {
  return Math.min(1, snapshot.vocalPresence * snapshot.vocalEnergy * 4);
}

// ─── Guitar Color Temperature ───

/**
 * Compute guitar color temperature (-1 cool to +1 warm).
 * Maps the other stem's spectral centroid to a color temperature,
 * scaled by energy so silent moments stay neutral.
 *
 * High centroid (Jerry soaring high on the neck) = warm gold (+1)
 * Low centroid (Bobby's rhythm chords) = cool blue (-1)
 */
export function computeGuitarColorTemp(snapshot: AudioSnapshot): number {
  // Map centroid 0-1 to -1..+1 (0.5 is neutral)
  const tempRaw = (snapshot.otherCentroid - 0.5) * 2;
  // Scale by energy so silence = neutral
  return tempRaw * Math.min(1, snapshot.otherEnergy * 3);
}

// ─── Instrument Balance ───

export interface InstrumentBalance {
  dominant: "vocals" | "guitar" | "bass" | "drums" | "balanced";
  /** Ratio of dominant instrument to total (0-1) */
  ratio: number;
}

/**
 * Determine which instrument is currently dominant.
 * Compares stem energies to find the loudest voice in the mix.
 */
export function computeInstrumentBalance(snapshot: AudioSnapshot): InstrumentBalance {
  const vocals = snapshot.vocalEnergy;
  const other = snapshot.otherEnergy;
  const bass = snapshot.bass;
  const drums = snapshot.drumOnset;

  const total = vocals + other + bass + drums;
  if (total < 0.05) return { dominant: "balanced", ratio: 0 };

  const entries: [string, number][] = [
    ["vocals", vocals],
    ["guitar", other],
    ["bass", bass],
    ["drums", drums],
  ];
  entries.sort((a, b) => b[1] - a[1]);

  const [topName, topVal] = entries[0];
  const ratio = topVal / total;

  // Need >40% dominance to call it
  if (ratio < 0.4) return { dominant: "balanced", ratio };

  return { dominant: topName as InstrumentBalance["dominant"], ratio };
}
