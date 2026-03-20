/**
 * Overlay Rotation Engine — temporal overlay management.
 *
 * Tuned for the Dead's visual philosophy: restraint during quiet passages,
 * visual silence before peaks, full flood at climax. The music leads.
 *
 * Key design principles:
 *   - 5x dynamic range: quiet passages have gentle presence, peaks flood vivid
 *   - Pre-peak dropout: strip to 1 overlay before climax → contrast without void
 *   - Energy-scaled crossfades: organic in Space (15s), snappy at peaks (4s)
 *   - Overlay count range: 2-3 during quiet, 4-5 at climax
 *   - Accent overlays: Dead iconography pulses on beats at ALL energy levels
 *   - Always alive: even silence has a faint atmospheric wash
 *
 * Two exports:
 *   buildRotationSchedule() — called once per song via useMemo
 *   getOverlayOpacities()   — called every frame, returns per-overlay opacity 0-1
 *
 * Deterministic: seeded PRNG keyed on trackId + windowIndex.
 */
import { Easing } from "remotion";
import type { SectionBoundary, OverlayEntry, EnhancedFrameData, OverlayPhaseHint } from "./types";
import { OVERLAY_REGISTRY, OVERLAY_BY_NAME, ALWAYS_ACTIVE } from "./overlay-registry";
import { computeSmoothedEnergy } from "../utils/energy";
import type { EnergyCalibration } from "../utils/energy";
import { detectTexture } from "../utils/climax-state";
import { computeAudioSnapshot } from "../utils/audio-reactive";
import { seededLCG as seededRandom } from "../utils/seededRandom";
import { hashString } from "../utils/hash";
import { getEraPreset } from "./era-presets";
import { BAND_CONFIG } from "./band-config";
import type { SongIdentity } from "./song-identities";
import type { ShowArcModifiers } from "./show-arc";
import type { DrumsSpaceSubPhase } from "../utils/drums-space-phase";
import { DRUMS_SPACE_TREATMENTS } from "../utils/drums-space-phase";
import type { StemSectionType } from "../utils/stem-features";
import { buildWindowsFromSections, markDropoutWindows } from "./overlay-windows";
import { scoreOverlayForWindow, type ScoringContext } from "./overlay-scoring";
import { selectOverlaysForWindow, HERO_OVERLAY_NAMES as _HERO_OVERLAY_NAMES } from "./overlay-selection";

// Eased crossfade function: replaces linear smoothstep with Remotion's
// Easing.inOut(Easing.ease) for more organic overlay transitions.
// Fallback to cubic smoothstep if Remotion Easing isn't available (vitest).
const easedCrossfade = (() => {
  try {
    const fn = Easing.inOut(Easing.ease);
    if (typeof fn === "function") return fn;
  } catch { /* vitest environment */ }
  return (t: number) => t * t * (3 - 2 * t); // smoothstep fallback
})();
function smoothstepEased(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return easedCrossfade(t);
}

// ─── Types ───

export interface RotationWindow {
  /** First frame of this window (inclusive) */
  frameStart: number;
  /** Last frame of this window (exclusive) */
  frameEnd: number;
  /** Overlay names active during this window */
  overlays: string[];
  /** Energy level for this window (inherited from section) */
  energy: "low" | "mid" | "high";
  /** Whether this window is a pre-peak dropout (visual silence before climax) */
  isDropout?: boolean;
}

export interface RotationSchedule {
  /** Overlays that are always at opacity 1 (e.g., ConcertInfo, SongTitle, FilmGrain) */
  alwaysActive: string[];
  /** Time windows with their assigned overlays */
  windows: RotationWindow[];
  /** Accent overlays per window — flash on onset peaks instead of steady rotation */
  accentOverlays: Map<number, string[]>;
}

// ─── Accent Overlay Types & Constants ───

export interface AccentConfig {
  /** Onset strength threshold to trigger a flash */
  onsetThreshold: number;
  /** Peak opacity when triggered */
  peakOpacity: number;
  /** Frames to decay from peak to 0 */
  decayFrames: number;
}

