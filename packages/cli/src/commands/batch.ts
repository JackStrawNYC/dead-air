import type { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve as resolvePath, dirname } from 'path';
import { getConfig, getDb, closeDb, createLogger } from '@dead-air/core';
import { orchestrateBatch } from '@dead-air/pipeline';
import type { BatchManifest } from '@dead-air/pipeline';
import {
  orchestrateIngest,
  orchestrateAnalysis,
  orchestrateResearch,
  orchestrateScript,
  orchestrateAssetGeneration,
  orchestrateRender,
} from '@dead-air/pipeline';

const log = createLogger('cli:batch');

export function registerBatchCommand(program: Command): void {
  program
    .command('batch')
    .description('Process multiple shows from a manifest file')
    .argument('<manifest>', 'Path to batch manifest JSON file')
    .option('--concurrency <n>', 'Show-level concurrency (default: 1, sequential)', parseInt)
    .option('--retry <n>', 'Number of retries per show (default: 2)', parseInt)
    .option('--continue-on-error', 'Continue processing after a show fails')
    .option('--dry-run', 'Show what would happen without executing')
    .option('--force', 'Force regeneration of cached stages')
    .option(
      '--model <model>',
      'Claude model to use for research/script',
      'claude-sonnet-4-5-20250929',
    )
    .action(
      async (
        manifestPath: string,
        options: {
          concurrency?: number;
          retry?: number;
          continueOnError?: boolean;
          dryRun?: boolean;
          force?: boolean;
          model?: string;
        },
      ) => {
        // Load manifest
        let manifest: BatchManifest;
        try {
          manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        } catch (err) {
          console.error(`Error: Could not read manifest file "${manifestPath}": ${(err as Error).message}`);
          process.exit(1);
        }

        if (!manifest.shows || manifest.shows.length === 0) {
          console.error('Error: Manifest contains no shows');
          process.exit(1);
        }

        const config = getConfig();
        const db = getDb(config.paths.database);

        console.log(`\n=== Dead Air: Batch Processing ${manifest.shows.length} Shows ===\n`);

        try {
          const result = await orchestrateBatch({
            manifest,
            db,
            dataDir: config.paths.data,
            model: options.model,
            retries: options.retry ?? 2,
            continueOnError: options.continueOnError ?? false,
            dryRun: options.dryRun ?? false,
            force: options.force ?? false,
            produceShow: async (date, showOptions) => {
              const episodeId = `ep-${date}`;

              const STAGES = ['ingest', 'analyze', 'research', 'bridge', 'script', 'generate', 'render'] as const;
              const fromIdx = STAGES.indexOf((showOptions.from ?? 'ingest') as typeof STAGES[number]);
              const toIdx = STAGES.indexOf((showOptions.to ?? 'render') as typeof STAGES[number]);
              const stagesToRun = STAGES.slice(
                Math.max(0, fromIdx),
                Math.min(STAGES.length, toIdx + 1),
              );

              if (stagesToRun.includes('ingest')) {
                await orchestrateIngest({
                  date,
                  db,
                  dataDir: config.paths.data,
                  setlistfmApiKey: config.api.setlistfmKey,
                });
              }

              if (stagesToRun.includes('analyze')) {
                await orchestrateAnalysis({
                  date,
                  db,
                  dataDir: config.paths.data,
                });
              }

              if (stagesToRun.includes('research')) {
                await orchestrateResearch({
                  date,
                  db,
                  dataDir: config.paths.data,
                  apiKey: config.api.anthropicKey!,
                  model: showOptions.model,
                  force: showOptions.force,
                  setlistfmKey: config.api.setlistfmKey,
                });
              }

              if (stagesToRun.includes('bridge')) {
                const { execSync } = await import('child_process');
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = dirname(__filename);
                const bridgeScript = resolvePath(__dirname, '..', '..', '..', '..', 'visualizer-poc', 'scripts', 'bridge-pipeline.ts');
                try {
                  execSync(
                    `npx tsx "${bridgeScript}" --date=${date} --data-dir="${config.paths.data}"`,
                    { stdio: 'inherit' },
                  );
                } catch {
                  // Bridge is optional
                }
              }

              if (stagesToRun.includes('script')) {
                await orchestrateScript({
                  date,
                  db,
                  dataDir: config.paths.data,
                  apiKey: config.api.anthropicKey!,
                  model: showOptions.model,
                  force: showOptions.force,
                });
              }

              if (stagesToRun.includes('generate')) {
                await orchestrateAssetGeneration({
                  episodeId,
                  db,
                  dataDir: config.paths.data,
                  replicateToken: config.api.replicateToken!,
                  xaiApiKey: config.api.xaiApiKey,
                  flickrApiKey: config.api.flickrApiKey,
                  elevenlabsKey: config.api.elevenlabsKey!,
                  elevenlabsVoiceId: config.api.elevenlabsVoiceId!,
                  force: showOptions.force,
                });
              }

              if (stagesToRun.includes('render')) {
                await orchestrateRender({
                  episodeId,
                  db,
                  dataDir: config.paths.data,
                  concurrency: config.remotion.concurrency,
                });
              }
            },
          });

          console.log(`\n=== Batch Complete ===`);
          console.log(`  Total: ${result.total}`);
          console.log(`  Succeeded: ${result.succeeded}`);
          console.log(`  Failed: ${result.failed}`);
          console.log(`  Skipped: ${result.skipped}`);
          console.log(`  Duration: ${Math.round(result.durationMs / 60000)}m`);

          if (result.failed > 0) {
            process.exit(1);
          }
        } catch (err) {
          log.error(`Batch failed: ${(err as Error).message}`);
          process.exit(1);
        } finally {
          closeDb();
        }
      },
    );
}
