import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './retry.js';

// Suppress logger output during tests
vi.mock('@dead-air/core', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('retries on timeout errors', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('Request timed out');
        return 'ok';
      },
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('retries on fetch failed errors', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 2) throw new Error('fetch failed');
        return 'recovered';
      },
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(result).toBe('recovered');
    expect(attempts).toBe(2);
  });

  it('retries on ECONNRESET', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 2) throw new Error('ECONNRESET');
        return 'back';
      },
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(result).toBe('back');
  });

  it('retries on HTTP 500 status', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 2) {
          const err = new Error('Internal Server Error') as Error & { status: number };
          err.status = 500;
          throw err;
        }
        return 'fixed';
      },
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(result).toBe('fixed');
  });

  it('retries on HTTP 502 status', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 2) {
          const err = new Error('Bad Gateway') as Error & { status: number };
          err.status = 502;
          throw err;
        }
        return 'fixed';
      },
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(result).toBe('fixed');
  });

  it('does NOT retry on HTTP 400 (non-retriable)', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          const err = new Error('Bad Request') as Error & { status: number };
          err.status = 400;
          throw err;
        },
        { maxAttempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('Bad Request');
    expect(attempts).toBe(1);
  });

  it('does NOT retry on HTTP 429 (non-retriable)', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          const err = new Error('Rate Limited') as Error & { status: number };
          err.status = 429;
          throw err;
        },
        { maxAttempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('Rate Limited');
    expect(attempts).toBe(1);
  });

  it('does NOT retry on generic application errors', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error('Invalid JSON');
        },
        { maxAttempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('Invalid JSON');
    expect(attempts).toBe(1);
  });

  it('throws after exhausting all attempts', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error('connection error');
        },
        { maxAttempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('connection error');
    expect(attempts).toBe(3);
  });

  it('uses exponential backoff delays', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler, ms?: number) => {
      delays.push(ms ?? 0);
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    let attempts = 0;
    await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('socket hang up');
        return 'done';
      },
      { maxAttempts: 3, baseDelayMs: 100 },
    ).catch(() => {});

    // baseDelayMs * 2^(attempt-1): 100, 200
    expect(delays).toEqual([100, 200]);
    vi.restoreAllMocks();
  });

  it('respects maxAttempts = 1 (no retries)', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new Error('timed out');
        },
        { maxAttempts: 1, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('timed out');
    expect(attempts).toBe(1);
  });
});
