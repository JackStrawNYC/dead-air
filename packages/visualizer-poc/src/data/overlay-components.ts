/**
 * Overlay Component Map — maps overlay names to their React components + layer.
 * This file centralizes all overlay imports so SongVisualizer can render dynamically.
 *
 * Components with special props (SongTitle, ConcertInfo, SetlistScroll, FilmGrain)
 * are NOT included here — they remain hardcoded in SongVisualizer.tsx.
 *
 * Culled to 30 keepers (2026-03-07). Component files preserved in src/components/.
 */
import React from "react";
import type { EnhancedFrameData } from "./types";

// ─── Layer 1: Atmospheric (4) ───
import { CosmicStarfield } from "../components/CosmicStarfield";
import { TieDyeWash } from "../components/TieDyeWash";
import { LavaLamp } from "../components/LavaLamp";
import { Fireflies } from "../components/Fireflies";

// ─── Layer 2: Sacred / Center-stage (10) ───
import { BreathingStealie } from "../components/BreathingStealie";
import { ThirteenPointBolt } from "../components/ThirteenPointBolt";
import { StealYourFaceOff } from "../components/StealYourFaceOff";
import { SkullKaleidoscope } from "../components/SkullKaleidoscope";
import { SkeletonRoses } from "../components/SkeletonRoses";
import { SacredGeometry } from "../components/SacredGeometry";
import { DarkStarPortal } from "../components/DarkStarPortal";
import { FractalZoom } from "../components/FractalZoom";
import { MandalaGenerator } from "../components/MandalaGenerator";
import { RoseOverlay } from "../components/RoseOverlay";

// ─── Layer 3: Reactive (5) ───
import { LightningBoltOverlay } from "../components/LightningBoltOverlay";
import { ParticleExplosion } from "../components/ParticleExplosion";
import { LaserShow } from "../components/LaserShow";
import { EmberRise } from "../components/EmberRise";
import { WallOfSound } from "../components/WallOfSound";

// ─── Layer 5: Song References (3) ───
import { ChinaCatSunflower } from "../components/ChinaCatSunflower";
import { SugarMagnolia } from "../components/SugarMagnolia";
import { BoxOfRain } from "../components/BoxOfRain";

// ─── Layer 6: Character / Dead Culture (7) ───
import { BearParade } from "../components/BearParade";
import { SkeletonBand } from "../components/SkeletonBand";
import { MarchingTerrapins } from "../components/MarchingTerrapins";
import { Bertha } from "../components/Bertha";
import { JerryGuitar } from "../components/JerryGuitar";
import { VWBusParade } from "../components/VWBusParade";
import { CosmicCharlie } from "../components/CosmicCharlie";

// ─── Layer 10: Distortion (1) ───
import { VHSGlitch } from "../components/VHSGlitch";

/**
 * Standard overlay component: takes only { frames: EnhancedFrameData[] }
 * Components with custom props (SongTitle, ConcertInfo, SetlistScroll, FilmGrain)
 * are handled separately in SongVisualizer.tsx.
 */
export interface OverlayComponentEntry {
  Component: React.ComponentType<{ frames: EnhancedFrameData[] }>;
  layer: number;
  /** Render context: 'dom' for HTML/CSS overlays, 'glsl' for Three.js shader overlays */
  renderContext?: 'dom' | 'glsl';
}

export const OVERLAY_COMPONENTS: Record<string, OverlayComponentEntry> = {
  // Layer 1: Atmospheric
  CosmicStarfield:   { Component: CosmicStarfield, layer: 1 },
  TieDyeWash:        { Component: TieDyeWash, layer: 1 },
  LavaLamp:          { Component: LavaLamp, layer: 1 },
  Fireflies:         { Component: Fireflies, layer: 1 },

  // Layer 2: Sacred / Center-stage
  BreathingStealie:  { Component: BreathingStealie, layer: 2 },
  ThirteenPointBolt: { Component: ThirteenPointBolt, layer: 2 },
  StealYourFaceOff:  { Component: StealYourFaceOff, layer: 2 },
  SkullKaleidoscope: { Component: SkullKaleidoscope, layer: 2 },
  SkeletonRoses:     { Component: SkeletonRoses, layer: 2 },
  SacredGeometry:    { Component: SacredGeometry, layer: 2 },
  DarkStarPortal:    { Component: DarkStarPortal, layer: 2 },
  FractalZoom:       { Component: FractalZoom, layer: 2 },
  MandalaGenerator:  { Component: MandalaGenerator, layer: 2 },
  RoseOverlay:       { Component: RoseOverlay, layer: 2 },

  // Layer 3: Reactive
  LightningBoltOverlay: { Component: LightningBoltOverlay, layer: 3 },
  ParticleExplosion:   { Component: ParticleExplosion, layer: 3 },
  LaserShow:           { Component: LaserShow, layer: 3 },
  EmberRise:           { Component: EmberRise, layer: 3 },
  WallOfSound:         { Component: WallOfSound, layer: 3 },

  // Layer 5: Song References
  ChinaCatSunflower: { Component: ChinaCatSunflower, layer: 5 },
  SugarMagnolia:     { Component: SugarMagnolia, layer: 5 },
  BoxOfRain:         { Component: BoxOfRain, layer: 5 },

  // Layer 6: Character / Dead Culture
  BearParade:        { Component: BearParade, layer: 6 },
  SkeletonBand:      { Component: SkeletonBand, layer: 6 },
  MarchingTerrapins: { Component: MarchingTerrapins, layer: 6 },
  Bertha:            { Component: Bertha, layer: 6 },
  JerryGuitar:       { Component: JerryGuitar, layer: 6 },
  VWBusParade:       { Component: VWBusParade, layer: 6 },
  CosmicCharlie:     { Component: CosmicCharlie, layer: 6 },

  // Layer 10: Distortion
  VHSGlitch:           { Component: VHSGlitch, layer: 10 },
};
