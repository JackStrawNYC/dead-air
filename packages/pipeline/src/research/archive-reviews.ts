import { createLogger } from '@dead-air/core';
import type { ArchiveReview } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';

const log = createLogger('research:archive-reviews');

const rateLimit = createRateLimiter(1000); // 1 req/sec

interface ArchiveMetadataResponse {
  reviews?: Array<{
    reviewer: string;
    reviewtitle?: string;
    reviewbody?: string;
    stars: string;
    reviewdate?: string;
  }>;
}

/**
 * Fetch user reviews from archive.org for a given recording identifier.
 * Uses the metadata API: https://archive.org/metadata/{identifier}
 *
 * Returns up to 10 reviews sorted by rating (descending), with bodies truncated to 300 chars.
 * Gracefully returns empty array on any error.
 */
export async function fetchArchiveReviews(identifier: string): Promise<ArchiveReview[]> {
  try {
    await rateLimit();

    const url = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
    log.info(`Fetching archive.org reviews for ${identifier}`);

    const response = await fetch(url);
    if (!response.ok) {
      log.warn(`Archive.org metadata request failed: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = (await response.json()) as ArchiveMetadataResponse;

    if (!data.reviews || data.reviews.length === 0) {
      log.info(`No reviews found for ${identifier}`);
      return [];
    }

    const reviews: ArchiveReview[] = data.reviews
      .filter((r) => r.reviewbody && r.reviewer)
      .map((r) => ({
        reviewer: r.reviewer,
        rating: parseInt(r.stars, 10) || 3,
        text: (r.reviewbody ?? '').slice(0, 300),
        date: r.reviewdate,
      }))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 10);

    log.info(`Found ${reviews.length} reviews for ${identifier}`);
    return reviews;
  } catch (err) {
    log.warn(`Failed to fetch archive.org reviews: ${(err as Error).message}`);
    return [];
  }
}

interface ArchiveSearchResponse {
  response?: {
    docs?: Array<{
      identifier: string;
      num_reviews?: number;
    }>;
  };
}

/**
 * Search archive.org for the Grateful Dead recording with the most reviews for a given date.
 * Returns the identifier, or null if nothing found.
 */
export async function findBestReviewedIdentifier(showDate: string): Promise<string | null> {
  try {
    await rateLimit();

    const query = encodeURIComponent(`collection:GratefulDead AND date:${showDate}`);
    const url = `https://archive.org/advancedsearch.php?q=${query}&fl[]=identifier,num_reviews&sort[]=num_reviews+desc&rows=5&output=json`;
    log.info(`Searching for best-reviewed recording for ${showDate}`);

    const response = await fetch(url);
    if (!response.ok) {
      log.warn(`Archive.org search failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as ArchiveSearchResponse;
    const docs = data.response?.docs;
    if (!docs || docs.length === 0) {
      log.info(`No recordings found for ${showDate}`);
      return null;
    }

    const best = docs[0];
    log.info(`Best-reviewed recording: ${best.identifier} (${best.num_reviews ?? 0} reviews)`);
    return best.identifier;
  } catch (err) {
    log.warn(`Failed to search archive.org: ${(err as Error).message}`);
    return null;
  }
}
