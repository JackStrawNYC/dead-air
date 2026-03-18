import { createLogger } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';

const log = createLogger('archive-client');
const rateLimit = createRateLimiter(1000); // 1 req/sec

// ── Types ──

export interface ArchiveSearchResult {
  identifier: string;
  title: string;
  date: string;
  source: string;
  description: string;
  format: string[];
  numReviews?: number;
  avgRating?: number;
}

export interface ArchiveFile {
  name: string;
  format: string;
  size: string; // bytes as string from API
  length?: string; // duration in seconds as string
  title?: string;
  source: string; // 'original' or 'derivative'
}

// ── Search ──

export interface SearchShowsOptions {
  /** Exact date: YYYY-MM-DD */
  date?: string;
  /** Year: YYYY — returns all recordings for that year */
  year?: number;
  /** Free-text query — searches titles and descriptions */
  query?: string;
}

/**
 * Search Archive.org for Grateful Dead recordings.
 * Accepts a string (date) for backwards compatibility, or an options object.
 */
export async function searchShows(
  optsOrDate: string | SearchShowsOptions,
): Promise<ArchiveSearchResult[]> {
  await rateLimit();

  const opts: SearchShowsOptions =
    typeof optsOrDate === 'string' ? { date: optsOrDate } : optsOrDate;

  // Build query
  let qParts = ['collection:GratefulDead'];
  if (opts.date) qParts.push(`date:${opts.date}`);
  if (opts.year) qParts.push(`year:${opts.year}`);
  if (opts.query) qParts.push(`(title:*${opts.query}* OR description:*${opts.query}*)`);
  const q = qParts.join(' AND ');

  const rows = opts.year ? '500' : '100';
  const fields = ['identifier', 'title', 'date', 'source', 'description', 'format', 'num_reviews', 'avg_rating'];
  const flParams = fields.map((f) => `fl[]=${f}`).join('&');
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&${flParams}&output=json&rows=${rows}&sort[]=num_reviews+desc`;

  const label = opts.date || (opts.year ? `year ${opts.year}` : opts.query || 'all');
  log.info(`Searching Archive.org for ${label}...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Archive.org search failed: ${res.status} ${res.statusText}`,
    );
  }

  const data = (await res.json()) as {
    response: {
      numFound: number;
      docs: Array<{
        identifier?: string;
        title?: string;
        date?: string;
        source?: string;
        description?: string | string[];
        format?: string | string[];
        num_reviews?: number;
        avg_rating?: number;
      }>;
    };
  };

  const docs = data.response.docs;
  log.info(`Found ${data.response.numFound} recordings`);

  return docs.map((doc) => ({
    identifier: doc.identifier ?? '',
    title: doc.title ?? '',
    date: doc.date ?? '',
    source: doc.source ?? '',
    description: Array.isArray(doc.description)
      ? doc.description.join(' ')
      : (doc.description ?? ''),
    format: Array.isArray(doc.format)
      ? doc.format
      : doc.format
        ? [doc.format]
        : [],
    numReviews: doc.num_reviews,
    avgRating: doc.avg_rating,
  }));
}

// ── Single Recording Metadata ──

/**
 * Fetch metadata for a single Archive.org recording by identifier.
 */
export async function getRecordingMetadata(
  identifier: string,
): Promise<ArchiveSearchResult> {
  await rateLimit();

  const url = `https://archive.org/metadata/${identifier}`;
  log.info(`Fetching metadata for ${identifier}...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Archive.org metadata failed for ${identifier}: ${res.status}`,
    );
  }

  const data = (await res.json()) as {
    metadata?: {
      identifier?: string;
      title?: string;
      date?: string;
      source?: string;
      description?: string | string[];
      format?: string | string[];
      num_reviews?: string;
      avg_rating?: string;
    };
  };

  const meta = data.metadata ?? {};
  return {
    identifier: meta.identifier ?? identifier,
    title: meta.title ?? '',
    date: meta.date ?? '',
    source: meta.source ?? '',
    description: Array.isArray(meta.description)
      ? meta.description.join(' ')
      : (meta.description ?? ''),
    format: Array.isArray(meta.format)
      ? meta.format
      : meta.format
        ? [meta.format]
        : [],
    numReviews: meta.num_reviews ? parseInt(meta.num_reviews, 10) : undefined,
    avgRating: meta.avg_rating ? parseFloat(meta.avg_rating) : undefined,
  };
}

// ── File Listing ──

/**
 * Get the list of files for a specific Archive.org recording.
 */
export async function getRecordingFiles(
  identifier: string,
): Promise<ArchiveFile[]> {
  await rateLimit();

  const url = `https://archive.org/metadata/${identifier}/files`;
  log.info(`Fetching file list for ${identifier}...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Archive.org metadata failed for ${identifier}: ${res.status}`,
    );
  }

  const data = (await res.json()) as {
    result: Array<{
      name?: string;
      format?: string;
      size?: string;
      length?: string;
      title?: string;
      source?: string;
    }>;
  };

  return (data.result ?? []).map((f) => ({
    name: f.name ?? '',
    format: f.format ?? '',
    size: f.size ?? '0',
    length: f.length,
    title: f.title,
    source: f.source ?? 'original',
  }));
}

/**
 * Build a download URL for an Archive.org file.
 */
export function getDownloadUrl(identifier: string, filename: string): string {
  return `https://archive.org/download/${identifier}/${encodeURIComponent(filename)}`;
}
