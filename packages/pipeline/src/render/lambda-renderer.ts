import { resolve, dirname } from 'path';
import { existsSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { createLogger } from '@dead-air/core';
import type { EpisodeProps } from './composition-builder.js';
import type { AwsRegion } from '@remotion/lambda';

const log = createLogger('render:lambda');

export interface LambdaRenderOptions {
  props: EpisodeProps;
  dataDir: string;
  region?: string;
  framesPerLambda?: number;
  skipDeploy?: boolean;
}

export interface LambdaRenderResult {
  outputPath: string;
  durationSec: number;
  cost: number;
  lambdasInvoked: number;
}

/**
 * Max concurrent Lambda functions per pass.
 * Conservative limit so the orchestrator Lambda has time to stitch + upload.
 */
const MAX_LAMBDAS_PER_RENDER = 150;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scan props JSON for all referenced asset paths (mp3/png/jpg/mp4)
 * and copy them into a staging directory for S3 upload.
 */
function buildStagingDir(props: EpisodeProps, dataDir: string): string {
  const stagingDir = resolve(dataDir, '.lambda-staging');

  // Clean previous staging
  if (existsSync(stagingDir)) {
    rmSync(stagingDir, { recursive: true });
  }
  mkdirSync(stagingDir, { recursive: true });

  // Collect all file paths from props
  const paths = new Set<string>();
  JSON.stringify(props, (_k, v) => {
    if (
      typeof v === 'string' &&
      /\.(mp3|png|jpg|jpeg|mp4|gif)$/i.test(v) &&
      !v.startsWith('http')
    ) {
      paths.add(v);
    }
    return v;
  });

  // Also add ambient audio files used by composition-level components
  const ambientFiles = [
    'assets/ambient/vinyl-noise.mp3',
    'assets/ambient/crowd-ambience.mp3',
  ];
  for (const f of ambientFiles) {
    if (existsSync(resolve(dataDir, f))) {
      paths.add(f);
    }
  }

  // Copy each referenced file into staging
  let copied = 0;
  let skipped = 0;
  for (const relPath of paths) {
    const src = resolve(dataDir, relPath);
    const dest = resolve(stagingDir, relPath);
    if (existsSync(src)) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      copied++;
    } else {
      skipped++;
    }
  }

  log.info(`Staging: ${copied} files copied, ${skipped} missing (${paths.size} total referenced)`);
  return stagingDir;
}

/**
 * Render a single pass (frame range) on Lambda and poll until complete.
 * Returns the local path to the downloaded mp4 part.
 */
async function renderPass(opts: {
  passIndex: number;
  totalPasses: number;
  frameRange: [number, number];
  region: AwsRegion;
  functionName: string;
  serveUrl: string;
  props: EpisodeProps;
  framesPerLambda: number;
  bucketName: string;
  outputDir: string;
  renderMediaOnLambda: Function;
  getRenderProgress: Function;
  downloadMedia: Function;
}): Promise<{ partPath: string; cost: number; lambdasInvoked: number }> {
  const {
    passIndex, totalPasses, frameRange, region, functionName, serveUrl,
    props, framesPerLambda, bucketName, outputDir,
    renderMediaOnLambda, getRenderProgress, downloadMedia,
  } = opts;

  const frameCount = frameRange[1] - frameRange[0] + 1;
  const expectedLambdas = Math.ceil(frameCount / framesPerLambda);
  log.info(
    `[Pass ${passIndex + 1}/${totalPasses}] Frames ${frameRange[0]}-${frameRange[1]} (${frameCount} frames, ~${expectedLambdas} Lambdas)`,
  );

  const { renderId, bucketName: renderBucket } = await renderMediaOnLambda({
    region,
    functionName,
    serveUrl,
    composition: 'Episode',
    codec: 'h264',
    inputProps: props as unknown as Record<string, unknown>,
    framesPerLambda,
    frameRange,
    maxRetries: 2,
  });
  log.info(`[Pass ${passIndex + 1}] Render ID: ${renderId}`);

  // Poll for progress
  let lambdasInvoked = 0;
  let renderCost = 0;
  let done = false;

  while (!done) {
    await sleep(5000);
    const progress = await getRenderProgress({
      renderId,
      bucketName: renderBucket,
      region,
      functionName,
    });

    if (progress.fatalErrorEncountered) {
      const errMsg = progress.errors?.[0]?.message ?? 'Unknown Lambda error';
      throw new Error(`[Pass ${passIndex + 1}] Lambda render failed: ${errMsg}`);
    }

    const pct = Math.round((progress.overallProgress ?? 0) * 100);
    const framesRendered = progress.framesRendered ?? 0;
    lambdasInvoked = progress.lambdasInvoked ?? 0;
    renderCost = progress.costs?.accruedSoFar ?? 0;
    const eta = progress.timeToFinish
      ? formatTime(progress.timeToFinish / 1000)
      : '...';

    log.info(
      `[Pass ${passIndex + 1}] ${pct}% | ${framesRendered}/${frameCount} frames | Lambdas: ${lambdasInvoked} | Cost: $${renderCost.toFixed(4)} | ETA: ${eta}`,
    );

    if (progress.done) {
      done = true;
    }
  }

  // Download this pass's output
  const partPath = resolve(outputDir, `part-${passIndex}.mp4`);
  log.info(`[Pass ${passIndex + 1}] Downloading...`);
  const { sizeInBytes } = await downloadMedia({
    bucketName: renderBucket,
    region,
    renderId,
    outPath: partPath,
  });
  const sizeMB = (sizeInBytes / 1024 / 1024).toFixed(1);
  log.info(`[Pass ${passIndex + 1}] Downloaded: ${partPath} (${sizeMB}MB)`);

  return { partPath, cost: renderCost, lambdasInvoked };
}