/**
 * Overlays eligible for accent (beat-synced flash) treatment.
 * Sourced from BandConfig for portability.
 */
const ACCENT_ELIGIBLE = new Set(BAND_CONFIG.accentEligibleOverlays);

/** Energy-dependent accent tuning */
const ACCENT_CONFIG: Record<string, AccentConfig | null> = {
  high: { onsetThreshold: 0.25, peakOpacity: 0.75, decayFrames: 20 },
  mid:  { onsetThreshold: 0.35, peakOpacity: 0.60, decayFrames: 15 },
  low:  { onsetThreshold: 0.45, peakOpacity: 0.40, decayFrames: 10 },
};

// ─── Constants ───

/**
 * Crossfade duration at window boundaries, energy-scaled.
 * Quiet transitions are glacial (20s). Peak transitions are snappy (6s).
 * Matches the tempo of the music's own dynamics.
 */
const CROSSFADE_FRAMES_BY_ENERGY: Record<string, number> = {
  low:  150,   // 5 seconds — organic tides
  mid:  90,    // 3 seconds — snappy transitions
  high: 45,    // 1.5 seconds — fast crossfade at peaks
};
const CROSSFADE_FRAMES_DEFAULT = 120;

/**
 * Overlay count ranges by section energy.
 * Quiet = 1-2 (gentle wash — always alive), peak = 3-5 (vivid but brief flood).
 * Dynamic range between quiet and peak creates the show's breathing rhythm.
 */
/**
 * Base overlay count per rotation window. The rotation engine adjusts upward
 * based on duty cycle metadata — if selected overlays have low duty cycles
 * (internal cycling), more are picked to ensure ~3 are visible at any frame.
 * Always-on heroes are prioritized first for guaranteed visibility.
 *
 * Density inverted at peaks: pre-peak dropout strips to void, then the climax
 * floods in with maximum visual density (A-tier only). The contrast between
 * dropout silence and peak flood creates the show's visceral impact.
 */
const ENERGY_COUNTS: Record<string, { min: number; max: number }> = {
  low:  { min: 1,  max: 2 },   // quiet: gentle wash with optional second layer
  mid:  { min: 2,  max: 3 },   // moderate: two or three for texture depth
  high: { min: 3,  max: 5 },   // peaks: flood with A-tier overlays after dropout void
};

/** A-tier overlays: the only overlays allowed during peaks (high energy).
 *  Iconic Dead imagery that earns its moment — screen blend, low opacity.
 *  Derived from registry tier field (no drift from hardcoded names). */
export const A_TIER_OVERLAY_NAMES = new Set(
  OVERLAY_REGISTRY.filter((e) => e.tier === "A" && !e.alwaysActive).map((e) => e.name),
);

/** Re-export from overlay-selection for backwards compatibility */
export const HERO_OVERLAY_NAMES = _HERO_OVERLAY_NAMES;

/**
 * Pre-peak dropout: overlay count cap for the window immediately before a
 * higher-energy section. Strips the visual field to complete void so the
 * peak floods in with maximum contrast.
 */
const DROPOUT_MAX_OVERLAYS = 0;

/** Parse set number from trackId format "s{set}t{track}" */
function parseSetNumber(trackId: string): number {
  const match = trackId.match(/^s(\d+)t/);
  return match ? parseInt(match[1], 10) : 1;
}

// ─── Schedule Builder ───

/**
 * Build a rotation schedule from the active overlay pool + section data.
 * Called once per song via useMemo.
 * @param showSeed — Show-level seed to salt the PRNG (same track, different show = different rotation)
 */
