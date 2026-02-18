import { createLogger } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';

const log = createLogger('assets:ucsc');
const rateLimit = createRateLimiter(1000);

export interface CalisphereImage {
  id: string;
  title: string;
  url: string;
  source: string;
}

interface CalisphereResponse {
  documents?: Array<{
    id?: string;
    title?: string[];
    reference_image_md5?: string;
    url_item?: string;
    type_ss?: string[];
    collection_url?: string;
  }>;
}

/**
 * Search the UC Santa Cruz Grateful Dead Archive via Calisphere
 * (California Digital Library aggregator).
 *
 * The UCSC GD Archive holds papers, posters, flyers, and photographs
 * from the band's history. Calisphere provides API access to the
 * digitized portions across all UC libraries.
 *
 * No API key needed — Calisphere is open access.
 */
export async function searchUcscArchive(options: {
  query?: string;
  maxResults?: number;
}): Promise<CalisphereImage[]> {
  const { maxResults = 15 } = options;

  const allImages: CalisphereImage[] = [];
  const seenIds = new Set<string>();

  // Search strategies targeting the GD Archive and related UC collections
  const queries: string[] = [
    'grateful dead',
    'grateful dead concert',
    'grateful dead poster',
    'jerry garcia',
  ];

  for (const query of queries) {
    if (allImages.length >= maxResults) break;

    const remaining = maxResults - allImages.length;
    const params = new URLSearchParams({
      q: query,
      rows: String(remaining),
      start: '0',
      sort: 'score',
    });

    const url = `https://solr.calisphere.org/solr/query/?${params}`;

    try {
      await rateLimit();
      const response = await fetch(url);
      if (!response.ok) {
        // Try alternate Calisphere endpoint
        const altUrl = `https://calisphere.org/api/v1/items/?q=${encodeURIComponent(query)}&rows=${remaining}`;
        const altResponse = await fetch(altUrl);
        if (!altResponse.ok) {
          log.warn(`Calisphere search failed: ${response.status}`);
          continue;
        }
        // Process alt response
        const altData = (await altResponse.json()) as CalisphereResponse;
        processResults(altData.documents ?? [], allImages, seenIds);
        continue;
      }

      const data = (await response.json()) as { response?: CalisphereResponse };
      processResults(data.response?.documents ?? [], allImages, seenIds);
    } catch (err) {
      log.warn(`Calisphere search error for "${query}": ${(err as Error).message}`);
    }
  }

  // Also try Archive.org for UCSC-specific collections
  try {
    await rateLimit();
    const archiveUrl = `https://archive.org/advancedsearch.php?q=collection:ucsc-grateful-dead+AND+mediatype:image&fl[]=identifier,title&rows=${maxResults}&output=json`;
    const response = await fetch(archiveUrl);
    if (response.ok) {
      const data = (await response.json()) as { response: { docs: Array<{ identifier: string; title: string }> } };
      for (const doc of data.response.docs) {
        if (seenIds.has(doc.identifier) || allImages.length >= maxResults) continue;
        seenIds.add(doc.identifier);
        allImages.push({
          id: doc.identifier,
          title: doc.title,
          url: `https://archive.org/services/img/${doc.identifier}`,
          source: 'archive-org-ucsc',
        });
      }
    }
  } catch (err) {
    log.warn(`UCSC Archive.org search error: ${(err as Error).message}`);
  }

  log.info(`Found ${allImages.length} UCSC/Calisphere images`);
  return allImages.slice(0, maxResults);
}

function processResults(
  documents: CalisphereResponse['documents'],
  allImages: CalisphereImage[],
  seenIds: Set<string>,
): void {
  if (!documents) return;
  for (const doc of documents) {
    if (!doc.id || seenIds.has(doc.id)) continue;
    seenIds.add(doc.id);

    // Build image URL from Calisphere's reference image
    const imageUrl = doc.reference_image_md5
      ? `https://calisphere.org/clip/500x500/${doc.reference_image_md5}`
      : doc.url_item;

    if (!imageUrl) continue;

    allImages.push({
      id: doc.id,
      title: doc.title?.[0] ?? 'UCSC Archive',
      url: imageUrl,
      source: 'calisphere',
    });
  }
}

export async function downloadCalisphereImage(url: string): Promise<Buffer | null> {
  try {
    await rateLimit();
    const response = await fetch(url);
    if (!response.ok) {
      log.warn(`Failed to download Calisphere image: ${response.status}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    log.warn(`Calisphere download error: ${(err as Error).message}`);
    return null;
  }
}
