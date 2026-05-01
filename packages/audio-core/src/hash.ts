/**
 * Shared hash utilities — single source of truth for djb2 hashing.
 *
 * Previously duplicated across overlay-rotation.ts, overlay-selector.ts,
 * SceneVideoLayer.tsx, media-resolver.ts, and ShowContext.tsx.
 */

/** djb2 hash — maps any string to a positive integer. Deterministic and fast. */
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
