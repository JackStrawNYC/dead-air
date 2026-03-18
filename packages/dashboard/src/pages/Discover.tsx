import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  searchArchive,
  fetchArchiveFiles,
  startFullPipeline,
  ingestShow,
  cancelJob,
  fetchShows,
  type ArchiveRecording,
  type ArchiveFileInfo,
} from '../api';
import { useJob } from '../hooks/useJob';
import LogStream from '../components/LogStream';
import StageButton from '../components/StageButton';
import Skeleton from '../components/Skeleton';
import { useToast } from '../hooks/useToast';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PIPELINE_STAGES = ['ingest', 'analyze', 'research', 'script', 'generate', 'render'];

const POPULAR_DATES = [
  { date: '1977-05-08', label: '5/8/77' },
  { date: '1972-08-27', label: '8/27/72' },
  { date: '1970-02-13', label: '2/13/70' },
  { date: '1970-05-02', label: '5/2/70' },
  { date: '1974-06-18', label: '6/18/74' },
];

const SOURCE_BADGE: Record<string, { bg: string; color: string }> = {
  SBD: { bg: 'var(--green-dim)', color: 'var(--green)' },
  matrix: { bg: 'var(--amber-dim, rgba(251,191,36,0.1))', color: 'var(--amber)' },
  AUD: { bg: 'var(--red-dim, rgba(239,68,68,0.1))', color: 'var(--red)' },
  unknown: { bg: 'var(--bg-elevated)', color: 'var(--text-muted)' },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(seconds: string | undefined): string {
  if (!seconds) return '--:--';
  const s = parseFloat(seconds);
  if (isNaN(s)) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface FileCache {
  audioFiles: ArchiveFileInfo[];
  totalSize: number;
}

export default function Discover() {
  const [date, setDate] = useState('');
  const [dateError, setDateError] = useState('');
  const [searching, setSearching] = useState(false);
  const [recordings, setRecordings] = useState<ArchiveRecording[]>([]);
  const [searchDone, setSearchDone] = useState(false);

  // Per-recording file cache
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileCache, setFileCache] = useState<Record<string, FileCache>>({});

  // Already-ingested shows
  const [ingestedDates, setIngestedDates] = useState<Set<string>>(new Set());

  // Pipeline state
  const [jobId, setJobId] = useState<string | null>(null);
  const [pipelineDate, setPipelineDate] = useState<string | null>(null);
  const { log, currentStage, done, result } = useJob(jobId);
  const toast = useToast();

  // Load ingested shows on mount to check for duplicates
  useEffect(() => {
    fetchShows()
      .then((shows) => {
        setIngestedDates(new Set(shows.map((s: any) => s.date)));
      })
      .catch(() => {}); // non-critical
  }, []);

  // Refresh ingested dates after pipeline completes
  useEffect(() => {
    if (done && result?.success) {
      fetchShows()
        .then((shows) => setIngestedDates(new Set(shows.map((s: any) => s.date))))
        .catch(() => {});
    }
  }, [done, result]);

  const completedStages = useMemo(() => {
    if (done && result?.success) return PIPELINE_STAGES;
    if (!currentStage) return [];
    const idx = PIPELINE_STAGES.indexOf(currentStage);
    return idx > 0 ? PIPELINE_STAGES.slice(0, idx) : [];
  }, [currentStage, done, result]);

  const isRunning = !!jobId && !done;

  const validateDate = useCallback((d: string): boolean => {
    if (!d) {
      setDateError('Enter a date');
      return false;
    }
    if (!DATE_RE.test(d)) {
      setDateError('Use YYYY-MM-DD format');
      return false;
    }
    setDateError('');
    return true;
  }, []);

  const handleSearch = async (searchDate?: string) => {
    const d = searchDate || date;
    if (!validateDate(d)) return;
    if (searchDate) setDate(searchDate);
    setDateError('');

    setSearching(true);
    setSearchDone(false);
    setRecordings([]);
    setExpandedId(null);

    try {
      const res = await searchArchive(d);
      setRecordings(res.recordings);
      setSearchDone(true);
    } catch (err: any) {
      toast('error', err.message || 'Search failed');
      setSearchDone(true);
    } finally {
      setSearching(false);
    }
  };

  const handlePreviewFiles = async (identifier: string) => {
    if (expandedId === identifier) {
      setExpandedId(null);
      return;
    }

    setExpandedId(identifier);

    // Use cache if available
    if (fileCache[identifier]) return;

    setFilesLoading(true);
    try {
      const res = await fetchArchiveFiles(identifier);
      setFileCache((prev) => ({
        ...prev,
        [identifier]: { audioFiles: res.audioFiles, totalSize: res.totalSize },
      }));
    } catch (err: any) {
      toast('error', err.message || 'Failed to load files');
    } finally {
      setFilesLoading(false);
    }
  };

  const handleIngestAndRun = async () => {
    const d = date;
    if (!validateDate(d)) return;

    // Reset previous job state before starting new one
    setJobId(null);

    try {
      const res = await startFullPipeline(d);
      setJobId(res.jobId);
      setPipelineDate(d);
      toast('success', `Pipeline started for ${d}`);
    } catch (err: any) {
      toast('error', err.message || 'Failed to start pipeline');
    }
  };

  const handleIngestOnly = async () => {
    const d = date;
    if (!validateDate(d)) return;

    setJobId(null);

    try {
      const res = await ingestShow(d);
      setJobId(res.jobId);
      setPipelineDate(d);
      toast('success', `Ingest started for ${d}`);
    } catch (err: any) {
      toast('error', err.message || 'Failed to start ingest');
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    try {
      await cancelJob(jobId);
      toast('success', 'Job cancelled');
    } catch (err: any) {
      toast('error', err.message || 'Failed to cancel');
    }
  };

  const isAlreadyIngested = ingestedDates.has(date);

  return (
    <div>
      <div className="page-header">
        <h2>Discover Shows</h2>
        <p>Search archive.org for Grateful Dead recordings</p>
      </div>

      {/* Search bar */}
      <div className="card mb-16">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div>
            <input
              type="text"
              placeholder="1977-05-08"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (dateError) setDateError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{
                width: 160,
                fontFamily: 'var(--font-mono)',
                borderColor: dateError ? 'var(--red)' : undefined,
              }}
            />
            {dateError && (
              <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{dateError}</div>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => handleSearch()}
            disabled={!date || searching}
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Popular dates */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Legendary shows:</span>
          {POPULAR_DATES.map(({ date: d, label }) => (
            <button
              key={d}
              className="btn btn-secondary"
              style={{ padding: '2px 10px', fontSize: 12, fontFamily: 'var(--font-mono)' }}
              onClick={() => handleSearch(d)}
              disabled={searching}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Already ingested banner */}
      {isAlreadyIngested && searchDone && (
        <div
          className="card mb-16"
          style={{
            borderColor: 'var(--amber)',
            background: 'var(--amber-dim, rgba(251,191,36,0.1))',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--amber)' }}>
            This show ({date}) is already ingested.
          </span>
          <Link to={`/shows/${date}`} style={{ fontSize: 13, color: 'var(--blue)' }}>
            View Show &rarr;
          </Link>
        </div>
      )}

      {/* Search results */}
      {searching && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Searching archive.org...</h3>
          </div>
          <Skeleton count={4} height={60} />
        </div>
      )}

      {searchDone && recordings.length === 0 && !searching && (
        <div className="card mb-16" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
          No recordings found for {date}
        </div>
      )}

      {recordings.length > 0 && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Results: {recordings.length} recordings</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recordings.map((rec, i) => {
              const badge = SOURCE_BADGE[rec.sourceType] || SOURCE_BADGE.unknown;
              const isExpanded = expandedId === rec.identifier;
              const isTop = i === 0;
              const cached = fileCache[rec.identifier];

              return (
                <div key={rec.identifier}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          {isTop && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--green)',
                                background: 'var(--green-dim)',
                                padding: '1px 5px',
                                borderRadius: 3,
                                fontFamily: 'var(--font-mono)',
                                letterSpacing: '0.5px',
                              }}
                            >
                              BEST
                            </span>
                          )}
                          <a
                            href={`https://archive.org/details/${rec.identifier}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 13,
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: 'var(--blue)',
                              textDecoration: 'none',
                            }}
                            title="View on archive.org"
                          >
                            {rec.identifier}
                          </a>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '1px 6px',
                              fontSize: 10,
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              borderRadius: 3,
                              background: badge.bg,
                              color: badge.color,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}
                          >
                            {rec.sourceType}
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 13,
                              color: 'var(--amber)',
                              fontWeight: 600,
                            }}
                          >
                            Score: {rec.score}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {rec.title}
                        </div>
                        {rec.description && (
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--text-muted)',
                              marginTop: 2,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 600,
                            }}
                          >
                            {rec.description.slice(0, 150)}
                            {rec.description.length > 150 ? '...' : ''}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          Formats: {rec.format.join(', ') || 'unknown'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => handlePreviewFiles(rec.identifier)}
                        >
                          {isExpanded ? 'Hide Files' : 'Preview Files'}
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={handleIngestOnly}
                          disabled={isRunning}
                        >
                          Ingest Only
                        </button>
                        <button
                          className={isTop ? 'btn btn-primary' : 'btn btn-secondary'}
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={handleIngestAndRun}
                          disabled={isRunning}
                        >
                          Ingest & Run Pipeline
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded file preview */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 4,
                        padding: 12,
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                      }}
                    >
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
                                    <td
                                      style={{
                                        textAlign: 'right',
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--text-secondary)',
                                      }}
                                    >
                                      {formatBytes(parseInt(f.size, 10) || 0)}
                                    </td>
                                    <td
                                      style={{
                                        textAlign: 'right',
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--text-secondary)',
                                      }}
                                    >
                                      {formatDuration(f.length)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 12,
                              color: 'var(--text-muted)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            Total: {formatBytes(cached.totalSize)} ({cached.audioFiles.length} tracks)
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pipeline progress */}
      {jobId && (
        <div className="card">
          <div className="card-header">
            <h3>Pipeline Progress {pipelineDate && `\u2014 ${pipelineDate}`}</h3>
            {isRunning && (
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: '4px 10px', color: 'var(--red)' }}
                onClick={handleCancel}
              >
                Cancel
              </button>
            )}
          </div>

          {/* Stage indicators */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
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

          <LogStream lines={log} maxHeight={300} />

          {done && (
            <div
              style={{
                marginTop: 12,
                fontSize: 13,
                color: result?.success ? 'var(--green)' : 'var(--red)',
              }}
            >
              {result?.success ? (
                <>
                  Pipeline complete!{' '}
                  <Link to={`/shows/${pipelineDate}`} style={{ color: 'var(--blue)' }}>
                    View Show &rarr;
                  </Link>
                </>
              ) : (
                `Pipeline failed: ${result?.error || 'unknown error'}`
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
