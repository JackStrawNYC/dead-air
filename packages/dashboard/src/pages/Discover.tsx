import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  searchArchive,
  fetchArchiveFiles,
  fetchCalendar,
  fetchSetlistPreview,
  startFullPipeline,
  ingestShow,
  cancelJob,
  fetchShows,
  type ArchiveRecording,
  type ArchiveFileInfo,
  type SetlistPreview,
} from '../api';
import { useJob } from '../hooks/useJob';
import LogStream from '../components/LogStream';
import StageButton from '../components/StageButton';
import Skeleton from '../components/Skeleton';
import { useToast } from '../hooks/useToast';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PIPELINE_STAGES = ['ingest', 'analyze', 'research', 'script', 'generate', 'render'];

type SearchMode = 'date' | 'year' | 'text';

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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const COST_ESTIMATE = [
  { label: 'Audio download', estimate: 'varies', detail: 'from file size' },
  { label: 'Analysis', estimate: '~free', detail: 'local Python' },
  { label: 'Research', estimate: '$0.05-0.15', detail: '1 Claude call' },
  { label: 'Script', estimate: '$0.10-0.30', detail: '1-2 Claude calls' },
  { label: 'Assets', estimate: '$0.50-2.00', detail: 'image generation' },
];

// ── Helpers ──

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

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return '\u2605'.repeat(full) + (half ? '\u00BD' : '') + '\u2606'.repeat(5 - full - (half ? 1 : 0));
}

/** Strip version suffixes to group recordings by base identifier */
function getBaseIdentifier(id: string): string {
  return id.replace(/[._-](restored|patched|remaster|v\d+|sbd|aud|matrix|remastered|fixed)$/i, '');
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// ── localStorage helpers ──

interface SearchHistoryEntry {
  date?: string;
  year?: number;
  query?: string;
  timestamp: number;
  resultCount: number;
}

interface ActiveJobEntry {
  jobId: string;
  date: string;
  identifier?: string;
}

const STORAGE_KEYS = {
  activeJobs: 'discover:activeJobs',
  searchHistory: 'discover:searchHistory',
};

function loadActiveJobs(): ActiveJobEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.activeJobs) || '[]');
  } catch { return []; }
}

function saveActiveJobs(jobs: ActiveJobEntry[]) {
  localStorage.setItem(STORAGE_KEYS.activeJobs, JSON.stringify(jobs));
}

function loadSearchHistory(): SearchHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.searchHistory) || '[]');
  } catch { return []; }
}

function saveSearchHistory(history: SearchHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEYS.searchHistory, JSON.stringify(history.slice(0, 10)));
}

// ── Sub-components ──

interface FileCache {
  audioFiles: ArchiveFileInfo[];
  totalSize: number;
}

