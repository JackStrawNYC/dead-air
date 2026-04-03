/**
 * Transition Selector — energy-based within-song transition style selection.
 *
 * Picks the visual style for SceneCrossfade between shader scenes based on
 * the energy context before and after the transition boundary.
 *
 * Pure function. No state.
 */

export type SceneTransitionStyle =
  | "flash" | "dissolve" | "morph" | "void" | "distortion"
  | "shader_dissolve" | "shader_luminance" | "shader_additive";

/**
 * Select the transition style based on energy delta across the boundary.
 *
 * @param energyBefore Average energy in the outgoing section (0-1)
 * @param energyAfter Average energy in the incoming section (0-1)
 * @param sectionType Optional section type label for jam/solo bias
 * @param scenePreferredIn Optional preferred transition for incoming scene
 * @param scenePreferredOut Optional preferred transition for outgoing scene
 */
export function selectTransitionStyle(
  energyBefore: number,
  energyAfter: number,
  sectionType?: string,
  scenePreferredIn?: SceneTransitionStyle,
  scenePreferredOut?: SceneTransitionStyle,
  spectralFlux?: number,
): SceneTransitionStyle {
  // Scene preferences override energy-based selection when present
  if (scenePreferredIn) return scenePreferredIn;
  if (scenePreferredOut) return scenePreferredOut;

  // All within-song transitions use dissolve for clean, seamless visuals.
  // Flash is reserved only for IT coherence breaks (handled elsewhere).
  return "dissolve";
}
