import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchShows, ingestShow } from '../api';
import { useJob } from '../hooks/useJob';
import LogStream from '../components/LogStream';
import Skeleton from '../components/Skeleton';
import { useToast } from '../hooks/useToast';

export default function Shows() {
  const [shows, setShows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const { log, done, result } = useJob(jobId);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    fetchShows().then(setShows).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Reload shows when ingest completes
  useEffect(() => {
    if (done && result?.success) load();
  }, [done, result]);

  // Toast on ingest completion
  useEffect(() => {
    if (done && result) {
      toast(result.success ? 'success' : 'error', result.success ? 'Ingest complete' : `Ingest failed: ${result.error || 'unknown error'}`);
    }
  }, [done, result]);

  const handleIngest = async () => {
    if (!date) return;
    try {
      const { jobId: id } = await ingestShow(date);
      setJobId(id);
    } catch (err: any) {
      toast('error', err.message || 'Failed to start ingest');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Shows</h2>
        <p>Ingested Grateful Dead concerts from archive.org</p>
      </div>

      {/* Ingest form */}
      <div className="card mb-16">
        <div className="card-header">
          <h3>Ingest New Show</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="1977-05-08"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ width: 160, fontFamily: 'var(--font-mono)' }}
            onKeyDown={e => e.key === 'Enter' && handleIngest()}
          />
          <button className="btn btn-primary" onClick={handleIngest} disabled={!date}>
            Ingest
          </button>
        </div>
        {jobId && (
          <div className="mt-16">
            <LogStream lines={log} maxHeight={200} />
            {done && (
              <div style={{ marginTop: 8, fontSize: 13, color: result?.success ? 'var(--green)' : 'var(--red)' }}>
                {result?.success ? 'Ingest complete' : `Failed: ${result?.error}`}
              </div>
            )}
          </div>
        )}
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
          <p style={{ color: 'var(--text-muted)' }}>No shows ingested yet. Use the form above to ingest a show.</p>
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
