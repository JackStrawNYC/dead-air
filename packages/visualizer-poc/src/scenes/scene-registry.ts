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

// ─── Scene Registry ───

export const SCENE_REGISTRY: Record<VisualMode, SceneRegistryEntry> = {
  liquid_light: {
    Component: LiquidLightScene,
    energyAffinity: "high",
    complement: "oil_projector",
  },
  oil_projector: {
    Component: OilProjectorScene,
    energyAffinity: "mid",
    complement: "liquid_light",
  },
  concert_lighting: {
    Component: ConcertLightingScene,
    energyAffinity: "high",
    complement: "lo_fi_grain",
    preferredTransitionIn: "flash",
  },
  lo_fi_grain: {
    Component: LoFiGrainScene,
    energyAffinity: "mid",
    complement: "concert_lighting",
  },
  particle_nebula: {
    Component: ParticleNebulaScene,
    energyAffinity: "low",
    complement: "cosmic_dust",
  },
  stark_minimal: {
    Component: StarkMinimalScene,
    energyAffinity: "low",
    complement: "liquid_light",
  },
  tie_dye: {
    Component: TieDyeScene,
    energyAffinity: "high",
    complement: "vintage_film",
  },
  cosmic_dust: {
    Component: CosmicDustScene,
    energyAffinity: "low",
    complement: "particle_nebula",
  },
  vintage_film: {
    Component: VintageFilmScene,
    energyAffinity: "mid",
    complement: "tie_dye",
  },
  cosmic_voyage: {
    Component: CosmicVoyageScene,
    energyAffinity: "low",
    complement: "concert_lighting",
    preferredTransitionIn: "void",
  },
  inferno: {
    Component: InfernoScene,
    energyAffinity: "high",
    complement: "cosmic_voyage",
    preferredTransitionIn: "flash",
  },
  deep_ocean: {
    Component: DeepOceanScene,
    energyAffinity: "low",
    complement: "inferno",
    preferredTransitionIn: "void",
  },
  aurora: {
    Component: AuroraScene,
    energyAffinity: "low",
    complement: "tie_dye",
    preferredTransitionIn: "dissolve",
  },
  crystal_cavern: {
    Component: CrystalCavernScene,
    energyAffinity: "low",
    complement: "inferno",
  },
  fluid_light: {
    Component: FluidLightScene,
    energyAffinity: "high",
    complement: "oil_projector",
  },
  void_light: {
    Component: VoidLightScene,
    energyAffinity: "low",
    complement: "concert_lighting",
    preferredTransitionIn: "void",
  },
  fluid_2d: {
    Component: Fluid2DScene,
    energyAffinity: "any",
    complement: "liquid_light",
  },
  spectral_analyzer: {
    Component: SpectralAnalyzerScene,
    energyAffinity: "high",
    complement: "particle_swarm",
  },
  particle_swarm: {
    Component: ParticleSwarmScene,
    energyAffinity: "mid",
    complement: "spectral_analyzer",
  },
  crystalline_growth: {
    Component: CrystallineGrowthScene,
    energyAffinity: "low",
    complement: "climax_surge",
  },
  climax_surge: {
    Component: ClimaxSurgeScene,
    energyAffinity: "high",
    complement: "inferno",
  },
  kaleidoscope: {
    Component: KaleidoscopeScene,
    energyAffinity: "mid",
    complement: "sacred_geometry",
  },
  fractal_zoom: {
    Component: FractalZoomScene,
    energyAffinity: "any",
    complement: "kaleidoscope",
    preferredTransitionIn: "morph",
  },
  sacred_geometry: {
    Component: SacredGeometryScene,
    energyAffinity: "low",
    complement: "kaleidoscope",
    preferredTransitionIn: "dissolve",
  },
  reaction_diffusion: {
    Component: ReactionDiffusionScene,
    energyAffinity: "mid",
    complement: "fluid_2d",
  },
  mandala_engine: {
    Component: MandalaEngineScene,
    energyAffinity: "mid",
    complement: "sacred_geometry",
  },
  fractal_flames: {
    Component: FractalFlamesScene,
    energyAffinity: "high",
    complement: "deep_ocean",
  },
  feedback_recursion: {
    Component: FeedbackRecursionScene,
    energyAffinity: "any",
    complement: "fractal_flames",
  },
  truchet_tiling: {
    Component: TruchetTilingScene,
    energyAffinity: "mid",
    complement: "mandala_engine",
  },
  diffraction_rings: {
    Component: DiffractionRingsScene,
    energyAffinity: "low",
    complement: "aurora",
  },
  plasma_field: {
    Component: PlasmaFieldScene,
    energyAffinity: "any",
    complement: "diffraction_rings",
  },
  // Placeholder entries — scenes will be implemented in subsequent waves
  voronoi_flow: {
    Component: VoronoiFlowScene,
    energyAffinity: "mid",
    complement: "truchet_tiling",
  },
  electric_arc: {
    Component: ElectricArcScene,
    energyAffinity: "high",
    complement: "aurora",
    preferredTransitionIn: "distortion",
  },
  morphogenesis: {
    Component: MorphogenesisScene,
    energyAffinity: "mid",
    complement: "reaction_diffusion",
  },
  stained_glass: {
    Component: StainedGlassScene,
    energyAffinity: "any",
    complement: "sacred_geometry",
  },
  neural_web: {
    Component: NeuralWebScene,
    energyAffinity: "high",
    complement: "fractal_flames",
  },
  smoke_rings: {
    Component: SmokeRingsScene,
    energyAffinity: "mid",
    complement: "deep_ocean",
  },
  aurora_curtains: {
    Component: AuroraCurtainsScene,
    energyAffinity: "low",
    complement: "concert_lighting",
  },
  digital_rain: {
    Component: DigitalRainScene,
    energyAffinity: "any",
    complement: "stark_minimal",
  },
  lava_flow: {
    Component: LavaFlowScene,
    energyAffinity: "high",
    complement: "crystal_cavern",
  },
  // Phase 9 Wave 2: 8 new scenes
  mycelium_network: {
    Component: MyceliumNetworkScene,
    energyAffinity: "mid",
    complement: "neural_web",
  },
  ink_wash: {
    Component: InkWashScene,
    energyAffinity: "low",
    complement: "stark_minimal",
  },
  coral_reef: {
    Component: CoralReefScene,
    energyAffinity: "low",
    complement: "deep_ocean",
  },
  solar_flare: {
    Component: SolarFlareScene,
    energyAffinity: "high",
    complement: "inferno",
  },
  galaxy_spiral: {
    Component: GalaxySpiralScene,
    energyAffinity: "any",
    complement: "cosmic_voyage",
  },
  warp_field: {
    Component: WarpFieldScene,
    energyAffinity: "mid",
    complement: "diffraction_rings",
  },
  signal_decay: {
    Component: SignalDecayScene,
    energyAffinity: "any",
    complement: "digital_rain",
  },
  databend: {
    Component: DatabendScene,
    energyAffinity: "high",
    complement: "lo_fi_grain",
  },
  // Tier 1: Volumetric Raymarching Shaders
  volumetric_clouds: {
    Component: VolumetricCloudsScene,
    energyAffinity: "low",
    complement: "volumetric_smoke",
    preferredTransitionIn: "dissolve",
  },
  volumetric_smoke: {
    Component: VolumetricSmokeScene,
    energyAffinity: "mid",
    complement: "concert_lighting",
    preferredTransitionIn: "void",
  },
  volumetric_nebula: {
    Component: VolumetricNebulaScene,
    energyAffinity: "any",
    complement: "cosmic_voyage",
    preferredTransitionIn: "dissolve",
  },
};

