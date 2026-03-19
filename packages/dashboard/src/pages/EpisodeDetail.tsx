import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchEpisode, fetchEpisodeCosts, fetchAssets, fetchSegments, getRenderOutputUrl, rerenderEpisode, getYoutubeAuthUrl, getYoutubeAuthStatus, publishEpisode } from '../api';
import type { Episode, EpisodeCosts, AssetResponse, SegmentResponse } from '../types';
import Skeleton from '../components/Skeleton';
import AssetCard from '../components/AssetCard';
import CostChart from '../components/CostChart';
import PresetSelector from '../components/PresetSelector';
import { useToast } from '../hooks/useToast';

type Tab = 'info' | 'assets' | 'costs';

export default function EpisodeDetail() {
  const { id } = useParams<{ id: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [costs, setCosts] = useState<EpisodeCosts | null>(null);
  const [assets, setAssets] = useState<AssetResponse | null>(null);
  const [segments, setSegments] = useState<SegmentResponse | null>(null);
  const [tab, setTab] = useState<Tab>('info');
  const [loading, setLoading] = useState(true);
  const [showRerender, setShowRerender] = useState(false);
  const [rerenderPreset, setRerenderPreset] = useState('preview');
  const [rerendering, setRerendering] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [ytAuthenticated, setYtAuthenticated] = useState(false);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishDescription, setPublishDescription] = useState('');
  const [publishPrivacy, setPublishPrivacy] = useState<'unlisted' | 'public' | 'private'>('unlisted');
  const [publishing, setPublishing] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetchEpisode(id).catch((e) => { toast('error', 'Failed to load episode'); return null; }),
      fetchEpisodeCosts(id).catch((e) => { toast('error', 'Failed to load costs'); return null; }),
      fetchAssets(id).catch((e) => { toast('error', 'Failed to load assets'); return null; }),
      fetchSegments(id).catch(() => null),
      getYoutubeAuthStatus().catch(() => ({ authenticated: false })),
    ]).then(([epData, c, a, segs, authStatus]) => {
      const ep = epData ? (epData as { episode: Episode }).episode : null;
      setEpisode(ep);
      setCosts(c);
      setAssets(a);
      setSegments(segs);
      setYtAuthenticated(authStatus?.authenticated ?? false);
      if (ep) {
        setPublishTitle(ep.title || `Dead Air — ${ep.show_date || ep.id}`);
        setPublishDescription(`Grateful Dead ${ep.show_date || ''} — ${ep.venue || ''}, ${ep.city || ''}`);
      }
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
    ...(assets?.dbAssets || []).map((a) => ({
      type: a.type, path: a.file_path, service: a.service, cost: a.cost,
    })),
    ...(assets?.fsAssets || []).map((a) => ({
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
        <div>
          {/* Video player */}
          {segments && (segments.hasFinal || segments.hasRaw) && id && (
            <div className="card mb-16">
              <div className="card-header">
                <h3>Video Preview</h3>
                <a
                  href={getRenderOutputUrl(id)}
                  download
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '4px 12px' }}
                >
                  Download MP4
                </a>
              </div>
              <video
                controls
                style={{
                  width: '100%',
                  maxHeight: 400,
                  background: '#000',
                  borderRadius: 'var(--radius)',
                }}
                src={getRenderOutputUrl(id)}
              />
            </div>
          )}

          <div className="card mb-16">
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
                      ['Total Cost', episode.total_cost != null ? `$${episode.total_cost.toFixed(2)}` : 'N/A'],
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
                <div className="mt-16" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to={`/render/${episode.id}`} className="btn btn-secondary">Render Monitor</Link>
                  <Link to={`/assets/${episode.id}`} className="btn btn-secondary">Full Assets</Link>
                  <Link to={`/asset-review/${episode.id}`} className="btn btn-secondary">Asset Review</Link>
                  <button className="btn btn-primary" onClick={() => setShowRerender(!showRerender)}>
                    {showRerender ? 'Cancel' : 'Re-Render'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setShowPublish(!showPublish)}>
                    {showPublish ? 'Cancel' : 'Publish to YouTube'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Re-render modal */}
          {showRerender && id && (
            <div className="card mb-16">
              <div className="card-header">
                <h3>Re-Render Episode</h3>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
                  Render Preset
                </label>
                <PresetSelector value={rerenderPreset} onChange={setRerenderPreset} />
              </div>
              <button
                className="btn btn-primary"
                disabled={rerendering}
                onClick={async () => {
                  setRerendering(true);
                  try {
                    const res = await rerenderEpisode(id, { preset: rerenderPreset, force: true });
                    toast('success', `Re-render started (job ${res.jobId})`);
                    setShowRerender(false);
                  } catch (err) {
                    toast('error', err instanceof Error ? err.message : 'Re-render failed');
                  } finally {
                    setRerendering(false);
                  }
                }}
              >
                {rerendering ? 'Starting...' : 'Start Re-Render'}
              </button>
            </div>
          )}

          {/* Publish to YouTube */}
          {showPublish && id && (
            <div className="card mb-16">
              <div className="card-header">
                <h3>Publish to YouTube</h3>
              </div>

              {!ytAuthenticated ? (
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    YouTube account not connected. Connect to enable publishing.
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      try {
                        const { url } = await getYoutubeAuthUrl();
                        window.open(url, '_blank');
                      } catch (err) {
                        toast('error', err instanceof Error ? err.message : 'Failed to get auth URL. Set YOUTUBE_CREDENTIALS env var.');
                      }
                    }}
                  >
                    Connect YouTube
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>TITLE</label>
                    <input
                      type="text"
                      value={publishTitle}
                      onChange={e => setPublishTitle(e.target.value)}
                      maxLength={100}
                      style={{ width: '100%', fontSize: 13 }}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>DESCRIPTION</label>
                    <textarea
                      value={publishDescription}
                      onChange={e => setPublishDescription(e.target.value)}
                      style={{
                        width: '100%', minHeight: 60, fontSize: 12,
                        background: 'var(--bg-base)', color: 'var(--text-primary)',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                        padding: 8, resize: 'vertical',
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>PRIVACY</label>
                    <select
                      value={publishPrivacy}
                      onChange={e => setPublishPrivacy(e.target.value as 'public' | 'unlisted' | 'private')}
                      style={{ width: 140 }}
                    >
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={publishing || !publishTitle}
                    onClick={async () => {
                      setPublishing(true);
                      try {
                        const result = await publishEpisode(id, {
                          title: publishTitle,
                          description: publishDescription,
                          privacyStatus: publishPrivacy,
                        });
                        toast('success', `Published! ${result.url}`);
                        setShowPublish(false);
                        // Refresh episode data to show youtube_url
                        const epData = await fetchEpisode(id);
                        setEpisode((epData as { episode: Episode }).episode);
                      } catch (err) {
                        toast('error', err instanceof Error ? err.message : 'Publish failed');
                      } finally {
                        setPublishing(false);
                      }
                    }}
                  >
                    {publishing ? 'Uploading...' : 'Upload to YouTube'}
                  </button>
                </div>
              )}
            </div>
          )}
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
              <CostChart data={(costs.byService || []).map((s) => ({ label: s.service, value: s.total }))} />
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
                    {costs.entries.map((e, i) => (
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
