/**
 * PoeticLyrics — Flowing, atmospheric lyric text synced to word-level alignment.
 * Not karaoke — poetry. Words fade in with stagger, drift upward, and dissolve.
 *
 * Phrases are grouped by pause detection (gaps > 0.8s start new phrase).
 * Instrumental sections (gaps > 10s) suppress lyrics entirely.
 * Sits at Layer 0.9 (above LyricTriggerLayer, below FilmGrain).
 *
 * Respects overlay gate (OVERLAY_GATE_END = 420 frames / 14s).
 * Reduced opacity during climax moments (visuals should dominate).
 * Suppressed during LyricTriggerLayer windows (no double-text).
 */

import React, { useMemo } from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { loadFont } from "@remotion/google-fonts/CormorantGaramond";
import { useSongPalette } from "../data/SongPaletteContext";
import type { EnhancedFrameData, SectionBoundary } from "../data/types";

const { fontFamily: cormorant } = loadFont("normal", {
  weights: ["300", "400"],
  subsets: ["latin"],
});

// ─── Types ───

interface AlignmentWord {
  word: string;
  start: number; // seconds
  end: number;
  score: number;
}

interface Phrase {
  words: AlignmentWord[];
  /** First word start time (seconds) */
  startTime: number;
  /** Last word end time (seconds) */
  endTime: number;
}

export interface PoeticLyricsProps {
  /** Word-level alignment data */
  alignmentWords: AlignmentWord[];
  /** Frame ranges where LyricTriggerLayer is active — suppress to avoid double-text */
  triggerWindows: Array<{ start: number; end: number }>;
  /** Analysis sections for instrumental detection */
  sections?: SectionBoundary[];
  /** Audio frames for energy-reactive opacity */
  frames?: EnhancedFrameData[];
}

// ─── Constants ───

const OVERLAY_GATE_END = 420; // 14s — overlays hidden until intro clears
const MIN_WORDS_FOR_DISPLAY = 40; // don't show lyrics if fewer than 40 words — not impactful enough
const MIN_PHRASES_FOR_DISPLAY = 4; // need at least 4 phrases for a meaningful lyric experience
const PHRASE_GAP_THRESHOLD = 0.8; // seconds — gap before new phrase starts
const INSTRUMENTAL_GAP = 10; // seconds — suppress lyrics in long gaps
const WORD_STAGGER_FRAMES = 3; // frames between each word fade-in (~100ms at 30fps)
const PHRASE_FADE_IN_FRAMES = 20; // ~0.67s fade in for phrase container
const PHRASE_HOLD_FRAMES = 30; // hold after last word before fade-out starts
const PHRASE_FADE_OUT_FRAMES = 30; // ~1s fade out
const PHRASE_DRIFT_PX = 12; // subtle upward drift over phrase lifespan
const FPS = 30;

// ─── Phrase grouping ───

function groupIntoPhrases(words: AlignmentWord[]): Phrase[] {
  if (words.length === 0) return [];

  const phrases: Phrase[] = [];
  let currentWords: AlignmentWord[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= PHRASE_GAP_THRESHOLD) {
      phrases.push({
        words: currentWords,
        startTime: currentWords[0].start,
        endTime: currentWords[currentWords.length - 1].end,
      });
      currentWords = [words[i]];
    } else {
      currentWords.push(words[i]);
    }
  }

  // Push final phrase
  if (currentWords.length > 0) {
    phrases.push({
      words: currentWords,
      startTime: currentWords[0].start,
      endTime: currentWords[currentWords.length - 1].end,
    });
  }

  return phrases;
}

// ─── Instrumental detection ───

/** Check if a time range falls within an instrumental gap (>10s between phrases) */
function isInstrumentalGap(
  currentTime: number,
  phrases: Phrase[],
): boolean {
  for (let i = 0; i < phrases.length - 1; i++) {
    const gapStart = phrases[i].endTime;
    const gapEnd = phrases[i + 1].startTime;
    if (gapEnd - gapStart >= INSTRUMENTAL_GAP) {
      if (currentTime >= gapStart && currentTime <= gapEnd) {
        return true;
      }
    }
  }

  // Also check if we're before the first phrase or after the last
  if (phrases.length > 0) {
    if (currentTime > phrases[phrases.length - 1].endTime + INSTRUMENTAL_GAP) {
      return true;
    }
  }

  return false;
}

// ─── Component ───

