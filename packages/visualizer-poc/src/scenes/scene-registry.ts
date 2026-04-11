/**
 * Scene Registry — pluggable visual mode system.
 *
 * Maps VisualMode IDs to React scene components. New scenes can be
 * registered here without touching SceneRouter's logic.
 *
 * Each scene receives the standard props:
 *   - frames: audio analysis frame data
 *   - sections: section boundaries
 *   - palette: color palette
 *   - tempo: BPM
 *   - style: CSS overrides
 *
 * To add a new scene:
 *   1. Create the scene component in src/scenes/
 *   2. Register it in SCENE_REGISTRY below
 *   3. Add the mode ID to VisualMode type in types.ts
 */

import React from "react";
import type { EnhancedFrameData, SectionBoundary, ColorPalette, VisualMode } from "../data/types";
import { getEraPreset } from "../data/era-presets";
import type { SceneTransitionStyle } from "../utils/transition-selector";
import { SceneConfigProvider } from "./SceneConfigContext";
import type { CameraProfile } from "../config/camera-profiles";
import type { ShaderParameterProfile } from "../config/shader-parameters";

// ─── Scene Component Interface ───

export interface SceneProps {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  /** Normalized jam density from jam evolution system (0-1, default 0.5) */
  jamDensity?: number;
}

export type SceneComponent = React.ComponentType<SceneProps>;

/** Spectral family: timbral character classification for spectral-categorical routing */
export type SpectralFamily = "warm" | "bright" | "textural" | "tonal" | "cosmic";

export interface SceneRegistryEntry {
  /** The React component for this scene */
  Component: SceneComponent;
  /** Energy level this scene works best at */
  energyAffinity: "low" | "mid" | "high" | "any";
  /** Complementary mode for auto-variety */
  complement: VisualMode;
  /** Preferred transition style when entering this scene */
  preferredTransitionIn?: SceneTransitionStyle;
  /** Preferred transition style when leaving this scene */
  preferredTransitionOut?: SceneTransitionStyle;
  /** Post-process grading intensity (0-1, default 1.0). Lower = more raw color. */
  gradingIntensity?: number;
  /** Spectral family for timbral routing. Omitted = versatile (accepts any family). */
  spectralFamily?: SpectralFamily;
}

// ─── Lazy imports for code splitting ───

