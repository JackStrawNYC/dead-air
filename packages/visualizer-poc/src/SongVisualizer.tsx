/**
 * SongVisualizer — per-song composition orchestrator.
 *
 * Combines scene routing, audio playback, overlay stack, and special-prop
 * components into a layered visual composition. Delegates rendering to
 * focused sub-components in components/song-visualizer/.
 *
 * Architecture:
 *   SongVisualizer (orchestrator)
 *   ├─ SceneRouter (base shader)
 *   ├─ SongArtLayer (poster with Ken Burns + dead air bookend)
 *   ├─ LyricTriggerLayer (word-synced curated visuals)
 *   ├─ PoeticLyrics (flowing text)
 *   ├─ DynamicOverlayStack (5-20 rotation overlays)
 *   ├─ CrowdOverlay (applause glow)
 *   ├─ SpecialPropsLayer (title, DNA, milestones, listen-for, fan quotes, grain)
 *   └─ AudioLayer (song audio + crowd ambience)
 */

import React, { useMemo } from "react";
import { staticFile, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { SceneRouter } from "./scenes/SceneRouter";
import { SceneCrossfade } from "./scenes/SceneCrossfade";
import { SegueCrossfade } from "./scenes/SegueCrossfade";
import { renderScene } from "./scenes/scene-registry";
import { OVERLAY_COMPONENTS } from "./data/overlay-components";
import { buildRotationSchedule, getOverlayOpacities } from "./data/overlay-rotation";
import type { RotationSchedule } from "./data/overlay-rotation";
import { ConcertInfo } from "./components/ConcertInfo";
import { SetlistScroll } from "./components/SetlistScroll";
import { loadAnalysis, getSections } from "./data/analysis-loader";
import type { SetlistEntry, ShowSetlist, TrackAnalysis, ColorPalette, VisualMode } from "./data/types";
import type { OverlayPhaseHint } from "./data/types";
import { ShowContextProvider, getShowSeed } from "./data/ShowContext";
import { VisualizerErrorBoundary } from "./components/VisualizerErrorBoundary";
import { SilentErrorBoundary } from "./components/SilentErrorBoundary";
import { LyricTriggerLayer } from "./components/LyricTriggerLayer";
import { PoeticLyrics } from "./components/PoeticLyrics";
import { resolveLyricTriggers, loadAlignmentWords } from "./data/lyric-trigger-resolver";
import { resolveMediaForSong } from "./data/media-resolver";
import { SongPaletteProvider } from "./data/SongPaletteContext";
import { EraGrade } from "./components/EraGrade";
import { EnergyEnvelope } from "./components/EnergyEnvelope";
import { computeClimaxState, climaxModulation } from "./utils/climax-state";
import { computeAudioSnapshot, buildBeatArray } from "./utils/audio-reactive";
import { computeCoherence } from "./utils/coherence";
import { computeDrumsSpacePhase } from "./utils/drums-space-phase";
import { useShowNarrative, ShowNarrativeProvider } from "./data/ShowNarrativeContext";
import { calibrateEnergy } from "./utils/energy";
import { AudioSnapshotProvider } from "./data/AudioSnapshotContext";
import { HeroPermittedProvider } from "./data/HeroPermittedContext";
import { computeJamEvolution, getJamPhaseBoundaries, getJamPhaseSequence, JAM_PHASE_INDEX } from "./utils/jam-evolution";
import { JamPhaseProvider } from "./data/JamPhaseContext";
import { PeakOfShowProvider } from "./data/PeakOfShowContext";
import { computeMediaSuppression, computeArtSuppressionFactor } from "./utils/media-suppression";
import { computeSegueHueRotation } from "./utils/segue-blend";
import { detectCrowdMoments } from "./data/crowd-detector";
import { CrowdOverlay } from "./components/CrowdOverlay";
import { CameraMotion } from "./components/CameraMotion";
import { computeVisualFocus } from "./utils/visual-focus";
import { findMusicEnd } from "./utils/music-end";
import { computeCounterpoint } from "./utils/visual-counterpoint";
import { lookupSongIdentity, getOrGenerateSongIdentity } from "./data/song-identities";
import { computeShowArcPhase, getShowArcModifiers } from "./data/show-arc";
import type { ShowArcPhase } from "./data/show-arc";
import { computeTourModifiers, applyTourModifiers } from "./utils/tour-position";
import { getSetTheme, applySetModifiers } from "./utils/set-theme";
import { computeITResponse } from "./utils/it-response";
import { isSacredSegue, isJamSegmentTitle } from "./data/band-config";
import { classifyStemSection, detectSolo, computeVocalWarmth, computeGuitarColorTemp } from "./utils/stem-features";
import type { StemSectionType } from "./utils/stem-features";
import { getSectionVocabulary } from "./utils/section-vocabulary";
import { detectGroove, grooveModifiers } from "./utils/groove-detector";
import { detectJamCycle } from "./utils/jam-cycles";
import { computeNarrativeDirective } from "./utils/visual-narrator";
import { endScreenOverlayMult } from "./utils/end-screen-zones";
import { getVenueProfile } from "./utils/venue-profiles";
import { deriveChromaPalette } from "./utils/chroma-palette";
import { NowPlaying } from "./components/NowPlaying";
import { SongPositionIndicator } from "./components/SongPositionIndicator";
import { JamTimer } from "./components/JamTimer";
import { UpNextTeaser } from "./components/UpNextTeaser";
import { computeHarmonicResponse } from "./utils/harmonic-response";
import { detectModalColor } from "./utils/modal-color";
import { computeFatigueDampening } from "./utils/visual-fatigue";
import { detectStemInterplay } from "./utils/stem-interplay";
import { detectPhrase } from "./utils/phrase-detector";
import { detectPeakOfShow } from "./utils/peak-of-show";
import { computeTempoLock } from "./utils/tempo-lock";
import type { PrecomputedNarrative, PrevSongContext } from "./utils/show-narrative-precompute";
import { computeAfterJamQuality } from "./utils/after-jam-quality";
import { computeCrowdEnergy } from "./utils/crowd-energy";
import { IntroQuote } from "./components/IntroQuote";
import { LyricFragment } from "./components/LyricFragment";
import { WaveformOverlay } from "./components/WaveformOverlay";
import { GuitarStrings } from "./components/GuitarStrings";
import { MeshDeformationGrid } from "./components/MeshDeformationGrid";
import { computeStemCharacter } from "./utils/stem-character";

// Extracted sub-components
import { SongArtLayer } from "./components/song-visualizer/SongArtLayer";
import { DynamicOverlayStack } from "./components/song-visualizer/DynamicOverlayStack";
import { SpecialPropsLayer } from "./components/song-visualizer/SpecialPropsLayer";
import { AudioLayer } from "./components/song-visualizer/AudioLayer";
import {
  songStatsData,
  milestonesMap,
  narrationData,
  fanReviewsData,
  mediaCatalog,
} from "./components/song-visualizer/show-data-loader";

const FADE_FRAMES = 90; // 3 seconds at 30fps

/** Apply climax density multiplier to overlay opacities (skips always-active) */
function applyDensityMult(
  opacities: Record<string, number>,
  mult: number,
  schedule: RotationSchedule,
): Record<string, number> {
  if (mult === 1) return opacities;
  const alwaysSet = new Set(schedule.alwaysActive);
  const result: Record<string, number> = {};
  for (const [name, opacity] of Object.entries(opacities)) {
    result[name] = alwaysSet.has(name) ? opacity : opacity * mult;
  }
  return result;
}

export interface SongVisualizerProps {
  analysis?: TrackAnalysis;
  meta?: TrackAnalysis["meta"];
  frames?: TrackAnalysis["frames"];
  song: SetlistEntry;
  activeOverlays?: string[];
  energyHints?: Record<string, OverlayPhaseHint>;
  show?: ShowSetlist;
  segueIn?: boolean;
  segueOut?: boolean;
  segueFromPalette?: ColorPalette;
  segueToPalette?: ColorPalette;
  /** Visual mode of the previous song (for segue crossfade) */
  segueFromMode?: VisualMode;
  /** Visual mode of the next song (for segue crossfade) */
  segueToMode?: VisualMode;
  /** Pre-computed cross-song narrative state (from Root.tsx module scope) */
  narrativeState?: PrecomputedNarrative;
}

export const SongVisualizer: React.FC<SongVisualizerProps> = (props) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  // ─── Show narrative arc (cross-song state) ───
  // Precomputed narrative from Root.tsx takes priority (works in both Studio and CLI).
  // Falls back to live context provider if available (future Remotion Studio wrapper).
  const liveNarrative = useShowNarrative();
  const narrative = useMemo(() => {
    if (props.narrativeState) {
      return {
        state: {
          ...props.narrativeState,
          // Fields expected by downstream but not tracked in precompute
          usedOverlayIds: new Set(props.narrativeState.predictedOverlayIds ?? []),
          showArcPhase: undefined,
        },
        actions: { recordSong: () => {} },
      };
    }
    return liveNarrative;
  }, [props.narrativeState, liveNarrative]);

  // ─── Data loading & analysis ───
  const analysis = loadAnalysis(props as unknown as Record<string, unknown>);

  const activeSet = useMemo(
    () => props.activeOverlays ? new Set(props.activeOverlays) : null,
    [props.activeOverlays],
  );

  const activeEntries = useMemo(() => {
    const entries = Object.entries(OVERLAY_COMPONENTS);
    if (!activeSet) return entries.slice(0, 50);
    return entries.filter(([name]) => activeSet.has(name));
  }, [activeSet]);

  const showSeed = useMemo(
    () => props.show ? getShowSeed(props.show) : undefined,
    [props.show],
  );

  const isDrumsSpace = useMemo(
    () => isJamSegmentTitle(props.song.title),
    [props.song.title],
  );

  const comesFromDrumsSpace = useMemo(() => {
    if (!props.show || !props.segueIn) return false;
    const songs = props.show.songs;
    const idx = songs.findIndex((s) => s.trackId === props.song.trackId);
    if (idx <= 0) return false;
    return isJamSegmentTitle(songs[idx - 1].title);
  }, [props.show, props.segueIn, props.song.trackId]);

  const energyCalibration = useMemo(
    () => analysis ? calibrateEnergy(analysis.frames) : undefined,
    [analysis],
  );

  // ─── Song identity (curated → auto-generated from audio analysis) ───
  const songIdentity = useMemo(
    () =>
      analysis?.frames?.length && analysis?.meta
        ? getOrGenerateSongIdentity(props.song.trackId, props.song.title, analysis.meta, analysis.frames)
        : lookupSongIdentity(props.song.title),
    [props.song.trackId, props.song.title, analysis],
  );

  // ─── Effective palette (setlist > curated identity > chroma-derived) ───
  const effectivePalette = useMemo((): ColorPalette | undefined => {
    if (props.song.palette) return props.song.palette;
    if (songIdentity?.palette) return songIdentity.palette;
    if (analysis?.frames?.length) return deriveChromaPalette(analysis.frames);
    return undefined;
  }, [props.song.palette, songIdentity, analysis]);

  // ─── Show arc phase ───
  const showArcPhase = useMemo((): ShowArcPhase | undefined => {
    if (!props.show) return undefined;
    const songsInSet = props.show.songs.filter((s) => s.set === props.song.set).length;
    const trackNumber = props.song.trackNumber ?? 1;
    return computeShowArcPhase({
      setNumber: props.song.set,
      trackNumber,
      songsInSet,
      totalSongs: props.show.songs.length,
      songsCompleted: narrative?.state.songsCompleted ?? 0,
      isJamSegment: isDrumsSpace,
      postJamSegmentCount: narrative?.state.postDrumsSpaceCount ?? 0,
    });
  }, [props.show, props.song.set, props.song.trackNumber, isDrumsSpace, narrative?.state?.songsCompleted, narrative?.state?.postDrumsSpaceCount]);

  const tourModifiers = useMemo(
    () => computeTourModifiers({
      nightInRun: props.show?.nightInRun,
      totalNights: props.show?.totalNights,
      daysOff: props.show?.daysOff,
    }),
    [props.show?.nightInRun, props.show?.totalNights, props.show?.daysOff],
  );

  const setTheme = useMemo(
    () => getSetTheme(props.song.set),
    [props.song.set],
  );

  const showArcModifiers = useMemo(
    () => showArcPhase ? applyTourModifiers(applySetModifiers(getShowArcModifiers(showArcPhase), setTheme), tourModifiers) : undefined,
    [showArcPhase, setTheme, tourModifiers],
  );

  // ─── Suite continuity (multi-song suites like Help>Slip>Frank) ───
  const suiteInfo = props.narrativeState?.suiteInfo ?? null;
  const isInSuiteMiddle = suiteInfo?.inSuite && !suiteInfo.isSuiteStart;

  // ─── Sacred segue detection ───
  const isSacredSegueIn = useMemo(() => {
    if (!props.segueIn || !props.show) return false;
    const songs = props.show.songs;
    const idx = songs.findIndex((s) => s.trackId === props.song.trackId);
    if (idx <= 0) return false;
    return isSacredSegue(songs[idx - 1].title, props.song.title);
  }, [props.segueIn, props.show, props.song.trackId, props.song.title]);

  const isSacredSegueOut = useMemo(() => {
    if (!props.segueOut || !props.show) return false;
    const songs = props.show.songs;
    const idx = songs.findIndex((s) => s.trackId === props.song.trackId);
    if (idx < 0 || idx >= songs.length - 1) return false;
    return isSacredSegue(props.song.title, songs[idx + 1].title);
  }, [props.segueOut, props.show, props.song.trackId, props.song.title]);

  // ─── Dominant stem section (sampled every 30th frame for perf) ───
  const dominantStemSection = useMemo((): StemSectionType | undefined => {
    if (!analysis?.frames) return undefined;
    const counts: Record<string, number> = {};
    const ba = buildBeatArray(analysis.frames);
    const t = analysis.meta?.tempo ?? 120;
    for (let i = 0; i < analysis.frames.length; i += 30) {
      const section = classifyStemSection(computeAudioSnapshot(analysis.frames, i, ba, 30, t));
      counts[section] = (counts[section] ?? 0) + 1;
    }
    const sorted = Object.entries(counts).filter(([k]) => k !== "quiet").sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] as StemSectionType | undefined;
  }, [analysis?.frames, analysis?.meta?.tempo]);

  // ─── Overlay scheduling ───
  const rotationSchedule = useMemo(() => {
    if (!props.activeOverlays || !analysis) return null;
    const sects = getSections(analysis);
    return buildRotationSchedule(props.activeOverlays, sects, props.song.trackId, showSeed, analysis?.frames, isDrumsSpace, props.energyHints, props.show?.era, props.song.defaultMode, songIdentity, showArcModifiers, undefined, dominantStemSection, narrative?.state.songsCompleted);
  }, [props.activeOverlays, analysis, props.song.trackId, showSeed, isDrumsSpace, props.energyHints, props.show?.era, props.song.defaultMode, songIdentity, showArcModifiers, dominantStemSection, narrative?.state.songsCompleted]);

  const opacityMapBase = rotationSchedule
    ? getOverlayOpacities(frame, rotationSchedule, analysis?.frames, energyCalibration)
    : null;

  // ─── Palette hue rotation ───
  const hueRotation = useMemo(() => {
    return computeSegueHueRotation(
      effectivePalette,
      !!props.segueIn, !!props.segueOut,
      props.segueFromPalette, props.segueToPalette,
      frame, durationInFrames, FADE_FRAMES,
    );
  }, [effectivePalette, props.segueIn, props.segueOut, props.segueFromPalette, props.segueToPalette, frame, durationInFrames]);

  // ─── Media resolution ───
  const resolvedMedia = useMemo(() => {
    if (!mediaCatalog) return null;
    return resolveMediaForSong(props.song.title, mediaCatalog, showSeed ?? 0, props.song.trackId);
  }, [props.song.title, props.song.trackId, showSeed]);

  const variantArt = useMemo(() => {
    const base = props.song.songArt;
    const count = props.song.artVariantCount;
    if (!base || !count || count <= 0 || !showSeed) return null;
    const variantIdx = (showSeed % count) + 1;
    return base.replace(/\.png$/, `-v${variantIdx}.png`);
  }, [props.song.songArt, props.song.artVariantCount, showSeed]);

  const effectiveSongArt = variantArt ?? props.song.songArt ?? resolvedMedia?.songArt ?? undefined;

  // ─── Lyrics ───
  const alignmentWords = useMemo(
    () => loadAlignmentWords(props.song.trackId),
    [props.song.trackId],
  );

  const lyricTriggerWindows = useMemo(() => {
    return resolveLyricTriggers(props.song.title, alignmentWords, 30);
  }, [props.song.title, alignmentWords]);

  // ─── No-data fallback ───
  if (!analysis || analysis.frames.length === 0) {
    return (
      <div style={{ width, height, backgroundColor: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontFamily: "monospace", fontSize: 24 }}>
        No analysis data — run: pnpm analyze
      </div>
    );
  }

  // ─── Audio-reactive state (per-frame) ───
  const sections = getSections(analysis);
  const tempo = analysis?.meta?.tempo ?? 120;
  const f = analysis.frames;

  const crowdMoments = useMemo(() => detectCrowdMoments(f), [f]);
  const beatArray = useMemo(() => buildBeatArray(f), [f]);
  const frameIdx = Math.min(Math.max(0, frame), f.length - 1);
  const audioSnapshot = computeAudioSnapshot(f, frameIdx, beatArray, 30, tempo);

  // Stem-derived features (per-frame)
  const stemSection = classifyStemSection(audioSnapshot);
  const soloState = detectSolo(audioSnapshot);
  const vocalWarmth = computeVocalWarmth(audioSnapshot);
  const guitarColorTemp = computeGuitarColorTemp(audioSnapshot);
  const stemInterplay = detectStemInterplay(f, frameIdx);
  const phraseState = detectPhrase(f, frameIdx, tempo);
  const stemCharacter = computeStemCharacter(audioSnapshot);

  // Coherence detection — "IT" detector
  const coherenceState = computeCoherence(f, frameIdx);
  audioSnapshot.coherence = coherenceState.score;
  audioSnapshot.isLocked = coherenceState.isLocked;

  // IT visual response state machine (with show-level transcendence frequency gating)
  // Use peakOfShowFired=false as a proxy: if peak hasn't fired yet AND this is the
  // highest-energy song so far, allow transcendence override for the one magic moment
  const prevMaxPeakScore = Math.max(0, ...(props.narrativeState?.songPeakScores ?? []));
  const isPotentialPeakSong = !props.narrativeState?.peakOfShowFired
    && (narrative?.state.songsCompleted ?? 0) >= (props.show?.songs.length ?? 1) * 0.4;
  const itState = computeITResponse(f, frameIdx, {
    itLockCount: props.narrativeState?.itLockCount ?? 0,
    isPeakOfShow: !!isPotentialPeakSong,
    setNumber: props.song.set,
  });

  // Drums→Space phase detection
  const drumsSpaceState = isDrumsSpace ? computeDrumsSpacePhase(f, frameIdx, isDrumsSpace) : null;

  const climaxState = computeClimaxState(f, frame, sections, audioSnapshot.energy);
  const climaxMod = climaxModulation(climaxState, songIdentity?.climaxBehavior);
  const counterpoint = computeCounterpoint(f, frameIdx, climaxState.phase);

  const jamEvolution = useMemo(
    () => computeJamEvolution(f, frame, isDrumsSpace),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f, Math.floor(frame / 30), isDrumsSpace],
  );

  // Normalize densityMult (0.75-1.25) to shader-friendly 0-1 range (0.5 = neutral)
  const jamDensity = jamEvolution.isLongJam
    ? Math.max(0, Math.min(1, (jamEvolution.densityMult - 0.75) / 0.5))
    : 0.5;

  // Precompute jam phase boundaries + shader sequence (once per song, not per frame)
  const jamPhaseBoundaries = useMemo(
    () => getJamPhaseBoundaries(f, isDrumsSpace),
    [f, isDrumsSpace],
  );
  const jamPhaseShaders = useMemo(
    () => jamEvolution.isLongJam
      ? getJamPhaseSequence(showSeed ?? 0, songIdentity, props.song.defaultMode)
      : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jamEvolution.isLongJam, showSeed, songIdentity, props.song.defaultMode],
  );

  // ─── Section vocabulary + groove + jam cycles + narrative directive ───
  const currentSection = sections.find((s) => frameIdx >= s.frameStart && frameIdx < s.frameEnd);
  const sectionType = f[frameIdx]?.sectionType ?? currentSection?.label;
  const sectionVocab = getSectionVocabulary(sectionType);

  const groove = detectGroove(
    audioSnapshot.beatStability,
    audioSnapshot.drumOnset,
    audioSnapshot.energy,
    audioSnapshot.flatness,
  );
  const grooveMods = grooveModifiers(groove);
  const regularityStabilityMod = 0.85 + grooveMods.regularity * 0.30; // 0.85-1.15

  // Tempo-locked visual rhythms (gated by groove type)
  const tempoLock = computeTempoLock(
    audioSnapshot.musicalTime,
    groove.type,
    audioSnapshot.beatStability,
    audioSnapshot.energy,
  );

  const jamCycle = currentSection && (sectionType === "jam" || sectionType === "solo" || isDrumsSpace)
    ? detectJamCycle(f, frameIdx, currentSection.frameStart, currentSection.frameEnd)
    : null;

  // Set progress: how far through the current set are we?
  const totalSongsInSet = props.show?.songs.filter((s) => s.set === props.song.set).length ?? 1;
  const trackNumber = props.song.trackNumber ?? 1;
  const setProgress = Math.min(1, (trackNumber - 1 + frame / durationInFrames) / totalSongsInSet);

  const narrativeDirective = computeNarrativeDirective({
    setNumber: props.song.set,
    setProgress,
    sectionType,
    grooveType: groove.type,
    jamPhase: jamCycle?.phase,
    jamDeepening: jamCycle?.isDeepening,
    energy: audioSnapshot.energy,
    isDrumsSpace,
  });

  // ─── Harmonic response + modal coloring (per-frame) ───
  const harmonicResponse = computeHarmonicResponse(f, frameIdx, audioSnapshot);
  const modalColor = detectModalColor(f, frameIdx, sectionType);

  // End screen overlay dimming (last 20s)
  const endScreenMult = endScreenOverlayMult(frame, durationInFrames);

  const venueProfile = getVenueProfile(props.show?.venueType ?? "");

  // Crowd roar density spike: detect active roar moment, multiply density up to 1.5x for 30 frames
  let crowdDensityMult = 1;
  for (const cm of crowdMoments) {
    if (cm.type === "roar" && frame >= cm.frameStart && frame < cm.frameStart + 30) {
      crowdDensityMult = Math.max(crowdDensityMult, 1 + cm.avgIntensity * 0.5);
    }
  }

  // ─── Visual fatigue governor (cumulative show intensity tracking) ───
  const currentSongAvgEnergy = useMemo(() => {
    if (!f.length) return 0;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < f.length; i += 30) {
      sum += f[i].rms;
      count++;
    }
    return count > 0 ? sum / count : 0;
  }, [f]);

  const showMinutesElapsed = (narrative?.state.songsCompleted ?? 0) * 7;
  const isEncore = props.song.set >= 3;
  const fatigue = computeFatigueDampening({
    songPeakEnergies: narrative?.state.songPeakEnergies ?? [],
    currentSongAvgEnergy,
    showMinutesElapsed,
    songsCompleted: narrative?.state.songsCompleted ?? 0,
  }, isEncore);

  // ─── Crowd Energy Simulation (audience momentum across the show) ───
  const crowdEnergy = useMemo(
    () => computeCrowdEnergy(
      narrative?.state.songPeakEnergies ?? [],
      props.song.set,
      narrative?.state.songsCompleted ?? 0,
      currentSongAvgEnergy,
    ),
    [narrative?.state.songPeakEnergies, props.song.set, narrative?.state.songsCompleted, currentSongAvgEnergy],
  );

  // ─── After-Jam Silence Quality (intro atmosphere from previous song) ───
  const afterJamMods = useMemo(
    () => computeAfterJamQuality(props.narrativeState?.prevSongContext ?? null),
    [props.narrativeState?.prevSongContext],
  );

  // ─── Peak-of-Show Recognition (THE moment) ───
  const peakOfShow = detectPeakOfShow(
    f,
    frameIdx,
    props.narrativeState?.songPeakScores ?? [],
    props.narrativeState?.peakOfShowFired ?? false,
    narrative?.state.songsCompleted ?? 0,
    props.show?.songs.length ?? 0,
  );

  // Geometric mean protection: instead of a hard floor, use additive rescue.
  // This prevents 11 multipliers from collapsing to zero while allowing
  // genuine near-darkness in quiet passages. The floor is 0.03 (barely visible)
  // so silence is truly dark, but peaks can flood to 1.5+.
  const rawDensityMult = climaxMod.overlayDensityMult * (jamEvolution.isLongJam ? jamEvolution.densityMult : 1) * sectionVocab.overlayDensityMult * narrativeDirective.overlayDensityMult * endScreenMult * venueProfile.overlayDensityMult * crowdDensityMult * fatigue.densityMult * stemInterplay.densityMult * peakOfShow.densityMult * tempoLock.overlayBreathing * crowdEnergy.densityMult * stemCharacter.overlayDensityMult * (0.7 + 0.3 * narrativeDirective.abstractionLevel);
  // Additive rescue: if product collapsed below 0.10 due to stacked multipliers,
  // blend toward the average of the two strongest multipliers
  const combinedDensityMult = rawDensityMult < 0.10
    ? Math.max(0.03, rawDensityMult + (0.10 - rawDensityMult) * 0.5)
    : rawDensityMult;
  const opacityMap = opacityMapBase ? applyDensityMult(opacityMapBase, combinedDensityMult, rotationSchedule!) : null;

  // ─── Lyric trigger suppression ───
  const activeLyricTrigger = lyricTriggerWindows.find((w) => frame >= w.frameStart - 150 && frame < w.frameEnd + 120);
  const mediaSuppression = computeMediaSuppression(frame, activeLyricTrigger);

  const artSuppressionFactor = useMemo(
    () => computeArtSuppressionFactor(frame, activeLyricTrigger),
    [frame, activeLyricTrigger],
  );

  // ─── Visual focus system ───
  const focusState = computeVisualFocus(climaxState.phase, climaxState.intensity, frame);

  // Derive energy level hint for overlay hard cap
  const energyLevel: "quiet" | "mid" | "peak" = audioSnapshot.energy < 0.10 ? "quiet" : audioSnapshot.energy > 0.25 ? "peak" : "mid";

  // ─── Dead air detection: ambient visuals after music ends ───
  const musicEndFrame = useMemo(() => findMusicEnd(f, durationInFrames), [f, durationInFrames]);
  const DEAD_AIR_CROSSFADE = 90; // 3 seconds
  const deadAirFactor = musicEndFrame < durationInFrames && frame > musicEndFrame
    ? Math.min(1, (frame - musicEndFrame) / DEAD_AIR_CROSSFADE)
    : 0;
  const isDeadAir = deadAirFactor > 0.99;

  // ─── Intro factor: art-forward cold open for first ~20s ───
  // 0 = full intro suppression (art dominates), 1 = engine fully open.
  const INTRO_HOLD = 750;  // 25s at 30fps — art + text showcase
  const INTRO_RAMP = 270;  // 9s smooth ramp to full visuals
  // Suite middle songs skip intro hold (continuous flow within suite)
  // Segue-in songs get a mini intro: 3s crossfade breathing, then art showcase 5-15s
  const introFactor = props.segueIn
      ? (frame < 90 ? 1                                                                              // 0-3s: full shader (crossfade)
        : frame < 150 ? 1 - 0.85 * ((frame - 90) / 60)                                              // 3-5s: dim to 15%
        : frame < INTRO_HOLD - INTRO_RAMP ? 0.15                                                     // 5-16s: art showcase (shader subtle backdrop)
        : frame < INTRO_HOLD ? 0.15 + 0.85 * ((frame - (INTRO_HOLD - INTRO_RAMP)) / INTRO_RAMP)     // 16-25s: ramp back
        : 1)
    : isInSuiteMiddle ? 1
    : frame < INTRO_HOLD ? 0
      : frame < INTRO_HOLD + INTRO_RAMP ? (frame - INTRO_HOLD) / INTRO_RAMP
      : 1;

  // ─── Fade in/out ───
  // Start fade-out 1 frame before the end of analyzed audio to ensure visuals are fully
  // gone by the time audio ends (analysis rounds up via ceil, creating a +1 frame mismatch)
  const fadeIn = props.segueIn ? 1 : interpolate(frame, [0, FADE_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOutStart = durationInFrames - FADE_FRAMES - 1;
  const fadeOut = props.segueOut ? 1 : interpolate(frame, [fadeOutStart, durationInFrames - 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Progressive dim during dead air: after crossfade completes, fade toward near-black.
  // Non-segue songs get an extra "visual breath" — the last 60 frames (2s) fade deeper
  // than segue songs, creating a brief moment of darkness between songs for pacing contrast.
  const deadAirDim = isDeadAir
    ? Math.max(0.08, 1 - (frame - musicEndFrame - DEAD_AIR_CROSSFADE) / (durationInFrames - musicEndFrame - DEAD_AIR_CROSSFADE) * 0.92)
    : 1;
  // Visual breath at song ending: non-segue songs fade deeper in the last 2s
  const BREATH_FRAMES = 60;
  const breathFactor = !props.segueOut && frame > durationInFrames - BREATH_FRAMES
    ? Math.max(0.05, (durationInFrames - frame) / BREATH_FRAMES)
    : 1;
  const opacity = Math.min(fadeIn, fadeOut) * deadAirDim * breathFactor;

  // ─── Render ───
  return (
    <div style={{ width, height, position: "relative", overflow: "hidden", background: "#000" }}>
      <ShowNarrativeProvider totalSongs={props.show?.songs.length ?? 1} initialState={props.narrativeState ? { ...props.narrativeState, usedOverlayIds: new Set(props.narrativeState.predictedOverlayIds ?? []) } : undefined}>
      <ShowContextProvider show={props.show}>
      <AudioSnapshotProvider snapshot={audioSnapshot}>
      <HeroPermittedProvider permitted={narrativeDirective.heroPermitted}>
      <JamPhaseProvider value={{ phase: jamEvolution.isLongJam ? JAM_PHASE_INDEX[jamEvolution.phase] : -1, progress: jamEvolution.phaseProgress }}>
      <PeakOfShowProvider value={peakOfShow.intensity}>
      <VisualizerErrorBoundary>
      <div style={{ position: "absolute", inset: 0, opacity }}>
        <CameraMotion frames={f} jamEvolution={jamEvolution} bass={audioSnapshot.bass} cameraFreeze={counterpoint.cameraFreeze || itState.cameraLock || introFactor < 0.5} drumsSpacePhase={drumsSpaceState?.subPhase} fastEnergy={audioSnapshot.fastEnergy} vocalPresence={audioSnapshot.vocalPresence} isSolo={soloState.isSolo} soloIntensity={soloState.intensity} grooveMotionMult={grooveMods.motionMult * fatigue.motionMult * stemInterplay.motionMult * peakOfShow.motionMult * crowdEnergy.motionMult * narrativeDirective.motionMult * stemCharacter.motionMult} groovePulseMult={grooveMods.pulseMult * phraseState.zoomBreathing * tempoLock.zoomPulse * regularityStabilityMod} sectionDriftMult={sectionVocab.driftSpeedMult} cameraSteadiness={Math.max(0, Math.min(1, sectionVocab.cameraSteadiness + setTheme.cameraSteadinessOffset))} cameraDrama={climaxMod.cameraDrama} itSnapZoom={itState.snapZoom}>
        <EraGrade>
        <EnergyEnvelope snapshot={audioSnapshot} climaxMod={climaxMod} jamColorTemp={jamEvolution.isLongJam ? jamEvolution.colorTemperature : undefined} calibration={energyCalibration} counterpointSatMult={counterpoint.saturationMult} brightnessCounterpoint={counterpoint.brightnessCounterpoint} drumsSpacePhase={drumsSpaceState?.subPhase} showPhase={narrative?.state.showPhase} songIdentity={songIdentity} showArcModifiers={showArcModifiers} itLuminanceLift={itState.luminanceLift} itSaturationSurge={itState.saturationSurge} itVignettePull={itState.vignettePull} vocalWarmth={vocalWarmth} guitarColorTemp={guitarColorTemp} deadAirFactor={deadAirFactor} narrativeBrightness={narrativeDirective.brightnessOffset + sectionVocab.brightnessOffset + fatigue.brightnessOffset + phraseState.brightnessBreathing + peakOfShow.brightnessBoost + crowdEnergy.energyBaselineOffset} narrativeTemperature={narrativeDirective.temperature + grooveMods.temperatureShift + (grooveMods.regularity > 0.6 ? 0.05 : grooveMods.regularity < 0.3 ? -0.05 : 0)} introFactor={introFactor} isSolo={soloState.isSolo} soloIntensity={soloState.intensity} harmonicBrightness={harmonicResponse.brightnessOffset} harmonicSatMult={harmonicResponse.saturationMult} modalHueShift={modalColor.hueShift} modalSatOffset={modalColor.satOffset + fatigue.saturationOffset + phraseState.saturationBreathing + peakOfShow.saturationBoost} narrativeSatOffset={narrativeDirective.saturationOffset} stemCharacterHue={stemCharacter.hueShift} stemCharacterSat={stemCharacter.saturationMult} stemCharacterBright={stemCharacter.brightnessOffset} stemCharacterTemp={stemCharacter.temperature}>
          <div style={{ position: "absolute", inset: 0, opacity: focusState.shaderOpacity * (0.15 + 0.85 * introFactor) }}>
          <SilentErrorBoundary name="SceneRouter">
            {(() => {
              const climaxPhaseMap: Record<string, number> = { idle: 0, build: 1, climax: 2, sustain: 3, release: 4 };
              const sceneRouter = <SceneRouter frames={f} sections={sections} song={props.song} tempo={tempo} seed={showSeed} jamDensity={jamDensity} deadAirMode={deadAirFactor > 0 ? "cosmic_dust" : undefined} deadAirFactor={deadAirFactor > 0 ? deadAirFactor : undefined} era={props.show?.era} coherenceIsLocked={coherenceState.isLocked} drumsSpacePhase={drumsSpaceState?.subPhase} usedShaderModes={narrative?.state.usedShaderModes} shaderModeLastUsed={narrative?.state.shaderModeLastUsed} songIdentity={songIdentity} stemSection={stemSection} songDuration={analysis?.meta?.duration} palette={effectivePalette} segueIn={props.segueIn} isSacredSegueIn={isSacredSegueIn} isInSuiteMiddle={!!isInSuiteMiddle} setNumber={props.song.set} jamEvolution={jamEvolution} jamPhaseBoundaries={jamPhaseBoundaries} jamCycle={jamCycle} jamPhaseShaders={jamPhaseShaders} climaxPhase={climaxPhaseMap[climaxState.phase] ?? 0} trackNumber={props.song.trackNumber ?? 1} stemInterplayMode={stemInterplay.mode} />;
              const palette = effectivePalette;

              // Segue IN crossfade: smooth dual-render dissolve from previous song's shader
              // Sacred segues get 50% longer crossfade for organic palette transition
              const segueInFrames = isSacredSegueIn ? Math.round(FADE_FRAMES * 1.5) : FADE_FRAMES;
              if (props.segueIn && props.segueFromMode && props.segueFromMode !== props.song.defaultMode && frame < segueInFrames) {
                const progress = frame / segueInFrames;
                const segueStyle = songIdentity?.transitionIn ?? (isSacredSegueIn ? "morph" : "dissolve");
                return (
                  <SegueCrossfade
                    progress={progress}
                    outgoing={renderScene(props.segueFromMode, { frames: f, sections, palette: props.segueFromPalette ?? palette, tempo, jamDensity })}
                    incoming={sceneRouter}
                    style={segueStyle}
                  />
                );
              }

              // Segue OUT crossfade: smooth dual-render dissolve into next song's shader
              const segueOutFrames = isSacredSegueOut ? Math.round(FADE_FRAMES * 1.5) : FADE_FRAMES;
              if (props.segueOut && props.segueToMode && props.segueToMode !== props.song.defaultMode && frame > durationInFrames - segueOutFrames) {
                const progress = (frame - (durationInFrames - segueOutFrames)) / segueOutFrames;
                const segueStyle = songIdentity?.transitionOut ?? (isSacredSegueOut ? "morph" : "dissolve");
                return (
                  <SegueCrossfade
                    progress={progress}
                    outgoing={sceneRouter}
                    incoming={renderScene(props.segueToMode, { frames: f, sections, palette: props.segueToPalette ?? palette, tempo, jamDensity })}
                    style={segueStyle}
                  />
                );
              }

              return sceneRouter;
            })()}
          </SilentErrorBoundary>
          </div>

          {introFactor > 0.5 && !isDeadAir && (
            <SilentErrorBoundary name="MeshDeformationGrid">
              <MeshDeformationGrid
                frames={f}
                sections={sections}
                palette={effectivePalette}
                tempo={tempo}
                opacity={focusState.shaderOpacity * introFactor * (0.3 + audioSnapshot.energy * 0.7)}
              />
            </SilentErrorBoundary>
          )}

          {effectiveSongArt && (
            <SilentErrorBoundary name="SongArt">
              <SongArtLayer src={staticFile(effectiveSongArt)} suppressionFactor={Math.max(artSuppressionFactor, 1 - introFactor)} hueRotation={hueRotation} energy={audioSnapshot.energy} climaxIntensity={climaxState.intensity} focusOpacity={focusState.artOpacity} segueIn={props.segueIn} artBlendMode={props.song.artBlendMode} introFactor={introFactor} deadAirFactor={deadAirFactor} />
            </SilentErrorBoundary>
          )}

          {lyricTriggerWindows.length > 0 && (
            <SilentErrorBoundary name="LyricTrigger">
              <LyricTriggerLayer windows={lyricTriggerWindows} />
            </SilentErrorBoundary>
          )}

          <DynamicOverlayStack
            activeEntries={activeEntries}
            opacityMap={opacityMap}
            mediaSuppression={Math.max(mediaSuppression * (1 - deadAirFactor), 1 - introFactor)}
            hueRotation={hueRotation}
            tempo={tempo}
            palette={effectivePalette}
            usedOverlayIds={narrative?.state.usedOverlayIds}
            frames={f}
            focusSuppression={focusState.overlayOpacity}
            energyLevel={energyLevel}
            itOverlayOverride={itState.overlayOpacityOverride}
            counterpointOverlayInversion={counterpoint.overlayInversion}
            climaxDesaturation={climaxState.phase === "climax" ? climaxState.intensity : climaxState.phase === "sustain" ? climaxState.intensity * 0.6 : 0}
          />

          {!isDeadAir && introFactor > 0.5 && (
            <SilentErrorBoundary name="WaveformOverlay">
              <SongPaletteProvider palette={effectivePalette}>
                <WaveformOverlay frames={f} />
              </SongPaletteProvider>
            </SilentErrorBoundary>
          )}

          {!isDeadAir && introFactor > 0.5 && (
            <SilentErrorBoundary name="GuitarStrings">
              <GuitarStrings frames={f} />
            </SilentErrorBoundary>
          )}

          {crowdMoments.length > 0 && (
            <SilentErrorBoundary name="CrowdOverlay">
              <SongPaletteProvider palette={effectivePalette}>
                <CrowdOverlay moments={crowdMoments} />
              </SongPaletteProvider>
            </SilentErrorBoundary>
          )}

          {/* IT flash — chromatic burst on coherence break */}
          {itState.flashIntensity > 0.01 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: itState.flashHue > 0
                  ? `hsla(${itState.flashHue}, 80%, 85%, ${itState.flashIntensity})`
                  : `rgba(255, 255, 255, ${itState.flashIntensity})`,
                pointerEvents: "none",
                mixBlendMode: "screen",
              }}
            />
          )}

          {/* IT strobe — beat-synced pulse during deep coherence lock.
              Uses soft-light blend (gentler than overlay) to avoid harsh white flashes. */}
          {itState.strobeIntensity > 0.01 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: `rgba(255, 255, 255, ${itState.strobeIntensity.toFixed(3)})`,
                pointerEvents: "none",
                mixBlendMode: "soft-light",
              }}
            />
          )}

          {/* Dead air ambient shimmer — audio-reactive glow when music ends */}
          {deadAirFactor > 0.01 && (() => {
            const deadRms = audioSnapshot.energy;
            const deadOnset = audioSnapshot.onsetEnvelope;
            const deadBass = audioSnapshot.bass;

            // Crowd roar → brighter shimmer
            const shimmerAlpha = (0.10 + deadRms * 0.25) * deadAirFactor;
            // Applause onset → warm color flash
            const warmShift = deadOnset > 0.3 ? deadOnset * 40 : 0;
            // Palette-tinted dead air: use song's primary hue for continuity
            const palHue = effectivePalette?.primary ?? 30;
            const palAngle = (palHue / 360) * Math.PI * 2;
            const baseR = Math.round(128 + 60 * Math.cos(palAngle));
            const baseG = Math.round(100 + 40 * Math.cos(palAngle - 2.1));
            const baseB = Math.round(100 + 60 * Math.sin(palAngle));
            const r = Math.min(255, baseR + Math.round(warmShift * 2.0));
            const g = Math.min(255, baseG + Math.round(warmShift * 0.8));
            const b = Math.max(40, baseB - Math.round(warmShift * 1.0));
            // Bass content → wider glow
            const spread = 55 + deadBass * 25;
            // Time-based drift (keep organic feel)
            const cx = 50 + Math.sin(frame * 0.007) * (10 + deadRms * 8);
            const cy = 50 + Math.cos(frame * 0.005) * (8 + deadBass * 5);

            return (
              <div style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                background: `radial-gradient(ellipse at ${cx}% ${cy}%, rgba(${r}, ${g}, ${b}, ${shimmerAlpha.toFixed(3)}), transparent ${spread.toFixed(0)}%)`,
                mixBlendMode: "screen",
                opacity: 0.6 + 0.4 * Math.sin(frame * 0.02) + deadRms * 0.15,
              }} />
            );
          })()}

          {/* Intro ambient shimmer — atmosphere colored by what just happened */}
          {introFactor < 0.5 && !props.segueIn && (() => {
            const sc = afterJamMods.shimmerColor ?? { r: 120, g: 80, b: 60 };
            const speed = afterJamMods.shimmerSpeed;
            // Blend after-jam color with upcoming song's palette for continuity bridge
            const nextPalHue = effectivePalette?.primary ?? 30;
            const blendProgress = Math.max(0, Math.min(1, frame / 300)); // blend over 10s
            const nextAngle = (nextPalHue / 360) * Math.PI * 2;
            const nr = Math.round(100 + 50 * Math.cos(nextAngle));
            const ng = Math.round(80 + 40 * Math.cos(nextAngle - 2.1));
            const nb = Math.round(90 + 50 * Math.sin(nextAngle));
            const br = Math.round(sc.r * (1 - blendProgress) + nr * blendProgress);
            const bg = Math.round(sc.g * (1 - blendProgress) + ng * blendProgress);
            const bb = Math.round(sc.b * (1 - blendProgress) + nb * blendProgress);
            return (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background: `radial-gradient(ellipse at ${50 + Math.sin(frame * 0.003 * speed) * 15}% ${55 + Math.cos(frame * 0.004 * speed) * 10}%, rgba(${br}, ${bg}, ${bb}, 0.12), transparent 60%)`,
                  mixBlendMode: "screen",
                  opacity: (0.6 + 0.3 * Math.sin(frame * 0.015 * speed)) * (1 - introFactor * 2),
                }}
              />
            );
          })()}

          {/* IntroQuote — meditative band quote during intro hold */}
          {introFactor < 0.8 && showSeed !== undefined && (
            <SilentErrorBoundary name="IntroQuote">
              <IntroQuote
                showSeed={showSeed}
                trackNumber={props.song.trackNumber ?? 1}
                segueIn={props.segueIn}
                isFirstSong={(props.song.trackNumber ?? 1) === 1 && props.song.set === 1}
              />
            </SilentErrorBoundary>
          )}

          {/* Lyric fragments — visual poetry at emotional peaks */}
          {!isDeadAir && showSeed !== undefined && introFactor > 0.8 && (
            <SilentErrorBoundary name="LyricFragment">
              <LyricFragment
                showSeed={showSeed}
                trackId={props.song.trackId}
                climaxPhase={climaxState.phase}
                energy={audioSnapshot.energy}
                isLocked={coherenceState.isLocked}
                isDrumsSpace={isDrumsSpace}
                isSegue={!!props.segueIn && frame < FADE_FRAMES}
                introFactor={introFactor}
              />
            </SilentErrorBoundary>
          )}

          {!isDeadAir && <ConcertInfo />}
          {!isDeadAir && <SetlistScroll frames={f} currentSong={props.song.title} introFactor={introFactor} />}

          <SpecialPropsLayer
            songTitle={props.song.title}
            setNumber={props.song.set}
            trackNumber={props.song.trackNumber}
            trackId={props.song.trackId}
            isSegue={!!(props.segueIn && !comesFromDrumsSpace)}
            energy={audioSnapshot.energy}
            palette={effectivePalette}
            songStats={songStatsData}
            milestonesMap={milestonesMap}
            narrationData={narrationData}
            fanReviews={fanReviewsData}
            showSeed={showSeed}
            suppressIntro={isSacredSegueIn}
          />

          {/* Show context overlays */}
          {!isDeadAir && props.show && (
            <SilentErrorBoundary name="SongPosition">
              <SongPositionIndicator
                setNumber={props.song.set}
                trackNumber={props.song.trackNumber ?? 1}
                totalSongsInSet={totalSongsInSet}
              />
            </SilentErrorBoundary>
          )}

          {!isDeadAir && currentSection && (sectionType === "jam" || sectionType === "solo") && (
            <SilentErrorBoundary name="JamTimer">
              <JamTimer
                sectionStartFrame={currentSection.frameStart}
                sectionDurationFrames={currentSection.frameEnd - currentSection.frameStart}
                energy={audioSnapshot.energy}
              />
            </SilentErrorBoundary>
          )}

          {!isDeadAir && (() => {
            // Find the next song for UpNextTeaser
            if (!props.show) return null;
            const songs = props.show.songs;
            const idx = songs.findIndex((s) => s.trackId === props.song.trackId);
            const nextSong = idx >= 0 && idx < songs.length - 1 ? songs[idx + 1] : null;
            const isLastInSet = !nextSong || nextSong.set !== props.song.set;
            if (!nextSong || isLastInSet) return null;
            return (
              <SilentErrorBoundary name="UpNextTeaser">
                <UpNextTeaser
                  nextSongTitle={nextSong.title}
                  isSegue={!!props.segueOut}
                  isLastInSet={isLastInSet}
                />
              </SilentErrorBoundary>
            );
          })()}

          {!isDeadAir && (
            <SilentErrorBoundary name="NowPlaying">
              <NowPlaying
                title={props.song.title}
                artist="Grateful Dead"
                energy={audioSnapshot.energy}
                isSacredSegue={isSacredSegueIn}
              />
            </SilentErrorBoundary>
          )}
        </EnergyEnvelope>
        </EraGrade>
        </CameraMotion>
      </div>
      </VisualizerErrorBoundary>
      </PeakOfShowProvider>
      </JamPhaseProvider>
      </HeroPermittedProvider>

      <AudioLayer
        audioFile={props.song.audioFile}
        snapshot={audioSnapshot}
        isDrumsSpace={isDrumsSpace}
      />
      </AudioSnapshotProvider>
      </ShowContextProvider>
      </ShowNarrativeProvider>
    </div>
  );
};
