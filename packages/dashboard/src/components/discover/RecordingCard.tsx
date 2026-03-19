import { formatBytes, formatSecondsToTime } from '../../utils/format';
import type { ArchiveRecording } from '../../api';
import type { FileCache } from '../../types';
import Skeleton from '../Skeleton';
import SetlistPanel from './SetlistPanel';

const SOURCE_BADGE: Record<string, { bg: string; color: string }> = {
  SBD: { bg: 'var(--green-dim)', color: 'var(--green)' },
  matrix: { bg: 'var(--amber-dim, rgba(251,191,36,0.1))', color: 'var(--amber)' },
  AUD: { bg: 'var(--red-dim, rgba(239,68,68,0.1))', color: 'var(--red)' },
  unknown: { bg: 'var(--bg-elevated)', color: 'var(--text-muted)' },
};

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return '\u2605'.repeat(full) + (half ? '\u00BD' : '') + '\u2606'.repeat(5 - full - (half ? 1 : 0));
}

interface RecordingCardProps {
  recording: ArchiveRecording;
  isTop: boolean;
  isExpanded: boolean;
  cached?: FileCache;
  filesLoading: boolean;
  isAnyRunning: boolean;
  fallbackDate: string;
  onPreviewFiles: (identifier: string) => void;
  onIngestOnly: (date: string) => void;
  onIngestAndRun: (date: string, identifier?: string) => void;
}

export default function RecordingCard({
  recording: rec, isTop, isExpanded, cached, filesLoading,
  isAnyRunning, fallbackDate, onPreviewFiles, onIngestOnly, onIngestAndRun,
}: RecordingCardProps) {
  const badge = SOURCE_BADGE[rec.sourceType] || SOURCE_BADGE.unknown;
  const recDate = rec.date?.substring(0, 10) || fallbackDate;

  return (
    <div>
      <div
        style={{
          padding: 12,
          borderRadius: 'var(--radius)',
          border: `1px solid ${isTop ? 'var(--green)' : 'var(--border)'}`,
          background: isTop ? 'var(--green-dim)' : 'var(--bg-elevated)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              {isTop && (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--green)',
                  background: 'var(--green-dim)', padding: '1px 5px', borderRadius: 3,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.5px',
                }}>
                  BEST
                </span>
              )}
              <a
                href={`https://archive.org/details/${rec.identifier}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: 'var(--blue)', textDecoration: 'none',
                }}
                title="View on archive.org"
              >
                {rec.identifier}
              </a>
              <span style={{
                display: 'inline-block', padding: '1px 6px', fontSize: 10,
                fontWeight: 700, fontFamily: 'var(--font-mono)', borderRadius: 3,
                background: badge.bg, color: badge.color,
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                {rec.sourceType}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 13,
                color: 'var(--amber)', fontWeight: 600,
              }}>
                Score: {rec.score}
              </span>
              {rec.numReviews != null && rec.numReviews > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {rec.numReviews} review{rec.numReviews !== 1 ? 's' : ''}
                </span>
              )}
              {rec.avgRating != null && rec.avgRating > 0 && (
                <span style={{
                  fontSize: 11, color: 'var(--amber)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {renderStars(rec.avgRating)} {rec.avgRating.toFixed(1)}
                </span>
              )}
            </div>
            <div style={{
              fontSize: 12, color: 'var(--text-secondary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {rec.title}
            </div>
            {rec.description && (
              <div style={{
                fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: 600,
              }}>
                {rec.description.slice(0, 150)}
                {rec.description.length > 150 ? '...' : ''}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 12 }}>
              <span>Formats: {rec.format.join(', ') || 'unknown'}</span>
              <a
                href={`https://archive.org/details/${rec.identifier}#reviews`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 11 }}
              >
                Reviews
              </a>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => onPreviewFiles(rec.identifier)}
            >
              {isExpanded ? 'Hide Files' : 'Preview Files'}
            </button>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => onIngestOnly(recDate)}
              disabled={isAnyRunning}
            >
              Ingest Only
            </button>
            <button
              className={isTop ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => onIngestAndRun(recDate, rec.identifier)}
              disabled={isAnyRunning}
            >
              Ingest & Run Pipeline
            </button>
          </div>
        </div>
      </div>

      {/* Expanded file preview */}
      {isExpanded && (
        <div style={{
          marginTop: 4, padding: 12, background: 'var(--bg-base)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}>
          {filesLoading && !cached ? (
            <Skeleton count={6} height={16} />
          ) : !cached || cached.audioFiles.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No audio files found</div>
          ) : (
            <>
              <div className="table-wrap">
                <table style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>#</th>
                      <th style={{ textAlign: 'left' }}>File</th>
                      <th style={{ textAlign: 'right' }}>Size</th>
                      <th style={{ textAlign: 'right' }}>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cached.audioFiles.map((f, idx) => (
                      <tr key={f.name}>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {idx + 1}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{f.title || f.name}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          {formatBytes(parseInt(f.size, 10) || 0)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          {formatSecondsToTime(f.length)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Total: {formatBytes(cached.totalSize)} ({cached.audioFiles.length} tracks)
              </div>
            </>
          )}

          <SetlistPanel date={recDate} />
        </div>
      )}
    </div>
  );
}
