/**
 * Shader Strings — maps VisualMode to raw GLSL vertex/fragment strings.
 * Used by DualShaderQuad for dual-shader composition.
 *
 * Three.js scenes (ParticleNebula, CrystalCavern) return null —
 * dual rendering only works for GLSL quad shaders.
 */

import type { VisualMode } from "../data/types";

import { liquidLightVert, liquidLightFrag } from "./liquid-light";
import { concertBeamsVert, concertBeamsFrag } from "./concert-beams";
import { smokeAndMirrorsVert, smokeAndMirrorsFrag } from "./smoke-and-mirrors";
import { starkMinimalVert, starkMinimalFrag } from "./stark-minimal";
import { oilProjectorVert, oilProjectorFrag } from "./oil-projector";
import { tieDyeVert, tieDyeFrag } from "./tie-dye";
import { cosmicDustVert, cosmicDustFrag } from "./cosmic-dust";
import { vintageFilmVert, vintageFilmFrag } from "./vintage-film";
import { cosmicVoyageVert, cosmicVoyageFrag } from "./cosmic-voyage";
import { infernoVert, infernoFrag } from "./inferno";
import { deepOceanVert, deepOceanFrag } from "./deep-ocean";
import { auroraVert, auroraFrag } from "./aurora";
import { fluidLightVert, fluidLightFrag } from "./fluid-light";
import { voidLightVert, voidLightFrag } from "./void-light";
import { fluid2DVert, fluid2DFrag } from "./fluid-2d";
import { spectralAnalyzerVert, spectralAnalyzerFrag } from "./spectral-analyzer";
import { particleSwarmVert, particleSwarmFrag } from "./particle-swarm";
import { crystallineGrowthVert, crystallineGrowthFrag } from "./crystalline-growth";
import { climaxSurgeVert, climaxSurgeFrag } from "./climax-surge";
import { kaleidoscopeVert, kaleidoscopeFrag } from "./kaleidoscope";
import { fractalZoomVert, fractalZoomFrag } from "./fractal-zoom";
import { sacredGeometryVert, sacredGeometryFrag } from "./sacred-geometry";
import { reactionDiffusionVert, reactionDiffusionFrag } from "./reaction-diffusion";
import { mandalaEngineVert, mandalaEngineFrag } from "./mandala-engine";
import { fractalFlamesVert, fractalFlamesFrag } from "./fractal-flames";
import { feedbackRecursionVert, feedbackRecursionFrag } from "./feedback-recursion";
import { truchetTilingVert, truchetTilingFrag } from "./truchet-tiling";
import { diffractionRingsVert, diffractionRingsFrag } from "./diffraction-rings";
import { plasmaFieldVert, plasmaFieldFrag } from "./plasma-field";
import { voronoiFlowVert, voronoiFlowFrag } from "./voronoi-flow";
import { electricArcVert, electricArcFrag } from "./electric-arc";
import { morphogenesisVert, morphogenesisFrag } from "./morphogenesis";
import { stainedGlassVert, stainedGlassFrag } from "./stained-glass";
import { neuralWebVert, neuralWebFrag } from "./neural-web";
import { smokeRingsVert, smokeRingsFrag } from "./smoke-rings";
import { auroraCurtainsVert, auroraCurtainsFrag } from "./aurora-curtains";
import { digitalRainVert, digitalRainFrag } from "./digital-rain";
import { lavaFlowVert, lavaFlowFrag } from "./lava-flow";
import { myceliumNetworkVert, myceliumNetworkFrag } from "./mycelium-network";
import { inkWashVert, inkWashFrag } from "./ink-wash";
import { coralReefVert, coralReefFrag } from "./coral-reef";
import { solarFlareVert, solarFlareFrag } from "./solar-flare";
import { galaxySpiralVert, galaxySpiralFrag } from "./galaxy-spiral";
import { warpFieldVert, warpFieldFrag } from "./warp-field";
import { signalDecayVert, signalDecayFrag } from "./signal-decay";
import { databendVert, databendFrag } from "./databend";
import { volumetricCloudsVert, volumetricCloudsFrag } from "./volumetric-clouds";
import { volumetricSmokeVert, volumetricSmokeFrag } from "./volumetric-smoke";
import { volumetricNebulaVert, volumetricNebulaFrag } from "./volumetric-nebula";
export interface ShaderStrings {
  vert: string;
  frag: string;
}

/**
 * Get raw GLSL strings for a given VisualMode.
 * Returns null for Three.js scenes that can't be dual-rendered.
 */
export function getShaderStrings(mode: VisualMode): ShaderStrings | null {
  return SHADER_STRING_MAP[mode] ?? null;
}

