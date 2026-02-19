import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Command } from 'commander';
import { getConfig, getDb, closeDb, createLogger } from '@dead-air/core';
import { orchestrateResearch } from '@dead-air/pipeline';

const log = createLogger('cli:research');

function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
}

export function registerResearchCommand(program: Command): void {
  program
    .command('research')
    .description(
      'Research a Grateful Dead show: fetch archive reviews, song stats, and generate deep context with Claude AI',
    )
    .argument('<date>', 'Show date in YYYY-MM-DD format (e.g., 1977-05-08)')
    .option(
      '--model <model>',
      'Claude model to use',
      'claude-sonnet-4-5-20250929',
    )
    .option('--force', 'Overwrite existing research for this show')
    .option('--archive-id <id>', 'Override archive.org identifier')
    .action(
      async (
        date: string,
        options: { model?: string; force?: boolean; archiveId?: string },
      ) => {
        if (!isValidDate(date)) {
          console.error(
            `Error: Invalid date "${date}". Use YYYY-MM-DD format (e.g., 1977-05-08)`,
          );
          process.exit(1);
        }

        const config = getConfig();

        if (!config.api.anthropicKey) {
          console.error(
            'Error: ANTHROPIC_API_KEY not configured. Add it to your .env file.',
          );
          process.exit(1);
        }

        const db = getDb(config.paths.database);

        try {
          const result = await orchestrateResearch({
            date,
            db,
            dataDir: config.paths.data,
            apiKey: config.api.anthropicKey,
            model: options.model,
            force: options.force,
            setlistfmKey: config.api.setlistfmKey,
            archiveId: options.archiveId,
          });

          if (result.cached) {
            console.log(`\nResearch already exists: ${result.researchPath}`);
            console.log('Use --force to regenerate.');
          }

          // Read back research.json and print summary
          if (existsSync(result.researchPath)) {
            const research = JSON.parse(readFileSync(result.researchPath, 'utf-8'));
            const reviewCount = research.archiveReviews?.length ?? 0;
            const songStatsCount = research.songStats?.length ?? 0;
            const listenForCount = research.listenForMoments?.length ?? 0;

            console.log('\n--- Research Summary ---');
            console.log(`Show:           ${date}`);
            console.log(`Reviews:        ${reviewCount} archive.org reviews`);
            console.log(`Song stats:     ${songStatsCount} songs`);
            console.log(`Listen-for:     ${listenForCount} moments`);
            if (!result.cached) {
              console.log(`Cost:           $${result.cost.toFixed(4)}`);
            }
            console.log(`Output:         ${result.researchPath}`);
          }
        } catch (err) {
          log.error(`Research failed: ${(err as Error).message}`);
          console.error(`\nError: ${(err as Error).message}`);
          process.exit(1);
        } finally {
          closeDb();
        }
      },
    );
}
