/**
 * LyricDisplay — premium karaoke-style lyric overlay.
 *
 * Shows the current lyric line at the bottom third of the screen during vocal
 * sections. Each word fades in as it is sung, with the current word highlighted
 * in a warm gold accent. Fully invisible during instrumental passages.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { loadFont } from "@remotion/google-fonts/CormorantGaramond";

const { fontFamily: cormorant } = loadFont("normal", {
  weights: ["300", "400", "600"],
  subsets: ["latin"],
});

// ─── Types ───

export interface LyricWord {
  word: string;
  start: number; // seconds
  end: number; // seconds
  score?: number;
}

export interface LyricDisplayProps {
  alignment: { words: LyricWord[] } | null;
  style?: React.CSSProperties;
}

// ─── Constants ───

const FPS = 30;
const MAX_WORDS_PER_LINE = 8;
const LINE_BREAK_GAP = 2.0;
const INSTRUMENTAL_GAP = 4.0;
const WORD_ANTICIPATION = 0.15;
const WORD_FADE_DURATION = 0.3;
const MAX_WORD_DURATION = 3.5; // Clamp absurd heuristic durations (some files have 60s+ per word)

// ─── Colors ───

const CREAM = "rgba(245, 240, 232, 0.92)";
const GOLD_HIGHLIGHT = "rgba(212, 168, 83, 1.0)";

// ─── Sanitize heuristic alignment data ───

const GARBAGE_WORDS = new Set(["", "lyrics", "contributor"]);

function sanitizeWords(words: LyricWord[]): LyricWord[] {
  return words
    .filter((w) => {
      if (GARBAGE_WORDS.has(w.word)) return false;
      if (w.word.includes("contributor")) return false;
      return true;
    })
    .map((w) => ({
      ...w,
      // Clamp absurd end times — heuristic data sometimes stretches a single
      // word across 60+ seconds of instrumental passage
      end: Math.min(w.end, w.start + MAX_WORD_DURATION),
    }));
}

// ─── Line Grouping ───

interface LineGroup {
  words: LyricWord[];
  lineStart: number;
  lineEnd: number;
}

function groupIntoLines(words: LyricWord[]): LineGroup[] {
  if (words.length === 0) return [];

  const lines: LineGroup[] = [];
  let currentLine: LyricWord[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const prevWord = i > 0 ? words[i - 1] : null;

    const gapFromPrev = prevWord ? word.start - prevWord.end : 0;
    if (prevWord && gapFromPrev > LINE_BREAK_GAP && currentLine.length > 0) {
      lines.push(finalizeLine(currentLine));
      currentLine = [];
    }

    currentLine.push(word);

    const endsWithPunctuation = /[.,!?;:]$/.test(word.word);
    const atMaxLength = currentLine.length >= MAX_WORDS_PER_LINE;

    if ((endsWithPunctuation || atMaxLength) && i < words.length - 1) {
      const nextWord = words[i + 1];
      const gapToNext = nextWord.start - word.end;
      if (gapToNext < INSTRUMENTAL_GAP) {
        lines.push(finalizeLine(currentLine));
        currentLine = [];
      }
    }
  }

  if (currentLine.length > 0) {
    lines.push(finalizeLine(currentLine));
  }

  return lines;
}

function finalizeLine(words: LyricWord[]): LineGroup {
  return {
    words,
    lineStart: words[0].start,
    lineEnd: words[words.length - 1].end,
  };
}

// ─── Helpers ───

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function instrumentalDistance(
  currentTimeSec: number,
  words: LyricWord[],
): number {
  if (words.length === 0) return Infinity;

  if (currentTimeSec < words[0].start - INSTRUMENTAL_GAP) {
    return words[0].start - currentTimeSec;
  }
  if (currentTimeSec > words[words.length - 1].end + INSTRUMENTAL_GAP) {
    return currentTimeSec - words[words.length - 1].end;
  }

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (currentTimeSec >= w.start - 1.0 && currentTimeSec <= w.end + 1.0) {
      return 0;
    }
  }

  let minDist = Infinity;
  for (let i = 0; i < words.length; i++) {
    const distToStart = Math.abs(currentTimeSec - words[i].start);
    const distToEnd = Math.abs(currentTimeSec - words[i].end);
    minDist = Math.min(minDist, distToStart, distToEnd);
  }
  return minDist;
}

// ─── Per-word sub-component ───

const LyricWordSpan: React.FC<{
  word: LyricWord;
  currentTimeSec: number;
}> = ({ word, currentTimeSec }) => {
  const fadeStart = word.start - WORD_ANTICIPATION;
  const fadeEnd = fadeStart + WORD_FADE_DURATION;
  const wordOpacity = smoothstep(fadeStart, fadeEnd, currentTimeSec);

  if (wordOpacity < 0.01) {
    return (
      <span
        style={{
          fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
          fontSize: 36,
          fontWeight: 400,
          lineHeight: 1.5,
          color: "transparent",
          display: "inline-block",
        }}
      >
        {word.word}
      </span>
    );
  }

  const isActive = currentTimeSec >= word.start && currentTimeSec <= word.end;
  const color = isActive ? GOLD_HIGHLIGHT : CREAM;
  const scale = isActive ? 1.04 : 1.0;
  const translateY = (1 - wordOpacity) * 4;

  return (
    <span
      style={{
        fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
        fontSize: 36,
        fontWeight: isActive ? 600 : 400,
        fontStyle: "italic",
        lineHeight: 1.5,
        color,
        opacity: wordOpacity,
        display: "inline-block",
        transform: `translateY(${translateY}px) scale(${scale})`,
        textShadow: isActive
          ? "0 2px 16px rgba(212, 168, 83, 0.4), 0 1px 4px rgba(0, 0, 0, 0.8)"
          : "0 1px 8px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 0, 0, 0.4)",
        willChange: "opacity, transform",
      }}
    >
      {word.word}
    </span>
  );
};

// ─── Main Component ───

export const LyricDisplay: React.FC<LyricDisplayProps> = ({
  alignment,
  style,
}) => {
  const frame = useCurrentFrame();
  const currentTimeSec = frame / FPS;

  const cleanWords = useMemo(() => {
    if (!alignment?.words?.length) return [];
    return sanitizeWords(alignment.words);
  }, [alignment]);

  const lines = useMemo(() => {
    if (cleanWords.length === 0) return [];
    return groupIntoLines(cleanWords);
  }, [cleanWords]);

  if (lines.length === 0) return null;

  let activeLine: LineGroup | null = null;
  for (const line of lines) {
    const showStart = line.lineStart - WORD_ANTICIPATION - 0.5;
    const showEnd = line.lineEnd + 1.0;
    if (currentTimeSec >= showStart && currentTimeSec <= showEnd) {
      activeLine = line;
    }
  }

  if (!activeLine) return null;

  const instDist = instrumentalDistance(currentTimeSec, cleanWords);
  if (instDist > INSTRUMENTAL_GAP) return null;

  const containerOpacity = (() => {
    const timeBeforeLine = activeLine.lineStart - currentTimeSec;
    const timeAfterLine = currentTimeSec - activeLine.lineEnd;

    if (timeBeforeLine > 0) return smoothstep(1.0, 0, timeBeforeLine);
    if (timeAfterLine > 0) return 1 - smoothstep(0, 1.5, timeAfterLine);
    return 1;
  })();

  if (containerOpacity < 0.01) return null;

  const slideY = interpolate(
    containerOpacity,
    [0, 1],
    [6, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        top: 0,
        pointerEvents: "none",
        zIndex: 95,
        ...style,
      }}
    >
      {/* Subtle bottom gradient backdrop for readability */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "25%",
          background: `linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, ${0.25 * containerOpacity}) 50%,
            rgba(0, 0, 0, ${0.45 * containerOpacity}) 100%
          )`,
          pointerEvents: "none",
        }}
      />

      {/* Lyric line — positioned at bottom third */}
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          bottom: 160,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0 0.35em",
          opacity: containerOpacity,
          transform: `translateY(${slideY}px)`,
        }}
      >
        {activeLine.words.map((word, wi) => (
          <LyricWordSpan
            key={`${activeLine!.lineStart}-${wi}`}
            word={word}
            currentTimeSec={currentTimeSec}
          />
        ))}
      </div>
    </div>
  );
};
