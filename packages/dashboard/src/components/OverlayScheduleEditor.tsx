interface SongOverlays {
  title: string;
  activeOverlays: string[];
  totalCount: number;
}

interface OverlayScheduleEditorProps {
  songs: Record<string, SongOverlays>;
  onChange: (songs: Record<string, SongOverlays>) => void;
}

export default function OverlayScheduleEditor({ songs, onChange }: OverlayScheduleEditorProps) {
  // Collect all unique overlay names
  const allOverlays = Array.from(
    new Set(Object.values(songs).flatMap(s => s.activeOverlays))
  ).sort();

  const trackIds = Object.keys(songs).sort();

  const toggleOverlay = (trackId: string, overlay: string) => {
    const song = songs[trackId];
    const has = song.activeOverlays.includes(overlay);
    const updated = has
      ? song.activeOverlays.filter(o => o !== overlay)
      : [...song.activeOverlays, overlay];
    onChange({
      ...songs,
      [trackId]: { ...song, activeOverlays: updated, totalCount: updated.length },
    });
  };

  return (
    <div className="table-wrap">
      <table style={{ fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 1 }}>Overlay</th>
            {trackIds.map(id => (
              <th key={id} style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', padding: '4px 2px', fontSize: 10 }}>
                {id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allOverlays.map(overlay => (
            <tr key={overlay}>
              <td style={{
                position: 'sticky', left: 0, background: 'var(--bg-surface)',
                fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap',
              }}>
                {overlay}
              </td>
              {trackIds.map(id => {
                const active = songs[id].activeOverlays.includes(overlay);
                return (
                  <td
                    key={id}
                    onClick={() => toggleOverlay(id, overlay)}
                    style={{
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: active ? 'var(--green-dim)' : 'transparent',
                      color: active ? 'var(--green)' : 'var(--text-muted)',
                      padding: '4px 6px',
                      fontSize: 12,
                    }}
                  >
                    {active ? '\u2713' : '\u00B7'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
