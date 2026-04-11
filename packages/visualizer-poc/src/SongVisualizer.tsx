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
 *   └─ AudioLayer (song audio + crowd ambience)
 */

import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { staticFile, useCurrentFrame, useVideoConfig, interpolate, delayRender, continueRender, Img } from "remotion";
import { SceneCrossfade } from "./scenes/SceneCrossfade";
import { OVERLAY_COMPONENTS } from "./data/overlay-components";
import { buildRotationSchedule } from "./data/overlay-rotation";
import { computeContinuousOverlays, type ContinuousOverlayConfig } from "./utils/continuous-overlay";
import { computeSemanticProfile, extractSemanticScores } from "./utils/semantic-router";
import { SELECTABLE_REGISTRY, ALWAYS_ACTIVE } from "./data/overlay-registry";
import { getEraPreset } from "./data/era-presets";
import { loadAnalysis, getSections } from "./data/analysis-loader";
import type { SetlistEntry, ShowSetlist, TrackAnalysis, ColorPalette, VisualMode } from "./data/types";
import type { OverlayPhaseHint } from "./data/types";
import { getShowSeed } from "./data/ShowContext";
import { VisualizerErrorBoundary } from "./components/VisualizerErrorBoundary";
import { SilentErrorBoundary } from "./components/SilentErrorBoundary";
import { LyricTriggerLayer } from "./components/LyricTriggerLayer";
import { resolveLyricTriggers, loadAlignmentWords } from "./data/lyric-trigger-resolver";
import { resolveMediaForSong } from "./data/media-resolver";
import { SongPaletteProvider } from "./data/SongPaletteContext";
import { EraGrade } from "./components/EraGrade";
import { getFilmStock } from "./utils/film-stock";
import { EnergyEnvelope } from "./components/EnergyEnvelope";
import { computeClimaxState, climaxModulation } from "./utils/climax-state";
import { computeAudioSnapshot, buildBeatArray } from "./utils/audio-reactive";
import { computeCoherence } from "./utils/coherence";
import { computeDrumsSpacePhase } from "./utils/drums-space-phase";
import { useShowNarrative } from "./data/ShowNarrativeContext";
import { calibrateEnergy } from "./utils/energy";
import { JAM_PHASE_INDEX } from "./utils/jam-evolution";
import { computeMediaSuppression, computeArtSuppressionFactor } from "./utils/media-suppression";
import { detectCrowdMoments } from "./data/crowd-detector";
import { CrowdOverlay } from "./components/CrowdOverlay";
import { CameraMotion } from "./components/CameraMotion";
import { computeVisualFocus } from "./utils/visual-focus";
import { findMusicEnd } from "./utils/music-end";
import { computeCounterpoint } from "./utils/visual-counterpoint";
import { lookupSongIdentity, getOrGenerateSongIdentity } from "./data/song-identities";
import { computeITResponse } from "./utils/it-response";
import { isJamSegmentTitle } from "./data/band-config";
import { classifyStemSection, detectSolo } from "./utils/stem-features";
import type { StemSectionType } from "./utils/stem-features";
import { getSectionVocabulary, composeSectionWithJamCycle } from "./utils/section-vocabulary";
import { detectGroove, grooveModifiers } from "./utils/groove-detector";
import { detectJamCycle } from "./utils/jam-cycles";
import { computeNarrativeDirective } from "./utils/visual-narrator";
import { endScreenOverlayMult } from "./utils/end-screen-zones";
import { getVenueProfile } from "./utils/venue-profiles";
import { deriveChromaPalette } from "./utils/chroma-palette";
import { SongPositionIndicator } from "./components/SongPositionIndicator";
import { JamTimer } from "./components/JamTimer";
import { UpNextTeaser } from "./components/UpNextTeaser";
// Visual fatigue, crowd energy, after-jam, tour position, set-theme, show-arc
// computations moved to useVisualModifiers hook
import { detectStemInterplay } from "./utils/stem-interplay";
import { detectPhrase } from "./utils/phrase-detector";
import { detectPeakOfShow } from "./utils/peak-of-show";
import { computeTempoLock } from "./utils/tempo-lock";
import type { PrecomputedNarrative } from "./utils/show-narrative-precompute";
import { computeStemCharacter } from "./utils/stem-character";
import { computeReactiveTriggers } from "./utils/reactive-triggers";
import { buildIconSchedule, getIconForFrame } from "./utils/icon-overlay-manager";

