import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type Database from 'better-sqlite3';
import { createLogger } from '@dead-air/core';
import type { EpisodeScript, EpisodeSegment, AudioAnalysis, SongDNAData } from '@dead-air/core';
import type { ShowResearch } from '../research/index.js';

const execFileAsync = promisify(execFile);
const log = createLogger('render:composition-builder');

const FPS = 30;
const BRAND_INTRO_FRAMES = 150; // 5 seconds
const COLD_OPEN_FRAMES = 240; // 8 seconds (upgraded from 3s)
const END_SCREEN_FRAMES = 600; // 20 seconds
const CHAPTER_CARD_FRAMES = 60; // 2 seconds
const CROSSFADE_FRAMES = 30; // 30-frame overlap (1s) between segments

export interface EpisodeProps {
  episodeId: string;
  episodeTitle: string;
  segments: SegmentProps[];
  totalDurationInFrames: number;
}

export type SegmentProps =
  | { type: 'cold_open'; durationInFrames: number; audioSrc: string; startFrom: number; image: string }
  | { type: 'cold_open_v2'; durationInFrames: number; audioSrc: string; startFrom: number; media: string; hookText?: string }
  | { type: 'brand_intro'; durationInFrames: number }
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
      textLines?: { text: string; displayDuration: number; style: string }[];
      songDNA?: SongDNAData;
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

/**
 * Resolve images for a segment, preferring .mp4 video over .png.
 */
function resolveImages(
  segment: EpisodeSegment,
  episodeId: string,
  segIndex: number,
  dataDir: string,
): string[] {
  const images: string[] = [];
  const sceneCount = segment.visual?.scenePrompts?.length ?? 0;
  for (let pi = 0; pi < sceneCount; pi++) {
    const baseName = `seg-${String(segIndex).padStart(2, '0')}-${pi}`;
    const videoRelPath = `assets/${episodeId}/images/${baseName}.mp4`;
    const imageRelPath = `assets/${episodeId}/images/${baseName}.png`;

    // Prefer video over static image
    if (existsSync(resolve(dataDir, videoRelPath))) {
      images.push(videoRelPath);
    } else if (existsSync(resolve(dataDir, imageRelPath))) {
      images.push(imageRelPath);
    }
  }
  return images;
}

/**
 * Scan archival directory and return relative paths to found images.
 */
function resolveArchivalImages(episodeId: string, dataDir: string): string[] {
  const archivalDir = resolve(dataDir, 'assets', episodeId, 'archival');
  if (!existsSync(archivalDir)) return [];

  const images: string[] = [];

  // Scan all archival subdirectories (flickr, wikimedia, loc, ucsc, top-level)
  const scanDir = (dir: string, relPrefix: string): void => {
    if (!existsSync(dir)) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          scanDir(resolve(dir, entry.name), `${relPrefix}/${entry.name}`);
        } else if (/\.(jpg|jpeg|png|gif)$/i.test(entry.name)) {
          images.push(`assets/${episodeId}/archival${relPrefix}/${entry.name}`);
        }
      }
    } catch {
      // ignore
    }
  };

  scanDir(archivalDir, '');

  return images;
}

/**
 * Interleave archival images into an image array every Nth position.
 */
function interleaveArchival(images: string[], archival: string[], every = 3): string[] {
  if (archival.length === 0) return images;
  const result: string[] = [];
  let archIdx = 0;

  for (let i = 0; i < images.length; i++) {
    result.push(images[i]);
    if ((i + 1) % every === 0 && archIdx < archival.length) {
      result.push(archival[archIdx]);
      archIdx++;
    }
  }

  return result;
}

/**
 * Pad an image array by cycling so there's roughly one image per 8 seconds.
 * Prevents long segments from showing the same 1-2 images on repeat.
 */
function padImages(images: string[], durationInFrames: number): string[] {
  if (images.length === 0) return images;
  const framesPerImage = 5 * FPS; // 150 frames = 5s per image
  const targetCount = Math.ceil(durationInFrames / framesPerImage);
  if (images.length >= targetCount) return images;

  const padded: string[] = [];
  for (let i = 0; i < targetCount; i++) {
    if (i < images.length) {
      padded.push(images[i]);
    } else {
      // Alternate between cycling real images and procedural slots
      const cycleIndex = i - images.length;
      if (cycleIndex % 2 === 1) {
        padded.push('__procedural__');
      } else {
        padded.push(images[cycleIndex % images.length]);
      }
    }
  }
  return padded;
}

