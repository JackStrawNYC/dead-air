/**
 * Transition affinity map — which shaders crossfade well together.
 * Duplicated from visualizer-poc/src/scenes/scene-registry.ts to avoid
 * importing the full scene registry (which pulls in Remotion deps).
 */

import type { VisualMode } from "@visualizer/data/types";

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
  fractal_flames: ["inferno", "tie_dye", "liquid_light"],
  feedback_recursion: ["liquid_light", "fractal_flames", "deep_ocean"],
  truchet_tiling: ["crystal_cavern", "lo_fi_grain", "stark_minimal"],
  diffraction_rings: ["aurora", "crystal_cavern", "deep_ocean"],
  plasma_field: ["tie_dye", "liquid_light", "diffraction_rings"],
  voronoi_flow: ["truchet_tiling", "stained_glass", "oil_projector"],
  stained_glass: ["voronoi_flow", "crystal_cavern", "aurora"],
  electric_arc: ["inferno", "concert_lighting", "aurora"],
  morphogenesis: ["voronoi_flow", "oil_projector", "deep_ocean"],
  neural_web: ["electric_arc", "fractal_flames", "feedback_recursion"],
  smoke_rings: ["deep_ocean", "aurora", "oil_projector"],
  aurora_curtains: ["aurora", "deep_ocean", "cosmic_voyage"],
  digital_rain: ["stark_minimal", "lo_fi_grain", "concert_lighting"],
  lava_flow: ["inferno", "electric_arc", "fractal_flames"],
  // Phase 9 Wave 1: 10 missing entries
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
  // Phase 9 Wave 2: 8 new shaders
  mycelium_network: ["morphogenesis", "neural_web", "reaction_diffusion"],
  ink_wash: ["stark_minimal", "vintage_film", "deep_ocean"],
  coral_reef: ["deep_ocean", "aurora", "crystal_cavern"],
  solar_flare: ["inferno", "electric_arc", "lava_flow"],
  galaxy_spiral: ["cosmic_voyage", "cosmic_dust", "particle_nebula"],
  warp_field: ["diffraction_rings", "cosmic_voyage", "void_light"],
  signal_decay: ["digital_rain", "lo_fi_grain", "vintage_film"],
  databend: ["digital_rain", "signal_decay", "lo_fi_grain"],
};
