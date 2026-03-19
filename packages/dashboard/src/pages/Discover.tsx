import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  searchArchive,
  fetchArchiveFiles,
  fetchCalendar,
  startFullPipeline,
  ingestShow,
  fetchShows,
  type ArchiveRecording,
} from '../api';
import type { ActiveJobEntry, SearchHistoryEntry, FileCache } from '../types';
import { useToast } from '../hooks/useToast';
import CalendarHeatmap from '../components/discover/CalendarHeatmap';
import CostEstimateCard from '../components/discover/CostEstimateCard';
import PipelineJobCard from '../components/discover/PipelineJobCard';
import SearchControls, { type SearchMode } from '../components/discover/SearchControls';
import RecordingCard from '../components/discover/RecordingCard';
import Skeleton from '../components/Skeleton';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── localStorage helpers ──

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

/** Strip version suffixes to group recordings by base identifier */
function getBaseIdentifier(id: string): string {
  return id.replace(/[._-](restored|patched|remaster|v\d+|sbd|aud|matrix|remastered|fixed)$/i, '');
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
      .then((shows) => setIngestedDates(new Set(shows.map((s) => s.date))))
      .catch((e) => { toast('error', 'Failed to load shows'); });
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Search failed';
      toast('error', message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load files';
      toast('error', message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start pipeline';
      toast('error', message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start ingest';
      toast('error', message);
    }
  };

  const handleJobDone = useCallback((idx: number, success: boolean) => {
    if (success) {
      fetchShows()
        .then((shows) => setIngestedDates(new Set(shows.map((s) => s.date))))
        .catch((e) => { toast('error', 'Failed to refresh shows'); });
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

      <SearchControls
        mode={mode}
        date={date}
        year={year}
        query={query}
        dateError={dateError}
        searching={searching}
        searchDone={searchDone}
        searchHistory={searchHistory}
        calendarLoading={calendarLoading}
        onModeChange={handleModeChange}
        onDateChange={(v) => { setDate(v); if (dateError) setDateError(''); }}
        onYearChange={(v) => { setYear(v); if (dateError) setDateError(''); }}
        onQueryChange={(v) => { setQuery(v); if (dateError) setDateError(''); }}
        onSearch={handleSearch}
        onLoadCalendar={() => handleLoadCalendar()}
      />

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

              return (
                <div key={baseId}>
                  <RecordingCard
                    recording={primary}
                    isTop={isFirstGroup}
                    isExpanded={expandedId === primary.identifier}
                    cached={fileCache[primary.identifier]}
                    filesLoading={filesLoading}
                    isAnyRunning={isAnyRunning}
                    fallbackDate={date}
                    onPreviewFiles={handlePreviewFiles}
                    onIngestOnly={handleIngestOnly}
                    onIngestAndRun={handleIngestAndRun}
                  />

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
                          {variants.map((v) => (
                            <RecordingCard
                              key={v.identifier}
                              recording={v}
                              isTop={false}
                              isExpanded={expandedId === v.identifier}
                              cached={fileCache[v.identifier]}
                              filesLoading={filesLoading}
                              isAnyRunning={isAnyRunning}
                              fallbackDate={date}
                              onPreviewFiles={handlePreviewFiles}
                              onIngestOnly={handleIngestOnly}
                              onIngestAndRun={handleIngestAndRun}
                            />
                          ))}
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
