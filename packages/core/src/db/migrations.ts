import { resolve } from 'path';
import { loadConfig } from '../config/index.js';
import { getDb, closeDb, SCHEMA_VERSION } from './index.js';

function main() {
  const dbPathArg = process.argv.find(
    (_, i, arr) => arr[i - 1] === '--db-path',
  );

  let dbPath: string;
  try {
    const config = loadConfig();
    dbPath = dbPathArg ? resolve(dbPathArg) : config.paths.database;
  } catch {
    dbPath = dbPathArg ? resolve(dbPathArg) : resolve('./data/dead-air.db');
  }

  console.log(`[db:migrate] Initializing database at ${dbPath}`);
  const db = getDb(dbPath);
  const version = db.pragma('user_version', { simple: true });
  console.log(
    `[db:migrate] Schema version: ${version} (target: ${SCHEMA_VERSION})`,
  );

  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { name: string }[];
  console.log(`[db:migrate] Tables: ${tables.map((t) => t.name).join(', ')}`);

  closeDb();
  console.log('[db:migrate] Done.');
}

main();
