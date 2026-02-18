import { createLogger } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';

const log = createLogger('assets:flickr');
const rateLimit = createRateLimiter(1000);

const API_BASE = 'https://api.flickr.com/services/rest/';

// CC licenses safe for documentary use (attribution required):
// 4=CC BY 2.0, 5=CC BY-SA 2.0, 7=No known restrictions, 9=CC0, 10=PDM
const CC_LICENSES = '4,5,7,9,10';

export interface FlickrImage {
  id: string;
  title: string;
  url: string;
  ownerName: string;
  license: string;
}

interface FlickrSearchResponse {
  photos?: {
    photo?: Array<{
      id: string;
      secret: string;
      server: string;
      title: string;
      ownername?: string;
      license?: string;
    }>;
  };
}

/**
 * Search Flickr for Creative Commons licensed photos.
 * Requires FLICKR_API_KEY environment variable.
 *
 * The Grateful Dead are one of the most photographed bands in history —
 * Flickr CC has thousands of concert photos from fan photographers.
 */
export async function searchFlickrImages(options: {
  apiKey: string;
  query?: string;
  venue?: string;
  year?: string;
  maxResults?: number;
}): Promise<FlickrImage[]> {
  const { apiKey, venue, year, maxResults = 20 } = options;

  const allImages: FlickrImage[] = [];
  const seenIds = new Set<string>();

  // Multiple search strategies (most specific first)
  const queries: string[] = [];
  if (venue && year) {
    queries.push(`"Grateful Dead" "${venue}" ${year}`);
  }
  if (year) {
    queries.push(`"Grateful Dead" ${year} concert`);
  }
  queries.push('"Grateful Dead" concert live');
  queries.push('"Grateful Dead" 1977');

  for (const query of queries) {
    if (allImages.length >= maxResults) break;

    const remaining = maxResults - allImages.length;
    const params = new URLSearchParams({
      method: 'flickr.photos.search',
      api_key: apiKey,
      text: query,
      license: CC_LICENSES,
      media: 'photos',
      content_type: '1', // photos only (not screenshots)
      sort: 'relevance',
      per_page: String(remaining),
      extras: 'owner_name,license',
      format: 'json',
      nojsoncallback: '1',
    });

    try {
      await rateLimit();
      const response = await fetch(`${API_BASE}?${params}`);
      if (!response.ok) {
        log.warn(`Flickr search failed: ${response.status}`);
        continue;
      }

      const data = (await response.json()) as FlickrSearchResponse;
      const photos = data.photos?.photo ?? [];

      for (const photo of photos) {
        if (seenIds.has(photo.id)) continue;
        seenIds.add(photo.id);

        // Build large image URL (1024px on longest side)
        const url = `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_b.jpg`;

        allImages.push({
          id: photo.id,
          title: photo.title,
          url,
          ownerName: photo.ownername ?? 'Unknown',
          license: photo.license ?? 'cc',
        });
      }
    } catch (err) {
      log.warn(`Flickr search error for "${query}": ${(err as Error).message}`);
    }
  }

  log.info(`Found ${allImages.length} CC-licensed Flickr images`);
  return allImages.slice(0, maxResults);
}

export async function downloadFlickrImage(url: string): Promise<Buffer | null> {
  try {
    await rateLimit();
    const response = await fetch(url);
    if (!response.ok) {
      log.warn(`Failed to download Flickr image: ${response.status}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    log.warn(`Flickr download error: ${(err as Error).message}`);
    return null;
  }
}
