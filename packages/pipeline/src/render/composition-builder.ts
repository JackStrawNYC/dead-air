import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type Database from 'better-sqlite3';
import { createLogger } from '@dead-air/core';
import type { EpisodeScript, SongDNAData } from '@dead-air/core';
import type { ShowResearch } from '../research/index.js';
import { matchSongName } from './song-matcher.js';
import { resolveImages, resolveArchivalImages, interleaveArchival, padImages } from './image-resolver.js';
import {
  findConcertAudio,
  findEnergyData,
  findOnsetFrames,
  findSpectralCentroid,
  findMusicBounds,
  findColdOpenMoment,
} from './audio-lookup.js';

const execFileAsync = promisify(execFile);
const log = createLogger('render:composition-builder');

const FPS = 30;
const BRAND_INTRO_FRAMES = 150; // 5 seconds
const COLD_OPEN_FRAMES = 240; // 8 seconds (upgraded from 3s)
const END_SCREEN_FRAMES = 600; // 20 seconds
const LEGACY_CARD_FRAMES = 240; // 8 seconds
const SCROLLING_CREDITS_FRAMES = 450; // 15 seconds
const CHAPTER_CARD_FRAMES = 60; // 2 seconds
const CROSSFADE_FRAMES = 30; // 30-frame overlap (1s) between segments

export interface EpisodeProps {
  episodeId: string;
  episodeTitle: string;
  segments: SegmentProps[];
  totalDurationInFrames: number;
  hasVinylNoise?: boolean;
  hasCrowdAmbience?: boolean;
  /** Composition-level ambient bed audio source (ducked under narration) */
  ambientBedSrc?: string;
  /** Composition-level tension drone audio source */
  tensionDroneSrc?: string;
  /** Silence windows for dramatic audio drops */
  silenceWindows?: Array<{ startFrame: number; durationFrames: number }>;
  /** Pre-swell windows for dramatic volume builds */
  preSwellWindows?: Array<{ peakFrame: number; rampFrames: number; boostMultiplier: number }>;
  /** Per-episode audio mix overrides */
  audioMix?: Record<string, Record<string, number>>;
  /** BGM audio source for narration segments */
  bgmSrc?: string;
}

export type SegmentProps =
  | { type: 'cold_open'; durationInFrames: number; audioSrc: string; startFrom: number; image: string }
  | { type: 'cold_open_v2'; durationInFrames: number; audioSrc: string; startFrom: number; media: string; hookText?: string }
  | { type: 'brand_intro'; durationInFrames: number; ambientSrc?: string; ambientVolume?: number }
  | {
      type: 'narration';
      durationInFrames: number;
      audioSrc: string;
      images: string[];
      mood: string;
      colorPalette: string[];
      concertBedSrc?: string;
      concertBedStartFrom?: number;
    }
  | {
      type: 'concert_audio';
      durationInFrames: number;
      songName: string;
      audioSrc: string;
      startFrom: number;
      images: string[];
      mood: string;
      colorPalette: string[];
      energyData?: number[];
      /** Onset timings in frames (from librosa onset_detect, converted from seconds) */
      onsetFrames?: number[];
      /** Spectral centroid data for frequency-aware visuals */
      spectralCentroid?: number[];
      textLines?: { text: string; displayDuration: number; style: string }[];
      songDNA?: SongDNAData;
      foleySrc?: string;
      foleyVolume?: number;
      foleyDelay?: number;
    }
  | {
      type: 'context_text';
      durationInFrames: number;
      textLines: { text: string; displayDuration: number; style: string }[];
      images: string[];
      mood: string;
      colorPalette: string[];
      ambientAudioSrc?: string;
      ambientStartFrom?: number;
    }
  | {
      type: 'end_screen';
      durationInFrames: number;
      nextEpisodeTitle?: string;
      nextEpisodeDate?: string;
      channelName?: string;
    }
  | {
      type: 'chapter_card';
      durationInFrames: number;
      title: string;
      subtitle?: string;
      colorAccent?: string;
      actNumber?: string;
    }
  | {
      type: 'legacy_card';
      durationInFrames: number;
      statement: string;
      attribution?: string;
    }
  | {
      type: 'scrolling_credits';
      durationInFrames: number;
      showTitle?: string;
    };

