import { createLogger } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';

const log = createLogger('assets:archival');

export interface ArchivalAsset {
  identifier: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  fullSizeUrl?: string;
  width?: number;
  height?: number;
  license?: string;
}

const rateLimit = createRateLimiter(1000); // 1 req/sec for Archive.org

interface ArchiveDoc {
  identifier: string;
  title: string;
}

interface ArchiveSearchResponse {
  response: { docs: ArchiveDoc[] };
}

interface ArchiveMetadataResponse {
  files?: Array<{
    name: string;
    source?: string;
    format?: string;
    width?: string;
    height?: string;
  }>;
  metadata?: {
    licenseurl?: string;
  };
}

/**
 * Search Archive.org for show-related archival assets (photos, posters).
 */
export async function searchArchivalAssets(options: {
  showDate: string;
  venue?: string | null;
  maxResults?: number;
}): Promise<ArchivalAsset[]> {
  const { showDate, venue, maxResults = 20 } = options;

  const assets: ArchivalAsset[] = [];
  const seenIds = new Set<string>();

  // Multiple search strategies
  const queries: string[] = [];

  // Strategy 1: Venue-specific search
  if (venue) {
    queries.push(`"grateful dead" AND "${venue}" AND mediatype:image`);
  }

  // Strategy 2: Date-based collection search
  const year = showDate.split('-')[0];
  queries.push(`collection:GratefulDead AND date:[${year}-01-01 TO ${year}-12-31] AND mediatype:image`);

  // Strategy 3: General Grateful Dead images
  queries.push(`"grateful dead" AND mediatype:image`);

  for (const query of queries) {
    if (assets.length >= maxResults) break;

    const remaining = maxResults - assets.length;
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier,title&rows=${remaining}&output=json`;

    try {
      await rateLimit();
      const response = await fetch(url);
      if (!response.ok) {
        log.warn(`Archive.org search failed: ${response.status}`);
        continue;
      }

      const data = (await response.json()) as ArchiveSearchResponse;

      for (const doc of data.response.docs) {
        if (seenIds.has(doc.identifier)) continue;
        seenIds.add(doc.identifier);

        const asset: ArchivalAsset = {
          identifier: doc.identifier,
          title: doc.title,
          url: `https://archive.org/details/${doc.identifier}`,
          thumbnailUrl: `https://archive.org/services/img/${doc.identifier}`,
        };

        // Try to get full-size image info
        try {
          const metaUrl = `https://archive.org/metadata/${doc.identifier}`;
          await rateLimit();
          const metaResponse = await fetch(metaUrl);
          if (metaResponse.ok) {
            const meta = (await metaResponse.json()) as ArchiveMetadataResponse;

            // Find the original image file
            const imageFile = meta.files?.find(
              (f) => f.source === 'original' && /\.(jpg|jpeg|png|gif|tif|tiff)$/i.test(f.name),
            );

            if (imageFile) {
              asset.fullSizeUrl = `https://archive.org/download/${doc.identifier}/${encodeURIComponent(imageFile.name)}`;
              if (imageFile.width) asset.width = parseInt(imageFile.width, 10);
              if (imageFile.height) asset.height = parseInt(imageFile.height, 10);
            }

            if (meta.metadata?.licenseurl) {
              asset.license = meta.metadata.licenseurl;
            }
          }
        } catch {
          // Metadata fetch failed, use thumbnail only
        }

        assets.push(asset);
      }
    } catch (err) {
      log.warn(`Archival search error: ${(err as Error).message}`);
    }
  }

  log.info(`Found ${assets.length} archival assets for ${showDate}`);
  return assets;
}

/**
 * Download an archival asset image (prefers full-size, falls back to thumbnail).
 */
export async function downloadArchivalAsset(
  asset: ArchivalAsset,
  destPath: string,
): Promise<Buffer | null> {
  const downloadUrl = asset.fullSizeUrl ?? asset.thumbnailUrl;
  try {
    await rateLimit();
    const response = await fetch(downloadUrl);
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
