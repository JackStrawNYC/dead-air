interface StageButtonProps {
  stage: string;
  current: string | null;
  completed: string[];
  disabled?: boolean;
  onClick: (stage: string) => void;
}

const STAGE_LABELS: Record<string, string> = {
  ingest: 'Ingest',
  analyze: 'Analyze',
  research: 'Research',
  script: 'Script',
  generate: 'Generate',
  render: 'Render',
};

export default function StageButton({ stage, current, completed, disabled, onClick }: StageButtonProps) {
  const isActive = current === stage;
  const isDone = completed.includes(stage);

  let bg = 'var(--bg-elevated)';
  let color = 'var(--text-muted)';
  let border = 'var(--border)';

  if (isActive) {
    bg = 'var(--blue-dim)';
    color = 'var(--blue)';
    border = 'var(--blue)';
  } else if (isDone) {
    bg = 'var(--green-dim)';
    color = 'var(--green)';
    border = 'var(--green)';
  }

  return (
    <button
      onClick={() => onClick(stage)}
      disabled={disabled}
      style={{
        background: bg,
        color,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius)',
        padding: '8px 16px',
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        minWidth: 90,
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {isActive && <span className="pulse-dot" />}
      {isDone ? '\u2713 ' : ''}{STAGE_LABELS[stage] || stage}
    </button>
  );
}