import { LiquidLightScene } from "./LiquidLightScene";
import { ParticleNebulaScene } from "./ParticleNebulaScene";
import { ConcertLightingScene } from "./ConcertLightingScene";
import { LoFiGrainScene } from "./LoFiGrainScene";
import { StarkMinimalScene } from "./StarkMinimalScene";
import { OilProjectorScene } from "./OilProjectorScene";
import { TieDyeScene } from "./TieDyeScene";
import { CosmicDustScene } from "./CosmicDustScene";
import { VintageFilmScene } from "./VintageFilmScene";
import { CosmicVoyageScene } from "./CosmicVoyageScene";
import { InfernoScene } from "./InfernoScene";
import { DeepOceanScene } from "./DeepOceanScene";
import { AuroraScene } from "./AuroraScene";
import { CrystalCavernScene } from "./CrystalCavernScene";
import { FluidLightScene } from "./FluidLightScene";
import { VoidLightScene } from "./VoidLightScene";
import { Fluid2DScene } from "./Fluid2DScene";
import { SpectralAnalyzerScene } from "./SpectralAnalyzerScene";
import { ParticleSwarmScene } from "./ParticleSwarmScene";
import { CrystallineGrowthScene } from "./CrystallineGrowthScene";
import { ClimaxSurgeScene } from "./ClimaxSurgeScene";
import { KaleidoscopeScene } from "./KaleidoscopeScene";
import { FractalZoomScene } from "./FractalZoomScene";
import { SacredGeometryScene } from "./SacredGeometryScene";
import { ReactionDiffusionScene } from "./ReactionDiffusionScene";
import { MandalaEngineScene } from "./MandalaEngineScene";
import { FractalFlamesScene } from "./FractalFlamesScene";
import { FeedbackRecursionScene } from "./FeedbackRecursionScene";
import { TruchetTilingScene } from "./TruchetTilingScene";
import { DiffractionRingsScene } from "./DiffractionRingsScene";
import { PlasmaFieldScene } from "./PlasmaFieldScene";
import { VoronoiFlowScene } from "./VoronoiFlowScene";
import { StainedGlassScene } from "./StainedGlassScene";
import { ElectricArcScene } from "./ElectricArcScene";
import { MorphogenesisScene } from "./MorphogenesisScene";
import { NeuralWebScene } from "./NeuralWebScene";
import { SmokeRingsScene } from "./SmokeRingsScene";
import { AuroraCurtainsScene } from "./AuroraCurtainsScene";
import { DigitalRainScene } from "./DigitalRainScene";
import { LavaFlowScene } from "./LavaFlowScene";
// Phase 9 Wave 2: 8 new scenes
import { MyceliumNetworkScene } from "./MyceliumNetworkScene";
import { InkWashScene } from "./InkWashScene";
import { CoralReefScene } from "./CoralReefScene";
import { SolarFlareScene } from "./SolarFlareScene";
import { GalaxySpiralScene } from "./GalaxySpiralScene";
import { WarpFieldScene } from "./WarpFieldScene";
import { SignalDecayScene } from "./SignalDecayScene";
import { DatabendScene } from "./DatabendScene";
// Tier 1: Volumetric Raymarching Shaders
import { VolumetricCloudsScene } from "./VolumetricCloudsScene";
import { VolumetricSmokeScene } from "./VolumetricSmokeScene";
import { VolumetricNebulaScene } from "./VolumetricNebulaScene";
import { RiverScene } from "./RiverScene";
import { SpaceTravelScene } from "./SpaceTravelScene";
import { MountainFireScene } from "./MountainFireScene";
import { FlowerFieldScene } from "./FlowerFieldScene";
import { ForestScene } from "./ForestScene";
import { OceanScene } from "./OceanScene";
import { DesertRoadScene } from "./DesertRoadScene";
import { CampfireScene } from "./CampfireScene";
import { RainStreetScene } from "./RainStreetScene";
// Environment scenes
import { AuroraSkyScene } from "./AuroraSkyScene";
import { StormScene } from "./StormScene";
import { CanyonScene } from "./CanyonScene";
// New shaders
import { LiquidMandalaScene } from "./LiquidMandalaScene";
import { BioluminescenceScene } from "./BioluminescenceScene";
import { NeonGridScene } from "./NeonGridScene";
import { WarmNebulaScene } from "./WarmNebulaScene";
import { PrismRefractionScene } from "./PrismRefractionScene";
import { CellularAutomataScene } from "./CellularAutomataScene";
// Dead-native shaders
import { AcidMeltScene } from "./AcidMeltScene";
import { BlacklightGlowScene } from "./BlacklightGlowScene";
import { SpinningSpiralScene } from "./SpinningSpiralScene";
import { LiquidProjectorScene } from "./LiquidProjectorScene";
// Protean Clouds family (nimitz port + song variations)
import { ProteanCloudsScene } from "./ProteanCloudsScene";
import { MorningDewFogScene } from "./MorningDewFogScene";
import { DarkStarVoidScene } from "./DarkStarVoidScene";
import { FireMountainSmokeScene } from "./FireMountainSmokeScene";
import { EstimatedProphetMistScene } from "./EstimatedProphetMistScene";
import { WharfRatStormScene } from "./WharfRatStormScene";
import { ScarletGoldenHazeScene } from "./ScarletGoldenHazeScene";
import { StStephenLightningScene } from "./StStephenLightningScene";
import { TerrapinNebulaScene } from "./TerrapinNebulaScene";
// Community shader ports
import { StarNestScene } from "./StarNestScene";
import { SeascapeScene } from "./SeascapeScene";
import { CombustibleVoronoiScene } from "./CombustibleVoronoiScene";
import { NimitzAuroraScene } from "./NimitzAuroraScene";
import { CreationScene } from "./CreationScene";
// Raymarched 3D
import { FractalTempleScene } from "./FractalTempleScene";
// Veneta '72 show-specific shaders
import { HighwayHorizonScene } from "./HighwayHorizonScene";
import { HoneycombCathedralScene } from "./HoneycombCathedralScene";
import { CampfireEmbersScene } from "./CampfireEmbersScene";
import { NeonCasinoScene } from "./NeonCasinoScene";
import { StormVortexScene } from "./StormVortexScene";
import { PsychedelicGardenScene } from "./PsychedelicGardenScene";
import { CosmicRailroadScene } from "./CosmicRailroadScene";
import { DesertCantinaScene } from "./DesertCantinaScene";
import { EarthquakeFissureScene } from "./EarthquakeFissureScene";
import { MobiusAmphitheaterScene } from "./MobiusAmphitheaterScene";
import { MemorialDriftScene } from "./MemorialDriftScene";
import { BoxcarTunnelScene } from "./BoxcarTunnelScene";
import { AviaryCanopyScene } from "./AviaryCanopyScene";
import { ClockworkTempleScene } from "./ClockworkTempleScene";
import { EventHorizonScene } from "./EventHorizonScene";
import { CanyonChaseScene } from "./CanyonChaseScene";
import { PorchTwilightScene } from "./PorchTwilightScene";
import { BloomExplosionScene } from "./BloomExplosionScene";
import { LocomotiveEngineScene } from "./LocomotiveEngineScene";
import { DanceFloorPrismScene } from "./DanceFloorPrismScene";
import { StainedGlassDissolutionScene } from "./StainedGlassDissolutionScene";
// New shader wrappers
import { CrystallineVoidScene } from "./CrystallineVoidScene";
import { AmberDriftScene } from "./AmberDriftScene";
import { ObsidianMirrorScene } from "./ObsidianMirrorScene";
import { SpectralBridgeScene } from "./SpectralBridgeScene";
import { EmberMeadowScene } from "./EmberMeadowScene";

// ─── Scene Registry ───

