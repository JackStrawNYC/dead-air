/**
 * Responsive text utilities — scale font sizes relative to 1080p baseline.
 * Ensures text remains readable at 720p and 4K.
 */

/** Scale a font size relative to 1080p baseline */
export function responsiveFontSize(basePx: number, renderHeight: number): number {
  return basePx * (renderHeight / 1080);
}

/** Scale a dimension (padding, margin) relative to 1080p baseline */
export function responsiveSize(basePx: number, renderHeight: number): number {
  return basePx * (renderHeight / 1080);
}
