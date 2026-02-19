import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type Database from 'better-sqlite3';
import { createLogger, logCost } from '@dead-air/core';
import type { ArchiveReview, SongStatistic, ListenForMoment } from '@dead-air/core';
import { fetchArchiveReviews, findBestReviewedIdentifier } from './archive-reviews.js';
import { fetchSongStats } from './song-stats.js';
import { withRetry } from '../utils/retry.js';

const log = createLogger('research:show-researcher');

// ── Types ──

export interface ResearchOptions {
  date: string;
  db: Database.Database;
  dataDir: string;
  apiKey: string;
  model?: string;
  force?: boolean;
  setlistfmKey?: string;
  archiveId?: string;
}

export interface ShowResearch {
  showId: string;
  generatedAt: string;
  tourContext: string;
  bandMemberContext: string;
  historicalContext: string;
  songHistories: SongHistory[];
  fanConsensus: string;
  venueHistory: string;
  archiveReviews?: ArchiveReview[];
  songStats?: SongStatistic[];
  listenForMoments?: ListenForMoment[];
}

export interface SongHistory {
  songName: string;
  timesPlayed: string;
  notableVersions: string;
  thisVersionNotes: string;
}

export interface ResearchResult {
  showId: string;
  researchPath: string;
  cost: number;
  cached: boolean;
}

// ── System prompt ──

const RESEARCH_SYSTEM_PROMPT = `You are a Grateful Dead historian and musicologist with deep knowledge of the band's entire career. You are researching a specific show for a documentary episode.

Respond with ONLY valid JSON matching this structure. No markdown, no preamble.

{
  "tourContext": "2-3 paragraphs about the tour this show was part of. What happened at nearby shows? Was the band on a hot streak or in a slump? Any notable events on tour?",
  "bandMemberContext": "2-3 paragraphs about each member's state at this point. Who was peaking musically? Any personal struggles? Gear changes? New musical directions they were exploring?",
  "historicalContext": "1-2 paragraphs about what was happening in the world, the city, the venue, and the counterculture at this time.",
  "songHistories": [
    {
      "songName": "Song Title",
      "timesPlayed": "Approximate number of times played by this date, and total lifetime plays",
      "notableVersions": "Other famous versions and how they compare",
      "thisVersionNotes": "What makes this particular version notable (if anything known)"
    }
  ],
  "fanConsensus": "1-2 paragraphs about what Deadheads say about this show. Is it a consensus classic? A hidden gem? Controversial? What do the tape traders and reviewers say?",
  "venueHistory": "1 paragraph about the venue itself — its significance, memorable shows there, acoustics, capacity."
}

If the input includes "archiveReviews", use these real fan quotes from archive.org — attribute them by reviewer name. These are authentic audience reactions.

If the input includes "songStatistics", use these for accurate play counts — DO NOT invent numbers. Reference exact counts like "Played 271 times between 1966 and 1995."

Generate 3-5 "listenForMoments" in the JSON output: specific musical moments to direct viewer attention during playback. Each should have songName, timestampSec (approximate seconds into the song), and description (e.g. "Listen for Phil's bass run steering into Space"). Focus on instrument entries, tempo changes, segue transitions, and crowd reactions.

Be specific. Use actual dates, song names, and details from your knowledge. If you're unsure about something, say so rather than fabricating. Focus on details that would make compelling documentary narration.`;

// ── Main ──

