import type {
  Show, Episode, Job, CostSummary, EpisodeCosts,
  AssetResponse, SegmentResponse, SongIdentity,
  PreflightResult, Batch, BatchMode,
} from './types';

const BASE = '/api';

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Shows
export const fetchShows = () => request<Show[]>('/shows');
export const fetchShow = (id: string) => request<Show>(`/shows/${encodeURIComponent(id)}`);
export const ingestShow = (date: string) =>
  request<{ jobId: string }>('/shows/ingest', { method: 'POST', body: JSON.stringify({ date }) });
export const fetchShowResearch = (id: string) => request<Record<string, unknown>>(`/shows/${encodeURIComponent(id)}/research`);
export const fetchShowAnalysis = (id: string) => request<Record<string, unknown>>(`/shows/${encodeURIComponent(id)}/analysis`);
export const fetchShowScript = (id: string) => request<Record<string, unknown>>(`/shows/${encodeURIComponent(id)}/script`);

// Episodes
export const fetchEpisodes = () => request<Episode[]>('/episodes');
export const fetchEpisode = (id: string) => request<{ episode: Episode; costs: unknown[]; assets: unknown[] }>(`/episodes/${encodeURIComponent(id)}`);

// Pipeline
export const runPipeline = (date: string, opts?: { from?: string; to?: string; force?: boolean }) =>
  request<{ jobId: string }>(`/pipeline/${date}/run`, { method: 'POST', body: JSON.stringify(opts || {}) });
export const fetchJobs = () => request<Job[]>('/pipeline/jobs');
export const cancelJob = (jobId: string) =>
  request<{ cancelled: boolean }>(`/pipeline/jobs/${jobId}/cancel`, { method: 'POST' });

// Render
export const fetchSegments = (episodeId: string) =>
  request<SegmentResponse>(`/render/${encodeURIComponent(episodeId)}/segments`);
export const getRenderOutputUrl = (episodeId: string) =>
  `${BASE}/render/${encodeURIComponent(episodeId)}/output`;

// Assets
export const fetchAssets = (episodeId: string) =>
  request<AssetResponse>(`/assets/${encodeURIComponent(episodeId)}`);

// Costs
export const fetchCosts = () => request<CostSummary>('/costs');
export const fetchEpisodeCosts = (episodeId: string) =>
  request<EpisodeCosts>(`/costs/${encodeURIComponent(episodeId)}`);

// Visualizer
export const fetchSetlist = () => request<Record<string, unknown>>('/visualizer/setlist');
export const saveSetlist = (data: Record<string, unknown>) =>
  request<{ ok: boolean }>('/visualizer/setlist', { method: 'PUT', body: JSON.stringify(data) });
export const fetchChapters = () => request<Record<string, unknown>>('/visualizer/chapters');
export const saveChapters = (data: Record<string, unknown>) =>
  request<{ ok: boolean }>('/visualizer/chapters', { method: 'PUT', body: JSON.stringify(data) });
export const fetchOverlaySchedule = () => request<Record<string, unknown>>('/visualizer/overlay-schedule');
export const saveOverlaySchedule = (data: Record<string, unknown>) =>
  request<{ ok: boolean }>('/visualizer/overlay-schedule', { method: 'PUT', body: JSON.stringify(data) });
export const startVisualizerRender = (opts?: {
  track?: string; resume?: boolean; preset?: string;
  preview?: boolean; gl?: string; concurrency?: number; seed?: number;
  noIntro?: boolean; noEndCard?: boolean; noChapters?: boolean;
  noSetBreaks?: boolean; setBreakSeconds?: number;
}) =>
  request<{ jobId: string }>('/visualizer/render', { method: 'POST', body: JSON.stringify(opts || {}) });

// Archive Discovery
export interface ArchiveRecording {
  identifier: string;
  title: string;
  date: string;
  source: string;
  description: string;
  format: string[];
  score: number;
  sourceType: 'SBD' | 'matrix' | 'AUD' | 'unknown';
  numReviews?: number;
  avgRating?: number;
}
export interface ArchiveFileInfo {
  name: string;
  format: string;
  size: string;
  length?: string;
  title?: string;
  source: string;
}
export interface SetlistPreview {
  songs: Array<{ songName: string; setNumber: number; position: number; isSegue: boolean; coverArtist?: string }>;
  venue: { name: string; city: string; state: string; country: string };
  tour?: string;
}

export const searchArchive = (opts: { date?: string; year?: number; query?: string }) => {
  const params = new URLSearchParams();
  if (opts.date) params.set('date', opts.date);
  if (opts.year) params.set('year', String(opts.year));
  if (opts.query) params.set('query', opts.query);
  return request<{ recordings: ArchiveRecording[]; count: number }>(`/archive/search?${params}`);
};
export const fetchCalendar = (year: number) =>
  request<{ dates: Record<string, number> }>(`/archive/calendar?year=${year}`);
export const fetchSetlistPreview = (date: string) =>
  request<SetlistPreview | null>(`/archive/setlist?date=${encodeURIComponent(date)}`);
export const fetchArchiveFiles = (identifier: string) =>
  request<{ files: ArchiveFileInfo[]; audioFiles: ArchiveFileInfo[]; totalSize: number }>(
    `/archive/${encodeURIComponent(identifier)}/files`,
  );
