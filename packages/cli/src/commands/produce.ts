import type { Command } from 'commander';

export function registerProduceCommand(program: Command): void {
  program
    .command('produce')
    .description('Run the full production pipeline for a show')
    .argument('<show-id>', 'Show date (YYYY-MM-DD) or archive.org identifier')
    .option('--from <stage>', 'Resume from a specific pipeline stage')
    .option('--to <stage>', 'Stop after a specific pipeline stage')
    .option('--dry-run', 'Show what would happen without executing')
    .action(async (showId, options) => {
      console.log(
        `[produce] Not yet implemented. Show: ${showId}, Options:`,
        options,
      );
      console.log(
        '[produce] Pipeline: ingest -> analyze -> script -> generate -> render -> publish',
      );
    });
}
