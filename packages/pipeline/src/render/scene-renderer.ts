import { resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { cpus } from 'os';
import { createLogger } from '@dead-air/core';
import type { EpisodeProps } from './composition-builder.js';

const execFileAsync = promisify(execFile);
const log = createLogger('render:scene-renderer');

const FPS = 30;
const CROSSFADE_FRAMES = 30;

/**
 * Max frames per render chunk. Chrome's ANGLE GPU backend leaks memory
 * and OOM-crashes after ~1000-3000 frames of 1080p rendering. Splitting
 * large segments into chunks with fresh browser instances avoids this.
 */
const MAX_FRAMES_PER_CHUNK = 3000;

export interface SceneRenderOptions {
  props: EpisodeProps;
  dataDir: string;
  /** Render specific segment index(es), or 'all' */
  segmentIndex: number | number[] | 'all';
  /** Max parallel segment renders (default: 4) */
  concurrency?: number;
  /** Parallel frame renders per segment (default: auto based on CPU/segment concurrency) */
  frameConcurrency?: number;
  /** GL renderer: 'angle' (hardware GPU) or 'swiftshader' (software). Default: 'angle' */
  gl?: 'angle' | 'swiftshader';
  /** Only re-render changed segments */
  changedOnly?: boolean;
  /** Force re-render even if hash matches */
  force?: boolean;
}

export interface SceneRenderResult {
  segmentIndex: number;
  outputPath: string;
  frames: number;
  skipped: boolean;
}

/**
 * Compute a hash for a segment's render inputs to detect changes.
 * Includes adjacent segments (crossfade transitions) and filtered
 * audio windows that affect the mini-composition.
 */
function segmentHash(props: EpisodeProps, segIndex: number): string {
  const seg = props.segments[segIndex];
  const hash = createHash('md5');
  hash.update(JSON.stringify(seg));

  // Include adjacent segments (they affect crossfade transitions in mini-comp)
  if (segIndex > 0) {
    hash.update(JSON.stringify(props.segments[segIndex - 1]));
  }
  if (segIndex < props.segments.length - 1) {
    hash.update(JSON.stringify(props.segments[segIndex + 1]));
  }

  // Compute the full-composition frame range of the mini window
  const windowStart = Math.max(0, segIndex - 1);
  const windowEnd = Math.min(props.segments.length - 1, segIndex + 1);
  const fullStart = getSegmentFrameRange(props, windowStart).startFrame;
  const fullEnd = getSegmentFrameRange(props, windowEnd).endFrame;

  // Include only audio windows that overlap this segment's mini-composition
  const relevantSilence = (props.silenceWindows ?? []).filter((w) => {
    const wEnd = w.startFrame + w.durationFrames;
    return wEnd > fullStart && w.startFrame < fullEnd;
  });
  const relevantPreSwell = (props.preSwellWindows ?? []).filter((w) => {
    const rampStart = w.peakFrame - w.rampFrames;
    return w.peakFrame > fullStart && rampStart < fullEnd;
  });

  hash.update(JSON.stringify({
    silenceWindows: relevantSilence,
    preSwellWindows: relevantPreSwell,
    audioMix: props.audioMix,
    bgmSrc: props.bgmSrc,
    ambientBedSrc: props.ambientBedSrc,
  }));
  return hash.digest('hex').slice(0, 12);
}

/**
 * Compute the frame range for a specific segment within the full composition.
 * Accounts for TransitionSeries crossfade overlaps.
 */
function getSegmentFrameRange(
  props: EpisodeProps,
  segIndex: number,
): { startFrame: number; endFrame: number; durationInFrames: number } {
  let cursor = 0;
  for (let i = 0; i < segIndex; i++) {
    cursor += props.segments[i].durationInFrames;
    if (i < props.segments.length - 1) cursor -= CROSSFADE_FRAMES;
  }
  const seg = props.segments[segIndex];
  return {
    startFrame: cursor,
    endFrame: cursor + seg.durationInFrames,
    durationInFrames: seg.durationInFrames,
  };
}

/**
 * Build a stripped-down mini-composition props for rendering a single segment.
 * Uses a sliding window of up to 3 segments (prev, target, next) so that
 * crossfade transitions are preserved while Chrome only needs to evaluate
 * a few hundred preceding frames instead of tens of thousands.
 *
 * Example for segment 10 (42-segment composition):
 *   Full comp: 42 segs, 325207 frames — Chrome hangs at frame 37691
 *   Mini comp: [seg9, seg10, seg11], ~30431 frames — target starts at ~360
 */
function buildMiniProps(
  props: EpisodeProps,
  segIndex: number,
): { miniProps: EpisodeProps; startFrame: number; endFrame: number } {
  // Sliding window: [prev?, target, next?]
  const windowStart = Math.max(0, segIndex - 1);
  const windowEnd = Math.min(props.segments.length - 1, segIndex + 1);
  const miniSegments = props.segments.slice(windowStart, windowEnd + 1);

  // Target's index within the mini segments array
  const targetIdx = segIndex - windowStart;

  // Total duration of mini composition (same formula as composition-builder)
  const rawTotal = miniSegments.reduce((sum, s) => sum + s.durationInFrames, 0);
  const transitionOverlap = CROSSFADE_FRAMES * Math.max(0, miniSegments.length - 1);
  const totalDurationInFrames = rawTotal - transitionOverlap;

  // Target's frame range within the mini composition
  let cursor = 0;
  for (let i = 0; i < targetIdx; i++) {
    cursor += miniSegments[i].durationInFrames;
    if (i < miniSegments.length - 1) cursor -= CROSSFADE_FRAMES;
  }
  const startFrame = cursor;
  const endFrame = cursor + miniSegments[targetIdx].durationInFrames;

  // Composition-level offset of the window (for adjusting audio windows)
  const fullWindowStart = getSegmentFrameRange(props, windowStart).startFrame;
  const fullWindowEnd = getSegmentFrameRange(props, windowEnd).endFrame;

  // Filter and re-offset silenceWindows to mini-composition frame space
  const silenceWindows = (props.silenceWindows ?? [])
    .filter((w) => {
      const wEnd = w.startFrame + w.durationFrames;
      return wEnd > fullWindowStart && w.startFrame < fullWindowEnd;
    })
    .map((w) => ({
      ...w,
      startFrame: w.startFrame - fullWindowStart,
    }));

  // Filter and re-offset preSwellWindows to mini-composition frame space
  const preSwellWindows = (props.preSwellWindows ?? [])
    .filter((w) => {
      const rampStart = w.peakFrame - w.rampFrames;
      return w.peakFrame > fullWindowStart && rampStart < fullWindowEnd;
    })
    .map((w) => ({
      ...w,
      peakFrame: w.peakFrame - fullWindowStart,
    }));

  const miniProps: EpisodeProps = {
    episodeId: props.episodeId,
    episodeTitle: props.episodeTitle,
    segments: miniSegments,
    totalDurationInFrames,
    bgmSrc: props.bgmSrc,
    ambientBedSrc: props.ambientBedSrc,
    tensionDroneSrc: props.tensionDroneSrc,
    audioMix: props.audioMix,
    hasVinylNoise: props.hasVinylNoise,
    hasCrowdAmbience: props.hasCrowdAmbience,
    silenceWindows,
    preSwellWindows,
  };

  return { miniProps, startFrame, endFrame };
}

/**
 * Bundle the Remotion project once and return the serve URL.
 * Cached for reuse across all segment renders.
 * Composition selection happens per-segment in renderSingleSegment
 * since each mini-composition has different inputProps.
 */
async function bundleOnce(dataDir: string): Promise<string> {
  const { bundle } = await import('@remotion/bundler');

  const entryPoint = resolve(
    import.meta.dirname ?? new URL('.', import.meta.url).pathname,
    '..', '..', '..', 'remotion', 'src', 'entry.ts',
  );

  log.info('Bundling Remotion project (once)...');
  const serveUrl = await bundle({ entryPoint, publicDir: dataDir });
  log.info('Bundle ready.');

  return serveUrl;
}

/**
 * Render a single chunk of frames via renderMedia, returning the temp path.
 */
async function renderChunk(
  serveUrl: string,
  miniProps: EpisodeProps,
  chunkStart: number,
  chunkEnd: number,
  outputPath: string,
  frameConcurrency: number,
  gl: 'angle' | 'swiftshader',
): Promise<void> {
  const { renderMedia, selectComposition } = await import('@remotion/renderer');

  // Fresh composition selection per chunk (fresh browser avoids OOM accumulation)
  const composition = await selectComposition({
    serveUrl,
    id: 'Episode',
    inputProps: miniProps as unknown as Record<string, unknown>,
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: miniProps as unknown as Record<string, unknown>,
    concurrency: frameConcurrency,
    everyNthFrame: 1,
    frameRange: [chunkStart, chunkEnd],
    timeoutInMilliseconds: 120_000,
    chromiumOptions: {
      disableWebSecurity: true,
      gl,
    },
  });
}

/**
 * Render a single segment using a mini-composition (up to 3 segments).
 * Large segments are automatically split into chunks of MAX_FRAMES_PER_CHUNK
 * to avoid Chrome OOM crashes, then concatenated via FFmpeg.
 */
async function renderSingleSegment(
  props: EpisodeProps,
  segIndex: number,
  dataDir: string,
  force: boolean,
  serveUrl: string,
  frameConcurrency: number,
  gl: 'angle' | 'swiftshader',
): Promise<SceneRenderResult> {
  const seg = props.segments[segIndex];
  const segType = seg.type;
  const segName = 'songName' in seg ? (seg as { songName: string }).songName : segType;

  const outputDir = resolve(dataDir, 'renders', props.episodeId, 'scenes');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const paddedIdx = String(segIndex).padStart(3, '0');
  const outputPath = resolve(outputDir, `segment-${paddedIdx}.mp4`);
  const hashFile = resolve(outputDir, `segment-${paddedIdx}.hash`);

  // Change detection
  const currentHash = segmentHash(props, segIndex);
  if (!force && existsSync(outputPath) && existsSync(hashFile)) {
    const savedHash = readFileSync(hashFile, 'utf-8').trim();
    if (savedHash === currentHash) {
      log.info(`  [${paddedIdx}] ${segName} — unchanged, skipping`);
      return { segmentIndex: segIndex, outputPath, frames: seg.durationInFrames, skipped: true };
    }
  }

  // Build mini-composition for this segment
  const { miniProps, startFrame, endFrame } = buildMiniProps(props, segIndex);
  const miniSegCount = miniProps.segments.length;
  const targetFrames = endFrame - startFrame;
  log.info(
    `  [${paddedIdx}] ${segName} (${segType}) — mini-comp: ${miniSegCount} segs, ` +
    `${miniProps.totalDurationInFrames}f, target frames ${startFrame}-${endFrame - 1}`,
  );

  if (targetFrames <= MAX_FRAMES_PER_CHUNK) {
    // Small segment — render directly in one pass
    await renderChunk(serveUrl, miniProps, startFrame, endFrame - 1, outputPath, frameConcurrency, gl);
  } else {
    // Large segment — split into chunks to avoid Chrome OOM
    const numChunks = Math.ceil(targetFrames / MAX_FRAMES_PER_CHUNK);
    log.info(`  [${paddedIdx}] Splitting into ${numChunks} chunks of ~${MAX_FRAMES_PER_CHUNK} frames`);

    const chunkPaths: string[] = [];
    for (let c = 0; c < numChunks; c++) {
      const chunkStart = startFrame + c * MAX_FRAMES_PER_CHUNK;
      const chunkEnd = Math.min(startFrame + (c + 1) * MAX_FRAMES_PER_CHUNK - 1, endFrame - 1);
      const chunkFrames = chunkEnd - chunkStart + 1;
      const chunkPath = resolve(outputDir, `segment-${paddedIdx}-chunk-${String(c).padStart(3, '0')}.mp4`);
      chunkPaths.push(chunkPath);

      log.info(`  [${paddedIdx}]   chunk ${c + 1}/${numChunks}: frames ${chunkStart}-${chunkEnd} (${chunkFrames}f)`);
      await renderChunk(serveUrl, miniProps, chunkStart, chunkEnd, chunkPath, frameConcurrency, gl);
      log.info(`  [${paddedIdx}]   chunk ${c + 1}/${numChunks} ✓`);
    }

    // Concatenate chunks into final segment
    const concatListPath = resolve(outputDir, `segment-${paddedIdx}-concat.txt`);
    writeFileSync(concatListPath, chunkPaths.map((p) => `file '${p}'`).join('\n'));

    await execFileAsync('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      outputPath,
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 60_000 });

    // Clean up chunk files
    const { unlinkSync } = await import('fs');
    for (const p of chunkPaths) {
      try { unlinkSync(p); } catch { /* ignore */ }
    }
    try { unlinkSync(concatListPath); } catch { /* ignore */ }
  }

  // Save hash
  writeFileSync(hashFile, currentHash);
  log.info(`  [${paddedIdx}] ✓ ${segName} rendered (${seg.durationInFrames} frames)`);

  return { segmentIndex: segIndex, outputPath, frames: seg.durationInFrames, skipped: false };
}

