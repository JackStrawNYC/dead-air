import { useState, useEffect } from 'react';
import { fetchBridgeOutput, overrideBridge, fetchSceneRegistry, type SceneMode } from '../api';
import { useToast } from '../hooks/useToast';

interface BridgeReviewPanelProps {
  date: string;
  onAcceptRender: () => void;
  onPreviewFirst: () => void;
  onSongsLoaded?: (songs: SongEntry[]) => void;
}

export interface SongEntry {
  trackId: string;
  title: string;
  defaultMode?: string;
  set?: number;
  palette?: { primary?: number; secondary?: number };
}

interface ChapterEntry {
  text: string;
  before?: string;
  after?: string;
}

export default function BridgeReviewPanel({ date, onAcceptRender, onPreviewFirst, onSongsLoaded }: BridgeReviewPanelProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [songs, setSongs] = useState<SongEntry[]>([]);
  const [chapters, setChapters] = useState<ChapterEntry[]>([]);
  const [modes, setModes] = useState<SceneMode[]>([]);
  const [setBreakDuration, setSetBreakDuration] = useState(10);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchBridgeOutput(date),
      fetchSceneRegistry().catch(() => ({ modes: [] })),
    ]).then(([output, registry]) => {
      const setlist = output.setlist as { songs?: SongEntry[] } | null;
      const loadedSongs = setlist?.songs ?? [];
      setSongs(loadedSongs);
      if (onSongsLoaded && loadedSongs.length > 0) onSongsLoaded(loadedSongs);
      const ctx = output.context as { chapters?: ChapterEntry[]; setBreakDuration?: number } | null;
      setChapters(ctx?.chapters ?? []);
      if (ctx?.setBreakDuration) setSetBreakDuration(ctx.setBreakDuration);
      setModes(registry.modes ?? []);
    }).catch(() => {
      toast('error', 'Failed to load bridge output');
    }).finally(() => setLoading(false));
  }, [date]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const songOverrides: Record<string, { defaultMode?: string; palette?: { primary?: number; secondary?: number } }> = {};
      for (const song of songs) {
        songOverrides[song.trackId] = {
          defaultMode: song.defaultMode,
          palette: song.palette,
        };
      }
      const chapterOverrides = chapters.map((ch, i) => ({ index: i, text: ch.text }));
      await overrideBridge(date, { songOverrides, chapterOverrides, setBreakDuration });
      toast('success', 'Bridge overrides saved');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading bridge output...</div>;
  }

  return (
    <div>
      <div className="card-header" style={{ marginBottom: 12 }}>
        <h3>Bridge Review</h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{songs.length} tracks</span>
      </div>

      {/* Song table */}
      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Track</th>
              <th>Title</th>
              <th>Set</th>
              <th>Mode</th>
              <th>Primary Hue</th>
              <th>Secondary Hue</th>
            </tr>
          </thead>
          <tbody>
            {songs.map((song, i) => (
              <tr key={song.trackId}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{song.trackId}</td>
                <td style={{ fontSize: 12 }}>{song.title}</td>
                <td style={{ fontSize: 12 }}>{song.set}</td>
                <td>
                  <select
                    value={song.defaultMode || ''}
                    onChange={e => {
                      const updated = [...songs];
                      updated[i] = { ...song, defaultMode: e.target.value };
                      setSongs(updated);
                    }}
                    style={{ fontSize: 11, width: 140 }}
                  >
                    <option value="">Auto</option>
                    {modes.map(m => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={song.palette?.primary ?? 180}
                    onChange={e => {
                      const updated = [...songs];
                      updated[i] = {
                        ...song,
                        palette: { ...song.palette, primary: parseInt(e.target.value, 10) },
                      };
                      setSongs(updated);
                    }}
                    style={{ width: 80 }}
                  />
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
                    {song.palette?.primary ?? 180}
                  </span>
                </td>
                <td>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={song.palette?.secondary ?? 220}
                    onChange={e => {
                      const updated = [...songs];
                      updated[i] = {
                        ...song,
                        palette: { ...song.palette, secondary: parseInt(e.target.value, 10) },
                      };
                      setSongs(updated);
                    }}
                    style={{ width: 80 }}
                  />
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
                    {song.palette?.secondary ?? 220}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Chapter cards */}
      {chapters.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
            Chapter Cards ({chapters.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {chapters.map((ch, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 30 }}>#{i + 1}</span>
                <input
                  type="text"
                  value={ch.text}
                  onChange={e => {
                    const updated = [...chapters];
                    updated[i] = { ...ch, text: e.target.value };
                    setChapters(updated);
                  }}
                  style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Set break duration */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
          SET BREAK DURATION (SEC)
        </label>
        <input
          type="number"
          min={0}
          max={60}
          value={setBreakDuration}
          onChange={e => setSetBreakDuration(parseInt(e.target.value, 10) || 10)}
          style={{ width: 80, fontFamily: 'var(--font-mono)', fontSize: 12 }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Overrides'}
        </button>
        <button className="btn btn-primary" onClick={async () => { await handleSave(); onAcceptRender(); }}>
          Accept & Render
        </button>
        <button className="btn btn-secondary" onClick={async () => { await handleSave(); onPreviewFirst(); }}>
          Preview First
        </button>
      </div>
    </div>
  );
}
