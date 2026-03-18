/**
 * Overlay Component Map — maps overlay names to their React components + layer.
 * This file centralizes all overlay imports so SongVisualizer can render dynamically.
 *
 * Components with special props (SongTitle, ConcertInfo, SetlistScroll, FilmGrain)
 * are NOT included here — they remain hardcoded in SongVisualizer.tsx.
 *
 * 57 selectable keepers (2026-03-16). Component files preserved in src/components/.
 */
import React from "react";
import type { EnhancedFrameData } from "./types";

// ─── Layer 1: Atmospheric (8) ───
import { CosmicStarfield } from "../components/CosmicStarfield";
import { TieDyeWash } from "../components/TieDyeWash";
import { LavaLamp } from "../components/LavaLamp";
import { Fireflies } from "../components/Fireflies";
import { LighterWave } from "../components/LighterWave";
import { CrowdDance } from "../components/CrowdDance";
import { GlowSticks } from "../components/GlowSticks";
import { GodRays } from "../components/GodRays";

// ─── Layer 2: Sacred / Center-stage (13) ───
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
import { StainedGlass } from "../components/StainedGlass";
import { DreamCatcher } from "../components/DreamCatcher";
import { StealieFade } from "../components/StealieFade";

// ─── Layer 3: Reactive (6) ───
import { LightningBoltOverlay } from "../components/LightningBoltOverlay";
import { ParticleExplosion } from "../components/ParticleExplosion";
import { LaserShow } from "../components/LaserShow";
import { EmberRise } from "../components/EmberRise";
import { WallOfSound } from "../components/WallOfSound";
import { PhilZone } from "../components/PhilZone";

// ─── Layer 4: Geometric / Physics (10) ───
import { VoronoiFlow } from "../components/VoronoiFlow";
import { PenroseTiling } from "../components/PenroseTiling";
import { MoirePattern } from "../components/MoirePattern";
import { OpArtPatterns } from "../components/OpArtPatterns";
import { BatikPattern } from "../components/BatikPattern";
import { VortexSpiral } from "../components/VortexSpiral";
import { SpiralArms } from "../components/SpiralArms";
import { SunMandala } from "../components/SunMandala";
import { MoireInterference } from "../components/MoireInterference";
import { LissajousCurves } from "../components/LissajousCurves";

// ─── Layer 2: Dead Culture additions (3) ───
import { RoseGarden } from "../components/RoseGarden";
import { StealYourFaceKaleidoscope } from "../components/StealYourFaceKaleidoscope";

// ─── Layer 5: Song References (3) + Dead Culture ───
import { SunMoonMotif } from "../components/SunMoonMotif";
import { ChinaCatSunflower } from "../components/ChinaCatSunflower";
import { SugarMagnolia } from "../components/SugarMagnolia";
import { BoxOfRain } from "../components/BoxOfRain";

// ─── Layer 6: Character / Dead Culture (13) ───
import { BearParade } from "../components/BearParade";
import { SkeletonBand } from "../components/SkeletonBand";
import { MarchingTerrapins } from "../components/MarchingTerrapins";
import { Bertha } from "../components/Bertha";
import { JerryGuitar } from "../components/JerryGuitar";
import { VWBusParade } from "../components/VWBusParade";
import { CosmicCharlie } from "../components/CosmicCharlie";
import { JerrySpotlight } from "../components/JerrySpotlight";
import { BobWeir } from "../components/BobWeir";
import { DrumCircle } from "../components/DrumCircle";
import { DancingTerrapinOverlay } from "../components/DancingTerrapinOverlay";
import { SkeletonCouple } from "../components/SkeletonCouple";
import { DeadIcons } from "../components/DeadIcons";

// ─── Layer 7: Show Artifacts (3) ───
import { VenueMarquee } from "../components/VenueMarquee";
import { TapeTrader } from "../components/TapeTrader";
import { TourPosterGallery } from "../components/TourPosterGallery";

