import { createLogger } from '@dead-air/core';
import type { SetlistSong } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';

const log = createLogger('setlist-client');
const rateLimit = createRateLimiter(500); // 2 req/sec

export interface VenueInfo {
  name: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface SetlistResult {
  songs: SetlistSong[];
  venue: VenueInfo;
  tour?: string;
  setlistFmUrl?: string;
}

/**
 * Convert YYYY-MM-DD to DD-MM-YYYY (Setlist.fm format).
 */
function toSetlistFmDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
}

/**
 * Fetch setlist for a Grateful Dead show on the given date.
 * Returns null if no API key configured or no setlist found.
 */
export async function fetchSetlist(
  date: string,
  apiKey?: string,
): Promise<SetlistResult | null> {
  if (!apiKey) {
    log.warn('No SETLISTFM_API_KEY configured, skipping setlist fetch');
    return null;
  }

  await rateLimit();

  const sfmDate = toSetlistFmDate(date);
  const url = `https://api.setlist.fm/rest/1.0/search/setlists?artistName=Grateful+Dead&date=${sfmDate}`;

  log.info(`Fetching setlist from Setlist.fm for ${date}...`);

  const res = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 404) {
      log.warn(`No setlist found for ${date}`);
      return null;
    }
    log.error(`Setlist.fm API error: ${res.status} ${res.statusText}`);
    return null;
  }

  const data = (await res.json()) as {
    setlist?: Array<{
      url?: string;
      venue?: {
        name?: string;
        city?: {
          name?: string;
          state?: string;
          stateCode?: string;
          coords?: { lat?: number; long?: number };
          country?: { name?: string; code?: string };
        };
      };
      tour?: { name?: string };
      sets?: {
        set?: Array<{
          name?: string;
          encore?: number;
          song?: Array<{
            name?: string;
            cover?: { name?: string };
            info?: string;
            tape?: boolean;
          }>;
        }>;
      };
    }>;
  };

  const setlists = data.setlist;
  if (!setlists || setlists.length === 0) {
    log.warn(`No setlist found for ${date}`);
    return null;
  }

  const setlist = setlists[0];
  const sets = setlist.sets?.set ?? [];

  // Flatten sets into SetlistSong[]
  const songs: SetlistSong[] = [];
  let globalPosition = 0;

  for (const set of sets) {
    const setNumber = set.encore ? set.encore + 2 : (sets.indexOf(set) + 1);
    const setSongs = set.song ?? [];

    for (let i = 0; i < setSongs.length; i++) {
      const song = setSongs[i];
      globalPosition++;
      songs.push({
        songName: song.name ?? 'Unknown',
        setNumber,
        position: globalPosition,
        isSegue: false, // Setlist.fm doesn't reliably indicate segues
        coverArtist: song.cover?.name,
      });
    }
  }

  // Extract venue info
  const venueData = setlist.venue;
  const cityData = venueData?.city;
  const venue: VenueInfo = {
    name: venueData?.name ?? 'Unknown Venue',
    city: cityData?.name ?? 'Unknown City',
    state: cityData?.stateCode ?? cityData?.state ?? '',
    country: cityData?.country?.code ?? 'US',
    latitude: cityData?.coords?.lat ?? 0,
    longitude: cityData?.coords?.long ?? 0,
  };

  log.info(
    `Setlist: ${songs.length} songs across ${sets.length} sets at ${venue.name}`,
  );

  return {
    songs,
    venue,
    tour: setlist.tour?.name,
    setlistFmUrl: setlist.url,
  };
}