/**
 * Render segments with concurrency control.
 * Bundles the Remotion project once and reuses across all workers.
 */
async function renderWithConcurrency(
  props: EpisodeProps,
  indices: number[],
  dataDir: string,
  concurrency: number,
  force: boolean,
  frameConcurrency: number,
  gl: 'angle' | 'swiftshader',
): Promise<SceneRenderResult[]> {
  // Bundle once, reuse for all segments
  const serveUrl = await bundleOnce(dataDir);

  log.info(`Render config: ${concurrency} segment workers × ${frameConcurrency} frame threads, GL: ${gl}`);

  const results: SceneRenderResult[] = [];
  const queue = [...indices];

  async function processNext(): Promise<void> {
    while (queue.length > 0) {
      const idx = queue.shift()!;
      const result = await renderSingleSegment(props, idx, dataDir, force, serveUrl, frameConcurrency, gl);
      results.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => processNext());
  await Promise.all(workers);

  return results.sort((a, b) => a.segmentIndex - b.segmentIndex);
}

/**
 * Render episode segments individually, then concat into final video.
 */
export async function renderScenes(options: SceneRenderOptions): Promise<SceneRenderResult[]> {
  const { props, dataDir, segmentIndex, changedOnly = false, force = false } = options;
  const gl = options.gl ?? 'angle';

  // ANGLE (GPU): frameConcurrency MUST be 1 — multiple GPU tabs deadlock on shared-memory Apple Silicon.
  // SwiftShader (CPU): can use multiple frame threads safely, auto-computed from available cores.
  const numCpus = cpus().length;
  const concurrency = options.concurrency ?? (gl === 'angle' ? 2 : 4);
  const frameConcurrency = options.frameConcurrency
    ?? (gl === 'angle' ? 1 : Math.min(4, Math.max(1, Math.floor(numCpus / concurrency))));

  log.info(`=== Scene-by-scene render: ${props.episodeId} (${props.segments.length} segments) ===`);

  let indices: number[];
  if (segmentIndex === 'all') {
    indices = props.segments.map((_, i) => i);
  } else if (Array.isArray(segmentIndex)) {
    indices = segmentIndex;
  } else {
    indices = [segmentIndex];
  }

  const results = await renderWithConcurrency(props, indices, dataDir, concurrency, force, frameConcurrency, gl);

  const rendered = results.filter((r) => !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  log.info(`Rendered ${rendered.length} segments, skipped ${skipped.length} unchanged`);

  return results;
}

/**
 * Concatenate rendered scene files into a single MP4 using FFmpeg concat demuxer.
 */
export async function concatScenes(
  props: EpisodeProps,
  dataDir: string,
): Promise<string> {
  const sceneDir = resolve(dataDir, 'renders', props.episodeId, 'scenes');
  const outputDir = resolve(dataDir, 'renders', props.episodeId);
  const outputPath = resolve(outputDir, 'episode-raw.mp4');
  const concatListPath = resolve(sceneDir, 'concat.txt');

  // Build concat list
  const lines: string[] = [];
  for (let i = 0; i < props.segments.length; i++) {
    const paddedIdx = String(i).padStart(3, '0');
    const scenePath = resolve(sceneDir, `segment-${paddedIdx}.mp4`);
    if (!existsSync(scenePath)) {
      log.warn(`Missing scene: ${scenePath} — skipping`);
      continue;
    }
    lines.push(`file '${scenePath}'`);
  }

  writeFileSync(concatListPath, lines.join('\n'));
  log.info(`Concatenating ${lines.length} scenes...`);

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      outputPath,
    ],
    { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 },
  );

  log.info(`Concatenated: ${outputPath}`);
  return outputPath;
}
