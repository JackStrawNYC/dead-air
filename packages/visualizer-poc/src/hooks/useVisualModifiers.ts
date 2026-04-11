/**
 * useVisualModifiers — extracts show-arc, tour, set, fatigue, crowd, and
 * after-jam modifier computations from SongVisualizer.
 *
 * Contains the memoized modifier computations that depend on show-level state
 * (not per-frame audio). All logic is a pure extraction from SongVisualizer.tsx
 * with no behavior changes.
 */

import { useMemo } from "react";
import type { ShowSetlist, EnhancedFrameData } from "../data/types";
import { computeShowArcPhase, getShowArcModifiers, type ShowArcPhase, type ShowArcModifiers } from "../data/show-arc";
import { computeTourModifiers, applyTourModifiers, type TourPositionModifiers } from "../utils/tour-position";
import { getSetTheme, applySetModifiers, type SetTheme } from "../utils/set-theme";
import { computeFatigueDampening, type FatigueDampening } from "../utils/visual-fatigue";
import { computeCrowdEnergy, type CrowdEnergyState } from "../utils/crowd-energy";
import { computeAfterJamQuality, type AfterJamModifiers } from "../utils/after-jam-quality";
import type { PrevSongContext } from "../utils/show-narrative-precompute";

export interface UseVisualModifiersInput {
  show: ShowSetlist | undefined;
  songSet: number;
  songTrackNumber: number | undefined;
  isDrumsSpace: boolean;
  songsCompleted: number;
  postDrumsSpaceCount: number;
  songPeakEnergies: number[];
  prevSongContext: PrevSongContext | null;
  frames: EnhancedFrameData[];
}

export interface UseVisualModifiersResult {
  showArcPhase: ShowArcPhase | undefined;
  showArcModifiers: ShowArcModifiers | undefined;
  tourModifiers: TourPositionModifiers;
  setTheme: SetTheme;
  currentSongAvgEnergy: number;
  fatigue: FatigueDampening;
  crowdEnergy: CrowdEnergyState;
  afterJamMods: AfterJamModifiers;
}

export function useVisualModifiers(input: UseVisualModifiersInput): UseVisualModifiersResult {
  const {
    show, songSet, songTrackNumber, isDrumsSpace,
    songsCompleted, postDrumsSpaceCount,
    songPeakEnergies, prevSongContext, frames,
  } = input;

  // ─── Show arc phase ───
  const showArcPhase = useMemo((): ShowArcPhase | undefined => {
    if (!show) return undefined;
    const songsInSet = show.songs.filter((s) => s.set === songSet).length;
    const trackNumber = songTrackNumber ?? 1;
    return computeShowArcPhase({
      setNumber: songSet,
      trackNumber,
      songsInSet,
      totalSongs: show.songs.length,
      songsCompleted,
      isJamSegment: isDrumsSpace,
      postJamSegmentCount: postDrumsSpaceCount,
    });
  }, [show, songSet, songTrackNumber, isDrumsSpace, songsCompleted, postDrumsSpaceCount]);

  const tourModifiers = useMemo(
    () => computeTourModifiers({
      nightInRun: show?.nightInRun,
      totalNights: show?.totalNights,
      daysOff: show?.daysOff,
    }),
    [show?.nightInRun, show?.totalNights, show?.daysOff],
  );

  const setTheme = useMemo(
    () => getSetTheme(songSet),
    [songSet],
  );

  const showArcModifiers = useMemo(
    () => showArcPhase ? applyTourModifiers(applySetModifiers(getShowArcModifiers(showArcPhase), setTheme), tourModifiers) : undefined,
    [showArcPhase, setTheme, tourModifiers],
  );

  // ─── Visual fatigue governor (cumulative show intensity tracking) ───
  const currentSongAvgEnergy = useMemo(() => {
    if (!frames.length) return 0;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < frames.length; i += 30) {
      sum += frames[i].rms;
      count++;
    }
    return count > 0 ? sum / count : 0;
  }, [frames]);

  const showMinutesElapsed = songsCompleted * 7;
  const isEncore = songSet >= 3;
  const fatigue = computeFatigueDampening({
    songPeakEnergies,
    currentSongAvgEnergy,
    showMinutesElapsed,
    songsCompleted,
  }, isEncore);

  // ─── Crowd Energy Simulation (audience momentum across the show) ───
  const crowdEnergy = useMemo(
    () => computeCrowdEnergy(
      songPeakEnergies,
      songSet,
      songsCompleted,
      currentSongAvgEnergy,
    ),
    [songPeakEnergies, songSet, songsCompleted, currentSongAvgEnergy],
  );

  // ─── After-Jam Silence Quality (intro atmosphere from previous song) ───
  const afterJamMods = useMemo(
    () => computeAfterJamQuality(prevSongContext),
    [prevSongContext],
  );

  return {
    showArcPhase,
    showArcModifiers,
    tourModifiers,
    setTheme,
    currentSongAvgEnergy,
    fatigue,
    crowdEnergy,
    afterJamMods,
  };
}
