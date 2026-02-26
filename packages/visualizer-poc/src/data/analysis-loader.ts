/**
 * Analysis data loader — loads and validates track analysis JSON.
 * Compatible with both legacy (8-field) and enhanced (28-field) frame data.
 */

import type { EnhancedFrameData, TrackAnalysis, SectionBoundary } from "./types";

/** Default empty chroma/contrast for legacy data compatibility */
const EMPTY_CHROMA: EnhancedFrameData["chroma"] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const EMPTY_CONTRAST: EnhancedFrameData["contrast"] = [0, 0, 0, 0, 0, 0, 0];

/** Upgrade legacy frame data to enhanced format */
export function upgradeFrame(frame: Record<string, unknown>): EnhancedFrameData {
  return {
    rms: (frame.rms as number) ?? 0,
    centroid: (frame.centroid as number) ?? 0,
    onset: (frame.onset as number) ?? 0,
    beat: (frame.beat as boolean) ?? false,
    sub: (frame.sub as number) ?? 0,
    low: (frame.low as number) ?? 0,
    mid: (frame.mid as number) ?? 0,
    high: (frame.high as number) ?? 0,
    chroma: (frame.chroma as EnhancedFrameData["chroma"]) ?? [...EMPTY_CHROMA],
    contrast: (frame.contrast as EnhancedFrameData["contrast"]) ?? [...EMPTY_CONTRAST],
    flatness: (frame.flatness as number) ?? 0,
  };
}

/** Load and normalize analysis data from props */
export function loadAnalysis(props: Record<string, unknown>): TrackAnalysis | null {
  // Support both nested { analysis: { meta, frames } } and top-level { meta, frames }
  const raw = (props.analysis as Record<string, unknown>) ?? props;
  const meta = raw.meta as TrackAnalysis["meta"] | undefined;
  const rawFrames = raw.frames as Record<string, unknown>[] | undefined;

  if (!meta || !rawFrames || rawFrames.length === 0) {
    return null;
  }

  // Ensure sections array exists (legacy data won't have it)
  if (!meta.sections) {
    meta.sections = [];
  }

  const frames = rawFrames.map(upgradeFrame);

  return { meta, frames };
}

/** Extract section boundaries, with fallback to energy-based auto-sections */
export function getSections(analysis: TrackAnalysis): SectionBoundary[] {
  if (analysis.meta.sections && analysis.meta.sections.length > 0) {
    return analysis.meta.sections;
  }

  // Fallback: divide into equal chunks based on energy
  const totalFrames = analysis.frames.length;
  const sectionSize = Math.floor(totalFrames / 6);
  const sections: SectionBoundary[] = [];

  for (let i = 0; i < 6; i++) {
    const start = i * sectionSize;
    const end = i === 5 ? totalFrames : (i + 1) * sectionSize;
    let energySum = 0;
    for (let f = start; f < end; f++) {
      energySum += analysis.frames[f].rms;
    }
    const avgEnergy = energySum / (end - start);
    const energy = avgEnergy > 0.5 ? "high" : avgEnergy > 0.25 ? "mid" : "low";

    sections.push({
      frameStart: start,
      frameEnd: end,
      label: `section_${i}`,
      energy,
      avgEnergy: Math.round(avgEnergy * 1000) / 1000,
    });
  }

  return sections;
}
