/**
 * Lyric Trigger Resolver — maps curated lyric phrases to visual media
 * using word-level alignment data for frame-accurate trigger windows.
 *
 * Each trigger fires when its key phrase is sung, with configurable
 * pre-roll (visual appears before the words) and hold (visual persists).
 *
 * Data sources:
 *   - data/lyric-triggers.json — curated phrase→visual mappings
 *   - data/lyrics/{trackId}-alignment[-deepgram].json — word timestamps
 */

// ─── Types ───

interface AlignmentWord {
  word: string;
  start: number; // seconds
  end: number;   // seconds
  score: number;
}

interface LyricTriggerDef {
  id: string;
  phrase: string;
  song: string;
  visual: string;
  mediaType: "image" | "video";
  hold_seconds: number;
  pre_roll_seconds?: number;
}

interface TriggersConfig {
  defaults: {
    pre_roll_seconds: number;
    hold_seconds: number;
    min_gap_seconds: number;
    opacity: number;
  };
  triggers: LyricTriggerDef[];
}

export interface LyricTriggerWindow {
  triggerId: string;
  frameStart: number;
  frameEnd: number;
  visual: string;
  mediaType: "image" | "video";
  phrase: string;
  opacity: number;
}

// ─── Data loading ───

let triggersConfig: TriggersConfig | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  triggersConfig = require("../../data/lyric-triggers.json");
} catch {
  // Trigger definitions not available
}

/**
 * Load alignment words for a trackId.
 * Prefers deepgram alignment (better word-level timing),
 * falls back to mapped-lyrics source.
 */
export function loadAlignmentWords(trackId: string): AlignmentWord[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data = require(`../../data/lyrics/${trackId}-alignment-deepgram.json`);
    if (data?.words?.length) return data.words;
  } catch { /* not available */ }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data = require(`../../data/lyrics/${trackId}-alignment.json`);
    if (data?.words?.length) return data.words;
  } catch { /* not available */ }

  return [];
}

// ─── Phrase matching ───

/**
 * Find all occurrences of a phrase in alignment words.
 * Returns start times (seconds) for each match.
 * Phrase matching is case-insensitive and tolerates punctuation.
 */
function findPhraseTimes(
  words: AlignmentWord[],
  phrase: string,
): number[] {
  const phraseWords = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  if (phraseWords.length === 0) return [];

  const times: number[] = [];
  for (let i = 0; i <= words.length - phraseWords.length; i++) {
    let match = true;
    for (let j = 0; j < phraseWords.length; j++) {
      const alignedWord = words[i + j].word.toLowerCase().replace(/[^a-z0-9']/g, "");
      const triggerWord = phraseWords[j].replace(/[^a-z0-9']/g, "");
      if (alignedWord !== triggerWord) {
        match = false;
        break;
      }
    }
    if (match) {
      times.push(words[i].start);
    }
  }
  return times;
}

// ─── Resolver ───

/**
 * Resolve lyric triggers for a given song.
 * Returns frame-accurate windows for each trigger whose phrase
 * appears in the alignment data.
 *
 * Only returns the FIRST occurrence of each trigger phrase to avoid
 * visual repetition (chorus phrases would otherwise fire every time).
 *
 * @param songTitle - Song title (matches trigger.song)
 * @param alignmentWords - Word-level alignment data for this track
 * @param fps - Frame rate (typically 30)
 */
export function resolveLyricTriggers(
  songTitle: string,
  alignmentWords: AlignmentWord[],
  fps: number = 30,
): LyricTriggerWindow[] {
  if (!triggersConfig || alignmentWords.length === 0) return [];

  const { defaults, triggers } = triggersConfig;
  const windows: LyricTriggerWindow[] = [];

  // Find triggers matching this song
  const songTriggers = triggers.filter(
    (t) => t.song.toLowerCase() === songTitle.toLowerCase(),
  );

  for (const trigger of songTriggers) {
    const times = findPhraseTimes(alignmentWords, trigger.phrase);
    if (times.length === 0) continue;

    // Use first occurrence only (avoid chorus repetition)
    const phraseTime = times[0];
    const preRoll = trigger.pre_roll_seconds ?? defaults.pre_roll_seconds;
    const hold = trigger.hold_seconds ?? defaults.hold_seconds;

    windows.push({
      triggerId: trigger.id,
      frameStart: Math.max(0, Math.round((phraseTime - preRoll) * fps)),
      frameEnd: Math.round((phraseTime + hold) * fps),
      visual: trigger.visual,
      mediaType: trigger.mediaType,
      phrase: trigger.phrase,
      opacity: defaults.opacity,
    });
  }

  // Sort by start frame
  windows.sort((a, b) => a.frameStart - b.frameStart);

  // Enforce minimum gap between trigger windows
  const minGapFrames = Math.round(defaults.min_gap_seconds * fps);
  const filtered: LyricTriggerWindow[] = [];
  for (const w of windows) {
    const last = filtered[filtered.length - 1];
    if (last && w.frameStart < last.frameEnd + minGapFrames) continue;
    filtered.push(w);
  }

  return filtered;
}