export const SCENE_REGISTRY: Record<VisualMode, SceneRegistryEntry> = {
  // ─── Versatile (no spectralFamily): accept any timbral context ───
  liquid_light: {
    Component: LiquidLightScene,
    energyAffinity: "high",
    complement: "protean_clouds",
    gradingIntensity: 0.75,
    spectralFamily: "warm",
  },
  oil_projector: {
    Component: OilProjectorScene,
    energyAffinity: "mid",
    complement: "protean_clouds",
    spectralFamily: "warm",
  },
  // ─── Bright: high centroid, punchy ───
  concert_lighting: {
    Component: ConcertLightingScene,
    energyAffinity: "high",
    complement: "lo_fi_grain",
    preferredTransitionIn: "flash",
    gradingIntensity: 0.5,
    spectralFamily: "bright",
  },
  lo_fi_grain: {
    Component: LoFiGrainScene,
    energyAffinity: "mid",
    complement: "inferno",
  },
  // ─── Cosmic: mid-range, wide spread ───
  particle_nebula: {
    Component: ParticleNebulaScene,
    energyAffinity: "low",
    complement: "cosmic_dust",
    spectralFamily: "cosmic",
  },
  stark_minimal: {
    Component: StarkMinimalScene,
    energyAffinity: "low",
    complement: "protean_clouds",
    spectralFamily: "tonal",
  },
  tie_dye: {
    Component: TieDyeScene,
    energyAffinity: "high",
    complement: "vintage_film",
    gradingIntensity: 0.75,
  },
  cosmic_dust: {
    Component: CosmicDustScene,
    energyAffinity: "low",
    complement: "cosmic_voyage",
    spectralFamily: "cosmic",
  },
  vintage_film: {
    Component: VintageFilmScene,
    energyAffinity: "mid",
    complement: "protean_clouds",
  },
  cosmic_voyage: {
    Component: CosmicVoyageScene,
    energyAffinity: "low",
    complement: "inferno",
    preferredTransitionIn: "void",
    spectralFamily: "cosmic",
  },
  inferno: {
    Component: InfernoScene,
    energyAffinity: "high",
    complement: "cosmic_voyage",
    preferredTransitionIn: "flash",
    gradingIntensity: 0.7,
    spectralFamily: "warm",
  },
  deep_ocean: {
    Component: DeepOceanScene,
    energyAffinity: "low",
    complement: "inferno",
    preferredTransitionIn: "void",
    spectralFamily: "warm",
  },
  aurora: {
    Component: AuroraScene,
    energyAffinity: "low",
    complement: "protean_clouds",
    preferredTransitionIn: "dissolve",
    spectralFamily: "tonal",
  },
  crystal_cavern: {
    Component: CrystalCavernScene,
    energyAffinity: "low",
    complement: "inferno",
    spectralFamily: "tonal",
  },
  fluid_light: {
    Component: FluidLightScene,
    energyAffinity: "high",
    complement: "protean_clouds",
  },
  void_light: {
    Component: VoidLightScene,
    energyAffinity: "low",
    complement: "inferno",
    preferredTransitionIn: "void",
    spectralFamily: "cosmic",
  },
  fluid_2d: {
    Component: Fluid2DScene,
    energyAffinity: "any",
    complement: "protean_clouds",
    spectralFamily: "textural",
  },
  spectral_analyzer: {
    Component: SpectralAnalyzerScene,
    energyAffinity: "high",
    complement: "cosmic_voyage",
    spectralFamily: "bright",
  },
  particle_swarm: {
    Component: ParticleSwarmScene,
    energyAffinity: "mid",
    complement: "deep_ocean",
    spectralFamily: "bright",
  },
  crystalline_growth: {
    Component: CrystallineGrowthScene,
    energyAffinity: "low",
    complement: "inferno",
  },
  climax_surge: {
    Component: ClimaxSurgeScene,
    energyAffinity: "high",
    complement: "inferno",
    gradingIntensity: 0.5,
    spectralFamily: "bright",
  },
  kaleidoscope: {
    Component: KaleidoscopeScene,
    energyAffinity: "mid",
    complement: "cosmic_voyage",
    gradingIntensity: 0.8,
    spectralFamily: "tonal",
  },
  fractal_zoom: {
    Component: LiquidLightScene, // Redirected: fractal_zoom renders as liquid_light (Mandelbrot looks bad fullscreen)
    energyAffinity: "any",
    complement: "cosmic_voyage",
    preferredTransitionIn: "morph",
    spectralFamily: "tonal",
  },
  sacred_geometry: {
    Component: SacredGeometryScene,
    energyAffinity: "low",
    complement: "cosmic_voyage",
    preferredTransitionIn: "dissolve",
    spectralFamily: "tonal",
  },
  reaction_diffusion: {
    Component: ReactionDiffusionScene,
    energyAffinity: "mid",
    complement: "fluid_2d",
    spectralFamily: "textural",
  },
  mandala_engine: {
    Component: MandalaEngineScene,
    energyAffinity: "mid",
    complement: "cosmic_voyage",
    spectralFamily: "tonal",
  },
  fractal_flames: {
    Component: FractalFlamesScene,
    energyAffinity: "high",
    complement: "deep_ocean",
    gradingIntensity: 0.7,
  },
  feedback_recursion: {
    Component: FeedbackRecursionScene,
    energyAffinity: "any",
    complement: "cosmic_voyage",
    spectralFamily: "textural",
  },
  truchet_tiling: {
    Component: TruchetTilingScene,
    energyAffinity: "mid",
    complement: "mandala_engine",
    spectralFamily: "tonal",
  },
  diffraction_rings: {
    Component: DiffractionRingsScene,
    energyAffinity: "low",
    complement: "aurora",
    spectralFamily: "tonal",
  },
  plasma_field: {
    Component: PlasmaFieldScene,
    energyAffinity: "any",
    complement: "deep_ocean",
    spectralFamily: "tonal",
  },
  voronoi_flow: {
    Component: VoronoiFlowScene,
    energyAffinity: "mid",
    complement: "cosmic_voyage",
    spectralFamily: "textural",
  },
  electric_arc: {
    Component: ElectricArcScene,
    energyAffinity: "high",
    complement: "aurora",
    preferredTransitionIn: "distortion",
    gradingIntensity: 0.6,
    spectralFamily: "bright",
  },
  morphogenesis: {
    Component: MorphogenesisScene,
    energyAffinity: "mid",
    complement: "deep_ocean",
    spectralFamily: "textural",
  },
  stained_glass: {
    Component: StainedGlassScene,
    energyAffinity: "any",
    complement: "cosmic_voyage",
    spectralFamily: "tonal",
  },
  neural_web: {
    Component: NeuralWebScene,
    energyAffinity: "high",
    complement: "cosmic_voyage",
    spectralFamily: "textural",
  },
  smoke_rings: {
    Component: SmokeRingsScene,
    energyAffinity: "mid",
    complement: "deep_ocean",
    spectralFamily: "warm",
  },
  aurora_curtains: {
    Component: AuroraCurtainsScene,
    energyAffinity: "low",
    complement: "inferno",
    spectralFamily: "tonal",
  },
  digital_rain: {
    Component: DigitalRainScene,
    energyAffinity: "any",
    complement: "deep_ocean",
  },
  lava_flow: {
    Component: LavaFlowScene,
    energyAffinity: "high",
    complement: "cosmic_voyage",
    gradingIntensity: 0.65,
    spectralFamily: "warm",
  },
  // Phase 9 Wave 2: 8 new scenes
  mycelium_network: {
    Component: MyceliumNetworkScene,
    energyAffinity: "mid",
    complement: "cosmic_voyage",
    spectralFamily: "textural",
  },
  ink_wash: {
    Component: InkWashScene,
    energyAffinity: "low",
    complement: "deep_ocean",
  },
  coral_reef: {
    Component: CoralReefScene,
    energyAffinity: "low",
    complement: "deep_ocean",
    spectralFamily: "warm",
  },
  solar_flare: {
    Component: SolarFlareScene,
    energyAffinity: "high",
    complement: "inferno",
    gradingIntensity: 0.6,
    spectralFamily: "bright",
  },
  galaxy_spiral: {
    Component: GalaxySpiralScene,
    energyAffinity: "any",
    complement: "cosmic_voyage",
    spectralFamily: "cosmic",
  },
  warp_field: {
    Component: WarpFieldScene,
    energyAffinity: "mid",
    complement: "deep_ocean",
    spectralFamily: "cosmic",
  },
  signal_decay: {
    Component: SignalDecayScene,
    energyAffinity: "any",
    complement: "cosmic_voyage",
    spectralFamily: "textural",
  },
  databend: {
    Component: DatabendScene,
    energyAffinity: "high",
    complement: "lo_fi_grain",
    spectralFamily: "bright",
  },
  // Tier 1: Volumetric Raymarching Shaders
  volumetric_clouds: {
    Component: VolumetricCloudsScene,
    energyAffinity: "low",
    complement: "volumetric_smoke",
    preferredTransitionIn: "dissolve",
    spectralFamily: "cosmic",
  },
  volumetric_smoke: {
    Component: VolumetricSmokeScene,
    energyAffinity: "mid",
    complement: "inferno",
    preferredTransitionIn: "void",
    spectralFamily: "cosmic",
  },
  volumetric_nebula: {
    Component: VolumetricNebulaScene,
    energyAffinity: "any",
    complement: "cosmic_voyage",
    preferredTransitionIn: "dissolve",
    spectralFamily: "cosmic",
  },
  river: {
    Component: RiverScene,
    energyAffinity: "any",
    complement: "inferno",
    preferredTransitionIn: "dissolve",
    spectralFamily: "tonal",
  },
  space_travel: {
    Component: SpaceTravelScene,
    energyAffinity: "any",
    complement: "deep_ocean",
    spectralFamily: "cosmic",
    preferredTransitionIn: "dissolve",
  },
  mountain_fire: {
    Component: MountainFireScene,
    energyAffinity: "mid",
    complement: "deep_ocean",
    gradingIntensity: 0.7,
    spectralFamily: "warm",
  },
  flower_field: {
    Component: FlowerFieldScene,
    energyAffinity: "mid",
    complement: "deep_ocean",
    preferredTransitionIn: "dissolve",
    spectralFamily: "bright",
  },
  forest: {
    Component: ForestScene,
    energyAffinity: "low",
    complement: "inferno",
    spectralFamily: "tonal",
  },
  ocean: {
    Component: OceanScene,
    energyAffinity: "any",
    complement: "desert_road",
    spectralFamily: "cosmic",
  },
  desert_road: {
    Component: DesertRoadScene,
    energyAffinity: "mid",
    complement: "deep_ocean",
    spectralFamily: "warm",
  },
  campfire: {
    Component: CampfireScene,
    energyAffinity: "low",
    complement: "inferno",
    spectralFamily: "warm",
  },
  rain_street: {
    Component: RainStreetScene,
    energyAffinity: "low",
    complement: "inferno",
    spectralFamily: "tonal",
  },
  // Environment scenes
  aurora_sky: {
    Component: AuroraSkyScene,
    energyAffinity: "any",
    complement: "inferno",
    spectralFamily: "cosmic",
  },
  storm: {
    Component: StormScene,
    energyAffinity: "high",
    complement: "aurora",
    spectralFamily: "textural",
  },
  canyon: {
    Component: CanyonScene,
    energyAffinity: "mid",
    complement: "cosmic_voyage",
    spectralFamily: "tonal",
  },
  // New shaders
  liquid_mandala: {
    Component: LiquidMandalaScene,
    energyAffinity: "mid",
    complement: "cosmic_voyage",
    gradingIntensity: 0.8,
    spectralFamily: "warm",
  },
  bioluminescence: {
    Component: BioluminescenceScene,
    energyAffinity: "high",
    complement: "deep_ocean",
    spectralFamily: "bright",
  },
  neon_grid: {
    Component: NeonGridScene,
    energyAffinity: "high",
    complement: "inferno",
    gradingIntensity: 0.6,
    spectralFamily: "bright",
  },
  warm_nebula: {
    Component: WarmNebulaScene,
    energyAffinity: "low",
    complement: "deep_ocean",
    preferredTransitionIn: "dissolve",
    spectralFamily: "cosmic",
  },
  prism_refraction: {
    Component: PrismRefractionScene,
    energyAffinity: "any",
    complement: "deep_ocean",
    spectralFamily: "tonal",
  },
  cellular_automata: {
    Component: CellularAutomataScene,
    energyAffinity: "mid",
    complement: "deep_ocean",
    spectralFamily: "textural",
  },
  // Dead-native shaders
  acid_melt: {
    Component: AcidMeltScene,
    energyAffinity: "any",
    complement: "protean_clouds",
    gradingIntensity: 0.8,
    spectralFamily: "warm",
  },
  blacklight_glow: {
    Component: BlacklightGlowScene,
    energyAffinity: "mid",
    complement: "deep_ocean",
    spectralFamily: "bright",
  },
  spinning_spiral: {
    Component: SpinningSpiralScene,
    energyAffinity: "any",
    complement: "cosmic_voyage",
    spectralFamily: "tonal",
  },
  liquid_projector: {
    Component: LiquidProjectorScene,
    energyAffinity: "mid",
    complement: "protean_clouds",
    gradingIntensity: 0.75,
    spectralFamily: "warm",
  },
  // ─── Protean Clouds family (nimitz port + song variations) ───
  protean_clouds: {
    Component: ProteanCloudsScene,
    energyAffinity: "any",
    complement: "terrapin_nebula",
    preferredTransitionIn: "dissolve",
    gradingIntensity: 0.7,
    spectralFamily: "cosmic",
  },
  morning_dew_fog: {
    Component: MorningDewFogScene,
    energyAffinity: "low",
    complement: "scarlet_golden_haze",
    preferredTransitionIn: "dissolve",
    spectralFamily: "warm",
  },
  dark_star_void: {
    Component: DarkStarVoidScene,
    energyAffinity: "low",
    complement: "st_stephen_lightning",
    preferredTransitionIn: "void",
    spectralFamily: "cosmic",
  },
  fire_mountain_smoke: {
    Component: FireMountainSmokeScene,
    energyAffinity: "high",
    complement: "morning_dew_fog",
    preferredTransitionIn: "flash",
    gradingIntensity: 0.65,
    spectralFamily: "warm",
  },
  estimated_prophet_mist: {
    Component: EstimatedProphetMistScene,
    energyAffinity: "mid",
    complement: "seascape",
    preferredTransitionIn: "dissolve",
    spectralFamily: "cosmic",
  },
  wharf_rat_storm: {
    Component: WharfRatStormScene,
    energyAffinity: "low",
    complement: "scarlet_golden_haze",
    preferredTransitionIn: "void",
    spectralFamily: "textural",
  },
  scarlet_golden_haze: {
    Component: ScarletGoldenHazeScene,
    energyAffinity: "mid",
    complement: "wharf_rat_storm",
    preferredTransitionIn: "dissolve",
    gradingIntensity: 0.75,
    spectralFamily: "warm",
  },
  st_stephen_lightning: {
    Component: StStephenLightningScene,
    energyAffinity: "high",
    complement: "dark_star_void",
    preferredTransitionIn: "flash",
    gradingIntensity: 0.6,
    spectralFamily: "bright",
  },
  terrapin_nebula: {
    Component: TerrapinNebulaScene,
    energyAffinity: "low",
    complement: "protean_clouds",
    preferredTransitionIn: "dissolve",
    spectralFamily: "cosmic",
  },
  // ─── Community shader ports ───
  star_nest: {
    Component: StarNestScene,
    energyAffinity: "any",
    complement: "dark_star_void",
    preferredTransitionIn: "void",
    spectralFamily: "cosmic",
  },
  seascape: {
    Component: SeascapeScene,
    energyAffinity: "any",
    complement: "estimated_prophet_mist",
    preferredTransitionIn: "dissolve",
    spectralFamily: "cosmic",
  },
  combustible_voronoi: {
    Component: CombustibleVoronoiScene,
    energyAffinity: "high",
    complement: "fire_mountain_smoke",
    preferredTransitionIn: "flash",
    gradingIntensity: 0.6,
    spectralFamily: "warm",
  },
  nimitz_aurora: {
    Component: NimitzAuroraScene,
    energyAffinity: "low",
    complement: "star_nest",
    preferredTransitionIn: "dissolve",
    spectralFamily: "cosmic",
  },
  creation: {
    Component: CreationScene,
    energyAffinity: "any",
    complement: "protean_clouds",
    preferredTransitionIn: "morph",
    gradingIntensity: 0.75,
  },
  // ─── Raymarched 3D ───
  fractal_temple: {
    Component: FractalTempleScene,
    energyAffinity: "any",
    complement: "cosmic_voyage",
    preferredTransitionIn: "void",
    spectralFamily: "cosmic",
  },
  // ─── Veneta '72 show-specific shaders ───
  highway_horizon: {
    Component: HighwayHorizonScene,
    energyAffinity: "mid",
    complement: "cosmic_railroad",
    preferredTransitionIn: "dissolve",
    spectralFamily: "warm",
  },
  honeycomb_cathedral: {
    Component: HoneycombCathedralScene,
    energyAffinity: "low",
    complement: "stained_glass_dissolution",
    preferredTransitionIn: "dissolve",
    spectralFamily: "tonal",
  },
  campfire_embers: {
    Component: CampfireEmbersScene,
    energyAffinity: "mid",
    complement: "porch_twilight",
    preferredTransitionIn: "dissolve",
    spectralFamily: "warm",
  },
  neon_casino: {
    Component: NeonCasinoScene,
    energyAffinity: "high",
    complement: "dance_floor_prism",
    preferredTransitionIn: "flash",
    spectralFamily: "bright",
  },
  storm_vortex: {
    Component: StormVortexScene,
    energyAffinity: "high",
    complement: "earthquake_fissure",
    preferredTransitionIn: "flash",
    spectralFamily: "textural",
  },
  psychedelic_garden: {
    Component: PsychedelicGardenScene,
    energyAffinity: "any",
    complement: "aviary_canopy",
    preferredTransitionIn: "dissolve",
    spectralFamily: "warm",
  },
  cosmic_railroad: {
    Component: CosmicRailroadScene,
    energyAffinity: "any",
    complement: "highway_horizon",
    preferredTransitionIn: "void",
    spectralFamily: "cosmic",
  },
  desert_cantina: {
    Component: DesertCantinaScene,
    energyAffinity: "mid",
    complement: "campfire_embers",
    preferredTransitionIn: "dissolve",
    spectralFamily: "warm",
  },
  earthquake_fissure: {
    Component: EarthquakeFissureScene,
    energyAffinity: "high",
    complement: "storm_vortex",
    preferredTransitionIn: "flash",
    spectralFamily: "textural",
  },
  mobius_amphitheater: {
    Component: MobiusAmphitheaterScene,
    energyAffinity: "any",
    complement: "event_horizon",
    preferredTransitionIn: "void",
    spectralFamily: "cosmic",
  },
  memorial_drift: {
    Component: MemorialDriftScene,
    energyAffinity: "low",
    complement: "porch_twilight",
    preferredTransitionIn: "dissolve",
    spectralFamily: "warm",
  },
  boxcar_tunnel: {
    Component: BoxcarTunnelScene,
    energyAffinity: "mid",
    complement: "locomotive_engine",
    preferredTransitionIn: "dissolve",
    spectralFamily: "textural",
  },
  aviary_canopy: {
    Component: AviaryCanopyScene,
    energyAffinity: "low",
    complement: "psychedelic_garden",
    preferredTransitionIn: "dissolve",
    spectralFamily: "tonal",
  },
  clockwork_temple: {
    Component: ClockworkTempleScene,
    energyAffinity: "high",
    complement: "mobius_amphitheater",
    preferredTransitionIn: "flash",
    spectralFamily: "bright",
  },
  event_horizon: {
    Component: EventHorizonScene,
    energyAffinity: "any",
    complement: "cosmic_railroad",
    preferredTransitionIn: "void",
    spectralFamily: "cosmic",
  },
  canyon_chase: {
    Component: CanyonChaseScene,
    energyAffinity: "high",
    complement: "desert_cantina",
    preferredTransitionIn: "flash",
    spectralFamily: "warm",
  },
  porch_twilight: {
    Component: PorchTwilightScene,
    energyAffinity: "low",
    complement: "memorial_drift",
    preferredTransitionIn: "dissolve",
    spectralFamily: "warm",
  },
  bloom_explosion: {
    Component: BloomExplosionScene,
    energyAffinity: "any",
    complement: "psychedelic_garden",
    preferredTransitionIn: "flash",
    spectralFamily: "bright",
  },
  locomotive_engine: {
    Component: LocomotiveEngineScene,
    energyAffinity: "high",
    complement: "boxcar_tunnel",
    preferredTransitionIn: "flash",
    spectralFamily: "warm",
  },
  dance_floor_prism: {
    Component: DanceFloorPrismScene,
    energyAffinity: "high",
    complement: "neon_casino",
    preferredTransitionIn: "flash",
    spectralFamily: "bright",
  },
  stained_glass_dissolution: {
    Component: StainedGlassDissolutionScene,
    energyAffinity: "low",
    complement: "honeycomb_cathedral",
    preferredTransitionIn: "dissolve",
    spectralFamily: "tonal",
  },
  crystalline_void: {
    Component: CrystallineVoidScene,
    energyAffinity: "high",
    complement: "neon_grid",
    spectralFamily: "tonal",
  },
  amber_drift: {
    Component: AmberDriftScene,
    energyAffinity: "low",
    complement: "warm_nebula",
    spectralFamily: "warm",
  },
  obsidian_mirror: {
    Component: ObsidianMirrorScene,
    energyAffinity: "low",
    complement: "stark_minimal",
    spectralFamily: "tonal",
  },
  spectral_bridge: {
    Component: SpectralBridgeScene,
    energyAffinity: "any",
    complement: "creation",
    spectralFamily: "tonal",
  },
  ember_meadow: {
    Component: EmberMeadowScene,
    energyAffinity: "mid",
    complement: "warm_nebula",
    spectralFamily: "warm",
  },
};

