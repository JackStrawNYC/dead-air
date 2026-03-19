import { useState, useEffect } from 'react';
import { fetchPreflight } from '../api';
import type { PreflightCheck, PreflightResult } from '../types';

interface PreflightChecksProps {
  date: string;
  fromStage?: string;
  toStage?: string;
  onResult?: (ready: boolean) => void;
}

export default function PreflightChecks({ date, fromStage, toStage, onResult }: PreflightChecksProps) {
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setResult(null);
      onResult?.(false);
      return;
    }

    setLoading(true);
    setError(null);
    fetchPreflight(date)
      .then(r => {
        setResult(r);
        onResult?.(r.ready);
      })
      .catch(e => {
        setError(e.message);
        onResult?.(false);
      })
      .finally(() => setLoading(false));
  }, [date]);

  if (!date) return null;
  if (loading) return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Running preflight checks...</div>;
  if (error) return <div style={{ fontSize: 12, color: 'var(--red)', padding: '8px 0' }}>Preflight error: {error}</div>;
  if (!result) return null;

  // Filter checks relevant to selected stage range
  const stages = ['ingest', 'analyze', 'research', 'script', 'generate', 'render'];
  const fromIdx = fromStage ? stages.indexOf(fromStage) : 0;
  const toIdx = toStage ? stages.indexOf(toStage) : stages.length - 1;
  const activeStages = stages.slice(Math.max(0, fromIdx), toIdx + 1);

  const relevantChecks = result.checks.filter(c => {
    // API key checks map to stages
    if (c.stage === 'research' || c.stage === 'script' || c.stage === 'generate') {
      return activeStages.includes(c.stage);
    }
    // Data checks are informational
    return true;
  });

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
        Pre-Flight Checks
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {relevantChecks.map(check => (
          <CheckRow key={check.stage} check={check} />
        ))}
      </div>
      {!result.ready && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--amber)' }}>
          Some checks failed — pipeline may fail at those stages
        </div>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: PreflightCheck }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      fontFamily: 'var(--font-mono)',
    }}>
      <span style={{ color: check.ok ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
        {check.ok ? '\u2713' : '\u2717'}
      </span>
      <span style={{ color: 'var(--text-secondary)', minWidth: 100 }}>{check.stage}</span>
      {check.message && (
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{check.message}</span>
      )}
    </div>
  );
}
