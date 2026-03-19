import { formatBytes } from '../../utils/format';

const COST_ESTIMATE = [
  { label: 'Audio download', estimate: 'varies', detail: 'from file size' },
  { label: 'Analysis', estimate: '~free', detail: 'local Python' },
  { label: 'Research', estimate: '$0.05-0.15', detail: '1 Claude call' },
  { label: 'Script', estimate: '$0.10-0.30', detail: '1-2 Claude calls' },
  { label: 'Assets', estimate: '$0.50-2.00', detail: 'image generation' },
];

interface CostEstimateCardProps {
  totalSize: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CostEstimateCard({ totalSize, onConfirm, onCancel }: CostEstimateCardProps) {
  return (
    <div className="card mb-16" style={{
      borderColor: 'var(--amber)',
      background: 'var(--amber-dim, rgba(251,191,36,0.05))',
    }}>
      <div className="card-header">
        <h3>Cost Estimate</h3>
      </div>
      <div style={{ fontSize: 12 }}>
        <div className="table-wrap">
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Stage</th>
                <th style={{ textAlign: 'right' }}>Estimate</th>
                <th style={{ textAlign: 'left', paddingLeft: 12 }}>Note</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Audio download</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {totalSize > 0 ? formatBytes(totalSize) : 'varies'}
                </td>
                <td style={{ paddingLeft: 12, color: 'var(--text-muted)' }}>from archive.org</td>
              </tr>
              {COST_ESTIMATE.slice(1).map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{c.estimate}</td>
                  <td style={{ paddingLeft: 12, color: 'var(--text-muted)' }}>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{
          marginTop: 12, padding: '8px 12px', background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontWeight: 600,
        }}>
          Total estimate: $0.65 - $2.45
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary" onClick={onConfirm}>Confirm & Start Pipeline</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
