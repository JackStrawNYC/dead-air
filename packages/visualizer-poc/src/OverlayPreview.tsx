/**
 * OverlayPreview — renders a single overlay component for PNG export.
 *
 * Used by the Rust pipeline to pre-render procedural overlays. Accepts
 * a `frames` array via inputProps so render-overlay-stills can pass real
 * Dead-show audio data — the prior synthetic sine-wave fallback meant every
 * overlay was frozen at "moderate fake energy" regardless of song dynamics
 * (entire reactive overlay layer was effectively dead in the Rust pipeline).
 *
 * The fallback synthetic frames remain for ad-hoc previews where no real
 * frame data is available.
 */
import React from "react";
import { OVERLAY_COMPONENTS } from "./data/overlay-components";
import type { EnhancedFrameData } from "./data/types";

/** Synthetic fallback — only used when no `frames` inputProp is supplied.
 *  Production pre-render uses real song frames. */
function generateFallbackFrames(count: number): EnhancedFrameData[] {
  return Array.from({ length: count }, (_, i) => ({
    rms: 0.55 + Math.sin(i * 0.05) * 0.15,
    sub: 0.2 + Math.sin(i * 0.03) * 0.1,
    low: 0.15, mid: 0.2, high: 0.15,
    onset: i % 30 === 0 ? 0.8 : 0,
    beat: i % 15 === 0,
    beatConfidence: 0.7,
    centroid: 0.5,
    chroma: [0.3, 0.1, 0.2, 0.1, 0.3, 0.2, 0.1, 0.3, 0.1, 0.2, 0.1, 0.2],
    localTempo: 120,
    downbeat: i % 60 === 0,
    sectionType: "jam" as const,
    stemBassRms: 0.2,
    stemDrumOnset: i % 15 === 0 ? 0.6 : 0,
    stemDrumBeat: i % 15 === 0,
    stemVocalRms: 0.15,
    stemVocalPresence: 0.3,
    stemOtherRms: 0.1,
    stemOtherCentroid: 0.5,
    flatness: 0.4,
    dynamicRange: 0.5,
    timbralBrightness: 0.5,
    timbralFlux: 0.1,
    harmonicTension: 0.3,
    improvisationScore: 0.2,
    spaceScore: 0.1,
    melodicPitch: 0.5,
    melodicConfidence: 0.3,
    melodicDirection: 0,
    chordIndex: 0,
    chordConfidence: 0.5,
    spectralFlux: 0.1,
    contrast: [0.3, 0.2, 0.25, 0.3, 0.2, 0.15, 0.1],
  } as any));
}

const DEFAULT_FALLBACK = generateFallbackFrames(300);

interface OverlayPreviewProps {
  /** Component name from OVERLAY_COMPONENTS map. */
  overlayName?: string;
  /** Real song frames to use during rendering. When omitted, falls back
   *  to the synthetic generator (for ad-hoc preview only — production
   *  pre-render must pass real frames). */
  frames?: EnhancedFrameData[];
}

export const OverlayPreview: React.FC<OverlayPreviewProps> = ({
  overlayName = "BreathingStealie",
  frames,
}) => {
  const entry = OVERLAY_COMPONENTS[overlayName];
  if (!entry) {
    return <div style={{ width: "100%", height: "100%", background: "magenta" }} />;
  }
  const { Component } = entry;
  const renderFrames = frames && frames.length > 0 ? frames : DEFAULT_FALLBACK;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#0a0a12" }}>
      <Component frames={renderFrames} />
    </div>
  );
};
