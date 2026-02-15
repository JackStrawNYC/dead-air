import type { Command } from 'commander';
import { getConfig, getDb, closeDb, createLogger } from '@dead-air/core';
import { orchestrateIngest } from '@dead-air/pipeline';

const log = createLogger('cli:ingest');

/**
 * Validate date string is YYYY-MM-DD format.
 */
function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
}

export function registerIngestCommand(program: Command): void {
  program
    .command('ingest')
    .description(
      'Ingest a Grateful Dead show: search Archive.org, fetch metadata, download audio',
    )
    .argument('<date>', 'Show date in YYYY-MM-DD format (e.g., 1977-05-08)')
    .option('--skip-audio', 'Fetch metadata only, skip audio download')
    .option(
      '--format <fmt>',
      'Preferred audio format: flac or mp3',
      'flac',
    )
    .action(async (date: string, options: { skipAudio?: boolean; format?: string }) => {
      if (!isValidDate(date)) {
        console.error(
          `Error: Invalid date "${date}". Use YYYY-MM-DD format (e.g., 1977-05-08)`,
        );
        process.exit(1);
      }

      const config = getConfig();
      const db = getDb(config.paths.database);

      try {
        const result = await orchestrateIngest({
          date,
          db,
          dataDir: config.paths.data,
          setlistfmApiKey: config.api.setlistfmKey,
          skipAudio: options.skipAudio,
          preferFormat: (options.format as 'flac' | 'mp3') ?? 'flac',
        });

        console.log('\n--- Ingest Summary ---');
        console.log(`Show:      ${date}`);
        if (result.venue) {
          console.log(
            `Venue:     ${result.venue.name}, ${result.venue.city}, ${result.venue.state}`,
          );
        }
        console.log(
          `Recording: ${result.recording.identifier} (${result.recording.sourceType})`,
        );
        console.log(`Setlist:   ${result.setlist.length} songs`);
        if (result.weather) {
          console.log(
            `Weather:   ${result.weather.tempMaxC}°C high, ${result.weather.tempMinC}°C low, ${result.weather.description}`,
          );
        }
        if (result.audioFiles.length > 0) {
          console.log(`Audio:     ${result.audioFiles.length} files downloaded`);
        }
        console.log(`Database:  show saved (id: ${result.showId})`);
      } catch (err) {
        log.error(`Ingest failed: ${(err as Error).message}`);
        console.error(`\nError: ${(err as Error).message}`);
        process.exit(1);
      } finally {
        closeDb();
      }
    });
}
