import { useState, useEffect } from 'react';
import { fetchRenderPresets } from '../api';
import LogStream from './LogStream';

interface RenderPreset {
  width: number;
  height: number;
  concurrency: number;
  skipGrain: boolean;
  skipBloom: boolean;
  label: string;
}

interface Song {
  trackId: string;
  title: string;
}

interface Props {
  songs: Song[];
  onStartRender: (opts: {
    track?: string; resume?: boolean; preset?: string;
    preview?: boolean; gl?: string; concurrency?: number; seed?: number;
  }) => Promise<void>;
  renderJobId: string | null;
  renderLog: string[];
  renderDone: boolean;
  renderResult: { success: boolean; error?: string } | null;
}

const GL_BACKENDS = ['angle', 'egl', 'swangle', 'swiftshader'];

export default function RenderSettings({ songs, onStartRender, renderJobId, renderLog, renderDone, renderResult }: Props) {
  const [presets, setPresets] = useState<Record<string, RenderPreset>>({});
  const [selectedPreset, setSelectedPreset] = useState('preview');
  const [track, setTrack] = useState('');
  const [preview, setPreview] = useState(false);
  const [resume, setResume] = useState(true);
  const [gl, setGl] = useState('angle');
  const [concurrencyOverride, setConcurrencyOverride] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchRenderPresets().then(setPresets).catch(() => {});
  }, []);

  const activePreset = presets[selectedPreset];
  const effectiveConcurrency = concurrencyOverride
    ? parseInt(concurrencyOverride, 10)
    : activePreset?.concurrency ?? 4;

  const handleStart = async () => {
    setStarting(true);
    try {
      await onStartRender({
        preset: selectedPreset,
        track: track || undefined,
        preview,
        resume,
        gl,
        concurrency: concurrencyOverride ? parseInt(concurrencyOverride, 10) : undefined,
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h3>Render Settings</h3>
        </div>

        {/* Preset selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
            Quality Preset
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {Object.entries(presets).map(([key, preset]) => (
              <button
                key={key}
                className={`btn ${selectedPreset === key ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedPreset(key)}
                style={{ textAlign: 'left', padding: '8px 12px' }}
              >
                <div style={{ fontWeight: 600, textTransform: 'capitalize', fontSize: 13 }}>{key}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {preset.width}x{preset.height}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  concurrency: {preset.concurrency}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 16 }}>
          {/* Track selector */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              Track (optional)
            </label>
            <select
              value={track}
              onChange={e => setTrack(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">All tracks</option>
              {songs.map(s => (
                <option key={s.trackId} value={s.trackId}>
                  {s.trackId} — {s.title}
                </option>
              ))}
            </select>
          </div>

          {/* Concurrency */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              Concurrency Override
            </label>
            <input
              type="number"
              min={1}
              max={16}
              value={concurrencyOverride}
              placeholder={String(activePreset?.concurrency ?? 4)}
              onChange={e => setConcurrencyOverride(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          {/* GL Backend */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              GL Backend
            </label>
            <select value={gl} onChange={e => setGl(e.target.value)} style={{ width: '100%' }}>
              {GL_BACKENDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {/* Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)} />
              Preview Mode (first 15s)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={resume} onChange={e => setResume(e.target.checked)} />
              Resume (skip existing)
            </label>
          </div>
        </div>

        {/* Summary + Start */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {activePreset && (
              <>
                {activePreset.width}x{activePreset.height} &middot; {effectiveConcurrency} workers
                {activePreset.skipGrain && ' &middot; no grain'}
                {activePreset.skipBloom && ' &middot; no bloom'}
                {track && ` &middot; track: ${track}`}
                {preview && ' &middot; preview'}
              </>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={handleStart}
            disabled={starting || (!!renderJobId && !renderDone)}
            style={{ padding: '8px 24px' }}
          >
            {starting ? 'Starting...' : 'Start Render'}
          </button>
        </div>
      </div>

      {/* Render log */}
      {renderJobId && (
        <div className="card mt-16">
          <div className="card-header">
            <h3>Render Output</h3>
            {renderDone && (
              <span style={{ color: renderResult?.success ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>
                {renderResult?.success ? 'Complete' : `Failed: ${renderResult?.error}`}
              </span>
            )}
          </div>
          <LogStream lines={renderLog} maxHeight={300} />
        </div>
      )}
    </div>
  );
}
