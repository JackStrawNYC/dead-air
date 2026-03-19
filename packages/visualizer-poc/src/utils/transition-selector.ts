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

  const delta = energyAfter - energyBefore;
  const flux = spectralFlux ?? 0;

  // GPU shader transitions: reserved as option alongside CSS styles
  // High energy + spectral flux → luminance key (50% chance via deterministic check)
  if (energyAfter > 0.3 && flux > 0.2 && energyBefore > 0.15) {
    // Use a deterministic "coin flip" from energy values
    if (Math.floor((energyBefore + energyAfter) * 100) % 2 === 0) {
      return "shader_luminance";
    }
  }

  // Moderate energy + gentle transition → shader dissolve (30% via mod 3)
  if (Math.abs(delta) < 0.12 && energyAfter > 0.1 && energyAfter < 0.5) {
    if (Math.floor((energyBefore + energyAfter) * 100) % 3 === 0) {
      return "shader_dissolve";
    }
  }

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
