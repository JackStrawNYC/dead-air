/**
 * useSacredSegueState — extracts sacred segue detection from SongVisualizer.
 *
 * Computes sacred segue in/out detection, suite continuity, segue transition
 * styles, and segue hue rotation. All logic is a pure extraction from
 * SongVisualizer.tsx with no behavior changes.
 */

import { useMemo } from "react";
import type { ColorPalette, ShowSetlist } from "../data/types";
import type { TransitionStyle } from "../data/song-identities";
import { isSacredSegue, getSacredSegueTransition } from "../data/band-config";
import { computeSegueHueRotation } from "../utils/segue-blend";
import type { PrecomputedNarrative } from "../utils/show-narrative-precompute";

const FADE_FRAMES = 90; // 3 seconds at 30fps

export interface UseSacredSegueInput {
  show: ShowSetlist | undefined;
  songTrackId: string;
  songTitle: string;
  segueIn: boolean | undefined;
  segueOut: boolean | undefined;
  segueFromPalette: ColorPalette | undefined;
  segueToPalette: ColorPalette | undefined;
  effectivePalette: ColorPalette | undefined;
  frame: number;
  durationInFrames: number;
  narrativeState: PrecomputedNarrative | undefined;
}

export interface UseSacredSegueResult {
  isSacredSegueIn: boolean;
  isSacredSegueOut: boolean;
  /** Suite continuity info from precomputed narrative */
  suiteInfo: PrecomputedNarrative["suiteInfo"] | null;
  /** Whether this song is in the middle of a suite (not the start) */
  isInSuiteMiddle: boolean;
  sacredSegueInTransition: TransitionStyle | undefined;
  sacredSegueOutTransition: TransitionStyle | undefined;
  hueRotation: number;
}

export function useSacredSegueState(input: UseSacredSegueInput): UseSacredSegueResult {
  const {
    show, songTrackId, songTitle, segueIn, segueOut,
    segueFromPalette, segueToPalette, effectivePalette,
    frame, durationInFrames, narrativeState,
  } = input;

  // ─── Suite continuity (multi-song suites like Help>Slip>Frank) ───
  const suiteInfo = narrativeState?.suiteInfo ?? null;
  const isInSuiteMiddle = !!(suiteInfo?.inSuite && !suiteInfo.isSuiteStart);

  // ─── Sacred segue detection ───
  const isSacredSegueIn = useMemo(() => {
    if (!segueIn || !show) return false;
    const songs = show.songs;
    const idx = songs.findIndex((s) => s.trackId === songTrackId);
    if (idx <= 0) return false;
    return isSacredSegue(songs[idx - 1].title, songTitle);
  }, [segueIn, show, songTrackId, songTitle]);

  const isSacredSegueOut = useMemo(() => {
    if (!segueOut || !show) return false;
    const songs = show.songs;
    const idx = songs.findIndex((s) => s.trackId === songTrackId);
    if (idx < 0 || idx >= songs.length - 1) return false;
    return isSacredSegue(songTitle, songs[idx + 1].title);
  }, [segueOut, show, songTrackId, songTitle]);

  // ─── Sacred segue curated transition style lookup ───
  const sacredSegueInTransition = useMemo(() => {
    if (!isSacredSegueIn || !show) return undefined;
    const songs = show.songs;
    const idx = songs.findIndex((s) => s.trackId === songTrackId);
    if (idx <= 0) return undefined;
    return getSacredSegueTransition(songs[idx - 1].title, songTitle);
  }, [isSacredSegueIn, show, songTrackId, songTitle]);

  const sacredSegueOutTransition = useMemo(() => {
    if (!isSacredSegueOut || !show) return undefined;
    const songs = show.songs;
    const idx = songs.findIndex((s) => s.trackId === songTrackId);
    if (idx < 0 || idx >= songs.length - 1) return undefined;
    return getSacredSegueTransition(songTitle, songs[idx + 1].title);
  }, [isSacredSegueOut, show, songTrackId, songTitle]);

  // ─── Palette hue rotation ───
  const hueRotation = useMemo(() => {
    return computeSegueHueRotation(
      effectivePalette,
      !!segueIn, !!segueOut,
      segueFromPalette, segueToPalette,
      frame, durationInFrames, FADE_FRAMES,
    );
  }, [effectivePalette, segueIn, segueOut, segueFromPalette, segueToPalette, frame, durationInFrames]);

  return {
    isSacredSegueIn,
    isSacredSegueOut,
    suiteInfo,
    isInSuiteMiddle,
    sacredSegueInTransition,
    sacredSegueOutTransition,
    hueRotation,
  };
}
