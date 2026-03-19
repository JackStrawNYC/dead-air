import { useState, useMemo } from 'react';
import type { StageTiming } from '../types';
import type { LogEntry } from '../hooks/useJob';
import { formatElapsed } from '../utils/format';

const STAGES = ['ingest', 'analyze', 'research', 'script', 'generate', 'bridge', 'render'];

const STAGE_LABELS: Record<string, string> = {
  ingest: 'Ingest',
  analyze: 'Analyze',
  research: 'Research',
  script: 'Script',
  generate: 'Generate',
  bridge: 'Bridge',
  render: 'Render',
};

type StageStatus = 'pending' | 'running' | 'done' | 'failed';

interface StageTrackerProps {
  currentStage: string | null;
  stageTimings: Record<string, StageTiming>;
  logEntries: LogEntry[];
  result: { success: boolean; error?: string } | null;
  done: boolean;
  connected: boolean;
}

export default function StageTracker({
  currentStage, stageTimings, logEntries, result, done, connected,
}: StageTrackerProps) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  const stageStatuses = useMemo(() => {
    const statuses: Record<string, StageStatus> = {};
    const currentIdx = currentStage ? STAGES.indexOf(currentStage) : -1;

    for (let i = 0; i < STAGES.length; i++) {
      const stage = STAGES[i];
      if (done && result) {
        if (i < currentIdx || (i === currentIdx && result.success)) {
          statuses[stage] = 'done';
        } else if (i === currentIdx && !result.success) {
          statuses[stage] = 'failed';
        } else {
          statuses[stage] = 'pending';
        }
      } else {
        if (i < currentIdx) {
          statuses[stage] = 'done';
        } else if (i === currentIdx) {
          statuses[stage] = 'running';
        } else {
          statuses[stage] = 'pending';
        }
      }
    }
    return statuses;
  }, [currentStage, done, result]);

  const stageLogEntries = useMemo(() => {
    if (!expandedStage) return [];
    return logEntries.filter(e => e.stage === expandedStage);
  }, [logEntries, expandedStage]);

  const getElapsed = (stage: string): string => {
    const timing = stageTimings[stage];
    if (!timing) return '';
    return formatElapsed(timing.startedAt, timing.finishedAt);
  };

  const statusColor = (status: StageStatus): string => {
    switch (status) {
      case 'done': return 'var(--green)';
      case 'running': return 'var(--blue)';
      case 'failed': return 'var(--red)';
      default: return 'var(--text-muted)';
    }
  };

  const statusBg = (status: StageStatus): string => {
    switch (status) {
      case 'done': return 'var(--green-dim)';
      case 'running': return 'var(--blue-dim)';
      case 'failed': return 'var(--red-dim, rgba(239, 68, 68, 0.1))';
      default: return 'var(--bg-elevated)';
    }
  };

  const statusIcon = (status: StageStatus): string => {
    switch (status) {
      case 'done': return '\u2713';
      case 'running': return '\u25CF';
      case 'failed': return '\u2717';
      default: return '\u25CB';
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="card-header" style={{ marginBottom: 12 }}>
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

      {/* Pipeline visualization */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {STAGES.map((stage, i) => {
          const status = stageStatuses[stage] || 'pending';
          const isExpanded = expandedStage === stage;
          const elapsed = getElapsed(stage);

          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => setExpandedStage(isExpanded ? null : stage)}
                style={{
                  background: statusBg(status),
                  color: statusColor(status),
                  border: `1px solid ${statusColor(status)}`,
                  borderRadius: 'var(--radius)',
                  padding: '8px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                  minWidth: 80,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  outline: isExpanded ? `2px solid ${statusColor(status)}` : 'none',
                  outlineOffset: 2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {status === 'running' && <span className="pulse-dot" />}
                  <span>{statusIcon(status)} {STAGE_LABELS[stage]}</span>
                </div>
                {elapsed && (
                  <span style={{ fontSize: 9, opacity: 0.8 }}>{elapsed}</span>
                )}
              </button>
              {i < STAGES.length - 1 && (
                <span style={{
                  color: stageStatuses[STAGES[i + 1]] !== 'pending' ? 'var(--green)' : 'var(--border)',
                  fontSize: 14,
                  padding: '0 2px',
                }}>
                  {'\u2192'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Error display */}
      {result && !result.success && result.error && (
        <div style={{
          marginTop: 12,
          padding: '8px 12px',
          background: 'var(--red-dim, rgba(239, 68, 68, 0.1))',
          border: '1px solid var(--red)',
          borderRadius: 'var(--radius)',
          color: 'var(--red)',
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
        }}>
          {result.error}
        </div>
      )}

      {/* Expanded stage log */}
      {expandedStage && (
        <div style={{
          marginTop: 12,
          background: 'var(--bg-base)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          maxHeight: 300,
          overflow: 'auto',
          padding: 12,
        }}>
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            {STAGE_LABELS[expandedStage]} — {stageLogEntries.length} lines
          </div>
          {stageLogEntries.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No log lines for this stage</div>
          ) : (
            <pre style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              lineHeight: 1.6,
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {stageLogEntries.map((e, i) => (
                <div key={i} style={{
                  color: e.line.toLowerCase().includes('error') || e.line.toLowerCase().includes('fail')
                    ? 'var(--red)'
                    : e.line.startsWith('$')
                      ? 'var(--amber)'
                      : 'var(--text-primary)',
                }}>
                  {e.line}
                </div>
              ))}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
