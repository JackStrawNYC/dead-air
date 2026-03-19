import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchShows, fetchEpisodes, fetchJobs, fetchCosts } from '../api';
import type { Show, Episode, Job, CostSummary } from '../types';
import { relativeTime } from '../utils/format';
import StatCard from '../components/StatCard';
import Skeleton from '../components/Skeleton';
import { useToast } from '../hooks/useToast';

type EpisodeFilter = 'all' | 'rendered' | 'published' | 'failed';

export default function Home() {
  const [shows, setShows] = useState<Show[] | null>(null);
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [costs, setCosts] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [episodeFilter, setEpisodeFilter] = useState<EpisodeFilter>('all');
  const toast = useToast();

  const filteredEpisodes = useMemo(() => {
    if (!episodes) return [];
    if (episodeFilter === 'all') return episodes;
    return episodes.filter(ep => {
      if (episodeFilter === 'rendered') return ep.status === 'rendered' || ep.status === 'published';
      if (episodeFilter === 'published') return ep.status === 'published';
      if (episodeFilter === 'failed') return ep.status === 'failed';
      return true;
    });
  }, [episodes, episodeFilter]);

  useEffect(() => {
    Promise.all([
      fetchShows().catch((e) => { toast('error', 'Failed to load shows'); return [] as Show[]; }),
      fetchEpisodes().catch((e) => { toast('error', 'Failed to load episodes'); return [] as Episode[]; }),
      fetchJobs().catch((e) => { toast('error', 'Failed to load jobs'); return [] as Job[]; }),
      fetchCosts().catch((e) => { toast('error', 'Failed to load costs'); return null; }),
    ]).then(([s, e, j, c]) => {
      setShows(s);
      setEpisodes(e);
      setJobs(j);
      setCosts(c);
      setLoading(false);
    });
  }, []);

  const activeJobs = jobs?.filter(j => j.status === 'running').length || 0;

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Dead Air production pipeline overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid-4 mb-16">
        {loading ? (
          <>
            <div className="card"><Skeleton height={48} /><Skeleton width={80} height={12} /></div>
            <div className="card"><Skeleton height={48} /><Skeleton width={80} height={12} /></div>
            <div className="card"><Skeleton height={48} /><Skeleton width={80} height={12} /></div>
            <div className="card"><Skeleton height={48} /><Skeleton width={80} height={12} /></div>
          </>
        ) : (
          <>
            <StatCard label="Shows" value={shows?.length || 0} />
            <StatCard label="Episodes" value={episodes?.length || 0} />
            <StatCard label="Total Spend" value={`$${costs?.totalCost?.toFixed(2) || '0.00'}`} color="var(--amber)" />
            <StatCard label="Active Jobs" value={activeJobs} color={activeJobs > 0 ? 'var(--green)' : 'var(--text-muted)'} />
          </>
        )}
      </div>

      {/* Quick actions */}
      <div className="card mb-16">
        <div className="card-header">
          <h3>Quick Actions</h3>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/produce" className="btn btn-primary">Produce</Link>
          <Link to="/shows" className="btn btn-secondary">Shows</Link>
          <Link to="/pipeline" className="btn btn-secondary">Pipeline</Link>
          <Link to="/render" className="btn btn-secondary">Renders</Link>
        </div>
      </div>

      {/* Recent activity */}
      {jobs && jobs.length > 0 && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Recent Activity</h3>
            <Link to="/pipeline" style={{ fontSize: 12 }}>View all</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {jobs.slice(0, 5).map(j => (
                  <tr key={j.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {j.episodeId || j.showDate || j.id}
                    </td>
                    <td>{j.type}</td>
                    <td>
                      <span className={`badge badge-${j.status === 'running' ? 'running' : j.status === 'done' ? 'done' : 'failed'}`}>
                        {j.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {relativeTime(j.startedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Episode cards with filter */}
      {episodes && episodes.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Episodes ({filteredEpisodes.length})</h3>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', 'rendered', 'published', 'failed'] as const).map(f => (
                <button
                  key={f}
                  className={`btn ${episodeFilter === f ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => setEpisodeFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="grid-3">
            {filteredEpisodes.map(ep => (
              <Link
                key={ep.id}
                to={`/episodes/${ep.id}`}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: 16, textDecoration: 'none', color: 'inherit',
                  display: 'block',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14 }}>{ep.id}</span>
                  <span className={`badge badge-${ep.status === 'published' ? 'published' : ep.status === 'rendered' ? 'done' : ep.status === 'failed' ? 'failed' : 'queued'}`}>
                    {ep.status || 'draft'}
                  </span>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }} className="truncate">
                  {ep.title || ep.venue || 'Untitled'}
                </div>
                {ep.show_date && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                    {ep.show_date}
                  </div>
                )}
                {ep.duration_seconds != null && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {Math.round(ep.duration_seconds / 60)}m
                    {ep.total_cost != null && <span> · ${ep.total_cost.toFixed(2)}</span>}
                  </div>
                )}
                {ep.progress != null && (
                  <div style={{ marginTop: 6, background: 'var(--bg-base)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, ep.progress)}%`, height: '100%',
                      background: 'var(--amber)', borderRadius: 3,
                    }} />
                  </div>
                )}
                {ep.youtube_url && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--green)' }}>
                    YouTube published
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
