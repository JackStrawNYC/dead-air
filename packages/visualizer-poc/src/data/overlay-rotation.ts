/**
 * Overlay Rotation Engine — temporal overlay management.
 *
 * Tuned for the Dead's visual philosophy: restraint during quiet passages,
 * visual silence before peaks, full flood at climax. The music leads.
 *
 * Key design principles:
 *   - 10x dynamic range: quiet passages nearly invisible, peaks at full intensity
 *   - Pre-peak dropout: strip to 1-2 overlays before a climax → dramatic contrast
 *   - Energy-scaled crossfades: glacial in Space, snappy at peaks
 *   - Wide overlay count range: 1-2 during quiet, 5-7 at climax
 *   - Accent overlays: Dead iconography pulses on beats during peaks
 *
 * Two exports:
 *   buildRotationSchedule() — called once per song via useMemo
 *   getOverlayOpacities()   — called every frame, returns per-overlay opacity 0-1
 *
 * Deterministic: seeded PRNG keyed on trackId + windowIndex.
 */
import type { SectionBoundary, OverlayEntry, EnhancedFrameData } from "./types";
import { OVERLAY_BY_NAME, ALWAYS_ACTIVE } from "./overlay-registry";
import { computeSmoothedEnergy, overlayEnergyFactor } from "../utils/energy";
import { detectTexture } from "../utils/climax-state";
import { computeAudioSnapshot } from "../utils/audio-reactive";

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
 * Expanded to include Dead iconography — stealies, bolts, bears, skeletons
 * should pulse with the music during peaks.
 */
const ACCENT_ELIGIBLE = new Set([
  // Original reactive/distortion overlays
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
  // Dead iconography — pulse on Garcia's attack, Bobby's chords
  "BreathingStealie",
  "StealYourFaceOff",
  "SkullKaleidoscope",
  "BearParade",
  "SkeletonBand",
  "SkeletonCouple",
  "DeadIcons",
  "VWBusParade",
  "SkeletonRoses",
  // Parametric Dead motifs
  "DeadMotif_SkeletonMarch",
  "DeadMotif_BearParade",
  "DeadMotif_BoltFlash",
  "DeadMotif_StealiePulse",
  "DeadMotif_VWBusConvoy",
  "DeadMotif_GarciaHandDrift",
  // Venue/crowd energy
  "MoshPit",
  "StageDive",
  "CrowdSilhouette",
  "EmberRise",
  "Thunderhead",
]);

/** Energy-dependent accent tuning */
const ACCENT_CONFIG: Record<string, AccentConfig | null> = {
  high: { onsetThreshold: 0.35, peakOpacity: 0.6, decayFrames: 12 },
  mid:  { onsetThreshold: 0.45, peakOpacity: 0.35, decayFrames: 8 },
  low:  null, // no accents in low-energy windows — let it breathe
};

// ─── Constants ───

/**
 * Window duration in frames by energy.
 * Quiet passages rotate every 60s to prevent visual stagnation.
 * Peaks rotate faster for visual energy.
 */
const WINDOW_FRAMES_BY_ENERGY: Record<string, number> = {
  low:  1800,  // 60 seconds — gentle rotation, prevents dead stretches
  mid:  2700,  // 90 seconds — comfortable rotation
  high: 1350,  // 45 seconds — fast visual turnover at peaks
};
const WINDOW_FRAMES_DEFAULT = 2700;

/**
 * Crossfade duration at window boundaries, energy-scaled.
 * Quiet transitions are glacial (20s). Peak transitions are snappy (6s).
 * Matches the tempo of the music's own dynamics.
 */
const CROSSFADE_FRAMES_BY_ENERGY: Record<string, number> = {
  low:  600,   // 20 seconds — glacial, like morning fog
  mid:  300,   // 10 seconds — comfortable
  high: 180,   // 6 seconds — snappy, matching peak energy
};
const CROSSFADE_FRAMES_DEFAULT = 300;

/**
 * Overlay count ranges by section energy.
 * Quiet = 0-2 (near-void — shader + grain only), peak = 5-8 (full flood).
 * The darkness earns the flood. Zero overlays during quiet = just shader + film grain.
 */
const ENERGY_COUNTS: Record<string, { min: number; max: number }> = {
  low:  { min: 0, max: 2 },
  mid:  { min: 2, max: 4 },
  high: { min: 5, max: 8 },
};

/** Score penalty for overlays used in the previous window */
const REPEAT_PENALTY = 0.6;

/** Score bonus for overlays from a short previous window (encourages persistence) */
const CARRYOVER_BONUS = 0.4;

/** Windows shorter than this get carryover instead of repeat-penalty (30 seconds) */
const MIN_WINDOW_FOR_ROTATION = 900;

/**
 * Pre-peak dropout: overlay count cap for the window immediately before a
 * higher-energy section. Strips the visual field to complete void so the
 * peak floods in with maximum contrast. Like pulling the kick drum out
 * of the mix right before the drop.
 */
const DROPOUT_MAX_OVERLAYS = 0;