export function buildRotationSchedule(
  activeOverlays: string[],
  sections: SectionBoundary[],
  trackId: string,
  showSeed?: number,
  frames?: EnhancedFrameData[],
  isDrumsSpace?: boolean,
  energyHints?: Record<string, OverlayPhaseHint>,
  era?: string,
  mode?: string,
  songIdentity?: SongIdentity,
  showArcModifiers?: ShowArcModifiers,
  drumsSpacePhase?: DrumsSpaceSubPhase,
  stemSectionType?: StemSectionType,
  /** Songs completed so far in the show (for fatigue-aware rotation timing) */
  songsCompleted?: number,
): RotationSchedule {
  const trackHash = hashString(trackId) + (showSeed ?? 0);

  // Fatigue-aware rotation: after 60+ minutes (~8 songs), slow rotation by up to 40%
  // to reduce perceived overlay repetition in the back half of the show.
  // Early show: windowScale = 1.0 (normal speed). Late show: windowScale = 1.4 (40% longer windows).
  const showProgress = songsCompleted != null ? Math.min(1, songsCompleted / 20) : 0;
  const windowDurationScale = 1.0 + showProgress * 0.4; // 1.0 → 1.4

  // 1. Separate always-active from rotation pool
  const alwaysActiveSet = new Set(ALWAYS_ACTIVE);
  const alwaysActive = activeOverlays.filter((name) => alwaysActiveSet.has(name));
  const rotationPool = activeOverlays.filter((name) => !alwaysActiveSet.has(name));

  // If no sections or no rotation pool, return trivial schedule
  if (sections.length === 0 || rotationPool.length === 0) {
    return { alwaysActive, windows: [], accentOverlays: new Map() };
  }

  // Per-song visual mode: detect overall energy character from sections
  // Quiet songs (mostly low/mid sections) get reduced overlay counts
  const highSections = sections.filter((s) => s.energy === "high").length;
  const highRatio = highSections / sections.length;
  // 0 = all quiet, 1 = all high-energy. Songs < 20% high sections are "contemplative"
  const songIntensity = Math.min(1, highRatio / 0.5); // 0-1 scale

  // 2. Build overlay entries for scoring (with layer info)
  const allPoolEntries: OverlayEntry[] = [];
  for (const name of rotationPool) {
    const entry = OVERLAY_BY_NAME.get(name);
    if (entry) allPoolEntries.push(entry);
  }

  // Filter by era: remove overlays excluded by the current era preset
  const eraPreset = era ? getEraPreset(era) : null;
  const eraExcluded = eraPreset ? new Set(eraPreset.excludedOverlays) : null;
  const poolEntries = eraExcluded
    ? allPoolEntries.filter((e) => !eraExcluded.has(e.name))
    : allPoolEntries;

  // 3. Build windows from sections + mark dropout windows
  const windows = buildWindowsFromSections(sections, windowDurationScale);
  markDropoutWindows(windows);

  // 4. Select overlays per window
  let previousWindowOverlays = new Set<string>();
  let previousWindowFrames = 0;
  let previousWindowEnergy: string | null = null;
  const setNumber = parseSetNumber(trackId);

  for (let wi = 0; wi < windows.length; wi++) {
    const window = windows[wi];
    const windowFrames = window.frameEnd - window.frameStart;
    const rng = seededRandom(trackHash + wi * 7919); // unique seed per window

    const energyRange = ENERGY_COUNTS[window.energy] ?? ENERGY_COUNTS.mid;
    let targetCount = energyRange.min + Math.floor(rng() * (energyRange.max - energyRange.min + 1));

    // Texture-aware count adjustment: sample midpoint audio
    let windowTexture: string | null = null;
    if (frames && frames.length > 0) {
      const midFrame = Math.min(
        Math.floor((window.frameStart + window.frameEnd) / 2),
        frames.length - 1,
      );
      const midSnapshot = computeAudioSnapshot(frames, midFrame);
      const midEnergy = computeSmoothedEnergy(frames, midFrame);
      windowTexture = detectTexture(midSnapshot, midEnergy);
      if (windowTexture === "peak") {
        targetCount += 1;
      }
    }

    // Song identity overlay density multiplier
    if (songIdentity?.overlayDensity) {
      targetCount = Math.round(targetCount * songIdentity.overlayDensity);
    }

    // Show arc density multiplier
    if (showArcModifiers?.densityMult) {
      targetCount = Math.round(targetCount * showArcModifiers.densityMult);
    }

    // Pre-peak dropout: strip to complete void before the climax
    if (window.isDropout) {
      targetCount = Math.min(targetCount, DROPOUT_MAX_OVERLAYS);
    }

    // Drums/Space: use per-phase overlay cap from treatment constants
    if (isDrumsSpace) {
      const dsMaxOverlays = drumsSpacePhase
        ? DRUMS_SPACE_TREATMENTS[drumsSpacePhase]?.maxOverlays ?? 1
        : 1;
      targetCount = Math.min(targetCount, dsMaxOverlays);
    }

    // Stem section modulation: adjust overlay density by what the band is doing
    if (stemSectionType === "vocal") {
      targetCount = Math.max(0, targetCount - 1);
    } else if (stemSectionType === "solo") {
      targetCount = Math.min(targetCount, 1);
    } else if (stemSectionType === "quiet") {
      targetCount = Math.max(0, targetCount - 2);
    } else if (stemSectionType === "jam") {
      targetCount = Math.min(targetCount + 1, poolEntries.length);
    }

    // Cap at pool size
    targetCount = Math.min(targetCount, poolEntries.length);

    // At high energy, only A-tier overlays are eligible (iconic Dead imagery)
    const effectivePool = window.energy === "high"
      ? poolEntries.filter((e) => A_TIER_OVERLAY_NAMES.has(e.name))
      : poolEntries;

    // Score each overlay for this window via extracted scoring module
    const scoringCtx: ScoringContext = {
      windowEnergy: window.energy,
      windowTexture,
      isDropout: window.isDropout ?? false,
      previousWindowOverlays,
      previousWindowFrames,
      previousWindowEnergy,
      setNumber,
      isDrumsSpace: isDrumsSpace ?? false,
      stemSectionType,
      mode,
      songIdentity,
      showArcModifiers,
      energyHints,
    };
    const scored = effectivePool
      .map((entry) => ({ entry, score: scoreOverlayForWindow(entry, scoringCtx, rng) }))
      .sort((a, b) => b.score - a.score);

    // Select overlays via extracted selection module (hero guarantee + diversity)
    const selected = selectOverlaysForWindow(scored, targetCount, isDrumsSpace ?? false, window.isDropout ?? false, poolEntries);

    window.overlays = selected.map((e) => e.name);
    previousWindowOverlays = new Set(selected.map((e) => e.name));
    previousWindowFrames = windowFrames;
    previousWindowEnergy = window.energy;
  }

  // 6. Accent selection — pull eligible overlays out of rotation into accent map
  const accentOverlays = new Map<number, string[]>();

  for (let wi = 0; wi < windows.length; wi++) {
    const window = windows[wi];
    const config = ACCENT_CONFIG[window.energy];
    if (!config) continue; // no accents for this energy level

    // No accents in dropout windows — they should be silent
    if (window.isDropout) continue;

    // Find accent-eligible overlays in this window's rotation list
    const eligible = window.overlays.filter((name) => ACCENT_ELIGIBLE.has(name));
    if (eligible.length === 0) continue;

    // Pick 1-2 (mid) or 2-3 (high) using offset seed
    const accentRng = seededRandom(trackHash + wi * 7919 + 31337);
    const pickCount = window.energy === "high"
      ? Math.min(2 + (accentRng() < 0.4 ? 1 : 0), eligible.length)
      : Math.min(1 + (accentRng() < 0.3 ? 1 : 0), eligible.length);

    // Shuffle eligible deterministically, take pickCount
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(accentRng() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    const picked = eligible.slice(0, pickCount);

    // Keep accent overlays in regular rotation — they maintain steady presence
    // AND get beat-synced brightness flashes on top. Removing them left windows
    // empty (hero was the only overlay → accent pulled it → 0 visible overlays).
    accentOverlays.set(wi, picked);
  }

  return { alwaysActive, windows, accentOverlays };
}

// ─── Overlay Manifest (for debugging and render logging) ───

export interface OverlayManifestEntry {
  windowIndex: number;
  frameStart: number;
  frameEnd: number;
  energy: string;
  overlays: string[];
  accents: string[];
  isDropout: boolean;
}

/** Generate a JSON-serializable manifest of which overlays were selected per window.
 *  Useful for debugging overlay selection and creating per-render logs.
 */
export function buildOverlayManifest(schedule: RotationSchedule): OverlayManifestEntry[] {
  return schedule.windows.map((w, i) => ({
    windowIndex: i,
    frameStart: w.frameStart,
    frameEnd: w.frameEnd,
    energy: w.energy,
    overlays: w.overlays,
    accents: schedule.accentOverlays.get(i) ?? [],
    isDropout: w.isDropout ?? false,
  }));
}

// ─── Per-Frame Opacity Calculator ───

/**
 * Binary-search the window list for the window containing `frame`.
 * Returns the index, or -1 if out of range.
 */
function findWindow(windows: RotationWindow[], frame: number): number {
  let lo = 0;
  let hi = windows.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const w = windows[mid];
    if (frame < w.frameStart) {
      hi = mid - 1;
    } else if (frame >= w.frameEnd) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }
  return -1;
}

