import { useState, useEffect } from 'react';
import {
  fetchSongIdentities, saveSongIdentities,
  fetchSceneRegistry, fetchOverlayNames,
  type SceneMode,
} from '../api';
import HueSlider from '../components/HueSlider';
import TagMultiSelect from '../components/TagMultiSelect';

const TRANSITION_STYLES = [
  'dissolve', 'morph', 'flash', 'void', 'radial_wipe', 'distortion_morph',
  'luminance_key', 'kaleidoscope_dissolve', 'prismatic_split', 'chromatic_wipe',
  'feedback_dissolve', 'spiral_vortex', 'interference_pattern', 'pixel_scatter',
  'vine_grow', 'particle_scatter', 'gravity_well', 'curtain_rise',
];

const DRUMS_SPACE_PHASES = ['intro', 'drums_peak', 'transition', 'space_ambient', 'space_peak', 'reentry'];

export default function SongIdentities() {
  const [identities, setIdentities] = useState<Record<string, any>>({});
  const [selectedSong, setSelectedSong] = useState<string | null>(null);
  const [sceneModes, setSceneModes] = useState<SceneMode[]>([]);
  const [overlayNames, setOverlayNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    fetchSongIdentities().then(setIdentities).catch(() => {});
    fetchSceneRegistry().then(r => setSceneModes(r.modes)).catch(() => {});
    fetchOverlayNames().then(setOverlayNames).catch(() => {});
  }, []);

  const songKeys = Object.keys(identities).sort();
  const current = selectedSong ? identities[selectedSong] : null;

  const updateField = (field: string, value: any) => {
    if (!selectedSong) return;
    setIdentities(prev => ({
      ...prev,
      [selectedSong]: { ...prev[selectedSong], [field]: value },
    }));
    setDirty(true);
  };

  const updatePalette = (field: string, value: number) => {
    if (!selectedSong || !current) return;
    setIdentities(prev => ({
      ...prev,
      [selectedSong]: {
        ...prev[selectedSong],
        palette: { ...prev[selectedSong].palette, [field]: value },
      },
    }));
    setDirty(true);
  };

  const updateClimaxBehavior = (field: string, value: any) => {
    if (!selectedSong || !current) return;
    setIdentities(prev => ({
      ...prev,
      [selectedSong]: {
        ...prev[selectedSong],
        climaxBehavior: { ...(prev[selectedSong].climaxBehavior || {}), [field]: value },
      },
    }));
    setDirty(true);
  };

  const updateDrumsSpaceShader = (phase: string, mode: string) => {
    if (!selectedSong) return;
    setIdentities(prev => ({
      ...prev,
      [selectedSong]: {
        ...prev[selectedSong],
        drumsSpaceShaders: { ...(prev[selectedSong].drumsSpaceShaders || {}), [phase]: mode || undefined },
      },
    }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    await saveSongIdentities(identities);
    setDirty(false);
    setSaving(false);
  };

  const handleResetSong = () => {
    if (!selectedSong) return;
    const { [selectedSong]: _, ...rest } = identities;
    setIdentities(rest);
    setDirty(true);
    setSelectedSong(null);
  };

  // Group scene modes by energy for TagMultiSelect
  const modeGroups = [
    { label: 'HIGH', items: sceneModes.filter(m => m.energyAffinity === 'high').map(m => m.id) },
    { label: 'MID', items: sceneModes.filter(m => m.energyAffinity === 'mid').map(m => m.id) },
    { label: 'LOW', items: sceneModes.filter(m => m.energyAffinity === 'low').map(m => m.id) },
    { label: 'ANY', items: sceneModes.filter(m => m.energyAffinity === 'any').map(m => m.id) },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>Song Identities</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{songKeys.length} songs</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, minHeight: 600 }}>
        {/* Song list */}
        <div className="card" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
          <div style={{ padding: '8px 0' }}>
            {songKeys.map(key => (
              <div
                key={key}
                onClick={() => setSelectedSong(key)}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  borderLeft: selectedSong === key ? '3px solid var(--amber)' : '3px solid transparent',
                  background: selectedSong === key ? 'var(--bg-elevated)' : 'transparent',
                  color: selectedSong === key ? '#fff' : 'var(--text-muted)',
                }}
              >
                {key}
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        {current && selectedSong ? (
          <div className="card" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
            <div className="card-header">
              <h3 style={{ fontFamily: 'var(--font-mono)' }}>{selectedSong}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={handleResetSong}>
                  Reset to Default
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                >
                  {saving ? 'Saving...' : 'Save All'}
                </button>
              </div>
            </div>

            {/* Palette */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Palette</h4>
              <HueSlider
                label="Primary Hue"
                value={current.palette?.primary ?? 200}
                onChange={v => updatePalette('primary', v)}
              />
              <HueSlider
                label="Secondary Hue"
                value={current.palette?.secondary ?? 320}
                onChange={v => updatePalette('secondary', v)}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Saturation</label>
                  <input
                    type="range" min={0} max={100}
                    value={(current.palette?.saturation ?? 0.8) * 100}
                    onChange={e => updatePalette('saturation', Number(e.target.value) / 100)}
                    style={{ width: '100%' }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {((current.palette?.saturation ?? 0.8) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Preferred Modes */}
            <TagMultiSelect
              label="Preferred Modes"
              selected={current.preferredModes || []}
              options={modeGroups}
              onChange={v => updateField('preferredModes', v)}
              placeholder="Search shader modes..."
            />

            {/* Overlay Boost / Suppress */}
            <TagMultiSelect
              label="Overlay Boost (+0.30)"
              selected={current.overlayBoost || []}
              options={overlayNames}
              onChange={v => updateField('overlayBoost', v)}
            />
            <TagMultiSelect
              label="Overlay Suppress (-0.40)"
              selected={current.overlaySuppress || []}
              options={overlayNames}
              onChange={v => updateField('overlaySuppress', v)}
            />

            {/* Overlay Density */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                Overlay Density
              </label>
              <input
                type="range" min={10} max={200}
                value={(current.overlayDensity ?? 1.0) * 100}
                onChange={e => updateField('overlayDensity', Number(e.target.value) / 100)}
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {(current.overlayDensity ?? 1.0).toFixed(2)}
              </span>
            </div>

            {/* Climax Behavior */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Climax Behavior</h4>
              <div className="grid-2">
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Peak Saturation</label>
                  <input
                    type="range" min={0} max={100}
                    value={(current.climaxBehavior?.peakSaturation ?? 0.3) * 100}
                    onChange={e => updateClimaxBehavior('peakSaturation', Number(e.target.value) / 100)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Peak Brightness</label>
                  <input
                    type="range" min={0} max={100}
                    value={(current.climaxBehavior?.peakBrightness ?? 0.15) * 100}
                    onChange={e => updateClimaxBehavior('peakBrightness', Number(e.target.value) / 100)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={current.climaxBehavior?.flash ?? false}
                  onChange={e => updateClimaxBehavior('flash', e.target.checked)}
                />
                Flash at climax onset
              </label>
              <div style={{ marginTop: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Climax Density Mult</label>
                <input
                  type="range" min={50} max={300}
                  value={(current.climaxBehavior?.climaxDensityMult ?? 1.5) * 100}
                  onChange={e => updateClimaxBehavior('climaxDensityMult', Number(e.target.value) / 100)}
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {(current.climaxBehavior?.climaxDensityMult ?? 1.5).toFixed(2)}x
                </span>
              </div>
            </div>

            {/* Transitions */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Transitions</h4>
              <div className="grid-2">
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Transition In</label>
                  <select
                    value={current.transitionIn || ''}
                    onChange={e => updateField('transitionIn', e.target.value || undefined)}
                    style={{ width: '100%' }}
                  >
                    <option value="">Default</option>
                    {TRANSITION_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Transition Out</label>
                  <select
                    value={current.transitionOut || ''}
                    onChange={e => updateField('transitionOut', e.target.value || undefined)}
                    style={{ width: '100%' }}
                  >
                    <option value="">Default</option>
                    {TRANSITION_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Hue/Saturation Shifts */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Hue & Saturation Shift</h4>
              <div className="grid-2">
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hue Shift (°)</label>
                  <input
                    type="range" min={-180} max={180}
                    value={current.hueShift ?? 0}
                    onChange={e => updateField('hueShift', Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{current.hueShift ?? 0}°</span>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Saturation Offset</label>
                  <input
                    type="range" min={-50} max={50}
                    value={(current.saturationOffset ?? 0) * 100}
                    onChange={e => updateField('saturationOffset', Number(e.target.value) / 100)}
                    style={{ width: '100%' }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(current.saturationOffset ?? 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Advanced: Drums/Space Shaders */}
            <div>
              <h4
                style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', cursor: 'pointer' }}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? '\u25BC' : '\u25B6'} Advanced: Drums/Space Shaders
              </h4>
              {showAdvanced && (
                <div style={{ marginTop: 8 }}>
                  {DRUMS_SPACE_PHASES.map(phase => (
                    <div key={phase} style={{ marginBottom: 6 }}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
                        {phase}
                      </label>
                      <select
                        value={current.drumsSpaceShaders?.[phase] || ''}
                        onChange={e => updateDrumsSpaceShader(phase, e.target.value)}
                        style={{ width: '100%' }}
                      >
                        <option value="">Default</option>
                        {sceneModes.map(m => (
                          <option key={m.id} value={m.id}>{m.id} ({m.energyAffinity})</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <p>Select a song to edit its visual identity</p>
          </div>
        )}
      </div>
    </div>
  );
}
