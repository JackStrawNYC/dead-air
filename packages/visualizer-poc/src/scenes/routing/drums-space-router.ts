/**
 * Drums/Space sub-phase shader routing — maps D/S phases to forced shader modes.
 */

import type { VisualMode } from "../../data/types";
import { seededLCG as seededRandom } from "../../utils/seededRandom";
import type { SongIdentity } from "../../data/song-identities";

/** Map Drums/Space sub-phase to forced shader mode */
/** @internal exported for testing */
export function getDrumsSpaceMode(phase: string, seed?: number, songIdentity?: SongIdentity): VisualMode {
  // Song identity overrides for D/S sub-phases
  if (songIdentity?.drumsSpaceShaders) {
    const override = songIdentity.drumsSpaceShaders[phase as import("../../utils/drums-space-phase").DrumsSpaceSubPhase];
    if (override) return override;
  }

  const rng = seededRandom((seed ?? 0) + 31337);
  switch (phase) {
    case "drums_tribal": {
      const pool: VisualMode[] = ["inferno", "inferno", "inferno"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "transition": {
      const pool: VisualMode[] = ["cosmic_voyage", "aurora", "protean_clouds"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "space_ambient": {
      const pool: VisualMode[] = ["deep_ocean", "cosmic_dust", "cosmic_voyage", "void_light", "deep_ocean"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "space_textural": {
      const pool: VisualMode[] = ["cosmic_voyage", "cosmic_voyage", "mandala_engine", "deep_ocean"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "space_melodic": {
      const pool: VisualMode[] = ["cosmic_voyage", "aurora", "cosmic_voyage", "cosmic_voyage"];
      return pool[Math.floor(rng() * pool.length)];
    }
    case "reemergence": return rng() > 0.5 ? "inferno" : "protean_clouds";
    default: return "cosmic_voyage";
  }
}
