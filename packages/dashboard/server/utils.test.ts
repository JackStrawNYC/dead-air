import { describe, it, expect } from 'vitest';
import { safeJsonParse, sanitizeParam } from './utils';

describe('safeJsonParse', () => {
  it('parses valid JSON string', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', 'fallback')).toBe('fallback');
  });

  it('returns fallback for null', () => {
    expect(safeJsonParse(null, 'default')).toBe('default');
  });

  it('returns fallback for undefined', () => {
    expect(safeJsonParse(undefined, 42)).toBe(42);
  });

  it('parses nested objects', () => {
    const input = '{"a":{"b":{"c":3}}}';
    expect(safeJsonParse(input, {})).toEqual({ a: { b: { c: 3 } } });
  });

  it('parses arrays', () => {
    expect(safeJsonParse('[1,2,3]', [])).toEqual([1, 2, 3]);
  });
});

describe('sanitizeParam', () => {
  it('allows valid alphanumeric-dash strings', () => {
    expect(sanitizeParam('abc-123')).toBe('abc-123');
  });

  it('allows episode-style IDs', () => {
    expect(sanitizeParam('ep-2024-01-01')).toBe('ep-2024-01-01');
  });

  it('allows underscores', () => {
    expect(sanitizeParam('some_id')).toBe('some_id');
  });

  it('throws on ".."', () => {
    expect(() => sanitizeParam('..')).toThrow();
  });

  it('throws on "/"', () => {
    expect(() => sanitizeParam('a/b')).toThrow();
  });

  it('throws on backslash', () => {
    expect(() => sanitizeParam('a\\b')).toThrow();
  });

  it('throws on special chars', () => {
    expect(() => sanitizeParam('a@b')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => sanitizeParam('')).toThrow();
  });

  it('thrown error has status 400', () => {
    try {
      sanitizeParam('..');
    } catch (err: unknown) {
      expect((err as { status: number }).status).toBe(400);
    }
  });
});
