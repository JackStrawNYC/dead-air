/**
 * Overlay Selection — hero guarantee, layer diversity, and category balance.
 *
 * Given a scored list of overlays and a target count, selects the best
 * combination with guaranteed hero slots, layer diversity, and tag variety.
 *
 * Extracted from overlay-rotation.ts for focused responsibility.
 */

import type { OverlayEntry } from "./types";
import { BAND_CONFIG } from "./band-config";

/**
 * Hero overlays — the most visually impactful character/reactive components.
 * One hero is guaranteed per rotation window (reserved slot).
 */
export const HERO_OVERLAY_NAMES = new Set(BAND_CONFIG.heroOverlays);

/**
 * Select overlays for a window from scored candidates.
 * Implements hero guarantee, duty-cycle compensation, layer diversity, and tag balance.
 *
 * @returns Selected overlay entries (ordered by priority)
 */
export function selectOverlaysForWindow(
  scored: { entry: OverlayEntry; score: number }[],
  targetCount: number,
  isDrumsSpace: boolean,
  isDropout: boolean,
  poolEntries: OverlayEntry[],
): OverlayEntry[] {
  // Hero guarantee: reserve slots for concrete animated objects.
  // Skip entirely when targetCount is 0 (peak/dropout = shader owns the moment).
  const selected: OverlayEntry[] = [];
  const selectedNames = new Set<string>();
  const usedLayers = new Set<number>();

  const heroScored = scored.filter((s) => HERO_OVERLAY_NAMES.has(s.entry.name));
  const alwaysOnHeroes = heroScored.filter((s) => (s.entry.dutyCycle ?? 50) >= 80);
  const cycledHeroes = heroScored.filter((s) => (s.entry.dutyCycle ?? 50) < 80);
  const heroSlots = targetCount > 0 ? Math.min(1, heroScored.length) : 0;

  // Pick at least 1 always-on hero first (guaranteed visibility)
  let herosPicked = 0;
  for (const hero of alwaysOnHeroes) {
    if (herosPicked >= heroSlots) break;
    if (!selectedNames.has(hero.entry.name) && !usedLayers.has(hero.entry.layer)) {
      selected.push(hero.entry);
      selectedNames.add(hero.entry.name);
      usedLayers.add(hero.entry.layer);
      herosPicked++;
    }
  }
  // Fill remaining hero slots with cycled heroes for variety
  for (const hero of cycledHeroes) {
    if (herosPicked >= heroSlots) break;
    if (!selectedNames.has(hero.entry.name) && !usedLayers.has(hero.entry.layer)) {
      selected.push(hero.entry);
      selectedNames.add(hero.entry.name);
      usedLayers.add(hero.entry.layer);
      herosPicked++;
    }
  }

  // Duty-cycle-aware count adjustment
  const TARGET_VISIBLE = 1;
  const avgDutyCycle = selected.length > 0
    ? selected.reduce((sum, e) => sum + (e.dutyCycle ?? 50), 0) / selected.length
    : 50;
  if (avgDutyCycle < 60 && !isDrumsSpace && !isDropout) {
    const adjustedCount = Math.ceil(TARGET_VISIBLE / (avgDutyCycle / 100));
    targetCount = Math.max(targetCount, Math.min(adjustedCount, poolEntries.length));
  }

  // Fill remaining slots with layer-diverse picks
  const byLayer = new Map<number, typeof scored>();
  for (const s of scored) {
    if (selectedNames.has(s.entry.name)) continue;
    const layerList = byLayer.get(s.entry.layer) ?? [];
    layerList.push(s);
    byLayer.set(s.entry.layer, layerList);
  }

  const layerOrder = Array.from(byLayer.entries())
    .map(([layer, candidates]) => ({ layer, topScore: candidates[0].score }))
    .sort((a, b) => b.topScore - a.topScore);

  const minLayers = Math.min(2, layerOrder.length, targetCount);
  for (const { layer } of layerOrder) {
    if (selected.length >= targetCount) break;
    if (usedLayers.size >= minLayers && selected.length >= minLayers) break;

    const candidates = byLayer.get(layer)!;
    for (const c of candidates) {
      if (!selectedNames.has(c.entry.name)) {
        selected.push(c.entry);
        selectedNames.add(c.entry.name);
        usedLayers.add(c.entry.layer);
        break;
      }
    }
  }

  // Fill remaining slots with tag diversity + category balance
  const selectedTags = new Set<string>();
  const selectedCategories = new Map<string, number>();
  for (const sel of selected) {
    for (const tag of sel.tags) selectedTags.add(tag);
    selectedCategories.set(sel.category, (selectedCategories.get(sel.category) ?? 0) + 1);
  }
  const diversitySorted = scored
    .filter((s) => !selectedNames.has(s.entry.name))
    .map((s) => {
      let adjScore = s.score;
      let tagOverlap = 0;
      for (const tag of s.entry.tags) {
        if (selectedTags.has(tag)) tagOverlap++;
      }
      if (tagOverlap >= 2) adjScore -= 0.15 * (tagOverlap - 1);
      const catCount = selectedCategories.get(s.entry.category) ?? 0;
      if (catCount >= 1) adjScore -= 0.20 * catCount;
      return { ...s, score: adjScore };
    })
    .sort((a, b) => b.score - a.score);
  for (const s of diversitySorted) {
    if (selected.length >= targetCount) break;
    selected.push(s.entry);
    selectedNames.add(s.entry.name);
    for (const tag of s.entry.tags) selectedTags.add(tag);
    selectedCategories.set(s.entry.category, (selectedCategories.get(s.entry.category) ?? 0) + 1);
  }

  return selected;
}
