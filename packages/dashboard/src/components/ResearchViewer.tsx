import { useState } from 'react';

interface ResearchViewerProps {
  data: any;
}

export default function ResearchViewer({ data }: ResearchViewerProps) {
  const [expandedSong, setExpandedSong] = useState<number | null>(null);

  return (
    <div>
      {/* Context cards */}
      {(data.tourContext || data.bandContext || data.historicalContext) && (
        <div className="grid-2 mb-16" style={{ gap: 12 }}>
          {data.tourContext && (
            <ContextCard title="Tour Context" text={data.tourContext} />
          )}
          {data.bandContext && (
            <ContextCard title="Band Context" text={data.bandContext} />
          )}
          {data.historicalContext && (
            <ContextCard title="Historical Context" text={data.historicalContext} />
          )}
          {data.venueContext && (
            <ContextCard title="Venue" text={data.venueContext} />
          )}
        </div>
      )}

      {/* Song histories — accordion */}
      {data.songs && Array.isArray(data.songs) && data.songs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>
            Song Research ({data.songs.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.songs.map((song: any, i: number) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => setExpandedSong(expandedSong === i ? null : i)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontWeight: 500, fontSize: 13 }}>
                    {song.title || song.trackId || `Song ${i + 1}`}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {expandedSong === i ? '\u25B2' : '\u25BC'}
                  </span>
                </div>
                {expandedSong === i && (
                  <div style={{ padding: '0 14px 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                    {song.history && <p style={{ marginBottom: 8 }}>{song.history}</p>}
                    {song.significance && (
                      <p style={{ marginBottom: 8, fontStyle: 'italic' }}>{song.significance}</p>
                    )}
                    {song.listenFor && Array.isArray(song.listenFor) && song.listenFor.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Listen For:</span>
                        <ul style={{ paddingLeft: 16, marginTop: 4 }}>
                          {song.listenFor.map((item: any, li: number) => (
                            <li key={li} style={{ marginBottom: 4, fontSize: 12 }}>
                              {typeof item === 'string' ? item : (
                                <>
                                  {item.timestamp && (
                                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)', marginRight: 8 }}>
                                      {item.timestamp}
                                    </span>
                                  )}
                                  {item.description || item.text || JSON.stringify(item)}
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Archive reviews */}
      {data.reviews && Array.isArray(data.reviews) && data.reviews.length > 0 && (
        <div>
          <h4 style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>
            Archive Reviews ({data.reviews.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.reviews.map((review: any, i: number) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '12px 16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {review.rating != null && (
                    <span style={{ color: 'var(--amber)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {'\u2605'.repeat(Math.round(review.rating))}
                      {'\u2606'.repeat(5 - Math.round(review.rating))}
                    </span>
                  )}
                  {review.source && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{review.source}</span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {review.text || review.summary || review.content || JSON.stringify(review)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fallback for unknown structure */}
      {!data.tourContext && !data.bandContext && !data.historicalContext && !data.songs && !data.reviews && (
        <pre style={{
          fontFamily: 'var(--font-mono)', fontSize: 12,
          color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
          lineHeight: 1.5,
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ContextCard({ title, text }: { title: string; text: string }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '14px 16px',
    }}>
      <h4 style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
        {title}
      </h4>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {text}
      </p>
    </div>
  );
}
