/**
 * Font shim — local-only replacement for @remotion/google-fonts.
 *
 * Why this exists:
 *   @remotion/google-fonts/CormorantGaramond and JetBrainsMono fetch the woff2
 *   files from fonts.gstatic.com at render time AND wrap each fetch in a
 *   delayRender() handle. If the fetch is slow / fails / blocked, every chrome
 *   render worker hangs on the 600s timeout, which manifests as "render is
 *   incredibly slow" and eventually as browser crashes.
 *
 *   Self-hosting the woff2 files via @font-face pointing at staticFile() is
 *   the proper long-term fix, but for now we fall back to high-quality system
 *   fonts so the render is fully offline-deterministic and never blocks on
 *   network IO.
 *
 * Usage:
 *   import { loadFont } from "../utils/font-shim";
 *   const { fontFamily: cormorant } = loadFont();   // serif fallback
 *   const { fontFamily: mono } = loadMonoFont();    // mono fallback
 */

interface LoadFontResult {
  fontFamily: string;
  /** Always-resolved promise for compat with @remotion/google-fonts API */
  waitUntilDone: () => Promise<void>;
}

const SERIF_STACK =
  '"Cormorant Garamond", "Apple Garamond", "Hoefler Text", "Garamond", "Times New Roman", serif';

const MONO_STACK =
  '"JetBrains Mono", "Menlo", "Monaco", "SF Mono", "Courier New", monospace';

/** Drop-in replacement for `loadFont` from @remotion/google-fonts/CormorantGaramond. */
export function loadFont(
  _style?: string,
  _opts?: { weights?: string[]; subsets?: string[] },
): LoadFontResult {
  return {
    fontFamily: SERIF_STACK,
    waitUntilDone: () => Promise.resolve(),
  };
}

/** Drop-in replacement for `loadFont` from @remotion/google-fonts/JetBrainsMono. */
export function loadMonoFont(
  _style?: string,
  _opts?: { weights?: string[]; subsets?: string[] },
): LoadFontResult {
  return {
    fontFamily: MONO_STACK,
    waitUntilDone: () => Promise.resolve(),
  };
}
