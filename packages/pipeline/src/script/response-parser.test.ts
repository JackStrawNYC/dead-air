import { describe, it, expect, vi } from 'vitest';
import { parseScriptResponse, formatValidationErrors } from './response-parser.js';

// Suppress logger output during tests
vi.mock('@dead-air/core', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

function makeValidScript(overrides: Record<string, unknown> = {}) {
  return {
    episodeTitle: 'Cornell 77',
    episodeType: 'gateway',
    introNarration: 'Welcome to the show.',
    setBreakNarration: 'The band takes a break.',
    outroNarration: 'Thanks for watching.',
    segments: [
      {
        type: 'narration',
        narrationKey: 'intro',
        visual: {
          scenePrompts: ['dark stage'],
          colorPalette: ['#000000'],
          mood: 'warm',
          visualIntensity: 0.5,
        },
      },
      {
        type: 'concert_audio',
        songName: 'Scarlet Begonias',
        startTimeInSong: 0,
        excerptDuration: 60,
        visual: {
          scenePrompts: ['red lighting', 'crowd dancing'],
          colorPalette: ['#FF0000'],
          mood: 'electric',
          visualIntensity: 0.8,
        },
      },
      {
        type: 'concert_audio',
        songName: 'Fire on the Mountain',
        startTimeInSong: 30,
        excerptDuration: 45,
        visual: {
          scenePrompts: ['orange glow', 'fire backdrop'],
          colorPalette: ['#FF6600'],
          mood: 'cosmic',
          visualIntensity: 0.9,
        },
      },
      {
        type: 'narration',
        narrationKey: 'outro',
        visual: {
          scenePrompts: ['empty venue'],
          colorPalette: ['#333333'],
          mood: 'warm',
          visualIntensity: 0.3,
        },
      },
    ],
    youtube: {
      title: 'Cornell 77 — The Greatest Show',
      description: 'A deep dive into the legendary Cornell show.',
      tags: ['grateful dead', 'cornell', '1977'],
      chapters: [{ time: '0:00', label: 'Intro' }],
    },
    thumbnailPrompt: 'Barton Hall concert poster style',
    shortsMoments: [{ timestamp: '5:30', duration: 30, hookText: 'The greatest jam ever' }],
    ...overrides,
  };
}

const SONG_NAMES = new Set(['Scarlet Begonias', 'Fire on the Mountain', 'Morning Dew']);
const SONG_DURATIONS = new Map([
  ['Scarlet Begonias', 300],
  ['Fire on the Mountain', 420],
  ['Morning Dew', 600],
]);

describe('parseScriptResponse', () => {
  it('parses valid raw JSON', () => {
    const json = JSON.stringify(makeValidScript());
    const result = parseScriptResponse(json, SONG_NAMES, SONG_DURATIONS);
    expect(result.script.episodeTitle).toBe('Cornell 77');
    expect(result.script.segments).toHaveLength(4);
  });

  it('extracts JSON from code fences', () => {
    const fenced = '```json\n' + JSON.stringify(makeValidScript()) + '\n```';
    const result = parseScriptResponse(fenced, SONG_NAMES, SONG_DURATIONS);
    expect(result.script.episodeTitle).toBe('Cornell 77');
  });

  it('extracts JSON from surrounding text', () => {
    const wrapped = 'Here is the script:\n' + JSON.stringify(makeValidScript()) + '\n\nLet me know if you want changes.';
    const result = parseScriptResponse(wrapped, SONG_NAMES, SONG_DURATIONS);
    expect(result.script.episodeTitle).toBe('Cornell 77');
  });

  it('throws on missing episodeTitle', () => {
    const script = makeValidScript({ episodeTitle: '' });
    expect(() =>
      parseScriptResponse(JSON.stringify(script), SONG_NAMES, SONG_DURATIONS),
    ).toThrow('Schema validation failed');
  });

  it('throws on invalid episodeType', () => {
    const script = makeValidScript({ episodeType: 'invalid' });
    expect(() =>
      parseScriptResponse(JSON.stringify(script), SONG_NAMES, SONG_DURATIONS),
    ).toThrow('Schema validation failed');
  });

  it('throws on no JSON in response', () => {
    expect(() =>
      parseScriptResponse('Just some plain text with no braces', SONG_NAMES, SONG_DURATIONS),
    ).toThrow('No JSON object found');
  });

  it('warns on unknown song name', () => {
    const script = makeValidScript();
    (script.segments[1] as Record<string, unknown>).songName = 'Dark Star';
    const result = parseScriptResponse(JSON.stringify(script), SONG_NAMES, SONG_DURATIONS);
    expect(result.warnings.some((w) => w.includes('Dark Star'))).toBe(true);
  });

  it('warns on excerpt exceeding song duration', () => {
    const script = makeValidScript();
    const concertSeg = script.segments[1] as Record<string, unknown>;
    concertSeg.startTimeInSong = 280;
    concertSeg.excerptDuration = 30;
    // 280 + 30 = 310 > 300 + 5 = 305
    const result = parseScriptResponse(JSON.stringify(script), SONG_NAMES, SONG_DURATIONS);
    expect(result.warnings.some((w) => w.includes('exceeds song duration'))).toBe(true);
  });

  it('throws when missing intro narration key', () => {
    const script = makeValidScript();
    // Remove intro narration key
    (script.segments[0] as Record<string, unknown>).narrationKey = undefined;
    expect(() =>
      parseScriptResponse(JSON.stringify(script), SONG_NAMES, SONG_DURATIONS),
    ).toThrow('Semantic validation failed');
  });

  it('throws when fewer than 2 concert_audio segments', () => {
    const script = makeValidScript();
    // Remove second concert segment, keep narration segments
    script.segments = [script.segments[0], script.segments[1], script.segments[3]];
    expect(() =>
      parseScriptResponse(JSON.stringify(script), SONG_NAMES, SONG_DURATIONS),
    ).toThrow('Semantic validation failed');
  });

  it('warns when YouTube chapters do not start at 0:00', () => {
    const script = makeValidScript();
    (script.youtube.chapters[0] as Record<string, unknown>).time = '1:00';
    const result = parseScriptResponse(JSON.stringify(script), SONG_NAMES, SONG_DURATIONS);
    expect(result.warnings.some((w) => w.includes('0:00'))).toBe(true);
  });
});

describe('formatValidationErrors', () => {
  it('formats error message for retry prompt', () => {
    const err = new Error('Missing intro narration');
    const formatted = formatValidationErrors(err);
    expect(formatted).toContain('validation errors');
    expect(formatted).toContain('Missing intro narration');
    expect(formatted).toContain('fix these issues');
  });
});