function CalendarHeatmap({
  year,
  dates,
  onDateClick,
}: {
  year: number;
  dates: Record<string, number>;
  onDateClick: (date: string) => void;
}) {
  const cellSize = 14;
  const gap = 2;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {MONTHS.map((monthName, monthIdx) => {
          const days = daysInMonth(year, monthIdx);
          return (
            <div key={monthIdx} style={{ display: 'flex', alignItems: 'center', gap }}>
              <span style={{
                width: 30, fontSize: 10, color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', flexShrink: 0,
              }}>
                {monthName}
              </span>
              {Array.from({ length: 31 }, (_, dayIdx) => {
                if (dayIdx >= days) {
                  return <div key={dayIdx} style={{ width: cellSize, height: cellSize }} />;
                }
                const d = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(dayIdx + 1).padStart(2, '0')}`;
                const count = dates[d] || 0;
                let bg = 'var(--bg-elevated)';
                if (count >= 10) bg = 'rgba(34,197,94,0.8)';
                else if (count >= 4) bg = 'rgba(34,197,94,0.5)';
                else if (count >= 1) bg = 'rgba(34,197,94,0.25)';

                return (
                  <div
                    key={dayIdx}
                    onClick={() => count > 0 && onDateClick(d)}
                    title={count > 0 ? `${d}: ${count} recording${count !== 1 ? 's' : ''}` : d}
                    style={{
                      width: cellSize, height: cellSize, borderRadius: 2,
                      background: bg,
                      cursor: count > 0 ? 'pointer' : 'default',
                      border: '1px solid var(--border)',
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 10, color: 'var(--text-muted)', alignItems: 'center' }}>
        <span>Less</span>
        {[0, 1, 4, 10].map((n) => (
          <div key={n} style={{
            width: 10, height: 10, borderRadius: 2,
            background: n === 0 ? 'var(--bg-elevated)' : n < 4 ? 'rgba(34,197,94,0.25)' : n < 10 ? 'rgba(34,197,94,0.5)' : 'rgba(34,197,94,0.8)',
            border: '1px solid var(--border)',
          }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function SetlistPanel({ date }: { date: string }) {
  const [data, setData] = useState<SetlistPreview | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleLoad = async () => {
    if (data !== undefined) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    setExpanded(true);
    try {
      const result = await fetchSetlistPreview(date);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // Group songs by set
  const sets = useMemo(() => {
    if (!data?.songs) return {};
    const grouped: Record<number, typeof data.songs> = {};
    for (const s of data.songs) {
      (grouped[s.setNumber] ??= []).push(s);
    }
    return grouped;
  }, [data]);

  return (
    <div style={{ marginTop: 4 }}>
      <button
        className="btn btn-secondary"
        style={{ fontSize: 11, padding: '2px 8px' }}
        onClick={handleLoad}
      >
        {expanded ? 'Hide Setlist' : 'Show Setlist'}
      </button>
      {expanded && (
        <div style={{
          marginTop: 6, padding: 10, background: 'var(--bg-base)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12,
        }}>
          {loading ? (
            <Skeleton count={3} height={14} />
          ) : !data ? (
            <span style={{ color: 'var(--text-muted)' }}>No setlist available</span>
          ) : (
            <>
              {data.venue && (
                <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 11 }}>
                  {data.venue.name}, {data.venue.city}, {data.venue.state}
                  {data.tour && <span style={{ color: 'var(--text-muted)' }}> &mdash; {data.tour}</span>}
                </div>
              )}
              {Object.entries(sets).map(([setNum, songs]) => (
                <div key={setNum} style={{ marginBottom: 6 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2,
                  }}>
                    {Number(setNum) >= 3 ? 'Encore' : `Set ${setNum}`}
                  </div>
                  <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {songs.map((s, i) => (
                      <span key={i}>
                        {s.songName}
                        {s.coverArtist && <span style={{ color: 'var(--text-muted)' }}> [{s.coverArtist}]</span>}
                        {i < songs.length - 1 && ', '}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CostEstimateCard({
  totalSize,
  onConfirm,
  onCancel,
}: {
  totalSize: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="card mb-16" style={{
      borderColor: 'var(--amber)',
      background: 'var(--amber-dim, rgba(251,191,36,0.05))',
    }}>
      <div className="card-header">
        <h3>Cost Estimate</h3>
      </div>
      <div style={{ fontSize: 12 }}>
        <div className="table-wrap">
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Stage</th>
                <th style={{ textAlign: 'right' }}>Estimate</th>
                <th style={{ textAlign: 'left', paddingLeft: 12 }}>Note</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Audio download</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {totalSize > 0 ? formatBytes(totalSize) : 'varies'}
                </td>
                <td style={{ paddingLeft: 12, color: 'var(--text-muted)' }}>from archive.org</td>
              </tr>
              {COST_ESTIMATE.slice(1).map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{c.estimate}</td>
                  <td style={{ paddingLeft: 12, color: 'var(--text-muted)' }}>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{
          marginTop: 12, padding: '8px 12px', background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontWeight: 600,
        }}>
          Total estimate: $0.65 - $2.45
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary" onClick={onConfirm}>Confirm & Start Pipeline</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PipelineJobCard({
  entry,
  isExpanded,
  onToggle,
  onDone,
}: {
  entry: ActiveJobEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onDone: (success: boolean) => void;
}) {
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

// ── Main Component ──

export default function Discover() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const initialLoad = useRef(true);

  // Search state
  const [mode, setMode] = useState<SearchMode>((params.get('mode') as SearchMode) || 'date');
  const [date, setDate] = useState(params.get('date') || '');
  const [year, setYear] = useState(params.get('year') || '');
  const [query, setQuery] = useState(params.get('q') || '');
  const [dateError, setDateError] = useState('');
  const [searching, setSearching] = useState(false);
  const [recordings, setRecordings] = useState<ArchiveRecording[]>([]);
  const [searchDone, setSearchDone] = useState(false);

  // Calendar heatmap
  const [calendarData, setCalendarData] = useState<Record<string, number> | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Per-recording file cache
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileCache, setFileCache] = useState<Record<string, FileCache>>({});

  // Already-ingested shows
  const [ingestedDates, setIngestedDates] = useState<Set<string>>(new Set());

  // Multi-job pipeline state
  const [activeJobs, setActiveJobs] = useState<ActiveJobEntry[]>(loadActiveJobs);
  const [expandedJobIdx, setExpandedJobIdx] = useState<number>(0);

  // Cost estimate confirmation
  const [costConfirm, setCostConfirm] = useState<{ date: string; identifier?: string; totalSize: number } | null>(null);

  // Search history
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>(loadSearchHistory);

  // Recording grouping
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // ── Sync active jobs to localStorage ──
  useEffect(() => {
    saveActiveJobs(activeJobs);
  }, [activeJobs]);

  // ── Load ingested shows on mount ──
  useEffect(() => {
    fetchShows()
      .then((shows) => setIngestedDates(new Set(shows.map((s: any) => s.date))))
      .catch(() => {});
  }, []);

  // ── Auto-search from URL params on mount ──
  useEffect(() => {
    if (!initialLoad.current) return;
    initialLoad.current = false;

    if (params.get('date')) {
      handleSearch({ date: params.get('date')! });
    } else if (params.get('year')) {
      handleSearch({ year: parseInt(params.get('year')!, 10) });
    } else if (params.get('q')) {
      handleSearch({ query: params.get('q')! });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Grouped recordings ──
  const groupedRecordings = useMemo(() => {
    const groups = new Map<string, ArchiveRecording[]>();
    for (const rec of recordings) {
      const base = getBaseIdentifier(rec.identifier);
      const existing = groups.get(base) || [];
      existing.push(rec);
      groups.set(base, existing);
    }
    return groups;
  }, [recordings]);

  // ── URL sync helper ──
  const syncURL = useCallback((p: { mode?: SearchMode; date?: string; year?: string; q?: string }) => {
    const next = new URLSearchParams();
    const m = p.mode ?? mode;
    if (m !== 'date') next.set('mode', m);
    if (p.date) next.set('date', p.date);
    if (p.year) next.set('year', p.year);
    if (p.q) next.set('q', p.q);
    setParams(next, { replace: true });
  }, [mode, setParams]);

  // ── Search handlers ──

  const handleSearch = async (opts?: { date?: string; year?: number; query?: string }) => {
    const searchDate = opts?.date ?? (mode === 'date' ? date : undefined);
    const searchYear = opts?.year ?? (mode === 'year' ? parseInt(year, 10) : undefined);
    const searchQuery = opts?.query ?? (mode === 'text' ? query : undefined);

    // Validation
    if (mode === 'date' && !opts) {
      if (!date) { setDateError('Enter a date'); return; }
      if (!DATE_RE.test(date)) { setDateError('Use YYYY-MM-DD format'); return; }
    }
    if (mode === 'year' && !opts) {
      const y = parseInt(year, 10);
      if (!y || y < 1965 || y > 1995) { setDateError('Enter a year (1965-1995)'); return; }
    }
    if (mode === 'text' && !opts) {
      if (!query.trim()) { setDateError('Enter a search term'); return; }
    }

    setDateError('');
    setSearching(true);
    setSearchDone(false);
    setRecordings([]);
    setExpandedId(null);
    setExpandedGroups(new Set());

    // Sync URL
    if (searchDate) {
      setDate(searchDate);
      syncURL({ mode: 'date', date: searchDate });
    } else if (searchYear) {
      setYear(String(searchYear));
      syncURL({ mode: 'year', year: String(searchYear) });
    } else if (searchQuery) {
      setQuery(searchQuery);
      syncURL({ mode: 'text', q: searchQuery });
    }

    try {
      const res = await searchArchive({
        date: searchDate,
        year: searchYear,
        query: searchQuery,
      });
      setRecordings(res.recordings);
      setSearchDone(true);

      // Save to history
      const entry: SearchHistoryEntry = {
        date: searchDate,
        year: searchYear,
        query: searchQuery,
        timestamp: Date.now(),
        resultCount: res.count,
      };
      const newHistory = [entry, ...searchHistory.filter((h) =>
        h.date !== entry.date || h.year !== entry.year || h.query !== entry.query
      )].slice(0, 10);
      setSearchHistory(newHistory);
      saveSearchHistory(newHistory);
    } catch (err: any) {
      toast('error', err.message || 'Search failed');
      setSearchDone(true);
    } finally {
      setSearching(false);
    }
  };

  // ── Calendar for year mode ──
  const handleLoadCalendar = async (y?: number) => {
    const yearNum = y ?? parseInt(year, 10);
    if (!yearNum || yearNum < 1965 || yearNum > 1995) return;
    setCalendarLoading(true);
    try {
      const res = await fetchCalendar(yearNum);
      setCalendarData(res.dates);
    } catch {
      toast('error', 'Failed to load calendar');
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleCalendarDateClick = (d: string) => {
    setMode('date');
    setDate(d);
    handleSearch({ date: d });
  };

  // ── File preview ──
  const handlePreviewFiles = async (identifier: string) => {
    if (expandedId === identifier) { setExpandedId(null); return; }
    setExpandedId(identifier);
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

  // ── Pipeline actions ──

  const handleIngestAndRun = (recDate: string, identifier?: string) => {
    const cached = identifier ? fileCache[identifier] : undefined;
    setCostConfirm({ date: recDate, identifier, totalSize: cached?.totalSize ?? 0 });
  };

  const confirmPipeline = async () => {
    if (!costConfirm) return;
    const { date: d, identifier } = costConfirm;
    setCostConfirm(null);

    try {
      const res = await startFullPipeline(d, identifier);
      const newJob: ActiveJobEntry = { jobId: res.jobId, date: d, identifier };
      const updated = [newJob, ...activeJobs];
      setActiveJobs(updated);
      setExpandedJobIdx(0);
      toast('success', `Pipeline started for ${d}`);
    } catch (err: any) {
      toast('error', err.message || 'Failed to start pipeline');
    }
  };

  const handleIngestOnly = async (d: string) => {
    try {
      const res = await ingestShow(d);
      const newJob: ActiveJobEntry = { jobId: res.jobId, date: d };
      const updated = [newJob, ...activeJobs];
      setActiveJobs(updated);
      setExpandedJobIdx(0);
      toast('success', `Ingest started for ${d}`);
    } catch (err: any) {
      toast('error', err.message || 'Failed to start ingest');
    }
  };

  const handleJobDone = useCallback((idx: number, success: boolean) => {
    if (success) {
      fetchShows()
        .then((shows) => setIngestedDates(new Set(shows.map((s: any) => s.date))))
        .catch(() => {});
    }
  }, []);

  const isAnyRunning = activeJobs.length > 0;
  const isAlreadyIngested = mode === 'date' && ingestedDates.has(date);

  // ── Mode switch handler ──
  const handleModeChange = (m: SearchMode) => {
    setMode(m);
    setDateError('');
    setRecordings([]);
    setSearchDone(false);
    setCalendarData(null);
    syncURL({ mode: m });
  };

  return (
    <div>
      <div className="page-header">
        <h2>Discover Shows</h2>
        <p>Search archive.org for Grateful Dead recordings</p>
      </div>

      {/* Search bar */}
      <div className="card mb-16">
        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
          {(['date', 'year', 'text'] as SearchMode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              style={{
                padding: '6px 16px',
                fontSize: 12,
                fontWeight: mode === m ? 700 : 400,
                color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
                background: 'none',
                border: 'none',
                borderBottom: mode === m ? '2px solid var(--blue)' : '2px solid transparent',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {m === 'text' ? 'Text Search' : m === 'year' ? 'Year' : 'Date'}
            </button>
          ))}
        </div>

        {/* Search inputs */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {mode === 'date' && (
            <div>
              <input
                type="text"
                placeholder="1977-05-08"
                value={date}
                onChange={(e) => { setDate(e.target.value); if (dateError) setDateError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                style={{
                  width: 160, fontFamily: 'var(--font-mono)',
                  borderColor: dateError ? 'var(--red)' : undefined,
                }}
              />
              {dateError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{dateError}</div>}
            </div>
          )}
          {mode === 'year' && (
            <div>
              <input
                type="text"
                placeholder="1977"
                value={year}
                onChange={(e) => { setYear(e.target.value); if (dateError) setDateError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                style={{
                  width: 80, fontFamily: 'var(--font-mono)',
                  borderColor: dateError ? 'var(--red)' : undefined,
                }}
              />
              {dateError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{dateError}</div>}
            </div>
          )}
          {mode === 'text' && (
            <div style={{ flex: 1 }}>
              <input
                type="text"
                placeholder="barton hall, cornell, dark star..."
                value={query}
                onChange={(e) => { setQuery(e.target.value); if (dateError) setDateError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                style={{
                  width: '100%',
                  borderColor: dateError ? 'var(--red)' : undefined,
                }}
              />
              {dateError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{dateError}</div>}
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={() => handleSearch()}
            disabled={searching}
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
          {mode === 'year' && (
            <button
              className="btn btn-secondary"
              onClick={() => handleLoadCalendar()}
              disabled={calendarLoading || !year}
            >
              {calendarLoading ? 'Loading...' : 'Calendar'}
            </button>
          )}
        </div>

        {/* Popular dates (date mode only) */}
        {mode === 'date' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Legendary shows:</span>
            {POPULAR_DATES.map(({ date: d, label }) => (
              <button
                key={d}
                className="btn btn-secondary"
                style={{ padding: '2px 10px', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                onClick={() => handleSearch({ date: d })}
                disabled={searching}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Search history (when no results displayed) */}
        {!searchDone && searchHistory.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Recent:</span>
            {searchHistory.slice(0, 5).map((h, i) => {
              const label = h.date || (h.year ? `Year ${h.year}` : h.query || '?');
              return (
                <button
                  key={i}
                  className="btn btn-secondary"
                  style={{ padding: '2px 10px', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  onClick={() => {
                    if (h.date) { setMode('date'); handleSearch({ date: h.date }); }
                    else if (h.year) { setMode('year'); handleSearch({ year: h.year }); }
                    else if (h.query) { setMode('text'); handleSearch({ query: h.query }); }
                  }}
                  disabled={searching}
                >
                  {label}
                  <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({h.resultCount})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Calendar heatmap */}
      {mode === 'year' && calendarData && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>{year} Calendar</h3>
          </div>
          <CalendarHeatmap
            year={parseInt(year, 10)}
            dates={calendarData}
            onDateClick={handleCalendarDateClick}
          />
        </div>
      )}

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

      {/* Cost estimate confirmation */}
      {costConfirm && (
        <CostEstimateCard
          totalSize={costConfirm.totalSize}
          onConfirm={confirmPipeline}
          onCancel={() => setCostConfirm(null)}
        />
      )}

      {/* Search loading */}
      {searching && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Searching archive.org...</h3>
          </div>
          <Skeleton count={4} height={60} />
        </div>
      )}

      {/* No results */}
      {searchDone && recordings.length === 0 && !searching && (
        <div className="card mb-16" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
          No recordings found
        </div>
      )}

      {/* Search results — grouped */}
      {recordings.length > 0 && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Results: {recordings.length} recordings ({groupedRecordings.size} unique)</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from(groupedRecordings.entries()).map(([baseId, groupRecs], groupIdx) => {
              const primary = groupRecs[0];
              const variants = groupRecs.slice(1);
              const hasVariants = variants.length > 0;
              const isGroupExpanded = expandedGroups.has(baseId);
              const isFirstGroup = groupIdx === 0;

              const renderRecording = (rec: ArchiveRecording, isTop: boolean) => {
                const badge = SOURCE_BADGE[rec.sourceType] || SOURCE_BADGE.unknown;
                const isExpanded = expandedId === rec.identifier;
                const cached = fileCache[rec.identifier];
                const recDate = rec.date?.substring(0, 10) || date;

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
                            {/* Reviews + Rating */}
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
                            onClick={() => handlePreviewFiles(rec.identifier)}
                          >
                            {isExpanded ? 'Hide Files' : 'Preview Files'}
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                            onClick={() => handleIngestOnly(recDate)}
                            disabled={isAnyRunning}
                          >
                            Ingest Only
                          </button>
                          <button
                            className={isTop ? 'btn btn-primary' : 'btn btn-secondary'}
                            style={{ fontSize: 12, padding: '4px 10px' }}
                            onClick={() => handleIngestAndRun(recDate, rec.identifier)}
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
                                        {formatDuration(f.length)}
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

                        {/* Setlist panel */}
                        <SetlistPanel date={recDate} />
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <div key={baseId}>
                  {renderRecording(primary, isFirstGroup && groupIdx === 0)}

                  {/* Variant toggle */}
                  {hasVariants && (
                    <div style={{ marginTop: 4, marginLeft: 16 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={() => {
                          setExpandedGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(baseId)) next.delete(baseId);
                            else next.add(baseId);
                            return next;
                          });
                        }}
                      >
                        {isGroupExpanded ? 'Hide' : 'Show'} {variants.length} more transfer{variants.length !== 1 ? 's' : ''}
                      </button>
                      {isGroupExpanded && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                          {variants.map((v) => renderRecording(v, false))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pipeline progress — multi-job */}
      {activeJobs.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Pipeline Jobs ({activeJobs.length})</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeJobs.map((entry, idx) => (
              <PipelineJobCard
                key={entry.jobId}
                entry={entry}
                isExpanded={expandedJobIdx === idx}
                onToggle={() => setExpandedJobIdx(expandedJobIdx === idx ? -1 : idx)}
                onDone={(success) => handleJobDone(idx, success)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
