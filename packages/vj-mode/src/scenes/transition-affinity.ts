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
};
