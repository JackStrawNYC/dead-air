/**
 * StemSeparation — 4 stacked horizontal waveform traces (DAW mixer style)
 * showing individual instrument stems. Right 40% of screen.
 */
import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const TRACE_WINDOW = 90; // frames of history per trace
const TRACE_HEIGHT = 40; // px amplitude range per trace

interface StemConfig {
  label: string;
  color: string;
  yFraction: number;
  getValue: (fd: EnhancedFrameData) => number;
  getMarker?: (fd: EnhancedFrameData) => boolean;
}

const STEMS: StemConfig[] = [
  {
    label: "DRUMS",
    color: "#FF8C00",
    yFraction: 0.15,
    getValue: (fd) => fd.stemDrumOnset ?? fd.high * 0.8,
    getMarker: (fd) => fd.stemDrumBeat ?? false,
  },
  {
    label: "BASS",
    color: "#9B59B6",
    yFraction: 0.35,
    getValue: (fd) => fd.stemBassRms ?? fd.sub,
  },
  {
    label: "VOCALS",
    color: "#FFECD2",
    yFraction: 0.55,
    getValue: (fd) => fd.stemVocalRms ?? fd.mid * 0.5,
    getMarker: (fd) => fd.stemVocalPresence ?? false,
  },
  {
    label: "GUITAR",
    color: "#00CED1",
    yFraction: 0.75,
    getValue: (fd) => fd.stemOtherRms ?? (fd.mid + fd.high) / 2,
  },
];

export const StemSeparation: React.FC<{ frames: EnhancedFrameData[] }> = ({
  frames,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Smoothed stem sum for self-gating
  const stemSum = useMemo(() => {
    let sum = 0;
    const window = 30;
    const start = Math.max(0, idx - window);
    const end = Math.min(frames.length - 1, idx + window);
    const count = end - start + 1;
    for (let i = start; i <= end; i++) {
      const fd = frames[i];
      sum +=
        (fd.stemDrumOnset ?? fd.high * 0.8) +
        (fd.stemBassRms ?? fd.sub) +
        (fd.stemVocalRms ?? fd.mid * 0.5) +
        (fd.stemOtherRms ?? (fd.mid + fd.high) / 2);
    }
    return sum / count;
  }, [frames, idx]);

  if (stemSum < 0.05) return null;

  const opacity = interpolate(stemSum, [0.05, 0.6], [0.0, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Layout: right 40% of screen
  const xStart = width * 0.55;
  const xEnd = width * 0.95;
  const traceWidth = xEnd - xStart;

  const traces = useMemo(() => {
    return STEMS.map((stem, si) => {
      const baseY = height * stem.yFraction;
      const points: string[] = [];
      const markers: { x: number; y: number }[] = [];
      const brightRegions: { x1: number; x2: number }[] = [];
      let inBright = false;
      let brightStart = 0;

      for (let i = 0; i < TRACE_WINDOW; i++) {
        const fi = idx - TRACE_WINDOW + 1 + i;
        if (fi < 0 || fi >= frames.length) {
          points.push(`${xStart + (i / TRACE_WINDOW) * traceWidth},${baseY}`);
          continue;
        }

        const fd = frames[fi];
        const value = stem.getValue(fd);
        const x = xStart + (i / TRACE_WINDOW) * traceWidth;
        const y = baseY - value * TRACE_HEIGHT + TRACE_HEIGHT / 2;
        points.push(`${x},${y}`);

        // Beat markers (drum hits)
        if (stem.getMarker && stem.getMarker(fd)) {
          markers.push({ x, y });
        }

        // Vocal presence bright regions
        if (stem.label === "VOCALS") {
          const isPresent = fd.stemVocalPresence ?? false;
          if (isPresent && !inBright) {
            inBright = true;
            brightStart = x;
          } else if (!isPresent && inBright) {
            inBright = false;
            brightRegions.push({ x1: brightStart, x2: x });
          }
        }
      }

      if (inBright) {
        brightRegions.push({ x1: brightStart, x2: xEnd });
      }

      // Parse color to apply hue shift
      const baseColor = stem.color;
      const glowColor = baseColor;

      return { points, markers, brightRegions, baseY, baseColor, glowColor, label: stem.label };
    });
  }, [frames, idx, height, xStart, traceWidth]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        pointerEvents: "none",
        mixBlendMode: "screen",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <defs>
          {STEMS.map((stem, i) => (
            <filter key={i} id={`stem-glow-${i}`}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {traces.map((trace, i) => (
          <g key={i}>
            {/* Label */}
            <text
              x={xStart - 8}
              y={trace.baseY + 4}
              fill={trace.baseColor}
              fontSize={10}
              fontFamily="monospace"
              textAnchor="end"
              opacity={0.6}
            >
              {trace.label}
            </text>

            {/* Bright regions (vocal presence) */}
            {trace.brightRegions.map((region, ri) => (
              <rect
                key={`bright-${ri}`}
                x={region.x1}
                y={trace.baseY - TRACE_HEIGHT}
                width={region.x2 - region.x1}
                height={TRACE_HEIGHT * 2}
                fill={trace.baseColor}
                opacity={0.08}
              />
            ))}

            {/* Waveform trace - glow layer */}
            <polyline
              points={trace.points.join(" ")}
              fill="none"
              stroke={trace.glowColor}
              strokeWidth={4}
              opacity={0.3}
              filter={`url(#stem-glow-${i})`}
            />

            {/* Waveform trace - core line */}
            <polyline
              points={trace.points.join(" ")}
              fill="none"
              stroke={trace.baseColor}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />

            {/* Beat markers */}
            {trace.markers.map((m, mi) => (
              <circle
                key={`marker-${mi}`}
                cx={m.x}
                cy={m.y}
                r={3}
                fill={trace.baseColor}
                opacity={0.8}
              />
            ))}

            {/* Center line */}
            <line
              x1={xStart}
              y1={trace.baseY}
              x2={xEnd}
              y2={trace.baseY}
              stroke={trace.baseColor}
              strokeWidth={0.5}
              opacity={0.15}
              strokeDasharray="4 4"
            />
          </g>
        ))}
      </svg>
    </div>
  );
};
