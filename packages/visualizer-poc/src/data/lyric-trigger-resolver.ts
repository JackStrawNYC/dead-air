/**
 * Lyric Trigger Resolver — pure function module (no React).
 *
 * Resolves trigger config + alignment data → render-ready trigger windows.
 * Handles phrase matching against WhisperX word timestamps, window computation,
 * priority-based conflict resolution, and minimum gap enforcement.
 */

// ─── Types ───

export type TransitionType = "crossfade" | "dip_to_black" | "hard_cut" | "dissolve";

export interface AlignedWord {
  word: string;
  start: number; // seconds from song start
  end: number;
  score?: number; // confidence 0-1
}

export interface LyricAlignment {
  songName: string;
  trackId: string;
  source?: string; // "whisperx" | "heuristic-vocal-detection"
  words: AlignedWord[];
  segments?: Array<{ start: number; end: number; text: string }>;
}

export interface LyricTrigger {
  id: string;
  phrase: string; // lyric phrase to match in alignment data
  song: string; // song title (scopes match)
  visual: string; // path relative to public/
  mediaType: "image" | "video";
  transition_in?: TransitionType;
  transition_out?: TransitionType;
  pre_roll_seconds?: number;
  hold_seconds?: number;
  priority?: number; // higher wins; default = word count
  blend_mode?: string; // default "normal"
  opacity?: number; // default 0.85
  image_prompt?: string;
  video_prompt?: string;
}

export interface LyricTriggerDefaults {
  transition_in: TransitionType;
  transition_out: TransitionType;
  pre_roll_seconds: number;
  hold_seconds: number;
  min_gap_seconds: number;
  blend_mode: string;
  opacity: number;
}

export interface LyricTriggerConfig {
  showId: string;
  defaults: LyricTriggerDefaults;
  triggers: LyricTrigger[];
}

export interface ResolvedTriggerWindow {
  triggerId: string;
  fadeInStart: number; // song-local frame
  fullStart: number; // frame where lyric is sung, visual at full opacity
  fadeOutStart: number;
  fadeOutEnd: number;
  visual: string;
  mediaType: "image" | "video";
  transitionIn: TransitionType;
  transitionOut: TransitionType;
  blendMode: string;
  opacity: number;
}

// ─── Internal types ───

interface PhraseMatch {
  triggerId: string;
  matchTimestamp: number; // seconds — start of first matching word
  wordCount: number;
}

// ─── Helpers ───

/** Normalize text for fuzzy matching: lowercase, strip punctuation, collapse whitespace */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Check if song title matches a trigger's song field (case-insensitive, normalized) */
function songMatches(songTitle: string, triggerSong: string): boolean {
  return normalizeText(songTitle) === normalizeText(triggerSong);
}

// ─── Core Functions ───

/**
 * Match trigger phrases against WhisperX word timestamps.
 * Uses sliding window of N consecutive aligned words (N = phrase word count).
 * Returns first occurrence of each phrase.
 */
export function matchPhrasesInAlignment(
  alignment: LyricAlignment,
  triggers: LyricTrigger[],
  songTitle: string,
): PhraseMatch[] {
  const matches: PhraseMatch[] = [];
  const words = alignment.words;

  for (const trigger of triggers) {
    if (!songMatches(songTitle, trigger.song)) continue;

    const phraseWords = normalizeText(trigger.phrase).split(" ");
    const phraseLen = phraseWords.length;

    if (phraseLen === 0 || words.length < phraseLen) continue;

    // Sliding window — find first occurrence
    let found = false;
    for (let i = 0; i <= words.length - phraseLen && !found; i++) {
      let match = true;
      for (let j = 0; j < phraseLen; j++) {
        if (normalizeText(words[i + j].word) !== phraseWords[j]) {
          match = false;
          break;
        }
      }

      if (match) {
        matches.push({
          triggerId: trigger.id,
          matchTimestamp: words[i].start,
          wordCount: phraseLen,
        });
        found = true;
      }
    }
  }

  return matches;
}

/**
 * Build render-ready trigger windows from phrase matches.
 * Handles priority, gap enforcement, and conflict resolution.
 */
export function buildTriggerWindows(
  matches: PhraseMatch[],
  triggers: LyricTrigger[],
  defaults: LyricTriggerDefaults,
  fps = 30,
): ResolvedTriggerWindow[] {
  const triggerMap = new Map(triggers.map((t) => [t.id, t]));
  const FADE_FRAMES = 90; // 3s fade duration

  // Sort by priority (highest first), then by word count as tiebreaker
  const sorted = [...matches].sort((a, b) => {
    const trigA = triggerMap.get(a.triggerId)!;
    const trigB = triggerMap.get(b.triggerId)!;
    const prioA = trigA.priority ?? a.wordCount;
    const prioB = trigB.priority ?? b.wordCount;
    return prioB - prioA;
  });

  const windows: ResolvedTriggerWindow[] = [];
  const minGapFrames = defaults.min_gap_seconds * fps;

  for (const match of sorted) {
    const trigger = triggerMap.get(match.triggerId);
    if (!trigger) continue;

    const preRoll = trigger.pre_roll_seconds ?? defaults.pre_roll_seconds;
    const holdSeconds = trigger.hold_seconds ?? defaults.hold_seconds;
    const transIn = trigger.transition_in ?? defaults.transition_in;
    const transOut = trigger.transition_out ?? defaults.transition_out;

    const fullStart = Math.round(match.matchTimestamp * fps);
    const fadeInStart = Math.round((match.matchTimestamp - preRoll) * fps);
    const fadeOutStart = fullStart + Math.round(holdSeconds * fps);
    const fadeOutEnd = fadeOutStart + FADE_FRAMES;

    // Conflict resolution: skip if too close to an existing window
    const conflict = windows.some((w) => {
      return fadeInStart < w.fadeOutEnd + minGapFrames &&
        fadeOutEnd > w.fadeInStart - minGapFrames;
    });

    if (conflict) continue;

    windows.push({
      triggerId: trigger.id,
      fadeInStart: Math.max(0, fadeInStart),
      fullStart,
      fadeOutStart,
      fadeOutEnd,
      visual: trigger.visual,
      mediaType: trigger.mediaType,
      transitionIn: transIn,
      transitionOut: transOut,
      blendMode: trigger.blend_mode ?? defaults.blend_mode,
      opacity: trigger.opacity ?? defaults.opacity,
    });
  }

  // Sort chronologically
  windows.sort((a, b) => a.fadeInStart - b.fadeInStart);
  return windows;
}

/**
 * Top-level entry: resolve lyric triggers for a song.
 * Filters triggers by song, runs phrase matching, builds windows.
 */
export function resolveLyricTriggers(
  songTitle: string,
  trackId: string,
  alignment: LyricAlignment,
  config: LyricTriggerConfig,
): { windows: ResolvedTriggerWindow[] } | null {
  // Filter triggers for this song
  const songTriggers = config.triggers.filter((t) =>
    songMatches(songTitle, t.song),
  );

  if (songTriggers.length === 0) return null;

  const matches = matchPhrasesInAlignment(alignment, songTriggers, songTitle);
  if (matches.length === 0) return null;

  const windows = buildTriggerWindows(
    matches,
    songTriggers,
    config.defaults,
  );

  return windows.length > 0 ? { windows } : null;
}
