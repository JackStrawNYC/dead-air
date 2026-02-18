import { createLogger } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';

const log = createLogger('assets:loc');
const rateLimit = createRateLimiter(1000);

export interface LocImage {
  id: string;
  title: string;
  url: string;
}

interface LocSearchResponse {
  results?: Array<{
    id?: string;
    title?: string;
    image_url?: string[];
  }>;
}

/**
 * Search the Library of Congress digital collections for public domain images.
 * No API key needed — LOC provides free, open access.
 *
 * Good for: 1970s Americana, concert venues, counterculture, campus life,
 * Ithaca/Cornell, and general era-appropriate documentary imagery.
 */
export async function searchLocImages(options: {
  query?: string;
  venue?: string;
  year?: string;
  maxResults?: number;
}): Promise<LocImage[]> {
  const { venue, year, maxResults = 15 } = options;

  const allImages: LocImage[] = [];
  const seenIds = new Set<string>();

  // Multiple search strategies
  const queries: string[] = [];

  // Direct band searches
  queries.push('grateful dead');

  // Venue and era searches (LOC has lots of documentary/photojournalism)
  if (venue) {
    queries.push(venue);
  }
  if (year) {
    queries.push(`rock concert ${year}`);
  }
  // Era-appropriate imagery
  queries.push('1970s rock concert');
  queries.push('1970s counterculture');

  for (const query of queries) {
    if (allImages.length >= maxResults) break;

    const remaining = maxResults - allImages.length;
    const url = `https://www.loc.gov/search/?q=${encodeURIComponent(query)}&fa=online-format:image&c=${remaining}&fo=json`;

    try {
      await rateLimit();
      const response = await fetch(url);
      if (!response.ok) {
        log.warn(`LOC search failed: ${response.status}`);
        continue;
      }

      const data = (await response.json()) as LocSearchResponse;
      const results = data.results ?? [];

      for (const result of results) {
        if (!result.id || seenIds.has(result.id)) continue;
        seenIds.add(result.id);

        // LOC provides image_url array — pick the largest
        const imageUrls = result.image_url ?? [];
        // Prefer full-size JPEG
        const imageUrl = imageUrls.find((u) => u.includes('/full/')) ??
          imageUrls.find((u) => /\.(jpg|jpeg|png)$/i.test(u)) ??
          imageUrls[0];

        if (!imageUrl) continue;

        allImages.push({
          id: result.id,
          title: result.title ?? 'LOC Image',
          url: imageUrl,
        });
      }
    } catch (err) {
      log.warn(`LOC search error for "${query}": ${(err as Error).message}`);
    }
  }

  log.info(`Found ${allImages.length} LOC public domain images`);
  return allImages.slice(0, maxResults);
}

export async function downloadLocImage(url: string): Promise<Buffer | null> {
  try {
    await rateLimit();
    const response = await fetch(url);
    if (!response.ok) {
      log.warn(`Failed to download LOC image: ${response.status}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    log.warn(`LOC download error: ${(err as Error).message}`);
    return null;
  }
}
