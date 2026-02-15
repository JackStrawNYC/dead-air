import type { Command } from 'commander';
import { getConfig, getDb, closeDb, createLogger } from '@dead-air/core';
import { orchestrateAssetGeneration } from '@dead-air/pipeline';

const log = createLogger('cli:generate-assets');

export function registerGenerateAssetsCommand(program: Command): void {
  program
    .command('generate-assets')
    .description(
      'Generate all media assets for an episode (images, narration, thumbnail)',
    )
    .argument('<episode-id>', 'Episode ID (e.g., ep-1977-05-08)')
    .option('--concurrency <n>', 'Max concurrent image generation requests', '3')
    .option('--skip-narration', 'Skip ElevenLabs narration generation')
    .option('--skip-images', 'Skip image generation')
    .option('--skip-archival', 'Skip Archive.org asset search')
    .option('--dry-run', 'Show asset manifest without calling APIs')
    .option('--force', 'Regenerate even if assets already exist')
    .action(
      async (
        episodeId: string,
        options: {
          concurrency?: string;
          skipNarration?: boolean;
          skipImages?: boolean;
          skipArchival?: boolean;
          dryRun?: boolean;
          force?: boolean;
        },
      ) => {
        const config = getConfig();

        if (!options.dryRun) {
          if (!options.skipImages && !config.api.replicateToken) {
            console.error(
              'Error: REPLICATE_API_TOKEN not configured. Add it to .env or use --skip-images.',
            );
            process.exit(1);
          }
          if (!options.skipNarration && !config.api.elevenlabsKey) {
            console.error(
              'Error: ELEVENLABS_API_KEY not configured. Add it to .env or use --skip-narration.',
            );
            process.exit(1);
          }
          if (!options.skipNarration && !config.api.elevenlabsVoiceId) {
            console.error(
              'Error: ELEVENLABS_VOICE_ID not configured. Add it to .env or use --skip-narration.',
            );
            process.exit(1);
          }
        }

        const db = getDb(config.paths.database);

        try {
          const result = await orchestrateAssetGeneration({
            episodeId,
            db,
            dataDir: config.paths.data,
            replicateToken: config.api.replicateToken ?? '',
            elevenlabsKey: config.api.elevenlabsKey ?? '',
            elevenlabsVoiceId: config.api.elevenlabsVoiceId ?? '',
            concurrency: Number(options.concurrency) || 3,
            skipNarration: options.skipNarration,
            skipImages: options.skipImages,
            skipArchival: options.skipArchival,
            dryRun: options.dryRun,
            force: options.force,
          });

          if (options.dryRun) {
            console.log('\n(dry run — no API calls made)');
            return;
          }

          console.log('\n--- Asset Generation Summary ---');
          console.log(`Episode:    ${result.episodeId}`);
          console.log(`Narrations: ${result.narrations.length} generated`);

          const fluxProCount = result.images.filter((i) => i.model === 'flux-pro').length;
          const schnellCount = result.images.filter((i) => i.model === 'flux-schnell').length;
          console.log(`Images:     ${result.images.length} (${fluxProCount} Flux Pro, ${schnellCount} Flux Schnell)`);

          console.log(`Thumbnail:  ${result.thumbnail ? 'generated' : 'skipped/failed'}`);
          console.log(`Archival:   ${result.archival.length} photos`);
          console.log(`Cached:     ${result.cachedAssets} assets reused`);
          console.log(`Cost:       $${result.totalCost.toFixed(4)}`);

          if (result.failedAssets.length > 0) {
            console.log(`\nFailed (${result.failedAssets.length}):`);
            for (const f of result.failedAssets) {
              console.log(`  - ${f}`);
            }
          }
        } catch (err) {
          log.error(`Asset generation failed: ${(err as Error).message}`);
          console.error(`\nError: ${(err as Error).message}`);
          process.exit(1);
        } finally {
          closeDb();
        }
      },
    );
}
