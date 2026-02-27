import { useEffect, useRef, useState } from 'react';

interface LogEntry {
  line: string;
  ts?: number;
}

interface LogStreamProps {
  lines: string[] | LogEntry[];
  maxHeight?: number;
}

export default function LogStream({ lines, maxHeight = 400 }: LogStreamProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  // Normalize to LogEntry[]
  const entries: LogEntry[] = lines.map(l =>
    typeof l === 'string' ? { line: l } : l
  );

  const filtered = entries.filter(e => {
    if (errorsOnly && !/error|fail|exception/i.test(e.line)) return false;
    if (filter && !e.line.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const handleCopy = () => {
    const text = filtered.map(e => e.line).join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Filter..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ flex: 1, fontSize: 12, padding: '4px 8px', maxWidth: 200 }}
        />
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={errorsOnly} onChange={e => setErrorsOnly(e.target.checked)} />
          Errors only
        </label>
        <button
          className="btn btn-secondary"
          style={{ padding: '2px 8px', fontSize: 11 }}
          onClick={handleCopy}
        >
          Copy
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {filtered.length}/{entries.length}
        </span>
      </div>
      <div
        style={{
          background: 'var(--bg-base)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '12px',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          lineHeight: '1.6',
          maxHeight,
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {filtered.length === 0 && (
          <span style={{ color: 'var(--text-muted)' }}>
            {entries.length === 0 ? 'Waiting for output...' : 'No matches'}
          </span>
        )}
        {filtered.map((entry, i) => (
          <div key={i} style={{ display: 'flex', gap: 8 }}>
            {entry.ts && (
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10, lineHeight: '1.8' }}>
                {new Date(entry.ts).toLocaleTimeString()}
              </span>
            )}
            <span style={{ color: colorize(entry.line) }}>{entry.line}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function colorize(line: string): string {
  if (line.startsWith('$')) return 'var(--amber)';
  if (/error|fail|exception/i.test(line)) return 'var(--red)';
  if (/warn/i.test(line)) return '#fbbf24';
  if (/success|complete|done|ready/i.test(line)) return 'var(--green)';
  if (/stage:|step /i.test(line)) return 'var(--blue)';
  return 'var(--text-secondary)';
}
