/**
 * Overlay Registry — curated metadata for all overlay components.
 * Used by the overlay selector to score and pick overlays per song.
 *
 * Layer assignments match the rendering order in SongVisualizer.tsx:
 *   1=Atmospheric, 2=Sacred/Center, 3=Reactive, 4=Geometric/Physics,
 *   5=Nature/Cosmic, 6=Character, 7=Frame/Info (artifact), 8=Typography (info),
 *   9=HUD, 10=Distortion
 *
 * Curated 2026-03-05: 163 filler overlays removed (see OVERLAY-AUDIT.md).
 * Component files are preserved — any overlay can be restored by re-adding
 * its registry entry here.
 */
import type { OverlayEntry } from "./types";

export const OVERLAY_REGISTRY: OverlayEntry[] = [
  // ═══ Layer 1: Atmospheric backgrounds (22) ═══
  { name: "CosmicStarfield",  layer: 1, category: "atmospheric", tags: ["cosmic", "contemplative"],       energyBand: "low",  weight: 1, dutyCycle: 100, energyResponse: [0.0, 0.08, 3.0] },
  { name: "TieDyeWash",       layer: 1, category: "atmospheric", tags: ["psychedelic", "dead-culture"],    energyBand: "any",  weight: 1, dutyCycle: 100 },
  { name: "LavaLamp",         layer: 1, category: "atmospheric", tags: ["psychedelic", "retro"],           energyBand: "mid",  weight: 1, dutyCycle: 100 },
  { name: "SmokeWisps",       layer: 1, category: "atmospheric", tags: ["organic", "contemplative"],      energyBand: "low",  weight: 1, dutyCycle: 100, energyResponse: [0.0, 0.06, 2.5] },
  { name: "AuroraBorealis",   layer: 1, category: "atmospheric", tags: ["cosmic", "organic"],             energyBand: "low",  weight: 1, dutyCycle: 100, energyResponse: [0.0, 0.10, 3.0] },
  { name: "Fireflies",        layer: 1, category: "atmospheric", tags: ["organic", "contemplative"],      energyBand: "low",  weight: 1, dutyCycle: 100, energyResponse: [0.0, 0.05, 2.0] },
  { name: "OilSlick",         layer: 1, category: "atmospheric", tags: ["psychedelic", "organic"],         energyBand: "mid",  weight: 1 },
  { name: "NebulaCloud",      layer: 1, category: "atmospheric", tags: ["cosmic"],                        energyBand: "low",  weight: 1 },
  { name: "Sandstorm",        layer: 1, category: "atmospheric", tags: ["intense", "organic"],            energyBand: "high", weight: 2 },
  { name: "CampfireSparks",   layer: 1, category: "atmospheric", tags: ["organic", "festival"],           energyBand: "mid",  weight: 1 },
  { name: "CandleFlicker",    layer: 1, category: "atmospheric", tags: ["contemplative", "organic"],      energyBand: "low",  weight: 1, energyResponse: [0.0, 0.07, 2.5] },
  { name: "GodRays",          layer: 1, category: "atmospheric", tags: ["cosmic", "contemplative"],       energyBand: "mid",  weight: 1 },
  { name: "HookahSmoke",      layer: 1, category: "atmospheric", tags: ["psychedelic", "dead-culture"],    energyBand: "low",  weight: 1 },
  { name: "FogMachine",       layer: 1, category: "atmospheric", tags: ["festival", "psychedelic"],        energyBand: "mid",  weight: 1 },
  { name: "VaporTrails",      layer: 1, category: "atmospheric", tags: ["cosmic", "psychedelic"],          energyBand: "mid",  weight: 1 },
  { name: "DragonBreath",     layer: 1, category: "atmospheric", tags: ["intense", "psychedelic"],         energyBand: "high", weight: 2 },
  { name: "SpiritWisps",      layer: 1, category: "atmospheric", tags: ["cosmic", "contemplative"],       energyBand: "low",  weight: 1 },
  { name: "ZenRipples",       layer: 1, category: "atmospheric", tags: ["contemplative", "aquatic"],       energyBand: "low",  weight: 1 },
  { name: "TreeSilhouette",   layer: 1, category: "atmospheric", tags: ["organic", "contemplative"],      energyBand: "low",  weight: 1 },
  { name: "NorthernLights",   layer: 1, category: "atmospheric", tags: ["cosmic", "psychedelic"],          energyBand: "low",  weight: 1 },
  { name: "FestivalTent",     layer: 1, category: "atmospheric", tags: ["festival", "dead-culture"],       energyBand: "mid",  weight: 1 },
  { name: "RainbowArc",       layer: 1, category: "atmospheric", tags: ["psychedelic", "cosmic"],          energyBand: "mid",  weight: 1 },

  // ═══ Layer 2: Sacred / Center-stage elements (26) ═══
  { name: "BreathingStealie",  layer: 2, category: "sacred", tags: ["dead-culture", "psychedelic"],    energyBand: "any",  weight: 3, dutyCycle: 100, energyResponse: [0.03, 0.15, 1.5] },
  { name: "StealieFade",       layer: 2, category: "sacred", tags: ["dead-culture", "contemplative"],  energyBand: "low",  weight: 2, dutyCycle: 100 },
  { name: "RoseOverlay",       layer: 2, category: "sacred", tags: ["dead-culture", "contemplative"],  energyBand: "low",  weight: 2, dutyCycle: 100 },
  { name: "SkullRosesOverlay", layer: 2, category: "sacred", tags: ["dead-culture", "contemplative"],  energyBand: "mid",  weight: 2, dutyCycle: 100 },
  { name: "DancingTerrapinOverlay", layer: 2, category: "sacred", tags: ["dead-culture", "cosmic"],    energyBand: "low",  weight: 2, dutyCycle: 100 },
  { name: "SacredGeometry",    layer: 2, category: "sacred", tags: ["cosmic", "contemplative"],        energyBand: "mid",  weight: 2, dutyCycle: 36, energyResponse: [0.05, 0.18, 2.0] },
  { name: "SkullKaleidoscope", layer: 2, category: "sacred", tags: ["dead-culture", "psychedelic"],    energyBand: "mid",  weight: 3, dutyCycle: 100 },
  { name: "FractalZoom",       layer: 2, category: "sacred", tags: ["psychedelic", "cosmic"],           energyBand: "mid",  weight: 2 },
  { name: "Spirograph",        layer: 2, category: "sacred", tags: ["psychedelic", "mechanical"],       energyBand: "mid",  weight: 2 },
  { name: "LissajousCurves",   layer: 2, category: "sacred", tags: ["psychedelic", "mechanical"],       energyBand: "mid",  weight: 2 },
  { name: "MandalaGenerator",  layer: 2, category: "sacred", tags: ["cosmic", "contemplative"],        energyBand: "mid",  weight: 2 },
  { name: "ThirdEye",          layer: 2, category: "sacred", tags: ["psychedelic", "cosmic"],           energyBand: "mid",  weight: 3 },
  { name: "DarkStarPortal",    layer: 2, category: "sacred", tags: ["cosmic", "dead-culture"],          energyBand: "mid",  weight: 3 },
  { name: "StealYourFaceOff",  layer: 2, category: "sacred", tags: ["dead-culture", "intense"],        energyBand: "high", weight: 3, dutyCycle: 100 },
  { name: "CompassRose",       layer: 2, category: "sacred", tags: ["retro", "contemplative"],         energyBand: "low",  weight: 2 },
  { name: "StainedGlass",      layer: 2, category: "sacred", tags: ["contemplative", "cosmic"],        energyBand: "low",  weight: 2 },
  { name: "CelticKnot",        layer: 2, category: "sacred", tags: ["organic", "contemplative"],       energyBand: "low",  weight: 2 },
  { name: "LotusOpen",         layer: 2, category: "sacred", tags: ["contemplative", "organic"],       energyBand: "low",  weight: 2 },
  { name: "Totem",             layer: 2, category: "sacred", tags: ["organic", "dead-culture"],         energyBand: "mid",  weight: 2 },
  { name: "AstrolabeOverlay",  layer: 2, category: "sacred", tags: ["cosmic", "mechanical"],            energyBand: "mid",  weight: 2 },
  { name: "SunMandala",        layer: 2, category: "sacred", tags: ["cosmic", "psychedelic"],           energyBand: "mid",  weight: 2 },
  { name: "ThirteenPointBolt", layer: 2, category: "sacred", tags: ["dead-culture", "intense"],        energyBand: "high", weight: 3, dutyCycle: 100, energyResponse: [0.15, 0.30, 2.0] },
  { name: "SpaceDrums",        layer: 2, category: "sacred", tags: ["cosmic", "dead-culture"],         energyBand: "low",  weight: 3 },
  { name: "SkeletonRoses",     layer: 2, category: "sacred", tags: ["dead-culture", "organic"],        energyBand: "any",  weight: 3, dutyCycle: 100 },

  // ═══ Layer 3: Song-reactive effects (18) ═══
  { name: "LightningBoltOverlay", layer: 3, category: "reactive", tags: ["dead-culture", "intense"],   energyBand: "high", weight: 3, energyResponse: [0.20, 0.35, 2.0] },
  { name: "WaveformOverlay",     layer: 3, category: "reactive", tags: ["psychedelic", "organic"],        energyBand: "any",  weight: 1, dutyCycle: 100 },
  { name: "SongReactiveEffects", layer: 3, category: "reactive", tags: ["intense", "psychedelic"],       energyBand: "any",  weight: 2 },
  { name: "EnergyEffects",       layer: 3, category: "reactive", tags: ["intense", "psychedelic"],       energyBand: "any",  weight: 2 },
  { name: "WallOfSound",         layer: 3, category: "reactive", tags: ["intense", "festival"],          energyBand: "high", weight: 3, dutyCycle: 17, energyResponse: [0.15, 0.35, 2.0] },
  { name: "Oscilloscope",        layer: 3, category: "reactive", tags: ["mechanical", "retro"],          energyBand: "any",  weight: 2, dutyCycle: 100 },
  { name: "GuitarStrings",       layer: 3, category: "reactive", tags: ["organic", "dead-culture"],      energyBand: "mid",  weight: 2 },
  { name: "DrumCircles",         layer: 3, category: "reactive", tags: ["organic", "festival"],          energyBand: "mid",  weight: 2 },
  { name: "ParticleExplosion",   layer: 3, category: "reactive", tags: ["intense", "psychedelic"],       energyBand: "high", weight: 3, dutyCycle: 8, energyResponse: [0.20, 0.40, 2.5] },
  { name: "RipplePool",          layer: 3, category: "reactive", tags: ["aquatic", "contemplative"],     energyBand: "low",  weight: 1 },
  { name: "EmberRise",           layer: 3, category: "reactive", tags: ["intense", "organic"],           energyBand: "mid",  weight: 2, energyResponse: [0.10, 0.25, 1.8] },
  { name: "InkDrop",             layer: 3, category: "reactive", tags: ["organic", "psychedelic"],       energyBand: "mid",  weight: 2 },
  { name: "PlasmaBall",          layer: 3, category: "reactive", tags: ["intense", "psychedelic"],       energyBand: "high", weight: 2, energyResponse: [0.18, 0.35, 2.0] },
  { name: "LaserShow",           layer: 3, category: "reactive", tags: ["festival", "intense"],          energyBand: "high", weight: 3, energyResponse: [0.15, 0.30, 1.5] },
  { name: "VUMeters",            layer: 3, category: "reactive", tags: ["retro", "mechanical"],          energyBand: "any",  weight: 1 },
  { name: "StageLights",         layer: 3, category: "reactive", tags: ["festival", "intense"],          energyBand: "high", weight: 2, energyResponse: [0.12, 0.28, 1.5] },
  { name: "SpotlightFollow",     layer: 3, category: "reactive", tags: ["festival", "intense"],          energyBand: "mid",  weight: 2 },
  { name: "FogLaser",            layer: 3, category: "reactive", tags: ["festival", "psychedelic"],      energyBand: "mid",  weight: 2 },

  // ═══ Layer 4: Geometric / Physics (16) ═══
  { name: "OpArtPatterns",        layer: 4, category: "geometric", tags: ["psychedelic", "retro"],        energyBand: "mid",  weight: 2 },
  { name: "MoireInterference",    layer: 4, category: "geometric", tags: ["psychedelic", "mechanical"],   energyBand: "mid",  weight: 2 },
  { name: "TunnelVision",         layer: 4, category: "geometric", tags: ["psychedelic", "intense"],      energyBand: "mid",  weight: 2 },
  { name: "VortexSpiral",         layer: 4, category: "geometric", tags: ["psychedelic", "cosmic"],       energyBand: "mid",  weight: 2 },
  { name: "WormholeTransit",      layer: 4, category: "geometric", tags: ["cosmic", "psychedelic"],       energyBand: "high", weight: 3 },
  { name: "KaleidoscopeFilter",   layer: 4, category: "geometric", tags: ["psychedelic", "cosmic"],       energyBand: "mid",  weight: 2 },
  { name: "DoublePendulum",       layer: 4, category: "geometric", tags: ["mechanical", "contemplative"], energyBand: "mid",  weight: 2 },
  { name: "LorenzAttractor",      layer: 4, category: "geometric", tags: ["cosmic", "mechanical"],        energyBand: "mid",  weight: 2 },
  { name: "GameOfLife",            layer: 4, category: "geometric", tags: ["mechanical", "organic"],       energyBand: "mid",  weight: 2 },
  { name: "ReactionDiffusion",    layer: 4, category: "geometric", tags: ["organic", "psychedelic"],      energyBand: "mid",  weight: 2 },
  { name: "VoronoiFlow",          layer: 4, category: "geometric", tags: ["organic", "psychedelic"],      energyBand: "mid",  weight: 2 },
  { name: "FibonacciSpiral",      layer: 4, category: "geometric", tags: ["cosmic", "organic"],           energyBand: "mid",  weight: 2 },
  { name: "PenroseTiling",        layer: 4, category: "geometric", tags: ["mechanical", "cosmic"],        energyBand: "low",  weight: 2 },
  { name: "Paisley",              layer: 4, category: "geometric", tags: ["psychedelic", "organic"],      energyBand: "mid",  weight: 1 },
  { name: "CrystalGrowth",        layer: 4, category: "geometric", tags: ["organic", "cosmic"],           energyBand: "mid",  weight: 2 },
  { name: "MemphisDesign",        layer: 4, category: "geometric", tags: ["retro", "psychedelic"],        energyBand: "mid",  weight: 2 },

  // ═══ Layer 5: Nature / Cosmic / Space (35) ═══
  { name: "SolarFlare",       layer: 5, category: "nature", tags: ["cosmic", "intense"],           energyBand: "high", weight: 2, dutyCycle: 15 },
  { name: "JellyfishSwarm",   layer: 5, category: "nature", tags: ["aquatic", "organic"],          energyBand: "low",  weight: 2 },
  { name: "CrystalFormation", layer: 5, category: "nature", tags: ["cosmic", "organic"],           energyBand: "mid",  weight: 2 },
  { name: "SugarMagnolia",    layer: 5, category: "nature", tags: ["organic", "dead-culture"],     energyBand: "mid",  weight: 2 },
  { name: "ChinaCatSunflower",layer: 5, category: "nature", tags: ["psychedelic", "dead-culture"], energyBand: "mid",  weight: 2, dutyCycle: 14 },
  { name: "BoxOfRain",        layer: 5, category: "nature", tags: ["organic", "dead-culture"],     energyBand: "low",  weight: 2 },
  { name: "RippleLotus",      layer: 5, category: "nature", tags: ["aquatic", "contemplative"],    energyBand: "low",  weight: 1 },
  { name: "LighterWave",      layer: 5, category: "nature", tags: ["festival", "dead-culture"],    energyBand: "mid",  weight: 2 },
  { name: "MeteorShower",     layer: 5, category: "nature", tags: ["cosmic", "intense"],           energyBand: "mid",  weight: 2 },
  { name: "Constellation",    layer: 5, category: "nature", tags: ["cosmic", "contemplative"],     energyBand: "low",  weight: 1 },
  { name: "PlanetaryRings",   layer: 5, category: "nature", tags: ["cosmic"],                      energyBand: "mid",  weight: 2 },
  { name: "DNAHelix",         layer: 5, category: "nature", tags: ["organic", "cosmic"],           energyBand: "mid",  weight: 2 },
  { name: "TreeOfLife",        layer: 5, category: "nature", tags: ["organic", "contemplative"],    energyBand: "low",  weight: 2 },
  { name: "Thunderhead",      layer: 5, category: "nature", tags: ["intense", "organic"],          energyBand: "high", weight: 2 },
  { name: "MushroomBloom",    layer: 5, category: "nature", tags: ["organic", "psychedelic"],      energyBand: "mid",  weight: 2 },
  { name: "ButterflySwarm",   layer: 5, category: "nature", tags: ["organic", "contemplative"],    energyBand: "mid",  weight: 2 },
  { name: "Flock",            layer: 5, category: "nature", tags: ["organic", "contemplative"],    energyBand: "mid",  weight: 2 },
  { name: "CherryBlossom",    layer: 5, category: "nature", tags: ["organic", "contemplative"],    energyBand: "low",  weight: 1 },
  { name: "CoralReef",        layer: 5, category: "nature", tags: ["aquatic", "organic"],          energyBand: "low",  weight: 2 },
  { name: "SolarEclipse",     layer: 5, category: "nature", tags: ["cosmic", "intense"],           energyBand: "mid",  weight: 3 },
  { name: "CometTail",        layer: 5, category: "nature", tags: ["cosmic"],                      energyBand: "mid",  weight: 2 },
  { name: "VolcanoFlow",      layer: 5, category: "nature", tags: ["intense", "organic"],          energyBand: "high", weight: 3 },
  { name: "ShadowPuppets",    layer: 5, category: "nature", tags: ["organic", "retro"],            energyBand: "low",  weight: 2 },
  { name: "UFOBeam",          layer: 5, category: "nature", tags: ["cosmic", "psychedelic"],       energyBand: "mid",  weight: 2 },
  { name: "BlackHole",        layer: 5, category: "nature", tags: ["cosmic", "intense"],           energyBand: "mid",  weight: 3 },
  { name: "WarpDrive",        layer: 5, category: "nature", tags: ["cosmic", "intense"],           energyBand: "high", weight: 3 },
  { name: "Supernova",        layer: 5, category: "nature", tags: ["cosmic", "intense"],           energyBand: "high", weight: 3 },
  { name: "Octopus",          layer: 5, category: "nature", tags: ["aquatic", "organic"],          energyBand: "mid",  weight: 2 },
  { name: "Peacock",          layer: 5, category: "nature", tags: ["organic", "psychedelic"],      energyBand: "mid",  weight: 2 },
  { name: "MoonPhases",       layer: 5, category: "nature", tags: ["cosmic", "contemplative"],     energyBand: "low",  weight: 1 },
  { name: "ShootingStar",     layer: 5, category: "nature", tags: ["cosmic"],                      energyBand: "mid",  weight: 1 },
  { name: "EclipseCorona",    layer: 5, category: "nature", tags: ["cosmic", "intense"],           energyBand: "mid",  weight: 2 },
  { name: "GalaxyArm",        layer: 5, category: "nature", tags: ["cosmic"],                      energyBand: "mid",  weight: 2 },
  { name: "Pulsar",           layer: 5, category: "nature", tags: ["cosmic", "intense"],           energyBand: "high", weight: 2 },
  { name: "Orrery",           layer: 5, category: "nature", tags: ["cosmic", "mechanical"],        energyBand: "mid",  weight: 2 },

  // ═══ Layer 6: Character parades / Dead album art (22) ═══
  { name: "SkeletonBand",     layer: 6, category: "character", tags: ["dead-culture", "festival"],     energyBand: "mid",  weight: 2, dutyCycle: 25 },
  { name: "DeadIcons",        layer: 6, category: "character", tags: ["dead-culture"],                 energyBand: "any",  weight: 2, dutyCycle: 100 },
  { name: "BearParade",       layer: 6, category: "character", tags: ["dead-culture", "festival"],     energyBand: "mid",  weight: 2, dutyCycle: 30 },
  { name: "MushroomForest",   layer: 6, category: "character", tags: ["psychedelic", "dead-culture"],  energyBand: "mid",  weight: 2 },
  { name: "MarchingTerrapins",layer: 6, category: "character", tags: ["dead-culture", "organic"],      energyBand: "mid",  weight: 2 },
  { name: "CosmicCharlie",    layer: 6, category: "character", tags: ["dead-culture", "cosmic"],       energyBand: "mid",  weight: 2 },
  { name: "SkeletonCouple",   layer: 6, category: "character", tags: ["dead-culture"],                 energyBand: "mid",  weight: 2 },
  { name: "UncleSam",         layer: 6, category: "character", tags: ["dead-culture", "retro"],        energyBand: "mid",  weight: 2 },
  { name: "LotScene",         layer: 6, category: "character", tags: ["dead-culture", "festival"],     energyBand: "low",  weight: 2 },
  { name: "CrowdSilhouette",  layer: 6, category: "character", tags: ["festival", "dead-culture"],     energyBand: "mid",  weight: 2 },
  { name: "Bertha",           layer: 6, category: "character", tags: ["dead-culture"],                 energyBand: "mid",  weight: 3 },
  { name: "AmericanBeauty",   layer: 6, category: "character", tags: ["dead-culture", "organic"],      energyBand: "low",  weight: 2 },
  { name: "PhoenixWings",     layer: 6, category: "character", tags: ["cosmic", "intense"],            energyBand: "high", weight: 3 },
  { name: "HotAirBalloons",   layer: 6, category: "character", tags: ["retro", "contemplative"],       energyBand: "low",  weight: 2, dutyCycle: 100 },
  { name: "CarouselHorses",   layer: 6, category: "character", tags: ["retro", "festival"],            energyBand: "mid",  weight: 2 },
  { name: "FerrisWheel",      layer: 6, category: "character", tags: ["retro", "festival"],            energyBand: "mid",  weight: 2 },
  { name: "DreamCatcher",     layer: 6, category: "character", tags: ["organic", "dead-culture"],      energyBand: "low",  weight: 2 },
  { name: "MoshPit",          layer: 6, category: "character", tags: ["festival", "intense"],          energyBand: "high", weight: 3, dutyCycle: 40 },
  { name: "StageDive",        layer: 6, category: "character", tags: ["festival", "intense"],          energyBand: "high", weight: 3 },
  { name: "JerryGuitar",      layer: 6, category: "character", tags: ["dead-culture", "organic"],      energyBand: "mid",  weight: 2, dutyCycle: 33 },
  { name: "VWBusParade",      layer: 6, category: "character", tags: ["dead-culture", "festival"],     energyBand: "low",  weight: 2 },

  // ═══ Layer 7: Frame & info (22) ═══
  { name: "PsychedelicBorder", layer: 7, category: "artifact", tags: ["psychedelic", "dead-culture"],   energyBand: "mid",  weight: 2 },
  { name: "ConcertInfo",       layer: 7, category: "artifact", tags: ["dead-culture"],                  energyBand: "any",  weight: 1 },
  { name: "SongTitle",         layer: 7, category: "artifact", tags: ["dead-culture"],                  energyBand: "any",  weight: 1, alwaysActive: true },
  { name: "SetlistScroll",     layer: 7, category: "artifact", tags: ["dead-culture", "retro"],         energyBand: "low",  weight: 1 },
  { name: "BumperStickers",    layer: 7, category: "artifact", tags: ["dead-culture", "retro"],         energyBand: "mid",  weight: 1 },
  { name: "BootlegLabel",      layer: 7, category: "artifact", tags: ["dead-culture", "retro"],         energyBand: "low",  weight: 1 },
  { name: "TourPosterGallery", layer: 7, category: "artifact", tags: ["dead-culture", "retro"],         energyBand: "mid",  weight: 2 },
  { name: "TicketStubAnimated",layer: 7, category: "artifact", tags: ["dead-culture", "retro"],         energyBand: "mid",  weight: 1 },
  { name: "PeaceSignShower",   layer: 7, category: "artifact", tags: ["dead-culture", "festival"],      energyBand: "mid",  weight: 2 },
  { name: "WarholGrid",        layer: 7, category: "artifact", tags: ["retro", "psychedelic"],           energyBand: "mid",  weight: 2 },
  { name: "ComicExplosions",   layer: 7, category: "artifact", tags: ["retro", "intense"],              energyBand: "high", weight: 2 },
  { name: "LensFlare",         layer: 7, category: "artifact", tags: ["cosmic", "festival"],             energyBand: "mid",  weight: 1 },
  { name: "PrismRainbow",      layer: 7, category: "artifact", tags: ["psychedelic", "cosmic"],          energyBand: "mid",  weight: 2 },
  { name: "NeonSign",          layer: 7, category: "artifact", tags: ["retro", "festival"],              energyBand: "mid",  weight: 2 },
  { name: "GraffitiTag",       layer: 7, category: "artifact", tags: ["retro", "intense"],              energyBand: "mid",  weight: 2 },
  { name: "ChalkBoard",        layer: 7, category: "artifact", tags: ["retro", "contemplative"],        energyBand: "low",  weight: 1 },
  { name: "Confetti",          layer: 7, category: "artifact", tags: ["festival"],                       energyBand: "high", weight: 2, dutyCycle: 100 },
  { name: "ConfettiCannon",    layer: 7, category: "artifact", tags: ["festival", "intense"],            energyBand: "high", weight: 2 },
  { name: "MarqueeLights",     layer: 7, category: "artifact", tags: ["festival", "retro"],              energyBand: "mid",  weight: 2 },
  { name: "HoneycombGrid",     layer: 7, category: "artifact", tags: ["organic", "mechanical"],         energyBand: "mid",  weight: 1 },
  { name: "Pyrotechnics",      layer: 7, category: "artifact", tags: ["festival", "intense"],            energyBand: "high", weight: 2 },
  { name: "GlowSticks",        layer: 7, category: "artifact", tags: ["festival", "psychedelic"],        energyBand: "mid",  weight: 1 },

  // ═══ Layer 8: Typography (4) ═══
  { name: "LyricFlash",   layer: 8, category: "info", tags: ["dead-culture", "psychedelic"],   energyBand: "mid",  weight: 2 },
  { name: "GarciaQuotes",  layer: 8, category: "info", tags: ["dead-culture", "contemplative"], energyBand: "low",  weight: 2 },
  { name: "MantraScroll",  layer: 8, category: "info", tags: ["cosmic", "contemplative"],       energyBand: "low",  weight: 1 },
  { name: "AsciiRain",    layer: 8, category: "info", tags: ["retro", "mechanical"],            energyBand: "mid",  weight: 2 },

  // ═══ Layer 9: HUD elements (4) ═══
  { name: "CassetteReels",   layer: 9, category: "hud", tags: ["retro", "dead-culture"],     energyBand: "any",  weight: 2 },
  { name: "NixieTubes",      layer: 9, category: "hud", tags: ["retro", "mechanical"],       energyBand: "mid",  weight: 2 },
  { name: "HeartbeatEKG",    layer: 9, category: "hud", tags: ["organic", "intense"],        energyBand: "any",  weight: 1 },
  { name: "HolographicDisc", layer: 9, category: "hud", tags: ["cosmic", "psychedelic"],     energyBand: "mid",  weight: 2 },

  // ═══ Layer 10: Distortion / Film treatment (7) ═══
  { name: "ChromaticAberration",  layer: 10, category: "distortion", tags: ["psychedelic"],                energyBand: "mid",  weight: 2 },
  { name: "ChromaticSplit",       layer: 10, category: "distortion", tags: ["psychedelic", "intense"],     energyBand: "mid",  weight: 2 },
  { name: "VHSGlitch",           layer: 10, category: "distortion", tags: ["retro", "psychedelic"],       energyBand: "mid",  weight: 2 },
  { name: "FilmBurn",            layer: 10, category: "distortion", tags: ["retro"],                      energyBand: "mid",  weight: 2 },
  { name: "VinylGrooves",        layer: 10, category: "distortion", tags: ["retro", "dead-culture"],      energyBand: "mid",  weight: 1 },
  { name: "PixelExplosion",      layer: 10, category: "distortion", tags: ["intense", "psychedelic"],     energyBand: "high", weight: 3 },
  { name: "FilmGrain",           layer: 10, category: "distortion", tags: ["retro"],                      energyBand: "any",  weight: 1, alwaysActive: true },

];

