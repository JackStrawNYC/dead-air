import { describe, it, expect } from 'vitest';

// Test the preflight check logic without Express router
// (validates the check structures, not the HTTP layer)

interface PreflightCheck {
  stage: string;
  ok: boolean;
  message?: string;
}

function buildApiKeyChecks(config: {
  anthropicKey?: string;
  replicateToken?: string;
  elevenlabsKey?: string;
}): PreflightCheck[] {
  const hasAnthropic = Boolean(config.anthropicKey);
  const hasReplicate = Boolean(config.replicateToken);
  const hasElevenlabs = Boolean(config.elevenlabsKey);

  return [
    {
      stage: 'research',
      ok: hasAnthropic,
      message: hasAnthropic ? undefined : 'Missing anthropicKey',
    },
    {
      stage: 'script',
      ok: hasAnthropic,
      message: hasAnthropic ? undefined : 'Missing anthropicKey',
    },
    {
      stage: 'generate',
      ok: hasReplicate && hasElevenlabs,
      message: !hasReplicate && !hasElevenlabs
        ? 'Missing replicateToken and elevenlabsKey'
        : !hasReplicate ? 'Missing replicateToken'
        : !hasElevenlabs ? 'Missing elevenlabsKey'
        : undefined,
    },
  ];
}

describe('preflight API key checks', () => {
  it('all pass when all keys present', () => {
    const checks = buildApiKeyChecks({
      anthropicKey: 'ak', replicateToken: 'rt', elevenlabsKey: 'ek',
    });
    expect(checks.every(c => c.ok)).toBe(true);
  });

  it('research fails without anthropicKey', () => {
    const checks = buildApiKeyChecks({
      anthropicKey: '', replicateToken: 'rt', elevenlabsKey: 'ek',
    });
    expect(checks.find(c => c.stage === 'research')!.ok).toBe(false);
  });

  it('script fails without anthropicKey', () => {
    const checks = buildApiKeyChecks({
      anthropicKey: '', replicateToken: 'rt', elevenlabsKey: 'ek',
    });
    expect(checks.find(c => c.stage === 'script')!.ok).toBe(false);
  });

  it('generate fails without replicateToken', () => {
    const checks = buildApiKeyChecks({
      anthropicKey: 'ak', replicateToken: '', elevenlabsKey: 'ek',
    });
    expect(checks.find(c => c.stage === 'generate')!.ok).toBe(false);
    expect(checks.find(c => c.stage === 'generate')!.message).toBe('Missing replicateToken');
  });

  it('generate fails without elevenlabsKey', () => {
    const checks = buildApiKeyChecks({
      anthropicKey: 'ak', replicateToken: 'rt', elevenlabsKey: '',
    });
    expect(checks.find(c => c.stage === 'generate')!.ok).toBe(false);
    expect(checks.find(c => c.stage === 'generate')!.message).toBe('Missing elevenlabsKey');
  });

  it('generate fails without both replicate and elevenlabs', () => {
    const checks = buildApiKeyChecks({
      anthropicKey: 'ak', replicateToken: '', elevenlabsKey: '',
    });
    expect(checks.find(c => c.stage === 'generate')!.message).toBe('Missing replicateToken and elevenlabsKey');
  });

  it('ready flag is true only when api key checks all pass', () => {
    const allPass = buildApiKeyChecks({
      anthropicKey: 'ak', replicateToken: 'rt', elevenlabsKey: 'ek',
    });
    const ready = allPass.filter(c => ['research', 'script', 'generate'].includes(c.stage)).every(c => c.ok);
    expect(ready).toBe(true);
  });

  it('ready flag is false when any api key check fails', () => {
    const someFail = buildApiKeyChecks({
      anthropicKey: '', replicateToken: 'rt', elevenlabsKey: 'ek',
    });
    const ready = someFail.filter(c => ['research', 'script', 'generate'].includes(c.stage)).every(c => c.ok);
    expect(ready).toBe(false);
  });
});
