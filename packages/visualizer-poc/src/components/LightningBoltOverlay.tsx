/**
 * LightningBoltOverlay — iconic 13-point bolt, pulses on transients.
 * Flash-and-decay: bright onset triggers a bolt flash that decays.
 * Positioned randomly per flash cycle for visual variety.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useSongPalette } from "../data/SongPaletteContext";

interface Props {
  frames: EnhancedFrameData[];
}

export const LightningBoltOverlay: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const palette = useSongPalette();

  // Only show on onset peaks (transients)
  const onsetOpacity = interpolate(snap.onsetEnvelope, [0, 0.3, 1], [0, 0, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (onsetOpacity < 0.02) return null;

  const boltSize = Math.min(width, height) * 0.15;

  // Position varies per onset cycle — hash based on frame
  const cycleId = Math.floor(frame / 30); // approximate onset cycle
  const posX = ((cycleId * 7919) % 60) + 20; // 20-80% of width
  const posY = ((cycleId * 6271) % 50) + 25; // 25-75% of height

  const color = `hsl(${palette.primary}, 70%, 75%)`;
  const glowColor = `hsl(${palette.primary}, 80%, 60%)`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${posX}%`,
          top: `${posY}%`,
          transform: "translate(-50%, -50%)",
          opacity: onsetOpacity,
          filter: `drop-shadow(0 0 20px ${glowColor}) drop-shadow(0 0 40px ${glowColor})`,
          willChange: "opacity",
        }}
      >
        <svg width={boltSize} height={boltSize * 1.5} viewBox="0 0 60 100" fill="none">
          <polygon
            points="30,0 20,38 35,38 10,100 45,55 28,55 50,0"
            fill={color}
          />
        </svg>
      </div>
    </div>
  );
};