// ─── Transition Affinity Map ───
// Re-exported from pure data file so build-time precompute scripts can import
// it without dragging in scene component code.

export { TRANSITION_AFFINITY } from "./transition-affinity";


// ─── Helper functions ───

/** Get the complement mode for auto-variety */
export function getComplement(mode: VisualMode): VisualMode {
  return SCENE_REGISTRY[mode]?.complement ?? mode;
}

/** Get modes appropriate for a given energy level, with optional era filtering.
 *  Era preferred modes get 3x weight, excluded modes are removed.
 *  Song's defaultMode is always included as fallback. */
// ─── Flat 2D noise / pattern shaders — blocked from auto-select ───
// Shaders that should NOT be picked by auto-selection (getModesForContinuousEnergy).
// Core workhorse shaders (protean_clouds, cosmic_voyage, deep_ocean, inferno) are
// intentionally ALLOWED — the stem/duration/narrative bias layers reference them,
// and blocking them here made those biases dead code.
const AUTO_SELECT_BLOCKLIST: Set<VisualMode> = new Set([
  // Genuinely low-quality or overly specific shaders
  "combustible_voronoi", "creation", "fluid_2d",
  // Song-specific variations — designed for specific songs, not general auto-select
  "morning_dew_fog", "dark_star_void", "fire_mountain_smoke",
  "estimated_prophet_mist", "wharf_rat_storm", "scarlet_golden_haze",
  "st_stephen_lightning", "terrapin_nebula",
]);

