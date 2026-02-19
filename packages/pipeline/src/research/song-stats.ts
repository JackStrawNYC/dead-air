import { createLogger } from '@dead-air/core';
import type { SongStatistic } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';

const log = createLogger('research:song-stats');

const rateLimit = createRateLimiter(1100); // >1 req/sec (setlist.fm is strict)

/** Grateful Dead MusicBrainz ID */
const GD_MBID = '6faa7ca7-0d99-4a5e-bfa6-1fd5037571c3';

interface SetlistFmResponse {
  total?: number;
  setlist?: Array<{
    eventDate?: string;
  }>;
}

/**
 * Fetch song performance statistics from setlist.fm API.
 *
 * For each song, queries setlist.fm to get total play count and first/last appearance dates.
 * Rate limited to 1 req/sec per setlist.fm requirements.
 * Gracefully returns empty array on error.
 */
export async function fetchSongStats(
  songNames: string[],
  apiKey: string,
): Promise<SongStatistic[]> {
  if (!apiKey) {
    log.warn('No setlist.fm API key provided, skipping song stats');
    return [];
  }

  const stats: SongStatistic[] = [];

  for (const songName of songNames) {
    try {
      await rateLimit();

      const url = new URL('https://api.setlist.fm/rest/1.0/search/setlists');
      url.searchParams.set('artistMbid', GD_MBID);
      url.searchParams.set('songName', songName);
      url.searchParams.set('p', '1');

      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'x-api-key': apiKey,
        },
      });

      if (!response.ok) {
        log.warn(`setlist.fm request failed for "${songName}": ${response.status}`);
        continue;
      }

      const data = (await response.json()) as SetlistFmResponse;
      const total = data.total ?? 0;

      if (total === 0) {
        log.info(`No setlist.fm results for "${songName}"`);
        continue;
      }

      // First appearance from sorted results (API returns newest first)
      const dates = (data.setlist ?? [])
        .map((s) => s.eventDate)
        .filter((d): d is string => !!d)
        .map((d) => {
          // setlist.fm dates are DD-MM-YYYY format
          const [day, month, year] = d.split('-');
          return `${year}-${month}-${day}`;
        })
        .sort();

      const firstPlayed = dates.length > 0 ? dates[0] : 'unknown';
      // For last played, we need the most recent — but we only have page 1
      // The first result from the API (newest first) is the most recent
      const lastPlayedRaw = (data.setlist ?? [])[0]?.eventDate;
      let lastPlayed = 'unknown';
      if (lastPlayedRaw) {
        const [day, month, year] = lastPlayedRaw.split('-');
        lastPlayed = `${year}-${month}-${day}`;
      }

      stats.push({
        songName,
        timesPlayed: total,
        firstPlayed,
        lastPlayed,
      });

      log.info(`"${songName}": ${total} performances (${firstPlayed} to ${lastPlayed})`);
    } catch (err) {
      log.warn(`Failed to fetch stats for "${songName}": ${(err as Error).message}`);
    }
  }

  log.info(`Fetched stats for ${stats.length}/${songNames.length} songs`);
  return stats;
}
