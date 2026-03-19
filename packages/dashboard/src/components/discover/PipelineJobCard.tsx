import { useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { cancelJob } from '../../api';
import type { ActiveJobEntry } from '../../types';
import { useJob } from '../../hooks/useJob';
import StageButton from '../StageButton';
import LogStream from '../LogStream';

const PIPELINE_STAGES = ['ingest', 'analyze', 'research', 'script', 'generate', 'render'];

interface PipelineJobCardProps {
  entry: ActiveJobEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onDone: (success: boolean) => void;
}

export default function PipelineJobCard({ entry, isExpanded, onToggle, onDone }: PipelineJobCardProps) {
  const { log, currentStage, done, result } = useJob(entry.jobId);

  const completedStages = useMemo(() => {
    if (done && result?.success) return PIPELINE_STAGES;
    if (!currentStage) return [];
    const idx = PIPELINE_STAGES.indexOf(currentStage);
    return idx > 0 ? PIPELINE_STAGES.slice(0, idx) : [];
  }, [currentStage, done, result]);

  const isRunning = !done;

  useEffect(() => {
    if (done) onDone(result?.success ?? false);
  }, [done, result, onDone]);

  const handleCancel = async () => {
    try {
      await cancelJob(entry.jobId);
    } catch { /* handled by useJob */ }
  };

  return (
    <div style={{
      padding: 12, border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', background: 'var(--bg-elevated)',
    }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={onToggle}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>
            {entry.date}
          </span>
          {entry.identifier && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {entry.identifier}
            </span>
          )}
          {isRunning && (
            <span style={{
              fontSize: 10, padding: '1px 5px', borderRadius: 3,
              background: 'var(--blue-dim, rgba(59,130,246,0.1))', color: 'var(--blue)',
              fontFamily: 'var(--font-mono)',
            }}>
              RUNNING
            </span>
          )}
          {done && result?.success && (
            <span style={{
              fontSize: 10, padding: '1px 5px', borderRadius: 3,
              background: 'var(--green-dim)', color: 'var(--green)',
              fontFamily: 'var(--font-mono)',
            }}>
              DONE
            </span>
          )}
          {done && !result?.success && (
            <span style={{
              fontSize: 10, padding: '1px 5px', borderRadius: 3,
              background: 'var(--red-dim, rgba(239,68,68,0.1))', color: 'var(--red)',
              fontFamily: 'var(--font-mono)',
            }}>
              FAILED
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isRunning && (
            <button
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)' }}
              onClick={(e) => { e.stopPropagation(); handleCancel(); }}
            >
              Cancel
            </button>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {isExpanded ? '\u25B2' : '\u25BC'}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {PIPELINE_STAGES.map((stage) => (
              <StageButton
                key={stage}
                stage={stage}
                current={currentStage}
                completed={completedStages}
                disabled
                onClick={() => {}}
              />
            ))}
          </div>
          <LogStream lines={log} maxHeight={200} />
          {done && (
            <div style={{
              marginTop: 8, fontSize: 12,
              color: result?.success ? 'var(--green)' : 'var(--red)',
            }}>
              {result?.success ? (
                <>
                  Pipeline complete!{' '}
                  <Link to={`/shows/${entry.date}`} style={{ color: 'var(--blue)' }}>
                    View Show &rarr;
                  </Link>
                </>
              ) : (
                `Failed: ${result?.error || 'unknown error'}`
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
