/**
 * Run remaining pipeline stages for Cornell '77.
 * Usage: npx tsx scripts/run-pipeline.ts
 */
import { loadConfig, getDb } from '@dead-air/core';
import { orchestrateResearch, orchestrateRender } from '@dead-air/pipeline';

const SHOW_DATE = '1977-05-08';
const EPISODE_ID = `ep-${SHOW_DATE}`;

async function main() {
  const config = loadConfig();
  const db = getDb(config.paths.database);

  // Stage: Research
  console.log('\n=== Stage: Show Research ===\n');
  try {
    const research = await orchestrateResearch({
      date: SHOW_DATE,
      db,
      dataDir: config.paths.data,
      apiKey: config.api.anthropicKey!,
      model: 'claude-sonnet-4-5-20250929',
    });
    console.log(`Research: ${research.cached ? 'cached' : `$${research.cost.toFixed(4)}`}`);
    console.log(`Path: ${research.researchPath}`);
  } catch (err) {
    console.error('Research failed:', (err as Error).message);
  }

  // Stage: Render
  console.log('\n=== Stage: Render ===\n');
  try {
    const render = await orchestrateRender({
      episodeId: EPISODE_ID,
      db,
      dataDir: config.paths.data,
      concurrency: config.remotion.concurrency,
      dryRun: true, // Start with dry run to verify props build
    });
    console.log(`Props built: ${render.totalFrames} frames (${(render.totalFrames / 30).toFixed(1)}s)`);
    console.log(`Props path: ${render.propsPath}`);
  } catch (err) {
    console.error('Render failed:', (err as Error).message);
  }
}

main().catch(console.error);
