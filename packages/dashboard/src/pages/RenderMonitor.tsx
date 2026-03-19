import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { fetchEpisodes, fetchSegments } from '../api';
import type { Episode, SegmentResponse } from '../types';
import { useRenderProgress } from '../hooks/useRenderProgress';
import StatCard from '../components/StatCard';
import SegmentGrid from '../components/SegmentGrid';
import { useToast } from '../hooks/useToast';

export default function RenderMonitor() {
  const { episodeId: paramId } = useParams<{ episodeId?: string }>();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [episodeId, setEpisodeId] = useState(paramId || '');
  const [segments, setSegments] = useState<SegmentResponse | null>(null);
  const [polling, setPolling] = useState(false);
  const toast = useToast();

  const { completed, total, connected, done } = useRenderProgress(polling ? episodeId : null);

  // Auto-stop polling when render is done
  useEffect(() => {
    if (done) setPolling(false);
  }, [done]);

  useEffect(() => {
    fetchEpisodes().then(setEpisodes).catch((e) => { toast('error', 'Failed to load episodes'); });
  }, []);

  const loadSegments = async () => {
    if (!episodeId) return;
    try {
      const data = await fetchSegments(episodeId);
      setSegments(data);
    } catch (e) {
      toast('error', 'Failed to load segments');
    }
  };

  useEffect(() => {
    if (episodeId) loadSegments();
  }, [episodeId]);

  // Refresh segments when progress updates
  useEffect(() => {
    if (completed > 0) loadSegments();
  }, [completed]);

  return (
    <div>
      <div className="page-header">
        <h2>Render Monitor</h2>
        <p>Track segment-by-segment render progress</p>
      </div>

      <div className="card mb-16">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>EPISODE</label>
            <select
              value={episodeId}
              onChange={e => setEpisodeId(e.target.value)}
              style={{ width: 260, fontFamily: 'var(--font-mono)' }}
            >
              <option value="">Select episode...</option>
              {episodes.map(ep => (
                <option key={ep.id} value={ep.id}>
                  {ep.id} — {ep.title || ep.venue || 'Untitled'}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 2 }}>
            <button className="btn btn-secondary" onClick={loadSegments} disabled={!episodeId}>
              Refresh
            </button>
            <button
              className={`btn ${polling ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => setPolling(!polling)}
              disabled={!episodeId}
            >
              {polling ? 'Stop Live' : 'Go Live'}
            </button>
          </div>
        </div>
      </div>

      {segments && (
        <>
          {/* Summary stats */}
          <div className="grid-4 mb-16">
            <StatCard label="Segments" value={segments.total} fontSize={28} />
            <StatCard label="Completed" value={segments.completed} color="var(--green)" fontSize={28} />
            <StatCard label="Raw MP4" value={segments.hasRaw ? 'Ready' : 'Pending'} color={segments.hasRaw ? 'var(--green)' : 'var(--text-muted)'} fontSize={20} />
            <StatCard label="Final MP4" value={segments.hasFinal ? 'Ready' : 'Pending'} color={segments.hasFinal ? 'var(--green)' : 'var(--text-muted)'} fontSize={20} />
          </div>

          {/* Segment grid */}
          <div className="card">
            <div className="card-header">
              <h3>Segment Grid</h3>
              {polling && connected && (
                <span className="badge badge-running">Live</span>
              )}
            </div>
            <SegmentGrid
              segments={segments.segments}
              total={segments.total}
              completed={segments.completed}
            />
          </div>
        </>
      )}
    </div>
  );
}
