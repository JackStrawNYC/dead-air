import type { Command } from 'commander';
import { getConfig, getDb, closeDb, createLogger } from '@dead-air/core';
import { orchestrateScript } from '@dead-air/pipeline';

const log = createLogger('cli:script');

function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
}

export function registerScriptCommand(program: Command): void {
  program
    .command('script')
    .description(
      'Generate an episode script for a show using Claude AI',
    )
    .argument('<date>', 'Show date in YYYY-MM-DD format (e.g., 1977-05-08)')
    .option(
      '--model <model>',
      'Claude model to use',
      'claude-sonnet-4-5-20250929',
    )
    .option('--dry-run', 'Print assembled context without calling the API')
    .option('--force', 'Overwrite existing script for this show')
    .action(
      async (
        date: string,
        options: { model?: string; dryRun?: boolean; force?: boolean },
      ) => {
        if (!isValidDate(date)) {
          console.error(
            `Error: Invalid date "${date}". Use YYYY-MM-DD format (e.g., 1977-05-08)`,
          );
          process.exit(1);
        }

        const config = getConfig();

        if (!options.dryRun && !config.api.anthropicKey) {
          console.error(
            'Error: ANTHROPIC_API_KEY not configured. Add it to your .env file.',
          );
          process.exit(1);
        }

        const db = getDb(config.paths.database);

        try {
          const result = await orchestrateScript({
            date,
            db,
            dataDir: config.paths.data,
            apiKey: config.api.anthropicKey ?? '',
            model: options.model,
            dryRun: options.dryRun,
            force: options.force,
          });

          if (options.dryRun) {
            console.log('\n(dry run — no API call made)');
            return;
          }

          console.log('\n--- Script Summary ---');
          console.log(`Episode:    ${result.episodeId}`);
          console.log(`Title:      ${result.title}`);
          console.log(
            `Segments:   ${result.segmentCount} (${result.concertExcerpts} concert excerpts)`,
          );
          console.log(`Duration:   ~${result.estimatedDurationMin}m estimated`);
          console.log(`Cost:       $${result.cost.toFixed(4)}`);
          console.log(`Script:     ${result.scriptPath}`);

          if (result.warnings.length > 0) {
            console.log('\nWarnings:');
            for (const w of result.warnings) {
              console.log(`  - ${w}`);
            }
          }
        } catch (err) {
          log.error(`Script generation failed: ${(err as Error).message}`);
          console.error(`\nError: ${(err as Error).message}`);
          process.exit(1);
        } finally {
          closeDb();
        }
      },
    );
}
