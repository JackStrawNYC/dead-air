/**
 * Routing modules — extracted from SceneRouter.tsx for independent testability.
 */

export { dynamicCrossfadeDuration, beatCrossfadeFrames, AUTO_VARIETY_MIN_SECTION } from "./crossfade-timing";
export { findNearestBeat } from "./beat-sync";
export { validateSectionOverrides } from "./section-validation";
export { applyRecencyWeighting, getModeForSection } from "./shader-variety";
export { getDrumsSpaceMode } from "./drums-space-router";
export { averageEnergy, selectDualBlendMode, renderMode } from "./scene-utils";
