/**
 * Section override validation — catches invalid section indices early.
 */

import type { SetlistEntry } from "../../data/types";

/**
 * Validate section overrides against actual section count.
 * Call during calculateMetadata or at load time to catch invalid indices early.
 * Returns list of warnings (empty = all valid).
 */
export function validateSectionOverrides(
  song: SetlistEntry,
  sectionCount: number,
): string[] {
  if (!song.sectionOverrides?.length) return [];
  const warnings: string[] = [];
  for (const override of song.sectionOverrides) {
    if (override.sectionIndex >= sectionCount) {
      warnings.push(
        `[${song.trackId}] sectionOverride index ${override.sectionIndex} (mode: ${override.mode}) ` +
        `exceeds section count ${sectionCount} (valid: 0-${sectionCount - 1})`
      );
    }
  }
  if (warnings.length > 0) {
    console.warn(`Section override validation failed for "${song.title}":`);
    warnings.forEach((w) => console.warn(`  ${w}`));
  }
  return warnings;
}
