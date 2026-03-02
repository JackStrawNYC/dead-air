import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CREATE_TABLES_SQL, SCHEMA_VERSION } from './schema.js';

// Use in-memory SQLite for tests (no filesystem needed)
function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(CREATE_TABLES_SQL);
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
  return db;
}

describe('schema', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it('creates all 5 tables', () => {
    db = createTestDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('shows');
    expect(names).toContain('episodes');
    expect(names).toContain('assets');
    expect(names).toContain('cost_log');
    expect(names).toContain('analytics');
  });

  it('creates all 5 indexes', () => {
    db = createTestDb();
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);
    expect(names).toContain('idx_episodes_show_id');
    expect(names).toContain('idx_episodes_status');
    expect(names).toContain('idx_assets_episode_id');
    expect(names).toContain('idx_cost_log_episode_id');
    expect(names).toContain('idx_analytics_episode_id');
  });

  it('sets schema version', () => {
    db = createTestDb();
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(SCHEMA_VERSION);
  });

  it('is idempotent (can run CREATE IF NOT EXISTS twice)', () => {
    db = createTestDb();
    expect(() => db.exec(CREATE_TABLES_SQL)).not.toThrow();
  });

  it('episodes default status is queued', () => {
    db = createTestDb();
    db.prepare("INSERT INTO shows (id, venue, city, state, date) VALUES (?, ?, ?, ?, ?)").run(
      'gd1977-05-08', 'Barton Hall', 'Ithaca', 'NY', '1977-05-08',
    );
    db.prepare("INSERT INTO episodes (id, show_id, title) VALUES (?, ?, ?)").run(
      'ep-001', 'gd1977-05-08', 'Cornell 77',
    );
    const row = db.prepare('SELECT status, progress FROM episodes WHERE id = ?').get('ep-001') as {
      status: string;
      progress: number;
    };
    expect(row.status).toBe('queued');
    expect(row.progress).toBe(0);
  });
});

describe('cost_log', () => {
  let db: Database.Database;

  function seedEpisode(db: Database.Database, episodeId = 'ep-001') {
    db.prepare("INSERT OR IGNORE INTO shows (id, venue, city, state, date) VALUES (?, ?, ?, ?, ?)").run(
      'gd1977-05-08', 'Barton Hall', 'Ithaca', 'NY', '1977-05-08',
    );
    db.prepare("INSERT OR IGNORE INTO episodes (id, show_id, title) VALUES (?, ?, ?)").run(
      episodeId, 'gd1977-05-08', 'Cornell 77',
    );
  }

  afterEach(() => {
    db?.close();
  });

  it('inserts and sums costs', () => {
    db = createTestDb();
    seedEpisode(db);

    const insert = db.prepare(
      'INSERT INTO cost_log (episode_id, service, operation, input_tokens, output_tokens, cost) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insert.run('ep-001', 'anthropic', 'script-gen', 5000, 3000, 0.12);
    insert.run('ep-001', 'replicate', 'image-gen', null, null, 0.05);
    insert.run('ep-001', 'elevenlabs', 'tts', null, null, 0.03);

    const total = db
      .prepare('SELECT COALESCE(SUM(cost), 0) as total FROM cost_log WHERE episode_id = ?')
      .get('ep-001') as { total: number };

    expect(total.total).toBeCloseTo(0.20, 5);
  });

  it('returns 0 for unknown episode', () => {
    db = createTestDb();
    const total = db
      .prepare('SELECT COALESCE(SUM(cost), 0) as total FROM cost_log WHERE episode_id = ?')
      .get('nonexistent') as { total: number };
    expect(total.total).toBe(0);
  });

  it('auto-increments id', () => {
    db = createTestDb();
    seedEpisode(db);

    const insert = db.prepare(
      'INSERT INTO cost_log (episode_id, service, operation, cost) VALUES (?, ?, ?, ?)',
    );
    insert.run('ep-001', 'anthropic', 'gen1', 0.01);
    insert.run('ep-001', 'anthropic', 'gen2', 0.02);

    const rows = db.prepare('SELECT id FROM cost_log ORDER BY id').all() as { id: number }[];
    expect(rows[0].id).toBe(1);
    expect(rows[1].id).toBe(2);
  });
});