/**
 * Get the crossfade duration for a window boundary, based on the
 * energy of both adjacent windows. Uses the slower (longer) of the two
 * to ensure transitions feel organic.
 */
function getCrossfadeFrames(energyA: string, energyB: string): number {
  const framesA = CROSSFADE_FRAMES_BY_ENERGY[energyA] ?? CROSSFADE_FRAMES_DEFAULT;
  const framesB = CROSSFADE_FRAMES_BY_ENERGY[energyB] ?? CROSSFADE_FRAMES_DEFAULT;
  // Use the average — biased toward the slower side for organic feel
  return Math.round((framesA + framesB) / 2);
}

/**
 * Compute per-overlay opacity for a given frame.
 * Called every frame during rendering.
 *
 * - Always-active overlays: fixed at 1.0
 * - Rotation pool overlays: 0 or 1, with energy-scaled smoothstep crossfades
 * - Overlays present in consecutive windows stay at 1.0 through the transition
 * - Accent overlays: flash on onset peaks with inverse smoothstep decay
 * - Energy breathing: real-time opacity modulation (10%–100%) on top of rotation
 */
export function getOverlayOpacities(
  frame: number,
  schedule: RotationSchedule,
  frames?: EnhancedFrameData[],
  calibration?: EnergyCalibration,
): Record<string, number> {
  const result: Record<string, number> = {};

  // Always-active at 1.0
  for (const name of schedule.alwaysActive) {
    result[name] = 1;
  }

  const { windows } = schedule;
  if (windows.length === 0) return result;

  const wi = findWindow(windows, frame);
  if (wi === -1) return result; // frame outside all windows

  const currentWindow = windows[wi];
  const currentSet = new Set(currentWindow.overlays);

  // Energy-scaled crossfade duration for this boundary region
  const prevWindow = wi > 0 ? windows[wi - 1] : null;
  const nextWindow = wi < windows.length - 1 ? windows[wi + 1] : null;

  const fadeInFrames = prevWindow
    ? getCrossfadeFrames(prevWindow.energy, currentWindow.energy)
    : CROSSFADE_FRAMES_DEFAULT;
  const fadeOutFrames = nextWindow
    ? getCrossfadeFrames(currentWindow.energy, nextWindow.energy)
    : CROSSFADE_FRAMES_DEFAULT;

  // Check if we're in a crossfade zone
  const distFromStart = frame - currentWindow.frameStart;
  const distFromEnd = currentWindow.frameEnd - 1 - frame;
  const windowLen = currentWindow.frameEnd - currentWindow.frameStart;

  // Clamp crossfade to fit within the window — if the window is shorter than
  // the combined half-fades, scale them down proportionally so overlays still
  // reach full opacity mid-window.
  let halfFadeIn = fadeInFrames / 2;
  let halfFadeOut = fadeOutFrames / 2;
  if (halfFadeIn + halfFadeOut > windowLen) {
    const scale = windowLen / (halfFadeIn + halfFadeOut);
    halfFadeIn *= scale;
    halfFadeOut *= scale;
  }

  // Fade-in zone: first halfFadeIn of window (if there's a previous window)
  const inFadeIn = wi > 0 && distFromStart < halfFadeIn;
  // Fade-out zone: last halfFadeOut of window (if there's a next window)
  const inFadeOut = wi < windows.length - 1 && distFromEnd < halfFadeOut;

  const prevSet = prevWindow ? new Set(prevWindow.overlays) : new Set<string>();
  const nextSet = nextWindow ? new Set(nextWindow.overlays) : new Set<string>();

  // Compute opacity for each overlay in the current window.
  for (const name of currentWindow.overlays) {
    let opacity = 1;

    if (inFadeIn && !prevSet.has(name)) {
      // This overlay is new (not in prev window) — crossfade centered on start boundary
      const boundary = currentWindow.frameStart;
      opacity = smoothstepEased(boundary - halfFadeIn, boundary + halfFadeIn, frame);
    }
    if (inFadeOut && !nextSet.has(name)) {
      // This overlay is leaving (not in next window) — crossfade centered on end boundary
      const boundary = currentWindow.frameEnd;
      const fadeOutOpacity = 1 - smoothstepEased(boundary - halfFadeOut, boundary + halfFadeOut, frame);
      opacity = Math.min(opacity, fadeOutOpacity);
    }

    result[name] = opacity;
  }

  // Handle outgoing overlays from previous window during fade-in zone
  if (inFadeIn && prevWindow) {
    const boundary = currentWindow.frameStart;
    for (const name of prevWindow.overlays) {
      if (!currentSet.has(name) && result[name] === undefined) {
        result[name] = 1 - smoothstepEased(boundary - halfFadeIn, boundary + halfFadeIn, frame);
      }
    }
  }

  // Handle incoming overlays from next window during fade-out zone
  if (inFadeOut && nextWindow) {
    const boundary = currentWindow.frameEnd;
    for (const name of nextWindow.overlays) {
      if (!currentSet.has(name) && result[name] === undefined) {
        result[name] = smoothstepEased(boundary - halfFadeOut, boundary + halfFadeOut, frame);
      }
    }
  }

  // ─── Accent overlays: onset-driven flash + decay ───
  const accentNames = schedule.accentOverlays.get(wi);
  if (accentNames && frames && frames.length > 0) {
    const config = ACCENT_CONFIG[currentWindow.energy];
    if (config) {
      for (const name of accentNames) {
        let accentOpacity = 0;
        // Scan backward up to decayFrames to find most recent onset above threshold
        for (let f = frame; f >= Math.max(0, frame - config.decayFrames); f--) {
          if (f < frames.length && frames[f].onset > config.onsetThreshold) {
            const age = frame - f;
            const t = Math.min(1, age / config.decayFrames);
            // Inverse smoothstep: peak at t=0, zero at t=1
            accentOpacity = config.peakOpacity * (1 - t * t * (3 - 2 * t));
            break;
          }
        }
        // Accent boosts on top of regular rotation opacity — use max, not replace
        result[name] = Math.max(result[name] ?? 0, accentOpacity);
      }
    }
  }

  // ─── Energy response curves: continuous per-overlay modulation ───
  // Floor raised from 0.3 → 0.5 and sqrt-smoothed to eliminate strobe pulsation.
  // Old range 30-100% caused visible flicker on every transient; new range 50-100%
  // maintains responsiveness without jarring per-frame opacity swings.
  if (frames && frames.length > 0) {
    const frameIdx = Math.min(frame, frames.length - 1);
    const energy = computeSmoothedEnergy(frames, frameIdx);
    for (const name of Object.keys(result)) {
      const entry = OVERLAY_BY_NAME.get(name);
      if (!entry?.energyResponse) continue;
      const [threshold, peak, falloff] = entry.energyResponse;
      let response: number;
      if (energy <= threshold) {
        response = 0;
      } else if (energy <= peak) {
        // Ramp up: smoothstep from threshold to peak
        const t = (energy - threshold) / (peak - threshold);
        response = t * t * (3 - 2 * t);
      } else {
        // Falloff above peak
        const overshoot = (energy - peak) * falloff;
        response = Math.max(0.3, 1 - overshoot);
      }
      // Sqrt smoothing compresses the response curve, reducing transient spikes
      const smoothedResponse = Math.sqrt(response);
      result[name] = (result[name] ?? 0) * (0.5 + smoothedResponse * 0.5);
    }
  }

  // ─── Silence breathing: progressive overlay withdrawal during sustained quiet ───
  // Uses a wide ramp (50%-100% of window) to prevent boundary flicker.
  // The smoothstep easing ensures organic fade rather than binary on/off.
  if (frames && frames.length > 0) {
    const frameIdx = Math.min(frame, frames.length - 1);
    const QUIET_THRESHOLD = 0.03;
    const QUIET_WINDOW = 90; // 3 seconds at 30fps
    let quietFrames = 0;
    for (let f = Math.max(0, frameIdx - QUIET_WINDOW); f <= frameIdx; f++) {
      if (frames[f].rms < QUIET_THRESHOLD) quietFrames++;
    }
    const quietRatio = quietFrames / QUIET_WINDOW;
    // Smoothstep ramp from 50% to 100% quiet — gradual onset, no boundary flicker
    if (quietRatio > 0.5) {
      const t = Math.min(1, (quietRatio - 0.5) / 0.5);
      const eased = t * t * (3 - 2 * t); // smoothstep
      const withdrawMult = 1 - eased * 0.6; // 1.0 → 0.4
      for (const name of Object.keys(result)) {
        if (schedule.alwaysActive.includes(name)) continue;
        result[name] = (result[name] ?? 0) * Math.max(0.1, withdrawMult);
      }
    }
  }

  // ─── Beat anticipation builds: smoothed opacity boost during energy ramps ───
  // Uses 5-frame smoothed energy slope to avoid single-frame jitter.
  if (frames && frame > 8 && frame < frames.length - 1) {
    const frameIdx = Math.min(frame, frames.length - 1);
    // Compute smoothed energy over 3-frame windows for stable slope detection
    const avg = (a: number, b: number, c: number) => (a + b + c) / 3;
    const e_early = avg(
      frames[Math.max(0, frameIdx - 5)]?.rms ?? 0,
      frames[Math.max(0, frameIdx - 4)]?.rms ?? 0,
      frames[Math.max(0, frameIdx - 3)]?.rms ?? 0,
    );
    const e_late = avg(
      frames[Math.max(0, frameIdx - 1)]?.rms ?? 0,
      frames[frameIdx]?.rms ?? 0,
      frames[Math.min(frames.length - 1, frameIdx + 1)]?.rms ?? 0,
    );
    const slope = e_late - e_early;
    if (slope > 0.06) {
      // Smoothstep the boost for frame-coherent transitions
      const rawBoost = Math.min(0.10, slope * 0.5);
      const t = Math.min(1, (slope - 0.06) / 0.12);
      const anticipationBoost = rawBoost * t * t * (3 - 2 * t);
      for (const name of Object.keys(result)) {
        result[name] = Math.min(1, (result[name] ?? 0) + anticipationBoost);
      }
    }
  }

  return result;
}
