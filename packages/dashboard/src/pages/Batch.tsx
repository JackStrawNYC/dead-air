import { useState, useEffect } from 'react';
import { createBatch, fetchBatches, fetchBatch, retryBatch, cancelBatch } from '../api';
import type { Batch as BatchType, BatchMode } from '../types';
import { useToast } from '../hooks/useToast';
import { useSSE } from '../hooks/useSSE';
import { useNotifications } from '../hooks/useNotifications';
import { formatElapsed, relativeTime } from '../utils/format';
import PresetSelector from '../components/PresetSelector';

export default function Batch() {
  const toast = useToast();
  const { requestPermission, notify } = useNotifications();

  // Create form
  const [dateInput, setDateInput] = useState('');
  const [force, setForce] = useState(false);
  const [mode, setMode] = useState<BatchMode>('full');
  const [preset, setPreset] = useState('preview');
  const [seedInput, setSeedInput] = useState('');
  const [creating, setCreating] = useState(false);

  // Batch list
  const [batches, setBatches] = useState<BatchType[]>([]);
  const [loading, setLoading] = useState(true);

  // Active batch monitoring
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [activeBatch, setActiveBatch] = useState<BatchType | null>(null);

  // SSE for active batch
  const sseUrl = activeBatchId ? `/api/batch/${activeBatchId}/stream` : null;
  const { messages } = useSSE(sseUrl);

  // Load batches on mount
  useEffect(() => {
    loadBatches();
    requestPermission();
  }, []);

  // Update active batch from SSE
  useEffect(() => {
    const stateMessages = messages.filter(m => m.event === 'state' || m.event === 'done');
    if (stateMessages.length > 0) {
      const latest = stateMessages[stateMessages.length - 1];
      const batchData = latest.data as unknown as BatchType;
      setActiveBatch(batchData);
      // Notify on batch completion
      if (latest.event === 'done') {
        const doneCount = batchData.shows.filter(s => s.status === 'done').length;
        notify(
          'Batch Complete',
          `${doneCount}/${batchData.shows.length} shows completed`,
        );
      }
    }
  }, [messages]);

  const loadBatches = async () => {
    setLoading(true);
    try {
      const list = await fetchBatches();
      setBatches(list);
    } catch {
      toast('error', 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const dates = dateInput
      .split(/[\n,;]+/)
      .map(d => d.trim())
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

    if (dates.length === 0) {
      toast('error', 'Enter at least one valid date (YYYY-MM-DD)');
      return;
    }

    setCreating(true);
    try {
      const res = await createBatch({
        dates,
        force: force || undefined,
        mode,
        preset: mode !== 'full' ? preset : undefined,
        seed: seedInput ? parseInt(seedInput, 10) : undefined,
      });
      setActiveBatchId(res.batchId);
      toast('success', `Batch created with ${dates.length} shows (${mode})`);
      setDateInput('');
      loadBatches();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to create batch');
    } finally {
      setCreating(false);
    }
  };

  const handleRetry = async (batchId: string) => {
    try {
      await retryBatch(batchId);
      setActiveBatchId(batchId);
      toast('success', 'Retrying failed shows');
      loadBatches();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Retry failed');
    }
  };

  const handleCancel = async (batchId: string) => {
    try {
      await cancelBatch(batchId);
      toast('info', 'Batch cancelled');
      loadBatches();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Cancel failed');
    }
  };

  const handleViewBatch = async (batchId: string) => {
    setActiveBatchId(batchId);
    try {
      const batch = await fetchBatch(batchId);
      setActiveBatch(batch);
    } catch {
      toast('error', 'Failed to load batch');
    }
  };

  const statusColor = (status: string): string => {
    switch (status) {
      case 'done': return 'var(--green)';
      case 'running': return 'var(--blue)';
      case 'failed': return 'var(--red)';
      case 'pending': return 'var(--text-muted)';
      case 'cancelled': return 'var(--amber)';
      default: return 'var(--text-muted)';
    }
  };

  // Compute active batch progress
  const batchProgress = activeBatch ? {
    total: activeBatch.shows.length,
    done: activeBatch.shows.filter(s => s.status === 'done').length,
    failed: activeBatch.shows.filter(s => s.status === 'failed').length,
    running: activeBatch.shows.filter(s => s.status === 'running').length,
    pending: activeBatch.shows.filter(s => s.status === 'pending').length,
  } : null;

  const progressPct = batchProgress
    ? Math.round(((batchProgress.done + batchProgress.failed) / batchProgress.total) * 100)
    : 0;

  return (
    <div>
      <div className="page-header">
        <h2>Batch Production</h2>
        <p>Queue multiple shows for sequential processing</p>
      </div>

      {/* Create batch */}
      <div className="card mb-16">
        <div className="card-header">
          <h3>Create Batch</h3>
        </div>

        {/* Mode selector */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
            Batch Mode
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { value: 'full', label: 'Full Pipeline', desc: 'Ingest + Analyze + Produce + Render' },
              { value: 'render-only', label: 'Render Only', desc: 'Uses existing pipeline output' },
              { value: 'bridge-and-render', label: 'Bridge & Render', desc: 'Bridge + Render (skip pipeline)' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                className={`btn ${mode === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMode(opt.value)}
                style={{ textAlign: 'left', padding: '8px 12px' }}
              >
                <div style={{ fontWeight: 600, fontSize: 12 }}>{opt.label}</div>
                <div style={{ fontSize: 10, color: mode === opt.value ? 'inherit' : 'var(--text-muted)', opacity: 0.8 }}>
                  {opt.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>
            Dates (one per line, comma-separated, or semicolon-separated)
          </label>
          <textarea
            value={dateInput}
            onChange={e => setDateInput(e.target.value)}
            placeholder="1977-05-08&#10;1977-05-09&#10;1977-05-11"
            style={{
              width: '100%',
              minHeight: 100,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              background: 'var(--bg-base)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 8,
              resize: 'vertical',
            }}
          />
        </div>

        {/* Options for render modes */}
        {mode !== 'full' && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>PRESET</label>
              <PresetSelector value={preset} onChange={setPreset} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>SEED</label>
              <input
                type="number"
                placeholder="Optional"
                value={seedInput}
                onChange={e => setSeedInput(e.target.value)}
                style={{ width: 100, fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />
            Force re-run
          </label>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Batch'}
          </button>
        </div>
      </div>

      {/* Active batch monitor */}
      {activeBatch && batchProgress && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Batch {activeBatch.id}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {activeBatch.mode && activeBatch.mode !== 'full' && (
                <span className="badge badge-queued">{activeBatch.mode}</span>
              )}
              <span className={`badge badge-${activeBatch.status === 'running' ? 'running' : activeBatch.status === 'done' ? 'done' : 'failed'}`}>
                {activeBatch.status}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span>{batchProgress.done}/{batchProgress.total} complete</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{progressPct}%</span>
            </div>
            <div style={{ background: 'var(--bg-base)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{
                display: 'flex',
                height: '100%',
              }}>
                <div style={{
                  width: `${(batchProgress.done / batchProgress.total) * 100}%`,
                  background: 'var(--green)',
                  transition: 'width 0.3s',
                }} />
                <div style={{
                  width: `${(batchProgress.failed / batchProgress.total) * 100}%`,
                  background: 'var(--red)',
                  transition: 'width 0.3s',
                }} />
                <div style={{
                  width: `${(batchProgress.running / batchProgress.total) * 100}%`,
                  background: 'var(--blue)',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          </div>

          {/* Per-show rows */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Job</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {activeBatch.shows.map(show => (
                  <tr key={show.date}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{show.date}</td>
                    <td>
                      <span style={{
                        color: statusColor(show.status),
                        fontWeight: 600,
                        fontSize: 12,
                        textTransform: 'uppercase',
                      }}>
                        {show.status === 'running' && <span className="pulse-dot" style={{ marginRight: 4 }} />}
                        {show.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                      {show.jobId || '\u2014'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--red)' }}>{show.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Batch actions */}
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            {activeBatch.status === 'running' && (
              <button className="btn btn-danger" onClick={() => handleCancel(activeBatch.id)}>
                Cancel Batch
              </button>
            )}
            {(activeBatch.status === 'failed' || activeBatch.status === 'cancelled') &&
              activeBatch.shows.some(s => s.status === 'failed') && (
              <button className="btn btn-primary" onClick={() => handleRetry(activeBatch.id)}>
                Retry Failed
              </button>
            )}
          </div>
        </div>
      )}

      {/* Batch history */}
      <div className="card">
        <div className="card-header">
          <h3>Batch History</h3>
          <button className="btn btn-secondary" onClick={loadBatches} disabled={loading}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading...</div>
        ) : batches.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>
            No batches yet
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Mode</th>
                  <th>Shows</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Duration</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id} onClick={() => handleViewBatch(b.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{b.id}</td>
                    <td style={{ fontSize: 11 }}>
                      {b.mode && b.mode !== 'full' ? (
                        <span className="badge badge-queued">{b.mode}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>full</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {b.shows.filter(s => s.status === 'done').length}/{b.dates.length}
                    </td>
                    <td>
                      <span className={`badge badge-${b.status === 'running' ? 'running' : b.status === 'done' ? 'done' : 'failed'}`}>
                        {b.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {relativeTime(b.createdAt)}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      {formatElapsed(b.createdAt, b.finishedAt)}
                    </td>
                    <td>
                      {b.status === 'failed' && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '2px 8px', fontSize: 11 }}
                          onClick={e => { e.stopPropagation(); handleRetry(b.id); }}
                        >
                          Retry Failed
                        </button>
                      )}
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
