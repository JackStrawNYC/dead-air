import { describe, it, expect } from 'vitest';
import { envSchema } from './env.js';

describe('envSchema', () => {
  it('parses empty env with all defaults', () => {
    const result = envSchema.parse({});
    expect(result.DATABASE_PATH).toBe('./data/dead-air.db');
    expect(result.DATA_DIR).toBe('./data');
    expect(result.ASSETS_DIR).toBe('./data/assets');
    expect(result.RENDER_OUTPUT_DIR).toBe('./data/renders');
    expect(result.REMOTION_CONCURRENCY).toBe(1);
    expect(result.REMOTION_AWS_REGION).toBe('us-east-1');
    expect(result.NODE_ENV).toBe('development');
    expect(result.LOG_LEVEL).toBe('info');
  });

  it('accepts valid NODE_ENV values', () => {
    expect(envSchema.parse({ NODE_ENV: 'production' }).NODE_ENV).toBe('production');
    expect(envSchema.parse({ NODE_ENV: 'test' }).NODE_ENV).toBe('test');
    expect(envSchema.parse({ NODE_ENV: 'development' }).NODE_ENV).toBe('development');
  });

  it('rejects invalid NODE_ENV', () => {
    const result = envSchema.safeParse({ NODE_ENV: 'staging' });
    expect(result.success).toBe(false);
  });

  it('accepts valid LOG_LEVEL values', () => {
    for (const level of ['debug', 'info', 'warn', 'error']) {
      expect(envSchema.parse({ LOG_LEVEL: level }).LOG_LEVEL).toBe(level);
    }
  });

  it('rejects invalid LOG_LEVEL', () => {
    const result = envSchema.safeParse({ LOG_LEVEL: 'trace' });
    expect(result.success).toBe(false);
  });

  it('coerces REMOTION_CONCURRENCY to integer', () => {
    expect(envSchema.parse({ REMOTION_CONCURRENCY: '4' }).REMOTION_CONCURRENCY).toBe(4);
  });

  it('rejects REMOTION_CONCURRENCY < 1', () => {
    const result = envSchema.safeParse({ REMOTION_CONCURRENCY: '0' });
    expect(result.success).toBe(false);
  });

  it('passes through optional API keys when provided', () => {
    const result = envSchema.parse({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      REPLICATE_API_TOKEN: 'r8_test-token',
      FLICKR_API_KEY: 'flickr-key-123',
    });
    expect(result.ANTHROPIC_API_KEY).toBe('sk-ant-test-key');
    expect(result.REPLICATE_API_TOKEN).toBe('r8_test-token');
    expect(result.FLICKR_API_KEY).toBe('flickr-key-123');
  });

  it('leaves optional API keys undefined when omitted', () => {
    const result = envSchema.parse({});
    expect(result.ANTHROPIC_API_KEY).toBeUndefined();
    expect(result.OPENAI_API_KEY).toBeUndefined();
    expect(result.ELEVENLABS_API_KEY).toBeUndefined();
    expect(result.YOUTUBE_CLIENT_ID).toBeUndefined();
  });

  it('overrides default paths', () => {
    const result = envSchema.parse({
      DATABASE_PATH: '/custom/db.sqlite',
      DATA_DIR: '/custom/data',
    });
    expect(result.DATABASE_PATH).toBe('/custom/db.sqlite');
    expect(result.DATA_DIR).toBe('/custom/data');
  });
});
