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
export const startVisualizerRender = (opts?: { track?: string; resume?: boolean }) =>
  request<{ jobId: string }>('/visualizer/render', { method: 'POST', body: JSON.stringify(opts || {}) });
