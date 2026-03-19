const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

interface CalendarHeatmapProps {
  year: number;
  dates: Record<string, number>;
  onDateClick: (date: string) => void;
}

export default function CalendarHeatmap({ year, dates, onDateClick }: CalendarHeatmapProps) {
  const cellSize = 14;
  const gap = 2;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {MONTHS.map((monthName, monthIdx) => {
          const days = daysInMonth(year, monthIdx);
          return (
            <div key={monthIdx} style={{ display: 'flex', alignItems: 'center', gap }}>
              <span style={{
                width: 30, fontSize: 10, color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', flexShrink: 0,
              }}>
                {monthName}
              </span>
              {Array.from({ length: 31 }, (_, dayIdx) => {
                if (dayIdx >= days) {
                  return <div key={dayIdx} style={{ width: cellSize, height: cellSize }} />;
                }
                const d = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(dayIdx + 1).padStart(2, '0')}`;
                const count = dates[d] || 0;
                let bg = 'var(--bg-elevated)';
                if (count >= 10) bg = 'rgba(34,197,94,0.8)';
                else if (count >= 4) bg = 'rgba(34,197,94,0.5)';
                else if (count >= 1) bg = 'rgba(34,197,94,0.25)';

                return (
                  <div
                    key={dayIdx}
                    onClick={() => count > 0 && onDateClick(d)}
                    title={count > 0 ? `${d}: ${count} recording${count !== 1 ? 's' : ''}` : d}
                    style={{
                      width: cellSize, height: cellSize, borderRadius: 2,
                      background: bg,
                      cursor: count > 0 ? 'pointer' : 'default',
                      border: '1px solid var(--border)',
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 10, color: 'var(--text-muted)', alignItems: 'center' }}>
        <span>Less</span>
        {[0, 1, 4, 10].map((n) => (
          <div key={n} style={{
            width: 10, height: 10, borderRadius: 2,
            background: n === 0 ? 'var(--bg-elevated)' : n < 4 ? 'rgba(34,197,94,0.25)' : n < 10 ? 'rgba(34,197,94,0.5)' : 'rgba(34,197,94,0.8)',
            border: '1px solid var(--border)',
          }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
