import { useRef, useEffect, useState, useCallback } from 'react';

interface Song {
  title?: string;
  trackId?: string;
  energy?: number[];
  duration?: number;
  onsets?: number[];
}

interface EnergyWaveformProps {
  songs: Song[];
  height?: number;
}

export default function EnergyWaveform({ songs, height = 200 }: EnergyWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; song: string; time: string; energy: string } | null>(null);

  // Collect all energy into one flat array with song boundaries
  const allEnergy: number[] = [];
  const songBounds: Array<{ start: number; end: number; title: string }> = [];
  songs.forEach(song => {
    const e = song.energy || [];
    const start = allEnergy.length;
    allEnergy.push(...e);
    songBounds.push({ start, end: allEnergy.length, title: song.title || song.trackId || '' });
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || allEnergy.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const midY = h / 2;
    const maxE = Math.max(...allEnergy, 0.01);
    const barW = Math.max(1, w / allEnergy.length);

    ctx.clearRect(0, 0, w, h);

    // Draw song boundary dividers + labels
    const songColors = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#ec4899', '#14b8a6'];
    songBounds.forEach((bound, si) => {
      if (si > 0) {
        const x = (bound.start / allEnergy.length) * w;
        ctx.strokeStyle = 'var(--border)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Song label
      const labelX = ((bound.start + bound.end) / 2 / allEnergy.length) * w;
      ctx.fillStyle = '#6e6e7a';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      const label = bound.title.length > 15 ? bound.title.substring(0, 14) + '\u2026' : bound.title;
      ctx.fillText(label, labelX, 12);

      // Draw bars for this song
      const color = songColors[si % songColors.length];
      for (let i = bound.start; i < bound.end; i++) {
        const x = (i / allEnergy.length) * w;
        const barH = (allEnergy[i] / maxE) * (midY - 16);

        // Top half (mirrored)
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x, midY - barH, barW, barH);
        // Bottom half (mirror)
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x, midY, barW, barH);
      }
    });

    ctx.globalAlpha = 1;

    // Center line
    ctx.strokeStyle = '#2a2a32';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
  }, [allEnergy, songBounds]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || allEnergy.length === 0) return;
    const mx = e.clientX - rect.left;
    const idx = Math.floor((mx / rect.width) * allEnergy.length);
    if (idx < 0 || idx >= allEnergy.length) { setTooltip(null); return; }

    const song = songBounds.find(b => idx >= b.start && idx < b.end);
    const songIdx = song ? idx - song.start : idx;
    const totalSamples = song ? song.end - song.start : allEnergy.length;
    const songObj = songs[songBounds.indexOf(song!)];
    const dur = songObj?.duration || 0;
    const timeSec = dur > 0 ? (songIdx / totalSamples) * dur : 0;
    const timeStr = `${Math.floor(timeSec / 60)}:${String(Math.floor(timeSec % 60)).padStart(2, '0')}`;

    setTooltip({
      x: mx,
      y: e.clientY - rect.top - 40,
      song: song?.title || '',
      time: timeStr,
      energy: allEnergy[idx].toFixed(3),
    });
  };

  if (allEnergy.length === 0) {
    return <div style={{ color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>No energy data available.</div>;
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height, display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x, top: tooltip.y,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '4px 8px',
          fontFamily: 'var(--font-mono)', fontSize: 11,
          pointerEvents: 'none', whiteSpace: 'nowrap',
          boxShadow: 'var(--shadow-md)', transform: 'translateX(-50%)',
        }}>
          <div style={{ color: 'var(--text-primary)' }}>{tooltip.song}</div>
          <div style={{ color: 'var(--text-muted)' }}>
            {tooltip.time} &middot; E: {tooltip.energy}
          </div>
        </div>
      )}
    </div>
  );
}
