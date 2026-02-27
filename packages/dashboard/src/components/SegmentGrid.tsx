import { useRef, useEffect, useState } from 'react';

interface Segment {
  index: number;
  file: string;
  size: number;
  done: boolean;
}

interface SegmentGridProps {
  segments: Segment[];
  total: number;
  completed: number;
}

export default function SegmentGrid({ segments, total, completed }: SegmentGridProps) {
  const cols = Math.ceil(Math.sqrt(Math.max(total, 1)));
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // ETA calculation
  const startRef = useRef({ time: Date.now(), count: completed });
  const [eta, setEta] = useState<string | null>(null);
  const [fps, setFps] = useState<string | null>(null);

  useEffect(() => {
    if (completed <= startRef.current.count) {
      startRef.current = { time: Date.now(), count: completed };
      return;
    }
    const elapsed = (Date.now() - startRef.current.time) / 1000;
    const done = completed - startRef.current.count;
    const rate = done / elapsed;
    const remaining = total - completed;
    if (rate > 0 && remaining > 0) {
      const secs = Math.round(remaining / rate);
      setEta(secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`);
      setFps(rate.toFixed(1));
    } else {
      setEta(null);
      setFps(null);
    }
  }, [completed, total]);

  return (
    <div>
      {/* Progress bar */}
      <div style={{
        background: 'var(--bg-base)', borderRadius: 4, height: 8,
        overflow: 'hidden', marginBottom: 8,
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: 'var(--green)',
          borderRadius: 4, transition: 'width 0.3s ease',
        }} />
      </div>

      <div style={{ marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 13, display: 'flex', gap: 16, alignItems: 'center' }}>
        <span>
          <span style={{ color: 'var(--text-primary)' }}>{completed}</span>
          <span style={{ color: 'var(--text-muted)' }}> / {total} segments</span>
        </span>
        {total > 0 && (
          <span style={{ color: 'var(--amber)' }}>{pct}%</span>
        )}
        {fps && (
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{fps} seg/s</span>
        )}
        {eta && (
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>ETA {eta}</span>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 3,
        }}
      >
        {Array.from({ length: total }, (_, i) => {
          const seg = segments.find(s => s.index === i);
          const done = seg?.done ?? false;
          return (
            <div
              key={i}
              title={`Segment ${i}${seg ? ` (${(seg.size / 1024).toFixed(0)}KB)` : ''}`}
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: 2,
                background: done ? 'var(--green)' : 'var(--bg-elevated)',
                opacity: done ? 0.8 : 0.4,
                minWidth: 8,
                minHeight: 8,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
