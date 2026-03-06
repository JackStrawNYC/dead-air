#!/usr/bin/env npx tsx
/**
 * align-deepgram.ts — Deepgram lyric alignment for live concert audio.
 *
 * Replaces heuristic-generated alignment data with real speech-to-text
 * timestamps from Deepgram's API. Processes actual concert audio and
 * returns millisecond-accurate word-level timestamps.
 *
 * Uses whisper-large model by default (better for music+vocals).
 * Nova-3 can be selected via --model=nova-3 but returns 0 words on
 * live concert recordings where music drowns out vocals.
 *
 * Usage:
 *   npx tsx packages/pipeline/scripts/align-deepgram.ts --show=1977-05-08
 *   npx tsx packages/pipeline/scripts/align-deepgram.ts --show=1977-05-08 --track=s2t03
 *   npx tsx packages/pipeline/scripts/align-deepgram.ts --show=1977-05-08 --force
 *   npx tsx packages/pipeline/scripts/align-deepgram.ts --show=1977-05-08 --key=YOUR_KEY
 *   npx tsx packages/pipeline/scripts/align-deepgram.ts --show=1977-05-08 --model=nova-3
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VISUALIZER_DIR = resolve(__dirname, '..', '..', 'visualizer-poc');
const AUDIO_DIR = resolve(VISUALIZER_DIR, 'public', 'audio');
const OUTPUT_DIR = resolve(VISUALIZER_DIR, 'data', 'lyrics');
const LYRICS_DIR = resolve(__dirname, '..', '..', '..', 'data', 'lyrics');
const STEMS_DIR = resolve(__dirname, '..', '..', '..', 'data', 'stems');

// Instrumental tracks — no vocals to align
const INSTRUMENTAL_TRACKS = new Set(['s1t09', 's2t07']);

// ─── Types ───

interface SetlistSong {
  trackId: string;
  title: string;
  audioFile: string;
}

interface Setlist {
  date: string;
  songs: SetlistSong[];
}

interface AlignedWord {
  word: string;
  start: number;
  end: number;
  score: number;
}

interface AlignmentOutput {
  songName: string;
  trackId: string;
  source: string;
  words: AlignedWord[];
}

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
}

interface DeepgramChannel {
  alternatives: Array<{
    words: DeepgramWord[];
    transcript: string;
  }>;
}

interface DeepgramResponse {
  results: {
    channels: DeepgramChannel[];
  };
  metadata?: {
    duration: number;
    models: string[];
  };
}

// ─── CLI args ───

const args = process.argv.slice(2);
const trackArg = args.find(a => a.startsWith('--track='))?.slice(8);
const showArg = args.find(a => a.startsWith('--show='))?.slice(7);
const keyArg = args.find(a => a.startsWith('--key='))?.slice(6);
const modelArg = args.find(a => a.startsWith('--model='))?.slice(8) || 'whisper-large';
const force = args.includes('--force');

const apiKey = keyArg || process.env.DEEPGRAM_API_KEY;

if (!showArg) {
  console.error('Usage: align-deepgram.ts --show=1977-05-08 [--track=s2t03] [--force] [--key=KEY] [--model=whisper-large|nova-3]');
  process.exit(1);
}

if (!apiKey) {
  console.error('Error: Deepgram API key required. Use --key=KEY or set DEEPGRAM_API_KEY env var.');
  process.exit(1);
}

// ─── Lyrics Loading (for keyword boosting) ───

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function loadLyricsKeywords(songTitle: string): string[] {
  // Try song-catalog.json first
  const catalogPath = resolve(LYRICS_DIR, 'song-catalog.json');
  let lyricsText: string | null = null;

  if (existsSync(catalogPath)) {
    try {
      const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
      const normalized = normalizeForMatch(songTitle);
      for (const entry of catalog.songs) {
        if (entry.instrumental) continue;
        if (normalizeForMatch(entry.title) === normalized ||
            entry.aliases?.some((a: string) => normalizeForMatch(a) === normalized)) {
          const filePath = resolve(LYRICS_DIR, `${entry.slug}.txt`);
          if (existsSync(filePath)) {
            lyricsText = readFileSync(filePath, 'utf-8').trim();
            break;
          }
        }
      }
    } catch { /* fall through */ }
  }

  // Fallback: try slug directly
  if (!lyricsText) {
    const slug = songTitle
      .toLowerCase()
      .replace(/['']/g, '')
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const filePath = resolve(LYRICS_DIR, `${slug}.txt`);
    if (existsSync(filePath)) {
      lyricsText = readFileSync(filePath, 'utf-8').trim();
    }
  }

  if (!lyricsText) return [];

  // Extract unique words (3+ chars) for keyword boosting
  const words = new Set<string>();
  for (const word of lyricsText.split(/\s+/)) {
    const clean = word.toLowerCase().replace(/[^a-z']/g, '');
    if (clean.length >= 3) words.add(clean);
  }
  return [...words].slice(0, 100); // Deepgram keyword limit
}

// ─── Deepgram API ───

async function transcribeWithDeepgram(
  audioPath: string,
  model: string,
  keywords?: string[],
  contentType = 'audio/mpeg',
): Promise<DeepgramResponse> {
  const audioBuffer = readFileSync(audioPath);

  const url = new URL('https://api.deepgram.com/v1/listen');
  url.searchParams.set('model', model);
  url.searchParams.set('language', 'en');
  url.searchParams.set('smart_format', 'true');
  url.searchParams.set('punctuate', 'true');

  // Keywords boost recognition for live concert audio
  if (keywords && keywords.length > 0 && model !== 'whisper-large') {
    // Keywords only supported on nova models, not whisper
    for (const kw of keywords) {
      url.searchParams.append('keywords', `${kw}:2`);
    }
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': contentType,
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram API error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<DeepgramResponse>;
}

// ─── Transform Deepgram response → alignment format ───

function transformResponse(
  songName: string,
  trackId: string,
  dgResponse: DeepgramResponse,
  model: string,
): AlignmentOutput {
  const channel = dgResponse.results.channels[0];
  if (!channel || !channel.alternatives.length) {
    return { songName, trackId, source: `deepgram-${model}`, words: [] };
  }

  const dgWords = channel.alternatives[0].words;
  const words: AlignedWord[] = dgWords.map(w => ({
    word: w.word.toLowerCase().replace(/[^a-z']/g, ''),
    start: Math.round(w.start * 1000) / 1000,
    end: Math.round(w.end * 1000) / 1000,
    score: Math.round(w.confidence * 100) / 100,
  })).filter(w => w.word.length > 0);

  return {
    songName,
    trackId,
    source: `deepgram-${model}`,
    words,
  };
}

// ─── Process a single track ───

async function processTrack(song: SetlistSong): Promise<'aligned' | 'skipped' | 'failed'> {
  const { trackId, title, audioFile } = song;
  const outPath = resolve(OUTPUT_DIR, `${trackId}-alignment.json`);

  // Skip instrumentals
  if (INSTRUMENTAL_TRACKS.has(trackId)) {
    console.log(`  ○ ${trackId} (${title}) — instrumental, skipped`);
    return 'skipped';
  }

  // Skip existing unless --force
  if (!force && existsSync(outPath)) {
    try {
      const existing = JSON.parse(readFileSync(outPath, 'utf-8'));
      if (existing.source?.startsWith('deepgram-')) {
        console.log(`  ○ ${trackId} (${title}) — already aligned with Deepgram, skipped`);
        return 'skipped';
      }
    } catch { /* fall through to re-align */ }
    console.log(`  ○ ${trackId} (${title}) — exists (heuristic), skipped (use --force to overwrite)`);
    return 'skipped';
  }

  // Find audio file — prefer vocal stem if available
  const vocalStemPath = resolve(STEMS_DIR, trackId, 'vocals.wav');
  const fullMixPath = resolve(AUDIO_DIR, audioFile);
  const useVocalStem = existsSync(vocalStemPath);
  const audioPath = useVocalStem ? vocalStemPath : fullMixPath;
  const contentType = useVocalStem ? 'audio/wav' : 'audio/mpeg';

  if (!existsSync(audioPath)) {
    console.log(`  ✗ ${trackId} (${title}) — audio file not found: ${audioFile}`);
    return 'failed';
  }

  // Load lyrics keywords for boosting
  const keywords = loadLyricsKeywords(title);

  // Call Deepgram
  const startTime = Date.now();
  const sourceLabel = useVocalStem ? 'vocal stem' : 'full mix';
  console.log(`  ⋯ ${trackId} (${title}) — sending to Deepgram (${modelArg}, ${sourceLabel})...`);

  try {
    const dgResponse = await transcribeWithDeepgram(audioPath, modelArg, keywords, contentType);
    const alignment = transformResponse(title, trackId, dgResponse, modelArg);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Compute duration from metadata or last word
    const duration = dgResponse.metadata?.duration
      ?? (alignment.words.length > 0 ? alignment.words[alignment.words.length - 1].end : 0);

    if (alignment.words.length === 0) {
      console.log(`  ⚠ ${trackId} (${title}) — 0 words detected in ${duration.toFixed(0)}s audio (${elapsed}s API time)`);
      console.log(`    Model ${modelArg} could not detect vocals. Try --model=whisper-large for music+vocals.`);
      // Still write the file so --force isn't needed to retry with different model
      mkdirSync(OUTPUT_DIR, { recursive: true });
      writeFileSync(outPath, JSON.stringify(alignment, null, 2), 'utf-8');
      return 'failed';
    }

    // Log first word timing for verification
    const firstWord = alignment.words[0];
    console.log(`    first word: "${firstWord.word}" at ${firstWord.start}s`);

    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(outPath, JSON.stringify(alignment, null, 2), 'utf-8');
    console.log(`  ✓ ${trackId} (${title}) — ${alignment.words.length} words, ${duration.toFixed(0)}s audio, ${elapsed}s API time`);
    return 'aligned';
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`  ✗ ${trackId} (${title}) — failed after ${elapsed}s: ${err instanceof Error ? err.message : err}`);
    return 'failed';
  }
}

// ─── Main ───

async function main() {
  console.log(`\nDeepgram Lyric Alignment (model: ${modelArg})\n`);

  const setlistPath = resolve(VISUALIZER_DIR, 'data', 'setlist.json');
  if (!existsSync(setlistPath)) {
    console.error('Error: setlist.json not found at', setlistPath);
    process.exit(1);
  }

  const setlist: Setlist = JSON.parse(readFileSync(setlistPath, 'utf-8'));
  let songs = setlist.songs;

  // Filter to single track if specified
  if (trackArg) {
    const song = songs.find(s => s.trackId === trackArg);
    if (!song) {
      console.error(`Error: track ${trackArg} not found in setlist`);
      process.exit(1);
    }
    songs = [song];
  }

  console.log(`  Show: ${setlist.date}`);
  console.log(`  Tracks: ${songs.length}${trackArg ? ` (filtered to ${trackArg})` : ''}`);
  console.log(`  Force: ${force}`);
  console.log('');

  let aligned = 0;
  let skipped = 0;
  let failed = 0;

  // Sequential processing — one song at a time
  for (const song of songs) {
    const result = await processTrack(song);
    if (result === 'aligned') aligned++;
    else if (result === 'skipped') skipped++;
    else failed++;
  }

  console.log(`\nDone: ${aligned} aligned, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
