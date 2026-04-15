/**
 * Overlay Selection — hero guarantee, layer diversity, prominence exclusion,
 * and category balance.
 *
 * Given a scored list of overlays and a target count, selects the best
 * combination with guaranteed hero slots, layer diversity, and tag variety.
 *
 * Prominence classes prevent visual competition:
 *   hero:    iconic foreground imagery (Stealie, Bolt, Bear) — max 1 per window
 *   accent:  reactive/decorative focus elements — max 1 per window
 *   ambient: background textures (starfield, smoke, grain) — unlimited
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

/** Resolve an overlay's prominence class (defaults to "ambient" if unset). */
function getProminence(entry: OverlayEntry): "hero" | "accent" | "ambient" {
  return entry.prominence ?? "ambient";
}

/**
 * Select overlays for a window from scored candidates.
 * Implements song-specific hero guarantee, layer diversity, and tag balance.
 *
 * The songHero (first overlay from overlayOverrides.include) gets absolute
 * priority — it appears in every window and at peak energy gets the screen
 * to itself (hero-only window). This ensures Dead iconography is always
 * the visual anchor, not lost in a crowd of competing overlays.
 *
 * @returns Selected overlay entries (ordered by priority)
 */
export function selectOverlaysForWindow(
  scored: { entry: OverlayEntry; score: number }[],
  targetCount: number,
  isDrumsSpace: boolean,
  isDropout: boolean,
  poolEntries: OverlayEntry[],
  songHero?: string,
  windowEnergy?: string,
): OverlayEntry[] {
  // Hero guarantee: the song's designated hero ALWAYS gets the first slot.
  // At high energy, the hero gets the window to itself — no competition.
  const selected: OverlayEntry[] = [];
  const selectedNames = new Set<string>();
  const usedLayers = new Set<number>();
  // ─── Prominence exclusion: track whether we've filled each slot ───
  let hasHero = false;
  let hasAccent = false;

  // Song-specific hero: first priority — always present when targetCount > 0
  if (songHero && targetCount > 0) {
    const heroCandidate = scored.find((s) => s.entry.name === songHero);
    if (heroCandidate) {
      selected.push(heroCandidate.entry);
      selectedNames.add(heroCandidate.entry.name);
      usedLayers.add(heroCandidate.entry.layer);
      const prom = getProminence(heroCandidate.entry);
      if (prom === "hero") hasHero = true;
      if (prom === "accent") hasAccent = true;
      // At high energy, hero owns the window — no other overlays
      if (windowEnergy === "high") {
        return selected;
      }
    }
  }

  // If no song hero, fall back to generic hero pool
  if (selected.length === 0 && targetCount > 0) {
    const heroScored = scored.filter((s) => HERO_OVERLAY_NAMES.has(s.entry.name));
    const alwaysOnHeroes = heroScored.filter((s) => (s.entry.dutyCycle ?? 50) >= 80);
    const cycledHeroes = heroScored.filter((s) => (s.entry.dutyCycle ?? 50) < 80);

    for (const hero of [...alwaysOnHeroes, ...cycledHeroes]) {
      if (selected.length >= 1) break;
      if (!selectedNames.has(hero.entry.name) && !usedLayers.has(hero.entry.layer)) {
        selected.push(hero.entry);
        selectedNames.add(hero.entry.name);
        usedLayers.add(hero.entry.layer);
        const prom = getProminence(hero.entry);
        if (prom === "hero") hasHero = true;
        if (prom === "accent") hasAccent = true;
      }
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
  // ─── Prominence gate: skip candidates that would violate max-1 hero / max-1 accent ───
  const isProminenceAllowed = (entry: OverlayEntry): boolean => {
    const prom = getProminence(entry);
    if (prom === "hero" && hasHero) return false;
    if (prom === "accent" && hasAccent) return false;
    return true;
  };
  const markProminence = (entry: OverlayEntry): void => {
    const prom = getProminence(entry);
    if (prom === "hero") hasHero = true;
    if (prom === "accent") hasAccent = true;
  };

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
      if (!selectedNames.has(c.entry.name) && isProminenceAllowed(c.entry)) {
        selected.push(c.entry);
        selectedNames.add(c.entry.name);
        usedLayers.add(c.entry.layer);
        markProminence(c.entry);
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
    .filter((s) => !selectedNames.has(s.entry.name) && isProminenceAllowed(s.entry))
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
    if (!isProminenceAllowed(s.entry)) continue; // re-check — slots fill as we go
    selected.push(s.entry);
    selectedNames.add(s.entry.name);
    markProminence(s.entry);
    for (const tag of s.entry.tags) selectedTags.add(tag);
    selectedCategories.set(s.entry.category, (selectedCategories.get(s.entry.category) ?? 0) + 1);
  }

  // ─── Dead Icon Floor: guarantee at least 1 dead-culture overlay per window ───
  // Without this, renders can show zero Dead icons for extended periods,
  // making the visualizer look like generic abstract art.
  const DEAD_CULTURE_TAG = BAND_CONFIG.overlayTags.culture;
  const hasDeadIcon = selected.some((e) => e.tags.includes(DEAD_CULTURE_TAG));
  if (!hasDeadIcon && targetCount > 0 && scored.length > 0) {
    const deadCandidate = scored.find(
      (s) => !selectedNames.has(s.entry.name) && s.entry.tags.includes(DEAD_CULTURE_TAG) && isProminenceAllowed(s.entry),
    );
    if (deadCandidate) {
      if (selected.length >= targetCount && selected.length > 1) {
        // Replace lowest-scoring non-hero selection
        for (let i = selected.length - 1; i >= 0; i--) {
          if (selected[i].name !== songHero && !HERO_OVERLAY_NAMES.has(selected[i].name)) {
            selected[i] = deadCandidate.entry;
            markProminence(deadCandidate.entry);
            break;
          }
        }
      } else {
        selected.push(deadCandidate.entry);
        markProminence(deadCandidate.entry);
      }
    }
  }

  return selected;
}