// ─── Phase 9 Wave 3: New Overlays ───
import { RainDrops } from "../components/RainDrops";
import { FogBank } from "../components/FogBank";
import { TidalPool } from "../components/TidalPool";
import { VineGrowth } from "../components/VineGrowth";
import { PhilLesh } from "../components/PhilLesh";
import { DrummersDuo } from "../components/DrummersDuo";
import { BassWaveform } from "../components/BassWaveform";
import { TicketStub } from "../components/TicketStub";

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
  LighterWave:       { Component: LighterWave, layer: 1 },
  CrowdDance:        { Component: CrowdDance, layer: 1 },
  GlowSticks:        { Component: GlowSticks, layer: 1 },
  GodRays:           { Component: GodRays, layer: 1 },

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
  StainedGlass:      { Component: StainedGlass, layer: 2 },
  DreamCatcher:      { Component: DreamCatcher, layer: 2 },
  StealieFade:       { Component: StealieFade, layer: 2 },
  RoseGarden:        { Component: RoseGarden, layer: 2 },
  StealYourFaceKaleidoscope: { Component: StealYourFaceKaleidoscope, layer: 2 },

  // Layer 3: Reactive
  LightningBoltOverlay: { Component: LightningBoltOverlay, layer: 3 },
  ParticleExplosion:   { Component: ParticleExplosion, layer: 3 },
  LaserShow:           { Component: LaserShow, layer: 3 },
  EmberRise:           { Component: EmberRise, layer: 3 },
  WallOfSound:         { Component: WallOfSound, layer: 3 },
  PhilZone:            { Component: PhilZone, layer: 3 },

  // Layer 4: Geometric / Physics
  VoronoiFlow:       { Component: VoronoiFlow, layer: 4 },
  PenroseTiling:     { Component: PenroseTiling, layer: 4 },
  MoirePattern:      { Component: MoirePattern, layer: 4 },
  OpArtPatterns:     { Component: OpArtPatterns, layer: 4 },
  BatikPattern:      { Component: BatikPattern, layer: 4 },
  VortexSpiral:      { Component: VortexSpiral, layer: 4 },
  SpiralArms:        { Component: SpiralArms, layer: 4 },
  SunMandala:        { Component: SunMandala, layer: 4 },
  MoireInterference: { Component: MoireInterference, layer: 4 },
  LissajousCurves:   { Component: LissajousCurves, layer: 4 },

  // Layer 5: Song References + Dead Culture
  SunMoonMotif:      { Component: SunMoonMotif, layer: 5 },
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
  JerrySpotlight:    { Component: JerrySpotlight, layer: 6 },
  BobWeir:           { Component: BobWeir, layer: 6 },
  DrumCircle:        { Component: DrumCircle, layer: 6 },
  DancingTerrapinOverlay: { Component: DancingTerrapinOverlay, layer: 6 },
  SkeletonCouple:    { Component: SkeletonCouple, layer: 6 },
  DeadIcons:         { Component: DeadIcons as React.ComponentType<{ frames: EnhancedFrameData[] }>, layer: 6 },

  // Layer 7: Show Artifacts
  VenueMarquee:      { Component: VenueMarquee, layer: 7 },
  TapeTrader:        { Component: TapeTrader, layer: 7 },
  TourPosterGallery: { Component: TourPosterGallery, layer: 7 },

  // Layer 10: Distortion
  VHSGlitch:           { Component: VHSGlitch, layer: 10 },

  // Phase 9 Wave 3: New Overlays
  RainDrops:           { Component: RainDrops, layer: 1 },
  FogBank:             { Component: FogBank, layer: 1 },
  TidalPool:           { Component: TidalPool, layer: 5 },
  VineGrowth:          { Component: VineGrowth, layer: 5 },
  PhilLesh:            { Component: PhilLesh, layer: 6 },
  DrummersDuo:         { Component: DrummersDuo, layer: 6 },
  BassWaveform:        { Component: BassWaveform, layer: 3 },
  TicketStub:          { Component: TicketStub as React.ComponentType<{ frames: EnhancedFrameData[] }>, layer: 7 },
};
