import { resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { createLogger, logCost } from '@dead-air/core';
import type Database from 'better-sqlite3';

const log = createLogger('assets:audio');

// Replicate MusicGen pricing: ~$0.032 per generation (30s clip)
const COST_PER_GENERATION = 0.032;

export interface AudioGenOptions {
  episodeId: string;
  db: Database.Database;
  dataDir: string;
  replicateToken: string;
  force?: boolean;
}

interface MusicGenInput {
  prompt: string;
  duration: number;
  outputPath: string;
  fileName: string;
}

/**
 * Generate audio via Replicate MusicGen model.
 */
async function generateMusicGen(
  prompt: string,
  durationSec: number,
  replicateToken: string,
): Promise<Buffer> {
  log.info(`Generating audio (${durationSec}s): "${prompt.slice(0, 60)}..."`);

  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${replicateToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: 'b05b1dff1d8c6dc63d14b0cdb42135571e41c36a06d7f5f4dab2c87c80e9c4b6',
      input: {
        prompt,
        duration: durationSec,
        model_version: 'stereo-melody-large',
        output_format: 'mp3',
        normalization_strategy: 'loudness',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Replicate API error: ${response.status} ${await response.text()}`);
  }

  const prediction = await response.json() as { id: string; urls: { get: string } };

  // Poll for completion
  let result: { status: string; output?: string; error?: string } = { status: 'starting' };
  const pollUrl = prediction.urls.get;

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollResp = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${replicateToken}` },
    });
    result = await pollResp.json() as typeof result;

    if (result.status === 'succeeded' && result.output) break;
    if (result.status === 'failed') throw new Error(`MusicGen failed: ${result.error}`);
  }

  if (!result.output) throw new Error('MusicGen timed out');

  // Download the audio
  const audioResp = await fetch(result.output);
  if (!audioResp.ok) throw new Error(`Failed to download audio: ${audioResp.status}`);

  return Buffer.from(await audioResp.arrayBuffer());
}

/**
 * Generate ambient pad audio files for the episode.
 *
 * Creates:
 * - venue-room-tone.mp3 — quiet venue ambience for narration/context segments
 * - tape-warble.mp3 — analog tape imperfection texture
 * - late-night-crowd.mp3 — second set energy crowd ambience
 */
export async function generateAmbientPads(options: AudioGenOptions): Promise<string[]> {
  const { dataDir, replicateToken, force = false, db, episodeId } = options;

  const ambientDir = resolve(dataDir, 'assets', 'ambient');
  if (!existsSync(ambientDir)) mkdirSync(ambientDir, { recursive: true });

  const pads: MusicGenInput[] = [
    {
      prompt: 'ambient room tone, quiet indoor venue, subtle reverb, warm low frequency hum, no melody, no rhythm, concert hall atmosphere, 1970s analog recording quality',
      duration: 30,
      outputPath: resolve(ambientDir, 'venue-room-tone.mp3'),
      fileName: 'venue-room-tone.mp3',
    },
    {
      prompt: 'analog tape warble, gentle wow and flutter, vinyl record surface noise, warm tape hiss, 1970s recording artifacts, no music, pure texture',
      duration: 30,
      outputPath: resolve(ambientDir, 'tape-warble.mp3'),
      fileName: 'tape-warble.mp3',
    },
    {
      prompt: 'outdoor concert crowd ambience, late night, scattered conversations, gentle evening atmosphere, distant laughter, summer night, 1970s Grateful Dead concert between songs',
      duration: 30,
      outputPath: resolve(ambientDir, 'late-night-crowd.mp3'),
      fileName: 'late-night-crowd.mp3',
    },
  ];

  const generated: string[] = [];
  let totalCost = 0;

  for (const pad of pads) {
    if (!force && existsSync(pad.outputPath)) {
      log.info(`Ambient pad exists: ${pad.fileName} — skipping`);
      generated.push(pad.outputPath);
      continue;
    }

    try {
      const buffer = await generateMusicGen(pad.prompt, pad.duration, replicateToken);
      writeFileSync(pad.outputPath, buffer);
      totalCost += COST_PER_GENERATION;
      generated.push(pad.outputPath);
      log.info(`Generated ambient pad: ${pad.fileName} (${buffer.length} bytes)`);
    } catch (err) {
      log.error(`Failed to generate ${pad.fileName}: ${err}`);
    }
  }

  if (totalCost > 0) {
    logCost(db, { episodeId, service: 'replicate', operation: 'ambient-pads', cost: totalCost });
  }

  log.info(`Generated ${generated.length}/${pads.length} ambient pads ($${totalCost.toFixed(3)})`);
  return generated;
}

/**
 * Generate BGM beds for narration segments.
 *
 * Creates:
 * - bgm-intro.mp3 — contemplative, documentary feel
 * - bgm-set-break.mp3 — transitional, reflective
 * - bgm-outro.mp3 — uplifting, legacy/gratitude
 */
