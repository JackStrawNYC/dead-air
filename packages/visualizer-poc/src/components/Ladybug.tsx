/**
 * Ladybug — 4-6 ladybugs crawling along screen edges (top, bottom, sides).
 * Red shells with black spots. When energy peaks above a threshold, one ladybug
 * opens its elytra (wing covers) and takes flight with translucent wings buzzing.
 * Legs animate as tiny strokes. Crawl speed varies with energy.
 * Cycle: 60s (1800 frames), 20s (600 frames) visible.
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

const CYCLE = 1800;
const DURATION = 600;
const MAX_BUGS = 5;

interface BugData {
  edge: number;       // 0=top, 1=right, 2=bottom, 3=left
  position: number;   // 0-1 along edge
  speed: number;
  direction: number;
  size: number;
  spots: number;
  spotSeed: number;
  flyThreshold: number; // energy threshold to fly
  flyPhase: number;
}

function generate(seed: number): BugData[] {
  const rng = mulberry32(seed);
  return Array.from({ length: MAX_BUGS }, () => ({
    edge: Math.floor(rng() * 4),
    position: rng(),
    speed: 0.4 + rng() * 0.6,
    direction: rng() > 0.5 ? 1 : -1,
    size: 10 + rng() * 8,
    spots: 4 + Math.floor(rng() * 5),
    spotSeed: Math.floor(rng() * 10000),
    flyThreshold: 0.15 + rng() * 0.1,
    flyPhase: rng() * Math.PI * 2,
  }));
}

function generateSpots(seed: number, count: number): Array<{ cx: number; cy: number; r: number }> {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    cx: (rng() - 0.5) * 0.7,
    cy: (rng() - 0.5) * 0.6,
    r: 0.08 + rng() * 0.1,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Ladybug: React.FC<Props> = ({ frames }) => {
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

  const bugs = React.useMemo(() => generate(556677), []);
  const allSpots = React.useMemo(
    () => bugs.map((b) => generateSpots(b.spotSeed, b.spots)),
    [bugs],
  );

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.75;
  if (masterOpacity < 0.01) return null;

  const crawlSpeed = 0.5 + energy * 2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {bugs.map((bug, bi) => {
          const spots = allSpots[bi];
          const t = ((bug.position + cycleFrame * bug.speed * crawlSpeed * 0.0008 * bug.direction) % 1 + 1) % 1;
          const s = bug.size;

          /* position along edge */
          let bx: number, by: number, rot: number;
          switch (bug.edge) {
            case 0: bx = t * width; by = s + 4; rot = 90; break;
            case 1: bx = width - s - 4; by = t * height; rot = 180; break;
            case 2: bx = t * width; by = height - s - 4; rot = -90; break;
            default: bx = s + 4; by = t * height; rot = 0; break;
          }

          /* flying behavior on energy peak */
          const isFlying = energy > bug.flyThreshold;
          let flyOffY = 0;
          let elytraOpen = 0;
          if (isFlying) {
            const flyProgress = interpolate(energy, [bug.flyThreshold, bug.flyThreshold + 0.1], [0, 1], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp",
            });
            flyOffY = -flyProgress * 60;
            elytraOpen = flyProgress;
            bx += Math.sin(frame * 0.1 + bug.flyPhase) * 20 * flyProgress;
          }

          /* leg animation */
          const legCycle = Math.sin(frame * 0.2 * crawlSpeed + bi * 1.5);

          return (
            <g key={bi} transform={`translate(${bx}, ${by + flyOffY}) rotate(${rot})`}>
              {/* legs (3 pairs) */}
              {[-1, 0, 1].map((legPos) => {
                const legOffset = legCycle * (legPos === 0 ? -1 : 1) * 2;
                return (
                  <React.Fragment key={`legs-${legPos}`}>
                    <line x1={legPos * s * 0.3} y1={-s * 0.5} x2={legPos * s * 0.3 + legOffset - 4} y2={-s * 0.8}
                      stroke="#222" strokeWidth={1} strokeLinecap="round" />
                    <line x1={legPos * s * 0.3} y1={s * 0.5} x2={legPos * s * 0.3 + legOffset + 4} y2={s * 0.8}
                      stroke="#222" strokeWidth={1} strokeLinecap="round" />
                  </React.Fragment>
                );
              })}
              {/* body shadow */}
              <ellipse cx={1} cy={1} rx={s * 0.55} ry={s * 0.45} fill="rgba(0,0,0,0.2)" />
              {/* elytra (wing covers) */}
              <ellipse cx={-s * 0.03} cy={-elytraOpen * s * 0.15} rx={s * 0.52 + elytraOpen * s * 0.08}
                ry={s * 0.43} fill="#E53935" stroke="#B71C1C" strokeWidth={0.8} />
              {/* center line */}
              <line x1={0} y1={-s * 0.4} x2={0} y2={s * 0.4} stroke="#222" strokeWidth={1.2} />
              {/* spots */}
              {spots.map((sp, si) => (
                <circle key={si} cx={sp.cx * s} cy={sp.cy * s} r={sp.r * s} fill="#222" />
              ))}
              {/* head (pronotum) */}
              <ellipse cx={-s * 0.45} cy={0} rx={s * 0.18} ry={s * 0.22} fill="#222" />
              {/* head spots (white) */}
              <circle cx={-s * 0.5} cy={-s * 0.08} r={s * 0.04} fill="#EEE" opacity={0.6} />
              <circle cx={-s * 0.5} cy={s * 0.08} r={s * 0.04} fill="#EEE" opacity={0.6} />
              {/* translucent wings visible when flying */}
              {elytraOpen > 0.1 && (
                <>
                  <ellipse cx={s * 0.05} cy={-s * 0.3 - elytraOpen * s * 0.4}
                    rx={s * 0.6 * elytraOpen} ry={s * 0.25 * elytraOpen}
                    fill="rgba(200, 220, 255, 0.25)" stroke="rgba(200, 220, 255, 0.4)" strokeWidth={0.5} />
                  <ellipse cx={s * 0.05} cy={s * 0.3 + elytraOpen * s * 0.4}
                    rx={s * 0.6 * elytraOpen} ry={s * 0.25 * elytraOpen}
                    fill="rgba(200, 220, 255, 0.25)" stroke="rgba(200, 220, 255, 0.4)" strokeWidth={0.5} />
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