// ─── Transition Affinity Map ───
// Which shaders crossfade well together — used by SceneRouter for energy-aware morphing

export const TRANSITION_AFFINITY: Partial<Record<VisualMode, VisualMode[]>> = {
  liquid_light: ["oil_projector", "tie_dye", "inferno"],
  concert_lighting: ["inferno", "liquid_light", "tie_dye"],
  deep_ocean: ["aurora", "cosmic_voyage", "crystal_cavern"],
  cosmic_voyage: ["particle_nebula", "deep_ocean", "aurora"],
  inferno: ["concert_lighting", "liquid_light", "tie_dye"],
  oil_projector: ["liquid_light", "lo_fi_grain", "vintage_film"],
  tie_dye: ["liquid_light", "inferno", "concert_lighting"],
  aurora: ["deep_ocean", "cosmic_voyage", "crystal_cavern"],
  particle_nebula: ["cosmic_dust", "cosmic_voyage", "aurora"],
  cosmic_dust: ["particle_nebula", "deep_ocean", "crystal_cavern"],
  lo_fi_grain: ["oil_projector", "vintage_film", "stark_minimal"],
  vintage_film: ["oil_projector", "lo_fi_grain", "stark_minimal"],
  stark_minimal: ["lo_fi_grain", "vintage_film", "cosmic_dust"],
  crystal_cavern: ["deep_ocean", "aurora", "cosmic_dust"],
  fluid_light: ["liquid_light", "oil_projector", "tie_dye"],
  void_light: ["deep_ocean", "cosmic_voyage", "crystal_cavern"],
  fluid_2d: ["liquid_light", "fluid_light", "oil_projector"],
  spectral_analyzer: ["concert_lighting", "inferno", "climax_surge"],
  particle_swarm: ["cosmic_dust", "particle_nebula", "aurora"],
  crystalline_growth: ["crystal_cavern", "deep_ocean", "aurora"],
  climax_surge: ["inferno", "concert_lighting", "spectral_analyzer"],
  kaleidoscope: ["tie_dye", "liquid_light", "sacred_geometry"],
  fractal_zoom: ["kaleidoscope", "crystalline_growth", "cosmic_voyage"],
  sacred_geometry: ["crystal_cavern", "aurora", "kaleidoscope"],
  reaction_diffusion: ["fluid_2d", "oil_projector", "liquid_light"],
  mandala_engine: ["sacred_geometry", "kaleidoscope", "crystal_cavern"],
  fractal_flames: ["inferno", "tie_dye", "liquid_light"],
  feedback_recursion: ["liquid_light", "kaleidoscope", "fractal_zoom", "reaction_diffusion", "morphogenesis", "fractal_flames", "neural_web", "sacred_geometry"],
  truchet_tiling: ["sacred_geometry", "mandala_engine", "kaleidoscope"],
  diffraction_rings: ["aurora", "crystal_cavern", "deep_ocean"],
  plasma_field: ["tie_dye", "liquid_light", "diffraction_rings"],
  voronoi_flow: ["truchet_tiling", "sacred_geometry", "stained_glass"],
  stained_glass: ["sacred_geometry", "voronoi_flow", "crystal_cavern"],
  electric_arc: ["inferno", "concert_lighting", "aurora"],
  morphogenesis: ["reaction_diffusion", "fluid_2d", "voronoi_flow"],
  neural_web: ["electric_arc", "fractal_flames", "feedback_recursion"],
  smoke_rings: ["deep_ocean", "aurora", "oil_projector"],
  aurora_curtains: ["aurora", "deep_ocean", "cosmic_voyage"],
  digital_rain: ["stark_minimal", "lo_fi_grain", "concert_lighting"],
  lava_flow: ["inferno", "electric_arc", "fractal_flames"],
  // Phase 9 Wave 2: 8 new scenes
  mycelium_network: ["morphogenesis", "neural_web", "reaction_diffusion"],
  ink_wash: ["stark_minimal", "vintage_film", "deep_ocean"],
  coral_reef: ["deep_ocean", "aurora", "crystal_cavern"],
  solar_flare: ["inferno", "electric_arc", "lava_flow"],
  galaxy_spiral: ["cosmic_voyage", "cosmic_dust", "particle_nebula"],
  warp_field: ["diffraction_rings", "cosmic_voyage", "void_light"],
  signal_decay: ["digital_rain", "lo_fi_grain", "vintage_film"],
  databend: ["digital_rain", "signal_decay", "lo_fi_grain"],
  // Tier 1: Volumetric Raymarching Shaders
  volumetric_clouds: ["aurora", "deep_ocean", "cosmic_voyage"],
  volumetric_smoke: ["concert_lighting", "smoke_rings", "lo_fi_grain"],
  volumetric_nebula: ["cosmic_voyage", "particle_nebula", "galaxy_spiral"],
};

