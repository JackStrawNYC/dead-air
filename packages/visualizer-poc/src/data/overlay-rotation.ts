/**
 * Overlay Rotation Engine — temporal overlay management.
 *
 * Instead of rendering all ~45 selected overlays simultaneously for an entire song,
 * this module rotates 2-7 overlays at any moment based on musical sections and energy.
 *
 * Two exports:
 *   buildRotationSchedule() — called once per song via useMemo
 *   getOverlayOpacities()   — called every frame, returns per-overlay opacity 0-1
 *
 * Deterministic: seeded PRNG keyed on trackId + windowIndex.
 */
import type { SectionBoundary, OverlayEntry, EnhancedFrameData } from "./types";
import { OVERLAY_BY_NAME, ALWAYS_ACTIVE } from "./overlay-registry";

// ─── Deterministic PRNG (same pattern as overlay-selector.ts) ───

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
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

/** High-energy overlays eligible for accent (strobe-on-beat) treatment */
const ACCENT_ELIGIBLE = new Set([
  "ChromaticAberration",
  "PixelExplosion",
  "ParticleExplosion",
  "WallOfSound",
  "LaserShow",
  "PlasmaBall",
  "StageLights",
  "SolarFlare",
  "Supernova",
  "PhoenixWings",
  "Pyrotechnics",
  "FilmBurn",
  "TeslaCoil",
  "LiquidMetal",
  "ThirteenPointBolt",
]);

/** Energy-dependent accent tuning */
const ACCENT_CONFIG: Record<string, AccentConfig | null> = {
  high: { onsetThreshold: 0.4, peakOpacity: 0.55, decayFrames: 10 },
  mid:  { onsetThreshold: 0.5, peakOpacity: 0.35, decayFrames: 8 },
  low:  null, // no accents in low-energy windows
};

// ─── Constants ───

/** Target window duration in frames (~60 seconds at 30fps) */
const WINDOW_FRAMES = 1800;

/** Crossfade duration at window boundaries */
const CROSSFADE_FRAMES = 180;

/** Overlay count ranges by section energy */
const ENERGY_COUNTS: Record<string, { min: number; max: number }> = {
  low:  { min: 1, max: 2 },
  mid:  { min: 2, max: 3 },
  high: { min: 3, max: 4 },
};

/** Score penalty for overlays used in the previous window */
const REPEAT_PENALTY = 0.6;