// ─── Parametric Overlays (52 variants across 7 families) ───
import { PARAMETRIC_REGISTRY_ENTRIES } from "../components/parametric";
for (const entry of PARAMETRIC_REGISTRY_ENTRIES) {
  OVERLAY_REGISTRY.push(entry);
}

/**
 * Registry of all selectable overlays — the curated pool.
 * 163 filler overlays removed (see OVERLAY-AUDIT.md).
 * Component files preserved — any overlay can be restored by re-adding here.
 */
export const SELECTABLE_REGISTRY = [...OVERLAY_REGISTRY];

/** Quick lookup by name */
export const OVERLAY_BY_NAME = new Map(
  OVERLAY_REGISTRY.map((entry) => [entry.name, entry]),
);

// ─── Tier Assignments ───
// A=essential (~33): iconic Dead overlays, best atmospherics/reactives
// B=good (~42): well-animated, fills pool for longer shows
// C=archived (everything else): excluded from selection

const A_TIER = new Set([
  // Sacred
  "BreathingStealie", "ThirteenPointBolt", "StealYourFaceOff", "SkullKaleidoscope",
  "SacredGeometry", "DarkStarPortal", "SkeletonRoses",
  // Character
  "BearParade", "SkeletonBand", "MarchingTerrapins", "Bertha", "JerryGuitar",
  "VWBusParade", "CosmicCharlie", "AmericanBeauty",
  // Atmospheric
  "CosmicStarfield", "TieDyeWash", "Fireflies", "CampfireSparks",
  // Reactive
  "WallOfSound", "LaserShow", "ParticleExplosion", "LightningBoltOverlay",
  // Nature
  "SolarFlare", "Supernova", "BlackHole",
  // Culture
  "ChinaCatSunflower", "SugarMagnolia", "BoxOfRain",
  // Distortion
  "ChromaticAberration", "VHSGlitch",
  // Info
  "CassetteReels", "BootlegLabel",
]);

