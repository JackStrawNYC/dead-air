import type { Command } from 'commander';
import { getConfig, getDb, closeDb, createLogger } from '@dead-air/core';
import {
  orchestrateIngest,
  orchestrateAnalysis,
  orchestrateResearch,
  orchestrateScript,
  orchestrateAssetGeneration,
  orchestrateRender,
} from '@dead-air/pipeline';

const log = createLogger('cli:produce');

const STAGES = ['ingest', 'analyze', 'research', 'script', 'generate', 'render'] as const;
type Stage = (typeof STAGES)[number];

function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
}

function isValidStage(stage: string): stage is Stage {
  return (STAGES as readonly string[]).includes(stage);
}

export function registerProduceCommand(program: Command): void {
  program
    .command('produce')
    .description('Run the full production pipeline for a show')
    .argument('<date>', 'Show date in YYYY-MM-DD format (e.g., 1977-05-08)')
    .option('--from <stage>', 'Resume from a specific pipeline stage')
    .option('--to <stage>', 'Stop after a specific pipeline stage')
    .option('--dry-run', 'Show what would happen without executing')
    .option('--force', 'Force regeneration of cached stages')
    .option(
      '--model <model>',
      'Claude model to use for research/script',
      'claude-sonnet-4-5-20250929',
    )
    .option('--lambda', 'Use AWS Lambda for rendering')
    .action(
      async (
        date: string,
        options: {
          from?: string;
          to?: string;
          dryRun?: boolean;
          force?: boolean;
          model?: string;
          lambda?: boolean;
        },
      ) => {
        if (!isValidDate(date)) {
          console.error(
            `Error: Invalid date "${date}". Use YYYY-MM-DD format (e.g., 1977-05-08)`,
          );
          process.exit(1);
        }

        // Validate --from / --to stages
        const fromStage = options.from ?? STAGES[0];
        const toStage = options.to ?? STAGES[STAGES.length - 1];

        if (!isValidStage(fromStage)) {
          console.error(`Error: Invalid --from stage "${options.from}". Valid: ${STAGES.join(', ')}`);
          process.exit(1);
        }
        if (!isValidStage(toStage)) {
          console.error(`Error: Invalid --to stage "${options.to}". Valid: ${STAGES.join(', ')}`);
          process.exit(1);
        }

        const fromIdx = STAGES.indexOf(fromStage);
        const toIdx = STAGES.indexOf(toStage);
        if (fromIdx > toIdx) {
          console.error(`Error: --from "${fromStage}" is after --to "${toStage}"`);
          process.exit(1);
        }

        const stagesToRun = STAGES.slice(fromIdx, toIdx + 1);
        const episodeId = `ep-${date}`;

        // Dry run — just list stages
        if (options.dryRun) {
          console.log(`\nPipeline stages for ${date}:`);
          for (const stage of STAGES) {
            const marker = stagesToRun.includes(stage) ? '>' : ' ';
            console.log(`  ${marker} ${stage}`);
          }
          console.log(`\nEpisode ID: ${episodeId}`);
          console.log('(dry run — no stages executed)');
          return;
        }

        const config = getConfig();

        // Validate required API keys for the stages we'll run
        if (stagesToRun.includes('research') || stagesToRun.includes('script')) {
          if (!config.api.anthropicKey) {
            console.error('Error: ANTHROPIC_API_KEY not configured. Add it to your .env file.');
            process.exit(1);
          }
        }
        if (stagesToRun.includes('generate')) {
          if (!config.api.replicateToken) {
            console.error('Error: REPLICATE_API_TOKEN not configured. Add it to your .env file.');
            process.exit(1);
          }
          if (!config.api.elevenlabsKey || !config.api.elevenlabsVoiceId) {
            console.error('Error: ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID not configured. Add them to your .env file.');
            process.exit(1);
          }
        }

        const db = getDb(config.paths.database);

        console.log(`\n=== Dead Air: Producing ${date} ===`);
        console.log(`Stages: ${stagesToRun.join(' → ')}\n`);

        let currentStage: Stage = stagesToRun[0];

        try {
          // ── ingest ──
          if (stagesToRun.includes('ingest')) {
            currentStage = 'ingest';
            console.log('--- Stage: ingest ---');
            const result = await orchestrateIngest({
              date,
              db,
              dataDir: config.paths.data,
              setlistfmApiKey: config.api.setlistfmKey,
            });
            console.log(`  Venue: ${result.venue?.name ?? 'unknown'}`);
            console.log(`  Recording: ${result.recording.identifier}`);
            console.log(`  Setlist: ${result.setlist.length} songs`);
            console.log(`  Audio: ${result.audioFiles.length} files\n`);
          }

          // ── analyze ──
          if (stagesToRun.includes('analyze')) {
            currentStage = 'analyze';
            console.log('--- Stage: analyze ---');
            const result = await orchestrateAnalysis({
              date,
              db,
              dataDir: config.paths.data,
            });
            console.log(`  Segments: ${result.segmentCount} songs`);
            console.log(`  Duration: ${Math.round(result.totalDurationSec / 60)} min`);
            console.log(`  Peaks: ${result.peakMoments.length}\n`);
          }

          // ── research ──
          if (stagesToRun.includes('research')) {
            currentStage = 'research';
            console.log('--- Stage: research ---');
            const result = await orchestrateResearch({
              date,
              db,
              dataDir: config.paths.data,
              apiKey: config.api.anthropicKey!,
              model: options.model,
              force: options.force,
              setlistfmKey: config.api.setlistfmKey,
            });
            console.log(`  ${result.cached ? 'Cached' : `Cost: $${result.cost.toFixed(4)}`}`);
            console.log(`  Output: ${result.researchPath}\n`);
          }

          // ── script ──
          if (stagesToRun.includes('script')) {
            currentStage = 'script';
            console.log('--- Stage: script ---');
            const result = await orchestrateScript({
              date,
              db,
              dataDir: config.paths.data,
              apiKey: config.api.anthropicKey!,
              model: options.model,
              force: options.force,
            });
            console.log(`  Title: ${result.title}`);
            console.log(`  Segments: ${result.segmentCount} (${result.concertExcerpts} concert)`);
            console.log(`  Duration: ~${result.estimatedDurationMin}m`);
            console.log(`  Cost: $${result.cost.toFixed(4)}\n`);
          }

          // ── generate ──
          if (stagesToRun.includes('generate')) {
            currentStage = 'generate';
            console.log('--- Stage: generate ---');
            const result = await orchestrateAssetGeneration({
              episodeId,
              db,
              dataDir: config.paths.data,
              replicateToken: config.api.replicateToken!,
              xaiApiKey: config.api.xaiApiKey,
              flickrApiKey: config.api.flickrApiKey,
              elevenlabsKey: config.api.elevenlabsKey!,
              elevenlabsVoiceId: config.api.elevenlabsVoiceId!,
              force: options.force,
            });
            console.log(`  Images: ${result.images.length}`);
            console.log(`  Narrations: ${result.narrations.length}`);
            console.log(`  Archival: ${result.archival.length} photos`);
            console.log(`  Cost: $${result.totalCost.toFixed(4)}\n`);
          }

          // ── render ──
          if (stagesToRun.includes('render')) {
            currentStage = 'render';
            console.log('--- Stage: render ---');
            const result = await orchestrateRender({
              episodeId,
              db,
              dataDir: config.paths.data,
              concurrency: config.remotion.concurrency,
              lambda: options.lambda,
              lambdaRegion: config.aws.region,
            });
            console.log(`  Frames: ${result.totalFrames} (${(result.totalFrames / 30).toFixed(1)}s)`);
            if (result.finalPath) {
              console.log(`  Output: ${result.finalPath}`);
            }
            console.log();
          }

          console.log('=== Pipeline complete ===');
        } catch (err) {
          log.error(`Pipeline failed at ${currentStage}: ${(err as Error).message}`);
          console.error(`\nError during "${currentStage}": ${(err as Error).message}`);
          console.error(`\nUse --from ${currentStage} to resume from this stage.`);
          process.exit(1);
        } finally {
          closeDb();
        }
      },
    );
}
