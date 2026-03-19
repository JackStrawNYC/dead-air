import { useState, useEffect } from 'react';
import { fetchHealth, type HealthResponse } from '../api';

function formatGB(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(1);
}

function diskColor(freeBytes: number): string {
  const gb = freeBytes / (1024 * 1024 * 1024);
  if (gb > 20) return 'var(--green)';
  if (gb >= 5) return 'var(--amber)';
  return 'var(--red)';
}

export default function DiskStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    const load = () => { fetchHealth().then(setHealth).catch(() => {}); };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!health || !health.diskFree) return null;

  return (
    <div style={{
      padding: '8px 16px',
      fontSize: 11,
      fontFamily: 'var(--font-mono)',
      color: 'var(--text-muted)',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span>Disk</span>
        <span style={{ color: diskColor(health.diskFree) }}>{formatGB(health.diskFree)} GB free</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Renders</span>
        <span>{formatGB(health.renderDirSize)} GB</span>
      </div>
    </div>
  );
}
