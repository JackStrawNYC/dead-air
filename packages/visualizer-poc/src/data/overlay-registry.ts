/**
 * Overlay Registry — curated metadata for all overlay components.
 * Used by the overlay selector to score and pick overlays per song.
 *
 * Layer assignments match the rendering order in SongVisualizer.tsx:
 *   1=Atmospheric, 2=Sacred/Center, 3=Reactive, 4=Geometric/Physics,
 *   5=Nature/Cosmic, 6=Character, 7=Frame/Info (artifact), 8=Typography (info),
 *   9=HUD, 10=Distortion
 *
 * Curated 2026-03-16: 46 selectable + 2 always-active = 48 total.
 * Component files are preserved — any overlay can be restored by re-adding
 * its registry entry here.
 *
 * Tier: A=iconic/essential (13 total: 11 selectable + 2 always-active), B=solid rotation (35).
 */
import type { OverlayEntry } from "./types";

export const OVERLAY_REGISTRY: OverlayEntry[] = [
  // ═══ Layer 1: Atmospheric (8) ═══
  { name: "CosmicStarfield",  layer: 1, category: "atmospheric", tags: ["cosmic", "contemplative"],       energyBand: "low",  weight: 1, dutyCycle: 100, energyResponse: [0.0, 0.08, 3.0], tier: "A" },
  { name: "TieDyeWash",       layer: 1, category: "atmospheric", tags: ["psychedelic", "dead-culture"],    energyBand: "any",  weight: 1, dutyCycle: 100, energyResponse: [0.0, 0.12, 2.0], tier: "B" },
  { name: "LavaLamp",         layer: 1, category: "atmospheric", tags: ["psychedelic", "retro"],           energyBand: "mid",  weight: 1, dutyCycle: 100, energyResponse: [0.05, 0.20, 1.8], tier: "B" },
  { name: "Fireflies",        layer: 1, category: "atmospheric", tags: ["organic", "contemplative"],      energyBand: "low",  weight: 1, dutyCycle: 100, energyResponse: [0.0, 0.05, 2.0], tier: "B" },
  { name: "LighterWave",     layer: 1, category: "atmospheric", tags: ["dead-culture", "contemplative"], energyBand: "low",  weight: 1, dutyCycle: 100, energyResponse: [0.0, 0.05, 2.5], tier: "A" },
  { name: "CrowdDance",      layer: 1, category: "atmospheric", tags: ["festival", "intense"],           energyBand: "high", weight: 1, dutyCycle: 100, energyResponse: [0.20, 0.35, 2.0], tier: "B" },
  { name: "GlowSticks",      layer: 1, category: "atmospheric", tags: ["festival", "intense"],           energyBand: "high", weight: 1, dutyCycle: 100, energyResponse: [0.15, 0.30, 2.0], tier: "B" },
  { name: "GodRays",          layer: 1, category: "atmospheric", tags: ["contemplative", "cosmic"],       energyBand: "low",  weight: 1, dutyCycle: 100, energyResponse: [0.0, 0.08, 2.5], tier: "B" },

  // ═══ Layer 2: Sacred / Center-stage (13) ═══
  { name: "BreathingStealie",  layer: 2, category: "sacred", tags: ["dead-culture", "psychedelic"],    energyBand: "any",  weight: 3, dutyCycle: 100, energyResponse: [0.03, 0.15, 1.5], tier: "A" },
  { name: "ThirteenPointBolt", layer: 2, category: "sacred", tags: ["dead-culture", "intense"],        energyBand: "high", weight: 3, dutyCycle: 100, energyResponse: [0.15, 0.30, 2.0], tier: "A" },
  { name: "StealYourFaceOff",  layer: 2, category: "sacred", tags: ["dead-culture", "intense"],        energyBand: "high", weight: 3, dutyCycle: 100, energyResponse: [0.15, 0.35, 2.0], tier: "A" },
  { name: "SkullKaleidoscope", layer: 2, category: "sacred", tags: ["dead-culture", "psychedelic"],    energyBand: "mid",  weight: 3, dutyCycle: 100, energyResponse: [0.05, 0.22, 1.5], tier: "B" },
  { name: "SkeletonRoses",     layer: 2, category: "sacred", tags: ["dead-culture", "organic"],        energyBand: "any",  weight: 3, dutyCycle: 100, energyResponse: [0.02, 0.15, 1.8], tier: "A" },
  { name: "SacredGeometry",    layer: 2, category: "sacred", tags: ["cosmic", "contemplative"],        energyBand: "mid",  weight: 2, dutyCycle: 50, energyResponse: [0.05, 0.18, 2.0], tier: "B" },
  { name: "DarkStarPortal",    layer: 2, category: "sacred", tags: ["cosmic", "dead-culture"],          energyBand: "mid",  weight: 3, dutyCycle: 100, energyResponse: [0.03, 0.18, 1.5], tier: "A" },
  { name: "FractalZoom",       layer: 2, category: "sacred", tags: ["psychedelic", "cosmic"],           energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.05, 0.25, 2.0], tier: "B" },
  { name: "MandalaGenerator",  layer: 2, category: "sacred", tags: ["cosmic", "contemplative"],        energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.04, 0.20, 1.8], tier: "B" },
  { name: "RoseOverlay",       layer: 2, category: "sacred", tags: ["dead-culture", "contemplative"],  energyBand: "low",  weight: 2, dutyCycle: 100, energyResponse: [0.0, 0.10, 2.5], tier: "B" },
  { name: "StainedGlass",     layer: 2, category: "sacred", tags: ["contemplative", "psychedelic"],    energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.05, 0.20, 1.8], tier: "B" },
  { name: "DreamCatcher",     layer: 2, category: "sacred", tags: ["contemplative", "organic"],        energyBand: "low",  weight: 2, dutyCycle: 100, energyResponse: [0.0, 0.08, 2.5], tier: "B" },
  { name: "StealieFade",      layer: 2, category: "sacred", tags: ["dead-culture", "contemplative"],   energyBand: "any",  weight: 2, dutyCycle: 100, energyResponse: [0.02, 0.12, 2.0], tier: "B" },

  // ═══ Layer 3: Song-reactive (4) ═══
  { name: "LightningBoltOverlay", layer: 3, category: "reactive", tags: ["dead-culture", "intense"],   energyBand: "high", weight: 3, dutyCycle: 100, energyResponse: [0.20, 0.35, 2.0], tier: "B" },
  { name: "ParticleExplosion",   layer: 3, category: "reactive", tags: ["intense", "psychedelic"],       energyBand: "high", weight: 3, dutyCycle: 12, energyResponse: [0.20, 0.40, 2.5], tier: "B" },
  { name: "LaserShow",           layer: 3, category: "reactive", tags: ["festival", "intense"],          energyBand: "high", weight: 3, dutyCycle: 100, energyResponse: [0.15, 0.30, 1.5], tier: "B" },
  { name: "EmberRise",           layer: 3, category: "reactive", tags: ["intense", "organic"],           energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.10, 0.25, 1.8], tier: "B" },

  // ═══ Layer 3: Reactive — WallOfSound + PhilZone ═══
  { name: "WallOfSound",         layer: 3, category: "reactive", tags: ["intense", "festival"],          energyBand: "high", weight: 3, dutyCycle: 20, energyResponse: [0.15, 0.35, 2.0], tier: "B" },
  { name: "PhilZone",            layer: 3, category: "reactive", tags: ["dead-culture", "organic"],      energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.08, 0.20, 2.0], tier: "B" },

  // ═══ Layer 5: Song References (3) ═══
  { name: "ChinaCatSunflower",layer: 5, category: "nature", tags: ["psychedelic", "dead-culture"], energyBand: "mid",  weight: 2, dutyCycle: 25, energyResponse: [0.05, 0.22, 1.5], tier: "B" },
  { name: "SugarMagnolia",    layer: 5, category: "nature", tags: ["organic", "dead-culture"],     energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.06, 0.25, 1.8], tier: "B" },
  { name: "BoxOfRain",        layer: 5, category: "nature", tags: ["organic", "dead-culture"],     energyBand: "low",  weight: 2, dutyCycle: 100, energyResponse: [0.0, 0.08, 2.5], tier: "B" },

  // ═══ Layer 6: Character / Dead Culture (12) ═══
  { name: "BearParade",       layer: 6, category: "character", tags: ["dead-culture", "festival"],     energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.06, 0.25, 1.5], tier: "A" },
  { name: "SkeletonBand",     layer: 6, category: "character", tags: ["dead-culture", "festival"],     energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.10, 0.30, 1.5], tier: "A" },
  { name: "MarchingTerrapins",layer: 6, category: "character", tags: ["dead-culture", "organic"],      energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.05, 0.20, 1.5], tier: "A" },
  { name: "Bertha",           layer: 6, category: "character", tags: ["dead-culture"],                 energyBand: "mid",  weight: 3, dutyCycle: 100, energyResponse: [0.02, 0.20, 1.8], tier: "A" },
  { name: "JerryGuitar",      layer: 6, category: "character", tags: ["dead-culture", "organic"],      energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.05, 0.20, 1.5], tier: "B" },
  { name: "VWBusParade",      layer: 6, category: "character", tags: ["dead-culture", "festival"],     energyBand: "low",  weight: 2, dutyCycle: 100, energyResponse: [0.04, 0.18, 2.0], tier: "B" },
  { name: "CosmicCharlie",    layer: 6, category: "character", tags: ["dead-culture", "cosmic"],       energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.04, 0.18, 1.8], tier: "B" },
  { name: "JerrySpotlight",  layer: 6, category: "character", tags: ["dead-culture", "organic"],      energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.10, 0.25, 1.5], tier: "B" },
  { name: "BobWeir",         layer: 6, category: "character", tags: ["dead-culture", "organic"],      energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.08, 0.20, 1.5], tier: "B" },
  { name: "DrumCircle",      layer: 6, category: "character", tags: ["dead-culture", "intense"],      energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.10, 0.30, 2.0], tier: "A" },
  { name: "DancingTerrapinOverlay", layer: 6, category: "character", tags: ["dead-culture", "organic"], energyBand: "mid", weight: 2, dutyCycle: 100, energyResponse: [0.05, 0.20, 1.5], tier: "B" },
  { name: "SkeletonCouple",  layer: 6, category: "character", tags: ["dead-culture", "contemplative"], energyBand: "low",  weight: 2, dutyCycle: 100, energyResponse: [0.0, 0.10, 2.0], tier: "B" },

  // ═══ Layer 7: Always-active info (hardcoded in SongVisualizer) ═══
  { name: "SongTitle",         layer: 7, category: "artifact", tags: ["dead-culture"],                  energyBand: "any",  weight: 1, alwaysActive: true, tier: "A" },

  // ═══ Layer 7: Show Artifacts (3) ═══
  { name: "VenueMarquee",     layer: 7, category: "artifact", tags: ["dead-culture", "retro"],          energyBand: "any",  weight: 1, dutyCycle: 20, energyResponse: [0.0, 0.05, 3.0], tier: "B" },
  { name: "TapeTrader",       layer: 7, category: "artifact", tags: ["dead-culture", "retro"],          energyBand: "any",  weight: 1, dutyCycle: 15, energyResponse: [0.0, 0.05, 3.0], tier: "B" },
  { name: "TourPosterGallery", layer: 7, category: "artifact", tags: ["dead-culture", "retro"],         energyBand: "any",  weight: 1, dutyCycle: 20, energyResponse: [0.0, 0.05, 3.0], tier: "B" },

  // ═══ Layer 10: Distortion (1) + always-active ═══
  { name: "VHSGlitch",           layer: 10, category: "distortion", tags: ["retro", "psychedelic"],       energyBand: "mid",  weight: 2, dutyCycle: 100, energyResponse: [0.15, 0.35, 2.5], tier: "A" },
  { name: "FilmGrain",           layer: 10, category: "distortion", tags: ["retro"],                      energyBand: "any",  weight: 1, alwaysActive: true, tier: "A" },
];

/**
 * Registry of all selectable overlays — the curated pool.
 * 46 selectable + 2 always-active = 48 total.
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
