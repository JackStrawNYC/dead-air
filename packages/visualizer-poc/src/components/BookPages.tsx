/**
 * BookPages — Open book pages fluttering in wind.
 * 4-6 page shapes (slightly curved rectangles) lifting and turning.
 * Pages have faint text lines (thin horizontal strokes).
 * Warm cream/ivory paper color. Pages ruffle more intensely with energy.
 * Some pages completely lift off and float away. Cycle: 50s, 15s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1500; // 50s at 30fps
const DURATION = 450; // 15s visible
const PAGE_COUNT = 6;

const PAPER_COLORS = [
  "#FFF8E7", // ivory
  "#F5ECD7", // cream
  "#FFFBF0", // white cream
  "#F0E6D0", // parchment
  "#FDF5E6", // old lace
  "#FAF0DC", // antique white
];

interface PageData {
  startX: number;
  startY: number;
  pageW: number;
  pageH: number;
  colorIdx: number;
  liftDelay: number;
  liftSpeed: number;
  tumbleSpeed: number;
  driftAngle: number;
  lineCount: number;
  floatsAway: boolean;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const BookPages: React.FC<Props> = ({ frames }) => {
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

  const pages = React.useMemo(() => {
    const rng = seeded(50_015_006);
    return Array.from({ length: PAGE_COUNT }, (): PageData => ({
      startX: 200 + rng() * 1520,
      startY: 300 + rng() * 480,
      pageW: 100 + rng() * 80,
      pageH: 130 + rng() * 60,
      colorIdx: Math.floor(rng() * PAPER_COLORS.length),
      liftDelay: rng() * 0.4,
      liftSpeed: 0.5 + rng() * 1.5,
      tumbleSpeed: 0.3 + rng() * 0.8,
      driftAngle: -0.3 + rng() * 0.6,
      lineCount: 8 + Math.floor(rng() * 8),
      floatsAway: rng() > 0.6,
    }));
  }, []);

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.15, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (masterOpacity < 0.01) return null;

  // Energy-driven ruffle intensity
  const ruffleIntensity = 0.3 + energy * 2.5;

  const pageElements: React.ReactNode[] = [];

  for (let pi = 0; pi < PAGE_COUNT; pi++) {
    const page = pages[pi];

    // Page-specific progress (delayed start)
    const pageProgress = interpolate(
      progress,
      [page.liftDelay, Math.min(1, page.liftDelay + 0.6)],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );

    if (pageProgress < 0.01) continue;

    // Page curl: perspective transform via skewY
    const curl = Math.sin(frame * 0.04 * page.tumbleSpeed + pi * 2) * 8 * ruffleIntensity;

    // Lift off
    let px = page.startX;
    let py = page.startY;
    let rotation = curl;
    let pageOpacity = 1;

    if (page.floatsAway && pageProgress > 0.4) {
      const floatProgress = interpolate(pageProgress, [0.4, 1], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      py -= floatProgress * 400 * page.liftSpeed;
      px += Math.sin(floatProgress * Math.PI * 2 + page.driftAngle) * 100;
      rotation += floatProgress * 360 * page.tumbleSpeed;
      pageOpacity = interpolate(floatProgress, [0.6, 1], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    } else {
      // Ruffling in place
      const ruffle = Math.sin(frame * 0.06 * ruffleIntensity + pi * 3) * 15 * ruffleIntensity;
      py += Math.sin(frame * 0.03 + pi) * 5 * ruffleIntensity;
      rotation += ruffle;
    }

    const color = PAPER_COLORS[page.colorIdx];
    const halfW = page.pageW / 2;
    const halfH = page.pageH / 2;

    // Slight page curve (bend along horizontal axis)
    const curveAmt = 5 + Math.sin(frame * 0.05 + pi * 1.7) * 3 * ruffleIntensity;

    // Page shape: slightly curved rectangle
    const pagePath = [
      `M ${-halfW} ${-halfH}`,
      `Q 0 ${-halfH - curveAmt} ${halfW} ${-halfH}`,
      `L ${halfW} ${halfH}`,
      `Q 0 ${halfH + curveAmt * 0.5} ${-halfW} ${halfH}`,
      "Z",
    ].join(" ");

    // Text lines
    const textLines: React.ReactNode[] = [];
    const lineMargin = 12;
    const lineSpacing = (page.pageH - lineMargin * 2) / (page.lineCount + 1);
    for (let li = 0; li < page.lineCount; li++) {
      const ly = -halfH + lineMargin + lineSpacing * (li + 1);
      const lineW = page.pageW - 24 - (li === page.lineCount - 1 ? 30 : 0); // last line shorter
      textLines.push(
        <line
          key={`line-${li}`}
          x1={-halfW + 12}
          y1={ly}
          x2={-halfW + 12 + lineW}
          y2={ly}
          stroke="rgba(100, 80, 60, 0.15)"
          strokeWidth={1}
        />
      );
    }

    // Shadow
    const shadowOpacity = 0.1 * pageOpacity;

    pageElements.push(
      <g
        key={`page-${pi}`}
        transform={`translate(${px}, ${py}) rotate(${rotation})`}
        opacity={pageOpacity}
      >
        {/* Drop shadow */}
        <path
          d={pagePath}
          fill="rgba(0,0,0,0.15)"
          transform="translate(3, 4)"
          opacity={shadowOpacity}
        />
        {/* Page body */}
        <path
          d={pagePath}
          fill={color}
          stroke="rgba(160, 140, 110, 0.3)"
          strokeWidth={0.8}
        />
        {/* Text lines */}
        {textLines}
        {/* Page fold line */}
        <line
          x1={0}
          y1={-halfH + 5}
          x2={0}
          y2={halfH - 5}
          stroke="rgba(160, 140, 110, 0.1)"
          strokeWidth={0.5}
          strokeDasharray="3 5"
        />
      </g>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 6px rgba(255, 248, 231, 0.2))`,
        }}
      >
        {pageElements}
      </svg>
    </div>
  );
};
