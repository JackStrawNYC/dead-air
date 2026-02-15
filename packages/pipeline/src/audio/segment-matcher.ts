import { basename } from 'path';
import { createLogger } from '@dead-air/core';
import type { SetlistSong, SongSegment } from '@dead-air/core';
import { getAudioInfo } from './ffmpeg.js';

const log = createLogger('audio:segment-matcher');

/**
 * Match pre-segmented audio files to setlist songs by position.
 * Files are sorted alphabetically (d1t01, d1t02...) which maps to setlist order.
 */
export async function matchPreSegmentedFiles(
  audioFiles: string[],
  setlist: SetlistSong[],
  description?: string,
): Promise<SongSegment[]> {
  // If no setlist from API, try parsing from description
  let songs = setlist;
  if (songs.length === 0 && description) {
    songs = parseSetlistFromDescription(description);
  }

  const segments: SongSegment[] = [];

  for (let i = 0; i < audioFiles.length; i++) {
    const filePath = audioFiles[i];
    const info = await getAudioInfo(filePath);
    const songName =
      i < songs.length
        ? songs[i].songName
        : `Track ${String(i + 1).padStart(2, '0')}`;

    segments.push({
      songName,
      startTime: 0, // relative to this file
      endTime: info.durationSec,
      duration: info.durationSec,
      filePath,
    });
  }

  log.info(`Matched ${segments.length} files to songs`);
  return segments;
}

/**
 * Build segments from silence boundaries for a continuous file.
 */
export function buildSegmentsFromSilence(
  filePaths: string[],
  durations: number[],
  setlist: SetlistSong[],
): SongSegment[] {
  const segments: SongSegment[] = [];

  for (let i = 0; i < filePaths.length; i++) {
    const songName =
      i < setlist.length
        ? setlist[i].songName
        : `Track ${String(i + 1).padStart(2, '0')}`;

    segments.push({
      songName,
      startTime: 0,
      endTime: durations[i] ?? 0,
      duration: durations[i] ?? 0,
      filePath: filePaths[i],
    });
  }

  return segments;
}

/**
 * Parse a setlist from Archive.org description text.
 * Format: "Set 1 song1, song2, song3 > song4 Set 2 song5, song6 E: song7"
 */
export function parseSetlistFromDescription(
  description: string,
): SetlistSong[] {
  if (!description) return [];

  const songs: SetlistSong[] = [];
  let position = 0;

  // Match "Set 1 ...", "Set 2 ...", "Set 3 ...", "E: ...", "Encore: ..."
  const setPattern =
    /(?:Set\s+(\d+)|E(?:ncore)?\s*:?\s*)([\s\S]+?)(?=Set\s+\d+|E(?:ncore)?\s*:|$)/gi;

  let match;
  while ((match = setPattern.exec(description)) !== null) {
    const setNumber = match[1] ? parseInt(match[1], 10) : 99; // 99 = encore
    const songText = match[2].trim();

    // Split by comma, handling " > " as segue indicator
    const parts = songText.split(/,/).map((s) => s.trim()).filter(Boolean);

    for (const part of parts) {
      // Handle segues: "Scarlet Begonias > Fire On The Mountain"
      const segueSegments = part.split(/\s*>\s*/);

      for (let i = 0; i < segueSegments.length; i++) {
        const name = segueSegments[i].trim();
        if (!name || name.length < 2) continue;

        // Skip venue/date suffixes that sometimes appear
        if (/^\d{4}$/.test(name) || /university|hall|arena|theater/i.test(name)) continue;

        position++;
        songs.push({
          songName: name,
          setNumber,
          position,
          isSegue: i < segueSegments.length - 1,
        });
      }
    }
  }

  if (songs.length > 0) {
    log.info(`Parsed ${songs.length} songs from description`);
  }

  return songs;
}
