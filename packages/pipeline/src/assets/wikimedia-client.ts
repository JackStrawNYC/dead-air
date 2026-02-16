import { createLogger } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';

const log = createLogger('assets:wikimedia');

const rateLimit = createRateLimiter(1000); // 1 req/sec

export interface WikimediaImage {
  title: string;
  url: string;
  thumbnailUrl: string;
  license: string;
  width: number;
  height: number;
}

const API_BASE = 'https://commons.wikimedia.org/w/api.php';

interface SearchResult {
  query?: {
    search?: Array<{ title: string }>;
  };
}

interface ImageInfoResult {
  query?: {
    pages?: Record<string, {
      imageinfo?: Array<{
        url?: string;
        thumburl?: string;
        width?: number;
        height?: number;
        extmetadata?: {
          LicenseShortName?: { value?: string };
        };
      }>;
    }>;
  };
}

async function searchFiles(query: string, maxResults: number): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srnamespace: '6', // File namespace
    srsearch: query,
    srlimit: String(maxResults),
    format: 'json',
    origin: '*',
  });

  await rateLimit();
  const response = await fetch(`${API_BASE}?${params}`);
  if (!response.ok) return [];

  const data = (await response.json()) as SearchResult;
  return data.query?.search?.map((r) => r.title) ?? [];
}

async function getImageInfo(titles: string[]): Promise<WikimediaImage[]> {
  if (titles.length === 0) return [];

  const params = new URLSearchParams({
    action: 'query',
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '1920',
    format: 'json',
    origin: '*',
  });

  await rateLimit();
  const response = await fetch(`${API_BASE}?${params}`);
  if (!response.ok) return [];

  const data = (await response.json()) as ImageInfoResult;
  const images: WikimediaImage[] = [];

  for (const page of Object.values(data.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    if (!info?.url) continue;

    const license = info.extmetadata?.LicenseShortName?.value ?? 'unknown';

    // Only include CC-licensed images
    const isCC = /^(cc|public domain|pd)/i.test(license);
    if (!isCC) continue;

    images.push({
      title: '',
      url: info.url,
      thumbnailUrl: info.thumburl ?? info.url,
      license,
      width: info.width ?? 0,
      height: info.height ?? 0,
    });
  }

  return images;
}

export async function searchWikimediaImages(options: {
  venue?: string;
  year?: string;
  maxResults?: number;
}): Promise<WikimediaImage[]> {
  const { venue, year, maxResults = 10 } = options;

  const queries: string[] = [];

  if (venue && year) {
    queries.push(`"Grateful Dead" ${venue} ${year}`);
  }
  queries.push(`"Grateful Dead" ${year ?? '1977'}`);
  queries.push(`"Grateful Dead" concert`);

  const allImages: WikimediaImage[] = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    if (allImages.length >= maxResults) break;

    try {
      const titles = await searchFiles(query, maxResults - allImages.length);
      const images = await getImageInfo(titles);

      for (const img of images) {
        if (!seenUrls.has(img.url)) {
          seenUrls.add(img.url);
          allImages.push(img);
        }
      }
    } catch (err) {
      log.warn(`Wikimedia search error for "${query}": ${(err as Error).message}`);
    }
  }

  log.info(`Found ${allImages.length} CC-licensed Wikimedia images`);
  return allImages.slice(0, maxResults);
}

export async function downloadWikimediaImage(url: string): Promise<Buffer | null> {
  try {
    await rateLimit();
    const response = await fetch(url);
    if (!response.ok) {
      log.warn(`Failed to download Wikimedia image: ${response.status}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    log.warn(`Wikimedia download error: ${(err as Error).message}`);
    return null;
  }
}
