/**
 * Rust Renderer Pipeline — renders a show through the native GPU renderer.
 *
 * Pipeline:
 *   1. Generate full manifest (shader routing + per-frame uniforms)
 *   2. Pre-render overlay PNGs (optional)
 *   3. Invoke Rust binary (dead-air-renderer)
 *   4. Mux audio tracks with FFmpeg
 *
 * This replaces the Remotion/Chrome pipeline with a single native GPU process.
 * No Chrome memory leaks, no chunking, no zombie processes.
 */

import { execFile, spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { createLogger } from '@dead-air/core';

const execFileAsync = promisify(execFile);
const log = createLogger('render:rust');

const RENDERER_ROOT = resolve(
  new URL('.', import.meta.url).pathname,
  '../../../renderer',
);
const RUST_BINARY = join(RENDERER_ROOT, 'target/release/dead-air-renderer');
const MANIFEST_GENERATOR = join(RENDERER_ROOT, 'generate-full-manifest.ts');

export interface RustRenderOptions {
  dataDir: string;
  outputPath: string;
  width?: number;
  height?: number;
  fps?: number;
  crf?: number;
  preview?: boolean;
  startFrame?: number;
  endFrame?: number;
  /** If true, render Remotion overlay layer and composite over Rust shaders */
  withOverlays?: boolean;
}

export interface RustRenderResult {
  outputPath: string;
  manifestPath: string;
  totalFrames: number;
  durationSec: number;
  renderTimeSec: number;
}

/**
 * Check if the Rust renderer binary is available.
 */
export function isRustRendererAvailable(): boolean {
  return existsSync(RUST_BINARY);
}

/**
 * Full Rust render pipeline: manifest → GPU render → audio mux.
 */
export async function renderWithRust(
  options: RustRenderOptions,
): Promise<RustRenderResult> {
  const {
    dataDir,
    outputPath,
    width = 3840,
    height = 2160,
    fps = 60,
    crf = 18,
    preview = false,
  } = options;

  const renderWidth = preview ? 1280 : width;
  const renderHeight = preview ? 720 : height;
  const renderDir = join(dataDir, 'renders', 'rust');
  mkdirSync(renderDir, { recursive: true });

  const manifestPath = join(renderDir, 'manifest.json');
  const rawVideoPath = join(renderDir, 'show-raw.mp4');
  const startTime = Date.now();

  // ─── Step 1: Generate full manifest ───
  log.info('Step 1/3: Generating manifest (full routing intelligence)...');
  await execFileAsync('npx', [
    'tsx',
    MANIFEST_GENERATOR,
    '--data-dir', dataDir,
    '--output', manifestPath,
    '--fps', String(fps),
    '--width', String(renderWidth),
    '--height', String(renderHeight),
  ], {
    cwd: RENDERER_ROOT,
    maxBuffer: 50 * 1024 * 1024, // 50MB for manifest generator output
    timeout: 3600_000, // 60 min — full 3-hour shows at 60fps take 15-30 min
  });
  log.info(`Manifest: ${manifestPath}`);

  // ─── Step 2: Render with Rust GPU renderer ───
  log.info(`Step 2/3: GPU render (${renderWidth}x${renderHeight} @ ${fps}fps)...`);

  const rustArgs = [
    '--manifest', manifestPath,
    '--output', rawVideoPath,
    '--width', String(renderWidth),
    '--height', String(renderHeight),
    '--fps', String(fps),
    '--crf', String(crf),
  ];

  if (options.startFrame !== undefined) {
    rustArgs.push('--start-frame', String(options.startFrame));
  }
  if (options.endFrame !== undefined) {
    rustArgs.push('--end-frame', String(options.endFrame));
  }

  // Spawn renderer with live output
  const renderResult = await new Promise<{ code: number; totalFrames: number }>((resolve, reject) => {
    const proc = spawn(RUST_BINARY, rustArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let totalFrames = 0;
    let lastLine = '';

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(text);
      lastLine = text.trim();
      // Parse "X frames in Y.Zs" from final output
      const match = lastLine.match(/(\d+) frames in/);
      if (match) totalFrames = parseInt(match[1]);
    });

    proc.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      resolve({ code: code ?? 1, totalFrames });
    });

    proc.on('error', reject);
  });

  if (renderResult.code !== 0) {
    throw new Error(`Rust renderer exited with code ${renderResult.code}`);
  }

  // ─── Step 2.5: Overlay render + composite (Mode B) ───
  let videoForMux = rawVideoPath;

  if (options.withOverlays) {
    const overlayVideoPath = join(renderDir, 'overlays.mov');
    const compositeVideoPath = join(renderDir, 'composite.mp4');

    log.info('Step 2.5a: Rendering text/overlay layers via Remotion (OVERLAY_ONLY)...');

    // Render the full show through Remotion with OVERLAY_ONLY=true
    // This skips shaders and produces transparent video (ProRes 4444 with alpha)
    try {
      await execFileAsync('npx', [
        'tsx',
        join(RENDERER_ROOT, '..', 'cli', 'src', 'commands', 'produce.ts'),
        'render',
        '--data-dir', dataDir,
        '--output', overlayVideoPath,
        '--renderer', 'remotion',
      ], {
        cwd: join(RENDERER_ROOT, '..'),
        maxBuffer: 50 * 1024 * 1024,
        timeout: 7200_000, // 2 hours for full Remotion render
        env: {
          ...process.env,
          OVERLAY_ONLY: 'true',
          RENDER_WIDTH: String(renderWidth),
          RENDER_HEIGHT: String(renderHeight),
          RENDER_FPS: String(fps),
        },
      });
      log.info(`Overlay render: ${overlayVideoPath}`);

      // Composite: overlay video on top of shader video
      log.info('Step 2.5b: FFmpeg composite (shaders + overlays)...');
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', rawVideoPath,
        '-i', overlayVideoPath,
        '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto:shortest=1',
        '-c:v', 'libx264',
        '-preset', 'slow',
        '-crf', String(crf),
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        compositeVideoPath,
      ], { timeout: 3600_000 }); // 1 hour for composite

      videoForMux = compositeVideoPath;
      log.info(`Composite: ${compositeVideoPath}`);
    } catch (err) {
      log.warn(`Overlay render failed — using shader-only video: ${err}`);
      // Fall back to shader-only video
      videoForMux = rawVideoPath;
    }
  }

  // ─── Step 3: Mux audio ───
  const stepNum = options.withOverlays ? '3/3' : '3/3';
  log.info(`Step ${stepNum}: Muxing audio...`);

  // Find the audio file(s) — concatenated show audio or per-song
  const showAudioPath = join(dataDir, 'audio', 'show.flac');
  const showAudioMp3 = join(dataDir, 'audio', 'show.mp3');
  const audioPath = existsSync(showAudioPath)
    ? showAudioPath
    : existsSync(showAudioMp3)
      ? showAudioMp3
      : null;

  if (audioPath) {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', videoForMux,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '256k',
      '-shortest',
      '-movflags', '+faststart',
      outputPath,
    ], { timeout: 300_000 });
    log.info(`Audio muxed: ${outputPath}`);
  } else {
    // No audio file found — just copy the raw video
    log.warn('No show audio found — output has no audio track');
    const { copyFileSync } = await import('fs');
    copyFileSync(videoForMux, outputPath);
  }

  const renderTimeSec = (Date.now() - startTime) / 1000;
  const durationSec = renderResult.totalFrames / fps;

  log.info(`=== Rust render complete: ${outputPath} (${durationSec.toFixed(1)}s video in ${renderTimeSec.toFixed(1)}s) ===`);

  return {
    outputPath,
    manifestPath,
    totalFrames: renderResult.totalFrames,
    durationSec,
    renderTimeSec,
  };
}