// ─── Helper functions ───

/** Get the complement mode for auto-variety */
export function getComplement(mode: VisualMode): VisualMode {
  return SCENE_REGISTRY[mode]?.complement ?? mode;
}

/** Get modes appropriate for a given energy level, with optional era filtering.
 *  Era preferred modes get 3x weight, excluded modes are removed.
 *  Song's defaultMode is always included as fallback. */
export function getModesForEnergy(energy: "low" | "mid" | "high", era?: string, defaultMode?: VisualMode): VisualMode[] {
  let modes = (Object.entries(SCENE_REGISTRY) as [VisualMode, SceneRegistryEntry][])
    .filter(([, entry]) => entry.energyAffinity === energy || entry.energyAffinity === "any")
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

/** Render a scene by mode ID */
export function renderScene(
  mode: VisualMode,
  props: SceneProps,
): React.ReactNode {
  const entry = SCENE_REGISTRY[mode];
  if (!entry) {
    // Fallback to liquid_light for unknown modes
    const fallback = SCENE_REGISTRY.liquid_light;
    return React.createElement(fallback.Component, props);
  }
  return React.createElement(entry.Component, props);
}

/** Get all registered mode IDs */
export function getRegisteredModes(): VisualMode[] {
  return Object.keys(SCENE_REGISTRY) as VisualMode[];
}
