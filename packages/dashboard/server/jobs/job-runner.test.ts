import { describe, it, expect } from 'vitest';
import { detectStage } from './job-runner';

describe('detectStage', () => {
  it('detects "Ingesting show..."', () => {
    expect(detectStage('Ingesting show...')).toBe('ingest');
  });

  it('detects "Analyzing audio..."', () => {
    expect(detectStage('Analyzing audio...')).toBe('analyze');
  });

  it('detects "Researching show..."', () => {
    expect(detectStage('Researching show...')).toBe('research');
  });

  it('detects "Generating script..."', () => {
    expect(detectStage('Generating script...')).toBe('script');
  });

  it('detects "Generating assets..."', () => {
    expect(detectStage('Generating assets...')).toBe('generate');
  });

  it('detects "Rendering episode..."', () => {
    expect(detectStage('Rendering episode...')).toBe('render');
  });

  it('extracts custom stage from "stage: custom_stage"', () => {
    expect(detectStage('stage: custom_stage')).toBe('custom_stage');
  });

  it('returns null for unrelated log lines', () => {
    expect(detectStage('random log line')).toBeNull();
  });
});