// ─── smoothstep for crossfades ───

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
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
): RotationSchedule {
  const trackHash = hashString(trackId) + (showSeed ?? 0);

  // 1. Separate always-active from rotation pool
  const alwaysActiveSet = new Set(ALWAYS_ACTIVE);
  const alwaysActive = activeOverlays.filter((name) => alwaysActiveSet.has(name));
  const rotationPool = activeOverlays.filter((name) => !alwaysActiveSet.has(name));

  // If no sections or no rotation pool, return trivial schedule
  if (sections.length === 0 || rotationPool.length === 0) {
    return { alwaysActive, windows: [], accentOverlays: new Map() };
  }

  // 2. Build overlay entries for scoring (with layer info)
  const poolEntries: OverlayEntry[] = [];
  for (const name of rotationPool) {
    const entry = OVERLAY_BY_NAME.get(name);
    if (entry) poolEntries.push(entry);
  }

  // 3. Subdivide sections into ~WINDOW_FRAMES windows, aligned to section boundaries
  const windows: RotationWindow[] = [];
  for (const section of sections) {
    const sectionLen = section.frameEnd - section.frameStart;
    const windowCount = Math.max(1, Math.round(sectionLen / WINDOW_FRAMES));
    const windowLen = Math.floor(sectionLen / windowCount);

    for (let w = 0; w < windowCount; w++) {
      const frameStart = section.frameStart + w * windowLen;
      const frameEnd = w === windowCount - 1
        ? section.frameEnd
        : frameStart + windowLen;
      windows.push({
        frameStart,
        frameEnd,
        overlays: [], // filled below
        energy: section.energy,
      });
    }
  }

  // 4. Select overlays per window
  let previousWindowOverlays = new Set<string>();

  for (let wi = 0; wi < windows.length; wi++) {
    const window = windows[wi];
    const rng = seededRandom(trackHash + wi * 7919); // unique seed per window

    const energyRange = ENERGY_COUNTS[window.energy] ?? ENERGY_COUNTS.mid;
    let targetCount = energyRange.min + Math.floor(rng() * (energyRange.max - energyRange.min + 1));

    // Pre-peak anticipation: last window before a higher-energy section gets +1
    if (wi < windows.length - 1) {
      const nextEnergy = windows[wi + 1].energy;
      const energyRank = { low: 0, mid: 1, high: 2 };
      if (energyRank[nextEnergy] > energyRank[window.energy]) {
        targetCount = Math.min(targetCount + 1, energyRange.max + 1);
      }
    }

    // Cap at pool size
    targetCount = Math.min(targetCount, poolEntries.length);

    // Score each overlay for this window
    const scored = poolEntries.map((entry) => {
      let score = 0.5;

      // Energy band match
      if (entry.energyBand !== "any") {
        if (entry.energyBand === window.energy) {
          score += 0.3;
        } else {
          const rank = { low: 0, mid: 1, high: 2 };
          const dist = Math.abs(rank[entry.energyBand] - rank[window.energy]);
          score -= dist * 0.15;
        }
      }

      // Weight preference by energy
      if (window.energy === "low" && entry.weight === 1) score += 0.2;
      if (window.energy === "high" && entry.weight >= 2) score += 0.15;
      if (window.energy === "low" && entry.weight === 3) score -= 0.25;

      // No-repeat penalty
      if (previousWindowOverlays.has(entry.name)) {
        score -= REPEAT_PENALTY;
      }

      // Deterministic jitter
      score += rng() * 0.1;

      return { entry, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Layer diversity: ensure ≥3 different layers via round-robin pick
    const selected: OverlayEntry[] = [];
    const selectedNames = new Set<string>();
    const usedLayers = new Set<number>();

    // First pass: pick top candidate from each unique layer until we have ≥3 layers
    const byLayer = new Map<number, typeof scored>();
    for (const s of scored) {
      const layerList = byLayer.get(s.entry.layer) ?? [];
      layerList.push(s);
      byLayer.set(s.entry.layer, layerList);
    }

    // Sort layers by their top candidate's score
    const layerOrder = Array.from(byLayer.entries())
      .map(([layer, candidates]) => ({ layer, topScore: candidates[0].score }))
      .sort((a, b) => b.topScore - a.topScore);

    // Pick one from each layer until we have min(3, available layers) or hit target
    const minLayers = Math.min(3, layerOrder.length);
    for (const { layer } of layerOrder) {
      if (selected.length >= targetCount) break;
      if (usedLayers.size >= minLayers && selected.length >= minLayers) break;

      const candidates = byLayer.get(layer)!;
      for (const c of candidates) {
        if (!selectedNames.has(c.entry.name)) {
          selected.push(c.entry);
          selectedNames.add(c.entry.name);
          usedLayers.add(c.entry.layer);
          break;
        }
      }
    }

    // Second pass: fill remaining slots from top scores overall
    for (const s of scored) {
      if (selected.length >= targetCount) break;
      if (selectedNames.has(s.entry.name)) continue;
      selected.push(s.entry);
      selectedNames.add(s.entry.name);
    }

    window.overlays = selected.map((e) => e.name);
    previousWindowOverlays = selectedNames;
  }

  // 5. Accent selection — pull eligible overlays out of rotation into accent map
  const accentOverlays = new Map<number, string[]>();

  for (let wi = 0; wi < windows.length; wi++) {
    const window = windows[wi];
    const config = ACCENT_CONFIG[window.energy];
    if (!config) continue; // no accents for this energy level

    // Find accent-eligible overlays in this window's rotation list
    const eligible = window.overlays.filter((name) => ACCENT_ELIGIBLE.has(name));
    if (eligible.length === 0) continue;

    // Pick 1 (mid) or 1-2 (high) using offset seed
    const accentRng = seededRandom(trackHash + wi * 7919 + 31337);
    const pickCount = window.energy === "high"
      ? Math.min(1 + (accentRng() < 0.5 ? 1 : 0), eligible.length)
      : 1;

    // Shuffle eligible deterministically, take pickCount
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(accentRng() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    const picked = eligible.slice(0, pickCount);

    // Remove accent overlays from the window's regular rotation
    const pickedSet = new Set(picked);
    window.overlays = window.overlays.filter((name) => !pickedSet.has(name));

    accentOverlays.set(wi, picked);
  }

  return { alwaysActive, windows, accentOverlays };
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
 * Compute per-overlay opacity for a given frame.
 * Called every frame during rendering.
 *
 * - Always-active overlays: fixed at 1.0
 * - Rotation pool overlays: 0 or 1, with 30-frame smoothstep crossfades at window boundaries
 * - Overlays present in consecutive windows stay at 1.0 through the transition
 * - Accent overlays: flash on onset peaks with inverse smoothstep decay
 */
export function getOverlayOpacities(
  frame: number,
  schedule: RotationSchedule,
  frames?: EnhancedFrameData[],
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

  // Check if we're in a crossfade zone
  const distFromStart = frame - currentWindow.frameStart;
  const distFromEnd = currentWindow.frameEnd - 1 - frame;
  const halfCrossfade = CROSSFADE_FRAMES / 2;

  // Fade-in zone: first CROSSFADE_FRAMES/2 of window (if there's a previous window)
  const inFadeIn = wi > 0 && distFromStart < halfCrossfade;
  // Fade-out zone: last CROSSFADE_FRAMES/2 of window (if there's a next window)
  const inFadeOut = wi < windows.length - 1 && distFromEnd < halfCrossfade;

  const prevWindow = wi > 0 ? windows[wi - 1] : null;
  const nextWindow = wi < windows.length - 1 ? windows[wi + 1] : null;
  const prevSet = prevWindow ? new Set(prevWindow.overlays) : new Set<string>();
  const nextSet = nextWindow ? new Set(nextWindow.overlays) : new Set<string>();

  // Compute opacity for each overlay in the current window
  for (const name of currentWindow.overlays) {
    let opacity = 1;

    if (inFadeIn && !prevSet.has(name)) {
      // This overlay is new (not in prev window) — fade it in
      opacity = smoothstep(0, halfCrossfade, distFromStart);
    }
    if (inFadeOut && !nextSet.has(name)) {
      // This overlay is leaving (not in next window) — fade it out
      const fadeOutOpacity = smoothstep(0, halfCrossfade, distFromEnd);
      opacity = Math.min(opacity, fadeOutOpacity);
    }

    result[name] = opacity;
  }

  // Handle outgoing overlays from previous window during fade-in zone
  if (inFadeIn && prevWindow) {
    for (const name of prevWindow.overlays) {
      if (!currentSet.has(name) && result[name] === undefined) {
        // Fading out overlay from previous window
        result[name] = 1 - smoothstep(0, halfCrossfade, distFromStart);
      }
    }
  }

  // Handle incoming overlays from next window during fade-out zone
  if (inFadeOut && nextWindow) {
    for (const name of nextWindow.overlays) {
      if (!currentSet.has(name) && result[name] === undefined) {
        // Fading in overlay from next window
        result[name] = 1 - smoothstep(0, halfCrossfade, distFromEnd);
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
        result[name] = accentOpacity;
      }
    }
  }

  return result;
}
