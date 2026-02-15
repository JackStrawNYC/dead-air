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

/**
 * Search Archive.org for Grateful Dead recordings on a given date.
 */
export async function searchShows(
  date: string,
): Promise<ArchiveSearchResult[]> {
  await rateLimit();

  const q = `collection:GratefulDead AND date:${date}`;
  const params = new URLSearchParams({
    q,
    'fl[]': 'identifier,title,date,source,description,format',
    output: 'json',
    rows: '100',
  });

  // fl[] needs to be repeated for each field
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=date&fl[]=source&fl[]=description&fl[]=format&output=json&rows=100`;

  log.info(`Searching Archive.org for ${date}...`);

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
  }));
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
