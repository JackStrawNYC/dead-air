/**
 * Audio analysis lookups — find concert audio, energy data, onsets, centroids, music bounds.
 * Extracted from composition-builder.ts.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { createLogger } from '@dead-air/core';
import type { AudioAnalysis } from '@dead-air/core';
import { matchSongName } from './song-matcher.js';

const log = createLogger('render:audio-lookup');
const FPS = 30;

export function findConcertAudio(
  songName: string,
  analysis: AudioAnalysis,
  dataDir: string,
): { audioSrc: string; filePath: string } | null {
  const seg = analysis.songSegments.find(
    (s) => matchSongName(songName, s.songName),
  );
  if (!seg) return null;

  const absPath = seg.filePath;

  // Try the absolute path first (works when rendering on same machine)
  if (existsSync(absPath)) {
    if (absPath.startsWith(dataDir)) {
      const relPath = absPath.slice(dataDir.length).replace(/^\//, '');
      return { audioSrc: relPath, filePath: absPath };
    }
    return { audioSrc: absPath, filePath: absPath };
  }

  // Absolute path doesn't exist (e.g. rendering on EC2) — resolve by filename relative to dataDir
  const filename = absPath.split('/').pop();
  if (filename) {
    // Extract the show date directory from the original path (e.g. "1977-05-08")
    const pathParts = absPath.split('/');
    const audioIdx = pathParts.indexOf('audio');
    if (audioIdx >= 0 && audioIdx + 1 < pathParts.length) {
      const showDate = pathParts[audioIdx + 1];
      const relPath = `audio/${showDate}/${filename}`;
      const resolvedPath = resolve(dataDir, relPath);
      if (existsSync(resolvedPath)) {
        return { audioSrc: relPath, filePath: resolvedPath };
      }
    }
  }

  return null;
}

export function findEnergyData(songName: string, analysis: AudioAnalysis): number[] | undefined {
  const data = analysis.perSongAnalysis.find(
    (s) => matchSongName(songName, s.songName),
  );
  return data?.energy;
}

/**
 * Find onset timings for a song and convert from seconds to frames.
 * Onsets are filtered to only include strong onsets (>10Hz minimum gap).
 */
export function findOnsetFrames(
  songName: string,
  analysis: AudioAnalysis,
  startTimeSec: number,
  excerptDuration: number,
): number[] | undefined {
  const data = analysis.perSongAnalysis.find(
    (s) => matchSongName(songName, s.songName),
  );
  if (!data?.onsets || data.onsets.length === 0) return undefined;

  // Filter to only onsets within excerpt window, offset to segment-local frames
  const endTimeSec = startTimeSec + excerptDuration;
  const onsetFrames = data.onsets
    .filter((sec) => sec >= startTimeSec && sec <= endTimeSec)
    .map((sec) => Math.round((sec - startTimeSec) * FPS));

  // Thin out onsets: minimum 3-frame gap to avoid visual noise
  const thinned: number[] = [];
  let lastFrame = -10;
  for (const f of onsetFrames) {
    if (f - lastFrame >= 3) {
      thinned.push(f);
      lastFrame = f;
    }
  }

  return thinned.length > 0 ? thinned : undefined;
}

/**
 * Find spectral centroid data for a song, sliced to excerpt window.
 */
export function findSpectralCentroid(
  songName: string,
  analysis: AudioAnalysis,
  startTimeSec: number,
  excerptDuration: number,
): number[] | undefined {
  const data = analysis.perSongAnalysis.find(
    (s) => matchSongName(songName, s.songName),
  );
  if (!data?.spectralCentroid || data.spectralCentroid.length === 0) return undefined;

  // Spectral centroid is sampled at ~10Hz (same as energy)
  const sampleRate = data.spectralCentroid.length / data.durationSec;
  const startIdx = Math.floor(startTimeSec * sampleRate);
  const endIdx = Math.min(
    Math.ceil((startTimeSec + excerptDuration) * sampleRate),
    data.spectralCentroid.length,
  );

  const sliced = data.spectralCentroid.slice(startIdx, endIdx);
  return sliced.length > 0 ? sliced : undefined;
}

/**
 * Find the actual musical content boundaries in a song.
 * Trims leading dead air (tuning, crowd noise) and trailing dead air
 * (applause, banter, tuning for next song).
 *
 * Uses energy threshold detection: music typically >0.08, dead air <0.08.
 * Requires 5 consecutive samples (~0.5s) above threshold to confirm music.
 *
 * Returns null if no analysis data available (caller should use full duration).
 */
export function findMusicBounds(
  songName: string,
  analysis: AudioAnalysis,
  opts?: { leadPadSec?: number; trailPadSec?: number },
): { startSec: number; endSec: number; trimmedDuration: number } | null {
  const data = analysis.perSongAnalysis.find(
    (s) => matchSongName(songName, s.songName),
  );
  if (!data || data.energy.length < 10) return null;

  const leadPad = opts?.leadPadSec ?? 1.0; // 1s before music starts
  const trailPad = opts?.trailPadSec ?? 4.0; // 4s after music ends (crowd reaction)
  const energy = data.energy;
  const sampleRate = energy.length / data.durationSec;
  const windowSize = 5; // ~0.5s of sustained energy
  const threshold = 0.08;

  // Find where music starts: first 5 consecutive samples above threshold
  let firstActive = 0;
  for (let i = 0; i < energy.length - windowSize; i++) {
    let allAbove = true;
    for (let j = 0; j < windowSize; j++) {
      if (energy[i + j] <= threshold) { allAbove = false; break; }
    }
    if (allAbove) {
      firstActive = i;
      break;
    }
  }

  // Find where music ends: last 5 consecutive samples above threshold
  let lastActive = energy.length - 1;
  for (let i = energy.length - 1; i >= windowSize - 1; i--) {
    let allAbove = true;
    for (let j = 0; j < windowSize; j++) {
      if (energy[i - j] <= threshold) { allAbove = false; break; }
    }
    if (allAbove) {
      lastActive = i;
      break;
    }
  }

  const musicStartSec = firstActive / sampleRate;
  const musicEndSec = lastActive / sampleRate;

  // Apply padding
  const startSec = Math.max(0, musicStartSec - leadPad);
  const endSec = Math.min(data.durationSec, musicEndSec + trailPad);

  return {
    startSec,
    endSec,
    trimmedDuration: endSec - startSec,
  };
}

export function findSmartExcerptStart(
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

export function findColdOpenMoment(
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

  const found = findConcertAudio(bestSongName, analysis, dataDir);
  if (!found) return null;

  const audioSrc = found.audioSrc;

  const startFromSec = Math.max(0, bestTimeSec - 1.5);

  log.info(`Cold open: "${bestSongName}" at ${bestTimeSec.toFixed(1)}s (energy: ${bestEnergy.toFixed(3)})`);

  return { audioSrc, startFromSec, songName: bestSongName, image: '' };
}
