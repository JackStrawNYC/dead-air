import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, setLogLevel } from './logger.js';

describe('logger', () => {
  beforeEach(() => {
    setLogLevel('info'); // reset to default
    vi.restoreAllMocks();
  });

  it('creates a logger with all four methods', () => {
    const log = createLogger('test');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('logs info messages at info level', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = createLogger('test-tag');
    log.info('hello world');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('[INFO]');
    expect(spy.mock.calls[0][0]).toContain('[test-tag]');
    expect(spy.mock.calls[0][0]).toContain('hello world');
  });

  it('suppresses debug messages at info level', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const log = createLogger('test');
    log.debug('should not appear');
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows debug messages at debug level', () => {
    setLogLevel('debug');
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const log = createLogger('test');
    log.debug('should appear');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('suppresses info and warn at error level', () => {
    setLogLevel('error');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogger('test');

    log.info('nope');
    log.warn('nope');
    log.error('yes');

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('includes JSON data when provided', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = createLogger('test');
    log.info('with data', { count: 42 });
    expect(spy.mock.calls[0][0]).toContain('{"count":42}');
  });

  it('includes ISO timestamp', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = createLogger('test');
    log.info('timestamped');
    // ISO format: 2024-01-15T...
    expect(spy.mock.calls[0][0]).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
  });
});
