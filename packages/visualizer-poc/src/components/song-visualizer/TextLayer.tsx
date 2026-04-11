/**
 * TextLayer — ConcertInfo + SetlistScroll wrapped in film stock filter div.
 *
 * Text elements rendered OUTSIDE CameraMotion to prevent CSS transform blur,
 * but wrapped in film stock filter so typography lives in the same visual world.
 *
 * Extracted from SongVisualizer.tsx render tree (pure extraction, no logic changes).
 */

import React from "react";
import { ConcertInfo } from "../ConcertInfo";
import { SetlistScroll } from "../SetlistScroll";
import type { EnhancedFrameData } from "../../data/types";

export interface TextLayerProps {
  isDeadAir: boolean;
  filmStockFilter?: string;
  songTitle: string;
  frames: EnhancedFrameData[];
  currentSong: string;
  introFactor: number;
}

export const TextLayer: React.FC<TextLayerProps> = ({
  isDeadAir,
  filmStockFilter,
  songTitle,
  frames,
  currentSong,
  introFactor,
}) => {
  if (isDeadAir) return null;

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      filter: filmStockFilter,
    }}>
      <ConcertInfo songTitle={songTitle} />
      <SetlistScroll frames={frames} currentSong={currentSong} introFactor={introFactor} />
      {/* NowPlaying removed — was overlapping the setlist on the left side. */}
    </div>
  );
};
