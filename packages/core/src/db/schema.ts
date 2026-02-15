export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `
-- Shows: Grateful Dead concert metadata from archive.org
CREATE TABLE IF NOT EXISTS shows (
  id TEXT PRIMARY KEY,
  venue TEXT,
  city TEXT,
  state TEXT,
  date DATE,
  lineup TEXT,
  setlist TEXT,
  recording_id TEXT,
  recording_source TEXT,
  recording_quality_grade TEXT,
  weather TEXT,
  metadata TEXT,
  catalog_score REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Episodes: Generated documentary episodes
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  show_id TEXT REFERENCES shows(id),
  episode_type TEXT,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  current_stage TEXT,
  progress REAL DEFAULT 0,
  script TEXT,
  youtube_id TEXT,
  youtube_url TEXT,
  duration_seconds INTEGER,
  render_path TEXT,
  cost_breakdown TEXT,
  total_cost REAL DEFAULT 0,
  error_log TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME
);

-- Assets: All generated files (images, narration, thumbnails)
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  episode_id TEXT REFERENCES episodes(id),
  type TEXT,
  service TEXT,
  prompt_hash TEXT,
  file_path TEXT,
  cost REAL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cost log: Track API costs per operation
CREATE TABLE IF NOT EXISTS cost_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id TEXT REFERENCES episodes(id),
  service TEXT,
  operation TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Analytics: YouTube performance snapshots
CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id TEXT REFERENCES episodes(id),
  date DATE,
  views INTEGER,
  watch_hours REAL,
  avg_view_duration REAL,
  avg_view_percentage REAL,
  ctr REAL,
  subscribers_gained INTEGER,
  revenue REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_episodes_show_id ON episodes(show_id);
CREATE INDEX IF NOT EXISTS idx_episodes_status ON episodes(status);
CREATE INDEX IF NOT EXISTS idx_assets_episode_id ON assets(episode_id);
CREATE INDEX IF NOT EXISTS idx_cost_log_episode_id ON cost_log(episode_id);
CREATE INDEX IF NOT EXISTS idx_analytics_episode_id ON analytics(episode_id);
`;
