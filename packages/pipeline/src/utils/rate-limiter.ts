/**
 * Simple delay-based rate limiter.
 * Ensures minimum delay between consecutive calls.
 */
export function createRateLimiter(minDelayMs: number) {
  let lastCall = 0;

  return async function rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastCall;
    if (elapsed < minDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, minDelayMs - elapsed));
    }
    lastCall = Date.now();
  };
}
