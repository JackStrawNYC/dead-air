/**
 * Transition Selector — energy-based within-song transition style selection.
 *
 * Picks the visual style for SceneCrossfade between shader scenes based on
 * the energy context before and after the transition boundary.
 *
 * Pure function. No state.
 */

export type SceneTransitionStyle = "flash" | "dissolve" | "morph" | "void" | "distortion";

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
): SceneTransitionStyle {
  // Scene preferences override energy-based selection when present
  if (scenePreferredIn) return scenePreferredIn;
  if (scenePreferredOut) return scenePreferredOut;

  const delta = energyAfter - energyBefore;

  // Jam/solo sections: maintain visual continuity
  if (sectionType === "jam" || sectionType === "solo") {
    return "morph";
  }

  // Quiet -> loud: dramatic scene change
  if (delta > 0.15) {
    return "flash";
  }

  // Loud -> quiet: fade through darkness
  if (delta < -0.15) {
    return "void";
  }

  // High energy both sides: glitchy energy transition
  if (energyBefore > 0.20 && energyAfter > 0.20) {
    return "distortion";
  }

  // Similar energy: gentle handoff
  if (Math.abs(delta) < 0.08) {
    return "dissolve";
  }

  // Default
  return "flash";
}
