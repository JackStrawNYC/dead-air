import type { Command } from 'commander';

export function registerPreviewCommand(program: Command): void {
  program
    .command('preview')
    .description('Open Remotion Studio to preview an episode')
    .argument('[episode-id]', 'Episode ID to preview (opens latest if omitted)')
    .option('-p, --port <port>', 'Studio port', '3000')
    .action(async (episodeId, options) => {
      console.log(
        `[preview] Not yet implemented. Episode: ${episodeId || 'latest'}, Port: ${options.port}`,
      );
      console.log(
        '[preview] This will launch Remotion Studio for the episode.',
      );
    });
}
