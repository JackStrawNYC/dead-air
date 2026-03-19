interface Step {
  label: string;
  key: string;
}

interface WizardStepIndicatorProps {
  steps: Step[];
  currentStep: string;
  completedSteps: string[];
}

export default function WizardStepIndicator({ steps, currentStep, completedSteps }: WizardStepIndicatorProps) {
  const currentIdx = steps.findIndex(s => s.key === currentStep);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      padding: '16px 0',
      overflowX: 'auto',
    }}>
      {steps.map((step, i) => {
        const isCompleted = completedSteps.includes(step.key);
        const isCurrent = step.key === currentStep;
        const isPast = i < currentIdx;

        let circleColor = 'var(--bg-elevated)';
        let circleBorder = 'var(--border)';
        let textColor = 'var(--text-muted)';
        let numberColor = 'var(--text-muted)';

        if (isCompleted || isPast) {
          circleColor = 'var(--green)';
          circleBorder = 'var(--green)';
          textColor = 'var(--green)';
          numberColor = '#fff';
        } else if (isCurrent) {
          circleColor = 'var(--blue)';
          circleBorder = 'var(--blue)';
          textColor = 'var(--blue)';
          numberColor = '#fff';
        }

        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: circleColor,
                border: `2px solid ${circleBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: numberColor,
                fontFamily: 'var(--font-mono)',
              }}>
                {isCompleted ? '\u2713' : i + 1}
              </div>
              <span style={{
                fontSize: 10,
                color: textColor,
                marginTop: 4,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: isCurrent ? 700 : 400,
                whiteSpace: 'nowrap',
              }}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                width: 40,
                height: 2,
                background: isPast || isCompleted ? 'var(--green)' : 'var(--border)',
                margin: '0 4px',
                marginBottom: 16,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
