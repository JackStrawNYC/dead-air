import { useRef, useEffect, useState, useCallback } from 'react';

interface CostChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  height?: number;
}

const COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#ec4899', '#14b8a6'];

export default function CostChart({ data, height = 200 }: CostChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: number } | null>(null);
  const barsRef = useRef<Array<{ x: number; w: number; label: string; value: number }>>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 10, right: 10, bottom: 40, left: 50 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    const maxVal = Math.max(...data.map(d => d.value), 0.01);
    const barWidth = Math.min(40, (chartW / data.length) * 0.7);
    const gap = (chartW - barWidth * data.length) / (data.length + 1);

    // Y-axis labels + gridlines
    ctx.fillStyle = '#6e6e7a';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = (maxVal * i) / 4;
      const y = padding.top + chartH - (chartH * i) / 4;
      ctx.fillText(`$${val.toFixed(2)}`, padding.left - 6, y + 4);
      ctx.strokeStyle = '#2a2a32';
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }

    // Bars + value labels
    const bars: typeof barsRef.current = [];
    data.forEach((d, i) => {
      const x = padding.left + gap + i * (barWidth + gap);
      const barH = (d.value / maxVal) * chartH;
      const y = padding.top + chartH - barH;

      bars.push({ x, w: barWidth, label: d.label, value: d.value });

      ctx.fillStyle = d.color || COLORS[i % COLORS.length];
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 3);
      ctx.fill();

      // Value label on top of bar
      if (barH > 20) {
        ctx.fillStyle = '#e8e8ec';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`$${d.value.toFixed(2)}`, x + barWidth / 2, y - 4);
      }

      // X-axis label
      ctx.fillStyle = '#6e6e7a';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(x + barWidth / 2, h - 4);
      ctx.rotate(-Math.PI / 6);
      ctx.fillText(d.label.substring(0, 12), 0, 0);
      ctx.restore();
    });

    barsRef.current = bars;
  }, [data, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const hit = barsRef.current.find(b => mx >= b.x && mx <= b.x + b.w);
    if (hit) {
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 40, label: hit.label, value: hit.value });
    } else {
      setTooltip(null);
    }
  };

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
          <span style={{ color: 'var(--text-secondary)' }}>{tooltip.label}</span>
          <span style={{ color: 'var(--amber)', marginLeft: 8 }}>${tooltip.value.toFixed(4)}</span>
        </div>
      )}
    </div>
  );
}
