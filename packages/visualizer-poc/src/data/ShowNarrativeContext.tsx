/**
 * ShowNarrativeContext — cross-song state that makes the show feel like a journey.
 *
 * Tracks show-level memory: energy arc, overlay dedup, shader variety,
 * coherence history, and show phase detection.
 *
 * Wraps the entire show composition. Each SongVisualizer receives narrative
 * state and updates it on unmount.
 */

import React, { createContext, useContext, useRef, useCallback, useMemo } from "react";
import type { VisualMode } from "./types";
import type { ShowArcPhase } from "./show-arc";

export type ShowPhase = "opening" | "deepening" | "peak_show" | "closing";

export interface ShowNarrativeState {
  /** Cumulative show energy: running average of per-song peak energies */
  showEnergyBaseline: number;
  /** Songs completed so far */
  songsCompleted: number;
  /** Set of overlay IDs already shown (prevents repeats across songs) */
  usedOverlayIds: Set<string>;
  /** Whether any song in the show has triggered a coherence lock */
  hasHadCoherenceLock: boolean;
  /** Running tally of shader modes used (for variety enforcement) */
  usedShaderModes: Map<VisualMode, number>;
  /** Per-song peak energy values for show arc awareness */
  songPeakEnergies: number[];
  /** Current position in show arc (legacy 4-phase) */
  showPhase: ShowPhase;
  /** Number of songs completed since Drums/Space ended (0 = not yet seen D/S) */
  postDrumsSpaceCount: number;
  /** Whether Drums/Space has been encountered in this show */
  hasDrumsSpace: boolean;
  /** Enhanced 8-phase show arc phase */
  showArcPhase?: ShowArcPhase;
}

export interface ShowNarrativeActions {
  /** Record a completed song's data */
  recordSong: (peakEnergy: number, overlayIds: string[], shaderModes: VisualMode[], hadCoherenceLock: boolean, wasDrumsSpace?: boolean) => void;
}

export interface ShowNarrativeContextValue {
  state: ShowNarrativeState;
  actions: ShowNarrativeActions;
}

const NarrativeCtx = createContext<ShowNarrativeContextValue | null>(null);

/** Determine show phase based on song position within setlist */
function computeShowPhase(songsCompleted: number, totalSongs: number): ShowPhase {
  if (totalSongs <= 0) return "opening";
  if (songsCompleted <= 1) return "opening";
  const midpoint = Math.floor(totalSongs / 2);
  if (songsCompleted < midpoint) return "deepening";
  if (songsCompleted < totalSongs - 2) return "peak_show";
  return "closing";
}

// ─── Provider ───

interface ProviderProps {
  totalSongs: number;
  children: React.ReactNode;
}

export const ShowNarrativeProvider: React.FC<ProviderProps> = ({ totalSongs, children }) => {
  const stateRef = useRef<ShowNarrativeState>({
    showEnergyBaseline: 0,
    songsCompleted: 0,
    usedOverlayIds: new Set(),
    hasHadCoherenceLock: false,
    usedShaderModes: new Map(),
    songPeakEnergies: [],
    showPhase: "opening",
    postDrumsSpaceCount: 0,
    hasDrumsSpace: false,
  });

  const recordSong = useCallback((
    peakEnergy: number,
    overlayIds: string[],
    shaderModes: VisualMode[],
    hadCoherenceLock: boolean,
    wasDrumsSpace?: boolean,
  ) => {
    const s = stateRef.current;
    s.songsCompleted++;
    s.songPeakEnergies.push(peakEnergy);
    s.showEnergyBaseline = s.songPeakEnergies.reduce((a, b) => a + b, 0) / s.songPeakEnergies.length;

    for (const id of overlayIds) {
      s.usedOverlayIds.add(id);
    }

    if (hadCoherenceLock) {
      s.hasHadCoherenceLock = true;
    }

    for (const mode of shaderModes) {
      s.usedShaderModes.set(mode, (s.usedShaderModes.get(mode) ?? 0) + 1);
    }

    // Track Drums/Space position
    if (wasDrumsSpace) {
      s.hasDrumsSpace = true;
      s.postDrumsSpaceCount = 0;
    } else if (s.hasDrumsSpace) {
      s.postDrumsSpaceCount++;
    }

    s.showPhase = computeShowPhase(s.songsCompleted, totalSongs);
  }, [totalSongs]);

  const value = useMemo<ShowNarrativeContextValue>(() => ({
    state: stateRef.current,
    actions: { recordSong },
  }), [recordSong]);

  return <NarrativeCtx.Provider value={value}>{children}</NarrativeCtx.Provider>;
};

// ─── Hook ───

/** Access show narrative state and actions. Returns null if no provider above. */
export function useShowNarrative(): ShowNarrativeContextValue | null {
  return useContext(NarrativeCtx);
}
