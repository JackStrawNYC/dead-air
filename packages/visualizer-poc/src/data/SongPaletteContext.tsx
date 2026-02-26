/**
 * SongPaletteContext — per-song color palette for overlay components.
 *
 * Provides palette.primary / palette.secondary hues so overlays can tint
 * their colors toward the song's harmonic identity. Components consume via
 * useSongPalette() hook — always returns a value (defaults to psychedelic purple).
 *
 * Separation from ShowContext: ShowContext = per-show metadata (venue, date);
 * SongPaletteContext = per-song visual identity (primary/secondary hue).
 */

import React, { createContext, useContext, useMemo } from "react";
import type { ColorPalette } from "./types";

// ─── Defaults ───

const DEFAULT_PALETTE: ColorPalette = {
  primary: 270,    // psychedelic purple
  secondary: 180,  // cyan complement
  saturation: 1,
  brightness: 1,
};

// ─── Context ───

const PaletteContext = createContext<ColorPalette>(DEFAULT_PALETTE);

// ─── Provider ───

interface Props {
  palette?: ColorPalette;
  children: React.ReactNode;
}

export const SongPaletteProvider: React.FC<Props> = ({ palette, children }) => {
  const value = useMemo<ColorPalette>(
    () => ({
      primary: palette?.primary ?? DEFAULT_PALETTE.primary,
      secondary: palette?.secondary ?? DEFAULT_PALETTE.secondary,
      saturation: palette?.saturation ?? 1,
      brightness: palette?.brightness ?? 1,
    }),
    [palette],
  );

  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
};

// ─── Hook ───

/** Get the current song's color palette (always returns a value — defaults to psychedelic purple). */
export function useSongPalette(): ColorPalette {
  return useContext(PaletteContext);
}

// ─── Hue utilities for overlays ───

/**
 * Blend a chroma-derived hue with the palette's primary hue.
 * @param chromaHue — hue from chroma analysis (0-360, typically chromaIdx * 30)
 * @param palette — song palette
 * @param paletteWeight — 0-1, how much to pull toward palette (default 0.3)
 * @returns blended hue (0-360)
 */
export function blendWithPalette(
  chromaHue: number,
  palette: ColorPalette,
  paletteWeight = 0.3,
): number {
  // Shortest-arc hue interpolation
  let diff = palette.primary - chromaHue;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return ((chromaHue + diff * paletteWeight) % 360 + 360) % 360;
}

/**
 * Compute the CSS hue-rotate angle to tint overlays toward a palette hue.
 * Returns a moderate rotation that shifts the "average" overlay color space
 * (centered ~180° cyan/blue psychedelic) toward the palette primary.
 * Capped at ±60° to avoid garish shifts.
 */
export function paletteHueRotation(palette: ColorPalette): number {
  // Rotation relative to default palette hue (270° purple).
  // Shortest-arc difference, scaled to 25% influence, capped at ±60°.
  const neutralHue = DEFAULT_PALETTE.primary; // 270
  let diff = palette.primary - neutralHue;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  const rotation = diff * 0.25;
  return Math.max(-60, Math.min(60, rotation));
}
