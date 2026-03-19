import type { SearchHistoryEntry } from '../../types';

export type SearchMode = 'date' | 'year' | 'text';

const POPULAR_DATES = [
  { date: '1977-05-08', label: '5/8/77' },
  { date: '1972-08-27', label: '8/27/72' },
  { date: '1970-02-13', label: '2/13/70' },
  { date: '1970-05-02', label: '5/2/70' },
  { date: '1974-06-18', label: '6/18/74' },
];

interface SearchControlsProps {
  mode: SearchMode;
  date: string;
  year: string;
  query: string;
  dateError: string;
  searching: boolean;
  searchDone: boolean;
  searchHistory: SearchHistoryEntry[];
  calendarLoading: boolean;
  onModeChange: (mode: SearchMode) => void;
  onDateChange: (value: string) => void;
  onYearChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onSearch: (opts?: { date?: string; year?: number; query?: string }) => void;
  onLoadCalendar: () => void;
}

export default function SearchControls({
  mode, date, year, query, dateError, searching, searchDone,
  searchHistory, calendarLoading,
  onModeChange, onDateChange, onYearChange, onQueryChange, onSearch, onLoadCalendar,
}: SearchControlsProps) {
  return (
    <div className="card mb-16">
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
        {(['date', 'year', 'text'] as SearchMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
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
              onChange={(e) => onDateChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
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
              onChange={(e) => onYearChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
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
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
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
          onClick={() => onSearch()}
          disabled={searching}
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
        {mode === 'year' && (
          <button
            className="btn btn-secondary"
            onClick={onLoadCalendar}
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
              onClick={() => onSearch({ date: d })}
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
                  if (h.date) { onModeChange('date'); onSearch({ date: h.date }); }
                  else if (h.year) { onModeChange('year'); onSearch({ year: h.year }); }
                  else if (h.query) { onModeChange('text'); onSearch({ query: h.query }); }
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
  );
}
