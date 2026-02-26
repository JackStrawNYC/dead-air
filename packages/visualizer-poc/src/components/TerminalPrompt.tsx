/**
 * TerminalPrompt -- Green-on-black retro computer terminal.
 * Scrolling text that looks like system output: timestamps, status messages,
 * audio stats ("RMS: 0.342", "BEAT DETECTED", "CENTROID: 4521 Hz").
 * Text scrolls up.  New lines appear based on actual audio data values.
 * Blinking cursor.  Monospace font.  Always visible at 0.15-0.3 opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const MAX_VISIBLE_LINES = 22;
const LINE_INTERVAL = 6; // new line every 6 frames (5 lines/second)

/** Message templates that reference audio data */
type MessageGen = (f: EnhancedFrameData, rng: () => number, ts: string) => string;

const MESSAGE_GENERATORS: MessageGen[] = [
  (f, _r, ts) => `[${ts}] RMS: ${f.rms.toFixed(4)}  CENTROID: ${(f.centroid * 8000).toFixed(0)} Hz`,
  (f, _r, ts) => `[${ts}] SUB: ${f.sub.toFixed(3)}  LOW: ${f.low.toFixed(3)}  MID: ${f.mid.toFixed(3)}  HIGH: ${f.high.toFixed(3)}`,
  (f, _r, ts) => f.beat ? `[${ts}] >>> BEAT DETECTED <<<  onset=${f.onset.toFixed(3)}` : `[${ts}] . . .  onset=${f.onset.toFixed(3)}`,
  (f, _r, ts) => `[${ts}] FLATNESS: ${f.flatness.toFixed(4)}  ${f.flatness > 0.5 ? "NOISE-LIKE" : "TONAL"}`,
  (f, _r, ts) => `[${ts}] CHROMA: [${f.chroma.slice(0, 6).map((c) => c.toFixed(2)).join(",")}...]`,
  (f, _r, ts) => `[${ts}] CONTRAST: [${f.contrast.map((c) => c.toFixed(2)).join(",")}]`,
  (_f, _r, ts) => `[${ts}] SIGNAL PROCESSING... OK`,
  (f, _r, ts) => `[${ts}] ENERGY=${(f.rms * 100).toFixed(1)}%  ${f.rms > 0.3 ? "!!! HIGH ENERGY !!!" : f.rms > 0.15 ? "MODERATE" : "LOW"}`,
  (_f, _r, ts) => `[${ts}] BUFFER READY  FRAMES QUEUED`,
  (f, _r, ts) => `[${ts}] SPECTRAL PEAK: ${(f.centroid * 8000).toFixed(0)} Hz  BW: ${(f.high * 4000).toFixed(0)} Hz`,
  (f, _r, ts) => f.onset > 0.5 ? `[${ts}] *** TRANSIENT DETECTED ***  strength=${f.onset.toFixed(3)}` : `[${ts}] MONITORING...`,
  (_f, rng, ts) => `[${ts}] PID ${Math.floor(rng() * 9000 + 1000)}  STATUS: RUNNING`,
];

interface Props {
  frames: EnhancedFrameData[];
}

export const TerminalPrompt: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  /* ----- energy ----- */
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  /* No useMemo needed (no static generation), but we need a stable placeholder
     to satisfy the "useMemo before returns" rule. */
  const _stable = React.useMemo(() => 1, []);

  /* master opacity: always visible 0.15-0.3 */
  const masterOpacity = interpolate(energy, [0.03, 0.25], [0.15, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* fade in */
  const masterFade = interpolate(frame, [30, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const finalOpacity = masterOpacity * masterFade;
  if (finalOpacity < 0.01) return null;

  /* Generate lines: one new line every LINE_INTERVAL frames */
  const totalLines = Math.floor(frame / LINE_INTERVAL);
  const visibleStart = Math.max(0, totalLines - MAX_VISIBLE_LINES);
  const lines: string[] = [];

  for (let li = visibleStart; li < totalLines; li++) {
    const lineFrame = li * LINE_INTERVAL;
    const lineIdx = Math.min(Math.max(0, lineFrame), frames.length - 1);
    const f = frames[lineIdx];

    /* Timestamp from frame */
    const totalSeconds = lineFrame / 30;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const ms = Math.floor((totalSeconds % 1) * 100);
    const ts = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;

    /* Pick message generator deterministically */
    const rng = seeded(li * 31337);
    const genIdx = Math.floor(rng() * MESSAGE_GENERATORS.length);
    const line = MESSAGE_GENERATORS[genIdx](f, rng, ts);
    lines.push(line);
  }

  /* Blinking cursor */
  const cursorVisible = Math.sin(frame * 0.15) > 0;

  /* Scanline effect offset */
  const scanlineOffset = (frame * 1.5) % 4;

  /* Terminal dimensions */
  const termW = Math.min(width * 0.45, 700);
  const termH = Math.min(height * 0.5, 520);
  const termX = width - termW - 40;
  const termY = height - termH - 40;
  const lineHeight = 18;
  const fontSize = 12;

  return (
    <div
      style={{
        position: "absolute",
        left: termX,
        top: termY,
        width: termW,
        height: termH,
        opacity: finalOpacity,
        pointerEvents: "none",
        overflow: "hidden",
        backgroundColor: "rgba(0, 8, 0, 0.85)",
        borderRadius: 4,
        border: "1px solid rgba(0, 255, 0, 0.2)",
        padding: 12,
        fontFamily: "'Courier New', Courier, monospace",
        fontSize,
        lineHeight: `${lineHeight}px`,
        color: "#00FF41",
      }}
    >
      {/* Scanline overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.15) 2px,
            rgba(0, 0, 0, 0.15) 4px
          )`,
          backgroundPositionY: scanlineOffset,
          pointerEvents: "none",
        }}
      />
      {/* CRT curvature vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: "inset 0 0 60px rgba(0, 0, 0, 0.5)",
          borderRadius: 4,
          pointerEvents: "none",
        }}
      />
      {/* Header */}
      <div
        style={{
          color: "#00CC33",
          marginBottom: 4,
          borderBottom: "1px solid rgba(0, 255, 0, 0.15)",
          paddingBottom: 4,
          textShadow: "0 0 4px #00FF41",
          whiteSpace: "nowrap",
        }}
      >
        DEAD-AIR AUDIO ANALYZER v1.977  [LIVE]
      </div>
      {/* Lines */}
      <div style={{ position: "relative" }}>
        {lines.map((line, li) => {
          const isBeat = line.includes("BEAT DETECTED") || line.includes("TRANSIENT") || line.includes("HIGH ENERGY");
          const color = isBeat ? "#FFFF00" : "#00FF41";
          const glow = isBeat ? "0 0 6px #FFFF00" : "0 0 3px #00FF41";
          return (
            <div
              key={li + visibleStart}
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color,
                textShadow: glow,
                opacity: interpolate(li, [0, 2], [0.5, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              {line}
            </div>
          );
        })}
        {/* Blinking cursor */}
        <div style={{ color: "#00FF41", textShadow: "0 0 4px #00FF41" }}>
          {">"} {cursorVisible ? "\u2588" : " "}
        </div>
      </div>
    </div>
  );
};
