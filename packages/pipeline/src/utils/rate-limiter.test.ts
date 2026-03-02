import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from './rate-limiter.js';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('first call resolves immediately', async () => {
    const limiter = createRateLimiter(1000);
    const start = Date.now();
    await limiter();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('delays second call within window', async () => {
    const limiter = createRateLimiter(500);

    await limiter();
    const secondCall = limiter();
    vi.advanceTimersByTime(500);
    await secondCall;

    // Should have waited
    expect(Date.now()).toBeGreaterThanOrEqual(500);
  });

  it('does not delay if enough time has passed', async () => {
    const limiter = createRateLimiter(100);

    await limiter();
    vi.advanceTimersByTime(200); // well past the delay
    const start = Date.now();
    await limiter();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('enforces delay independently per limiter', async () => {
    const limiterA = createRateLimiter(100);
    const limiterB = createRateLimiter(200);

    await limiterA();
    await limiterB();

    const callA = limiterA();
    const callB = limiterB();

    vi.advanceTimersByTime(100);
    await callA; // A should resolve at 100ms

    vi.advanceTimersByTime(100);
    await callB; // B should resolve at 200ms
  });
});
