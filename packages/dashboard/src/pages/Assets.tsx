import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { fetchEpisodes, fetchAssets } from '../api';
import AssetCard from '../components/AssetCard';

export default function Assets() {
  const { episodeId: paramId } = useParams<{ episodeId?: string }>();
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [episodeId, setEpisodeId] = useState(paramId || '');
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchEpisodes().then(setEpisodes).catch(() => {});
  }, []);

  useEffect(() => {
    if (episodeId) {
      fetchAssets(episodeId).then(setData).catch(() => setData(null));
    }
  }, [episodeId]);

  const allAssets = [
    ...(data?.dbAssets || []).map((a: any) => ({
      type: a.type, path: a.file_path, service: a.service, cost: a.cost,
    })),
    ...(data?.fsAssets || []).map((a: any) => ({
      type: a.type, path: a.path, size: a.size,
    })),
  ];

  const filtered = filter === 'all' ? allAssets : allAssets.filter(a => a.type === filter);
  const types = ['all', ...new Set(allAssets.map(a => a.type))];

  return (
    <div>
      <div className="page-header">
        <h2>Assets</h2>
        <p>Browse generated images, audio, and video assets</p>
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
                  {ep.id} — {ep.title || 'Untitled'}
                </option>
              ))}
            </select>
          </div>
          {data && (
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>FILTER</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {types.map(t => (
                  <button
                    key={t}
                    className={`btn ${filter === t ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() => setFilter(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {data && (
        <>
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            {filtered.length} assets{filter !== 'all' && ` (${filter})`}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
          }}>
            {filtered.map((asset, i) => (
              <AssetCard key={i} {...asset} />
            ))}
          </div>
          {filtered.length === 0 && (
            <p style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>
              No {filter} assets found for this episode.
            </p>
          )}
        </>
      )}

      {!episodeId && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Select an episode to browse assets
        </div>
      )}
    </div>
  );
}
