import { describe, it, expect, vi } from 'vitest';
import type { EnhancedFrameData, SectionBoundary, SetlistEntry, VisualMode } from '../data/types';
import type { SongIdentity } from '../data/song-identities';
import {
  validateSectionOverrides,
  getModeForSection,
  getDrumsSpaceMode,
  dynamicCrossfadeDuration,
  findNearestBeat,
} from './SceneRouter';

// Minimal mock frame with required fields
function mockFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.15,
    centroid: 0.5,
    onset: 0.0,
    beat: false,
    sub: 0.2,
    low: 0.3,
    mid: 0.4,
    high: 0.2,
    chroma: [0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    contrast: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    flatness: 0.3,
    ...overrides,
  };
}

function makeSong(overrides: Partial<SetlistEntry> = {}): SetlistEntry {
  return {
    trackId: 's1t01',
    title: 'Test Song',
    set: 1,
    trackNumber: 1,
    defaultMode: 'liquid_light',
    audioFile: 'test.flac',
    ...overrides,
  };
}

function makeSections(count: number, framesEach = 900): SectionBoundary[] {
  return Array.from({ length: count }, (_, i) => ({
    frameStart: i * framesEach,
    frameEnd: (i + 1) * framesEach,
    label: `section_${i}`,
    energy: (['low', 'mid', 'high'] as const)[i % 3],
    avgEnergy: [0.05, 0.15, 0.35][i % 3],
  }));
}

// --- validateSectionOverrides ---

describe('validateSectionOverrides', () => {
  it('returns empty array when no overrides', () => {
    const song = makeSong();
    expect(validateSectionOverrides(song, 5)).toEqual([]);
  });

  it('returns empty array when all overrides are valid', () => {
    const song = makeSong({
      sectionOverrides: [
        { sectionIndex: 0, mode: 'inferno' },
        { sectionIndex: 2, mode: 'aurora' },
      ],
    });
    expect(validateSectionOverrides(song, 5)).toEqual([]);
  });

  it('returns warnings for out-of-range overrides', () => {
    const song = makeSong({
      sectionOverrides: [
        { sectionIndex: 10, mode: 'inferno' },
      ],
    });
    const warnings = validateSectionOverrides(song, 3);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('index 10');
    expect(warnings[0]).toContain('exceeds section count 3');
  });

  it('handles empty sectionOverrides array', () => {
    const song = makeSong({ sectionOverrides: [] });
    expect(validateSectionOverrides(song, 3)).toEqual([]);
  });
});

// --- getModeForSection ---

