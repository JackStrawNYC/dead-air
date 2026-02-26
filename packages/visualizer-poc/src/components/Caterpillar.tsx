/**
 * Caterpillar — 3-5 inchworm caterpillars crawling across the bottom of the screen.
 * Each caterpillar is built from connected circles forming a segmented body. The
 * body undulates with a sine wave that syncs to beat energy — segments bunch up
 * and stretch in classic inchworm fashion. Green/yellow bodies with tiny antennae.
 * Cycle: 75s (2250 frames), 24s (720 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 2250;   // 75s
const DURATION = 720;  // 24s
const MAX_WORMS = 4;
const SEGMENTS = 10;

const BODY_COLORS = ["#6DBF4A", "#8BC34A", "#CDDC39", "#7CB342"];
const SPOT_COLORS = ["#4CAF50", "#558B2F", "#9E9D24", "#33691E"];

interface WormData {
  baseY: number;      // 0-1 in bottom 15% of screen
  speed: number;
  direction: number;  // 1 or -1
  segRadius: number;
  colorIdx: number;
  phaseOff: number;
  waveFreq: number;
}

function generate(seed: number): WormData[] {
  const rng = mulberry32(seed);
  return Array.from({ length: MAX_WORMS }, () => ({
    baseY: 0.88 + rng() * 0.09,
    speed: 0.3 + rng() * 0.5,
    direction: rng() > 0.5 ? 1 : -1,
    segRadius: 5 + rng() * 4,
    colorIdx: Math.floor(rng() * BODY_COLORS.length),
    phaseOff: rng() * Math.PI * 2,
    waveFreq: 0.08 + rng() * 0.06,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Caterpillar: React.FC<Props> = ({ frames }) => {
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

  const worms = React.useMemo(() => generate(334411), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.7;
  if (masterOpacity < 0.01) return null;

  /* beat pulse drives undulation amplitude */
  const beatPulse = frames[idx]?.beat ? 0.3 : 0;
  const undulationAmp = 6 + energy * 20 + beatPulse * 10;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {worms.map((w, wi) => {
          /* horizontal traversal */
          const crawlSpeed = w.speed * (0.5 + energy * 1.5);
          const travelDist = width + SEGMENTS * w.segRadius * 3;
          const rawX = (cycleFrame * crawlSpeed) % travelDist;
          const headX = w.direction > 0 ? rawX - w.segRadius * SEGMENTS : width - rawX + w.segRadius * SEGMENTS;
          const baseY = w.baseY * height;

          const bodyColor = BODY_COLORS[w.colorIdx];
          const spotColor = SPOT_COLORS[w.colorIdx];

          /* build segments from head backward */
          const segPoints: Array<{ x: number; y: number }> = [];
          for (let s = 0; s < SEGMENTS; s++) {
            const segPhase = frame * w.waveFreq + w.phaseOff + s * 0.8;
            const inchwormY = Math.sin(segPhase) * undulationAmp;
            /* inchworm effect: segments bunch and stretch horizontally */
            const bunch = Math.sin(segPhase + Math.PI * 0.5) * w.segRadius * 0.4;
            const sx = headX - w.direction * s * (w.segRadius * 1.8 + bunch);
            const sy = baseY + inchwormY - Math.abs(Math.sin(segPhase)) * 4;
            segPoints.push({ x: sx, y: sy });
          }

          return (
            <g key={wi}>
              {/* body segments (back to front) */}
              {segPoints.slice().reverse().map((seg, si) => {
                const realIdx = SEGMENTS - 1 - si;
                const r = w.segRadius * (realIdx === 0 ? 1.15 : realIdx < 3 ? 1.05 : 0.95);
                return (
                  <React.Fragment key={si}>
                    <circle cx={seg.x} cy={seg.y} r={r + 1} fill={spotColor} opacity={0.4} />
                    <circle cx={seg.x} cy={seg.y} r={r} fill={bodyColor} />
                    {/* dorsal spots */}
                    {realIdx > 0 && realIdx % 2 === 0 && (
                      <circle cx={seg.x} cy={seg.y - r * 0.3} r={r * 0.25} fill={spotColor} opacity={0.6} />
                    )}
                  </React.Fragment>
                );
              })}
              {/* head details */}
              {segPoints.length > 0 && (
                <g>
                  {/* eyes */}
                  <circle cx={segPoints[0].x + w.direction * w.segRadius * 0.4} cy={segPoints[0].y - w.segRadius * 0.35} r={2} fill="#222" />
                  <circle cx={segPoints[0].x + w.direction * w.segRadius * 0.4} cy={segPoints[0].y - w.segRadius * 0.35} r={0.8} fill="#FFF" />
                  {/* antennae */}
                  <line
                    x1={segPoints[0].x + w.direction * w.segRadius * 0.5}
                    y1={segPoints[0].y - w.segRadius}
                    x2={segPoints[0].x + w.direction * (w.segRadius * 1.2)}
                    y2={segPoints[0].y - w.segRadius * 2}
                    stroke="#444" strokeWidth={1} strokeLinecap="round"
                  />
                  <line
                    x1={segPoints[0].x + w.direction * w.segRadius * 0.3}
                    y1={segPoints[0].y - w.segRadius}
                    x2={segPoints[0].x + w.direction * (w.segRadius * 0.8)}
                    y2={segPoints[0].y - w.segRadius * 2.1}
                    stroke="#444" strokeWidth={1} strokeLinecap="round"
                  />
                  {/* antenna tips */}
                  <circle cx={segPoints[0].x + w.direction * (w.segRadius * 1.2)} cy={segPoints[0].y - w.segRadius * 2} r={1.2} fill="#444" />
                  <circle cx={segPoints[0].x + w.direction * (w.segRadius * 0.8)} cy={segPoints[0].y - w.segRadius * 2.1} r={1.2} fill="#444" />
                </g>
              )}
              {/* tiny legs (prolegs) */}
              {segPoints.map((seg, si) => {
                if (si === 0 || si >= SEGMENTS - 1) return null;
                const legLen = w.segRadius * 0.6;
                const legAngle = Math.sin(frame * w.waveFreq + w.phaseOff + si * 0.8) * 0.3;
                return (
                  <line
                    key={`leg-${si}`}
                    x1={seg.x}
                    y1={seg.y + w.segRadius * 0.7}
                    x2={seg.x + Math.sin(legAngle) * legLen}
                    y2={seg.y + w.segRadius * 0.7 + legLen}
                    stroke={spotColor}
                    strokeWidth={1}
                    opacity={0.5}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
