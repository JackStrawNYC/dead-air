import { resolve } from 'path';
import { spawn } from 'child_process';
import type { Command } from 'commander';
import { loadConfig, getDb } from '@dead-air/core';
import { buildCompositionProps } from '@dead-air/pipeline';

export function registerPreviewCommand(program: Command): void {
  program
    .command('preview')
    .description('Open Remotion Studio to preview an episode')
    .argument('[episode-id]', 'Episode ID to preview (opens latest if omitted)')
    .option('-p, --port <port>', 'Studio port', '3000')
    .action(async (episodeId, options) => {
      const config = loadConfig();
      const db = getDb(config.paths.database);

      // Resolve episode ID
      let resolvedId = episodeId;
      if (!resolvedId) {
        const row = db
          .prepare('SELECT id FROM episodes ORDER BY created_at DESC LIMIT 1')
          .get() as { id: string } | undefined;
        if (!row) {
          console.error('No episodes found. Run the pipeline first.');
          process.exit(1);
        }
        resolvedId = row.id;
        console.log(`Using latest episode: ${resolvedId}`);
      }

      // Build props so Studio has input data
      console.log('Building composition props...');
      await buildCompositionProps({
        episodeId: resolvedId,
        db,
        dataDir: config.paths.data,
      });

      // Launch Remotion Studio
      const remotionDir = resolve(
        import.meta.dirname ?? new URL('.', import.meta.url).pathname,
        '..', '..', '..', 'remotion',
      );

      console.log(`Launching Remotion Studio on port ${options.port}...`);
      const studio = spawn(
        'npx',
        ['remotion', 'studio', '--port', options.port],
        {
          cwd: remotionDir,
          stdio: 'inherit',
          env: {
            ...process.env,
            REMOTION_INPUT_PROPS: resolve(
              config.paths.data,
              'renders',
              resolvedId,
              'props.json',
            ),
          },
        },
      );

      studio.on('error', (err) => {
        console.error('Failed to start Remotion Studio:', err.message);
        process.exit(1);
      });
    });
}
