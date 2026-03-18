/**
 * HueSlider — range slider with hue-gradient track and color swatch.
 */

interface Props {
  label: string;
  value: number; // 0-360
  onChange: (hue: number) => void;
}

function hueToRgb(h: number): string {
  const s = 1, l = 0.5;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return `rgb(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)})`;
}

export default function HueSlider({ label, value, onChange }: Props) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>{label}</label>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 'var(--radius)',
            backgroundColor: hueToRgb(value),
            border: '1px solid var(--border)',
          }}
        />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', width: 32, textAlign: 'right' }}>
          {Math.round(value)}°
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={360}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          background: 'linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))',
          height: 6,
          borderRadius: 3,
          appearance: 'none',
          outline: 'none',
        }}
      />
    </div>
  );
}
