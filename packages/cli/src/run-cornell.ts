import { loadConfig, getDb } from '@dead-air/core';
import {
  orchestrateResearch,
  orchestrateScript,
  orchestrateAssetGeneration,
  orchestrateRender,
} from '@dead-air/pipeline';

const SHOW_DATE = '1977-05-08';
const EPISODE_ID = `ep-${SHOW_DATE}`;

async function main() {
  const config = loadConfig();
  const db = getDb(config.paths.database);

  // Stage 1: Research (cached)
  console.log('\n=== Stage 1: Show Research ===\n');
  try {
    const research = await orchestrateResearch({
      date: SHOW_DATE,
      db,
      dataDir: config.paths.data,
      apiKey: config.api.anthropicKey!,
      model: 'claude-sonnet-4-5-20250929',
    });
    console.log(`Research: ${research.cached ? 'cached' : `$${research.cost.toFixed(4)}`}`);
  } catch (err) {
    console.error('Research failed:', (err as Error).message);
  }

  // Stage 2: Script generation (use cached if available)
  console.log('\n=== Stage 2: Script Generation ===\n');
  try {
    const script = await orchestrateScript({
      date: SHOW_DATE,
      db,
      dataDir: config.paths.data,
      apiKey: config.api.anthropicKey!,
      model: 'claude-sonnet-4-5-20250929',
    });
    console.log(`Script: "${script.title}"`);
    console.log(`  ${script.segmentCount} segments, ${script.concertExcerpts} concert excerpts`);
    console.log(`  Est. duration: ~${script.estimatedDurationMin} min`);
    console.log(`  Cost: $${script.cost.toFixed(4)}`);
    if (script.warnings.length > 0) {
      console.log(`  Warnings: ${script.warnings.join(', ')}`);
    }
  } catch (err) {
    console.error('Script generation failed:', (err as Error).message);
    return; // Can't continue without a script
  }

  // Stage 3: Image generation (force — new prompts, skip narration since cached)
  console.log('\n=== Stage 3: Image Generation (force) ===\n');
  try {
    const assets = await orchestrateAssetGeneration({
      episodeId: EPISODE_ID,
      db,
      dataDir: config.paths.data,
      replicateToken: config.api.replicateToken!,
      xaiApiKey: config.api.xaiApiKey,
      flickrApiKey: config.api.flickrApiKey,
      elevenlabsKey: config.api.elevenlabsKey!,
      elevenlabsVoiceId: config.api.elevenlabsVoiceId!,
      concurrency: 3,
      skipArchival: true,
      force: true,
    });
    console.log(`Assets: ${assets.totalAssets} total, ${assets.cachedAssets} cached`);
    console.log(`  Images: ${assets.images.length}`);
    console.log(`  Narrations: ${assets.narrations.length}`);
    console.log(`  Cost: $${assets.totalCost.toFixed(4)}`);
    if (assets.failedAssets.length > 0) {
      console.log(`  Failures: ${assets.failedAssets.join('\n    ')}`);
    }
  } catch (err) {
    console.error('Asset generation failed:', (err as Error).message);
    console.error((err as Error).stack);
    return;
  }

  // Stage 4: Render
  console.log('\n=== Stage 4: Render ===\n');
  try {
    const render = await orchestrateRender({
      episodeId: EPISODE_ID,
      db,
      dataDir: config.paths.data,
      concurrency: config.remotion.concurrency,
      dryRun: false,
    });
    console.log(`Render complete: ${render.totalFrames} frames (${(render.totalFrames / 30).toFixed(1)}s)`);
    if (render.finalPath) {
      console.log(`Output: ${render.finalPath}`);
    }
  } catch (err) {
    console.error('Render failed:', (err as Error).message);
    console.error((err as Error).stack);
  }
}

main().catch(console.error);