export function getModesForEnergy(energy: "low" | "mid" | "high", era?: string, defaultMode?: VisualMode): VisualMode[] {
  let modes = (Object.entries(SCENE_REGISTRY) as [VisualMode, SceneRegistryEntry][])
    .filter(([mode, entry]) => (entry.energyAffinity === energy || entry.energyAffinity === "any") && !AUTO_SELECT_BLOCKLIST.has(mode))
    .map(([mode]) => mode);

  const eraPreset = era ? getEraPreset(era) : null;
  if (eraPreset) {
    // Filter out excluded modes
    modes = modes.filter((m) => !eraPreset.excludedModes.includes(m));

    // 3x weight for preferred modes
    const weighted: VisualMode[] = [];
    for (const m of modes) {
      weighted.push(m);
      if (eraPreset.preferredModes.includes(m)) {
        weighted.push(m, m); // 2 more copies = 3x total
      }
    }
    modes = weighted;
  }

  // Guarantee defaultMode is always in the pool to prevent empty pools
  if (defaultMode && modes.length === 0) {
    modes = [defaultMode];
  }

  return modes;
}

/**
 * Continuous energy-affinity centers/widths for each discrete affinity bucket.
 * The discrete enum survives in the registry for back-compat, but we project
 * it onto a continuous space so shader selection responds to actual RMS rather
 * than collapsing every "low" song into one pool.
 *
 * Wharf Rat (~0.10), Dark Star station (~0.18), and a slow Eyes (~0.25) all
 * formerly bucketed to "low" — they now sit at distinct positions in this
 * space and pull from genuinely different weighted distributions.
 *
 * Centers were chosen to span the typical RMS range for each affinity:
 * - low:  songs with avgEnergy 0.00–0.25 (ballads, dirges, drones)
 * - mid:  songs with avgEnergy 0.20–0.55 (mid-tempo grooves, jams)
 * - high: songs with avgEnergy 0.45–0.95 (rockers, climaxes)
 * - any:  versatile shaders that fit anywhere (wide gaussian)
 *
 * Sigma controls how aggressively a shader is excluded as RMS moves away
 * from its center. Tight sigma = strong differentiation; wide sigma =
 * "this shader works everywhere".
 */
