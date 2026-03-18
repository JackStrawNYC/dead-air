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
export const fetchShows = () => request<any[]>('/shows');
export const fetchShow = (id: string) => request<any>(`/shows/${encodeURIComponent(id)}`);
export const ingestShow = (date: string) =>
  request<{ jobId: string }>('/shows/ingest', { method: 'POST', body: JSON.stringify({ date }) });
export const fetchShowResearch = (id: string) => request<any>(`/shows/${encodeURIComponent(id)}/research`);
export const fetchShowAnalysis = (id: string) => request<any>(`/shows/${encodeURIComponent(id)}/analysis`);
export const fetchShowScript = (id: string) => request<any>(`/shows/${encodeURIComponent(id)}/script`);

// Episodes
export const fetchEpisodes = () => request<any[]>('/episodes');
export const fetchEpisode = (id: string) => request<any>(`/episodes/${encodeURIComponent(id)}`);

// Pipeline
export const runPipeline = (date: string, opts?: { from?: string; to?: string; force?: boolean }) =>
  request<{ jobId: string }>(`/pipeline/${date}/run`, { method: 'POST', body: JSON.stringify(opts || {}) });
export const fetchJobs = () => request<any[]>('/pipeline/jobs');
export const cancelJob = (jobId: string) =>
  request<{ cancelled: boolean }>(`/pipeline/jobs/${jobId}/cancel`, { method: 'POST' });

// Render
export const fetchSegments = (episodeId: string) =>
  request<any>(`/render/${encodeURIComponent(episodeId)}/segments`);
export const getRenderOutputUrl = (episodeId: string) =>
  `${BASE}/render/${encodeURIComponent(episodeId)}/output`;

// Assets
export const fetchAssets = (episodeId: string) =>
  request<any>(`/assets/${encodeURIComponent(episodeId)}`);

// Costs
export const fetchCosts = () => request<any>('/costs');
export const fetchEpisodeCosts = (episodeId: string) =>
  request<any>(`/costs/${encodeURIComponent(episodeId)}`);

// Visualizer
export const fetchSetlist = () => request<any>('/visualizer/setlist');
export const saveSetlist = (data: any) =>
  request<any>('/visualizer/setlist', { method: 'PUT', body: JSON.stringify(data) });
export const fetchChapters = () => request<any>('/visualizer/chapters');
export const saveChapters = (data: any) =>
  request<any>('/visualizer/chapters', { method: 'PUT', body: JSON.stringify(data) });
export const fetchOverlaySchedule = () => request<any>('/visualizer/overlay-schedule');
export const saveOverlaySchedule = (data: any) =>
  request<any>('/visualizer/overlay-schedule', { method: 'PUT', body: JSON.stringify(data) });
export const startVisualizerRender = (opts?: {
  track?: string; resume?: boolean; preset?: string;
  preview?: boolean; gl?: string; concurrency?: number; seed?: number;
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
export const fetchSongIdentities = () => request<Record<string, any>>('/visualizer/song-identities');
export const saveSongIdentities = (data: Record<string, any>) =>
  request<any>('/visualizer/song-identities', { method: 'PUT', body: JSON.stringify(data) });
export const fetchOverlayNames = () => request<string[]>('/visualizer/overlay-names');