export async function renderEpisodeOnLambda(
  options: LambdaRenderOptions,
): Promise<LambdaRenderResult> {
  const {
    props,
    dataDir,
    region: regionStr = process.env.REMOTION_AWS_REGION ?? 'us-east-1',
    framesPerLambda = 60,
    skipDeploy = false,
  } = options;

  const region = regionStr as AwsRegion;

  // Dynamic imports — only load if Lambda rendering is requested
  const {
    deploySite,
    deployFunction,
    getOrCreateBucket,
    getFunctions,
    getSites,
    downloadMedia,
  } = await import('@remotion/lambda');

  const {
    renderMediaOnLambda,
    getRenderProgress,
  } = await import('@remotion/lambda/client');

  // Validate credentials
  if (!process.env.REMOTION_AWS_ACCESS_KEY_ID || !process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      'Missing AWS credentials. Set REMOTION_AWS_ACCESS_KEY_ID and REMOTION_AWS_SECRET_ACCESS_KEY in .env',
    );
  }

  const outputDir = resolve(dataDir, 'renders', props.episodeId);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, 'episode-raw.mp4');

  // Step 1: Get or create S3 bucket
  log.info('Getting S3 bucket...');
  const { bucketName } = await getOrCreateBucket({ region });
  log.info(`Bucket: ${bucketName}`);

  // Step 2: Ensure Lambda function exists (3008MB — free tier max)
  log.info('Checking Lambda functions...');
  const allFunctions = await getFunctions({ region, compatibleOnly: false });
  let functionName: string;

  if (allFunctions.length > 0) {
    functionName = allFunctions[0].functionName;
    log.info(`Reusing function: ${functionName}`);
  } else {
    log.info('Deploying new Lambda function...');
    const fn = await deployFunction({
      region,
      timeoutInSeconds: 900,
      memorySizeInMb: 3008,
      createCloudWatchLogGroup: true,
    });
    functionName = fn.functionName;
    log.info(`Deployed: ${functionName}`);
  }

  // Step 3: Deploy site to S3 (using staging dir with only referenced assets)
  let serveUrl: string;

  if (skipDeploy) {
    log.info('Skipping site deploy (--skip-deploy)');
    const { sites } = await getSites({ region });
    const existing = sites.find(
      (s) => s.id === 'dead-air' || s.id.startsWith('dead-air'),
    );
    if (!existing) {
      throw new Error('No existing site found. Run without --skip-deploy first.');
    }
    serveUrl = existing.serveUrl;
    log.info(`Reusing site: ${serveUrl}`);
  } else {
    // Build staging directory with only the assets this episode needs
    log.info('Building staging directory...');
    const stagingDir = buildStagingDir(props, dataDir);

    log.info('Deploying site to S3...');
    const entryPoint = resolve(
      import.meta.dirname ?? new URL('.', import.meta.url).pathname,
      '..', '..', '..', 'remotion', 'src', 'entry.ts',
    );
    const { serveUrl: url } = await deploySite({
      entryPoint,
      bucketName,
      region,
      siteName: 'dead-air',
      options: {
        publicDir: stagingDir,
      },
    });
    serveUrl = url;
    log.info(`Deployed site: ${serveUrl}`);

    // Clean up staging dir
    rmSync(stagingDir, { recursive: true });
    log.info('Staging directory cleaned up');
  }

  // Step 4: Calculate passes — split into chunks to stay under the Lambda limit
  const totalFrames = props.totalDurationInFrames;
  const maxFramesPerPass = MAX_LAMBDAS_PER_RENDER * framesPerLambda;
  const numPasses = Math.ceil(totalFrames / maxFramesPerPass);

  log.info(
    `Render plan: ${totalFrames} frames, ${framesPerLambda} per Lambda, ${numPasses} pass(es)`,
  );

  // Step 5: Render each pass
  const partPaths: string[] = [];
  let totalCost = 0;
  let totalLambdas = 0;

  for (let i = 0; i < numPasses; i++) {
    const startFrame = i * maxFramesPerPass;
    const endFrame = Math.min((i + 1) * maxFramesPerPass - 1, totalFrames - 1);

    const result = await renderPass({
      passIndex: i,
      totalPasses: numPasses,
      frameRange: [startFrame, endFrame],
      region,
      functionName,
      serveUrl,
      props,
      framesPerLambda,
      bucketName,
      outputDir,
      renderMediaOnLambda,
      getRenderProgress,
      downloadMedia,
    });

    partPaths.push(result.partPath);
    totalCost += result.cost;
    totalLambdas += result.lambdasInvoked;
  }

  // Step 6: Concatenate parts (if multiple passes)
  if (partPaths.length === 1) {
    // Single pass — just rename
    const { renameSync } = await import('fs');
    renameSync(partPaths[0], outputPath);
  } else {
    log.info(`Concatenating ${partPaths.length} parts...`);
    const listFile = resolve(outputDir, 'concat-list.txt');
    const listContent = partPaths.map((p) => `file '${p}'`).join('\n');
    writeFileSync(listFile, listContent);

    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}"`,
      { stdio: 'pipe' },
    );

    // Clean up parts
    for (const p of partPaths) {
      if (existsSync(p)) rmSync(p);
    }
    rmSync(listFile);
    log.info('Concatenation complete, parts cleaned up');
  }

  const durationSec = totalFrames / 30;
  log.info(
    `Render complete: ${outputPath} | ${numPasses} pass(es) | $${totalCost.toFixed(2)} total cost`,
  );

  return {
    outputPath,
    durationSec,
    cost: totalCost,
    lambdasInvoked: totalLambdas,
  };
}
