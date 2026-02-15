import { createLogger } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';

const log = createLogger('assets:archival');

export interface ArchivalAsset {
  identifier: string;
  title: string;
  url: string;
  thumbnailUrl: string;
}

const rateLimit = createRateLimiter(1000); // 1 req/sec for Archive.org

/**
 * Search Archive.org for show-related archival assets (photos, posters).
 */
export async function searchArchivalAssets(options: {
  showDate: string;
  venue?: string | null;
  maxResults?: number;
}): Promise<ArchivalAsset[]> {
  const { showDate, venue, maxResults = 5 } = options;

  const assets: ArchivalAsset[] = [];

  // Search for Grateful Dead images from the show date
  const query = venue
    ? `"grateful dead" AND "${venue}" AND mediatype:image`
    : `collection:GratefulDead AND date:${showDate} AND mediatype:image`;

  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier,title&rows=${maxResults}&output=json`;

  try {
    await rateLimit();
    const response = await fetch(url);
    if (!response.ok) {
      log.warn(`Archive.org search failed: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as {
      response: { docs: Array<{ identifier: string; title: string }> };
    };

    for (const doc of data.response.docs) {
      assets.push({
        identifier: doc.identifier,
        title: doc.title,
        url: `https://archive.org/details/${doc.identifier}`,
        thumbnailUrl: `https://archive.org/services/img/${doc.identifier}`,
      });
    }

    log.info(`Found ${assets.length} archival assets for ${showDate}`);
  } catch (err) {
    log.warn(`Archival search error: ${(err as Error).message}`);
  }

  return assets;
}

/**
 * Download an archival asset image.
 */
export async function downloadArchivalAsset(
  thumbnailUrl: string,
  destPath: string,
): Promise<Buffer | null> {
  try {
    await rateLimit();
    const response = await fetch(thumbnailUrl);
    if (!response.ok) {
      log.warn(`Failed to download archival asset: ${response.status}`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
  } catch (err) {
    log.warn(`Archival download error: ${(err as Error).message}`);
    return null;
  }
}
