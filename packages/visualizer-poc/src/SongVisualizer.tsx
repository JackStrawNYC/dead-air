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
 *   ├─ SongArtLayer (poster with Ken Burns)
 *   ├─ SceneVideoLayer (atmospheric AI videos)
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
import { SceneVideoLayer, computeMediaWindows } from "./components/SceneVideoLayer";
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
import { useShowNarrative } from "./data/ShowNarrativeContext";
import { calibrateEnergy } from "./utils/energy";
import { AudioSnapshotProvider } from "./data/AudioSnapshotContext";
import { computeJamEvolution } from "./utils/jam-evolution";
import { computeMediaSuppression, computeArtSuppressionFactor } from "./utils/media-suppression";
import { computeSegueHueRotation } from "./utils/segue-blend";
import { detectCrowdMoments } from "./data/crowd-detector";
import { CrowdOverlay } from "./components/CrowdOverlay";
import { CameraMotion } from "./components/CameraMotion";
import { computeVisualFocus } from "./utils/visual-focus";
import { findMusicEnd } from "./utils/music-end";
import { computeCounterpoint } from "./utils/visual-counterpoint";
import { lookupSongIdentity } from "./data/song-identities";
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
          usedOverlayIds: new Set<string>(),
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

  // ─── Song identity ───
  const songIdentity = useMemo(
    () => lookupSongIdentity(props.song.title),
    [props.song.title],
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
    return buildRotationSchedule(props.activeOverlays, sects, props.song.trackId, showSeed, analysis?.frames, isDrumsSpace, props.energyHints, props.show?.era, props.song.defaultMode, songIdentity, showArcModifiers, undefined, dominantStemSection);
  }, [props.activeOverlays, analysis, props.song.trackId, showSeed, isDrumsSpace, props.energyHints, props.show?.era, props.song.defaultMode, songIdentity, showArcModifiers, dominantStemSection]);

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
  const effectiveMedia = (props.song.sceneVideos?.length) ? undefined : resolvedMedia?.media;
  const effectiveLegacyVideos = (props.song.sceneVideos?.length) ? props.song.sceneVideos : undefined;

  // ─── Lyrics ───
  const alignmentWords = useMemo(
    () => loadAlignmentWords(props.song.trackId),
    [props.song.trackId],
  );

  const lyricTriggerWindows = useMemo(() => {
    return resolveLyricTriggers(props.song.title, alignmentWords, 30);
  }, [props.song.title, alignmentWords]);

  const triggerSuppressedRanges = useMemo(
    () => lyricTriggerWindows.map((w) => ({ start: w.frameStart, end: w.frameEnd })),
    [lyricTriggerWindows],
  );

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

  // Coherence detection — "IT" detector
  const coherenceState = computeCoherence(f, frameIdx);
  audioSnapshot.coherence = coherenceState.score;
  audioSnapshot.isLocked = coherenceState.isLocked;

  // IT visual response state machine
  const itState = computeITResponse(f, frameIdx);

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

  // Floor raised from 0.15 → 0.25 to prevent multiplicative stacking from making
  // overlays invisible. Worst case: drums_space(0.3) × space(0.25) × narrative(0.3)
  // × fatigue(0.65) = 0.015 — without the floor this kills all overlay visibility.
  const combinedDensityMult = Math.max(0.25, climaxMod.overlayDensityMult * (jamEvolution.isLongJam ? jamEvolution.densityMult : 1) * sectionVocab.overlayDensityMult * narrativeDirective.overlayDensityMult * endScreenMult * venueProfile.overlayDensityMult * crowdDensityMult * fatigue.densityMult * stemInterplay.densityMult * peakOfShow.densityMult * tempoLock.overlayBreathing * crowdEnergy.densityMult);
  const opacityMap = opacityMapBase ? applyDensityMult(opacityMapBase, combinedDensityMult, rotationSchedule!) : null;

  // ─── Media suppression ───
  const mediaWindows = useMemo(
    () => computeMediaWindows(effectiveLegacyVideos, effectiveMedia, sections, f, props.song.trackId, showSeed),
    [effectiveLegacyVideos, effectiveMedia, sections, f, props.song.trackId, showSeed],
  );
  const activeMediaWindow = mediaWindows.find((w) => frame >= w.frameStart - 150 && frame < w.frameEnd + 150);
  const activeLyricTrigger = lyricTriggerWindows.find((w) => frame >= w.frameStart - 150 && frame < w.frameEnd + 120);
  const mediaSuppression = computeMediaSuppression(frame, activeMediaWindow, activeLyricTrigger);

  const SUPPRESS_FADE = 90;
  const artSuppressionFactor = useMemo(
    () => computeArtSuppressionFactor(frame, activeMediaWindow, activeLyricTrigger, SUPPRESS_FADE),
    [frame, activeMediaWindow, activeLyricTrigger],
  );

  // ─── Visual focus system ───
  const isVideoActive = !!activeMediaWindow && frame >= activeMediaWindow.frameStart && frame < activeMediaWindow.frameEnd;
  const focusState = computeVisualFocus(climaxState.phase, climaxState.intensity, isVideoActive, frame);

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
  // Segues skip this (previous song's visuals are already running).
  // 0 = full intro suppression, 1 = engine fully open.
  const INTRO_HOLD = 600;  // 20s at 30fps — art + text showcase
  const INTRO_RAMP = 150;  // 5s smooth ramp to full visuals
  // Suite middle songs skip intro hold (continuous flow within suite)
  const introFactor = (props.segueIn || isInSuiteMiddle) ? 1
    : frame < INTRO_HOLD ? 0
    : frame < INTRO_HOLD + INTRO_RAMP ? (frame - INTRO_HOLD) / INTRO_RAMP
    : 1;

  // ─── Fade in/out ───
  // Start fade-out 1 frame before the end of analyzed audio to ensure visuals are fully
  // gone by the time audio ends (analysis rounds up via ceil, creating a +1 frame mismatch)
  const fadeIn = props.segueIn ? 1 : interpolate(frame, [0, FADE_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOutStart = durationInFrames - FADE_FRAMES - 1;
  const fadeOut = props.segueOut ? 1 : interpolate(frame, [fadeOutStart, durationInFrames - 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Progressive dim during dead air: after crossfade completes, fade toward 20% over remaining applause
  const deadAirDim = isDeadAir
    ? Math.max(0.20, 1 - (frame - musicEndFrame - DEAD_AIR_CROSSFADE) / (durationInFrames - musicEndFrame - DEAD_AIR_CROSSFADE) * 0.80)
    : 1;
  const opacity = Math.min(fadeIn, fadeOut) * deadAirDim;

  // ─── Render ───
  return (
    <div style={{ width, height, position: "relative", overflow: "hidden", background: "#000" }}>
      <ShowContextProvider show={props.show}>
      <AudioSnapshotProvider snapshot={audioSnapshot}>
      <VisualizerErrorBoundary>
      <div style={{ position: "absolute", inset: 0, opacity }}>
        <CameraMotion frames={f} jamEvolution={jamEvolution} bass={audioSnapshot.bass} cameraFreeze={counterpoint.cameraFreeze || itState.cameraLock || introFactor < 0.5} drumsSpacePhase={drumsSpaceState?.subPhase} fastEnergy={audioSnapshot.fastEnergy} vocalPresence={audioSnapshot.vocalPresence} isSolo={soloState.isSolo} soloIntensity={soloState.intensity} grooveMotionMult={grooveMods.motionMult * fatigue.motionMult * stemInterplay.motionMult * peakOfShow.motionMult * crowdEnergy.motionMult} groovePulseMult={grooveMods.pulseMult * phraseState.zoomBreathing * tempoLock.zoomPulse} sectionDriftMult={sectionVocab.driftSpeedMult} cameraSteadiness={Math.max(0, Math.min(1, sectionVocab.cameraSteadiness + setTheme.cameraSteadinessOffset))}>
        <EraGrade>
        <EnergyEnvelope snapshot={audioSnapshot} climaxMod={climaxMod} jamColorTemp={jamEvolution.isLongJam ? jamEvolution.colorTemperature : undefined} calibration={energyCalibration} counterpointSatMult={counterpoint.saturationMult} brightnessCounterpoint={counterpoint.brightnessCounterpoint} drumsSpacePhase={drumsSpaceState?.subPhase} showPhase={narrative?.state.showPhase} songIdentity={songIdentity} showArcModifiers={showArcModifiers} itLuminanceLift={itState.luminanceLift} vocalWarmth={vocalWarmth} guitarColorTemp={guitarColorTemp} deadAirFactor={deadAirFactor} narrativeBrightness={narrativeDirective.brightnessOffset + sectionVocab.brightnessOffset + fatigue.brightnessOffset + phraseState.brightnessBreathing + peakOfShow.brightnessBoost + crowdEnergy.energyBaselineOffset} narrativeTemperature={narrativeDirective.temperature + grooveMods.temperatureShift} introFactor={introFactor} isSolo={soloState.isSolo} soloIntensity={soloState.intensity} harmonicBrightness={harmonicResponse.brightnessOffset} harmonicSatMult={harmonicResponse.saturationMult} modalHueShift={modalColor.hueShift} modalSatOffset={modalColor.satOffset + fatigue.saturationOffset + phraseState.saturationBreathing + peakOfShow.saturationBoost}>
          <div style={{ position: "absolute", inset: 0, opacity: focusState.shaderOpacity * (0.05 + 0.95 * introFactor) }}>
          <SilentErrorBoundary name="SceneRouter">
            {(() => {
              const sceneRouter = <SceneRouter frames={f} sections={sections} song={props.song} tempo={tempo} seed={showSeed} jamDensity={jamDensity} deadAirMode={deadAirFactor > 0 ? "cosmic_dust" : undefined} deadAirFactor={deadAirFactor > 0 ? deadAirFactor : undefined} era={props.show?.era} coherenceIsLocked={coherenceState.isLocked} drumsSpacePhase={drumsSpaceState?.subPhase} usedShaderModes={narrative?.state.usedShaderModes} songIdentity={songIdentity} stemSection={stemSection} songDuration={analysis?.meta?.duration} palette={effectivePalette} segueIn={props.segueIn} isSacredSegueIn={isSacredSegueIn} isInSuiteMiddle={!!isInSuiteMiddle} setNumber={props.song.set} />;
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

          {effectiveSongArt && (
            <SilentErrorBoundary name="SongArt">
              <SongArtLayer src={staticFile(effectiveSongArt)} suppressionFactor={Math.max(artSuppressionFactor, 1 - introFactor)} hueRotation={hueRotation} energy={audioSnapshot.energy} climaxIntensity={climaxState.intensity} focusOpacity={focusState.artOpacity} segueIn={props.segueIn} artBlendMode={props.song.artBlendMode} introFactor={introFactor} />
            </SilentErrorBoundary>
          )}

          {(effectiveLegacyVideos || effectiveMedia) && (
            <SilentErrorBoundary name="SceneVideos">
              <SceneVideoLayer videos={effectiveLegacyVideos} media={effectiveMedia} sections={sections} frames={f} trackId={props.song.trackId} showSeed={showSeed} hueRotation={hueRotation} suppressedRanges={triggerSuppressedRanges} climaxPhase={climaxState.phase} isLocked={coherenceState.isLocked} />
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
          />

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

          {/* Dead air ambient shimmer — ethereal glow when music ends */}
          {deadAirFactor > 0.01 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background: `radial-gradient(ellipse at ${50 + Math.sin(frame * 0.007) * 15}% ${50 + Math.cos(frame * 0.005) * 10}%, rgba(80, 60, 120, ${(0.15 * deadAirFactor).toFixed(3)}), transparent 70%)`,
                mixBlendMode: "screen",
                opacity: 0.6 + 0.4 * Math.sin(frame * 0.02),
              }}
            />
          )}

          {/* Intro ambient shimmer — atmosphere colored by what just happened */}
          {introFactor < 0.5 && !props.segueIn && (() => {
            const sc = afterJamMods.shimmerColor ?? { r: 120, g: 80, b: 60 };
            const speed = afterJamMods.shimmerSpeed;
            return (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background: `radial-gradient(ellipse at ${50 + Math.sin(frame * 0.003 * speed) * 12}% ${55 + Math.cos(frame * 0.004 * speed) * 8}%, rgba(${sc.r}, ${sc.g}, ${sc.b}, 0.08), transparent 65%)`,
                  mixBlendMode: "screen",
                  opacity: (0.5 + 0.3 * Math.sin(frame * 0.015 * speed)) * (1 - introFactor * 2),
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

      <AudioLayer
        audioFile={props.song.audioFile}
        snapshot={audioSnapshot}
        isDrumsSpace={isDrumsSpace}
      />
      </AudioSnapshotProvider>
      </ShowContextProvider>
    </div>
  );
};
