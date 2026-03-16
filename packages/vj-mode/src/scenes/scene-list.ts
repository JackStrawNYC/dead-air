/**
 * Scene list — imports all shader pairs from visualizer-poc and creates
 * VJ scene components. Reuses VisualMode type and energy affinity metadata.
 */

import type { VisualMode } from "@visualizer/data/types";
import { createVJScene } from "./VJSceneWrapper";

// Import all shader pairs
import { liquidLightVert, liquidLightFrag } from "@visualizer/shaders/liquid-light";
import { oilProjectorVert, oilProjectorFrag } from "@visualizer/shaders/oil-projector";
import { concertBeamsVert, concertBeamsFrag } from "@visualizer/shaders/concert-beams";
import { loFiGrainVert, loFiGrainFrag } from "@visualizer/shaders/lo-fi-grain";
import { starkMinimalVert, starkMinimalFrag } from "@visualizer/shaders/stark-minimal";
import { tieDyeVert, tieDyeFrag } from "@visualizer/shaders/tie-dye";
import { cosmicDustVert, cosmicDustFrag } from "@visualizer/shaders/cosmic-dust";
import { vintageFilmVert, vintageFilmFrag } from "@visualizer/shaders/vintage-film";
import { cosmicVoyageVert, cosmicVoyageFrag } from "@visualizer/shaders/cosmic-voyage";
import { infernoVert, infernoFrag } from "@visualizer/shaders/inferno";
import { deepOceanVert, deepOceanFrag } from "@visualizer/shaders/deep-ocean";
import { auroraVert, auroraFrag } from "@visualizer/shaders/aurora";
import { fluidLightVert, fluidLightFrag } from "@visualizer/shaders/fluid-light";
import { voidLightVert, voidLightFrag } from "@visualizer/shaders/void-light";

// InstancedMesh scenes (ParticleNebula, CrystalCavern) need custom adapters
// For now, use simpler fullscreen-quad shaders; custom 3D scenes added later
import { particleNebulaVert, particleNebulaFrag } from "@visualizer/shaders/particle-nebula";
import { crystalCavernVert, crystalCavernFrag } from "@visualizer/shaders/crystal-cavern";

export interface VJSceneEntry {
  Component: React.FC;
  energyAffinity: "low" | "mid" | "high" | "any";
  complement: VisualMode;
  vertexShader: string;
  fragmentShader: string;
}

/** All VJ scenes keyed by VisualMode */
export const VJ_SCENES: Record<VisualMode, VJSceneEntry> = {
  liquid_light: {
    Component: createVJScene(liquidLightVert, liquidLightFrag, "VJLiquidLight"),
    energyAffinity: "high",
    complement: "oil_projector",
    vertexShader: liquidLightVert,
    fragmentShader: liquidLightFrag,
  },
  oil_projector: {
    Component: createVJScene(oilProjectorVert, oilProjectorFrag, "VJOilProjector"),
    energyAffinity: "mid",
    complement: "liquid_light",
    vertexShader: oilProjectorVert,
    fragmentShader: oilProjectorFrag,
  },
  concert_lighting: {
    Component: createVJScene(concertBeamsVert, concertBeamsFrag, "VJConcertLighting"),
    energyAffinity: "high",
    complement: "lo_fi_grain",
    vertexShader: concertBeamsVert,
    fragmentShader: concertBeamsFrag,
  },
  lo_fi_grain: {
    Component: createVJScene(loFiGrainVert, loFiGrainFrag, "VJLoFiGrain"),
    energyAffinity: "mid",
    complement: "concert_lighting",
    vertexShader: loFiGrainVert,
    fragmentShader: loFiGrainFrag,
  },
  particle_nebula: {
    Component: createVJScene(particleNebulaVert, particleNebulaFrag, "VJParticleNebula"),
    energyAffinity: "low",
    complement: "cosmic_dust",
    vertexShader: particleNebulaVert,
    fragmentShader: particleNebulaFrag,
  },
  stark_minimal: {
    Component: createVJScene(starkMinimalVert, starkMinimalFrag, "VJStarkMinimal"),
    energyAffinity: "low",
    complement: "liquid_light",
    vertexShader: starkMinimalVert,
    fragmentShader: starkMinimalFrag,
  },
  tie_dye: {
    Component: createVJScene(tieDyeVert, tieDyeFrag, "VJTieDye"),
    energyAffinity: "high",
    complement: "vintage_film",
    vertexShader: tieDyeVert,
    fragmentShader: tieDyeFrag,
  },
  cosmic_dust: {
    Component: createVJScene(cosmicDustVert, cosmicDustFrag, "VJCosmicDust"),
    energyAffinity: "low",
    complement: "particle_nebula",
    vertexShader: cosmicDustVert,
    fragmentShader: cosmicDustFrag,
  },
  vintage_film: {
    Component: createVJScene(vintageFilmVert, vintageFilmFrag, "VJVintageFilm"),
    energyAffinity: "mid",
    complement: "tie_dye",
    vertexShader: vintageFilmVert,
    fragmentShader: vintageFilmFrag,
  },
  cosmic_voyage: {
    Component: createVJScene(cosmicVoyageVert, cosmicVoyageFrag, "VJCosmicVoyage"),
    energyAffinity: "low",
    complement: "concert_lighting",
    vertexShader: cosmicVoyageVert,
    fragmentShader: cosmicVoyageFrag,
  },
  inferno: {
    Component: createVJScene(infernoVert, infernoFrag, "VJInferno"),
    energyAffinity: "high",
    complement: "cosmic_voyage",
    vertexShader: infernoVert,
    fragmentShader: infernoFrag,
  },
  deep_ocean: {
    Component: createVJScene(deepOceanVert, deepOceanFrag, "VJDeepOcean"),
    energyAffinity: "low",
    complement: "inferno",
    vertexShader: deepOceanVert,
    fragmentShader: deepOceanFrag,
  },
  aurora: {
    Component: createVJScene(auroraVert, auroraFrag, "VJAurora"),
    energyAffinity: "low",
    complement: "tie_dye",
    vertexShader: auroraVert,
    fragmentShader: auroraFrag,
  },
  crystal_cavern: {
    Component: createVJScene(crystalCavernVert, crystalCavernFrag, "VJCrystalCavern"),
    energyAffinity: "low",
    complement: "inferno",
    vertexShader: crystalCavernVert,
    fragmentShader: crystalCavernFrag,
  },
  fluid_light: {
    Component: createVJScene(fluidLightVert, fluidLightFrag, "VJFluidLight"),
    energyAffinity: "high",
    complement: "oil_projector",
    vertexShader: fluidLightVert,
    fragmentShader: fluidLightFrag,
  },
  void_light: {
    Component: createVJScene(voidLightVert, voidLightFrag, "VJVoidLight"),
    energyAffinity: "low",
    complement: "concert_lighting",
    vertexShader: voidLightVert,
    fragmentShader: voidLightFrag,
  },
};

/** Ordered list of all scenes (for shader warming and scene picker) */
export const VJ_SCENE_LIST = Object.entries(VJ_SCENES).map(([mode, entry]) => ({
  mode: mode as VisualMode,
  ...entry,
}));

/** Scene modes in order (for keyboard shortcuts) */
export const SCENE_MODES: VisualMode[] = [
  "liquid_light",
  "oil_projector",
  "concert_lighting",
  "lo_fi_grain",
  "tie_dye",
  "cosmic_dust",
  "vintage_film",
  "cosmic_voyage",
  "inferno",
  "deep_ocean",
  "aurora",
  "crystal_cavern",
  "fluid_light",
  "void_light",
  "particle_nebula",
  "stark_minimal",
];
