import { loadConfig, getDb } from '@dead-air/core';
import { orchestrateRender } from '@dead-air/pipeline';

const EPISODE_ID = 'ep-1977-05-08';
const args = process.argv.slice(2);
const useLambda = args.includes('--lambda');
const skipDeploy = args.includes('--skip-deploy');

async function main() {
  const config = loadConfig();
  const db = getDb(config.paths.database);

  // Set AWS env vars for Remotion Lambda SDK
  if (useLambda && config.aws.accessKeyId) {
    process.env.REMOTION_AWS_ACCESS_KEY_ID = config.aws.accessKeyId;
    process.env.REMOTION_AWS_SECRET_ACCESS_KEY = config.aws.secretAccessKey;
    process.env.REMOTION_AWS_REGION = config.aws.region;
  }

  console.log(`\n=== Render ${useLambda ? '(Lambda)' : '(local)'} ===\n`);
  try {
    const render = await orchestrateRender({
      episodeId: EPISODE_ID,
      db,
      dataDir: config.paths.data,
      concurrency: config.remotion.concurrency,
      dryRun: false,
      lambda: useLambda,
      lambdaRegion: config.aws.region,
      skipDeploy,
    });
    console.log(`Render complete: ${render.totalFrames} frames (${(render.totalFrames / 30).toFixed(1)}s)`);
    if (render.finalPath) console.log(`Output: ${render.finalPath}`);
  } catch (err) {
    console.error('Render failed:', (err as Error).message);
    console.error((err as Error).stack);
  }
}

main().catch(console.error);