// Common Dead song abbreviations / nicknames → canonical names
const SONG_ALIASES: Record<string, string[]> = {
  'china cat sunflower': ['china cat', 'china'],
  'i know you rider': ['rider', 'i know you rider'],
  'playing in the band': ["playin' in the band", 'playin', 'pitb'],
  'the other one': ['other one'],
  'not fade away': ['nfa'],
  'goin\' down the road feeling bad': ['gdtrfb', "goin' down the road", 'going down the road feeling bad'],
  'good lovin\'': ['good lovin'],
  'truckin\'': ['truckin'],
  'drums': ['drums/space', 'drums > space'],
  'space': ['drums/space', 'space > drums'],
  'he\'s gone': ['hes gone'],
  'friend of the devil': ['fotd', 'friend of the devil'],
  'st. stephen': ['saint stephen', 'st stephen'],
  'saint stephen': ['st. stephen', 'st stephen'],
  'wharf rat': ['warf rat'],
  'me and my uncle': ['me & my uncle'],
};

/**
 * Match song names, handling:
 * - Segue notation: ">", "-->", "->", "→", "~>"
 * - Reprise suffixes
 * - Common abbreviations and nicknames
 * - Substring/prefix matching for partial names
 * - Punctuation normalization (apostrophes, hyphens)
 */
function matchSongName(scriptName: string, candidateName: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s*\(reprise\)\s*$/i, '')
      // Normalize segue separators to " > "
      .replace(/\s*[-~]?-+>\s*/g, ' > ')
      .replace(/\s*→\s*/g, ' > ')
      // Normalize punctuation
      .replace(/['']/g, "'")
      .trim();

  const a = normalize(scriptName);
  const b = normalize(candidateName);

  // Exact match
  if (a === b) return true;

  // Split segues and match any part
  const splitSegue = (s: string) =>
    s.includes(' > ') ? s.split(' > ').map((p) => p.trim()) : [s];

  const aParts = splitSegue(a);
  const bParts = splitSegue(b);

  // Any part of A matches any part of B
  for (const ap of aParts) {
    for (const bp of bParts) {
      if (ap === bp) return true;

      // Check aliases in both directions
      for (const [canonical, aliases] of Object.entries(SONG_ALIASES)) {
        const allNames = [canonical, ...aliases];
        if (allNames.includes(ap) && allNames.includes(bp)) return true;
      }

      // Substring match: "China Cat" matches "China Cat Sunflower"
      if (ap.length >= 5 && (bp.startsWith(ap) || ap.startsWith(bp))) return true;
    }
  }

  return false;
}