// Extracted sub-components
import { AudioLayer } from "./components/song-visualizer/AudioLayer";
import {
  mediaCatalog,
} from "./components/song-visualizer/show-data-loader";
import { VisualizerProviderStack } from "./components/song-visualizer/VisualizerProviderStack";
import { SceneRouterWithSegues } from "./components/song-visualizer/SceneRouterWithSegues";
import { OverlayAndEffectsLayer } from "./components/song-visualizer/OverlayAndEffectsLayer";
import { TextLayer } from "./components/song-visualizer/TextLayer";

// Extracted hooks
import { useJamEvolution } from "./hooks/useJamEvolution";
import { useSacredSegueState } from "./hooks/useSacredSegueState";
import { useVisualModifiers } from "./hooks/useVisualModifiers";

const FADE_FRAMES = 90; // 3 seconds at 30fps

/** Apply climax density multiplier to overlay opacities (skips always-active) */
function applyDensityMult(
  opacities: Record<string, number>,
  mult: number,
  alwaysActiveNames: string[],
): Record<string, number> {
  if (mult === 1) return opacities;
  const alwaysSet = new Set(alwaysActiveNames);
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
  const { width, height, durationInFrames, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  // Map render frame to analysis frame index (analysis is always at 30fps)
  const analysisFrameScale = 30 / fps; // 1.0 at 30fps, 0.5 at 60fps

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

  // ─── Effective palette (curated identity > setlist > chroma-derived) ───
  // Curated identities are hand-tuned for mood accuracy and take priority
  // over setlist palette overrides which may be generic.
  const effectivePalette = useMemo((): ColorPalette | undefined => {
    if (songIdentity?.palette) return songIdentity.palette;
    if (props.song.palette) return props.song.palette;
    if (analysis?.frames?.length) return deriveChromaPalette(analysis.frames, showSeed);
    return undefined;
  }, [props.song.palette, songIdentity, analysis, showSeed]);

  // ─── Icon overlay schedule (image-based Dead icons rendered through GLSL) ───
  const iconSchedule = useMemo(
    () => buildIconSchedule(songIdentity, durationInFrames, showSeed ?? 0, props.song.trackId),
    [songIdentity, durationInFrames, showSeed, props.song.trackId],
  );

  // Pre-load ALL icon textures at mount time using delayRender.
  // This blocks Remotion's frame capture until every texture is loaded,
  // so the GLSL overlay pass always has a texture ready.
  const iconTextureMap = useRef<Map<string, THREE.Texture>>(new Map());
  const [iconTexturesReady, setIconTexturesReady] = React.useState(false);

  useEffect(() => {
    const uniquePaths = [...new Set(iconSchedule)].filter(Boolean);
    if (uniquePaths.length === 0) {
      setIconTexturesReady(true);
      return;
    }

    const handle = delayRender("Loading icon overlay textures");
    let loaded = 0;
    let resolved = false;

    const resolve = () => {
      if (resolved) return;
      resolved = true;
      setIconTexturesReady(true);
      continueRender(handle);
    };

    const checkDone = () => {
      if (loaded >= uniquePaths.length) resolve();
    };

    // Safety timeout: if textures haven't loaded in 10 seconds, continue
    // without them. In headless Chrome on cloud GPUs, Image.onload can
    // hang indefinitely if the GPU is under memory pressure — this prevents
    // the delayRender timeout from killing the entire render.
    const safetyTimeout = setTimeout(() => {
      if (!resolved) {
        console.warn(`Icon texture timeout: only ${loaded}/${uniquePaths.length} loaded after 10s, continuing`);
        resolve();
      }
    }, 10_000);

    for (const iconPath of uniquePaths) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const tex = new THREE.Texture(img);
          tex.needsUpdate = true;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          iconTextureMap.current.set(iconPath, tex);
        } catch {
          // Texture creation failed — continue without it
        }
        loaded++;
        checkDone();
      };
      img.onerror = () => {
        loaded++;
        checkDone();
      };
      img.src = staticFile(iconPath);
    }

    return () => {
      clearTimeout(safetyTimeout);
      // Always resolve the delayRender handle on unmount — if we don't,
      // Remotion waits up to 5 minutes then kills the worker.
      if (!resolved) {
        resolved = true;
        continueRender(handle);
      }
      iconTextureMap.current.forEach((tex) => tex.dispose());
      iconTextureMap.current.clear();
    };
  }, [iconSchedule]);

  // ─── Show arc + tour + set + fatigue + crowd + after-jam modifiers (hook) ───
  const {
    showArcModifiers, setTheme,
    fatigue, crowdEnergy, afterJamMods,
  } = useVisualModifiers({
    show: props.show,
    songSet: props.song.set,
    songTrackNumber: props.song.trackNumber,
    isDrumsSpace,
    songsCompleted: narrative?.state.songsCompleted ?? 0,
    postDrumsSpaceCount: narrative?.state.postDrumsSpaceCount ?? 0,
    songPeakEnergies: narrative?.state.songPeakEnergies ?? [],
    prevSongContext: props.narrativeState?.prevSongContext ?? null,
    frames: analysis?.frames ?? [],
  });

  // ─── Sacred segue + suite continuity + hue rotation (hook) ───
  const {
    isSacredSegueIn, isSacredSegueOut, suiteInfo, isInSuiteMiddle,
    sacredSegueInTransition, sacredSegueOutTransition, hueRotation,
  } = useSacredSegueState({
    show: props.show,
    songTrackId: props.song.trackId,
    songTitle: props.song.title,
    segueIn: props.segueIn,
    segueOut: props.segueOut,
    segueFromPalette: props.segueFromPalette,
    segueToPalette: props.segueToPalette,
    effectivePalette,
    frame,
    durationInFrames,
    narrativeState: props.narrativeState,
  });

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

  // ─── Overlay scheduling (legacy — kept for rollback) ───
  const rotationSchedule = useMemo(() => {
    if (!props.activeOverlays || !analysis) return null;
    const sects = getSections(analysis);
    // Song hero: first overlay from overlayOverrides.include gets absolute priority
    const songHero = props.song.overlayOverrides?.include?.[0];
    return buildRotationSchedule(props.activeOverlays, sects, props.song.trackId, showSeed, analysis?.frames, isDrumsSpace, props.energyHints, props.show?.era, props.song.defaultMode, songIdentity, showArcModifiers, undefined, dominantStemSection, narrative?.state.songsCompleted, songHero, analysis?.meta?.tempo);
  }, [props.activeOverlays, analysis, props.song.trackId, showSeed, isDrumsSpace, props.energyHints, props.show?.era, props.song.defaultMode, songIdentity, showArcModifiers, dominantStemSection, narrative?.state.songsCompleted, props.song.overlayOverrides]);

  // Song-level semantic profile from CLAP scores. We average semantic fields
  // across the whole song (not just the middle frame) so the profile reflects
  // the song's character, not a momentary state. The shader pipeline does this
  // per-section in SceneRouter; for overlay POOL selection a song-wide read
  // is the right granularity — overlays are picked from a pool, not switched
  // mid-section. Receiving end is at overlay-scoring.ts:272-278.
  const songSemanticProfile = useMemo(() => {
    if (!analysis?.frames?.length) return undefined;
    const f = analysis.frames;
    // Sample every 30 frames (1/sec) for cheap aggregation
    let n = 0;
    let psy = 0, agg = 0, ten = 0, cos = 0, rhy = 0, amb = 0, cha = 0, tri = 0;
    for (let i = 0; i < f.length; i += 30) {
      psy += f[i].semantic_psychedelic ?? 0;
      agg += f[i].semantic_aggressive ?? 0;
      ten += f[i].semantic_tender ?? 0;
      cos += f[i].semantic_cosmic ?? 0;
      rhy += f[i].semantic_rhythmic ?? 0;
      amb += f[i].semantic_ambient ?? 0;
      cha += f[i].semantic_chaotic ?? 0;
      tri += f[i].semantic_triumphant ?? 0;
      n++;
    }
    if (n === 0) return undefined;
    const scores = extractSemanticScores({
      semanticPsychedelic: psy / n,
      semanticAggressive: agg / n,
      semanticTender: ten / n,
      semanticCosmic: cos / n,
      semanticRhythmic: rhy / n,
      semanticAmbient: amb / n,
      semanticChaotic: cha / n,
      semanticTriumphant: tri / n,
    });
    return scores ? computeSemanticProfile(scores) : undefined;
  }, [analysis]);

  // ─── Continuous overlay config (replaces window scheduling) ───
  const overlayConfig = useMemo((): ContinuousOverlayConfig | null => {
    if (!props.activeOverlays || !analysis) return null;
    // Build pool: all selectable overlays minus always-active, filtered by era
    const alwaysActiveSet = new Set(ALWAYS_ACTIVE);
    const poolNames = new Set(props.activeOverlays.filter((n) => !alwaysActiveSet.has(n)));
    let pool = SELECTABLE_REGISTRY.filter((e) => poolNames.has(e.name));
    const eraPreset = props.show?.era ? getEraPreset(props.show.era) : null;
    if (eraPreset) {
      const excluded = new Set(eraPreset.excludedOverlays);
      pool = pool.filter((e) => !excluded.has(e.name));
    }
    const songHero = props.song.overlayOverrides?.include?.[0];
    return {
      pool,
      alwaysActive: props.activeOverlays.filter((n) => alwaysActiveSet.has(n)),
      trackId: props.song.trackId,
      showSeed: showSeed ?? 0,
      songIdentity,
      showArcModifiers,
      energyHints: props.energyHints,
      isDrumsSpace,
      dominantStemSection,
      mode: props.song.defaultMode,
      songHero,
      songsCompleted: narrative?.state.songsCompleted,
      setNumber: props.song.set,
      era: props.show?.era,
      // CLAP-derived overlay category bias. Receiving end at overlay-scoring.ts
      // applies +catBias when dominantConfidence > 0.3, biasing e.g. "tender"
      // songs toward atmospheric/nature/sacred categories and "aggressive" songs
      // toward reactive/distortion/geometric.
      semanticProfile: songSemanticProfile,
    };
  }, [props.activeOverlays, analysis, props.song.trackId, showSeed, isDrumsSpace, props.energyHints, props.show?.era, props.song.defaultMode, songIdentity, showArcModifiers, dominantStemSection, narrative?.state.songsCompleted, props.song.overlayOverrides, props.song.set, songSemanticProfile]);

  // opacityMapBase computed after reactiveState (below) for reactive overlay injection
  let opacityMapBase: Record<string, number> | null = null;

  // ─── Film stock filter for text layer (matches EraGrade treatment) ───
  const filmStockFilter = useMemo(() => {
    if (!props.show?.era) return undefined;
    const stock = getFilmStock(props.show.era);
    return stock?.cssFilter || undefined;
  }, [props.show?.era]);

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
  const frameIdx = Math.min(Math.max(0, Math.floor(frame * analysisFrameScale)), f.length - 1);
  const audioSnapshot = computeAudioSnapshot(f, frameIdx, beatArray, 30, tempo);

  // Stem-derived features (per-frame)
  const stemSection = classifyStemSection(audioSnapshot);
  const soloState = detectSolo(audioSnapshot);
  // vocalWarmth and guitarColorTemp removed — were only feeding EnergyEnvelope hue modifiers (now stripped)
  const stemInterplay = detectStemInterplay(f, frameIdx);
  const phraseState = detectPhrase(f, frameIdx, tempo);
  const stemCharacter = computeStemCharacter(audioSnapshot);

  // Jerry's Golden Hour: when Jerry has dominated for 30+ frames, amplify golden warmth
  // effectiveStemHue/Sat removed — were only feeding EnergyEnvelope hue modifiers (now stripped)

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

  const climaxState = computeClimaxState(f, frameIdx, sections, audioSnapshot.energy);
  const climaxMod = climaxModulation(climaxState, songIdentity?.climaxBehavior, stemCharacter.dominant);
  const counterpoint = computeCounterpoint(f, frameIdx, climaxState.phase);

  // ─── Reactive triggers (mid-section audio-responsive structural changes) ───
  const currentSectionForTrigger = sections.find((s) => frameIdx >= s.frameStart && frameIdx < s.frameEnd);
  const inSectionBoundaryZone = currentSectionForTrigger
    ? (frameIdx - currentSectionForTrigger.frameStart < 60 || currentSectionForTrigger.frameEnd - frameIdx < 60)
    : false;
  const reactiveState = computeReactiveTriggers(
    f, frameIdx,
    currentSectionForTrigger?.frameStart ?? 0,
    currentSectionForTrigger?.frameEnd ?? f.length,
    tempo,
    coherenceState.isLocked,
    inSectionBoundaryZone,
    climaxState.phase === "climax" || climaxState.phase === "sustain",
  );

  // Compute overlay opacities via continuous engine (per-frame scoring)
  const continuousResult = overlayConfig
    ? computeContinuousOverlays(overlayConfig, f, frameIdx, audioSnapshot, reactiveState)
    : null;
  opacityMapBase = continuousResult?.opacities ?? null;

  // ─── Jam evolution state (hook) ───
  const { jamEvolution, jamDensity, jamPhaseBoundaries, jamPhaseShaders } = useJamEvolution({
    frames: f,
    frameIdx,
    isDrumsSpace,
    showSeed,
    songIdentity,
    defaultMode: props.song.defaultMode,
  });

  // ─── Section vocabulary + groove + jam cycles + narrative directive ───
  const currentSection = sections.find((s) => frameIdx >= s.frameStart && frameIdx < s.frameEnd);
  const sectionType = f[frameIdx]?.sectionType ?? currentSection?.label;

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

  // Compose section vocabulary with jam cycle phase for within-jam evolution
  const sectionVocabBase = getSectionVocabulary(sectionType);
  const sectionVocab = composeSectionWithJamCycle(sectionVocabBase, jamCycle?.phase, jamCycle?.progress ?? 0);

  // Set progress: how far through the current set are we?
  const totalSongsInSet = props.show?.songs.filter((s) => s.set === props.song.set).length ?? 1;
  const trackNumber = props.song.trackNumber ?? 1;
  const setProgress = Math.min(1, (trackNumber - 1 + frame / durationInFrames) / totalSongsInSet);

  const climaxPhaseForNarrative = { idle: 0, build: 1, climax: 2, sustain: 3, release: 4 }[climaxState.phase] ?? 0;
  const narrativeDirective = computeNarrativeDirective({
    setNumber: props.song.set,
    setProgress,
    sectionType,
    grooveType: groove.type,
    jamPhase: jamCycle?.phase,
    jamDeepening: jamCycle?.isDeepening,
    energy: audioSnapshot.energy,
    isDrumsSpace,
    climaxPhase: climaxPhaseForNarrative,
    songProgress: frame / durationInFrames,
  });

  // harmonicResponse and modalColor removed — were only feeding EnergyEnvelope hue modifiers (now stripped)

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

  // ─── Peak-of-Show Recognition (THE moment) ───
  const peakOfShow = detectPeakOfShow(
    f,
    frameIdx,
    props.narrativeState?.songPeakScores ?? [],
    props.narrativeState?.peakOfShowFired ?? false,
    narrative?.state.songsCompleted ?? 0,
    props.show?.songs.length ?? 0,
  );

  // Overlay density: use the most relevant 1-2 factors for current context.
  // Previous 12-factor product collapsed to near-zero (0.85^12 = 0.14).
  // Now: pick the dominant context, apply it directly.
  let rawDensityMult = 1.0;
  if (endScreenMult < 0.01) {
    rawDensityMult = 0;
  } else if (peakOfShow.densityMult < 0.8) {
    // Peak of show: clear the field for transcendence
    rawDensityMult = peakOfShow.densityMult;
  } else if (climaxMod.overlayDensityMult > 1.2) {
    // Climax: boost overlays
    rawDensityMult = climaxMod.overlayDensityMult;
  } else if (jamEvolution.isLongJam) {
    // Long jam: use jam density
    rawDensityMult = jamEvolution.densityMult;
  } else {
    // Normal: section vocabulary is the right authority
    rawDensityMult = sectionVocab.overlayDensityMult;
  }
  // Floor at 0.40 — overlays should be visible when present
  const combinedDensityMult = endScreenMult < 0.01 ? 0 : Math.max(0.40, rawDensityMult);
  const opacityMap = opacityMapBase ? applyDensityMult(opacityMapBase, combinedDensityMult, continuousResult?.alwaysActive ?? rotationSchedule?.alwaysActive ?? []) : null;

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

  // DEAD AIR climax dampening: applause has impulsive transients that the climax
  // detector reads as "high energy", which fires bloom/saturation/density boosts.
  // Without this dampening, the visual pulses with the applause as if the band were
  // still playing. We zero out climax modulation as deadAirFactor ramps up.
  if (deadAirFactor > 0.01) {
    const liveFactor = 1 - deadAirFactor;
    climaxMod.saturationOffset *= liveFactor;
    climaxMod.brightnessOffset *= liveFactor;
    climaxMod.bloomOffset *= liveFactor;
    climaxMod.contrastOffset *= liveFactor;
    climaxMod.overlayDensityMult = 1 + (climaxMod.overlayDensityMult - 1) * liveFactor;
    climaxMod.shaderSpeedMult = 1 + (climaxMod.shaderSpeedMult - 1) * liveFactor;
    climaxMod.cameraDrama *= liveFactor;
  }

  // ─── Intro factor: song card visible ~15s, then shader takes over ───
  // 0 = art dominates (shader suppressed), 1 = shader + icons fully open.
  const INTRO_FULL = 450;  // 15s at 30fps — song card is hero
  const INTRO_RAMP = 150;  // 5s ramp — shader fades in (15s-20s)
  const introFactor = props.segueIn
      ? (frame < 90 ? 1                                                              // 0-3s: full shader (crossfade)
        : frame < 150 ? 1 - 0.50 * ((frame - 90) / 60)                              // 3-5s: dim to 50%
        : frame < 360 ? 0.50 + 0.50 * ((frame - 150) / 210)                         // 5-12s: ramp back to full
        : 1)
    : isInSuiteMiddle ? 1
    : frame < INTRO_FULL ? 0.0                                                       // 0-15s: shader OFF (art hero, no flicker)
      : frame < INTRO_FULL + INTRO_RAMP ? ((frame - INTRO_FULL) / INTRO_RAMP)                 // 15-20s: shader ramps 0%→100%
      : 1;

  // ─── Fade in/out ───
  // Start fade-out 1 frame before the end of analyzed audio to ensure visuals are fully
  // gone by the time audio ends (analysis rounds up via ceil, creating a +1 frame mismatch)
  const fadeIn = props.segueIn ? 1 : interpolate(frame, [0, FADE_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Song art bookend stays until the composition ends — no early fadeout
  // Just a quick 1-second fade at the very last frames
  const fadeOut = props.segueOut ? 1 : interpolate(frame, [durationInFrames - 30, durationInFrames - 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Progressive dim during dead air: after crossfade completes, fade toward near-black.
  // Non-segue songs get an extra "visual breath" — the last 60 frames (2s) fade deeper
  // than segue songs, creating a brief moment of darkness between songs for pacing contrast.
  // No dimming. Shader stays bright, song art fades in over it during dead air.
  const opacity = Math.min(fadeIn, fadeOut);

  // ─── Space time dilation: Space phases get transcendently slow shaders ───
  const spaceTimeDilation = drumsSpaceState?.subPhase === "space_ambient" ? 0.25
    : drumsSpaceState?.subPhase === "space_textural" ? 0.4
    : drumsSpaceState?.subPhase === "space_melodic" ? 0.5
    : 1.0;

  // ─── Icon overlay state (per-frame, section-aware) ───
  const sectionTypeMap: Record<string, number> = { intro: 0, verse: 1, chorus: 2, bridge: 3, solo: 4, jam: 5, outro: 6, space: 7 };
  const sectionTypeFloat = sectionTypeMap[audioSnapshot.sectionType] ?? 1;
  const climaxPhaseNum = { idle: 0, build: 1, climax: 2, sustain: 3, release: 4 }[climaxState.phase] ?? 0;
  const iconState = getIconForFrame(iconSchedule, frame, audioSnapshot.energy, sectionTypeFloat, climaxPhaseNum);

  // Look up pre-loaded texture (loaded at mount via delayRender)
  const currentIconTexture = iconTexturesReady && iconState.iconPath
    ? iconTextureMap.current.get(iconState.iconPath) ?? null
    : null;

  const iconOverlayValue = {
    texture: currentIconTexture,
    opacity: currentIconTexture ? iconState.opacity * (1 - deadAirFactor) : 0,
  };


  // ─── Render (full) ───
  // eslint-disable-next-line no-unreachable
  const climaxPhaseMap: Record<string, number> = { idle: 0, build: 1, climax: 2, sustain: 3, release: 4 };

  return (
    <div style={{ width, height, position: "relative", overflow: "hidden", background: "#000" }}>
      <VisualizerProviderStack
        show={props.show}
        totalSongs={props.show?.songs.length ?? 1}
        narrativeInitialState={props.narrativeState ? { ...props.narrativeState, usedOverlayIds: new Set(props.narrativeState.predictedOverlayIds ?? []) } : undefined}
        audioSnapshot={audioSnapshot}
        iconOverlayValue={iconOverlayValue}
        heroPermitted={narrativeDirective.heroPermitted}
        jamPhaseValue={{ phase: jamEvolution.isLongJam ? JAM_PHASE_INDEX[jamEvolution.phase] : -1, progress: jamEvolution.phaseProgress }}
        peakOfShowIntensity={peakOfShow.intensity}
        deadAirFactor={deadAirFactor}
        spaceTimeDilation={spaceTimeDilation}
      >
      <VisualizerErrorBoundary>
      <div style={{ position: "absolute", inset: 0, opacity }}>
        <CameraMotion frames={f} jamEvolution={jamEvolution} bass={audioSnapshot.bass} cameraFreeze={counterpoint.cameraFreeze || itState.cameraLock || introFactor < 0.5} drumsSpacePhase={drumsSpaceState?.subPhase} fastEnergy={audioSnapshot.fastEnergy} vocalPresence={audioSnapshot.vocalPresence} isSolo={soloState.isSolo} soloIntensity={soloState.intensity} grooveMotionMult={grooveMods.motionMult * fatigue.motionMult * stemInterplay.motionMult * peakOfShow.motionMult * crowdEnergy.motionMult * narrativeDirective.motionMult * stemCharacter.motionMult} groovePulseMult={grooveMods.pulseMult * phraseState.zoomBreathing * tempoLock.zoomPulse * regularityStabilityMod} sectionDriftMult={sectionVocab.driftSpeedMult} cameraSteadiness={Math.max(0, Math.min(1, sectionVocab.cameraSteadiness + setTheme.cameraSteadinessOffset))} cameraDrama={climaxMod.cameraDrama} itSnapZoom={itState.snapZoom} deadAirFactor={deadAirFactor}>
        <EraGrade>
        <EnergyEnvelope snapshot={audioSnapshot} climaxMod={climaxMod} calibration={energyCalibration} drumsSpacePhase={drumsSpaceState?.subPhase} itLuminanceLift={itState.luminanceLift} itSaturationSurge={itState.saturationSurge} itVignettePull={itState.vignettePull} deadAirFactor={deadAirFactor} introFactor={introFactor}>
          <div style={{ position: "absolute", inset: 0, opacity: introFactor }}>
          <SilentErrorBoundary name="SceneRouter" resetKey={frame}>
            <SceneRouterWithSegues
              frames={f}
              sections={sections}
              song={props.song}
              tempo={tempo}
              showSeed={showSeed}
              jamDensity={jamDensity}
              deadAirFactor={deadAirFactor}
              era={props.show?.era}
              coherenceIsLocked={coherenceState.isLocked}
              drumsSpacePhase={drumsSpaceState?.subPhase}
              usedShaderModes={narrative?.state.usedShaderModes}
              shaderModeLastUsed={narrative?.state.shaderModeLastUsed}
              songIdentity={songIdentity}
              stemSection={stemSection}
              songDuration={analysis?.meta?.duration}
              palette={effectivePalette}
              segueIn={props.segueIn}
              isSacredSegueIn={isSacredSegueIn}
              isInSuiteMiddle={!!isInSuiteMiddle}
              setNumber={props.song.set}
              jamEvolution={jamEvolution}
              jamPhaseBoundaries={jamPhaseBoundaries}
              jamCycle={jamCycle}
              jamPhaseShaders={jamPhaseShaders}
              climaxPhase={climaxPhaseMap[climaxState.phase] ?? 0}
              trackNumber={props.song.trackNumber ?? 1}
              stemInterplayMode={stemInterplay.mode}
              stemDominant={stemCharacter.dominant}
              itForceTranscendentShader={itState.forceTranscendentShader}
              reactiveState={reactiveState}
              segueOut={props.segueOut}
              segueFromMode={props.segueFromMode}
              segueToMode={props.segueToMode}
              segueFromPalette={props.segueFromPalette}
              segueToPalette={props.segueToPalette}
              sacredSegueInTransition={sacredSegueInTransition}
              sacredSegueOutTransition={sacredSegueOutTransition}
              isSacredSegueOut={isSacredSegueOut}
              frame={frame}
              durationInFrames={durationInFrames}
              fadeFrames={FADE_FRAMES}
            />
          </SilentErrorBoundary>
          </div>

          <OverlayAndEffectsLayer
            effectiveSongArt={effectiveSongArt}
            artSuppressionFactor={artSuppressionFactor}
            hueRotation={hueRotation}
            audioSnapshot={audioSnapshot}
            climaxIntensity={climaxState.intensity}
            focusArtOpacity={focusState.artOpacity}
            segueIn={props.segueIn}
            artBlendMode={props.song.artBlendMode}
            introFactor={introFactor}
            deadAirFactor={deadAirFactor}
            frame={frame}
            activeEntries={activeEntries}
            opacityMap={opacityMap}
            mediaSuppression={mediaSuppression}
            tempo={tempo}
            palette={effectivePalette}
            frames={f}
            energyLevel={energyLevel}
            itFlashIntensity={itState.flashIntensity}
            itFlashHue={itState.flashHue}
            effectivePalette={effectivePalette}
          />

        </EnergyEnvelope>
        </EraGrade>
        </CameraMotion>

        <TextLayer
          isDeadAir={isDeadAir}
          filmStockFilter={filmStockFilter}
          songTitle={props.song.title}
          frames={f}
          currentSong={props.song.title}
          introFactor={introFactor}
        />
      </div>
      </VisualizerErrorBoundary>

      <AudioLayer
        audioFile={props.song.audioFile}
        snapshot={audioSnapshot}
        isDrumsSpace={isDrumsSpace}
      />
      </VisualizerProviderStack>
    </div>
  );
};
