/**
 * Show-level film stock personality — derives 5 visual parameters from the
 * show seed so every show renders with a subtly different look and feel.
 */

import { seeded } from "./seededRandom";
import { lerp } from "./math";

export interface FilmStockParams {
  warmth: number; // -0.15 to +0.15
  contrast: number; // 0.85 to 1.15
  saturation: number; // -0.12 to +0.12
  grain: number; // 0.7 to 1.4
  bloom: number; // 0.6 to 1.4
}

export function deriveFilmStock(showSeed: number): FilmStockParams {
  const rng = seeded(showSeed + 0xf11b); // salt to decorrelate from other seed uses
  return {
    warmth: lerp(-0.15, 0.15, rng()),
    contrast: lerp(0.85, 1.15, rng()),
    saturation: lerp(-0.12, 0.12, rng()),
    grain: lerp(0.7, 1.4, rng()),
    bloom: lerp(0.6, 1.4, rng()),
  };
}
