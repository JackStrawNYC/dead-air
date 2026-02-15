import type { Command } from 'commander';

export function registerCatalogCommand(program: Command): void {
  program
    .command('catalog')
    .description('Browse and select Grateful Dead shows from archive.org')
    .option('-d, --date <date>', 'Filter by date (YYYY-MM-DD)')
    .option('-v, --venue <venue>', 'Filter by venue name')
    .option('-y, --year <year>', 'Filter by year')
    .option('--rating <min>', 'Minimum source rating (1-10)', '5')
    .action(async (options) => {
      console.log('[catalog] Not yet implemented. Options:', options);
      console.log(
        '[catalog] This will browse archive.org for Grateful Dead shows.',
      );
    });
}
