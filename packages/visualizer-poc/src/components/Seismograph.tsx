/**
 * Seismograph — Earthquake-style needle trace. Single continuous line drawing
 * from left to right across screen. Y displacement = current frame's RMS * 200
 * (amplified). Line scrolls: most recent 300 frames visible. Classic seismograph
 * red ink on white paper strip aesthetic. Needle mechanism SVG at the drawing
 * point. Paper edge with ruler markings.
 * Always visible at 20-35% opacity. Positioned in lower area.
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

const RED_INK = "#CC2211";
const RED_INK_DIM = "rgba(204, 34, 17, 0.3)";
const PAPER_WHITE = "rgba(248, 244, 236, 0.75)";
const PAPER_EDGE = "rgba(200, 190, 175, 0.6)";
const RULER_COLOR = "rgba(100, 90, 80, 0.4)";
const NEEDLE_METAL = "#555555";

const TRACE_WINDOW = 300; // frames of history to show
const AMPLITUDE = 200; // max Y displacement in pixels

interface Props {
  frames: EnhancedFrameData[];
}

export const Seismograph: React.FC<Props> = ({ frames }) => {
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

  // Always visible at 20-35% opacity
  const opacity = interpolate(energy, [0.02, 0.25], [0.2, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Paper strip dimensions (lower portion of screen)
  const paperTop = height * 0.7;
  const paperHeight = 120;
  const paperLeft = 40;
  const paperRight = width - 40;
  const paperWidth = paperRight - paperLeft;
  const centerY = paperTop + paperHeight / 2;

  // Build trace points from recent frame history
  const tracePoints: string[] = [];
  const startFrame = Math.max(0, idx - TRACE_WINDOW);
  const endFrame = idx;

  for (let f = startFrame; f <= endFrame; f++) {
    if (f >= frames.length) break;
    const fd = frames[f];
    const progress = (f - startFrame) / TRACE_WINDOW;
    const x = paperLeft + progress * paperWidth;

    // Y displacement from RMS, with some high-frequency detail from centroid
    const rms = fd.rms;
    const highDetail = fd.high * 0.3;
    const displacement = (rms + highDetail) * AMPLITUDE;
    // Alternate direction based on frame for organic waveform
    const direction = Math.sin(f * 0.5) > 0 ? 1 : -1;
    const y = centerY - displacement * direction * 0.5;

    if (f === startFrame) {
      tracePoints.push(`M ${x} ${y}`);
    } else {
      tracePoints.push(`L ${x} ${y}`);
    }
  }

  const tracePath = tracePoints.join(" ");

  // Current needle position (rightmost point of trace)
  const currentProgress = 1;
  const needleX = paperLeft + currentProgress * paperWidth;
  const currentRms = frames[idx].rms;
  const currentHigh = frames[idx].high * 0.3;
  const currentDisp = (currentRms + currentHigh) * AMPLITUDE;
  const currentDir = Math.sin(idx * 0.5) > 0 ? 1 : -1;
  const needleY = centerY - currentDisp * currentDir * 0.5;

  // Ruler markings along left edge
  const rulerMarks: number[] = [];
  for (let m = 0; m <= 10; m++) {
    rulerMarks.push(paperTop + (m / 10) * paperHeight);
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        {/* Paper strip background */}
        <rect
          x={paperLeft}
          y={paperTop}
          width={paperWidth}
          height={paperHeight}
          fill={PAPER_WHITE}
          rx={2}
        />

        {/* Paper edges / shadow */}
        <rect
          x={paperLeft}
          y={paperTop}
          width={paperWidth}
          height={paperHeight}
          fill="none"
          stroke={PAPER_EDGE}
          strokeWidth={1}
          rx={2}
        />

        {/* Grid lines (horizontal) */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={`h-${frac}`}
            x1={paperLeft}
            y1={paperTop + frac * paperHeight}
            x2={paperRight}
            y2={paperTop + frac * paperHeight}
            stroke={RULER_COLOR}
            strokeWidth={0.5}
            strokeDasharray="4,6"
          />
        ))}

        {/* Center line (baseline) */}
        <line
          x1={paperLeft}
          y1={centerY}
          x2={paperRight}
          y2={centerY}
          stroke={RULER_COLOR}
          strokeWidth={0.8}
        />

        {/* Ruler markings along left edge */}
        {rulerMarks.map((my, mi) => (
          <g key={`ruler-${mi}`}>
            <line
              x1={paperLeft - 8}
              y1={my}
              x2={paperLeft}
              y2={my}
              stroke={RULER_COLOR}
              strokeWidth={mi % 5 === 0 ? 1.2 : 0.6}
            />
            {mi % 5 === 0 && (
              <text
                x={paperLeft - 12}
                y={my + 3}
                textAnchor="end"
                fontSize={7}
                fontFamily="monospace"
                fill={RULER_COLOR}
              >
                {mi}
              </text>
            )}
          </g>
        ))}

        {/* Red ink ghost trail (slightly offset, simulating ink bleed) */}
        {tracePath.length > 2 && (
          <path
            d={tracePath}
            fill="none"
            stroke={RED_INK_DIM}
            strokeWidth={3}
            strokeLinejoin="round"
            style={{ filter: "blur(1px)" }}
          />
        )}

        {/* Main red ink trace */}
        {tracePath.length > 2 && (
          <path
            d={tracePath}
            fill="none"
            stroke={RED_INK}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 2px ${RED_INK})`,
            }}
          />
        )}

        {/* Needle mechanism at drawing point */}
        <g>
          {/* Needle arm */}
          <line
            x1={needleX}
            y1={needleY - 25}
            x2={needleX}
            y2={needleY + 2}
            stroke={NEEDLE_METAL}
            strokeWidth={2}
            strokeLinecap="round"
          />

          {/* Needle tip */}
          <circle cx={needleX} cy={needleY} r={2} fill={RED_INK} />

          {/* Needle housing (small rectangle at top) */}
          <rect
            x={needleX - 6}
            y={needleY - 30}
            width={12}
            height={8}
            rx={2}
            fill={NEEDLE_METAL}
            opacity={0.7}
          />

          {/* Pivot point */}
          <circle cx={needleX} cy={needleY - 26} r={2.5} fill="#888" stroke="#666" strokeWidth={0.5} />
        </g>

        {/* Time markers along bottom */}
        {Array.from({ length: 6 }, (_, ti) => {
          const tX = paperLeft + (ti / 5) * paperWidth;
          const timeVal = Math.max(0, Math.floor((idx - TRACE_WINDOW + (ti / 5) * TRACE_WINDOW) / 30));
          const mins = Math.floor(timeVal / 60);
          const secs = timeVal % 60;
          return (
            <g key={`time-${ti}`}>
              <line
                x1={tX}
                y1={paperTop + paperHeight}
                x2={tX}
                y2={paperTop + paperHeight + 5}
                stroke={RULER_COLOR}
                strokeWidth={0.6}
              />
              <text
                x={tX}
                y={paperTop + paperHeight + 14}
                textAnchor="middle"
                fontSize={7}
                fontFamily="monospace"
                fill={RULER_COLOR}
              >
                {`${mins}:${String(secs).padStart(2, "0")}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