export interface BuildOptions {
  episodeId: string;
  db: Database.Database;
  dataDir: string;
}

async function getAudioDurationSec(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    filePath,
  ]);
  const data = JSON.parse(stdout) as { format?: { duration?: string } };
  return parseFloat(data.format?.duration ?? '0');
}

export async function buildCompositionProps(options: BuildOptions): Promise<EpisodeProps> {
  const { episodeId, db, dataDir } = options;

  // 1. Load episode & script from DB
  const row = db
    .prepare('SELECT title, script, show_id FROM episodes WHERE id = ?')
    .get(episodeId) as { title: string; script: string; show_id: string } | undefined;

  if (!row) throw new Error(`Episode not found: ${episodeId}`);
  const script = JSON.parse(row.script) as EpisodeScript;
  const showId = row.show_id;

  log.info(`Building props for "${script.episodeTitle}" (${script.segments.length} segments)`);

  // 2. Load audio analysis
  const analysisPath = resolve(dataDir, 'analysis', showId, 'analysis.json');
  let analysis: import('@dead-air/core').AudioAnalysis | null = null;
  if (existsSync(analysisPath)) {
    analysis = JSON.parse(readFileSync(analysisPath, 'utf-8'));
    log.info(`Loaded analysis with ${analysis!.songSegments.length} songs`);
  } else {
    log.warn(`No analysis found at ${analysisPath}`);
  }

  // 3. Load research for songDNA
  const researchPath = resolve(dataDir, 'research', showId, 'research.json');
  let research: ShowResearch | null = null;
  if (existsSync(researchPath)) {
    research = JSON.parse(readFileSync(researchPath, 'utf-8')) as ShowResearch;
    log.info(`Loaded research data (${research.songStats?.length ?? 0} song stats)`);
  }

  // 4. Resolve archival images for interleaving
  const archivalImages = resolveArchivalImages(episodeId, dataDir);
  log.info(`Found ${archivalImages.length} archival images for interleaving`);

  // 5. Build segments
  const segments: SegmentProps[] = [];

  // Prepend cold open (8s of peak moment) + brand intro
  if (analysis) {
    const coldOpen = findColdOpenMoment(analysis, dataDir);
    if (coldOpen) {
      // Find an image/video for the cold open
      let coldOpenMedia = '';
      for (let si = 0; si < script.segments.length; si++) {
        const seg = script.segments[si];
        if (seg.type === 'concert_audio') {
          const imgs = resolveImages(seg, episodeId, si, dataDir);
          if (imgs.length > 0) {
            coldOpenMedia = imgs[0];
            break;
          }
        }
      }

      if (coldOpenMedia) {
        segments.push({
          type: 'cold_open_v2',
          durationInFrames: COLD_OPEN_FRAMES,
          audioSrc: coldOpen.audioSrc,
          startFrom: Math.round(coldOpen.startFromSec * FPS),
          media: coldOpenMedia,
          hookText: script.shortsMoments?.[0]?.hookText,
        });
      }
    }
  }

  const crowdAmbienceExists = existsSync(resolve(dataDir, 'assets', 'ambient', 'crowd-ambience.mp3'));
  segments.push({
    type: 'brand_intro',
    durationInFrames: BRAND_INTRO_FRAMES,
    ambientSrc: crowdAmbienceExists ? 'assets/ambient/crowd-ambience.mp3' : undefined,
    ambientVolume: 0.15,
  });

  // Track last concert audio for ambient bleed on context_text segments
  let lastConcertAudioSrc = '';
  let lastConcertStartFrom = 0;

  // Narration key → audio path mapping
  const narrationMap: Record<string, string> = {
    intro: `assets/${episodeId}/narration/intro.mp3`,
    set_break: `assets/${episodeId}/narration/set_break.mp3`,
    outro: `assets/${episodeId}/narration/outro.mp3`,
  };

  for (let i = 0; i < script.segments.length; i++) {
    const seg = script.segments[i];
    let images = resolveImages(seg, episodeId, i, dataDir);

    // Interleave archival images into visual segments, or use them directly if no AI images
    if (seg.type === 'narration' || seg.type === 'context_text' || seg.type === 'concert_audio') {
      if (images.length === 0 && archivalImages.length > 0) {
        // No AI-generated images — use archival images directly, cycling through them
        const offset = i * 3; // stagger so each segment gets different photos
        const slice: string[] = [];
        for (let j = 0; j < 5; j++) {
          slice.push(archivalImages[(offset + j) % archivalImages.length]);
        }
        images = slice;
      } else {
        // Concert segments: archival photos as occasional grounding (every 6th)
        // Narration/context: more frequent archival grounding (every 3rd)
        const interval = seg.type === 'concert_audio' ? 6 : 3;
        images = interleaveArchival(images, archivalImages, interval);
      }
    }

    const mood = seg.visual?.mood ?? 'warm';
    const colorPalette = seg.visual?.colorPalette ?? [];

    if (seg.type === 'narration' && seg.narrationKey) {
      // Insert chapter card before set_break narration
      if (seg.narrationKey === 'set_break') {
        segments.push({
          type: 'chapter_card',
          durationInFrames: CHAPTER_CARD_FRAMES,
          title: 'SET II',
          subtitle: 'The Second Set',
          colorAccent: colorPalette[0],
        });
      }

      const audioRel = narrationMap[seg.narrationKey];
      const audioAbs = resolve(dataDir, audioRel);

      if (!existsSync(audioAbs)) {
        log.warn(`Narration audio missing: ${audioAbs} — skipping narration segment`);
        continue;
      }

      const durationSec = await getAudioDurationSec(audioAbs);

      const narDurationFrames = Math.ceil(durationSec * FPS);
      segments.push({
        type: 'narration',
        durationInFrames: narDurationFrames,
        audioSrc: audioRel,
        images: padImages(images, narDurationFrames),
        mood,
        colorPalette,
        concertBedSrc: lastConcertAudioSrc || undefined,
        concertBedStartFrom: lastConcertAudioSrc ? lastConcertStartFrom : undefined,
      });
    } else if (seg.type === 'concert_audio' && seg.songName) {
      // ── Full concert mode: use entire song with trimmed dead air ──
      let audioSrc = '';
      if (analysis) {
        const found = findConcertAudio(seg.songName, analysis, dataDir);
        if (found) {
          audioSrc = found.audioSrc;
        } else {
          log.warn(`Concert audio not found for "${seg.songName}" — skipping segment`);
          continue;
        }
      }

      if (!audioSrc) {
        log.warn(`Skipping concert_audio "${seg.songName}" — no audio source (analysis missing?)`);
        continue;
      }

      // Get full song duration from analysis
      const songAnalysis = analysis?.perSongAnalysis.find(
        (s) => matchSongName(seg.songName!, s.songName),
      );
      const fullDurationSec = songAnalysis?.durationSec ?? (seg.excerptDuration ?? 60);

      // Detect segue context: check if this song or next song is a segue
      const nextSeg = script.segments[i + 1];
      const prevSeg = i > 0 ? script.segments[i - 1] : undefined;
      const isSegueOut = nextSeg?.type === 'concert_audio' && (
        seg.songName!.includes('>') || seg.songName!.includes('→') ||
        nextSeg.songName?.includes('>') || nextSeg.songName?.includes('→')
      );
      const isSegueIn = prevSeg?.type === 'concert_audio' && (
        prevSeg.songName?.includes('>') || prevSeg.songName?.includes('→') ||
        seg.songName!.includes('>') || seg.songName!.includes('→')
      );

      // Trim dead air using energy analysis
      let startTimeSec = 0;
      let songDurationSec = fullDurationSec;

      if (analysis) {
        const bounds = findMusicBounds(seg.songName!, analysis, {
          leadPadSec: isSegueIn ? 0 : 1.0,   // No lead trim on segue-in (music is flowing)
          trailPadSec: isSegueOut ? 0 : 4.0,  // No trail trim on segue-out (music flows into next)
        });
        if (bounds) {
          startTimeSec = bounds.startSec;
          songDurationSec = bounds.trimmedDuration;
          const trimmed = fullDurationSec - songDurationSec;
          if (trimmed > 2) {
            log.info(`"${seg.songName}": trimmed ${trimmed.toFixed(1)}s dead air (${startTimeSec.toFixed(1)}s lead, ${(fullDurationSec - bounds.endSec).toFixed(1)}s trail)`);
          }
        }
      }

      const energyData = analysis ? findEnergyData(seg.songName!, analysis) : undefined;
      const onsetFrames = analysis ? findOnsetFrames(seg.songName!, analysis, startTimeSec, songDurationSec) : undefined;
      const spectralCentroid = analysis ? findSpectralCentroid(seg.songName!, analysis, startTimeSec, songDurationSec) : undefined;

      if (onsetFrames) {
        log.info(`"${seg.songName}": ${onsetFrames.length} onset frames for FX triggers`);
      }

      // Resolve songDNA from script or research — skip if data is placeholder/empty
      const scriptSongDNA = seg.songDNA;
      const researchStats = research?.songStats?.find(
        (s) => matchSongName(seg.songName!, s.songName),
      );
      let songDNA: SongDNAData | undefined;
      if (scriptSongDNA && (scriptSongDNA.timesPlayed > 0 || scriptSongDNA.firstPlayed)) {
        songDNA = scriptSongDNA;
      } else if (researchStats && (researchStats.timesPlayed > 0 || researchStats.firstPlayed)) {
        songDNA = {
          timesPlayed: researchStats.timesPlayed,
          firstPlayed: researchStats.firstPlayed,
          lastPlayed: researchStats.lastPlayed,
        };
      }

      const computedStartFrom = Math.round(startTimeSec * FPS);
      const concertDurationFrames = Math.ceil(songDurationSec * FPS);

      // Foley: assign crowd reaction SFX based on energy peaks
      let foleySrc: string | undefined;
      let foleyVolume = 0.10;
      const foleyDir = resolve(dataDir, 'assets', 'sfx');
      if (energyData && energyData.length > 0 && existsSync(foleyDir)) {
        const maxEnergy = Math.max(...energyData);
        const isSegue = seg.songName!.includes('>') || seg.songName!.includes('→');
        if (isSegue && existsSync(resolve(foleyDir, 'crowd-roar.mp3'))) {
          foleySrc = 'assets/sfx/crowd-roar.mp3';
          foleyVolume = 0.15;
        } else if (maxEnergy > 0.85 && existsSync(resolve(foleyDir, 'crowd-cheer.mp3'))) {
          foleySrc = 'assets/sfx/crowd-cheer.mp3';
          foleyVolume = 0.12;
        } else if (existsSync(resolve(foleyDir, 'scattered-clapping.mp3'))) {
          foleySrc = 'assets/sfx/scattered-clapping.mp3';
          foleyVolume = 0.06;
        }
      }

      segments.push({
        type: 'concert_audio',
        durationInFrames: concertDurationFrames,
        songName: seg.songName,
        audioSrc,
        startFrom: computedStartFrom,
        images: padImages(images, concertDurationFrames),
        mood,
        colorPalette,
        energyData,
        onsetFrames,
        spectralCentroid,
        textLines: seg.textLines?.map((l) => ({
          text: l.text,
          displayDuration: l.displayDuration,
          style: l.style,
        })),
        songDNA,
        ...(foleySrc ? { foleySrc, foleyVolume } : {}),
      } as SegmentProps);

      lastConcertAudioSrc = audioSrc;
      lastConcertStartFrom = computedStartFrom + concertDurationFrames;
    } else if (seg.type === 'context_text' && seg.textLines) {
      const totalSec = seg.textLines.reduce((sum, l) => sum + l.displayDuration, 0);
      const ctxDurationFrames = Math.ceil(totalSec * FPS);

      segments.push({
        type: 'context_text',
        durationInFrames: ctxDurationFrames,
        textLines: seg.textLines.map((l) => ({
          text: l.text,
          displayDuration: l.displayDuration,
          style: l.style,
        })),
        images: padImages(images, ctxDurationFrames),
        mood,
        colorPalette,
        ambientAudioSrc: lastConcertAudioSrc || undefined,
        ambientStartFrom: lastConcertAudioSrc ? lastConcertStartFrom : undefined,
      });
    }
  }

  // Append closing sequence: legacy card → scrolling credits → end screen
  segments.push({
    type: 'legacy_card',
    durationInFrames: LEGACY_CARD_FRAMES,
    statement: script.legacyStatement ?? `${script.episodeTitle} — a concert that transcended the ordinary and became legend.`,
    attribution: script.legacyAttribution,
  });

  segments.push({
    type: 'scrolling_credits',
    durationInFrames: SCROLLING_CREDITS_FRAMES,
    showTitle: script.episodeTitle,
  });

  segments.push({
    type: 'end_screen',
    durationInFrames: END_SCREEN_FRAMES,
  });

  // Calculate total duration accounting for transition overlaps
  const rawTotal = segments.reduce((sum, s) => sum + s.durationInFrames, 0);
  const transitionOverlap = CROSSFADE_FRAMES * Math.max(0, segments.length - 1);
  const totalDurationInFrames = rawTotal - transitionOverlap;

  // ── Build silence windows + pre-swell from mood data ──
  // Dramatic moods get audio drops; preceding segments get pre-swell builds
  const DRAMATIC_MOODS = new Set(['dark', 'cosmic']);
  const silenceWindows: Array<{ startFrame: number; durationFrames: number }> = [];
  const preSwellWindows: Array<{ peakFrame: number; rampFrames: number; boostMultiplier: number }> = [];

  {
    let segCursor = 0;
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const segStart = segCursor;
      segCursor += seg.durationInFrames;
      if (si < segments.length - 1) segCursor -= CROSSFADE_FRAMES;

      // Check if this segment has a dramatic mood
      const mood = 'mood' in seg ? (seg as { mood?: string }).mood : undefined;
      if (mood && DRAMATIC_MOODS.has(mood)) {
        // Silence window: first 60 frames of dramatic segment (2s of near-silence)
        silenceWindows.push({
          startFrame: segStart,
          durationFrames: 60,
        });
        log.info(`Silence window: segment ${si} (${mood}) at frame ${segStart}`);

        // Pre-swell: 45 frames before this segment, 1.5x boost
        if (si > 0) {
          preSwellWindows.push({
            peakFrame: segStart,
            rampFrames: 45,
            boostMultiplier: 1.5,
          });
          log.info(`Pre-swell: before segment ${si} (${mood}), peak at frame ${segStart}`);
        }
      }
    }
    log.info(`Built ${silenceWindows.length} silence windows, ${preSwellWindows.length} pre-swell windows`);
  }

  log.info(
    `Built ${segments.length} segments, total ${totalDurationInFrames} frames (${(totalDurationInFrames / FPS).toFixed(1)}s) [${transitionOverlap} frames of crossfade overlap]`,
  );

  // Check ambient audio file existence
  const vinylNoisePath = resolve(dataDir, 'assets', 'ambient', 'vinyl-noise.mp3');
  const crowdAmbiencePath = resolve(dataDir, 'assets', 'ambient', 'crowd-ambience.mp3');
  const hasVinylNoise = existsSync(vinylNoisePath);
  const hasCrowdAmbience = existsSync(crowdAmbiencePath);

  if (!hasVinylNoise) log.warn('Ambient file missing: vinyl-noise.mp3 — VinylNoise layer disabled');
  if (!hasCrowdAmbience) log.warn('Ambient file missing: crowd-ambience.mp3 — CrowdAmbience layer disabled');

  // Check BGM audio file existence
  const bgmPath = resolve(dataDir, 'assets', episodeId, 'bgm', 'bgm-intro.mp3');
  const hasBgm = existsSync(bgmPath);
  if (!hasBgm) log.info('No BGM found — narration segments will be music-free');

  const props: EpisodeProps = {
    episodeId,
    episodeTitle: script.episodeTitle,
    segments,
    totalDurationInFrames,
    hasVinylNoise,
    hasCrowdAmbience,
    // Ambient bed: crowd ambience runs composition-wide, ducked under narration
    ambientBedSrc: hasCrowdAmbience ? 'assets/ambient/crowd-ambience.mp3' : undefined,
    // Dramatic audio automation
    silenceWindows: silenceWindows.length > 0 ? silenceWindows : undefined,
    preSwellWindows: preSwellWindows.length > 0 ? preSwellWindows : undefined,
    // BGM under narration (when no concert bed bleed)
    bgmSrc: hasBgm ? `assets/${episodeId}/bgm/bgm-intro.mp3` : undefined,
  };

  // Write props to disk
  const renderDir = resolve(dataDir, 'renders', episodeId);
  if (!existsSync(renderDir)) mkdirSync(renderDir, { recursive: true });
  const propsPath = resolve(renderDir, 'props.json');
  writeFileSync(propsPath, JSON.stringify(props, null, 2));
  log.info(`Props written to ${propsPath}`);

  return props;
}
