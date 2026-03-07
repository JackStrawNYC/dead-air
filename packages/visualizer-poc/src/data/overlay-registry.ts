/**
 * Overlay Registry — curated metadata for all overlay components.
 * Used by the overlay selector to score and pick overlays per song.
 *
 * Layer assignments match the rendering order in SongVisualizer.tsx:
 *   1=Atmospheric, 2=Sacred/Center, 3=Reactive, 4=Geometric/Physics,
 *   5=Nature/Cosmic, 6=Character, 7=Frame/Info (artifact), 8=Typography (info),
 *   9=HUD, 10=Distortion
 *
 * Curated 2026-03-07: culled to 30 keepers + 2 always-active (see plan).
 * Component files are preserved — any overlay can be restored by re-adding
 * its registry entry here.
 */
import type { OverlayEntry } from "./types";

export const OVERLAY_REGISTRY: OverlayEntry[] = [
  // ═══ Layer 1: Atmospheric (4) ═══
  { name: "CosmicStarfield",  layer: 1, category: "atmospheric", tags: ["cosmic", "contemplative"],       energyBand: "low",  weight: 1, dutyCycle: 100, energyResponse: [0.0, 0.08, 3.0] },
  { name: "TieDyeWash",       layer: 1, category: "atmospheric", tags: ["psychedelic", "dead-culture"],    energyBand: "any",  weight: 1, dutyCycle: 100 },
  { name: "LavaLamp",         layer: 1, category: "atmospheric", tags: ["psychedelic", "retro"],           energyBand: "mid",  weight: 1, dutyCycle: 100 },
  { name: "Fireflies",        layer: 1, category: "atmospheric", tags: ["organic", "contemplative"],      energyBand: "low",  weight: 1, dutyCycle: 100, energyResponse: [0.0, 0.05, 2.0] },

  // ═══ Layer 2: Sacred / Center-stage (10) ═══
  { name: "BreathingStealie",  layer: 2, category: "sacred", tags: ["dead-culture", "psychedelic"],    energyBand: "any",  weight: 3, dutyCycle: 100, energyResponse: [0.03, 0.15, 1.5] },
  { name: "ThirteenPointBolt", layer: 2, category: "sacred", tags: ["dead-culture", "intense"],        energyBand: "high", weight: 3, dutyCycle: 100, energyResponse: [0.15, 0.30, 2.0] },
  { name: "StealYourFaceOff",  layer: 2, category: "sacred", tags: ["dead-culture", "intense"],        energyBand: "high", weight: 3, dutyCycle: 100 },
  { name: "SkullKaleidoscope", layer: 2, category: "sacred", tags: ["dead-culture", "psychedelic"],    energyBand: "mid",  weight: 3, dutyCycle: 100 },
  { name: "SkeletonRoses",     layer: 2, category: "sacred", tags: ["dead-culture", "organic"],        energyBand: "any",  weight: 3, dutyCycle: 100 },
  { name: "SacredGeometry",    layer: 2, category: "sacred", tags: ["cosmic", "contemplative"],        energyBand: "mid",  weight: 2, dutyCycle: 36, energyResponse: [0.05, 0.18, 2.0] },
  { name: "DarkStarPortal",    layer: 2, category: "sacred", tags: ["cosmic", "dead-culture"],          energyBand: "mid",  weight: 3 },
  { name: "FractalZoom",       layer: 2, category: "sacred", tags: ["psychedelic", "cosmic"],           energyBand: "mid",  weight: 2 },
  { name: "MandalaGenerator",  layer: 2, category: "sacred", tags: ["cosmic", "contemplative"],        energyBand: "mid",  weight: 2 },
  { name: "RoseOverlay",       layer: 2, category: "sacred", tags: ["dead-culture", "contemplative"],  energyBand: "low",  weight: 2, dutyCycle: 100 },

  // ═══ Layer 3: Song-reactive (4) ═══
  { name: "LightningBoltOverlay", layer: 3, category: "reactive", tags: ["dead-culture", "intense"],   energyBand: "high", weight: 3, energyResponse: [0.20, 0.35, 2.0] },
  { name: "ParticleExplosion",   layer: 3, category: "reactive", tags: ["intense", "psychedelic"],       energyBand: "high", weight: 3, dutyCycle: 8, energyResponse: [0.20, 0.40, 2.5] },
  { name: "LaserShow",           layer: 3, category: "reactive", tags: ["festival", "intense"],          energyBand: "high", weight: 3, energyResponse: [0.15, 0.30, 1.5] },
  { name: "EmberRise",           layer: 3, category: "reactive", tags: ["intense", "organic"],           energyBand: "mid",  weight: 2, energyResponse: [0.10, 0.25, 1.8] },

  // ═══ Layer 3: Reactive — WallOfSound (placed here for layer 3) ═══
  { name: "WallOfSound",         layer: 3, category: "reactive", tags: ["intense", "festival"],          energyBand: "high", weight: 3, dutyCycle: 17, energyResponse: [0.15, 0.35, 2.0] },

  // ═══ Layer 5: Song References (3) ═══
  { name: "ChinaCatSunflower",layer: 5, category: "nature", tags: ["psychedelic", "dead-culture"], energyBand: "mid",  weight: 2, dutyCycle: 14 },
  { name: "SugarMagnolia",    layer: 5, category: "nature", tags: ["organic", "dead-culture"],     energyBand: "mid",  weight: 2 },
  { name: "BoxOfRain",        layer: 5, category: "nature", tags: ["organic", "dead-culture"],     energyBand: "low",  weight: 2 },

  // ═══ Layer 6: Character / Dead Culture (8) ═══
  { name: "BearParade",       layer: 6, category: "character", tags: ["dead-culture", "festival"],     energyBand: "mid",  weight: 2, dutyCycle: 30 },
  { name: "SkeletonBand",     layer: 6, category: "character", tags: ["dead-culture", "festival"],     energyBand: "mid",  weight: 2, dutyCycle: 25 },
  { name: "MarchingTerrapins",layer: 6, category: "character", tags: ["dead-culture", "organic"],      energyBand: "mid",  weight: 2 },
  { name: "Bertha",           layer: 6, category: "character", tags: ["dead-culture"],                 energyBand: "mid",  weight: 3 },
  { name: "JerryGuitar",      layer: 6, category: "character", tags: ["dead-culture", "organic"],      energyBand: "mid",  weight: 2, dutyCycle: 33 },
  { name: "VWBusParade",      layer: 6, category: "character", tags: ["dead-culture", "festival"],     energyBand: "low",  weight: 2 },
  { name: "CosmicCharlie",    layer: 6, category: "character", tags: ["dead-culture", "cosmic"],       energyBand: "mid",  weight: 2 },

  // ═══ Layer 7: Always-active info (hardcoded in SongVisualizer) ═══
  { name: "SongTitle",         layer: 7, category: "artifact", tags: ["dead-culture"],                  energyBand: "any",  weight: 1, alwaysActive: true },

  // ═══ Layer 10: Distortion (1) + always-active ═══
  { name: "VHSGlitch",           layer: 10, category: "distortion", tags: ["retro", "psychedelic"],       energyBand: "mid",  weight: 2 },
  { name: "FilmGrain",           layer: 10, category: "distortion", tags: ["retro"],                      energyBand: "any",  weight: 1, alwaysActive: true },
];

/**
 * Registry of all selectable overlays — the curated pool.
 * Culled to 30 keepers + 2 always-active (see plan).
 * Component files preserved — any overlay can be restored by re-adding here.
 */
export const SELECTABLE_REGISTRY = [...OVERLAY_REGISTRY];

/** Quick lookup by name */
export const OVERLAY_BY_NAME = new Map(
  OVERLAY_REGISTRY.map((entry) => [entry.name, entry]),
);

/** Always-active overlays (rendered regardless of selection) */
export const ALWAYS_ACTIVE = OVERLAY_REGISTRY
  .filter((e) => e.alwaysActive)
  .map((e) => e.name);
