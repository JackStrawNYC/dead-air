/**
 * Test render — renders specific segments to verify visual quality.
 *
 * Usage: npx tsx packages/cli/src/test-render.ts [segment indices...] [--episode=ID]
 *
 * Examples:
 *   npx tsx packages/cli/src/test-render.ts           # Print segment map only
 *   npx tsx packages/cli/src/test-render.ts 0 1 3     # Cold open + brand intro + first song
 *   npx tsx packages/cli/src/test-render.ts 39 40 41  # Legacy card + credits + end screen
 *   npx tsx packages/cli/src/test-render.ts --episode=ep-1977-05-08 11 13 14 15
 */
import { loadConfig, getDb } from '@dead-air/core';
import { buildCompositionProps, renderScenes } from '@dead-air/pipeline';

const DEFAULT_EPISODE_ID = 'ep-1977-05-08';

async function main() {
  const config = loadConfig();
  const db = getDb(config.paths.database);
  const dataDir = config.paths.data;

  // Parse flags: --episode=ID --gl=angle|swiftshader --frame-concurrency=N --concurrency=N
  const rawArgs = process.argv.slice(2);
  const episodeFlag = rawArgs.find((a) => a.startsWith('--episode='))?.split('=')[1];
  const glFlag = rawArgs.find((a) => a.startsWith('--gl='))?.split('=')[1] as 'angle' | 'swiftshader' | undefined;
  const fcFlag = rawArgs.find((a) => a.startsWith('--frame-concurrency='))?.split('=')[1];
  const ccFlag = rawArgs.find((a) => a.startsWith('--concurrency='))?.split('=')[1];
  const args = rawArgs.filter((a) => !a.startsWith('--')).map(Number).filter((n) => !isNaN(n));

  const EPISODE_ID = episodeFlag || DEFAULT_EPISODE_ID;

  console.log(`\n=== Building composition props for ${EPISODE_ID} ===\n`);
  const props = await buildCompositionProps({ episodeId: EPISODE_ID, db, dataDir });

  console.log(`Total: ${props.segments.length} segments, ${props.totalDurationInFrames} frames (${(props.totalDurationInFrames / 30 / 60).toFixed(1)} min)\n`);
  console.log('Segment map:');
  props.segments.forEach((seg, i) => {
    const name = 'songName' in seg ? (seg as { songName: string }).songName : seg.type;
    const dur = (seg.durationInFrames / 30).toFixed(1);
    const marker = args.includes(i) ? ' ←' : '';
    console.log(`  [${String(i).padStart(2)}] ${seg.type.padEnd(18)} ${name.padEnd(30)} ${dur}s${marker}`);
  });

  if (args.length === 0) {
    console.log('\nPass segment indices as args to render. Example:');
    console.log('  npx tsx packages/cli/src/test-render.ts 0 1 3\n');
    return;
  }

  const validIndices = args.filter((i) => i >= 0 && i < props.segments.length);
  if (validIndices.length === 0) {
    console.log(`\nNo valid indices (max: ${props.segments.length - 1})`);
    return;
  }

  const totalFrames = validIndices.reduce((sum, i) => sum + props.segments[i].durationInFrames, 0);
  console.log(`\n=== Rendering ${validIndices.length} segments (${totalFrames} frames, ~${(totalFrames / 30 / 60).toFixed(1)} min) ===\n`);

  const renderOpts: Parameters<typeof renderScenes>[0] = {
    props,
    dataDir,
    segmentIndex: validIndices,
    concurrency: ccFlag ? Number(ccFlag) : 1,
    force: true,
    ...(glFlag && { gl: glFlag }),
    ...(fcFlag && { frameConcurrency: Number(fcFlag) }),
  };
  console.log(`Render config: gl=${renderOpts.gl ?? 'auto'}, frameConcurrency=${renderOpts.frameConcurrency ?? 'auto'}, concurrency=${renderOpts.concurrency}`);
  await renderScenes(renderOpts);

  console.log('\n=== Done ===\n');
  console.log('Output files:');
  for (const idx of validIndices) {
    const padded = String(idx).padStart(3, '0');
    console.log(`  data/renders/${EPISODE_ID}/scenes/segment-${padded}.mp4`);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
