import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createLogger } from '@dead-air/core';
import type {
  AudioAnalysis,
  SongSegment,
  SongAnalysisData,
  PeakMoment,
  SetlistSong,
} from '@dead-air/core';
import type Database from 'better-sqlite3';

const log = createLogger('script:context');

// ── Public types ──

export interface ShowContext {
  show: {
    date: string;
    venue: string | null;
    city: string | null;
    state: string | null;
    source: string | null;
    tour: string | null;
    archiveDescription: string | null;
  };
  setlist: SongSummary[];
  peakMoments: PeakMomentContext[];
  weather: WeatherContext | null;
  totalDurationMin: number;
}

export interface SongSummary {
  songName: string;
  setNumber: number;
  position: number;
  isSegue: boolean;
  durationSec: number;
  bpm: number;
  key: string | null;
  energyMean: number;
  energyMax: number;
  energyCurve: 'building' | 'steady' | 'declining' | 'peaks_and_valleys';
}

export interface PeakMomentContext {
  songName: string;
  timestampInSong: number;
  intensity: number;
  description: string;
}

interface WeatherContext {
  tempHighC: number;
  tempLowC: number;
  description: string;
}

// ── Helpers ──

function classifyEnergyCurve(
  energy: number[],
): 'building' | 'steady' | 'declining' | 'peaks_and_valleys' {
  if (energy.length < 4) return 'steady';

  const q = Math.floor(energy.length / 4);
  const quartiles = [
    energy.slice(0, q),
    energy.slice(q, 2 * q),
    energy.slice(2 * q, 3 * q),
    energy.slice(3 * q),
  ].map((arr) => arr.reduce((a, b) => a + b, 0) / arr.length);

  const overall = energy.reduce((a, b) => a + b, 0) / energy.length;
  const range = Math.max(...quartiles) - Math.min(...quartiles);

  if (range < overall * 0.15) return 'steady';
  if (quartiles[3] > quartiles[0] * 1.3) return 'building';
  if (quartiles[0] > quartiles[3] * 1.3) return 'declining';
  return 'peaks_and_valleys';
}

function summarizeSong(
  song: SetlistSong,
  analysis: SongAnalysisData | undefined,
  segDuration: number | undefined,
): SongSummary {
  const energy = analysis?.energy ?? [];
  const mean =
    energy.length > 0
      ? energy.reduce((a, b) => a + b, 0) / energy.length
      : 0;
  const max = energy.length > 0 ? Math.max(...energy) : 0;

  return {
    songName: song.songName,
    setNumber: song.setNumber,
    position: song.position,
    isSegue: song.isSegue,
    durationSec: Math.round(analysis?.durationSec ?? segDuration ?? 0),
    bpm: analysis?.bpm?.[0] ?? 0,
    key: analysis?.key ?? null,
    energyMean: Math.round(mean * 100) / 100,
    energyMax: Math.round(max * 100) / 100,
    energyCurve: classifyEnergyCurve(energy),
  };
}

function localizePeakMoments(
  peaks: PeakMoment[],
  segments: SongSegment[],
): PeakMomentContext[] {
  // Build cumulative offsets from segment order
  let cumulativeOffset = 0;
  const offsets: { songName: string; offset: number; duration: number }[] = [];
  for (const seg of segments) {
    offsets.push({
      songName: seg.songName,
      offset: cumulativeOffset,
      duration: seg.duration,
    });
    cumulativeOffset += seg.duration;
  }

  return peaks.map((peak) => {
    for (const { songName, offset, duration } of offsets) {
      if (
        peak.timestamp >= offset &&
        peak.timestamp < offset + duration
      ) {
        return {
          songName,
          timestampInSong: Math.round(peak.timestamp - offset),
          intensity: peak.intensity,
          description: peak.description,
        };
      }
    }
    return {
      songName: segments[0]?.songName ?? 'Unknown',
      timestampInSong: Math.round(peak.timestamp),
      intensity: peak.intensity,
      description: peak.description,
    };
  });
}

// ── Main ──

export function assembleContext(
  db: Database.Database,
  date: string,
  dataDir: string,
): ShowContext {
  // 1. Load show from DB
  const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(date) as
    | Record<string, unknown>
    | undefined;
  if (!show) {
    throw new Error(
      `No show found for date ${date}. Run 'deadair ingest ${date}' first.`,
    );
  }

  const metadata = JSON.parse((show.metadata as string) ?? '{}');

  // 2. Load analysis from disk
  const analysisPath = resolve(dataDir, 'analysis', date, 'analysis.json');
  if (!existsSync(analysisPath)) {
    throw new Error(
      `No analysis found for ${date}. Run 'deadair analyze ${date}' first.`,
    );
  }

  const analysis: AudioAnalysis = JSON.parse(
    readFileSync(analysisPath, 'utf-8'),
  );

  // 3. Build setlist — prefer DB setlist, fall back to analysis segments
  let setlistSongs: SetlistSong[] = [];
  if (show.setlist) {
    setlistSongs = JSON.parse(show.setlist as string);
  }
  if (setlistSongs.length === 0) {
    // Build from analysis segments (all set 1, no segue info)
    setlistSongs = analysis.songSegments.map((seg, i) => ({
      songName: seg.songName,
      setNumber: 1,
      position: i + 1,
      isSegue: false,
    }));
  }

  // 4. Create analysis lookup maps
  const analysisMap = new Map<string, SongAnalysisData>();
  for (const sa of analysis.perSongAnalysis) {
    analysisMap.set(sa.songName, sa);
  }
  const segDurationMap = new Map<string, number>();
  for (const seg of analysis.songSegments) {
    segDurationMap.set(seg.songName, seg.duration);
  }

  // 5. Summarize songs
  const songs = setlistSongs.map((s) =>
    summarizeSong(s, analysisMap.get(s.songName), segDurationMap.get(s.songName)),
  );

  // 6. Localize peak moments
  const peaks = localizePeakMoments(
    analysis.peakMoments,
    analysis.songSegments,
  );

  // 7. Weather
  let weather: WeatherContext | null = null;
  if (show.weather) {
    const w = JSON.parse(show.weather as string);
    weather = {
      tempHighC: w.tempMaxC ?? w.tempHighC,
      tempLowC: w.tempMinC ?? w.tempLowC,
      description: w.description ?? '',
    };
  }

  // 8. Total duration
  const totalSec = analysis.songSegments.reduce(
    (sum, s) => sum + s.duration,
    0,
  );

  const ctx: ShowContext = {
    show: {
      date,
      venue: (show.venue as string) || null,
      city: (show.city as string) || null,
      state: (show.state as string) || null,
      source: (show.recording_source as string) || null,
      tour: metadata.tour ?? null,
      archiveDescription: metadata.archiveOrgDescription
        ? (metadata.archiveOrgDescription as string).slice(0, 500)
        : null,
    },
    setlist: songs,
    peakMoments: peaks,
    weather,
    totalDurationMin: Math.round(totalSec / 60),
  };

  log.info(
    `Assembled context: ${songs.length} songs, ${peaks.length} peaks, ~${JSON.stringify(ctx).length} chars`,
  );

  return ctx;
}
