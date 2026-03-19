import { useState, useEffect } from 'react';
import { fetchCostEstimate } from '../api';

interface CostEstimateProps {
  songs?: number;
  preset?: string;
}

export default function CostEstimate({ songs = 12, preset }: CostEstimateProps) {
  const [estimate, setEstimate] = useState<{
    totalEstimate: number;
    byService: Array<{ service: string; total: number }>;
    confidence: string;
    basedOnEpisodes: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      fetchCostEstimate({ songs, preset })
        .then(setEstimate)
        .catch(() => setEstimate(null))
        .finally(() => setLoading(false));
    }, 300); // debounce
    return () => clearTimeout(timer);
  }, [songs, preset]);

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
        Estimating costs...
      </div>
    );
  }

  if (!estimate) return null;

  const confidenceColor = estimate.confidence === 'high' ? 'var(--green)' :
    estimate.confidence === 'medium' ? 'var(--amber)' : 'var(--text-muted)';

  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Estimated Cost
        </span>
        <span style={{ fontSize: 11, color: confidenceColor }}>
          {estimate.confidence} confidence ({estimate.basedOnEpisodes} episodes)
        </span>
      </div>
      <div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--amber)' }}>
        ~${estimate.totalEstimate.toFixed(2)}
      </div>
      {estimate.byService.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {estimate.byService.map(s => (
            <span key={s.service} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {s.service}: ${s.total.toFixed(2)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
