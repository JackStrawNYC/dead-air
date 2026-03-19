interface CompositionOptions {
  noIntro: boolean;
  noEndCard: boolean;
  noChapters: boolean;
  noSetBreaks: boolean;
  setBreakSeconds: number;
}

interface CompositionControlsProps {
  value: CompositionOptions;
  onChange: (opts: CompositionOptions) => void;
}

export type { CompositionOptions };

export default function CompositionControls({ value, onChange }: CompositionControlsProps) {
  const toggle = (key: keyof Omit<CompositionOptions, 'setBreakSeconds'>) => {
    onChange({ ...value, [key]: !value[key] });
  };

  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: 12,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
        Composition Elements
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={!value.noIntro} onChange={() => toggle('noIntro')} />
          Show Intro Card
        </label>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={!value.noEndCard} onChange={() => toggle('noEndCard')} />
          End Card
        </label>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={!value.noChapters} onChange={() => toggle('noChapters')} />
          Chapter Cards
        </label>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={!value.noSetBreaks} onChange={() => toggle('noSetBreaks')} />
          Set Breaks
        </label>
        {!value.noSetBreaks && (
          <div style={{ marginLeft: 22 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
              Set Break Duration (seconds)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={value.setBreakSeconds}
              onChange={e => onChange({ ...value, setBreakSeconds: parseInt(e.target.value, 10) || 10 })}
              style={{ width: 80, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
