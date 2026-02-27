import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { fetchEpisodes, fetchSegments } from '../api';
import { useRenderProgress } from '../hooks/useRenderProgress';
import SegmentGrid from '../components/SegmentGrid';

export default function RenderMonitor() {
  const { episodeId: paramId } = useParams<{ episodeId?: string }>();
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [episodeId, setEpisodeId] = useState(paramId || '');
  const [segments, setSegments] = useState<any>(null);
  const [polling, setPolling] = useState(false);

  const { completed, total, connected, done } = useRenderProgress(polling ? episodeId : null);

  // Auto-stop polling when render is done
  useEffect(() => {
    if (done) setPolling(false);
  }, [done]);

  useEffect(() => {
    fetchEpisodes().then(setEpisodes).catch(() => {});
  }, []);

  const loadSegments = async () => {
    if (!episodeId) return;
    const data = await fetchSegments(episodeId);
    setSegments(data);
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
            <div className="card">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Segments</div>
              <div style={{ fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{segments.total}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Completed</div>
              <div style={{ fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>
                {segments.completed}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Raw MP4</div>
              <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: segments.hasRaw ? 'var(--green)' : 'var(--text-muted)' }}>
                {segments.hasRaw ? 'Ready' : 'Pending'}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Final MP4</div>
              <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: segments.hasFinal ? 'var(--green)' : 'var(--text-muted)' }}>
                {segments.hasFinal ? 'Ready' : 'Pending'}
              </div>
            </div>
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
