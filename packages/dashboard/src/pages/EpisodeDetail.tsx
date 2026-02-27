import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchEpisode, fetchEpisodeCosts, fetchAssets } from '../api';
import Skeleton from '../components/Skeleton';
import AssetCard from '../components/AssetCard';
import CostChart from '../components/CostChart';

type Tab = 'info' | 'assets' | 'costs';

export default function EpisodeDetail() {
  const { id } = useParams<{ id: string }>();
  const [episode, setEpisode] = useState<any>(null);
  const [costs, setCosts] = useState<any>(null);
  const [assets, setAssets] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('info');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetchEpisode(id).catch(() => null),
      fetchEpisodeCosts(id).catch(() => null),
      fetchAssets(id).catch(() => null),
    ]).then(([ep, c, a]) => {
      setEpisode(ep);
      setCosts(c);
      setAssets(a);
      setLoading(false);
    });
  }, [id]);

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'info', label: 'Info' },
    { key: 'assets', label: 'Assets' },
    { key: 'costs', label: 'Costs' },
  ];

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <Skeleton width={200} height={28} />
          <Skeleton width={300} height={14} />
        </div>
        <div className="card">
          <Skeleton count={5} height={20} />
        </div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Episode not found.
        <div className="mt-16">
          <Link to="/" className="btn btn-secondary">Back to Home</Link>
        </div>
      </div>
    );
  }

  const allAssets = [
    ...(assets?.dbAssets || []).map((a: any) => ({
      type: a.type, path: a.file_path, service: a.service, cost: a.cost,
    })),
    ...(assets?.fsAssets || []).map((a: any) => ({
      type: a.type, path: a.path, size: a.size,
    })),
  ];

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{ color: 'var(--text-muted)', fontSize: 13 }}>&larr; Home</Link>
          <h2>{episode.id} — {episode.title || episode.venue || 'Untitled'}</h2>
        </div>
        <p>
          {episode.status && (
            <span className={`badge badge-${episode.status === 'published' ? 'published' : episode.status === 'rendered' ? 'done' : 'queued'}`} style={{ marginRight: 8 }}>
              {episode.status}
            </span>
          )}
          {episode.show_date || ''}
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="card">
          <div className="grid-2">
            <div>
              <h4 style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Details</h4>
              <table>
                <tbody>
                  {[
                    ['Status', episode.status || 'draft'],
                    ['Progress', episode.progress != null ? `${episode.progress}%` : 'N/A'],
                    ['Duration', episode.duration_frames ? `${Math.round(episode.duration_frames / 30)}s (${episode.duration_frames} frames)` : 'N/A'],
                    ['Show Date', episode.show_date || 'N/A'],
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12, padding: '4px 12px 4px 0' }}>{label}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h4 style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Links</h4>
              {episode.youtube_url && (
                <a href={episode.youtube_url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                  YouTube
                </a>
              )}
              <div className="mt-16" style={{ display: 'flex', gap: 8 }}>
                <Link to={`/render/${episode.id}`} className="btn btn-secondary">Render Monitor</Link>
                <Link to={`/assets/${episode.id}`} className="btn btn-secondary">Full Assets</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'assets' && (
        <div>
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            {allAssets.length} assets
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
          }}>
            {allAssets.map((asset, i) => (
              <AssetCard key={i} {...asset} />
            ))}
          </div>
          {allAssets.length === 0 && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              No assets found for this episode.
            </div>
          )}
        </div>
      )}

      {tab === 'costs' && costs && (
        <div>
          <div className="grid-2 mb-16">
            <div className="card">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Episode Cost</div>
              <div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--amber)' }}>
                ${costs.totalCost?.toFixed(2) || '0.00'}
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>By Service</h3></div>
              <CostChart data={(costs.byService || []).map((s: any) => ({ label: s.service, value: s.total }))} />
            </div>
          </div>
          {costs.entries && costs.entries.length > 0 && (
            <div className="card">
              <div className="card-header"><h3>Cost Log</h3></div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Operation</th>
                      <th>Cost</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.entries.map((e: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{e.service}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{e.operation}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>${e.cost.toFixed(4)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(e.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
