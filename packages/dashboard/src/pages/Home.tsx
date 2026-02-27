import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchShows, fetchEpisodes, fetchJobs, fetchCosts } from '../api';
import Skeleton from '../components/Skeleton';

function relativeTime(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Home() {
  const [shows, setShows] = useState<any[] | null>(null);
  const [episodes, setEpisodes] = useState<any[] | null>(null);
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [costs, setCosts] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchShows().catch(() => []),
      fetchEpisodes().catch(() => []),
      fetchJobs().catch(() => []),
      fetchCosts().catch(() => null),
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
            <div className="card">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Shows</div>
              <div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{shows?.length || 0}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Episodes</div>
              <div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{episodes?.length || 0}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Spend</div>
              <div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--amber)' }}>
                ${costs?.totalCost?.toFixed(2) || '0.00'}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Jobs</div>
              <div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 700, color: activeJobs > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                {activeJobs}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quick actions */}
      <div className="card mb-16">
        <div className="card-header">
          <h3>Quick Actions</h3>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/shows" className="btn btn-secondary">Shows</Link>
          <Link to="/pipeline" className="btn btn-primary">Pipeline</Link>
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

      {/* Episode cards */}
      {episodes && episodes.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Episodes</h3>
          </div>
          <div className="grid-3">
            {episodes.map(ep => (
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
                  <span className={`badge badge-${ep.status === 'published' ? 'published' : ep.status === 'rendered' ? 'done' : 'queued'}`}>
                    {ep.status || 'draft'}
                  </span>
                </div>
                <div style={{ fontSize: 13, marginBottom: 8 }} className="truncate">
                  {ep.title || ep.venue || 'Untitled'}
                </div>
                {ep.progress != null && (
                  <div style={{ background: 'var(--bg-base)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, ep.progress)}%`, height: '100%',
                      background: 'var(--amber)', borderRadius: 3,
                    }} />
                  </div>
                )}
                {ep.youtube_url && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
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
