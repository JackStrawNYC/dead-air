/**
 * Centralized font loading via @remotion/google-fonts.
 *
 * Three typefaces form the Dead Air typographic system:
 * - Playfair Display: Elegant serif for titles, chapter cards, legacy text
 * - Source Serif 4: Refined serif for body text, credits, quotes
 * - Inter: Clean geometric sans for labels, badges, technical text
 *
 * Import this module in Root.tsx to ensure all fonts load before render.
 */
import {
  getInfo as getPlayfair,
  loadFont as loadPlayfair,
} from '@remotion/google-fonts/PlayfairDisplay';
import {
  getInfo as getSourceSerif,
  loadFont as loadSourceSerif,
} from '@remotion/google-fonts/SourceSerif4';
import {
  getInfo as getInter,
  loadFont as loadInter,
} from '@remotion/google-fonts/Inter';

// Load all weights we need
const { fontFamily: playfairFamily } = loadPlayfair();
const { fontFamily: sourceSerifFamily } = loadSourceSerif();
const { fontFamily: interFamily } = loadInter();

/**
 * Production-grade font families.
 * Each includes fallbacks for safety.
 */
export const CINEMA_FONTS = {
  /** Display serif — titles, chapter cards, hero text */
  display: `${playfairFamily}, Georgia, "Times New Roman", serif`,
  /** Body serif — credits, quotes, narration text, captions */
  serif: `${sourceSerifFamily}, Georgia, "Times New Roman", serif`,
  /** Clean sans — labels, badges, technical overlays, UI */
  sans: `${interFamily}, "Helvetica Neue", Helvetica, Arial, sans-serif`,
  /** Monospace — timestamps, data, code */
  mono: '"SF Mono", "Fira Code", Consolas, monospace',
} as const;

export { playfairFamily, sourceSerifFamily, interFamily };