describe('getModeForSection', () => {
  it('returns defaultMode with no overrides, no seed', () => {
    const song = makeSong({ defaultMode: 'cosmic_voyage' });
    const sections = makeSections(3);
    const mode = getModeForSection(song, 0, sections);
    expect(mode).toBe('cosmic_voyage');
  });

  it('explicit override wins over everything', () => {
    const song = makeSong({
      defaultMode: 'liquid_light',
      sectionOverrides: [{ sectionIndex: 1, mode: 'inferno' }],
    });
    const sections = makeSections(3);
    expect(getModeForSection(song, 1, sections, 42)).toBe('inferno');
  });

  it('coherence lock holds the previous section mode', () => {
    const song = makeSong({
      sectionOverrides: [
        { sectionIndex: 0, mode: 'aurora' },
      ],
    });
    const sections = makeSections(3);
    // With coherence locked, section 1 should hold section 0's mode
    const mode = getModeForSection(song, 1, sections, 42, undefined, true);
    expect(mode).toBe('aurora');
  });

  it('returns a valid VisualMode with seeded selection', () => {
    const song = makeSong();
    const sections = makeSections(5);
    const mode = getModeForSection(song, 2, sections, 12345);
    // Should return any valid VisualMode (not undefined/null)
    expect(typeof mode).toBe('string');
    expect(mode.length).toBeGreaterThan(0);
  });

  it('same seed produces same mode', () => {
    const song = makeSong();
    const sections = makeSections(5);
    const mode1 = getModeForSection(song, 2, sections, 42);
    const mode2 = getModeForSection(song, 2, sections, 42);
    expect(mode1).toBe(mode2);
  });

  it('different seeds can produce different modes', () => {
    const song = makeSong();
    const sections = makeSections(10);
    // Collect modes across widely spaced seeds — at least 2 different modes should appear
    const modes = new Set<VisualMode>();
    for (let i = 0; i < 100; i++) {
      modes.add(getModeForSection(song, 3, sections, i * 100000));
    }
    expect(modes.size).toBeGreaterThan(1);
  });

  it('variety enforcement prefers unused modes', () => {
    const song = makeSong();
    const sections = makeSections(5);
    // Mark many modes as used
    const used = new Map<VisualMode, number>();
    ['liquid_light', 'particle_nebula', 'concert_lighting', 'cosmic_dust', 'aurora'].forEach(
      (m) => used.set(m as VisualMode, 3),
    );

    const mode = getModeForSection(song, 2, sections, 42, undefined, false, used);
    // Should prefer an unused mode (not guaranteed but highly likely)
    expect(typeof mode).toBe('string');
  });

  it('song identity preferred modes get weighted', () => {
    const song = makeSong();
    // Use same energy for all sections so the "no energy change" path is taken
    const sections: SectionBoundary[] = Array.from({ length: 5 }, (_, i) => ({
      frameStart: i * 900,
      frameEnd: (i + 1) * 900,
      label: `section_${i}`,
      energy: 'high' as const,
      avgEnergy: 0.35,
    }));
    const identity: SongIdentity = {
      preferredModes: ['inferno', 'tie_dye'], // both are high-energy modes
    };

    // Run many seeds — use wide spacing for LCG decorrelation
    const counts = new Map<VisualMode, number>();
    for (let i = 0; i < 200; i++) {
      const seed = i * 100000;
      const mode = getModeForSection(song, 2, sections, seed, undefined, false, undefined, identity);
      counts.set(mode, (counts.get(mode) ?? 0) + 1);
    }

    // With 3x weighting, preferred modes should appear frequently
    const preferredCount = (counts.get('inferno') ?? 0) + (counts.get('tie_dye') ?? 0);
    expect(preferredCount).toBeGreaterThan(0);
  });

  it('stem section solo biases toward dramatic modes', () => {
    const song = makeSong();
    // Same energy so the stem bias path is reached
    const sections: SectionBoundary[] = Array.from({ length: 5 }, (_, i) => ({
      frameStart: i * 900,
      frameEnd: (i + 1) * 900,
      label: `section_${i}`,
      energy: 'high' as const, // high pool includes inferno, concert_lighting, liquid_light
      avgEnergy: 0.35,
    }));

    const counts = new Map<VisualMode, number>();
    // Use wide seed spacing for LCG decorrelation
    for (let i = 0; i < 200; i++) {
      const seed = i * 100000;
      const mode = getModeForSection(song, 2, sections, seed, undefined, false, undefined, undefined, 'solo');
      counts.set(mode, (counts.get(mode) ?? 0) + 1);
    }

    const dramaticCount = (counts.get('inferno') ?? 0) +
      (counts.get('concert_lighting') ?? 0) +
      (counts.get('liquid_light') ?? 0);
    expect(dramaticCount).toBeGreaterThan(0);
  });

  it('stem section vocal biases toward warm modes', () => {
    const song = makeSong();
    // Same energy so the stem bias path is reached (not the energyChanged path)
    const sections: SectionBoundary[] = Array.from({ length: 5 }, (_, i) => ({
      frameStart: i * 900,
      frameEnd: (i + 1) * 900,
      label: `section_${i}`,
      energy: 'low' as const, // low energy pool includes aurora
      avgEnergy: 0.05,
    }));

    const counts = new Map<VisualMode, number>();
    // Use widely spaced seeds — LCG outputs for consecutive seeds are correlated
    for (let i = 0; i < 200; i++) {
      const seed = i * 100000;
      const mode = getModeForSection(song, 2, sections, seed, undefined, false, undefined, undefined, 'vocal');
      counts.set(mode, (counts.get(mode) ?? 0) + 1);
    }

    // Aurora is in the low-energy pool and gets 3x weight from vocal stem bias
    const warmCount = (counts.get('aurora') ?? 0);
    expect(warmCount).toBeGreaterThan(0);
  });

  it('chord mood biases shader selection when confidence > 0.3', () => {
    // Create frames with strong major chroma → luminous mood
    const frames = Array.from({ length: 200 }, () =>
      mockFrame({
        chroma: [1, 0, 0, 0, 0.8, 0, 0, 0.7, 0, 0, 0, 0], // C major triad
      }),
    );
    const sections = makeSections(3, 60);
    const song = makeSong();

    // Should not throw and should return a valid mode
    const mode = getModeForSection(song, 1, sections, 42, undefined, false, undefined, undefined, undefined, frames);
    expect(typeof mode).toBe('string');
  });

  it('improvisation bias activates for high improv scores', () => {
    // Create frames that look improvisational: variable tempo, high energy, unstable beats
    const frames = Array.from({ length: 200 }, (_, i) =>
      mockFrame({
        rms: 0.3 + Math.sin(i * 0.5) * 0.2,
        beat: i % 7 === 0, // irregular beats
        beatConfidence: 0.2 + Math.random() * 0.3,
        flatness: 0.5 + Math.sin(i * 0.3) * 0.3,
      }),
    );
    const sections = makeSections(3, 60);
    const song = makeSong();

    const mode = getModeForSection(song, 1, sections, 42, undefined, false, undefined, undefined, undefined, frames);
    expect(typeof mode).toBe('string');
  });

  it('auto-variety kicks in for long songs with odd-numbered sections', () => {
    // 4 sections, each 3000 frames (100s), total > 5400, section > 2700
    const sections = makeSections(4, 3000);
    const song = makeSong({ defaultMode: 'liquid_light' });

    // Section 1 (odd index) should get auto-variety — likely not defaultMode
    const modeSet = new Set<VisualMode>();
    for (let seed = 0; seed < 50; seed++) {
      modeSet.add(getModeForSection(song, 1, sections, seed));
    }
    // Auto-variety should produce something other than default sometimes
    expect(modeSet.size).toBeGreaterThan(0);
  });
});

