import { createLogger } from '@dead-air/core';
import type { SongStatistic } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';

const log = createLogger('research:song-stats');

const rateLimit = createRateLimiter(1100); // >1 req/sec (setlist.fm is strict)

/** Grateful Dead setlist.fm MBID */
const GD_MBID = '6faa7ca7-0d99-4a5e-bfa6-1fd5037520c6';

interface SetlistFmSetlist {
  eventDate?: string;
  venue?: {
    name?: string;
    city?: {
      name?: string;
      state?: string;
    };
  };
  sets?: {
    set?: Array<{
      song?: Array<{
        name?: string;
      }>;
    }>;
  };
}

interface SetlistFmResponse {
  total?: number;
  setlist?: SetlistFmSetlist[];
}

/**
 * Fetch song statistics from setlist.fm API.
 *
 * The setlist.fm search API does not support per-song filtering by artist, so we
 * take a targeted approach: query the specific show by date to verify the setlist
 * and extract the confirmed song list. Claude then uses its training knowledge for
 * play counts (which is accurate for the well-documented Grateful Dead catalog).
 *
 * Rate limited to 1 req/sec per setlist.fm requirements (max 1440/day).
 * Gracefully returns empty array on error.
 */
export async function fetchSongStats(
  songNames: string[],
  apiKey: string,
  showDate?: string,
): Promise<SongStatistic[]> {
  if (!apiKey) {
    log.warn('No setlist.fm API key provided, skipping song stats');
    return [];
  }

  if (!showDate) {
    log.warn('No show date provided, skipping setlist.fm verification');
    return [];
  }

  const stats: SongStatistic[] = [];

  try {
    await rateLimit();

    // setlist.fm date format is DD-MM-YYYY
    const [year, month, day] = showDate.split('-');
    const formattedDate = `${day}-${month}-${year}`;

    const url = new URL('https://api.setlist.fm/rest/1.0/search/setlists');
    url.searchParams.set('artistMbid', GD_MBID);
    url.searchParams.set('date', formattedDate);
    url.searchParams.set('p', '1');

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'x-api-key': apiKey,
      },
    });

    if (!response.ok) {
      log.warn(`setlist.fm request failed for date ${showDate}: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as SetlistFmResponse;
    const setlist = data.setlist?.[0];

    if (!setlist) {
      log.info(`No setlist.fm entry for ${showDate}`);
      return [];
    }

    const venue = setlist.venue;
    log.info(
      `setlist.fm verified ${showDate}: ${venue?.name ?? 'unknown venue'}, ${venue?.city?.name ?? ''} ${venue?.city?.state ?? ''}`,
    );

    // Extract confirmed songs from setlist.fm
    const confirmedSongs = setlist.sets?.set?.flatMap(
      (s) => s.song?.map((song) => song.name).filter(Boolean) ?? [],
    ) ?? [];

    log.info(`setlist.fm confirmed ${confirmedSongs.length} songs: ${confirmedSongs.join(', ')}`);

    // Build stats entries for confirmed songs (play counts left for Claude)
    for (const songName of songNames) {
      const confirmed = confirmedSongs.some(
        (cs) => cs?.toLowerCase() === songName.toLowerCase(),
      );

      stats.push({
        songName,
        timesPlayed: 0, // Claude will fill from knowledge; 0 = "use your knowledge"
        firstPlayed: confirmed ? 'confirmed' : 'unconfirmed',
        lastPlayed: showDate,
      });
    }
  } catch (err) {
    log.warn(`Failed to fetch setlist.fm data: ${(err as Error).message}`);
  }

  log.info(`Verified ${stats.length}/${songNames.length} songs via setlist.fm`);
  return stats;
}
