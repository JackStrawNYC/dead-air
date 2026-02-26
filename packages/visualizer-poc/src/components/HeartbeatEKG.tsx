/**
 * HeartbeatEKG — Hospital EKG trace.
 * Green phosphor line on dark background. The trace follows actual RMS energy
 * — quiet = flat line, loud = tall spikes. Scrolling left-to-right across
 * bottom area. Trail fades behind the current position. Classic heartbeat
 * monitor aesthetic. Beep dot at peak. Always visible at 20-35% opacity.
 * Green (#00FF41) color.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const EKG_GREEN = "#00FF41";
const EKG_GREEN_DIM = "rgba(0, 255, 65, 0.15)";
const TRACE_WIDTH = 400; // how many frames of history to show
const PIXELS_PER_FRAME = 3; // horizontal distance per frame

interface Props {
  frames: EnhancedFrameData[];
}

export const HeartbeatEKG: React.FC<Props> = ({ frames }) => {
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

  // Pre-compute grid lines for the monitor background (deterministic)
  const gridLines = React.useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const gridSpacing = 40;
    // Vertical grid
    for (let x = 0; x <= 1920; x += gridSpacing) {
      lines.push({ x1: x, y1: 0, x2: x, y2: 400 });
    }
    // Horizontal grid
    for (let y = 0; y <= 400; y += gridSpacing) {
      lines.push({ x1: 0, y1: y, x2: 1920, y2: y });
    }
    return lines;
  }, []);

  // Master opacity: always visible at 20-35%
  const masterOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // EKG area: bottom portion of screen
  const ekgY = height * 0.78;
  const ekgHeight = 120;
  const ekgBaseline = ekgY + ekgHeight * 0.5;

  // Build the trace path from recent frames
  const traceStartFrame = Math.max(0, idx - TRACE_WIDTH);
  const traceEndFrame = idx;

  // Find the current peak for the beep dot
  let peakRms = 0;
  let peakFrameOffset = 0;

  const pathParts: string[] = [];
  for (let f = traceStartFrame; f <= traceEndFrame; f++) {
    const frameIdx = Math.min(f, frames.length - 1);
    const rms = frames[frameIdx].rms;
    const framesFromEnd = traceEndFrame - f;
    const x = width - framesFromEnd * PIXELS_PER_FRAME;
    // Map RMS to vertical deflection: flat at 0, large spikes on peaks
    const deflection = rms * ekgHeight * 2.5;
    const y = ekgBaseline - deflection;

    if (f === traceStartFrame) {
      pathParts.push(`M ${x} ${y}`);
    } else {
      pathParts.push(`L ${x} ${y}`);
    }

    // Track peak in last ~15 frames for beep dot
    if (framesFromEnd < 15 && rms > peakRms) {
      peakRms = rms;
      peakFrameOffset = framesFromEnd;
    }
  }

  const tracePath = pathParts.join(" ");

  // Beep dot position
  const beepX = width - peakFrameOffset * PIXELS_PER_FRAME;
  const beepY = ekgBaseline - peakRms * ekgHeight * 2.5;
  const showBeep = peakRms > 0.1;

  // Scanline position (current write head)
  const scanX = width;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <filter id="ekg-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="ekg-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={EKG_GREEN} stopOpacity="0" />
            <stop offset="30%" stopColor={EKG_GREEN} stopOpacity="0.3" />
            <stop offset="100%" stopColor={EKG_GREEN} stopOpacity="1" />
          </linearGradient>
          {/* Mask for trail fade */}
          <mask id="ekg-trail-mask">
            <rect
              x={width - TRACE_WIDTH * PIXELS_PER_FRAME}
              y={0}
              width={TRACE_WIDTH * PIXELS_PER_FRAME}
              height={height}
              fill="url(#ekg-fade)"
            />
          </mask>
        </defs>

        {/* Grid background (very faint) */}
        <g
          opacity={0.08}
          transform={`translate(0, ${ekgY - 60})`}
        >
          {gridLines.map((line, i) => (
            <line
              key={`grid${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={EKG_GREEN}
              strokeWidth={0.5}
            />
          ))}
        </g>

        {/* Baseline reference */}
        <line
          x1={0}
          y1={ekgBaseline}
          x2={width}
          y2={ekgBaseline}
          stroke={EKG_GREEN_DIM}
          strokeWidth={0.5}
          strokeDasharray="4 8"
        />

        {/* EKG trace with trail fade */}
        <g mask="url(#ekg-trail-mask)">
          <path
            d={tracePath}
            fill="none"
            stroke={EKG_GREEN}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            filter="url(#ekg-glow)"
          />
        </g>

        {/* Scan line (current position marker) */}
        <line
          x1={scanX}
          y1={ekgY - 60}
          x2={scanX}
          y2={ekgY + ekgHeight + 40}
          stroke={EKG_GREEN}
          strokeWidth={1}
          opacity={0.3}
        />

        {/* Beep dot at peak */}
        {showBeep && (
          <g>
            <circle
              cx={beepX}
              cy={beepY}
              r={4 + peakRms * 4}
              fill={EKG_GREEN}
              opacity={0.9}
              filter="url(#ekg-glow)"
            />
            <circle
              cx={beepX}
              cy={beepY}
              r={8 + peakRms * 8}
              fill="none"
              stroke={EKG_GREEN}
              strokeWidth={1}
              opacity={0.3}
            />
          </g>
        )}

        {/* BPM-style text (decorative) */}
        <text
          x={width - 100}
          y={ekgY - 20}
          fill={EKG_GREEN}
          fontSize={14}
          fontFamily="monospace"
          opacity={0.5}
        >
          {Math.round(energy * 200 + 60)} BPM
        </text>
      </svg>
    </div>
  );
};
