import type { Command } from 'commander';

export function registerPublishCommand(program: Command): void {
  program
    .command('publish')
    .description('Upload a rendered episode to YouTube')
    .argument('<episode-id>', 'Episode ID to publish')
    .option('--unlisted', 'Publish as unlisted')
    .option('--schedule <datetime>', 'Schedule publication (ISO datetime)')
    .option('--dry-run', 'Validate without uploading')
    .action(async (episodeId, options) => {
      console.log(
        `[publish] Not yet implemented. Episode: ${episodeId}, Options:`,
        options,
      );
      console.log(
        '[publish] This will upload the rendered video to YouTube.',
      );
    });
}