export const startFullPipeline = (date: string, identifier?: string) =>
  request<{ jobId: string }>('/archive/ingest-and-run', {
    method: 'POST',
    body: JSON.stringify({ date, ...(identifier && { identifier }) }),
  });

// Preflight
export const fetchPreflight = (date: string) =>
  request<PreflightResult>(`/preflight/${encodeURIComponent(date)}`);

// Asset Review
export const fetchAssetReview = (episodeId: string) =>
  request<{ segments: Array<{ index: number; assets: Array<{ type: string; filePath: string; service?: string; prompt?: string }> }> }>(
    `/asset-review/${encodeURIComponent(episodeId)}`,
  );
export const regenerateAsset = (episodeId: string, opts: { assetId?: string; segmentIndex?: number; type?: string }) =>
  request<{ jobId: string }>(`/asset-review/${encodeURIComponent(episodeId)}/regenerate`, {
    method: 'POST', body: JSON.stringify(opts),
  });
export const approveAssets = (episodeId: string) =>
  request<{ ok: boolean }>(`/asset-review/${encodeURIComponent(episodeId)}/approve`, {
    method: 'POST', body: JSON.stringify({ episodeId }),
  });

// Batch
export const createBatch = (opts: {
  dates: string[]; preset?: string; force?: boolean;
  mode?: BatchMode; seed?: number; concurrency?: number;
}) =>
  request<{ batchId: string }>('/batch', { method: 'POST', body: JSON.stringify(opts) });
export const fetchBatches = () => request<Batch[]>('/batch');
export const fetchBatch = (id: string) => request<Batch>(`/batch/${encodeURIComponent(id)}`);
export const retryBatch = (id: string) =>
  request<{ ok: boolean }>(`/batch/${encodeURIComponent(id)}/retry`, { method: 'POST' });
export const cancelBatch = (id: string) =>
  request<{ ok: boolean }>(`/batch/${encodeURIComponent(id)}/cancel`, { method: 'POST' });

// Re-render
export const rerenderEpisode = (id: string, opts?: { preset?: string; seed?: number; force?: boolean }) =>
  request<{ jobId: string }>(`/episodes/${encodeURIComponent(id)}/rerender`, {
    method: 'POST', body: JSON.stringify(opts || {}),
  });

// Scene Registry & Song Identities
export interface SceneMode {
  id: string;
  energyAffinity: 'low' | 'mid' | 'high' | 'any';
  complement: string;
}
export const fetchSceneRegistry = () => request<{ modes: SceneMode[] }>('/visualizer/scene-registry');
export const fetchRenderPresets = () => request<Record<string, {
  width: number; height: number; concurrency: number;
  skipGrain: boolean; skipBloom: boolean; label: string;
}>>('/visualizer/render-presets');
export const fetchSongIdentities = () => request<Record<string, SongIdentity>>('/visualizer/song-identities');
export const saveSongIdentities = (data: Record<string, SongIdentity>) =>
  request<{ ok: boolean }>('/visualizer/song-identities', { method: 'PUT', body: JSON.stringify(data) });
export const fetchOverlayNames = () => request<string[]>('/visualizer/overlay-names');

// Bridge
export const runBridge = (date: string, opts?: { dataDir?: string }) =>
  request<{ jobId: string }>(`/pipeline/${date}/bridge`, { method: 'POST', body: JSON.stringify(opts || {}) });
export const fetchBridgeOutput = (date: string) =>
  request<{ setlist: Record<string, unknown>; timeline: Record<string, unknown>; context: Record<string, unknown> }>(
    `/bridge/${date}/output`,
  );
export const overrideBridge = (date: string, overrides: Record<string, unknown>) =>
  request<{ ok: boolean }>(`/bridge/${date}/override`, { method: 'POST', body: JSON.stringify(overrides) });

// Preview
export const getPreviewUrl = (trackId: string) =>
  `${BASE}/render/preview/${encodeURIComponent(trackId)}`;

// Cost Estimate
export const fetchCostEstimate = (opts: { songs?: number; duration?: number; preset?: string }) => {
  const params = new URLSearchParams();
  if (opts.songs) params.set('songs', String(opts.songs));
  if (opts.duration) params.set('duration', String(opts.duration));
  if (opts.preset) params.set('preset', opts.preset);
  return request<{
    totalEstimate: number;
    fixedCost: number;
    perSongCost: number;
    byService: Array<{ service: string; total: number }>;
    confidence: string;
    basedOnEpisodes: number;
    songs: number;
  }>(`/costs/estimate?${params}`);
};

// Publish
export const getYoutubeAuthUrl = () => request<{ url: string }>('/publish/auth-url');
export const getYoutubeAuthStatus = () => request<{ authenticated: boolean }>('/publish/auth-status');
export const exchangeYoutubeCode = (code: string) =>
  request<{ ok: boolean }>('/publish/auth-callback', { method: 'POST', body: JSON.stringify({ code }) });
export const publishEpisode = (episodeId: string, opts: {
  title: string; description?: string; tags?: string[];
  privacyStatus?: string; scheduledAt?: string;
}) =>
  request<{ videoId: string; url: string }>(`/publish/${encodeURIComponent(episodeId)}`, {
    method: 'POST', body: JSON.stringify(opts),
  });

// Health
export interface HealthResponse {
  status: string;
  uptime: number;
  diskFree: number;
  renderDirSize: number;
  dataDirSize: number;
}
export const fetchHealth = () => request<HealthResponse>('/health');
