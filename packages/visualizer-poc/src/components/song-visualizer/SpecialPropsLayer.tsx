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
  /** Sacred segue: delay title card and song stats by 30 seconds */
  suppressIntro?: boolean;
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
  suppressIntro,
}) => {
  const showCtx = useShowContext();
  const eraGrainMult = getEraPreset(showCtx?.era ?? "")?.grainIntensity ?? 1.0;
  const frame = useCurrentFrame();

  // Sacred segue intro suppression: delay title card and stats by 30 seconds (900 frames)
  const introDelay = suppressIntro ? 900 : 0;
  const adjustedFrame = frame - introDelay;

  // Dark scrim during intro window — bottom gradient for text readability
  const SCRIM_HOLD = 750;
  const SCRIM_FADE = 270;
  const scrimFrame = suppressIntro ? adjustedFrame : frame;
  const scrimOpacity = scrimFrame < 0 ? 0
    : scrimFrame < SCRIM_HOLD ? 0.55
    : scrimFrame < SCRIM_HOLD + SCRIM_FADE ? 0.55 * (1 - (scrimFrame - SCRIM_HOLD) / SCRIM_FADE)
    : 0;

  // When suppressing intro, don't render title/stats until delay passes
  const showIntroElements = !suppressIntro || frame >= introDelay;

  return (
    <>
      {scrimOpacity > 0.01 && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `linear-gradient(to top, rgba(0,0,0,${(scrimOpacity * 0.95).toFixed(3)}) 0%, rgba(0,0,0,${(scrimOpacity * 0.6).toFixed(3)}) 40%, rgba(0,0,0,${(scrimOpacity * 0.2).toFixed(3)}) 70%, transparent 90%)`,
          zIndex: 99,
        }} />
      )}
      {showIntroElements && (
        <SongTitle
          title={songTitle}
          setNumber={setNumber}
          trackNumber={trackNumber}
          isSegue={isSegue}
        />
      )}
      {showIntroElements && songStats && songStats[trackId] && (
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
      {/* Reel change marks — first 8 frames of set opener */}
      {trackNumber === 1 && frame < 8 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 95,
          }}
        >
          {/* Brief dark flash */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: `rgba(0, 0, 0, ${frame < 3 ? 0.6 - frame * 0.15 : 0.15 - (frame - 3) * 0.03})`,
            }}
          />
          {/* Sprocket hole pattern on right edge */}
          {frame < 6 && Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                right: 8,
                top: `${15 + i * 22}%`,
                width: 12,
                height: 18,
                borderRadius: 3,
                border: "2px solid rgba(255, 255, 255, 0.12)",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                opacity: 0.5 - frame * 0.08,
              }}
            />
          ))}
        </div>
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
