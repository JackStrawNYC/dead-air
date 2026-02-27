/**
 * DeadMotif — SVG path data for Grateful Dead iconography.
 *
 * Each motif is a simplified SVG path designed for animation.
 * Paths are normalized to a 100x100 viewBox for easy scaling.
 */

/** Simplified dancing skeleton (side view, arms up) */
export const SKELETON_PATH =
  "M50 10 C50 10 45 15 45 20 L45 25 C42 25 38 28 38 32 L38 38 C38 42 42 45 45 45 " +
  "L45 55 L38 70 L35 85 L40 85 L45 72 L50 60 L55 72 L60 85 L65 85 L62 70 L55 55 " +
  "L55 45 C58 45 62 42 62 38 L62 32 C62 28 58 25 55 25 L55 20 C55 15 50 10 50 10 Z " +
  "M45 15 A5 5 0 1 1 55 15 A5 5 0 1 1 45 15 Z";

/** Dancing bear (front view, simplified) */
export const BEAR_PATH =
  "M35 20 C35 12 42 8 50 8 C58 8 65 12 65 20 L65 35 C65 40 62 45 58 48 " +
  "L62 65 L60 80 L55 80 L52 65 L50 55 L48 65 L45 80 L40 80 L38 65 L42 48 " +
  "C38 45 35 40 35 35 L35 20 Z " +
  "M32 15 C30 10 35 6 38 10 L35 18 Z " +
  "M68 15 C70 10 65 6 62 10 L65 18 Z " +
  "M43 22 A3 3 0 1 1 43 22.01 M57 22 A3 3 0 1 1 57 22.01 " +
  "M47 28 C48 30 52 30 53 28";

/** Rose (American Beauty style, simplified) */
export const ROSE_PATH =
  "M50 20 C45 15 35 18 35 28 C35 38 45 45 50 50 C55 45 65 38 65 28 C65 18 55 15 50 20 Z " +
  "M50 50 C50 50 48 60 45 70 C43 75 47 78 50 80 C53 78 57 75 55 70 C52 60 50 50 50 50 Z " +
  "M45 70 C40 68 38 72 42 74 M55 70 C60 68 62 72 58 74";

/** Lightning bolt (13-point, simplified) */
export const BOLT_PATH =
  "M55 5 L40 45 L50 45 L35 95 L70 50 L58 50 L72 5 Z";

/** Terrapin turtle (top view, simplified) */
export const TERRAPIN_PATH =
  "M50 25 C40 25 32 32 30 40 C28 48 32 58 38 62 L35 72 L40 74 L43 65 " +
  "C45 66 48 67 50 67 C52 67 55 66 57 65 L60 74 L65 72 L62 62 " +
  "C68 58 72 48 70 40 C68 32 60 25 50 25 Z " +
  "M42 35 C42 35 50 30 58 35 L58 50 C58 55 50 58 42 55 L42 50 Z " +
  "M50 18 C48 15 45 16 45 18 C45 22 50 25 50 25 C50 25 55 22 55 18 C55 16 52 15 50 18 Z";

/** Scarab beetle (Egyptian style) */
export const SCARAB_PATH =
  "M50 30 C42 30 35 35 35 42 C35 52 42 60 50 60 C58 60 65 52 65 42 C65 35 58 30 50 30 Z " +
  "M35 42 L20 35 L18 45 L32 48 M65 42 L80 35 L82 45 L68 48 " +
  "M45 60 L40 80 L45 82 L50 65 L55 82 L60 80 L55 60 " +
  "M50 25 C48 20 44 22 46 26 M50 25 C52 20 56 22 54 26";

/** Stealie (Steal Your Face circle + bolt) */
export const STEALIE_PATH =
  "M50 10 C28 10 10 28 10 50 C10 72 28 90 50 90 C72 90 90 72 90 50 C90 28 72 10 50 10 Z " +
  "M50 10 C50 10 30 50 50 50 C70 50 50 90 50 90 " +
  "M50 30 L43 50 L48 50 L38 70 L60 48 L53 48 L62 30 Z";

/** Mushroom (psychedelic style) */
export const MUSHROOM_PATH =
  "M50 40 C35 40 25 30 25 22 C25 12 35 5 50 5 C65 5 75 12 75 22 C75 30 65 40 50 40 Z " +
  "M44 40 L42 75 C42 80 45 85 50 85 C55 85 58 80 58 75 L56 40 " +
  "M35 18 C37 15 40 17 38 20 M55 12 C58 10 62 14 58 16 M45 28 C48 25 52 28 48 31";

export const MOTIF_PATHS = {
  skeleton: SKELETON_PATH,
  bear: BEAR_PATH,
  rose: ROSE_PATH,
  bolt: BOLT_PATH,
  terrapin: TERRAPIN_PATH,
  scarab: SCARAB_PATH,
  stealie: STEALIE_PATH,
  mushroom: MUSHROOM_PATH,
} as const;

export type MotifName = keyof typeof MOTIF_PATHS;