export async function orchestrateResearch(
  options: ResearchOptions,
): Promise<ResearchResult> {
  const {
    date,
    db,
    dataDir,
    apiKey,
    model = 'claude-sonnet-4-5-20250929',
    force = false,
    setlistfmKey,
    archiveId: overrideArchiveId,
  } = options;

  const researchDir = resolve(dataDir, 'research', date);
  const researchPath = resolve(researchDir, 'research.json');

  // Check cache
  if (existsSync(researchPath) && !force) {
    log.info(`Research already exists for ${date}. Use --force to regenerate.`);
    return { showId: date, researchPath, cost: 0, cached: true };
  }

  // Load show metadata from DB
  const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(date) as
    | Record<string, unknown>
    | undefined;

  if (!show) {
    throw new Error(`No show found for ${date}. Run 'deadair ingest ${date}' first.`);
  }

  const metadata = JSON.parse((show.metadata as string) ?? '{}');
  const setlist = show.setlist ? JSON.parse(show.setlist as string) : [];

  // Load analysis if available
  const analysisPath = resolve(dataDir, 'analysis', date, 'analysis.json');
  let songNames: string[] = [];
  if (existsSync(analysisPath)) {
    const analysis = JSON.parse(readFileSync(analysisPath, 'utf-8'));
    songNames = analysis.songSegments?.map((s: { songName: string }) => s.songName) ?? [];
  } else if (setlist.length > 0) {
    songNames = setlist.map((s: { songName: string }) => s.songName);
  }

  // Fetch real external data before calling Claude
  const archiveId = overrideArchiveId ?? metadata.archiveOrgIdentifier ?? metadata.archiveId ?? (show.recording_id as string) ?? '';
  let archiveReviews: ArchiveReview[] = [];
  let songStats: SongStatistic[] = [];

  if (archiveId) {
    log.info(`Fetching archive.org reviews for ${archiveId}...`);
    archiveReviews = await fetchArchiveReviews(archiveId);
  }

  // If reviews are thin, search for a better-reviewed recording
  if (archiveReviews.length < 5) {
    const bestId = await findBestReviewedIdentifier(date);
    if (bestId && bestId !== archiveId) {
      log.info(`Found better-reviewed recording: ${bestId}. Fetching reviews...`);
      const betterReviews = await fetchArchiveReviews(bestId);
      if (betterReviews.length > archiveReviews.length) {
        archiveReviews = betterReviews;
      }
    }
  }

  if (setlistfmKey && songNames.length > 0) {
    log.info(`Fetching setlist.fm stats for ${songNames.length} songs...`);
    songStats = await fetchSongStats(songNames, setlistfmKey, date);
  }

  // Build research prompt
  const userMessage = JSON.stringify({
    date,
    venue: show.venue,
    city: show.city,
    state: show.state,
    source: show.recording_source,
    setlist: songNames,
    archiveDescription: metadata.archiveOrgDescription
      ? (metadata.archiveOrgDescription as string).slice(0, 1000)
      : null,
    archiveReviews: archiveReviews.length > 0 ? archiveReviews : undefined,
    songStatistics: songStats.length > 0 ? songStats : undefined,
  });

  log.info(`Researching show ${date} at ${show.venue}...`);

  // Call Claude
  const client = new Anthropic({ apiKey });
  const response = await withRetry(
    () => client.messages.create({ model, max_tokens: 6000, system: RESEARCH_SYSTEM_PROMPT, messages: [{ role: 'user', content: userMessage }] }),
    { label: 'research:claude-api' },
  );

  const responseText =
    response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse response
  let research: ShowResearch;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    const parsed = JSON.parse(jsonMatch[0]);
    research = {
      showId: date,
      generatedAt: new Date().toISOString(),
      ...parsed,
      archiveReviews: archiveReviews.length > 0 ? archiveReviews : (parsed.archiveReviews ?? []),
      songStats: songStats.length > 0 ? songStats : (parsed.songStats ?? []),
      listenForMoments: parsed.listenForMoments ?? [],
    };
  } catch (err) {
    throw new Error(`Failed to parse research response: ${(err as Error).message}`);
  }

  // Log cost
  const isOpus = model.includes('opus');
  const inputRate = isOpus ? 15 / 1_000_000 : 3 / 1_000_000;
  const outputRate = isOpus ? 75 / 1_000_000 : 15 / 1_000_000;
  const cost =
    response.usage.input_tokens * inputRate +
    response.usage.output_tokens * outputRate;

  const episodeId = `ep-${date}`;
  logCost(db, {
    episodeId,
    operation: 'show-research',
    service: 'anthropic',
    cost,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  // Write to disk
  if (!existsSync(researchDir)) mkdirSync(researchDir, { recursive: true });
  writeFileSync(researchPath, JSON.stringify(research, null, 2));

  log.info(
    `Research complete: ${researchPath} ($${cost.toFixed(4)}, ${response.usage.output_tokens} tokens)`,
  );

  return { showId: date, researchPath, cost, cached: false };
}
