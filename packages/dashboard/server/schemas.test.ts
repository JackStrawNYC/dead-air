import { describe, it, expect } from 'vitest';
import {
  PipelineRunBody,
  ShowIngestBody,
  VisualizerRenderBody,
  SetlistBody,
  ChaptersBody,
  OverlayScheduleBody,
  SongIdentitiesBody,
  ArchiveIngestBody,
  validateBody,
} from './schemas';

describe('validateBody helper', () => {
  it('returns success with parsed data on valid input', () => {
    const result = validateBody(PipelineRunBody, { from: 'analyze' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.from).toBe('analyze');
  });

  it('returns error string on invalid input', () => {
    const result = validateBody(PipelineRunBody, { force: 'yes' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('force');
  });
});

describe('PipelineRunBody', () => {
  it('accepts empty body (all optional)', () => {
    const result = PipelineRunBody.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid from/to/force', () => {
    const result = PipelineRunBody.safeParse({ from: 'analyze', to: 'render', force: true });
    expect(result.success).toBe(true);
  });

  it('rejects non-boolean force', () => {
    const result = PipelineRunBody.safeParse({ force: 'yes' });
    expect(result.success).toBe(false);
  });
});

describe('ShowIngestBody', () => {
  it('accepts valid date', () => {
    const result = ShowIngestBody.safeParse({ date: '2024-01-01' });
    expect(result.success).toBe(true);
  });

  it('rejects bad date format', () => {
    const result = ShowIngestBody.safeParse({ date: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects missing date', () => {
    const result = ShowIngestBody.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('ArchiveIngestBody', () => {
  it('accepts date with optional identifier', () => {
    const result = ArchiveIngestBody.safeParse({ date: '1977-05-08', identifier: 'gd77-05-08' });
    expect(result.success).toBe(true);
  });

  it('rejects missing date', () => {
    const result = ArchiveIngestBody.safeParse({ identifier: 'foo' });
    expect(result.success).toBe(false);
  });
});

describe('VisualizerRenderBody', () => {
  it('accepts empty body (all optional)', () => {
    const result = VisualizerRenderBody.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid preset and seed', () => {
    const result = VisualizerRenderBody.safeParse({ preset: '4k', seed: 42 });
    expect(result.success).toBe(true);
  });

  it('rejects concurrency > 16', () => {
    const result = VisualizerRenderBody.safeParse({ concurrency: 20 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid gl value', () => {
    const result = VisualizerRenderBody.safeParse({ gl: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts valid gl enum', () => {
    const result = VisualizerRenderBody.safeParse({ gl: 'angle' });
    expect(result.success).toBe(true);
  });
});

describe('SetlistBody', () => {
  it('accepts songs array', () => {
    const result = SetlistBody.safeParse({ songs: [] });
    expect(result.success).toBe(true);
  });

  it('rejects missing songs', () => {
    const result = SetlistBody.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects non-array songs', () => {
    const result = SetlistBody.safeParse({ songs: 'not array' });
    expect(result.success).toBe(false);
  });
});

describe('ChaptersBody', () => {
  it('accepts chapters array', () => {
    const result = ChaptersBody.safeParse({ chapters: [{ name: 'Set 1' }] });
    expect(result.success).toBe(true);
  });

  it('rejects missing chapters', () => {
    const result = ChaptersBody.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('OverlayScheduleBody', () => {
  it('accepts songs record', () => {
    const result = OverlayScheduleBody.safeParse({ songs: { fire: [1, 2, 3] } });
    expect(result.success).toBe(true);
  });

  it('rejects missing songs', () => {
    const result = OverlayScheduleBody.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('SongIdentitiesBody', () => {
  it('accepts valid song identity with palette', () => {
    const result = SongIdentitiesBody.safeParse({
      fire: { palette: { primary: 200 } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-numeric palette primary', () => {
    const result = SongIdentitiesBody.safeParse({
      fire: { palette: { primary: 'red' } },
    });
    expect(result.success).toBe(false);
  });

  it('accepts song with modes and energy', () => {
    const result = SongIdentitiesBody.safeParse({
      'dark-star': { modes: ['feedback', 'cosmic'], energy: 'high' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid energy value', () => {
    const result = SongIdentitiesBody.safeParse({
      fire: { energy: 'extreme' },
    });
    expect(result.success).toBe(false);
  });
});
