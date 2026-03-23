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
// Phase 9 Wave 1: 10 missing VJ modes
import { fluid2DVert, fluid2DFrag } from "@visualizer/shaders/fluid-2d";
import { spectralAnalyzerVert, spectralAnalyzerFrag } from "@visualizer/shaders/spectral-analyzer";
import { particleSwarmVert, particleSwarmFrag } from "@visualizer/shaders/particle-swarm";
import { crystallineGrowthVert, crystallineGrowthFrag } from "@visualizer/shaders/crystalline-growth";
import { climaxSurgeVert, climaxSurgeFrag } from "@visualizer/shaders/climax-surge";
import { kaleidoscopeVert, kaleidoscopeFrag } from "@visualizer/shaders/kaleidoscope";
import { fractalZoomVert, fractalZoomFrag } from "@visualizer/shaders/fractal-zoom";
import { sacredGeometryVert, sacredGeometryFrag } from "@visualizer/shaders/sacred-geometry";
import { reactionDiffusionVert, reactionDiffusionFrag } from "@visualizer/shaders/reaction-diffusion";
import { mandalaEngineVert, mandalaEngineFrag } from "@visualizer/shaders/mandala-engine";
// Phase 9 Wave 2: 8 new shaders
import { myceliumNetworkVert, myceliumNetworkFrag } from "@visualizer/shaders/mycelium-network";
import { inkWashVert, inkWashFrag } from "@visualizer/shaders/ink-wash";
import { coralReefVert, coralReefFrag } from "@visualizer/shaders/coral-reef";
import { solarFlareVert, solarFlareFrag } from "@visualizer/shaders/solar-flare";
import { galaxySpiralVert, galaxySpiralFrag } from "@visualizer/shaders/galaxy-spiral";
import { warpFieldVert, warpFieldFrag } from "@visualizer/shaders/warp-field";
import { signalDecayVert, signalDecayFrag } from "@visualizer/shaders/signal-decay";
import { databendVert, databendFrag } from "@visualizer/shaders/databend";
// Volumetric + Environment scenes
import { volumetricCloudsVert, volumetricCloudsFrag } from "@visualizer/shaders/volumetric-clouds";
import { volumetricSmokeVert, volumetricSmokeFrag } from "@visualizer/shaders/volumetric-smoke";
import { volumetricNebulaVert, volumetricNebulaFrag } from "@visualizer/shaders/volumetric-nebula";
import { riverVert, riverFrag } from "@visualizer/shaders/river";
import { spaceTravelVert, spaceTravelFrag } from "@visualizer/shaders/space-travel";
import { mountainSilhouetteVert as mountainFireVert, mountainSilhouetteFrag as mountainFireFrag } from "@visualizer/shaders/mountain-fire";
import { flowerFieldVert, flowerFieldFrag } from "@visualizer/shaders/flower-field";
import { forestVert, forestFrag } from "@visualizer/shaders/forest";
import { oceanWaterVert as oceanVert, oceanWaterFrag as oceanFrag } from "@visualizer/shaders/ocean";
import { desertRoadVert, desertRoadFrag } from "@visualizer/shaders/desert-road";
import { campfireVert, campfireFrag } from "@visualizer/shaders/campfire";
import { rainStreetVert, rainStreetFrag } from "@visualizer/shaders/rain-street";
import { auroraSkyVert, auroraSkyFrag } from "@visualizer/shaders/aurora-sky";
import { stormVert, stormFrag } from "@visualizer/shaders/storm";
import { canyonVert, canyonFrag } from "@visualizer/shaders/canyon";
// New shaders
import { liquidMandalaVert, liquidMandalaFrag } from "@visualizer/shaders/liquid-mandala";
import { bioluminescenceVert, bioluminescenceFrag } from "@visualizer/shaders/bioluminescence";
import { neonGridVert, neonGridFrag } from "@visualizer/shaders/neon-grid";
import { warmNebulaVert, warmNebulaFrag } from "@visualizer/shaders/warm-nebula";
import { prismRefractionVert, prismRefractionFrag } from "@visualizer/shaders/prism-refraction";
import { cellularAutomataVert, cellularAutomataFrag } from "@visualizer/shaders/cellular-automata";

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
  // Phase 9 Wave 1: 10 missing VJ modes
  fluid_2d: {
    Component: createVJFeedbackScene(fluid2DVert, fluid2DFrag, "VJFluid2D", 0.96),
    energyAffinity: "any",
    complement: "liquid_light",
    vertexShader: fluid2DVert,
    fragmentShader: fluid2DFrag,
    feedback: true,
  },
  spectral_analyzer: {
    Component: createVJScene(spectralAnalyzerVert, spectralAnalyzerFrag, "VJSpectralAnalyzer"),
    energyAffinity: "high",
    complement: "particle_swarm",
    vertexShader: spectralAnalyzerVert,
    fragmentShader: spectralAnalyzerFrag,
  },
  particle_swarm: {
    Component: createVJScene(particleSwarmVert, particleSwarmFrag, "VJParticleSwarm"),
    energyAffinity: "mid",
    complement: "spectral_analyzer",
    vertexShader: particleSwarmVert,
    fragmentShader: particleSwarmFrag,
  },
  crystalline_growth: {
    Component: createVJFeedbackScene(crystallineGrowthVert, crystallineGrowthFrag, "VJCrystallineGrowth", 0.98),
    energyAffinity: "low",
    complement: "climax_surge",
    vertexShader: crystallineGrowthVert,
    fragmentShader: crystallineGrowthFrag,
    feedback: true,
  },
  climax_surge: {
    Component: createVJScene(climaxSurgeVert, climaxSurgeFrag, "VJClimaxSurge"),
    energyAffinity: "high",
    complement: "inferno",
    vertexShader: climaxSurgeVert,
    fragmentShader: climaxSurgeFrag,
  },
  kaleidoscope: {
    Component: createVJScene(kaleidoscopeVert, kaleidoscopeFrag, "VJKaleidoscope"),
    energyAffinity: "mid",
    complement: "sacred_geometry",
    vertexShader: kaleidoscopeVert,
    fragmentShader: kaleidoscopeFrag,
  },
  fractal_zoom: {
    Component: createVJScene(fractalZoomVert, fractalZoomFrag, "VJFractalZoom"),
    energyAffinity: "any",
    complement: "kaleidoscope",
    vertexShader: fractalZoomVert,
    fragmentShader: fractalZoomFrag,
  },
  sacred_geometry: {
    Component: createVJScene(sacredGeometryVert, sacredGeometryFrag, "VJSacredGeometry"),
    energyAffinity: "low",
    complement: "kaleidoscope",
    vertexShader: sacredGeometryVert,
    fragmentShader: sacredGeometryFrag,
  },
  reaction_diffusion: {
    Component: createVJFeedbackScene(reactionDiffusionVert, reactionDiffusionFrag, "VJReactionDiffusion", 0.97),
    energyAffinity: "mid",
    complement: "fluid_2d",
    vertexShader: reactionDiffusionVert,
    fragmentShader: reactionDiffusionFrag,
    feedback: true,
  },
  mandala_engine: {
    Component: createVJScene(mandalaEngineVert, mandalaEngineFrag, "VJMandalaEngine"),
    energyAffinity: "mid",
    complement: "sacred_geometry",
    vertexShader: mandalaEngineVert,
    fragmentShader: mandalaEngineFrag,
  },
  // Phase 9 Wave 2: 8 new shaders
  mycelium_network: {
    Component: createVJFeedbackScene(myceliumNetworkVert, myceliumNetworkFrag, "VJMyceliumNetwork", 0.97),
    energyAffinity: "mid",
    complement: "neural_web",
    vertexShader: myceliumNetworkVert,
    fragmentShader: myceliumNetworkFrag,
    feedback: true,
  },
  ink_wash: {
    Component: createVJFeedbackScene(inkWashVert, inkWashFrag, "VJInkWash", 0.985),
    energyAffinity: "low",
    complement: "stark_minimal",
    vertexShader: inkWashVert,
    fragmentShader: inkWashFrag,
    feedback: true,
  },
  coral_reef: {
    Component: createVJScene(coralReefVert, coralReefFrag, "VJCoralReef"),
    energyAffinity: "low",
    complement: "deep_ocean",
    vertexShader: coralReefVert,
    fragmentShader: coralReefFrag,
  },
  solar_flare: {
    Component: createVJFeedbackScene(solarFlareVert, solarFlareFrag, "VJSolarFlare", 0.94),
    energyAffinity: "high",
    complement: "inferno",
    vertexShader: solarFlareVert,
    fragmentShader: solarFlareFrag,
    feedback: true,
  },
  galaxy_spiral: {
    Component: createVJScene(galaxySpiralVert, galaxySpiralFrag, "VJGalaxySpiral"),
    energyAffinity: "any",
    complement: "cosmic_voyage",
    vertexShader: galaxySpiralVert,
    fragmentShader: galaxySpiralFrag,
  },
  warp_field: {
    Component: createVJScene(warpFieldVert, warpFieldFrag, "VJWarpField"),
    energyAffinity: "mid",
    complement: "diffraction_rings",
    vertexShader: warpFieldVert,
    fragmentShader: warpFieldFrag,
  },
  signal_decay: {
    Component: createVJFeedbackScene(signalDecayVert, signalDecayFrag, "VJSignalDecay", 0.91),
    energyAffinity: "any",
    complement: "digital_rain",
    vertexShader: signalDecayVert,
    fragmentShader: signalDecayFrag,
    feedback: true,
  },
  databend: {
    Component: createVJScene(databendVert, databendFrag, "VJDatabend"),
    energyAffinity: "high",
    complement: "lo_fi_grain",
    vertexShader: databendVert,
    fragmentShader: databendFrag,
  },
  // Volumetric + Environment scenes
  volumetric_clouds: {
    Component: createVJFeedbackScene(volumetricCloudsVert, volumetricCloudsFrag, "VJVolumetricClouds", 0.96),
    energyAffinity: "low",
    complement: "volumetric_smoke",
    vertexShader: volumetricCloudsVert,
    fragmentShader: volumetricCloudsFrag,
    feedback: true,
  },
  volumetric_smoke: {
    Component: createVJFeedbackScene(volumetricSmokeVert, volumetricSmokeFrag, "VJVolumetricSmoke", 0.95),
    energyAffinity: "mid",
    complement: "concert_lighting",
    vertexShader: volumetricSmokeVert,
    fragmentShader: volumetricSmokeFrag,
    feedback: true,
  },
  volumetric_nebula: {
    Component: createVJFeedbackScene(volumetricNebulaVert, volumetricNebulaFrag, "VJVolumetricNebula", 0.97),
    energyAffinity: "any",
    complement: "cosmic_voyage",
    vertexShader: volumetricNebulaVert,
    fragmentShader: volumetricNebulaFrag,
    feedback: true,
  },
  river: {
    Component: createVJFeedbackScene(riverVert, riverFrag, "VJRiver", 0.96),
    energyAffinity: "any",
    complement: "inferno",
    vertexShader: riverVert,
    fragmentShader: riverFrag,
    feedback: true,
  },
  space_travel: {
    Component: createVJScene(spaceTravelVert, spaceTravelFrag, "VJSpaceTravel"),
    energyAffinity: "any",
    complement: "deep_ocean",
    vertexShader: spaceTravelVert,
    fragmentShader: spaceTravelFrag,
  },
  mountain_fire: {
    Component: createVJScene(mountainFireVert, mountainFireFrag, "VJMountainFire"),
    energyAffinity: "mid",
    complement: "deep_ocean",
    vertexShader: mountainFireVert,
    fragmentShader: mountainFireFrag,
  },
  flower_field: {
    Component: createVJScene(flowerFieldVert, flowerFieldFrag, "VJFlowerField"),
    energyAffinity: "mid",
    complement: "deep_ocean",
    vertexShader: flowerFieldVert,
    fragmentShader: flowerFieldFrag,
  },
  forest: {
    Component: createVJScene(forestVert, forestFrag, "VJForest"),
    energyAffinity: "low",
    complement: "inferno",
    vertexShader: forestVert,
    fragmentShader: forestFrag,
  },
  ocean: {
    Component: createVJFeedbackScene(oceanVert, oceanFrag, "VJOcean", 0.96),
    energyAffinity: "any",
    complement: "desert_road",
    vertexShader: oceanVert,
    fragmentShader: oceanFrag,
    feedback: true,
  },
  desert_road: {
    Component: createVJScene(desertRoadVert, desertRoadFrag, "VJDesertRoad"),
    energyAffinity: "mid",
    complement: "deep_ocean",
    vertexShader: desertRoadVert,
    fragmentShader: desertRoadFrag,
  },
  campfire: {
    Component: createVJScene(campfireVert, campfireFrag, "VJCampfire"),
    energyAffinity: "low",
    complement: "electric_arc",
    vertexShader: campfireVert,
    fragmentShader: campfireFrag,
  },
  rain_street: {
    Component: createVJFeedbackScene(rainStreetVert, rainStreetFrag, "VJRainStreet", 0.95),
    energyAffinity: "low",
    complement: "inferno",
    vertexShader: rainStreetVert,
    fragmentShader: rainStreetFrag,
    feedback: true,
  },
  aurora_sky: {
    Component: createVJScene(auroraSkyVert, auroraSkyFrag, "VJAuroraSky"),
    energyAffinity: "any",
    complement: "inferno",
    vertexShader: auroraSkyVert,
    fragmentShader: auroraSkyFrag,
  },
  storm: {
    Component: createVJFeedbackScene(stormVert, stormFrag, "VJStorm", 0.93),
    energyAffinity: "high",
    complement: "aurora",
    vertexShader: stormVert,
    fragmentShader: stormFrag,
    feedback: true,
  },
  canyon: {
    Component: createVJScene(canyonVert, canyonFrag, "VJCanyon"),
    energyAffinity: "mid",
    complement: "cosmic_voyage",
    vertexShader: canyonVert,
    fragmentShader: canyonFrag,
  },
  // New shaders
  liquid_mandala: {
    Component: createVJFeedbackScene(liquidMandalaVert, liquidMandalaFrag, "VJLiquidMandala", 0.93),
    energyAffinity: "mid",
    complement: "sacred_geometry",
    vertexShader: liquidMandalaVert,
    fragmentShader: liquidMandalaFrag,
    feedback: true,
  },
  bioluminescence: {
    Component: createVJFeedbackScene(bioluminescenceVert, bioluminescenceFrag, "VJBioluminescence", 0.95),
    energyAffinity: "high",
    complement: "mycelium_network",
    vertexShader: bioluminescenceVert,
    fragmentShader: bioluminescenceFrag,
    feedback: true,
  },
  neon_grid: {
    Component: createVJFeedbackScene(neonGridVert, neonGridFrag, "VJNeonGrid", 0.92),
    energyAffinity: "high",
    complement: "concert_lighting",
    vertexShader: neonGridVert,
    fragmentShader: neonGridFrag,
    feedback: true,
  },
  warm_nebula: {
    Component: createVJFeedbackScene(warmNebulaVert, warmNebulaFrag, "VJWarmNebula", 0.96),
    energyAffinity: "low",
    complement: "deep_ocean",
    vertexShader: warmNebulaVert,
    fragmentShader: warmNebulaFrag,
    feedback: true,
  },
  prism_refraction: {
    Component: createVJFeedbackScene(prismRefractionVert, prismRefractionFrag, "VJPrismRefraction", 0.94),
    energyAffinity: "any",
    complement: "diffraction_rings",
    vertexShader: prismRefractionVert,
    fragmentShader: prismRefractionFrag,
    feedback: true,
  },
  cellular_automata: {
    Component: createVJFeedbackScene(cellularAutomataVert, cellularAutomataFrag, "VJCellularAutomata", 0.96),
    energyAffinity: "mid",
    complement: "reaction_diffusion",
    vertexShader: cellularAutomataVert,
    fragmentShader: cellularAutomataFrag,
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
  // Phase 9 Wave 1: 10 missing modes
  "fluid_2d",
  "spectral_analyzer",
  "particle_swarm",
  "crystalline_growth",
  "climax_surge",
  "kaleidoscope",
  "fractal_zoom",
  "sacred_geometry",
  "reaction_diffusion",
  "mandala_engine",
  // Phase 9 Wave 2: 8 new shaders
  "mycelium_network",
  "ink_wash",
  "coral_reef",
  "solar_flare",
  "galaxy_spiral",
  "warp_field",
  "signal_decay",
  "databend",
  // Volumetric + Environment
  "volumetric_clouds",
  "volumetric_smoke",
  "volumetric_nebula",
  "river",
  "space_travel",
  "mountain_fire",
  "flower_field",
  "forest",
  "ocean",
  "desert_road",
  "campfire",
  "rain_street",
  "aurora_sky",
  "storm",
  "canyon",
  // New shaders
  "liquid_mandala",
  "bioluminescence",
  "neon_grid",
  "warm_nebula",
  "prism_refraction",
  "cellular_automata",
];
