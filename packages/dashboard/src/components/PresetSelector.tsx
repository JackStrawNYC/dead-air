import { useState, useEffect } from 'react';
import { fetchRenderPresets } from '../api';

interface RenderPreset {
  width: number;
  height: number;
  concurrency: number;
  skipGrain: boolean;
  skipBloom: boolean;
  label: string;
}

interface PresetSelectorProps {
  value: string;
  onChange: (preset: string) => void;
}

export default function PresetSelector({ value, onChange }: PresetSelectorProps) {
  const [presets, setPresets] = useState<Record<string, RenderPreset> | null>(null);

  useEffect(() => {
    fetchRenderPresets().then(setPresets).catch(() => {});
  }, []);

  if (!presets) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading presets...</div>;
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
      gap: 8,
    }}>
      {Object.entries(presets).map(([key, preset]) => {
        const isSelected = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              background: isSelected ? 'var(--blue-dim)' : 'var(--bg-elevated)',
              border: `2px solid ${isSelected ? 'var(--blue)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              padding: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              color: 'inherit',
            }}
          >
            <div style={{
              fontWeight: 700,
              fontSize: 13,
              color: isSelected ? 'var(--blue)' : 'var(--text-primary)',
              marginBottom: 4,
            }}>
              {preset.label || key}
            </div>
            <div style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
            }}>
              {preset.width}x{preset.height}
            </div>
            <div style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              marginTop: 4,
            }}>
              {preset.concurrency} workers
              {preset.skipGrain && ' · no grain'}
              {preset.skipBloom && ' · no bloom'}
            </div>
          </button>
        );
      })}
    </div>
  );
}
