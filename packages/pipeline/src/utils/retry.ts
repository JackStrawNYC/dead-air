import { createLogger } from '@dead-air/core';

const log = createLogger('utils:retry');

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  label?: string;
}

function isRetriableError(err: unknown): boolean {
  const message = ((err as Error).message ?? '').toLowerCase();
  if (
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('socket hang up') ||
    message.includes('connection error') ||
    message.includes('network error') ||
    message.includes('econnrefused')
  ) {
    return true;
  }

  // HTTP 5xx from API wrapper errors
  const status = (err as { status?: number }).status;
  if (typeof status === 'number' && status >= 500 && status < 600) {
    return true;
  }

  return false;
}

/**
 * Retry a function with exponential backoff on retriable errors.
 * Only retries network/timeout errors — API errors (400, 429) are thrown immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 2000, label = 'operation' } = opts;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts || !isRetriableError(err)) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      log.warn(
        `[${label}] Attempt ${attempt}/${maxAttempts} failed: ${(err as Error).message}. Retrying in ${delay}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error(`[${label}] withRetry exhausted all attempts`);
}
