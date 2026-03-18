import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchShows } from '../api';
import Skeleton from '../components/Skeleton';

export default function Shows() {
  const [shows, setShows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchShows().then(setShows).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="page-header">
        <h2>Shows</h2>
        <p>Ingested Grateful Dead concerts from archive.org</p>
      </div>

      {/* Discover link */}
      <div className="card mb-16">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Looking for a new show?
          </span>
          <Link to="/discover" className="btn btn-primary" style={{ fontSize: 13 }}>
            Browse Archive.org &rarr;
          </Link>
        </div>
      </div>

      {/* Shows list */}
      <div className="card">
        <div className="card-header">
          <h3>Ingested Shows ({shows.length})</h3>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>Refresh</button>
        </div>
        {loading && shows.length === 0 ? (
          <Skeleton count={5} height={20} />
        ) : shows.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No shows ingested yet. Browse Archive.org to discover and ingest a show.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Venue</th>
                  <th>Location</th>
                  <th>Source</th>
                  <th>Quality</th>
                  <th>Score</th>
                  <th>Songs</th>
                </tr>
              </thead>
              <tbody>
                {shows.map(show => (
                  <tr key={show.id}>
                    <td>
                      <Link to={`/shows/${show.id}`} style={{ fontFamily: 'var(--font-mono)' }}>
                        {show.date}
                      </Link>
                    </td>
                    <td>{show.venue}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{show.city}, {show.state}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{show.recording_source || '\u2014'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{show.recording_quality_grade || '\u2014'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>
                      {show.catalog_score?.toFixed(1) || '\u2014'}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {show.setlist?.length || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
