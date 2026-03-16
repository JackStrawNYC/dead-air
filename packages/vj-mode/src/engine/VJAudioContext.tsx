/**
 * VJAudioContext — React context providing SmoothedAudioState to all VJ children.
 * Replaces Remotion's AudioDataContext with real-time Web Audio data.
 */

import React, { createContext, useContext } from "react";
import type { SmoothedAudioState } from "../audio/types";

const VJAudioCtx = createContext<SmoothedAudioState | null>(null);

export function useVJAudio(): SmoothedAudioState {
  const ctx = useContext(VJAudioCtx);
  if (!ctx) throw new Error("useVJAudio must be used inside VJAudioProvider");
  return ctx;
}

interface Props {
  state: SmoothedAudioState;
  children: React.ReactNode;
}

export const VJAudioProvider: React.FC<Props> = ({ state, children }) => {
  return <VJAudioCtx.Provider value={state}>{children}</VJAudioCtx.Provider>;
};