// ─── Texture × Category routing (Dead-authentic) ───
// 5 groups tuned to what a Grateful Dead show actually feels like:
// Sacred geometry owns Space/Drums. Bears and skeletons welcome during songs.
// Festival energy at peaks. Set II goes deeper. Post-peak grace after the void.

const AMBIENT_WASH = new Set(["atmospheric", "nature"]);       // background canvas
const COSMIC_SACRED = new Set(["sacred"]);                      // inner journey
const ENERGY_REACTIVE = new Set(["reactive", "geometric", "distortion"]); // the pulse
const DEAD_FAMILY = new Set(["character"]);                     // bears, skeletons, crowd
const SHOW_NARRATIVE = new Set(["artifact", "info", "hud"]);   // posters, text, HUD

type TextureGroup = "wash" | "sacred" | "reactive" | "family" | "narrative";

const TEXTURE_GROUP_SCORE: Record<string, Record<TextureGroup, number>> = {
  ambient:  { wash: +0.25, sacred: +0.45, reactive: -0.30, family: -0.40, narrative: -0.50 },
  sparse:   { wash: +0.20, sacred: +0.25, reactive: -0.20, family: -0.15, narrative: -0.40 },
  melodic:  { wash: +0.10, sacred: +0.05, reactive:  0.00, family: +0.20, narrative: +0.10 },
  building: { wash: +0.05, sacred: +0.10, reactive: +0.15, family: +0.10, narrative: -0.05 },
  rhythmic: { wash:  0.00, sacred:  0.00, reactive: +0.20, family: +0.25, narrative: -0.15 },
  peak:     { wash: -0.05, sacred: +0.10, reactive: +0.25, family: +0.30, narrative: -0.35 },
};

/** Tag-based texture scoring — tags carry rich Dead-specific signal */
const TAG_TEXTURE_BONUS: Record<string, Partial<Record<string, number>>> = {
  cosmic:         { ambient: +0.15, sparse: +0.10, peak: -0.05 },
  psychedelic:    { ambient: +0.05, melodic: +0.05, building: +0.10, rhythmic: +0.10, peak: +0.10 },
  festival:       { rhythmic: +0.15, peak: +0.20, melodic: +0.05, ambient: -0.15 },
  contemplative:  { ambient: +0.10, sparse: +0.15, melodic: +0.05, peak: -0.15 },
  "dead-culture": { ambient: +0.05, sparse: +0.05, melodic: +0.10, rhythmic: +0.10, peak: +0.15 },
  intense:        { peak: +0.15, rhythmic: +0.10, building: +0.05, ambient: -0.20, sparse: -0.15 },
  organic:        { ambient: +0.05, sparse: +0.05, melodic: +0.05 },
  mechanical:     { ambient: -0.15, sparse: -0.10, rhythmic: +0.05, peak: -0.10 },
  retro:          { ambient: -0.10, melodic: +0.05, sparse: -0.05 },
  aquatic:        { ambient: +0.05, sparse: +0.10, peak: -0.10 },
};

/** Set II = the journey. More cosmic/sacred, fewer artifacts. */
const SET2_ADJUSTMENTS: Record<TextureGroup, number> = {
  sacred:    +0.10,
  wash:      +0.05,
  narrative: -0.15,
  reactive:   0.00,
  family:    -0.05,
};

/** Post-peak grace: after high→low/mid drop, favor sacred/contemplative overlays */
const POST_PEAK_GRACE: Record<TextureGroup, number> = {
  sacred:    +0.20,
  wash:      +0.10,
  family:    -0.20,
  reactive:  -0.25,
  narrative: -0.30,
};

/** Tag bonuses/penalties during post-peak grace windows */
const POST_PEAK_TAG_BONUS: Record<string, number> = {
  contemplative: +0.10,
  intense:       -0.15,
};

// ─── smoothstep for crossfades ───

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Parse set number from trackId format "s{set}t{track}" */
function parseSetNumber(trackId: string): number {
  const match = trackId.match(/^s(\d+)t/);
  return match ? parseInt(match[1], 10) : 1;
}

