/**
 * AudioSnapshotContext — single-computation audio snapshot sharing.
 *
 * SongVisualizer computes AudioSnapshot once per frame and provides it
 * via React context. All consumers (EnergyEnvelope, overlay components,
 * climax state machine) read from here instead of independently running
 * their own Gaussian smoothing loops.
 *
 * Performance impact: eliminates 60-100 redundant O(window) loops per frame
 * when 5-7 overlay components are active.
 */

import React, { createContext, useContext } from "react";
import type { AudioSnapshot } from "../utils/audio-reactive";

const Ctx = createContext<AudioSnapshot | null>(null);

export const AudioSnapshotProvider: React.FC<{
  snapshot: AudioSnapshot;
  children: React.ReactNode;
}> = ({ snapshot, children }) => (
  <Ctx.Provider value={snapshot}>{children}</Ctx.Provider>
);

/**
 * Read the pre-computed audio snapshot from context.
 * Returns null if no provider is mounted (e.g., standalone component testing).
 */
export function useAudioSnapshotContext(): AudioSnapshot | null {
  return useContext(Ctx);
}
