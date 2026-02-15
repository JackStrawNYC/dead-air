import type Database from 'better-sqlite3';
import { createLogger, logCost } from '@dead-air/core';
import { buildCompositionProps } from './composition-builder.js';
import { renderEpisode } from './renderer.js';
import { postProcess } from './post-process.js';

const log = createLogger('render:orchestrator');

export interface RenderPipelineOptions {
  episodeId: string;
  db: Database.Database;
  dataDir: string;
  concurrency?: number;
  skipPost?: boolean;
  dryRun?: boolean;
}

export interface RenderPipelineResult {
  episodeId: string;
  propsPath: string;
  rawPath?: string;
  finalPath?: string;
  durationSec?: number;
  totalFrames: number;
}

export async function orchestrateRender(
  options: RenderPipelineOptions,
): Promise<RenderPipelineResult> {
  const { episodeId, db, dataDir, concurrency = 4, skipPost = false, dryRun = false } = options;

  log.info(`=== Render pipeline: ${episodeId} ===`);

  // Update episode status
  db.prepare('UPDATE episodes SET current_stage = ?, status = ? WHERE id = ?').run(
    'rendering',
    'rendering',
    episodeId,
  );

  // Step 1: Build composition props
  log.info('Step 1/4: Building composition props...');
  const props = await buildCompositionProps({ episodeId, db, dataDir });
  const propsPath = `${dataDir}/renders/${episodeId}/props.json`;

  if (dryRun) {
    log.info(`Dry run complete. Props at ${propsPath}`);
    return {
      episodeId,
      propsPath,
      totalFrames: props.totalDurationInFrames,
    };
  }

  // Step 2: Render video
  log.info('Step 2/4: Rendering video...');
  const renderResult = await renderEpisode({ props, dataDir, concurrency });

  // Step 3: Post-process
  let finalPath = renderResult.outputPath;
  if (!skipPost) {
    log.info('Step 3/4: Post-processing (loudness normalization)...');
    const outputPath = renderResult.outputPath.replace('-raw.mp4', '.mp4');
    finalPath = await postProcess({
      inputPath: renderResult.outputPath,
      outputPath,
    });
  } else {
    log.info('Step 3/4: Skipping post-processing');
  }

  // Step 4: Update DB
  log.info('Step 4/4: Updating database...');
  db.prepare(
    'UPDATE episodes SET render_path = ?, duration_seconds = ?, current_stage = ?, status = ? WHERE id = ?',
  ).run(finalPath, Math.round(renderResult.durationSec), 'rendered', 'rendered', episodeId);

  logCost(db, {
    episodeId,
    service: 'remotion',
    operation: 'render',
    cost: 0, // Local render, no API cost
  });

  log.info(`=== Render complete: ${finalPath} (${renderResult.durationSec.toFixed(1)}s) ===`);

  return {
    episodeId,
    propsPath,
    rawPath: renderResult.outputPath,
    finalPath,
    durationSec: renderResult.durationSec,
    totalFrames: props.totalDurationInFrames,
  };
}