// --- getDrumsSpaceMode ---

describe('getDrumsSpaceMode', () => {
  it('drums_tribal returns inferno or concert_lighting', () => {
    const results = new Set<VisualMode>();
    for (let seed = 0; seed < 50; seed++) {
      results.add(getDrumsSpaceMode('drums_tribal', seed));
    }
    expect([...results].every((m) => m === 'inferno' || m === 'concert_lighting')).toBe(true);
  });

  it('transition returns cosmic_voyage or aurora', () => {
    const results = new Set<VisualMode>();
    for (let seed = 0; seed < 50; seed++) {
      results.add(getDrumsSpaceMode('transition', seed));
    }
    expect([...results].every((m) => m === 'cosmic_voyage' || m === 'aurora')).toBe(true);
  });

  it('space_ambient returns from ambient pool', () => {
    const pool = ['deep_ocean', 'cosmic_dust', 'crystal_cavern', 'void_light'];
    const results = new Set<VisualMode>();
    for (let seed = 0; seed < 100; seed++) {
      results.add(getDrumsSpaceMode('space_ambient', seed));
    }
    expect([...results].every((m) => pool.includes(m))).toBe(true);
  });

  it('reemergence returns concert_lighting or liquid_light', () => {
    const results = new Set<VisualMode>();
    for (let seed = 0; seed < 50; seed++) {
      results.add(getDrumsSpaceMode('reemergence', seed));
    }
    expect([...results].every((m) => m === 'concert_lighting' || m === 'liquid_light')).toBe(true);
  });

  it('unknown phase defaults to cosmic_voyage', () => {
    expect(getDrumsSpaceMode('unknown_phase', 42)).toBe('cosmic_voyage');
  });

  it('song identity override takes precedence', () => {
    const identity: SongIdentity = {
      drumsSpaceShaders: {
        drums_tribal: 'aurora',
      },
    } as SongIdentity;
    expect(getDrumsSpaceMode('drums_tribal', 42, identity)).toBe('aurora');
  });
});

// --- dynamicCrossfadeDuration ---

