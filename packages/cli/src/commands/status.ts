import type { Command } from 'commander';
import { getConfig, getDb, closeDb } from '@dead-air/core';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show pipeline status for all episodes')
    .option('-e, --episode <id>', 'Show status for a specific episode')
    .action(async (options) => {
      try {
        const config = getConfig();
        const db = getDb(config.paths.database);

        if (options.episode) {
          const episode = db
            .prepare(
              'SELECT id, title, status, progress, total_cost, created_at FROM episodes WHERE id = ?',
            )
            .get(options.episode) as Record<string, unknown> | undefined;

          if (!episode) {
            console.log(`No episode found with ID: ${options.episode}`);
          } else {
            console.log(`\nEpisode: ${episode.title}`);
            console.log(`  ID:       ${episode.id}`);
            console.log(`  Status:   ${episode.status}`);
            console.log(`  Progress: ${episode.progress}%`);
            console.log(
              `  Cost:     $${((episode.total_cost as number) || 0).toFixed(2)}`,
            );
            console.log(`  Created:  ${episode.created_at}`);
          }
        } else {
          const episodes = db
            .prepare(
              'SELECT id, title, status, progress, total_cost FROM episodes ORDER BY created_at DESC',
            )
            .all() as Array<Record<string, unknown>>;

          if (episodes.length === 0) {
            console.log(
              '\nNo episodes yet. Run `deadair catalog` to find a show, then `deadair produce` to start.',
            );
          } else {
            console.log(
              `\n${'ID'.padEnd(20)} ${'Title'.padEnd(30)} ${'Status'.padEnd(12)} ${'Progress'.padEnd(10)} Cost`,
            );
            console.log('-'.repeat(85));
            for (const ep of episodes) {
              console.log(
                `${(ep.id as string).padEnd(20)} ` +
                  `${(ep.title as string).substring(0, 28).padEnd(30)} ` +
                  `${(ep.status as string).padEnd(12)} ` +
                  `${((ep.progress as number) + '%').padEnd(10)} ` +
                  `$${((ep.total_cost as number) || 0).toFixed(2)}`,
              );
            }
          }

          const showCount = (
            db.prepare('SELECT COUNT(*) as count FROM shows').get() as {
              count: number;
            }
          ).count;
          console.log(`\nShows in catalog: ${showCount}`);
        }

        closeDb();
      } catch (err) {
        console.error('Error:', (err as Error).message);
        process.exit(1);
      }
    });
}
