/**
 * SpecialPropsLayer — always-active components with special props
 * (song title, DNA stats, milestones, listen-for, fan quotes, film grain).
 *
 * These render outside the overlay rotation system and have their own
 * internal timing logic. Extracted from SongVisualizer for clarity.
 */

import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { SongTitle } from "../SongTitle";
import { FilmGrain } from "../FilmGrain";
import { SongDNA } from "../SongDNA";
import type { SongStats } from "../SongDNA";
import { MilestoneCard } from "../MilestoneCard";
import { ListenFor } from "../ListenFor";
import { FanQuoteOverlay } from "../FanQuoteOverlay";
import type { FanReview } from "../FanQuoteOverlay";
import { SilentErrorBoundary } from "../SilentErrorBoundary";
import { SongPaletteProvider } from "../../data/SongPaletteContext";
import type { ColorPalette, Milestone } from "../../data/types";
import { getEraPreset } from "../../data/era-presets";
import { useShowContext } from "../../data/ShowContext";

interface Props {
  songTitle: string;
  setNumber: number;
  trackNumber: number;
  trackId: string;
  isSegue: boolean;
  energy: number;
  palette?: ColorPalette;
  songStats: Record<string, SongStats> | null;
  milestonesMap: Record<string, Milestone> | null;
  narrationData: Record<string, { listenFor: string[]; context?: string }> | null;
  fanReviews: FanReview[];
  showSeed?: number;
}

export const SpecialPropsLayer: React.FC<Props> = ({
  songTitle,
  setNumber,
  trackNumber,
  trackId,
  isSegue,
  energy,
  palette,
  songStats,
  milestonesMap,
  narrationData,
  fanReviews,
  showSeed,
}) => {
  const showCtx = useShowContext();
  const eraGrainMult = getEraPreset(showCtx?.era ?? "")?.grainIntensity ?? 1.0;
  const frame = useCurrentFrame();

  // Dark scrim during intro window — bottom gradient for text readability
  const SCRIM_HOLD = 600;
  const SCRIM_FADE = 150;
  const scrimOpacity = frame < SCRIM_HOLD ? 0.40
    : frame < SCRIM_HOLD + SCRIM_FADE ? 0.40 * (1 - (frame - SCRIM_HOLD) / SCRIM_FADE)
    : 0;

  return (
    <>
      {scrimOpacity > 0.01 && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `linear-gradient(to top, rgba(0,0,0,${(scrimOpacity * 0.9).toFixed(3)}) 0%, rgba(0,0,0,${(scrimOpacity * 0.4).toFixed(3)}) 35%, transparent 65%)`,
          zIndex: 99,
        }} />
      )}
      <SongTitle
        title={songTitle}
        setNumber={setNumber}
        trackNumber={trackNumber}
        isSegue={isSegue}
      />
      {songStats && songStats[trackId] && (
        <SilentErrorBoundary name="SongDNA">
          <SongDNA stats={songStats[trackId]} />
        </SilentErrorBoundary>
      )}
      {milestonesMap && milestonesMap[trackId] && (
        <SilentErrorBoundary name="MilestoneCard">
          <MilestoneCard milestone={milestonesMap[trackId]} />
        </SilentErrorBoundary>
      )}
      {narrationData && narrationData[trackId] && (
        <SilentErrorBoundary name="ListenFor">
          <SongPaletteProvider palette={palette}>
            <ListenFor
              items={narrationData[trackId].listenFor}
              context={narrationData[trackId].context}
              trackNumberInSet={trackNumber}
            />
          </SongPaletteProvider>
        </SilentErrorBoundary>
      )}
      {fanReviews.length > 0 && (
        <SilentErrorBoundary name="FanQuoteOverlay">
          <FanQuoteOverlay
            reviews={fanReviews}
            trackNumber={trackNumber}
            seed={showSeed}
          />
        </SilentErrorBoundary>
      )}
      {!process.env.SKIP_GRAIN && (
        <FilmGrain opacity={interpolate(
          energy, [0.03, 0.30], [0.10, 0.04],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        ) * eraGrainMult} energy={energy} />
      )}
    </>
  );
};
