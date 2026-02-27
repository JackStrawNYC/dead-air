/**
 * Parametric Overlay Library — barrel export.
 *
 * 50 total variants across 7 parametric component families.
 * Exports PARAMETRIC_COMPONENTS (for overlay-components.ts) and
 * PARAMETRIC_REGISTRY_ENTRIES (for overlay-registry.ts).
 */

import type { OverlayEntry } from "../../data/types";
import type { OverlayComponentEntry } from "./types";

// ─── Component Imports ───

import {
  ParticleField_Fireflies,
  ParticleField_Stardust,
  ParticleField_Embers,
  ParticleField_PollenDrift,
  ParticleField_AuroraMotes,
  ParticleField_SpiritOrbs,
  ParticleField_RainSparkle,
  ParticleField_DandelionSeeds,
} from "./ParticleField";

import {
  TieDyePattern_Spiral,
  TieDyePattern_Bullseye,
  TieDyePattern_Crumple,
  TieDyePattern_Sunburst,
  TieDyePattern_IceDye,
  TieDyePattern_Shibori,
  TieDyePattern_NebulaWash,
  TieDyePattern_LiquidPour,
} from "./TieDyePattern";

import {
  SacredPattern_Mandala,
  SacredPattern_FlowerOfLife,
  SacredPattern_MetatronsCube,
  SacredPattern_SriYantra,
  SacredPattern_SeedOfLife,
  SacredPattern_TorusKnot,
  SacredPattern_VesicaPiscis,
  SacredPattern_GoldenSpiral,
} from "./SacredPattern";

import {
  DeadMotif_SkeletonMarch,
  DeadMotif_BearParade,
  DeadMotif_RoseGarden,
  DeadMotif_BoltFlash,
  DeadMotif_TerrapinDrift,
  DeadMotif_ScarabScatter,
  DeadMotif_StealiePulse,
  DeadMotif_MushroomBloom,
} from "./DeadMotif";

import {
  CrowdEnergy_LighterWave,
  CrowdEnergy_CrowdSway,
  CrowdEnergy_ClapSync,
  CrowdEnergy_DanceFloor,
  CrowdEnergy_HandsUp,
  CrowdEnergy_HeadBob,
} from "./CrowdEnergy";

import {
  VenueAtmosphere_StageWash,
  VenueAtmosphere_SpotlightSweep,
  VenueAtmosphere_HazeLayer,
  VenueAtmosphere_ParCans,
  VenueAtmosphere_FollowSpot,
  VenueAtmosphere_GoboPattern,
} from "./VenueAtmosphere";

import {
  FluidLight_OilGlass,
  FluidLight_LavaFlow,
  FluidLight_Aurora,
  FluidLight_SmokeWisps,
  FluidLight_PlasmaField,
  FluidLight_InkWater,
} from "./FluidLight";

// ─── Component Map (for overlay-components.ts) ───