const SHADER_STRING_MAP: Partial<Record<VisualMode, ShaderStrings>> = {
  liquid_light: { vert: liquidLightVert, frag: liquidLightFrag },
  concert_lighting: { vert: concertBeamsVert, frag: concertBeamsFrag },
  lo_fi_grain: { vert: smokeAndMirrorsVert, frag: smokeAndMirrorsFrag },
  stark_minimal: { vert: starkMinimalVert, frag: starkMinimalFrag },
  oil_projector: { vert: oilProjectorVert, frag: oilProjectorFrag },
  tie_dye: { vert: tieDyeVert, frag: tieDyeFrag },
  cosmic_dust: { vert: cosmicDustVert, frag: cosmicDustFrag },
  vintage_film: { vert: vintageFilmVert, frag: vintageFilmFrag },
  cosmic_voyage: { vert: cosmicVoyageVert, frag: cosmicVoyageFrag },
  inferno: { vert: infernoVert, frag: infernoFrag },
  deep_ocean: { vert: deepOceanVert, frag: deepOceanFrag },
  aurora: { vert: auroraVert, frag: auroraFrag },
  // crystal_cavern: null — uses Three.js Object3D
  fluid_light: { vert: fluidLightVert, frag: fluidLightFrag },
  void_light: { vert: voidLightVert, frag: voidLightFrag },
  fluid_2d: { vert: fluid2DVert, frag: fluid2DFrag },
  spectral_analyzer: { vert: spectralAnalyzerVert, frag: spectralAnalyzerFrag },
  particle_swarm: { vert: particleSwarmVert, frag: particleSwarmFrag },
  crystalline_growth: { vert: crystallineGrowthVert, frag: crystallineGrowthFrag },
  climax_surge: { vert: climaxSurgeVert, frag: climaxSurgeFrag },
  kaleidoscope: { vert: kaleidoscopeVert, frag: kaleidoscopeFrag },
  fractal_zoom: { vert: fractalZoomVert, frag: fractalZoomFrag },
  sacred_geometry: { vert: sacredGeometryVert, frag: sacredGeometryFrag },
  reaction_diffusion: { vert: reactionDiffusionVert, frag: reactionDiffusionFrag },
  mandala_engine: { vert: mandalaEngineVert, frag: mandalaEngineFrag },
  fractal_flames: { vert: fractalFlamesVert, frag: fractalFlamesFrag },
  feedback_recursion: { vert: feedbackRecursionVert, frag: feedbackRecursionFrag },
  truchet_tiling: { vert: truchetTilingVert, frag: truchetTilingFrag },
  diffraction_rings: { vert: diffractionRingsVert, frag: diffractionRingsFrag },
  plasma_field: { vert: plasmaFieldVert, frag: plasmaFieldFrag },
  voronoi_flow: { vert: voronoiFlowVert, frag: voronoiFlowFrag },
  electric_arc: { vert: electricArcVert, frag: electricArcFrag },
  morphogenesis: { vert: morphogenesisVert, frag: morphogenesisFrag },
  stained_glass: { vert: stainedGlassVert, frag: stainedGlassFrag },
  neural_web: { vert: neuralWebVert, frag: neuralWebFrag },
  smoke_rings: { vert: smokeRingsVert, frag: smokeRingsFrag },
  aurora_curtains: { vert: auroraCurtainsVert, frag: auroraCurtainsFrag },
  digital_rain: { vert: digitalRainVert, frag: digitalRainFrag },
  lava_flow: { vert: lavaFlowVert, frag: lavaFlowFrag },
  mycelium_network: { vert: myceliumNetworkVert, frag: myceliumNetworkFrag },
  ink_wash: { vert: inkWashVert, frag: inkWashFrag },
  coral_reef: { vert: coralReefVert, frag: coralReefFrag },
  solar_flare: { vert: solarFlareVert, frag: solarFlareFrag },
  galaxy_spiral: { vert: galaxySpiralVert, frag: galaxySpiralFrag },
  warp_field: { vert: warpFieldVert, frag: warpFieldFrag },
  signal_decay: { vert: signalDecayVert, frag: signalDecayFrag },
  databend: { vert: databendVert, frag: databendFrag },
  volumetric_clouds: { vert: volumetricCloudsVert, frag: volumetricCloudsFrag },
  volumetric_smoke: { vert: volumetricSmokeVert, frag: volumetricSmokeFrag },
  volumetric_nebula: { vert: volumetricNebulaVert, frag: volumetricNebulaFrag },
  // particle_nebula: null — uses Three.js ThreeCanvas + Object3D
  // crystal_cavern: null — uses Three.js ThreeCanvas + Object3D
};
