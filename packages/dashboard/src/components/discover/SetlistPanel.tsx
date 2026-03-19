import { useState, useMemo } from 'react';
import { fetchSetlistPreview, type SetlistPreview } from '../../api';
import Skeleton from '../Skeleton';

export default function SetlistPanel({ date }: { date: string }) {
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