export const PARAMETRIC_COMPONENTS: Record<string, OverlayComponentEntry> = {
  // ParticleField (Layer 1, 3) — 8 variants
  ParticleField_Fireflies:     { Component: ParticleField_Fireflies, layer: 1 },
  ParticleField_Stardust:      { Component: ParticleField_Stardust, layer: 1 },
  ParticleField_Embers:        { Component: ParticleField_Embers, layer: 3 },
  ParticleField_PollenDrift:   { Component: ParticleField_PollenDrift, layer: 1 },
  ParticleField_AuroraMotes:   { Component: ParticleField_AuroraMotes, layer: 1 },
  ParticleField_SpiritOrbs:    { Component: ParticleField_SpiritOrbs, layer: 1 },
  ParticleField_RainSparkle:   { Component: ParticleField_RainSparkle, layer: 3 },
  ParticleField_DandelionSeeds:{ Component: ParticleField_DandelionSeeds, layer: 1 },

  // TieDyePattern (Layer 1) — 8 variants
  TieDyePattern_Spiral:     { Component: TieDyePattern_Spiral, layer: 1 },
  TieDyePattern_Bullseye:   { Component: TieDyePattern_Bullseye, layer: 1 },
  TieDyePattern_Crumple:    { Component: TieDyePattern_Crumple, layer: 1 },
  TieDyePattern_Sunburst:   { Component: TieDyePattern_Sunburst, layer: 1 },
  TieDyePattern_IceDye:     { Component: TieDyePattern_IceDye, layer: 1 },
  TieDyePattern_Shibori:    { Component: TieDyePattern_Shibori, layer: 1 },
  TieDyePattern_NebulaWash: { Component: TieDyePattern_NebulaWash, layer: 1 },
  TieDyePattern_LiquidPour: { Component: TieDyePattern_LiquidPour, layer: 1 },

  // SacredPattern (Layer 2) — 8 variants
  SacredPattern_Mandala:       { Component: SacredPattern_Mandala, layer: 2 },
  SacredPattern_FlowerOfLife:  { Component: SacredPattern_FlowerOfLife, layer: 2 },
  SacredPattern_MetatronsCube: { Component: SacredPattern_MetatronsCube, layer: 2 },
  SacredPattern_SriYantra:     { Component: SacredPattern_SriYantra, layer: 2 },
  SacredPattern_SeedOfLife:    { Component: SacredPattern_SeedOfLife, layer: 2 },
  SacredPattern_TorusKnot:     { Component: SacredPattern_TorusKnot, layer: 2 },
  SacredPattern_VesicaPiscis:  { Component: SacredPattern_VesicaPiscis, layer: 2 },
  SacredPattern_GoldenSpiral:  { Component: SacredPattern_GoldenSpiral, layer: 2 },

  // DeadMotif (Layer 6) — 8 variants
  DeadMotif_SkeletonMarch: { Component: DeadMotif_SkeletonMarch, layer: 6 },
  DeadMotif_BearParade:    { Component: DeadMotif_BearParade, layer: 6 },
  DeadMotif_RoseGarden:    { Component: DeadMotif_RoseGarden, layer: 6 },
  DeadMotif_BoltFlash:     { Component: DeadMotif_BoltFlash, layer: 6 },
  DeadMotif_TerrapinDrift: { Component: DeadMotif_TerrapinDrift, layer: 6 },
  DeadMotif_ScarabScatter: { Component: DeadMotif_ScarabScatter, layer: 6 },
  DeadMotif_StealiePulse:  { Component: DeadMotif_StealiePulse, layer: 6 },
  DeadMotif_MushroomBloom: { Component: DeadMotif_MushroomBloom, layer: 6 },

  // CrowdEnergy (Layer 6) — 6 variants
  CrowdEnergy_LighterWave: { Component: CrowdEnergy_LighterWave, layer: 6 },
  CrowdEnergy_CrowdSway:   { Component: CrowdEnergy_CrowdSway, layer: 6 },
  CrowdEnergy_ClapSync:    { Component: CrowdEnergy_ClapSync, layer: 6 },
  CrowdEnergy_DanceFloor:  { Component: CrowdEnergy_DanceFloor, layer: 6 },
  CrowdEnergy_HandsUp:     { Component: CrowdEnergy_HandsUp, layer: 6 },
  CrowdEnergy_HeadBob:     { Component: CrowdEnergy_HeadBob, layer: 6 },

  // VenueAtmosphere (Layer 3, 7) — 6 variants
  VenueAtmosphere_StageWash:      { Component: VenueAtmosphere_StageWash, layer: 3 },
  VenueAtmosphere_SpotlightSweep: { Component: VenueAtmosphere_SpotlightSweep, layer: 3 },
  VenueAtmosphere_HazeLayer:      { Component: VenueAtmosphere_HazeLayer, layer: 7 },
  VenueAtmosphere_ParCans:        { Component: VenueAtmosphere_ParCans, layer: 3 },
  VenueAtmosphere_FollowSpot:     { Component: VenueAtmosphere_FollowSpot, layer: 3 },
  VenueAtmosphere_GoboPattern:    { Component: VenueAtmosphere_GoboPattern, layer: 7 },

  // FluidLight (Layer 1, 2) — 6 variants
  FluidLight_OilGlass:    { Component: FluidLight_OilGlass, layer: 1 },
  FluidLight_LavaFlow:    { Component: FluidLight_LavaFlow, layer: 1 },
  FluidLight_Aurora:      { Component: FluidLight_Aurora, layer: 1 },
  FluidLight_SmokeWisps:  { Component: FluidLight_SmokeWisps, layer: 2 },
  FluidLight_PlasmaField: { Component: FluidLight_PlasmaField, layer: 1 },
  FluidLight_InkWater:    { Component: FluidLight_InkWater, layer: 2 },
};

// ─── Registry Entries (for overlay-registry.ts) ───

