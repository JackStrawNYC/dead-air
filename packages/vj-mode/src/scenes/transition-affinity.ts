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
};