function findConcertAudio(
  songName: string,
  analysis: AudioAnalysis,
  dataDir: string,
): { audioSrc: string; filePath: string } | null {
  const seg = analysis.songSegments.find(
    (s) => matchSongName(songName, s.songName),
  );
  if (!seg) return null;

  const absPath = seg.filePath;
  if (!existsSync(absPath)) return null;

  if (absPath.startsWith(dataDir)) {
    const relPath = absPath.slice(dataDir.length).replace(/^\//, '');
    return { audioSrc: relPath, filePath: absPath };
  }
  return { audioSrc: absPath, filePath: absPath };
}

function findEnergyData(songName: string, analysis: AudioAnalysis): number[] | undefined {
  const data = analysis.perSongAnalysis.find(
    (s) => matchSongName(songName, s.songName),
  );
  return data?.energy;
}

function findSmartExcerptStart(
  songName: string,
  excerptDuration: number,
  analysis: AudioAnalysis,
): number | null {
  const songAnalysis = analysis.perSongAnalysis.find(
    (s) => matchSongName(songName, s.songName),
  );
  if (!songAnalysis || songAnalysis.energy.length < 10) return null;

  const energy = songAnalysis.energy;
  const songDuration = songAnalysis.durationSec;
  const sampleRate = energy.length / songDuration;

  const windowSamples = Math.round(30 * sampleRate);
  if (windowSamples >= energy.length) return null;

  let bestDelta = -Infinity;
  let bestWindowStart = 0;

  for (let i = 0; i <= energy.length - windowSamples; i++) {
    const thirdSize = Math.floor(windowSamples / 3);
    const firstThird = energy.slice(i, i + thirdSize);
    const lastThird = energy.slice(i + windowSamples - thirdSize, i + windowSamples);

    const avgFirst = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
    const avgLast = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;
    const delta = avgLast - avgFirst;

    if (delta > bestDelta) {
      bestDelta = delta;
      bestWindowStart = i;
    }
  }

  const peakBuildSec = bestWindowStart / sampleRate;
  let startSec = Math.max(0, peakBuildSec - 45);

  if (startSec + excerptDuration > songDuration) {
    startSec = Math.max(0, songDuration - excerptDuration);
  }

  log.info(
    `Smart excerpt for "${songName}": peak build at ${peakBuildSec.toFixed(1)}s, excerpt starts at ${startSec.toFixed(1)}s`,
  );

  return startSec;
}

function findColdOpenMoment(
  analysis: AudioAnalysis,
  dataDir: string,
): { audioSrc: string; startFromSec: number; songName: string; image: string } | null {
  let bestEnergy = 0;
  let bestSongName = '';
  let bestTimeSec = 0;

  for (const song of analysis.perSongAnalysis) {
    if (!song.energy || song.energy.length === 0) continue;
    const sampleRate = song.energy.length / song.durationSec;

    for (let i = 0; i < song.energy.length; i++) {
      if (song.energy[i] > bestEnergy) {
        bestEnergy = song.energy[i];
        bestSongName = song.songName;
        bestTimeSec = i / sampleRate;
      }
    }
  }

  if (!bestSongName) return null;

  const seg = analysis.songSegments.find(
    (s) => s.songName.toLowerCase() === bestSongName.toLowerCase(),
  );
  if (!seg || !existsSync(seg.filePath)) return null;

  let audioSrc = seg.filePath;
  if (audioSrc.startsWith(dataDir)) {
    audioSrc = audioSrc.slice(dataDir.length).replace(/^\//, '');
  }

  const startFromSec = Math.max(0, bestTimeSec - 1.5);

  log.info(`Cold open: "${bestSongName}" at ${bestTimeSec.toFixed(1)}s (energy: ${bestEnergy.toFixed(3)})`);

  return { audioSrc, startFromSec, songName: bestSongName, image: '' };
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
  let analysis: AudioAnalysis | null = null;
  if (existsSync(analysisPath)) {
    analysis = JSON.parse(readFileSync(analysisPath, 'utf-8')) as AudioAnalysis;
    log.info(`Loaded analysis with ${analysis.songSegments.length} songs`);
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

  // 4. Build segments
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

  segments.push({ type: 'brand_intro', durationInFrames: BRAND_INTRO_FRAMES });

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
        images = interleaveArchival(images, archivalImages);
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

      let durationSec = 60; // fallback
      if (existsSync(audioAbs)) {
        durationSec = await getAudioDurationSec(audioAbs);
      } else {
        log.warn(`Narration not found: ${audioAbs}, using fallback duration`);
      }

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
      const excerptDuration = seg.excerptDuration ?? 60;

      let startTimeSec = seg.startTimeInSong ?? 0;
      if (analysis) {
        const smartStart = findSmartExcerptStart(seg.songName, excerptDuration, analysis);
        if (smartStart !== null) {
          startTimeSec = smartStart;
        }
      }

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

      const energyData = analysis ? findEnergyData(seg.songName, analysis) : undefined;

      // Resolve songDNA from script or research
      const scriptSongDNA = seg.songDNA;
      const researchStats = research?.songStats?.find(
        (s) => matchSongName(seg.songName!, s.songName),
      );
      const songDNA: SongDNAData | undefined = scriptSongDNA ?? (researchStats ? {
        timesPlayed: researchStats.timesPlayed,
        firstPlayed: researchStats.firstPlayed,
        lastPlayed: researchStats.lastPlayed,
      } : undefined);

      const computedStartFrom = Math.round(startTimeSec * FPS);
      const concertDurationFrames = Math.ceil(excerptDuration * FPS);
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
        textLines: seg.textLines?.map((l) => ({
          text: l.text,
          displayDuration: l.displayDuration,
          style: l.style,
        })),
        songDNA,
      });

      lastConcertAudioSrc = audioSrc;
      lastConcertStartFrom = computedStartFrom + Math.ceil(excerptDuration * FPS);
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

  // Append end screen
  segments.push({
    type: 'end_screen',
    durationInFrames: END_SCREEN_FRAMES,
  });

  // Calculate total duration accounting for transition overlaps
  const rawTotal = segments.reduce((sum, s) => sum + s.durationInFrames, 0);
  const transitionOverlap = CROSSFADE_FRAMES * Math.max(0, segments.length - 1);
  const totalDurationInFrames = rawTotal - transitionOverlap;

  log.info(
    `Built ${segments.length} segments, total ${totalDurationInFrames} frames (${(totalDurationInFrames / FPS).toFixed(1)}s) [${transitionOverlap} frames of crossfade overlap]`,
  );

  const props: EpisodeProps = {
    episodeId,
    episodeTitle: script.episodeTitle,
    segments,
    totalDurationInFrames,
  };

  // Write props to disk
  const renderDir = resolve(dataDir, 'renders', episodeId);
  if (!existsSync(renderDir)) mkdirSync(renderDir, { recursive: true });
  const propsPath = resolve(renderDir, 'props.json');
  writeFileSync(propsPath, JSON.stringify(props, null, 2));
  log.info(`Props written to ${propsPath}`);

  return props;
}