export const PARAMETRIC_REGISTRY_ENTRIES: OverlayEntry[] = [
  // ParticleField — 8 variants
  { name: "ParticleField_Fireflies",      layer: 1, category: "atmospheric", tags: ["organic", "contemplative"],      energyBand: "low",  weight: 1 },
  { name: "ParticleField_Stardust",       layer: 1, category: "atmospheric", tags: ["cosmic", "contemplative"],       energyBand: "low",  weight: 1 },
  { name: "ParticleField_Embers",         layer: 3, category: "reactive",    tags: ["organic", "intense"],            energyBand: "mid",  weight: 1 },
  { name: "ParticleField_PollenDrift",    layer: 1, category: "atmospheric", tags: ["organic", "contemplative"],      energyBand: "low",  weight: 1 },
  { name: "ParticleField_AuroraMotes",    layer: 1, category: "atmospheric", tags: ["cosmic", "psychedelic"],          energyBand: "low",  weight: 1 },
  { name: "ParticleField_SpiritOrbs",     layer: 1, category: "atmospheric", tags: ["cosmic", "contemplative"],       energyBand: "low",  weight: 1 },
  { name: "ParticleField_RainSparkle",    layer: 3, category: "reactive",    tags: ["organic", "aquatic"],            energyBand: "mid",  weight: 1 },
  { name: "ParticleField_DandelionSeeds", layer: 1, category: "atmospheric", tags: ["organic", "contemplative"],      energyBand: "low",  weight: 1 },

  // TieDyePattern — 8 variants
  { name: "TieDyePattern_Spiral",     layer: 1, category: "atmospheric", tags: ["psychedelic", "dead-culture"],    energyBand: "any",  weight: 1 },
  { name: "TieDyePattern_Bullseye",   layer: 1, category: "atmospheric", tags: ["psychedelic", "retro"],           energyBand: "mid",  weight: 1 },
  { name: "TieDyePattern_Crumple",    layer: 1, category: "atmospheric", tags: ["psychedelic", "organic"],         energyBand: "any",  weight: 1 },
  { name: "TieDyePattern_Sunburst",   layer: 1, category: "atmospheric", tags: ["psychedelic", "intense"],         energyBand: "mid",  weight: 1 },
  { name: "TieDyePattern_IceDye",     layer: 1, category: "atmospheric", tags: ["psychedelic", "contemplative"],   energyBand: "low",  weight: 1 },
  { name: "TieDyePattern_Shibori",    layer: 1, category: "atmospheric", tags: ["psychedelic", "retro"],           energyBand: "mid",  weight: 1 },
  { name: "TieDyePattern_NebulaWash", layer: 1, category: "atmospheric", tags: ["cosmic", "psychedelic"],          energyBand: "low",  weight: 1 },
  { name: "TieDyePattern_LiquidPour", layer: 1, category: "atmospheric", tags: ["psychedelic", "intense"],         energyBand: "high", weight: 1 },

  // SacredPattern — 8 variants
  { name: "SacredPattern_Mandala",       layer: 2, category: "sacred", tags: ["cosmic", "contemplative"],        energyBand: "mid",  weight: 2 },
  { name: "SacredPattern_FlowerOfLife",  layer: 2, category: "sacred", tags: ["cosmic", "contemplative"],        energyBand: "mid",  weight: 2 },
  { name: "SacredPattern_MetatronsCube", layer: 2, category: "sacred", tags: ["cosmic", "mechanical"],           energyBand: "mid",  weight: 2 },
  { name: "SacredPattern_SriYantra",     layer: 2, category: "sacred", tags: ["cosmic", "contemplative"],        energyBand: "mid",  weight: 2 },
  { name: "SacredPattern_SeedOfLife",    layer: 2, category: "sacred", tags: ["cosmic", "organic"],              energyBand: "mid",  weight: 2 },
  { name: "SacredPattern_TorusKnot",     layer: 2, category: "sacred", tags: ["cosmic", "psychedelic"],           energyBand: "mid",  weight: 2 },
  { name: "SacredPattern_VesicaPiscis",  layer: 2, category: "sacred", tags: ["cosmic", "contemplative"],        energyBand: "low",  weight: 2 },
  { name: "SacredPattern_GoldenSpiral",  layer: 2, category: "sacred", tags: ["cosmic", "organic"],              energyBand: "mid",  weight: 2 },

  // DeadMotif — 8 variants
  { name: "DeadMotif_SkeletonMarch", layer: 6, category: "character", tags: ["dead-culture", "festival"],        energyBand: "mid",  weight: 2 },
  { name: "DeadMotif_BearParade",    layer: 6, category: "character", tags: ["dead-culture", "festival"],        energyBand: "mid",  weight: 2 },
  { name: "DeadMotif_RoseGarden",    layer: 6, category: "character", tags: ["dead-culture", "organic"],         energyBand: "low",  weight: 1 },
  { name: "DeadMotif_BoltFlash",     layer: 6, category: "character", tags: ["dead-culture", "intense"],         energyBand: "high", weight: 2 },
  { name: "DeadMotif_TerrapinDrift", layer: 6, category: "character", tags: ["dead-culture", "contemplative"],   energyBand: "low",  weight: 1 },
  { name: "DeadMotif_ScarabScatter", layer: 6, category: "character", tags: ["cosmic", "dead-culture"],          energyBand: "mid",  weight: 1 },
  { name: "DeadMotif_StealiePulse",  layer: 6, category: "character", tags: ["dead-culture", "psychedelic"],     energyBand: "any",  weight: 3 },
  { name: "DeadMotif_MushroomBloom", layer: 6, category: "character", tags: ["dead-culture", "psychedelic"],     energyBand: "mid",  weight: 1 },

  // CrowdEnergy — 6 variants
  { name: "CrowdEnergy_LighterWave", layer: 6, category: "character", tags: ["festival", "contemplative"],       energyBand: "low",  weight: 2 },
  { name: "CrowdEnergy_CrowdSway",   layer: 6, category: "character", tags: ["festival", "organic"],            energyBand: "mid",  weight: 1 },
  { name: "CrowdEnergy_ClapSync",    layer: 6, category: "character", tags: ["festival", "intense"],            energyBand: "high", weight: 1 },
  { name: "CrowdEnergy_DanceFloor",  layer: 6, category: "character", tags: ["festival", "intense"],            energyBand: "high", weight: 2 },
  { name: "CrowdEnergy_HandsUp",     layer: 6, category: "character", tags: ["festival", "intense"],            energyBand: "high", weight: 1 },
  { name: "CrowdEnergy_HeadBob",     layer: 6, category: "character", tags: ["festival", "organic"],            energyBand: "mid",  weight: 1 },

  // VenueAtmosphere — 6 variants
  { name: "VenueAtmosphere_StageWash",      layer: 3, category: "reactive",    tags: ["festival", "psychedelic"],        energyBand: "any",  weight: 1 },
  { name: "VenueAtmosphere_SpotlightSweep", layer: 3, category: "reactive",    tags: ["festival"],                      energyBand: "mid",  weight: 1 },
  { name: "VenueAtmosphere_HazeLayer",      layer: 7, category: "artifact",    tags: ["festival", "contemplative"],     energyBand: "any",  weight: 1 },
  { name: "VenueAtmosphere_ParCans",        layer: 3, category: "reactive",    tags: ["festival", "psychedelic"],        energyBand: "mid",  weight: 1 },
  { name: "VenueAtmosphere_FollowSpot",     layer: 3, category: "reactive",    tags: ["festival"],                      energyBand: "mid",  weight: 1 },
  { name: "VenueAtmosphere_GoboPattern",    layer: 7, category: "artifact",    tags: ["festival", "psychedelic"],        energyBand: "mid",  weight: 1 },

  // FluidLight — 6 variants (weight=3 → only 1 active at a time)
  { name: "FluidLight_OilGlass",    layer: 1, category: "atmospheric", tags: ["psychedelic", "organic"],         energyBand: "any",  weight: 3 },
  { name: "FluidLight_LavaFlow",    layer: 1, category: "atmospheric", tags: ["psychedelic", "intense"],         energyBand: "mid",  weight: 3 },
  { name: "FluidLight_Aurora",      layer: 1, category: "atmospheric", tags: ["cosmic", "contemplative"],       energyBand: "low",  weight: 3 },
  { name: "FluidLight_SmokeWisps",  layer: 2, category: "atmospheric", tags: ["organic", "contemplative"],      energyBand: "low",  weight: 3 },
  { name: "FluidLight_PlasmaField", layer: 1, category: "atmospheric", tags: ["psychedelic", "intense"],         energyBand: "high", weight: 3 },
  { name: "FluidLight_InkWater",    layer: 2, category: "atmospheric", tags: ["psychedelic", "contemplative"],   energyBand: "low",  weight: 3 },
];
