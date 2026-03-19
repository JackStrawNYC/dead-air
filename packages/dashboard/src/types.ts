// ── Show ──

export interface SetlistSong {
  songName: string;
  title?: string;
  setNumber?: number;
  position?: number;
  isSegue?: boolean;
  coverArtist?: string;
}

export interface Show {
  id: string;
  venue: string;
  city: string;
  state: string;
  date: string;
  recording_source?: string;
  recording_quality_grade?: string;
  recording_id?: string;
  catalog_score?: number;
  setlist: SetlistSong[];
  metadata: Record<string, unknown>;
  weather?: Record<string, unknown> | null;
  created_at: string;
}

// ── Episode ──

export interface Episode {
  id: string;
  show_id: string;
  episode_type?: string;
  title?: string;
  venue?: string;
  city?: string;
  state?: string;
  show_date?: string;
  status?: string;
  current_stage?: string;
  progress?: number;
  youtube_url?: string;
  duration_seconds?: number;
  duration_frames?: number;
  total_cost?: number;
  script?: Record<string, unknown> | null;
  cost_breakdown?: Record<string, unknown> | null;
  created_at: string;
  published_at?: string;
}

// ── Job ──

export interface StageTiming {
  startedAt: string;
  finishedAt?: string;
}

export interface Job {
  id: string;
  type: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  episodeId?: string;
  showDate?: string;
  currentStage?: string;
  failedStage?: string;
  stageTimings?: Record<string, StageTiming>;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

// ── Preflight ──

export interface PreflightCheck {
  stage: string;
  ok: boolean;
  message?: string;
}

export interface PreflightResult {
  ready: boolean;
  checks: PreflightCheck[];
}

// ── Batch ──

export interface BatchShowStatus {
  date: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  jobId?: string;
  error?: string;
}

export type BatchMode = 'full' | 'render-only' | 'bridge-and-render';

export interface Batch {
  id: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  dates: string[];
  preset?: string;
  mode?: BatchMode;
  shows: BatchShowStatus[];
  createdAt: string;
  finishedAt?: string;
}

// ── Costs ──

export interface ServiceCost {
  service: string;
  count: number;
  total: number;
}

export interface EpisodeCostRow {
  episode_id: string;
  operations: number;
  total: number;
}

export interface CostEntry {
  episode_id: string;
  service: string;
  operation: string;
  cost: number;
  input_tokens?: number;
  output_tokens?: number;
  created_at: string;
}

export interface CostSummary {
  totalCost: number;
  byService: ServiceCost[];
  byEpisode: EpisodeCostRow[];
  byOperation: Array<{ operation: string; service: string; count: number; total: number }>;
  recentEntries: CostEntry[];
}

export interface EpisodeCosts {
  episodeId: string;
  totalCost: number;
  byService: ServiceCost[];
  entries: CostEntry[];
}

// ── Assets ──

export interface DbAsset {
  id: number;
  type: string;
  service: string;
  file_path: string;
  cost: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface FsAsset {
  path: string;
  type: string;
  size: number;
}

export interface AssetResponse {
  dbAssets: DbAsset[];
  fsAssets: FsAsset[];
}

// ── Segments ──

export interface SegmentInfo {
  index: number;
  file: string;
  size: number;
  done: boolean;
}

export interface SegmentResponse {
  segments: SegmentInfo[];
  total: number;
  completed: number;
  hasRaw: boolean;
  hasFinal: boolean;
}

// ── Song Identities ──

export interface SongPalette {
  primary: number;
  secondary: number;
  saturation: number;
}

export interface ClimaxBehavior {
  peakSaturation: number;
  peakBrightness: number;
  flash: boolean;
  climaxDensityMult: number;
}

export interface SongIdentity {
  palette?: SongPalette;
  preferredModes?: string[];
  overlayBoost?: string[];
  overlaySuppress?: string[];
  overlayDensity?: number;
  climaxBehavior?: ClimaxBehavior;
  transitionIn?: string;
  transitionOut?: string;
  hueShift?: number;
  saturationOffset?: number;
  drumsSpaceShaders?: Record<string, string>;
}

// ── Discover sub-component types ──

export interface ActiveJobEntry {
  jobId: string;
  date: string;
  identifier?: string;
}

export interface SearchHistoryEntry {
  date?: string;
  year?: number;
  query?: string;
  timestamp: number;
  resultCount: number;
}

export interface FileCache {
  audioFiles: import('./api').ArchiveFileInfo[];
  totalSize: number;
}
