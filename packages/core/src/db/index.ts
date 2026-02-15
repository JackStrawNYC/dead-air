import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { CREATE_TABLES_SQL, SCHEMA_VERSION } from './schema.js';

let _db: Database.Database | null = null;

/**
 * Get or create a SQLite database connection.
 * Creates the data directory and runs schema on first call.
 */
export function getDb(dbPath: string): Database.Database {
  if (_db) return _db;

  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  _db = new Database(dbPath);

  // Performance pragmas
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('busy_timeout = 5000');

  // Run schema creation (idempotent with IF NOT EXISTS)
  _db.exec(CREATE_TABLES_SQL);

  // Store schema version
  const currentVersion = _db.pragma('user_version', { simple: true }) as number;
  if (currentVersion < SCHEMA_VERSION) {
    _db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }

  return _db;
}

/**
 * Close the database connection.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export { CREATE_TABLES_SQL, SCHEMA_VERSION } from './schema.js';