export async function generateNarrationBGM(options: AudioGenOptions): Promise<string[]> {
  const { episodeId, dataDir, replicateToken, force = false, db } = options;

  const bgmDir = resolve(dataDir, 'assets', episodeId, 'bgm');
  if (!existsSync(bgmDir)) mkdirSync(bgmDir, { recursive: true });

  const tracks: MusicGenInput[] = [
    {
      prompt: 'gentle contemplative documentary background music, acoustic guitar and soft piano, warm nostalgic 1970s folk feel, slow tempo, ambient pad underneath, suitable for narration voiceover, Grateful Dead documentary style',
      duration: 60,
      outputPath: resolve(bgmDir, 'bgm-intro.mp3'),
      fileName: 'bgm-intro.mp3',
    },
    {
      prompt: 'reflective transitional music, gentle bass notes, soft Rhodes piano chords, mellow jazz feel, mid-tempo, warm analog tone, between-set intermission atmosphere, contemplative documentary background',
      duration: 45,
      outputPath: resolve(bgmDir, 'bgm-set-break.mp3'),
      fileName: 'bgm-set-break.mp3',
    },
    {
      prompt: 'uplifting warm documentary outro music, acoustic guitar arpeggios, gentle crescendo, hopeful nostalgic feel, folk rock influence, legacy and gratitude atmosphere, suitable as background for voiceover narration',
      duration: 45,
      outputPath: resolve(bgmDir, 'bgm-outro.mp3'),
      fileName: 'bgm-outro.mp3',
    },
  ];

  const generated: string[] = [];
  let totalCost = 0;

  for (const track of tracks) {
    if (!force && existsSync(track.outputPath)) {
      log.info(`BGM track exists: ${track.fileName} — skipping`);
      generated.push(track.outputPath);
      continue;
    }

    try {
      const buffer = await generateMusicGen(track.prompt, track.duration, replicateToken);
      writeFileSync(track.outputPath, buffer);
      totalCost += COST_PER_GENERATION;
      generated.push(track.outputPath);
      log.info(`Generated BGM track: ${track.fileName} (${buffer.length} bytes)`);
    } catch (err) {
      log.error(`Failed to generate ${track.fileName}: ${err}`);
    }
  }

  if (totalCost > 0) {
    logCost(db, { episodeId, service: 'replicate', operation: 'narration-bgm', cost: totalCost });
  }

  log.info(`Generated ${generated.length}/${tracks.length} BGM tracks ($${totalCost.toFixed(3)})`);
  return generated;
}

/**
 * Generate crowd reaction SFX for foley layer.
 *
 * Creates:
 * - crowd-cheer.mp3 — for energy peaks (> 0.85)
 * - crowd-roar.mp3 — for segue moments (Scarlet > Fire)
 * - scattered-clapping.mp3 — for between-song gaps
 */
export async function generateFoleySFX(options: AudioGenOptions): Promise<string[]> {
  const { dataDir, replicateToken, force = false, db, episodeId } = options;

  const sfxDir = resolve(dataDir, 'assets', 'sfx');
  if (!existsSync(sfxDir)) mkdirSync(sfxDir, { recursive: true });

  const effects: MusicGenInput[] = [
    {
      prompt: 'concert crowd cheering and applauding loudly, indoor venue, enthusiastic audience, 1970s live concert recording, raw authentic crowd noise, not studio, real audience reaction',
      duration: 10,
      outputPath: resolve(sfxDir, 'crowd-cheer.mp3'),
      fileName: 'crowd-cheer.mp3',
    },
    {
      prompt: 'massive concert crowd roaring and screaming with excitement, thunderous applause, peak concert moment, electric atmosphere, 1970s live recording quality, overwhelming audience response',
      duration: 8,
      outputPath: resolve(sfxDir, 'crowd-roar.mp3'),
      fileName: 'crowd-roar.mp3',
    },
    {
      prompt: 'scattered light applause and clapping, quiet crowd murmur, between songs at concert, relaxed audience, a few isolated claps, 1970s indoor venue atmosphere',
      duration: 10,
      outputPath: resolve(sfxDir, 'scattered-clapping.mp3'),
      fileName: 'scattered-clapping.mp3',
    },
  ];

  const generated: string[] = [];
  let totalCost = 0;

  for (const effect of effects) {
    if (!force && existsSync(effect.outputPath)) {
      log.info(`SFX exists: ${effect.fileName} — skipping`);
      generated.push(effect.outputPath);
      continue;
    }

    try {
      const buffer = await generateMusicGen(effect.prompt, effect.duration, replicateToken);
      writeFileSync(effect.outputPath, buffer);
      totalCost += COST_PER_GENERATION;
      generated.push(effect.outputPath);
      log.info(`Generated SFX: ${effect.fileName} (${buffer.length} bytes)`);
    } catch (err) {
      log.error(`Failed to generate ${effect.fileName}: ${err}`);
    }
  }

  if (totalCost > 0) {
    logCost(db, { episodeId, service: 'replicate', operation: 'foley-sfx', cost: totalCost });
  }

  log.info(`Generated ${generated.length}/${effects.length} SFX ($${totalCost.toFixed(3)})`);
  return generated;
}
