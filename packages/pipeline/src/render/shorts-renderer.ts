import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { createLogger } from '@dead-air/core';
import type { ShortsProps } from './shorts-builder.js';

const log = createLogger('render:shorts-renderer');

export interface ShortsRenderOptions {
  episodeId: string;
  shortsProps: ShortsProps[];
  dataDir: string;
  concurrency?: number;
}

export interface ShortsRenderResult {
  shortIndex: number;
  outputPath: string;
  durationSec: number;
}

export async function renderShorts(options: ShortsRenderOptions): Promise<ShortsRenderResult[]> {
  const { episodeId, shortsProps, dataDir, concurrency = 2 } = options;

  if (shortsProps.length === 0) {
    log.info('No shorts to render');
    return [];
  }

  // Dynamic imports for Remotion
  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, selectComposition } = await import('@remotion/renderer');

  const entryPoint = resolve(
    import.meta.dirname ?? new URL('.', import.meta.url).pathname,
    '..', '..', '..', 'remotion', 'src', 'entry.ts',
  );

  const shortsDir = resolve(dataDir, 'renders', episodeId, 'shorts');
  if (!existsSync(shortsDir)) mkdirSync(shortsDir, { recursive: true });

  log.info(`Bundling Remotion project for Shorts...`);
  const bundled = await bundle({
    entryPoint,
    publicDir: dataDir,
  });

  const results: ShortsRenderResult[] = [];

  for (let i = 0; i < shortsProps.length; i++) {
    const props = shortsProps[i];
    const outputPath = resolve(shortsDir, `short-${i}.mp4`);

    log.info(`Rendering Short ${i}/${shortsProps.length}: "${props.hookText}"`);

    try {
      const composition = await selectComposition({
        serveUrl: bundled,
        id: 'Shorts',
        inputProps: props as unknown as Record<string, unknown>,
      });

      await renderMedia({
        composition,
        serveUrl: bundled,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps: props as unknown as Record<string, unknown>,
        concurrency,
        onProgress: (() => {
          let lastPct = -1;
          return ({ progress }: { progress: number }) => {
            const pct = Math.round(progress * 100);
            if (pct % 25 === 0 && pct !== lastPct) {
              lastPct = pct;
              log.info(`Short ${i} progress: ${pct}%`);
            }
          };
        })(),
      });

      const durationSec = composition.durationInFrames / composition.fps;
      results.push({ shortIndex: i, outputPath, durationSec });
      log.info(`Short ${i} rendered: ${outputPath} (${durationSec.toFixed(1)}s)`);
    } catch (err) {
      log.error(`Short ${i} render failed: ${(err as Error).message}`);
    }
  }

  log.info(`Rendered ${results.length}/${shortsProps.length} shorts`);
  return results;
}
