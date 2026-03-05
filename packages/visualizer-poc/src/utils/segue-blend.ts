/**
 * Segue Blend — palette hue rotation for crossfade transitions.
 *
 * Pure function extracted from SongVisualizer for computing the
 * blended palette hue rotation during segue transitions.
 */

import type { ColorPalette } from "../data/types";
import { blendPalettes } from "./segue-detection";
import { paletteHueRotation } from "../data/SongPaletteContext";

/**
 * Compute the hue rotation angle for the current frame, blending
 * palettes during segue-in and segue-out transitions.
 */
export function computeSegueHueRotation(
  palette: ColorPalette | undefined,
  segueIn: boolean,
  segueOut: boolean,
  segueFromPalette: ColorPalette | undefined,
  segueToPalette: ColorPalette | undefined,
  frame: number,
  durationInFrames: number,
  fadeFrames: number,
): number {
  if (!palette) return 0;
  if (segueIn && segueFromPalette && frame < fadeFrames) {
    const progress = frame / fadeFrames;
    const blended = blendPalettes(segueFromPalette, palette, progress);
    return paletteHueRotation(blended);
  }
  if (segueOut && segueToPalette && frame > durationInFrames - fadeFrames) {
    const progress = (frame - (durationInFrames - fadeFrames)) / fadeFrames;
    const blended = blendPalettes(palette, segueToPalette, progress);
    return paletteHueRotation(blended);
  }
  return paletteHueRotation(palette);
}