const B_TIER = new Set([
  // Atmospheric
  "SmokeWisps", "AuroraBorealis", "OilSlick", "NebulaCloud", "CandleFlicker",
  "GodRays", "NorthernLights",
  // Sacred
  "StealieFade", "SkullRosesOverlay", "DancingTerrapinOverlay", "FractalZoom",
  "MandalaGenerator", "SpaceDrums",
  // Reactive
  "WaveformOverlay", "Oscilloscope", "EmberRise", "StageLights",
  // Geometric
  "VortexSpiral", "WormholeTransit", "KaleidoscopeFilter",
  // Nature
  "MeteorShower", "SolarEclipse", "JellyfishSwarm", "Constellation",
  "WarpDrive", "Thunderhead",
  // Character
  "DeadIcons", "MushroomForest", "CrowdSilhouette", "PhoenixWings",
  // Artifact
  "SongTitle", "PsychedelicBorder",
  // Typography
  "LyricFlash", "GarciaQuotes",
  // HUD
  "NixieTubes",
  // Distortion
  "FilmBurn", "FilmGrain", "VinylGrooves",
  // Parametric
  "ParticleField_Fireflies", "TieDyePattern_Spiral",
  "DeadMotif_StealiePulse", "FluidLight_OilGlass",
]);

for (const entry of OVERLAY_REGISTRY) {
  if (A_TIER.has(entry.name)) entry.tier = "A";
  else if (B_TIER.has(entry.name)) entry.tier = "B";
  else entry.tier = "C";
}

/** Always-active overlays (rendered regardless of selection) */
export const ALWAYS_ACTIVE = OVERLAY_REGISTRY
  .filter((e) => e.alwaysActive)
  .map((e) => e.name);
