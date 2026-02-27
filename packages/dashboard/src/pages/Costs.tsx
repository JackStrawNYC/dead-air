import { useState, useEffect } from 'react';
import { fetchCosts, fetchEpisodeCosts, fetchEpisodes } from '../api';
import CostChart from '../components/CostChart';
import Skeleton from '../components/Skeleton';

export default function Costs() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState('');
  const [episodeCosts, setEpisodeCosts] = useState<any>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchCosts().catch(() => null),
      fetchEpisodes().catch(() => []),
    ]).then(([c, e]) => {
      setData(c);
      setEpisodes(e);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedEpisode) {
      setEpisodeCosts(null);
      return;
    }
    setDrillLoading(true);
    fetchEpisodeCosts(selectedEpisode)
      .then(setEpisodeCosts)
      .catch(() => setEpisodeCosts(null))
      .finally(() => setDrillLoading(false));
  }, [selectedEpisode]);

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h2>Costs</h2>
          <p>API spend breakdown across services and episodes</p>
        </div>
        <div className="grid-3 mb-16">
          <div className="card"><Skeleton height={48} /><Skeleton width={80} height={12} /></div>
          <div className="card"><Skeleton height={48} /><Skeleton width={80} height={12} /></div>
          <div className="card"><Skeleton height={48} /><Skeleton width={80} height={12} /></div>
        </div>
      </div>
    );
  }

  if (!data) return <p style={{ color: 'var(--text-muted)' }}>No cost data available.</p>;

  return (
    <div>
      <div className="page-header">
        <h2>Costs</h2>
        <p>API spend breakdown across services and episodes</p>
      </div>

      {/* Total */}
      <div className="grid-3 mb-16">
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Spend</div>
          <div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--amber)' }}>
            ${data.totalCost.toFixed(2)}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Services</div>
          <div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {data.byService.length}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Episodes</div>
          <div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {data.byEpisode.length}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid-2 mb-16">
        <div className="card">
          <div className="card-header"><h3>By Service</h3></div>
          <CostChart data={data.byService.map((s: any) => ({ label: s.service, value: s.total }))} />
        </div>
        <div className="card">
          <div className="card-header"><h3>By Episode</h3></div>
          <CostChart data={data.byEpisode.map((e: any) => ({ label: e.episode_id, value: e.total }))} />
        </div>
      </div>

      {/* Episode drill-down */}
      <div className="card mb-16">
        <div className="card-header">
          <h3>Episode Drill-Down</h3>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <select
            value={selectedEpisode}
            onChange={e => setSelectedEpisode(e.target.value)}
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
        {drillLoading && <Skeleton count={3} height={16} />}
        {episodeCosts && !drillLoading && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--amber)' }}>
                ${episodeCosts.totalCost?.toFixed(2)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>total for {episodeCosts.episodeId}</span>
            </div>
            <div className="grid-2">
              <div>
                <CostChart data={(episodeCosts.byService || []).map((s: any) => ({ label: s.service, value: s.total }))} height={150} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Service</th><th>Ops</th><th>Cost</th></tr>
                  </thead>
                  <tbody>
                    {(episodeCosts.byService || []).map((s: any) => (
                      <tr key={s.service}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.service}</td>
                        <td style={{ fontSize: 12 }}>{s.count}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)', fontSize: 12 }}>${s.total.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* By service table */}
      <div className="card mb-16">
        <div className="card-header"><h3>Service Breakdown</h3></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Operations</th>
                <th>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.byService.map((s: any) => (
                <tr key={s.service}>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{s.service}</td>
                  <td>{s.count}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>${s.total.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent entries */}
      <div className="card">
        <div className="card-header"><h3>Recent Operations</h3></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Episode</th>
                <th>Service</th>
                <th>Operation</th>
                <th>Cost</th>
                <th>Tokens In</th>
                <th>Tokens Out</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {data.recentEntries.map((e: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{e.episode_id}</td>
                  <td style={{ fontSize: 12 }}>{e.service}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{e.operation}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>${e.cost.toFixed(4)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                    {e.input_tokens || '\u2014'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                    {e.output_tokens || '\u2014'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
