import type Database from 'better-sqlite3';
import { createLogger, logCost } from '@dead-air/core';
import { buildCompositionProps } from './composition-builder.js';
import { renderEpisode } from './renderer.js';
import { renderScenes, concatScenes } from './scene-renderer.js';
import { renderEpisodeOnLambda } from './lambda-renderer.js';
import { postProcess } from './post-process.js';

const log = createLogger('render:orchestrator');

export interface RenderPipelineOptions {
  episodeId: string;
  db: Database.Database;
  dataDir: string;
  concurrency?: number;
  skipPost?: boolean;
  dryRun?: boolean;
  lambda?: boolean;
  lambdaRegion?: string;
  skipDeploy?: boolean;
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
  const {
    episodeId, db, dataDir, concurrency = 4,
    skipPost = false, dryRun = false,
    lambda = false, lambdaRegion, skipDeploy = false,
  } = options;

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
  let renderOutputPath: string;
  let durationSec: number;
  let renderCost = 0;

  if (lambda) {
    log.info('Step 2/4: Rendering on AWS Lambda...');
    const lambdaResult = await renderEpisodeOnLambda({
      props,
      dataDir,
      region: lambdaRegion,
      skipDeploy,
    });
    renderOutputPath = lambdaResult.outputPath;
    durationSec = lambdaResult.durationSec;
    renderCost = lambdaResult.cost;
    log.info(`Lambda render: ${lambdaResult.lambdasInvoked} lambdas, $${renderCost.toFixed(4)}`);
  } else {
    log.info(`Step 2/4: Rendering locally (scene-by-scene, ${props.segments.length} segments, concurrency ${concurrency})...`);
    await renderScenes({
      props,
      dataDir,
      segmentIndex: 'all',
      concurrency,
      force: false,
    });
    log.info('Step 2.5/4: Concatenating scenes...');
    renderOutputPath = await concatScenes(props, dataDir);
    durationSec = props.totalDurationInFrames / 30;
  }

  // Step 3: Post-process
  let finalPath = renderOutputPath;
  if (!skipPost) {
    log.info('Step 3/4: Post-processing (loudness normalization)...');
    const outputPath = renderOutputPath.replace('-raw.mp4', '.mp4');
    finalPath = await postProcess({
      inputPath: renderOutputPath,
      outputPath,
    });
  } else {
    log.info('Step 3/4: Skipping post-processing');
  }

  // Step 4: Update DB
  log.info('Step 4/4: Updating database...');
  db.prepare(
    'UPDATE episodes SET render_path = ?, duration_seconds = ?, current_stage = ?, status = ? WHERE id = ?',
  ).run(finalPath, Math.round(durationSec), 'rendered', 'rendered', episodeId);

  logCost(db, {
    episodeId,
    service: lambda ? 'remotion-lambda' : 'remotion',
    operation: 'render',
    cost: renderCost,
  });

  log.info(`=== Render complete: ${finalPath} (${durationSec.toFixed(1)}s) ===`);

  return {
    episodeId,
    propsPath,
    rawPath: renderOutputPath,
    finalPath,
    durationSec,
    totalFrames: props.totalDurationInFrames,
  };
}