/** Resolve an overlay's category to a texture group */
function resolveTextureGroup(category: string): TextureGroup | null {
  if (AMBIENT_WASH.has(category)) return "wash";
  if (COSMIC_SACRED.has(category)) return "sacred";
  if (ENERGY_REACTIVE.has(category)) return "reactive";
  if (DEAD_FAMILY.has(category)) return "family";
  if (SHOW_NARRATIVE.has(category)) return "narrative";
  return null;
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

  // 3. Subdivide sections into energy-aware windows, aligned to section boundaries
  const windows: RotationWindow[] = [];
  for (const section of sections) {
    const sectionLen = section.frameEnd - section.frameStart;
    const targetWindowFrames = WINDOW_FRAMES_BY_ENERGY[section.energy] ?? WINDOW_FRAMES_DEFAULT;
    const windowCount = Math.max(1, Math.round(sectionLen / targetWindowFrames));
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

  // 4. Identify pre-peak dropout windows
  //    The last window before a jump to higher energy gets flagged.
  //    This creates visual silence → climax contrast.
  const energyRank: Record<string, number> = { low: 0, mid: 1, high: 2 };
  for (let wi = 0; wi < windows.length - 1; wi++) {
    const currentRank = energyRank[windows[wi].energy];
    const nextRank = energyRank[windows[wi + 1].energy];
    // Only dropout when jumping UP at least 1 level (low→mid, low→high, mid→high)
    if (nextRank > currentRank) {
      windows[wi].isDropout = true;
    }
  }

  // 5. Select overlays per window
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
      if (windowTexture === "ambient" || windowTexture === "sparse") {
        targetCount = Math.min(targetCount, 1);
      } else if (windowTexture === "peak") {
        targetCount += 1;
      }
    }

    // Pre-peak dropout: strip to complete void before the climax
    if (window.isDropout) {
      targetCount = Math.min(targetCount, DROPOUT_MAX_OVERLAYS);
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

      // Dropout windows: prefer atmospheric/sacred layers (1-2) — the quietest visuals
      if (window.isDropout) {
        if (entry.layer <= 2) score += 0.4;
        else score -= 0.3;
      }

      // Texture × category routing (Dead-authentic):
      // Sacred geometry for Space, bears for songs, festival energy at peaks
      if (windowTexture) {
        const group = resolveTextureGroup(entry.category);
        if (group) {
          score += TEXTURE_GROUP_SCORE[windowTexture]?.[group] ?? 0;

          // Tag-based texture bonus: cosmic, psychedelic, festival, etc.
          if (entry.tags) {
            for (const tag of entry.tags) {
              score += TAG_TEXTURE_BONUS[tag]?.[windowTexture] ?? 0;
            }
          }

          // Set II deepening: more sacred/cosmic, fewer artifacts
          if (setNumber >= 2) {
            score += SET2_ADJUSTMENTS[group];
          }

          // Post-peak grace: after high→low/mid drop, favor sacred/contemplative
          if (previousWindowEnergy === "high" && (window.energy === "low" || window.energy === "mid")) {
            score += POST_PEAK_GRACE[group];
            if (entry.tags) {
              for (const tag of entry.tags) {
                score += POST_PEAK_TAG_BONUS[tag] ?? 0;
              }
            }
          }
        }
      }

      // Carryover vs repeat: if previous window was too short for the overlay
      // to register visually, encourage it to persist instead of penalizing
      if (previousWindowOverlays.has(entry.name)) {
        if (previousWindowFrames < MIN_WINDOW_FOR_ROTATION) {
          score += CARRYOVER_BONUS;
        } else {
          score -= REPEAT_PENALTY;
        }
      }

      // Deterministic jitter
      score += rng() * 0.1;

      return { entry, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Layer diversity: ensure ≥2 different layers via round-robin pick
    // (relaxed from 3 since low-energy windows may only have 1-2 overlays)
    const selected: OverlayEntry[] = [];
    const selectedNames = new Set<string>();
    const usedLayers = new Set<number>();

    // First pass: pick top candidate from each unique layer
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

    // Pick one from each layer until we have min(2, available layers) or hit target
    const minLayers = Math.min(2, layerOrder.length, targetCount);
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
      opacity = smoothstep(boundary - halfFadeIn, boundary + halfFadeIn, frame);
    }
    if (inFadeOut && !nextSet.has(name)) {
      // This overlay is leaving (not in next window) — crossfade centered on end boundary
      const boundary = currentWindow.frameEnd;
      const fadeOutOpacity = 1 - smoothstep(boundary - halfFadeOut, boundary + halfFadeOut, frame);
      opacity = Math.min(opacity, fadeOutOpacity);
    }

    result[name] = opacity;
  }

  // Handle outgoing overlays from previous window during fade-in zone
  if (inFadeIn && prevWindow) {
    const boundary = currentWindow.frameStart;
    for (const name of prevWindow.overlays) {
      if (!currentSet.has(name) && result[name] === undefined) {
        result[name] = 1 - smoothstep(boundary - halfFadeIn, boundary + halfFadeIn, frame);
      }
    }
  }

  // Handle incoming overlays from next window during fade-out zone
  if (inFadeOut && nextWindow) {
    const boundary = currentWindow.frameEnd;
    for (const name of nextWindow.overlays) {
      if (!currentSet.has(name) && result[name] === undefined) {
        result[name] = smoothstep(boundary - halfFadeOut, boundary + halfFadeOut, frame);
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

  // ─── Energy-based overlay breathing ───
  // 10x dynamic range: quiet passages at 10% density, peaks at 100%.
  // This is the single biggest factor in making peaks feel earned.
  if (frames && frames.length > 0) {
    const energyIdx = Math.min(Math.max(0, frame), frames.length - 1);
    const energy = computeSmoothedEnergy(frames, energyIdx);
    const opacityFactor = overlayEnergyFactor(energy);
    const alwaysActiveSet = new Set(schedule.alwaysActive);
    for (const name of Object.keys(result)) {
      if (!alwaysActiveSet.has(name)) {
        result[name] *= opacityFactor;
      }
    }
  }

  return result;
}
