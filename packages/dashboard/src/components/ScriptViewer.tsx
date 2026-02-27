interface ScriptSegment {
  type?: string;
  textLines?: Array<{ text: string; style?: string }>;
  colorPalette?: string[];
  mood?: string;
  narration?: string;
}

interface ScriptData {
  intro?: { narration?: string };
  setBreak?: { narration?: string };
  outro?: { narration?: string };
  segments?: ScriptSegment[];
}

interface ScriptViewerProps {
  data: ScriptData;
}

const TYPE_COLORS: Record<string, string> = {
  song: 'var(--blue)',
  chapter: 'var(--amber)',
  interstitial: 'var(--purple)',
  transition: 'var(--green)',
  overlay: 'var(--red)',
};

export default function ScriptViewer({ data }: ScriptViewerProps) {
  return (
    <div>
      {/* Intro */}
      {data.intro?.narration && (
        <div style={{
          borderLeft: '3px solid var(--amber)', paddingLeft: 16,
          marginBottom: 20, color: 'var(--text-secondary)',
          fontStyle: 'italic', fontSize: 14, lineHeight: 1.7,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4, fontStyle: 'normal' }}>
            Intro
          </div>
          {data.intro.narration}
        </div>
      )}

      {/* Segments */}
      {data.segments?.map((seg, i) => (
        <div
          key={i}
          style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '12px 16px',
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              #{i + 1}
            </span>
            {seg.type && (
              <span className="badge" style={{
                background: 'var(--bg-base)',
                color: TYPE_COLORS[seg.type] || 'var(--text-muted)',
              }}>
                {seg.type}
              </span>
            )}
            {seg.mood && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                {seg.mood}
              </span>
            )}
            {seg.colorPalette && seg.colorPalette.length > 0 && (
              <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                {seg.colorPalette.map((c, ci) => (
                  <div
                    key={ci}
                    style={{
                      width: 14, height: 14, borderRadius: 3,
                      background: c, border: '1px solid rgba(255,255,255,0.1)',
                    }}
                    title={c}
                  />
                ))}
              </div>
            )}
          </div>

          {seg.narration && (
            <div style={{
              borderLeft: '2px solid var(--border)', paddingLeft: 12,
              color: 'var(--text-secondary)', fontStyle: 'italic',
              fontSize: 13, lineHeight: 1.6, marginBottom: 8,
            }}>
              {seg.narration}
            </div>
          )}

          {seg.textLines && seg.textLines.length > 0 && (
            <div>
              {seg.textLines.map((line, li) => (
                <p
                  key={li}
                  style={{
                    fontSize: 13, lineHeight: 1.6,
                    color: line.style === 'bold' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: line.style === 'bold' ? 600 : 400,
                    fontStyle: line.style === 'italic' ? 'italic' : 'normal',
                    marginBottom: 4,
                  }}
                >
                  {line.text}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Set break */}
      {data.setBreak?.narration && (
        <div style={{
          borderLeft: '3px solid var(--purple)', paddingLeft: 16,
          margin: '20px 0', color: 'var(--text-secondary)',
          fontStyle: 'italic', fontSize: 14, lineHeight: 1.7,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4, fontStyle: 'normal' }}>
            Set Break
          </div>
          {data.setBreak.narration}
        </div>
      )}

      {/* Outro */}
      {data.outro?.narration && (
        <div style={{
          borderLeft: '3px solid var(--green)', paddingLeft: 16,
          marginTop: 20, color: 'var(--text-secondary)',
          fontStyle: 'italic', fontSize: 14, lineHeight: 1.7,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4, fontStyle: 'normal' }}>
            Outro
          </div>
          {data.outro.narration}
        </div>
      )}
    </div>
  );
}
