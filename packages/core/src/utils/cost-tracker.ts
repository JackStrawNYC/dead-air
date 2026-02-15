import type Database from 'better-sqlite3';
import { createLogger } from './logger.js';

const log = createLogger('cost-tracker');

export interface LogCostParams {
  episodeId: string;
  operation: string;
  service: string;
  cost: number;
  inputTokens?: number;
  outputTokens?: number;
}

export function logCost(db: Database.Database, params: LogCostParams): void {
  const stmt = db.prepare(`
    INSERT INTO cost_log (episode_id, service, operation, input_tokens, output_tokens, cost)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    params.episodeId,
    params.service,
    params.operation,
    params.inputTokens ?? null,
    params.outputTokens ?? null,
    params.cost,
  );

  log.info(
    `Logged cost: $${params.cost.toFixed(4)} for ${params.operation} (${params.service})`,
  );
}

export function getEpisodeCost(db: Database.Database, episodeId: string): number {
  const result = db
    .prepare(
      'SELECT COALESCE(SUM(cost), 0) as total FROM cost_log WHERE episode_id = ?',
    )
    .get(episodeId) as { total: number };
  return result.total;
}