const ENERGY_AFFINITY_CENTER: Record<"low" | "mid" | "high" | "any", number> = {
  low: 0.13,
  mid: 0.40,
  high: 0.72,
  any: 0.45,
};
const ENERGY_AFFINITY_SIGMA: Record<"low" | "mid" | "high" | "any", number> = {
  low: 0.16,
  mid: 0.18,
  high: 0.20,
  any: 0.55, // very wide — "any" shaders fit anywhere
};

/**
 * Continuous-energy shader pool with gaussian weighting.
 *
 * For a given continuous RMS value (typically `section.avgEnergy`), each
 * eligible shader is scored by `gaussian(rms, center, sigma)` where center
 * and sigma come from its discrete `energyAffinity`. The shader is added
 * to the pool with a copy count proportional to its score, so high-affinity
 * shaders dominate selection while low-affinity shaders still appear
 * occasionally for variety.
 *
 * This replaces the old hard 3-bucket pool, which made every "low" song
 * (RMS 0.0–0.25) draw from an identical pool — the #1 reason ballads,
 * dirges, and slow stations all looked the same.
 *
 * Era preferences and the auto-select blocklist still apply; song-specific
 * shaders still come through `songIdentity.preferredModes` upstream.
 */
export function getModesForContinuousEnergy(
  rms: number,
  era?: string,
  defaultMode?: VisualMode,
): VisualMode[] {
  // Clamp to plausible range
  const energy = Math.max(0, Math.min(1, rms));

  const eraPreset = era ? getEraPreset(era) : null;
  const eraExcluded = new Set(eraPreset?.excludedModes ?? []);
  const eraPreferred = new Set(eraPreset?.preferredModes ?? []);

  // Build weighted pool: each shader's copy count is proportional to its
  // gaussian score. Max 12 copies for the best fit, min 0 for very poor fits.
  const MAX_COPIES = 12;
  const MIN_SCORE = 0.05; // Below this, shader is excluded entirely

  const weighted: VisualMode[] = [];
  for (const [mode, entry] of Object.entries(SCENE_REGISTRY) as [VisualMode, SceneRegistryEntry][]) {
    if (AUTO_SELECT_BLOCKLIST.has(mode)) continue;
    if (eraExcluded.has(mode)) continue;

    const aff = entry.energyAffinity;
    const center = ENERGY_AFFINITY_CENTER[aff];
    const sigma = ENERGY_AFFINITY_SIGMA[aff];

    // Gaussian: exp(-(d^2) / (2 * sigma^2))
    const d = energy - center;
    const score = Math.exp(-(d * d) / (2 * sigma * sigma));

    if (score < MIN_SCORE) continue;

    // Era preferred shaders get 1.5x boost on top of their gaussian fit
    const boost = eraPreferred.has(mode) ? 1.5 : 1.0;
    const copies = Math.max(1, Math.round(score * boost * MAX_COPIES));
    for (let i = 0; i < copies; i++) weighted.push(mode);
  }

  // Guarantee defaultMode is always in the pool
  if (weighted.length === 0 && defaultMode) {
    return [defaultMode];
  }
  if (defaultMode && !weighted.includes(defaultMode)) {
    weighted.push(defaultMode);
  }

  return weighted;
}

