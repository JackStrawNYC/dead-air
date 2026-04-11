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
 * @param spectralFlux Optional spectral flux at boundary (0-1)
 * @param segueSignificance Optional cultural significance from knowledge graph (0-1)
 * @param segueTreatment Optional visual treatment hint from knowledge graph
 */
export function selectTransitionStyle(
  energyBefore: number,
  energyAfter: number,
  sectionType?: string,
  scenePreferredIn?: SceneTransitionStyle,
  scenePreferredOut?: SceneTransitionStyle,
  spectralFlux?: number,
  segueSignificance?: number,
  segueTreatment?: string,
): SceneTransitionStyle {
  // Knowledge graph override for famous segues — culturally significant
  // transitions get a treatment that matches their historical character
  if (segueSignificance !== undefined && segueSignificance > 0.7) {
    switch (segueTreatment) {
      case "explosive": return "flash";
      case "ethereal": return "morph";
      case "building": return "dissolve";
      case "seamless": return "dissolve";
      case "dramatic": return "void";
      default: return "morph";
    }
  }

  // Scene preferences from registry override energy-based selection
  if (scenePreferredIn) return scenePreferredIn;
  if (scenePreferredOut) return scenePreferredOut;

  const delta = energyAfter - energyBefore;
  const absDelta = Math.abs(delta);

  // Large energy jump UP (quiet→loud): flash — reinforce the eruption
  if (delta > 0.12) return "flash";

  // Large energy drop (loud→quiet): void — fade through darkness
  if (delta < -0.12) return "void";

  // High spectral flux (rapid timbral change): distortion — visual disruption
  if (spectralFlux !== undefined && spectralFlux > 0.25) return "distortion";

  // Jam/solo sections with moderate energy change: morph for organic feel
  if ((sectionType === "jam" || sectionType === "solo") && absDelta > 0.05) {
    return "morph";
  }

  // Space sections: void for meditative transitions
  if (sectionType === "space") return "void";

  // Default: dissolve for clean, seamless crossfade
  return "dissolve";
}
