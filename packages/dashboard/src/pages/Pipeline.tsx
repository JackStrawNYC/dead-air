import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { runPipeline, fetchShows, fetchJobs, cancelJob as apiCancelJob } from '../api';
import { useJob } from '../hooks/useJob';
import StageButton from '../components/StageButton';
import LogStream from '../components/LogStream';
import SegmentGrid from '../components/SegmentGrid';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';

const STAGES = ['ingest', 'analyze', 'research', 'script', 'generate', 'render'];

function formatDuration(start: string, end?: string): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

export default function Pipeline() {
  const { date: paramDate } = useParams<{ date?: string }>();
  const [shows, setShows] = useState<any[]>([]);
  const [date, setDate] = useState(paramDate || '');
  const [customDate, setCustomDate] = useState('');
  const [fromStage, setFromStage] = useState('');
  const [toStage, setToStage] = useState('');
  const [force, setForce] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const { log, currentStage, result, connected, done } = useJob(jobId);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const toast = useToast();

  const effectiveDate = date === '__custom' ? customDate : date;

  useEffect(() => {
    fetchShows().then(setShows).catch(() => {});
    fetchJobs().then(setRecentJobs).catch(() => {});
  }, []);

  const completedStages = STAGES.filter(s => {
    if (!currentStage) return false;
    return STAGES.indexOf(s) < STAGES.indexOf(currentStage);
  });

  const handleRun = async () => {
    if (!effectiveDate) return;
    const opts: any = {};
    if (fromStage) opts.from = fromStage;
    if (toStage) opts.to = toStage;
    if (force) opts.force = true;
    const { jobId: id } = await runPipeline(effectiveDate, opts);
    setJobId(id);
  };

  const handleRetry = (job: any) => {
    if (job.showDate) setDate(job.showDate);
    if (job.currentStage) setFromStage(job.currentStage);
  };

  const handleCancel = async () => {
    if (jobId) {
      await apiCancelJob(jobId);
      toast('info', 'Job cancelled');
      setConfirmCancel(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Pipeline</h2>
        <p>Run the full production pipeline or individual stages</p>
      </div>

      {/* Controls */}
      <div className="card mb-16">
        <div className="card-header">
          <h3>Run Pipeline</h3>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>SHOW DATE</label>
            <select
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ width: 180, fontFamily: 'var(--font-mono)' }}
            >
              <option value="">Select show...</option>
              {shows.map(s => (
                <option key={s.id} value={s.date}>{s.date} — {s.venue?.substring(0, 20)}</option>
              ))}
              <option value="__custom">Custom date...</option>
            </select>
            {date === '__custom' && (
              <input
                type="text"
                placeholder="YYYY-MM-DD"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                style={{ width: 140, fontFamily: 'var(--font-mono)', marginLeft: 8 }}
              />
            )}
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>FROM</label>
            <select value={fromStage} onChange={e => setFromStage(e.target.value)} style={{ width: 120 }}>
              <option value="">Start</option>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>TO</label>
            <select value={toStage} onChange={e => setToStage(e.target.value)} style={{ width: 120 }}>
              <option value="">End</option>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 2 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />
              Force
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 2 }}>
            <button className="btn btn-primary" onClick={handleRun} disabled={!effectiveDate || (jobId != null && !done)}>
              Run
            </button>
            {jobId && !done && (
              <button className="btn btn-danger" onClick={() => setConfirmCancel(true)}>Cancel</button>
            )}
          </div>
        </div>
      </div>

      {/* Stage progress */}
      {jobId && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Stage Progress</h3>
            {connected ? (
              <span className="badge badge-running">Connected</span>
            ) : done ? (
              <span className={`badge ${result?.success ? 'badge-done' : 'badge-failed'}`}>
                {result?.success ? 'Done' : 'Failed'}
              </span>
            ) : (
              <span className="badge badge-queued">Disconnected</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {STAGES.map(stage => (
              <StageButton
                key={stage}
                stage={stage}
                current={currentStage}
                completed={completedStages}
                onClick={() => setFromStage(stage)}
              />
            ))}
          </div>
          {/* Inline render progress */}
          {currentStage === 'render' && !done && (
            <div style={{ marginTop: 12 }}>
              <SegmentGrid segments={[]} total={0} completed={0} />
            </div>
          )}
        </div>
      )}

      {/* Log output */}
      {jobId && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Output</h3>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              {log.length} lines
            </span>
          </div>
          <LogStream lines={log} maxHeight={500} />
        </div>
      )}

      {/* Recent jobs */}
      {recentJobs.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Recent Jobs</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Type</th>
                  <th>Episode</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Started</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map(j => (
                  <tr
                    key={j.id}
                    onClick={() => setJobId(j.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{j.id}</td>
                    <td>{j.type}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{j.episodeId || j.showDate || '\u2014'}</td>
                    <td>
                      <span className={`badge badge-${j.status === 'running' ? 'running' : j.status === 'done' ? 'done' : 'failed'}`}>
                        {j.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      {formatDuration(j.startedAt, j.finishedAt)}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(j.startedAt).toLocaleTimeString()}
                    </td>
                    <td>
                      {j.status === 'failed' && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '2px 8px', fontSize: 11 }}
                          onClick={e => { e.stopPropagation(); handleRetry(j); }}
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel Job"
        message="Are you sure you want to cancel this running job?"
        confirmLabel="Cancel Job"
        onConfirm={handleCancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
