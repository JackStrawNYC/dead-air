interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
  fontSize?: number;
}

export default function StatCard({ label, value, color, fontSize = 32 }: StatCardProps) {
  return (
    <div className="card">
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize, fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