/** Get modes appropriate for a given energy level AND spectral family.
 *  Soft filter: if spectral filtering leaves < 2 candidates, falls back to energy-only pool. */
export function getModesForEnergyAndSpectral(
  energy: "low" | "mid" | "high",
  spectralFamily?: SpectralFamily,
  era?: string,
  defaultMode?: VisualMode,
): VisualMode[] {
  const base = getModesForEnergy(energy, era, defaultMode);
  if (!spectralFamily) return base;

  const filtered = base.filter((m) => {
    const f = SCENE_REGISTRY[m]?.spectralFamily;
    return !f || f === spectralFamily; // undefined = versatile
  });
  return filtered.length >= 2 ? filtered : base;
}

/** Render a scene by mode ID */
export function renderScene(
  mode: VisualMode,
  props: SceneProps,
  config?: { cameraProfile?: CameraProfile; shaderParams?: ShaderParameterProfile },
): React.ReactNode {
  const entry = SCENE_REGISTRY[mode];
  if (!entry) {
    const fallback = SCENE_REGISTRY.protean_clouds;
    return React.createElement(fallback.Component, props);
  }
  const gi = entry.gradingIntensity;
  // Wrap in SceneConfigProvider when we have non-default grading or caller-supplied config
  if ((gi !== undefined && gi < 1.0) || config?.cameraProfile || config?.shaderParams) {
    return React.createElement(
      SceneConfigProvider,
      { value: { gradingIntensity: gi ?? 1.0, ...config } },
      React.createElement(entry.Component, props),
    );
  }
  return React.createElement(entry.Component, props);
}

/** Get all registered mode IDs */
export function getRegisteredModes(): VisualMode[] {
  return Object.keys(SCENE_REGISTRY) as VisualMode[];
}
