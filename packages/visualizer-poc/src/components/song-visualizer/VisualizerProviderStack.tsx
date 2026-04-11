/**
 * VisualizerProviderStack — wraps the 9 nested context providers
 * that SongVisualizer needs to supply to all descendant components.
 *
 * Extracted from SongVisualizer.tsx render tree (pure extraction, no logic changes).
 */

import React from "react";
import type * as THREE from "three";
import type { ShowSetlist } from "../../data/types";
import type { PrecomputedNarrative } from "../../utils/show-narrative-precompute";
import type { ShowNarrativeState } from "../../data/ShowNarrativeContext";
import { ShowNarrativeProvider } from "../../data/ShowNarrativeContext";
import { ShowContextProvider } from "../../data/ShowContext";
import { AudioSnapshotProvider } from "../../data/AudioSnapshotContext";
import { IconOverlayProvider } from "../../data/IconOverlayContext";
import { HeroPermittedProvider } from "../../data/HeroPermittedContext";
import { JamPhaseProvider } from "../../data/JamPhaseContext";
import { PeakOfShowProvider } from "../../data/PeakOfShowContext";
import { DeadAirProvider } from "../../data/DeadAirContext";
import { TimeDilationProvider } from "../../data/TimeDilationContext";
import type { AudioSnapshot } from "../../utils/audio-reactive";

export interface VisualizerProviderStackProps {
  show?: ShowSetlist;
  narrativeState?: PrecomputedNarrative;
  totalSongs: number;
  narrativeInitialState?: Partial<ShowNarrativeState>;
  audioSnapshot: AudioSnapshot;
  iconOverlayValue: { texture: THREE.Texture | null; opacity: number };
  heroPermitted: boolean;
  jamPhaseValue: { phase: number; progress: number };
  peakOfShowIntensity: number;
  deadAirFactor: number;
  spaceTimeDilation: number;
  children: React.ReactNode;
}

export const VisualizerProviderStack: React.FC<VisualizerProviderStackProps> = ({
  show,
  totalSongs,
  narrativeInitialState,
  audioSnapshot,
  iconOverlayValue,
  heroPermitted,
  jamPhaseValue,
  peakOfShowIntensity,
  deadAirFactor,
  spaceTimeDilation,
  children,
}) => (
  <ShowNarrativeProvider totalSongs={totalSongs} initialState={narrativeInitialState}>
  <ShowContextProvider show={show}>
  <AudioSnapshotProvider snapshot={audioSnapshot}>
  <IconOverlayProvider value={iconOverlayValue}>
  <HeroPermittedProvider permitted={heroPermitted}>
  <JamPhaseProvider value={jamPhaseValue}>
  <PeakOfShowProvider value={peakOfShowIntensity}>
  <DeadAirProvider value={deadAirFactor}>
  <TimeDilationProvider value={spaceTimeDilation}>
    {children}
  </TimeDilationProvider>
  </DeadAirProvider>
  </PeakOfShowProvider>
  </JamPhaseProvider>
  </HeroPermittedProvider>
  </IconOverlayProvider>
  </AudioSnapshotProvider>
  </ShowContextProvider>
  </ShowNarrativeProvider>
);
