import type { EnhancedFrameData, ColorPalette } from "../data/types";
import { seeded } from "./seededRandom";
import { hashString } from "./hash";

const DEFAULT_PALETTE: ColorPalette = { primary: 270, secondary: 180, saturation: 0.8 };

/**
 * Derive a musically-meaningful color palette from a song's chroma data.
 *
 * Maps 12 pitch classes to hue wheel (C=0° red, C#=30°, D=60°, ..., B=330°).
 * Primary hue = dominant pitch class. Secondary = second-highest that's ≥60°
 * circular distance from primary (or triadic fallback). Saturation reflects
 * chroma entropy: peaked → 0.95, flat → 0.55.
 */
export function deriveChromaPalette(frames: EnhancedFrameData[], showSeed?: number): ColorPalette {
  if (frames.length === 0) return DEFAULT_PALETTE;

  // Average 12 chroma bins across all frames
  const chromaAvg = new Float64Array(12);
  let validFrames = 0;
  for (const f of frames) {
    if (!f.chroma) continue;
    validFrames++;
    for (let i = 0; i < 12; i++) {
      chromaAvg[i] += f.chroma[i];
    }
  }

  if (validFrames === 0) return DEFAULT_PALETTE;

  for (let i = 0; i < 12; i++) {
    chromaAvg[i] /= validFrames;
  }

  // Find primary: pitch class with highest average energy
  let primaryBin = 0;
  let primaryVal = chromaAvg[0];
  for (let i = 1; i < 12; i++) {
    if (chromaAvg[i] > primaryVal) {
      primaryVal = chromaAvg[i];
      primaryBin = i;
    }
  }

  const primaryHue = primaryBin * 30;

  // Find secondary: second-highest bin that's ≥2 bins (60°) circular distance from primary
  let secondaryBin = -1;
  let secondaryVal = -1;
  for (let i = 0; i < 12; i++) {
    if (i === primaryBin) continue;
    const dist = Math.min(Math.abs(i - primaryBin), 12 - Math.abs(i - primaryBin));
    if (dist < 2) continue;
    if (chromaAvg[i] > secondaryVal) {
      secondaryVal = chromaAvg[i];
      secondaryBin = i;
    }
  }

  // Triadic fallback if no qualifying secondary found
  const secondaryHue = secondaryBin >= 0
    ? secondaryBin * 30
    : (primaryHue + 120) % 360;

  // Saturation from chroma entropy: peaked → high saturation, flat → low
  const sum = chromaAvg.reduce((a, b) => a + b, 0);
  let entropy = 0;
  if (sum > 0) {
    for (let i = 0; i < 12; i++) {
      const p = chromaAvg[i] / sum;
      if (p > 0) entropy -= p * Math.log2(p);
    }
  }
  // Max entropy for 12 bins = log2(12) ≈ 3.585
  const maxEntropy = Math.log2(12);
  const normalizedEntropy = entropy / maxEntropy;
  const saturation = Math.max(0.55, Math.min(0.95, 0.95 - normalizedEntropy * 0.4));

  let primary = primaryHue;
  let secondary = secondaryHue;
  let sat = saturation;

  // Seed-based jitter (±25° hue, ±0.08 saturation) to break palette convergence across shows
  if (showSeed !== undefined) {
    const rng = seeded(showSeed + hashString("palette"));
    primary = ((primary + (rng() - 0.5) * 50) % 360 + 360) % 360;
    secondary = ((secondary + (rng() - 0.5) * 40) % 360 + 360) % 360;
    sat = Math.max(0.45, Math.min(1.0, sat + (rng() - 0.5) * 0.16));
  }

  return { primary, secondary, saturation: sat };
}
