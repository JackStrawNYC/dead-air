/**
 * SpecialPropsLayer — always-active components with special props
 * (song title, DNA stats, milestones, listen-for, fan quotes, film grain).
 *
 * These render outside the overlay rotation system and have their own
 * internal timing logic. Extracted from SongVisualizer for clarity.
 */

import React from "react";
import { interpolate } from "remotion";
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
  return (
    <>
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
      <FilmGrain opacity={interpolate(
        energy, [0.03, 0.30], [0.10, 0.04],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      )} energy={energy} />
    </>
  );
};
