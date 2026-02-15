import type { Command } from 'commander';
import { getConfig, getDb, closeDb, createLogger } from '@dead-air/core';
import { orchestrateAnalysis } from '@dead-air/pipeline';

const log = createLogger('cli:analyze');

/**
 * Validate date string is YYYY-MM-DD format.
 */
function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
}

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description(
      'Analyze audio for a show: segment songs, extract energy/tempo/key, detect peaks',
    )
    .argument('<date>', 'Show date in YYYY-MM-DD format (e.g., 1977-05-08)')
    .option(
      '--silence-threshold <db>',
      'Silence detection threshold in dB (default: -35)',
      '-35',
    )
    .option('--skip-librosa', 'Skip librosa analysis (FFmpeg segmentation only)')
    .action(
      async (
        date: string,
        options: { silenceThreshold?: string; skipLibrosa?: boolean },
      ) => {
        if (!isValidDate(date)) {
          console.error(
            `Error: Invalid date "${date}". Use YYYY-MM-DD format (e.g., 1977-05-08)`,
          );
          process.exit(1);
        }

        const config = getConfig();
        const db = getDb(config.paths.database);

        try {
          const result = await orchestrateAnalysis({
            date,
            db,
            dataDir: config.paths.data,
            silenceThresholdDb: Number(options.silenceThreshold) || -35,
            skipLibrosa: options.skipLibrosa,
          });

          const durationMin = Math.round(result.totalDurationSec / 60);

          console.log('\n--- Analysis Summary ---');
          console.log(`Show:       ${result.showId}`);
          console.log(`Segments:   ${result.segmentCount} songs`);
          console.log(`Analyzed:   ${result.analyzedCount} songs`);
          console.log(`Duration:   ${durationMin} minutes`);
          console.log(`Peaks:      ${result.peakMoments.length} peak moments`);
          for (const peak of result.peakMoments) {
            console.log(`  ${peak.description} (intensity: ${peak.intensity})`);
          }
          console.log(`Output:     ${result.analysisPath}`);
        } catch (err) {
          log.error(`Analysis failed: ${(err as Error).message}`);
          console.error(`\nError: ${(err as Error).message}`);
          process.exit(1);
        } finally {
          closeDb();
        }
      },
    );
}
