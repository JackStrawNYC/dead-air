import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { createLogger } from '@dead-air/core';
import type { EpisodeProps } from './composition-builder.js';

const log = createLogger('render:renderer');

export interface RenderOptions {
  props: EpisodeProps;
  dataDir: string;
  concurrency?: number;
}

export interface RenderResult {
  outputPath: string;
  durationSec: number;
}

export async function renderEpisode(options: RenderOptions): Promise<RenderResult> {
  const { props, dataDir, concurrency = 4 } = options;

  // Dynamic imports — these are heavy and may not be installed in all environments
  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, selectComposition } = await import('@remotion/renderer');

  const entryPoint = resolve(
    import.meta.dirname ?? new URL('.', import.meta.url).pathname,
    '..', '..', '..', 'remotion', 'src', 'entry.ts',
  );

  const outputDir = resolve(dataDir, 'renders', props.episodeId);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, 'episode-raw.mp4');

  log.info(`Bundling Remotion project (entry: ${entryPoint})...`);
  const bundled = await bundle({
    entryPoint,
    publicDir: dataDir,
  });

  log.info('Selecting composition...');
  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'Episode',
    inputProps: props as unknown as Record<string, unknown>,
  });

  log.info(
    `Rendering ${composition.durationInFrames} frames at ${composition.fps}fps (concurrency: ${concurrency})...`,
  );
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: props as unknown as Record<string, unknown>,
    concurrency,
    timeoutInMilliseconds: 120_000, // 2 min per frame (images can be slow to load)
    chromiumOptions: {
      disableWebSecurity: true,
      gl: 'swiftshader',
    },
    onProgress: (() => {
      let lastPct = -1;
      return ({ progress }: { progress: number }) => {
        const pct = Math.round(progress * 100);
        if (pct % 5 === 0 && pct !== lastPct) {
          lastPct = pct;
          log.info(`Render progress: ${pct}%`);
        }
      };
    })(),
  });

  const durationSec = composition.durationInFrames / composition.fps;
  log.info(`Render complete: ${outputPath} (${durationSec.toFixed(1)}s)`);

  return { outputPath, durationSec };
}
