/**
 * SheetMusic — Musical staff notation scrolling. 5-line musical staff.
 * Notes (filled/hollow circles with stems) placed at heights corresponding
 * to dominant chroma pitch. Notes scroll left-to-right. Treble clef at left
 * edge. Bar lines every beat-equivalent. Note size from energy (louder = larger
 * notes). Parchment-colored background strip.
 * Appears every 65s for 14s at 20-30% opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pitch class to staff position (semitones above C mapped to line/space positions)
// C=0, D=1, E=2, F=2.5, G=3.5, A=4.5, B=5.5
// We map 0-11 chroma indices to vertical positions on the staff
// Staff has 5 lines with 4 spaces. Position 0 = bottom line (E4), 8 = top line (F5)
const CHROMA_TO_STAFF: number[] = [
  -1,   // C  (below staff, ledger line)
  -0.5, // C#
  0,    // D  (below bottom line)
  0.5,  // D#
  1,    // E  (bottom line)
  2,    // F  (first space)
  2.5,  // F#
  3,    // G  (second line)
  3.5,  // G#
  4,    // A  (second space)
  4.5,  // A#
  5,    // B  (third line)
];

const PARCHMENT = "rgba(245, 230, 200, 0.7)";
const INK = "rgba(40, 30, 20, 0.85)";
const INK_DIM = "rgba(40, 30, 20, 0.4)";

const CYCLE_FRAMES = 1950; // 65 seconds at 30fps
const VISIBLE_FRAMES = 420; // 14 seconds at 30fps
const NOTE_WINDOW = 60; // frames of note history to show

interface Props {
  frames: EnhancedFrameData[];
}

export const SheetMusic: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Periodic visibility: every 65s for 14s
  const cycleFrame = frame % CYCLE_FRAMES;

  // Fade in/out within the visible window
  const fadeIn = interpolate(cycleFrame, [0, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(cycleFrame, [VISIBLE_FRAMES - 45, VISIBLE_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  const visibilityOpacity = cycleFrame < VISIBLE_FRAMES ? fadeIn * fadeOut : 0;

  // Base opacity 20-30% driven by energy
  const baseOpacity = interpolate(energy, [0.02, 0.3], [0.2, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = baseOpacity * visibilityOpacity;

  if (masterOpacity < 0.01) return null;

  const fd = frames[idx];

  // Staff dimensions
  const staffTop = height * 0.35;
  const staffHeight = 80;
  const lineSpacing = staffHeight / 4;
  const staffLeft = 60;
  const staffRight = width - 40;
  const staffWidth = staffRight - staffLeft;

  // Find dominant pitch class from chroma
  const getDominantPitch = (chromaArr: number[]): number => {
    let maxVal = 0;
    let maxIdx = 0;
    for (let c = 0; c < 12; c++) {
      if (chromaArr[c] > maxVal) {
        maxVal = chromaArr[c];
        maxIdx = c;
      }
    }
    return maxIdx;
  };

  // Build notes from recent frames
  const notes: Array<{ x: number; staffPos: number; size: number; filled: boolean; beat: boolean }> = [];
  for (let n = 0; n < NOTE_WINDOW; n++) {
    const noteFrame = idx - NOTE_WINDOW + n;
    if (noteFrame < 0 || noteFrame >= frames.length) continue;
    // Only place a note every 4 frames to avoid crowding
    if (noteFrame % 4 !== 0) continue;

    const nfd = frames[noteFrame];
    const pitch = getDominantPitch(nfd.chroma);
    const staffPos = CHROMA_TO_STAFF[pitch];
    const noteEnergy = nfd.rms;
    const noteSize = interpolate(noteEnergy, [0.02, 0.4], [3, 7], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    // X position scrolls from right to left
    const progress = n / NOTE_WINDOW;
    const x = staffLeft + 80 + progress * (staffWidth - 100);

    notes.push({
      x,
      staffPos,
      size: noteSize,
      filled: noteEnergy > 0.15,
      beat: nfd.beat,
    });
  }

  // Staff Y position for a given staff position (0 = bottom line, 4 = top line)
  const staffY = (pos: number): number => {
    return staffTop + staffHeight - pos * (lineSpacing / 2) + lineSpacing;
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {/* Parchment background strip */}
        <rect
          x={staffLeft - 20}
          y={staffTop - 30}
          width={staffWidth + 40}
          height={staffHeight + 60}
          rx={6}
          fill={PARCHMENT}
        />

        {/* 5 staff lines */}
        {[0, 1, 2, 3, 4].map((line) => (
          <line
            key={`line-${line}`}
            x1={staffLeft}
            y1={staffTop + line * lineSpacing}
            x2={staffRight}
            y2={staffTop + line * lineSpacing}
            stroke={INK}
            strokeWidth={1}
            opacity={0.6}
          />
        ))}

        {/* Treble clef (simplified SVG path) */}
        <g transform={`translate(${staffLeft + 8}, ${staffTop - 10})`} opacity={0.7}>
          <text
            x={0}
            y={staffHeight * 0.8}
            fontSize={staffHeight * 1.2}
            fontFamily="serif"
            fill={INK}
          >
            {"\u{1D11E}"}
          </text>
        </g>

        {/* Bar lines (every ~15 notes worth of space) */}
        {Array.from({ length: 6 }, (_, barIdx) => {
          const barX = staffLeft + 80 + barIdx * ((staffWidth - 100) / 5);
          return (
            <line
              key={`bar-${barIdx}`}
              x1={barX}
              y1={staffTop}
              x2={barX}
              y2={staffTop + staffHeight - lineSpacing}
              stroke={INK_DIM}
              strokeWidth={1}
            />
          );
        })}

        {/* Notes */}
        {notes.map((note, i) => {
          const ny = staffY(note.staffPos);
          const stemDir = note.staffPos < 3 ? -1 : 1; // stem up if below middle
          const stemEndY = ny + stemDir * -30;

          return (
            <g key={`note-${i}`}>
              {/* Ledger lines if needed */}
              {note.staffPos < 1 && (
                <line
                  x1={note.x - note.size - 3}
                  y1={staffY(0)}
                  x2={note.x + note.size + 3}
                  y2={staffY(0)}
                  stroke={INK}
                  strokeWidth={0.8}
                  opacity={0.5}
                />
              )}

              {/* Note head */}
              <ellipse
                cx={note.x}
                cy={ny}
                rx={note.size}
                ry={note.size * 0.75}
                fill={note.filled ? INK : "none"}
                stroke={INK}
                strokeWidth={1}
                transform={`rotate(-15, ${note.x}, ${ny})`}
              />

              {/* Stem */}
              <line
                x1={note.x + (stemDir > 0 ? -note.size : note.size)}
                y1={ny}
                x2={note.x + (stemDir > 0 ? -note.size : note.size)}
                y2={stemEndY}
                stroke={INK}
                strokeWidth={1}
              />

              {/* Beat accent marker */}
              {note.beat && (
                <text
                  x={note.x}
                  y={ny + (stemDir > 0 ? 18 : -18)}
                  textAnchor="middle"
                  fontSize={8}
                  fontFamily="serif"
                  fill={INK}
                  opacity={0.6}
                >
                  &gt;
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
