/**
 * Scene list — imports all shader pairs from visualizer-poc and creates
 * VJ scene components. Reuses VisualMode type and energy affinity metadata.
 */

import type { VisualMode } from "@visualizer/data/types";
import { createVJScene, createVJFeedbackScene } from "./VJSceneWrapper";

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
import { fractalFlamesVert, fractalFlamesFrag } from "@visualizer/shaders/fractal-flames";
import { feedbackRecursionVert, feedbackRecursionFrag } from "@visualizer/shaders/feedback-recursion";
import { truchetTilingVert, truchetTilingFrag } from "@visualizer/shaders/truchet-tiling";
import { diffractionRingsVert, diffractionRingsFrag } from "@visualizer/shaders/diffraction-rings";
import { plasmaFieldVert, plasmaFieldFrag } from "@visualizer/shaders/plasma-field";
import { voronoiFlowVert, voronoiFlowFrag } from "@visualizer/shaders/voronoi-flow";
import { stainedGlassVert, stainedGlassFrag } from "@visualizer/shaders/stained-glass";
import { electricArcVert, electricArcFrag } from "@visualizer/shaders/electric-arc";
import { morphogenesisVert, morphogenesisFrag } from "@visualizer/shaders/morphogenesis";
import { neuralWebVert, neuralWebFrag } from "@visualizer/shaders/neural-web";
import { smokeRingsVert, smokeRingsFrag } from "@visualizer/shaders/smoke-rings";
import { auroraCurtainsVert, auroraCurtainsFrag } from "@visualizer/shaders/aurora-curtains";
import { digitalRainVert, digitalRainFrag } from "@visualizer/shaders/digital-rain";
import { lavaFlowVert, lavaFlowFrag } from "@visualizer/shaders/lava-flow";

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
  /** Whether this shader uses feedback (ping-pong buffer) rendering */
  feedback?: boolean;
}

/** All VJ scenes keyed by VisualMode (Partial — not all modes have VJ entries) */
export const VJ_SCENES: Partial<Record<VisualMode, VJSceneEntry>> = {
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
  fractal_flames: {
    Component: createVJFeedbackScene(fractalFlamesVert, fractalFlamesFrag, "VJFractalFlames", 0.97),
    energyAffinity: "high",
    complement: "cosmic_voyage",
    vertexShader: fractalFlamesVert,
    fragmentShader: fractalFlamesFrag,
    feedback: true,
  },
  feedback_recursion: {
    Component: createVJFeedbackScene(feedbackRecursionVert, feedbackRecursionFrag, "VJFeedbackRecursion", 0.95),
    energyAffinity: "mid",
    complement: "deep_ocean",
    vertexShader: feedbackRecursionVert,
    fragmentShader: feedbackRecursionFrag,
    feedback: true,
  },
  truchet_tiling: {
    Component: createVJScene(truchetTilingVert, truchetTilingFrag, "VJTruchetTiling"),
    energyAffinity: "mid",
    complement: "crystal_cavern",
    vertexShader: truchetTilingVert,
    fragmentShader: truchetTilingFrag,
  },
  diffraction_rings: {
    Component: createVJScene(diffractionRingsVert, diffractionRingsFrag, "VJDiffractionRings"),
    energyAffinity: "low",
    complement: "aurora",
    vertexShader: diffractionRingsVert,
    fragmentShader: diffractionRingsFrag,
  },
  plasma_field: {
    Component: createVJScene(plasmaFieldVert, plasmaFieldFrag, "VJPlasmaField"),
    energyAffinity: "any",
    complement: "diffraction_rings",
    vertexShader: plasmaFieldVert,
    fragmentShader: plasmaFieldFrag,
  },
  voronoi_flow: {
    Component: createVJScene(voronoiFlowVert, voronoiFlowFrag, "VJVoronoiFlow"),
    energyAffinity: "mid",
    complement: "truchet_tiling",
    vertexShader: voronoiFlowVert,
    fragmentShader: voronoiFlowFrag,
  },
  stained_glass: {
    Component: createVJScene(stainedGlassVert, stainedGlassFrag, "VJStainedGlass"),
    energyAffinity: "any",
    complement: "sacred_geometry",
    vertexShader: stainedGlassVert,
    fragmentShader: stainedGlassFrag,
  },
  electric_arc: {
    Component: createVJFeedbackScene(electricArcVert, electricArcFrag, "VJElectricArc", 0.92),
    energyAffinity: "high",
    complement: "aurora",
    vertexShader: electricArcVert,
    fragmentShader: electricArcFrag,
    feedback: true,
  },
  morphogenesis: {
    Component: createVJFeedbackScene(morphogenesisVert, morphogenesisFrag, "VJMorphogenesis", 0.98),
    energyAffinity: "mid",
    complement: "reaction_diffusion",
    vertexShader: morphogenesisVert,
    fragmentShader: morphogenesisFrag,
    feedback: true,
  },
  neural_web: {
    Component: createVJFeedbackScene(neuralWebVert, neuralWebFrag, "VJNeuralWeb", 0.94),
    energyAffinity: "high",
    complement: "fractal_flames",
    vertexShader: neuralWebVert,
    fragmentShader: neuralWebFrag,
    feedback: true,
  },
  smoke_rings: {
    Component: createVJScene(smokeRingsVert, smokeRingsFrag, "VJSmokeRings"),
    energyAffinity: "mid",
    complement: "deep_ocean",
    vertexShader: smokeRingsVert,
    fragmentShader: smokeRingsFrag,
  },
  aurora_curtains: {
    Component: createVJScene(auroraCurtainsVert, auroraCurtainsFrag, "VJAuroraCurtains"),
    energyAffinity: "low",
    complement: "concert_lighting",
    vertexShader: auroraCurtainsVert,
    fragmentShader: auroraCurtainsFrag,
  },
  digital_rain: {
    Component: createVJScene(digitalRainVert, digitalRainFrag, "VJDigitalRain"),
    energyAffinity: "any",
    complement: "stark_minimal",
    vertexShader: digitalRainVert,
    fragmentShader: digitalRainFrag,
  },
  lava_flow: {
    Component: createVJFeedbackScene(lavaFlowVert, lavaFlowFrag, "VJLavaFlow", 0.96),
    energyAffinity: "high",
    complement: "crystal_cavern",
    vertexShader: lavaFlowVert,
    fragmentShader: lavaFlowFrag,
    feedback: true,
  },
};

/** Ordered list of all scenes (for shader warming and scene picker) */
export const VJ_SCENE_LIST = Object.entries(VJ_SCENES)
  .filter((pair): pair is [string, VJSceneEntry] => pair[1] !== undefined)
  .map(([mode, entry]) => ({
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
  "fractal_flames",
  "feedback_recursion",
  "truchet_tiling",
  "diffraction_rings",
  "plasma_field",
  "voronoi_flow",
  "stained_glass",
  "electric_arc",
  "morphogenesis",
  "neural_web",
  "smoke_rings",
  "aurora_curtains",
  "digital_rain",
  "lava_flow",
];