export const PoeticLyrics: React.FC<PoeticLyricsProps> = ({
  alignmentWords,
  triggerWindows,
  sections,
  frames,
}) => {
  const frame = useCurrentFrame();
  const palette = useSongPalette();

  const phrases = useMemo(
    () => groupIntoPhrases(alignmentWords),
    [alignmentWords],
  );

  // Current time in seconds
  const currentTime = frame / FPS;

  // Don't render during overlay gate
  if (frame < OVERLAY_GATE_END) return null;

  // Don't render if insufficient lyrics — a few scattered words isn't impactful
  if (alignmentWords.length < MIN_WORDS_FOR_DISPLAY) return null;
  if (phrases.length < MIN_PHRASES_FOR_DISPLAY) return null;

  // Don't render during instrumental gaps
  if (isInstrumentalGap(currentTime, phrases)) return null;

  // Check if a lyric trigger window is active — suppress to avoid double-text
  // Use wider detection range matching LyricTriggerLayer's FADE_IN/OUT (150/120 frames)
  const triggerActive = triggerWindows.some(
    (w) => frame >= w.start - 150 && frame < w.end + 120,
  );
  if (triggerActive) return null;

  // Energy-reactive base opacity: dimmer during peaks (let visuals dominate)
  let energyOpacity = 0.75;
  if (frames && frames.length > 0) {
    const frameIdx = Math.min(Math.max(0, frame), frames.length - 1);
    const energy = frames[frameIdx]?.rms ?? 0;
    energyOpacity = interpolate(
      energy,
      [0.05, 0.4],
      [0.75, 0.45],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  }

  // Palette glow color
  const glowHue = palette.primary;
  const glowColor = `hsla(${glowHue}, 60%, 70%, 0.4)`;

  // Find visible phrases: current and crossfading phrases
  const visiblePhrases = phrases.filter((phrase) => {
    const phraseStartFrame = phrase.startTime * FPS;
    const phraseEndFrame = phrase.endTime * FPS + PHRASE_HOLD_FRAMES + PHRASE_FADE_OUT_FRAMES;
    return frame >= phraseStartFrame - PHRASE_FADE_IN_FRAMES && frame <= phraseEndFrame;
  });

  if (visiblePhrases.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 120,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "none",
        zIndex: 85,
      }}
    >
      {visiblePhrases.map((phrase, phraseIdx) => (
        <PhraseDisplay
          key={`${phrase.startTime}-${phraseIdx}`}
          phrase={phrase}
          frame={frame}
          energyOpacity={energyOpacity}
          glowColor={glowColor}
        />
      ))}
    </div>
  );
};

// ─── Phrase renderer ───

const PhraseDisplay: React.FC<{
  phrase: Phrase;
  frame: number;
  energyOpacity: number;
  glowColor: string;
}> = ({ phrase, frame, energyOpacity, glowColor }) => {
  const phraseStartFrame = phrase.startTime * FPS;
  const lastWordEndFrame = phrase.endTime * FPS;
  const phraseHoldEnd = lastWordEndFrame + PHRASE_HOLD_FRAMES;
  const phraseFullEnd = phraseHoldEnd + PHRASE_FADE_OUT_FRAMES;

  // Phrase container fade in/out
  const fadeIn = interpolate(
    frame,
    [phraseStartFrame - PHRASE_FADE_IN_FRAMES, phraseStartFrame],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const fadeOut = interpolate(
    frame,
    [phraseHoldEnd, phraseFullEnd],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const phraseOpacity = Math.min(fadeIn, fadeOut) * energyOpacity;

  if (phraseOpacity < 0.01) return null;

  // Drift: subtle upward movement over phrase lifespan
  const phraseDuration = phraseFullEnd - (phraseStartFrame - PHRASE_FADE_IN_FRAMES);
  const phraseProgress = (frame - (phraseStartFrame - PHRASE_FADE_IN_FRAMES)) / Math.max(1, phraseDuration);
  const driftY = -phraseProgress * PHRASE_DRIFT_PX;

  return (
    <div
      style={{
        opacity: phraseOpacity,
        transform: `translateY(${driftY}px)`,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0 8px",
        maxWidth: "70%",
        lineHeight: 1.6,
        willChange: "transform, opacity",
      }}
    >
      {phrase.words.map((word, wordIdx) => {
        // Each word fades in with stagger
        const wordAppearFrame = word.start * FPS;
        const wordDelay = wordIdx * WORD_STAGGER_FRAMES;
        const wordFadeStart = Math.max(phraseStartFrame, wordAppearFrame - wordDelay);

        const wordOpacity = interpolate(
          frame,
          [wordFadeStart - 6, wordFadeStart],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );

        return (
          <span
            key={`${word.start}-${wordIdx}`}
            style={{
              fontFamily: `${cormorant}, Georgia, serif`,
              fontSize: 32,
              fontWeight: 300,
              color: "rgba(240, 235, 225, 0.85)",
              textShadow: `0 0 20px ${glowColor}, 0 2px 8px rgba(0,0,0,0.7)`,
              opacity: wordOpacity,
              letterSpacing: 1.5,
            }}
          >
            {word.word}
          </span>
        );
      })}
    </div>
  );
};
