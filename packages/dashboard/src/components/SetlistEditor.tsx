import { useState } from 'react';

const MODES = [
  'concert_lighting',
  'liquid_light',
  'particle_nebula',
  'oil_projector',
  'lo_fi_grain',
  'stark_minimal',
];

interface Song {
  trackId: string;
  title: string;
  set: number;
  trackNumber: number;
  defaultMode: string;
  audioFile: string;
  segueInto?: boolean;
}

interface SetlistEditorProps {
  songs: Song[];
  onChange: (songs: Song[]) => void;
}

export default function SetlistEditor({ songs, onChange }: SetlistEditorProps) {
  const [editIdx, setEditIdx] = useState<number | null>(null);

  const updateSong = (index: number, patch: Partial<Song>) => {
    const updated = songs.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange(updated);
  };

  const moveSong = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= songs.length) return;
    // Only move within same set
    if (songs[index].set !== songs[target].set) return;
    const updated = [...songs];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    // Re-number within set
    let num = 1;
    updated.forEach(s => {
      if (s.set === songs[index].set) {
        s.trackNumber = num++;
      }
    });
    onChange(updated);
    if (editIdx === index) setEditIdx(target);
  };

  const sets = [1, 2];

  return (
    <div>
      {sets.map(setNum => (
        <div key={setNum} style={{ marginBottom: 20 }}>
          <h4 style={{ color: 'var(--amber)', marginBottom: 8, fontSize: 13, fontFamily: 'var(--font-mono)' }}>
            SET {setNum}
          </h4>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Track ID</th>
                <th>Title</th>
                <th>Mode</th>
                <th>Segue</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {songs.filter(s => s.set === setNum).map((song) => {
                const globalIdx = songs.indexOf(song);
                const isEditing = editIdx === globalIdx;
                return (
                  <tr key={song.trackId} onClick={() => setEditIdx(isEditing ? null : globalIdx)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{song.trackNumber}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{song.trackId}</td>
                    <td>{song.title}</td>
                    <td>
                      {isEditing ? (
                        <select
                          value={song.defaultMode}
                          onChange={e => updateSong(globalIdx, { defaultMode: e.target.value })}
                          onClick={e => e.stopPropagation()}
                        >
                          {MODES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)' }}>
                          {song.defaultMode}
                        </span>
                      )}
                    </td>
                    <td style={{ color: song.segueInto ? 'var(--green)' : 'var(--text-muted)' }}>
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={song.segueInto ?? false}
                          onChange={e => updateSong(globalIdx, { segueInto: e.target.checked })}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        song.segueInto ? '\u2192' : '\u2014'
                      )}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '2px 6px', fontSize: 10 }}
                          onClick={() => moveSong(globalIdx, -1)}
                          disabled={globalIdx === 0 || songs[globalIdx - 1]?.set !== setNum}
                        >
                          &#9650;
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '2px 6px', fontSize: 10 }}
                          onClick={() => moveSong(globalIdx, 1)}
                          disabled={globalIdx === songs.length - 1 || songs[globalIdx + 1]?.set !== setNum}
                        >
                          &#9660;
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
