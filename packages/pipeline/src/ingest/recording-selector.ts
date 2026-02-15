import type { ArchiveSearchResult, ArchiveFile } from './archive-client.js';
import { createLogger } from '@dead-air/core';

const log = createLogger('recording-selector');

export interface RankedRecording extends ArchiveSearchResult {
  score: number;
  sourceType: 'SBD' | 'matrix' | 'AUD' | 'unknown';
}

/**
 * Detect source type from recording metadata text.
 */
function detectSourceType(
  recording: ArchiveSearchResult,
): 'SBD' | 'matrix' | 'AUD' | 'unknown' {
  const text =
    `${recording.source} ${recording.title} ${recording.description}`.toLowerCase();

  if (text.includes('soundboard') || text.includes(' sbd')) return 'SBD';
  if (text.includes('matrix')) return 'matrix';
  if (text.includes('audience') || text.includes(' aud')) return 'AUD';
  return 'unknown';
}

/**
 * Rank recordings by quality. Higher score = better.
 */
export function rankRecordings(
  recordings: ArchiveSearchResult[],
): RankedRecording[] {
  const ranked = recordings.map((rec) => {
    let score = 0;
    const sourceType = detectSourceType(rec);

    // Source type scoring
    switch (sourceType) {
      case 'SBD':
        score += 100;
        break;
      case 'matrix':
        score += 70;
        break;
      case 'AUD':
        score += 40;
        break;
      default:
        score += 20;
    }

    // Format bonus: FLAC available
    const formats = rec.format.map((f) => f.toLowerCase());
    if (formats.some((f) => f.includes('flac'))) {
      score += 20;
    }

    // Prefer recordings with more descriptive metadata
    if (rec.source && rec.source.length > 20) score += 5;
    if (rec.description && rec.description.length > 50) score += 5;

    return { ...rec, score, sourceType };
  });

  // Sort by score descending
  ranked.sort((a, b) => b.score - a.score);

  return ranked;
}

/**
 * Select the best recording from a list.
 */
export function selectBestRecording(
  recordings: ArchiveSearchResult[],
): RankedRecording | null {
  const ranked = rankRecordings(recordings);
  if (ranked.length === 0) return null;

  const best = ranked[0];
  log.info(
    `Best: ${best.identifier} (${best.sourceType}, score: ${best.score})`,
  );
  return best;
}

/**
 * From a recording's file list, select audio files to download.
 * Prefers FLAC, falls back to MP3. Skips derivative/metadata files.
 */
export function selectAudioFiles(
  files: ArchiveFile[],
  preferFormat: 'flac' | 'mp3' = 'flac',
): ArchiveFile[] {
  // Filter to original audio files only
  const audioFiles = files.filter((f) => {
    const format = f.format.toLowerCase();
    const name = f.name.toLowerCase();

    // Skip non-audio
    if (
      format.includes('metadata') ||
      format.includes('text') ||
      format.includes('image') ||
      format.includes('checksum')
    )
      return false;

    // Skip XML, txt, jpg, png, etc
    if (
      name.endsWith('.xml') ||
      name.endsWith('.txt') ||
      name.endsWith('.jpg') ||
      name.endsWith('.png') ||
      name.endsWith('.sqlite') ||
      name.endsWith('.torrent') ||
      name.endsWith('.ffp') ||
      name.endsWith('.md5') ||
      name.endsWith('.st5') ||
      name.endsWith('.cue')
    )
      return false;

    // Must be audio
    return (
      format.includes('flac') ||
      format.includes('mp3') ||
      format.includes('vbr') ||
      format.includes('ogg') ||
      format.includes('shn') ||
      name.endsWith('.flac') ||
      name.endsWith('.mp3') ||
      name.endsWith('.shn') ||
      name.endsWith('.ogg')
    );
  });

  // Group by format type
  const flacFiles = audioFiles.filter(
    (f) =>
      f.format.toLowerCase().includes('flac') || f.name.endsWith('.flac'),
  );
  const mp3Files = audioFiles.filter(
    (f) =>
      f.format.toLowerCase().includes('mp3') ||
      f.format.toLowerCase().includes('vbr') ||
      f.name.endsWith('.mp3'),
  );

  // Pick preferred format, fall back to other
  let selected: ArchiveFile[];
  if (preferFormat === 'flac') {
    selected = flacFiles.length > 0 ? flacFiles : mp3Files;
  } else {
    selected = mp3Files.length > 0 ? mp3Files : flacFiles;
  }

  // If neither, try original audio files
  if (selected.length === 0) {
    selected = audioFiles.filter((f) => f.source === 'original');
  }

  // Sort by filename for consistent ordering
  selected.sort((a, b) => a.name.localeCompare(b.name));

  const formatLabel = selected[0]?.format ?? 'unknown';
  log.info(`Selected ${selected.length} audio files (${formatLabel})`);

  return selected;
}
