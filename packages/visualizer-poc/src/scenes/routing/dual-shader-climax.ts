/**
 * Dual-shader climax composition policy.
 *
 * Decides whether to render two shaders simultaneously (and how) during the
 * mid-section of a song. Two activation paths:
 *
 *   1. CLIMAX PHASES — during phases 2 (climax) and 3 (sustain), the visual
 *      gets a complementary shader layered on top with `additive` blend so
 *      the peak feels like light layered on light. Phases 1 (build) and
 *      4 (release) hint at the partner with a low blendProgress so the
 *      composition doesn't snap on/off.
 *
 *   2. TIGHT-LOCK INTERPLAY — when the band is locked in a tight rhythmic
 *      pocket, render both shaders with `depth_aware` blend at 50/50 so
 *      the visual reflects the layered musical conversation.
 *
 * The audit warned that "dual-shader composition muddies peaks when clarity
 * is needed" — so we deliberately keep blendProgress LOW during the climax
 * peak (phase 2 = 0.45, A-dominant) and only let it reach 0.5 during the
 * sustain (phase 3) when the eye has acclimated.
 */

import type { InterplayMode } from "../../utils/stem-interplay";
import type { DualBlendMode } from "../../components/DualShaderQuad";

export type ClimaxPhase = 0 | 1 | 2 | 3 | 4; // idle / build / climax / sustain / release

export interface DualShaderDecision {
  /** Whether to render dual-shader composition this frame. */
  active: boolean;
  /** Blend progress (0 = all primary, 1 = all partner). 0.5 = equal mix. */
  blendProgress: number;
  /** GPU blend mode. */
  blendMode: DualBlendMode;
}

/** Decide dual-shader composition for the current frame.
 *
 * Returns `active=false` when neither climax nor tight-lock interplay is
 * happening; the caller should fall back to single-shader rendering.
 */
export function decideDualShader(
  climaxPhase: ClimaxPhase | undefined,
  stemInterplay: InterplayMode | undefined,
): DualShaderDecision {
  const phase = (climaxPhase ?? 0) as ClimaxPhase;
  const climaxActive = phase >= 1 && phase <= 4;
  const tightLock = stemInterplay === "tight-lock";

  if (!climaxActive && !tightLock) {
    return { active: false, blendProgress: 0, blendMode: "additive" };
  }

  // Climax wins over tight-lock when both are active — climax's `additive`
  // blend reads "transcendent" while tight-lock's `depth_aware` reads
  // "structured." A peak moment should feel transcendent.
  if (climaxActive) {
    // Phase-aware blend curve avoids the "muddy peak" failure mode:
    //   build (1):    0.30 — partner just begins to bleed in
    //   climax (2):   0.45 — primary still dominant for clarity AT the peak
    //   sustain (3):  0.50 — full dual once the peak has registered
    //   release (4):  0.30 — partner fades back out
    const PROGRESS_BY_PHASE: Record<ClimaxPhase, number> = {
      0: 0,
      1: 0.30,
      2: 0.45,
      3: 0.50,
      4: 0.30,
    };
    return {
      active: true,
      blendProgress: PROGRESS_BY_PHASE[phase],
      blendMode: "additive",
    };
  }

  // Tight-lock: equal weighting, depth-aware blend (preserves spatial layout).
  return {
    active: true,
    blendProgress: 0.5,
    blendMode: "depth_aware",
  };
}
