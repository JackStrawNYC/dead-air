import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchShowResearch, fetchShowAnalysis } from '../api';
import Skeleton from '../components/Skeleton';
import EnergyWaveform from '../components/EnergyWaveform';
import ResearchViewer from '../components/ResearchViewer';

type Tab = 'research' | 'waveform' | 'songs';

export default function ShowAnalysis() {
  const { id } = useParams<{ id: string }>();
  const [research, setResearch] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('research');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchShowResearch(id).catch(() => null),
      fetchShowAnalysis(id).catch(() => null),
    ]).then(([r, a]) => {
      setResearch(r);
      setAnalysis(a);
      if (!r && !a) setError('No research or analysis data found for this show.');
      setLoading(false);
    });
  }, [id]);

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'research', label: 'Research' },
    { key: 'waveform', label: 'Waveform' },
    { key: 'songs', label: 'Songs' },
  ];

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <Skeleton width={200} height={28} />
        </div>
        <div className="card"><Skeleton count={6} height={18} /></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to={`/shows/${id}`} style={{ color: 'var(--text-muted)', fontSize: 13 }}>&larr; Show</Link>
          <h2>Analysis</h2>
        </div>
        <p>Audio analysis and research for show {id}</p>
      </div>

      {error && (
        <div className="card mb-16" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
          {error}
        </div>
      )}

      {!error && (
        <>
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

          {tab === 'research' && research && (
            <div className="card">
              <ResearchViewer data={research} />
            </div>
          )}
          {tab === 'research' && !research && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              No research data available.
            </div>
          )}

          {tab === 'waveform' && analysis && (
            <div className="card">
              <div className="card-header"><h3>Energy Waveform</h3></div>
              <EnergyWaveform songs={analysis.songs || []} />
            </div>
          )}
          {tab === 'waveform' && !analysis && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              No analysis data available.
            </div>
          )}

          {tab === 'songs' && analysis?.songs && (
            <div className="card">
              <div className="card-header"><h3>Song Details</h3></div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Title</th>
                      <th>BPM</th>
                      <th>Key</th>
                      <th>Energy</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.songs.map((song: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{i + 1}</td>
                        <td>{song.title || song.trackId || `Track ${i + 1}`}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{song.bpm?.toFixed(0) || '\u2014'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{song.key || '\u2014'}</td>
                        <td>
                          {song.energy && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{
                                width: 60, height: 6, background: 'var(--bg-base)',
                                borderRadius: 3, overflow: 'hidden',
                              }}>
                                <div style={{
                                  width: `${Math.min(100, (song.avgEnergy || 0) * 100)}%`,
                                  height: '100%', background: 'var(--amber)', borderRadius: 3,
                                }} />
                              </div>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                                {(song.avgEnergy || 0).toFixed(2)}
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                          {song.duration ? `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration % 60)).padStart(2, '0')}` : '\u2014'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
