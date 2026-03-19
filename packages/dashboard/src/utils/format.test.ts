import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatBytes, formatSecondsToTime, formatElapsed, relativeTime } from './format';

describe('formatBytes', () => {
  it('returns "0 B" for 0', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats exact KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  it('formats fractional KB', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats exact MB', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });

  it('formats exact GB', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });

  it('formats small byte values', () => {
    expect(formatBytes(500)).toBe('500.0 B');
  });
});

describe('formatSecondsToTime', () => {
  it('formats 90 seconds as 1:30', () => {
    expect(formatSecondsToTime('90')).toBe('1:30');
  });

  it('formats 0 seconds as 0:00', () => {
    expect(formatSecondsToTime('0')).toBe('0:00');
  });

  it('returns --:-- for undefined', () => {
    expect(formatSecondsToTime(undefined)).toBe('--:--');
  });

  it('returns --:-- for non-numeric string', () => {
    expect(formatSecondsToTime('abc')).toBe('--:--');
  });

  it('formats large values (3661s = 61:01)', () => {
    expect(formatSecondsToTime('3661')).toBe('61:01');
  });
});

describe('formatElapsed', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats recent time as seconds', () => {
    vi.useFakeTimers();
    const start = new Date().toISOString();
    vi.advanceTimersByTime(5000);
    expect(formatElapsed(start)).toBe('5s');
  });

  it('formats 90 seconds as 1m 30s', () => {
    vi.useFakeTimers();
    const start = new Date().toISOString();
    vi.advanceTimersByTime(90000);
    expect(formatElapsed(start)).toBe('1m 30s');
  });

  it('uses end date when provided', () => {
    const start = '2024-01-01T00:00:00.000Z';
    const end = '2024-01-01T00:01:30.000Z';
    expect(formatElapsed(start, end)).toBe('1m 30s');
  });
});

describe('relativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats seconds ago', () => {
    vi.useFakeTimers();
    const date = new Date().toISOString();
    vi.advanceTimersByTime(30000);
    expect(relativeTime(date)).toBe('30s ago');
  });

  it('formats minutes ago', () => {
    vi.useFakeTimers();
    const date = new Date().toISOString();
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(relativeTime(date)).toBe('5m ago');
  });

  it('formats hours ago', () => {
    vi.useFakeTimers();
    const date = new Date().toISOString();
    vi.advanceTimersByTime(3 * 60 * 60 * 1000);
    expect(relativeTime(date)).toBe('3h ago');
  });

  it('formats days ago', () => {
    vi.useFakeTimers();
    const date = new Date().toISOString();
    vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
    expect(relativeTime(date)).toBe('2d ago');
  });
});
