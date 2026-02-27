import { getDb as coreGetDb } from '@dead-air/core';
import { loadConfig } from './config.js';

let _db: ReturnType<typeof coreGetDb> | null = null;

export function getDb() {
  if (_db) return _db;
  const config = loadConfig();
  _db = coreGetDb(config.paths.database);
  return _db;
}