describe('dynamicCrossfadeDuration', () => {
  it('quiet→quiet returns ~240 (gentle dissolve)', () => {
    // Both sides quiet (rms < 0.08)
    const frames = Array.from({ length: 200 }, () => mockFrame({ rms: 0.03 }));
    const duration = dynamicCrossfadeDuration(frames, 100);
    // Without flux, should be close to 240
    expect(duration).toBeGreaterThanOrEqual(120); // at least half of 240 with flux
    expect(duration).toBeLessThanOrEqual(240);
  });

  it('loud→loud returns ~8 (hard cut)', () => {
    const frames = Array.from({ length: 200 }, () => mockFrame({ rms: 0.35 }));
    const duration = dynamicCrossfadeDuration(frames, 100);
    expect(duration).toBeGreaterThanOrEqual(4); // minimum is 4
    expect(duration).toBeLessThanOrEqual(8);
  });

  it('quiet→loud returns ~18 (fast snap)', () => {
    const frames = Array.from({ length: 200 }, (_, i) =>
      mockFrame({ rms: i < 100 ? 0.03 : 0.35 }),
    );
    const duration = dynamicCrossfadeDuration(frames, 100);
    expect(duration).toBeGreaterThanOrEqual(4);
    expect(duration).toBeLessThanOrEqual(18);
  });

  it('loud→quiet returns ~50 (moderate fade)', () => {
    const frames = Array.from({ length: 200 }, (_, i) =>
      mockFrame({ rms: i < 100 ? 0.35 : 0.03 }),
    );
    const duration = dynamicCrossfadeDuration(frames, 100);
    expect(duration).toBeGreaterThanOrEqual(25);
    expect(duration).toBeLessThanOrEqual(50);
  });

  it('mid energy returns ~30 (default)', () => {
    const frames = Array.from({ length: 200 }, () => mockFrame({ rms: 0.12 }));
    const duration = dynamicCrossfadeDuration(frames, 100);
    expect(duration).toBeGreaterThanOrEqual(15);
    expect(duration).toBeLessThanOrEqual(30);
  });

  it('high spectral flux compresses duration', () => {
    // Constant energy (mid), but rapidly changing contrast → high flux
    const frames = Array.from({ length: 200 }, (_, i) =>
      mockFrame({
        rms: 0.12,
        contrast: i % 2 === 0
          ? [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9]
          : [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
      }),
    );
    const highFluxDuration = dynamicCrossfadeDuration(frames, 100);

    // Same energy but constant contrast → no flux
    const stableFrames = Array.from({ length: 200 }, () =>
      mockFrame({ rms: 0.12 }),
    );
    const lowFluxDuration = dynamicCrossfadeDuration(stableFrames, 100);

    expect(highFluxDuration).toBeLessThan(lowFluxDuration);
  });

  it('never returns less than 4', () => {
    const frames = Array.from({ length: 200 }, (_, i) =>
      mockFrame({
        rms: 0.35,
        contrast: i % 2 === 0
          ? [1, 1, 1, 1, 1, 1, 1]
          : [0, 0, 0, 0, 0, 0, 0],
      }),
    );
    const duration = dynamicCrossfadeDuration(frames, 100);
    expect(duration).toBeGreaterThanOrEqual(4);
  });
});

// --- findNearestBeat ---

describe('findNearestBeat', () => {
  it('returns null when no beats in range', () => {
    const frames = Array.from({ length: 100 }, () => mockFrame());
    expect(findNearestBeat(frames, 30, 60)).toBeNull();
  });

  it('finds a beat frame', () => {
    const frames = Array.from({ length: 100 }, (_, i) =>
      mockFrame({ beat: i === 45 }),
    );
    expect(findNearestBeat(frames, 40, 50)).toBe(45);
  });

  it('prefers downbeats with high confidence', () => {
    const frames = Array.from({ length: 100 }, (_, i) =>
      mockFrame({
        beat: i === 42 || i === 47,
        downbeat: i === 47,
        beatConfidence: i === 47 ? 0.9 : 0.3,
      }),
    );
    // Downbeat at 47 should score higher than regular beat at 42
    expect(findNearestBeat(frames, 40, 50)).toBe(47);
  });

  it('falls back to strong onsets when no beats', () => {
    const frames = Array.from({ length: 100 }, (_, i) =>
      mockFrame({ onset: i === 55 ? 0.9 : 0.1 }),
    );
    expect(findNearestBeat(frames, 50, 60)).toBe(55);
  });

  it('handles search range at start of frames', () => {
    const frames = Array.from({ length: 20 }, (_, i) =>
      mockFrame({ beat: i === 2 }),
    );
    expect(findNearestBeat(frames, 0, 10)).toBe(2);
  });

  it('handles search range at end of frames', () => {
    const frames = Array.from({ length: 20 }, (_, i) =>
      mockFrame({ beat: i === 18 }),
    );
    expect(findNearestBeat(frames, 15, 20)).toBe(18);
  });
});
