/**
 * BubbleChamber — Particle physics cloud chamber effect.
 * Curved spiral tracks emanating from collision points. Tracks are thin lines
 * that spiral outward and fade. Multiple simultaneous track events. Tracks
 * appear on beat/onset. Scientific blue-white-cyan palette on dark. Each event
 * generates 3-5 diverging spiral tracks.
 * Cycle: 40s, 12s visible.
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

const CYCLE = 1200;    // 40 seconds at 30fps
const DURATION = 360;  // 12 seconds
const TRACK_LIFETIME = 90; // 3 seconds
const CHECK_INTERVAL = 8;
const MAX_ACTIVE_EVENTS = 6;

const TRACK_COLORS = [
  "#B3E5FC", // light blue
  "#E0F7FA", // very light cyan
  "#FFFFFF", // white
  "#80DEEA", // cyan
  "#4DD0E1", // teal cyan
  "#B2EBF2", // ice blue
];

interface SpiralTrack {
  angle: number;       // initial direction
  curvature: number;   // spiral tightness (positive = clockwise)
  speed: number;       // how fast it extends
  colorIdx: number;
  thickness: number;   // 0.5-2
  maxLen: number;      // max spiral length
}

interface CollisionEvent {
  frame: number;
  cx: number;          // center x 0-1
  cy: number;          // center y 0-1
  tracks: SpiralTrack[];
}

function precomputeCollisions(
  frames: EnhancedFrameData[],
  masterSeed: number,
): CollisionEvent[] {
  const rng = seeded(masterSeed);
  const events: CollisionEvent[] = [];

  for (let f = 0; f < frames.length; f += CHECK_INTERVAL) {
    // Trigger on beat or strong onset
    if (!frames[f].beat && frames[f].onset < 0.5) continue;

    const active = events.filter((e) => f - e.frame < TRACK_LIFETIME);
    if (active.length >= MAX_ACTIVE_EVENTS) continue;

    const trackCount = 3 + Math.floor(rng() * 3); // 3-5 tracks
    const tracks: SpiralTrack[] = Array.from({ length: trackCount }, () => ({
      angle: rng() * Math.PI * 2,
      curvature: (rng() - 0.5) * 0.08,
      speed: 1.5 + rng() * 3,
      colorIdx: Math.floor(rng() * TRACK_COLORS.length),
      thickness: 0.5 + rng() * 1.5,
      maxLen: 60 + rng() * 100,
    }));

    events.push({
      frame: f,
      cx: 0.15 + rng() * 0.7,
      cy: 0.15 + rng() * 0.7,
      tracks,
    });
  }

  return events;
}

function buildSpiralPath(
  cx: number,
  cy: number,
  track: SpiralTrack,
  age: number,
): string {
  const segments = 30;
  const currentLen = Math.min(track.maxLen, age * track.speed);
  const points: string[] = [];

  let x = cx;
  let y = cy;
  let angle = track.angle;
  const stepLen = currentLen / segments;

  for (let s = 0; s <= segments; s++) {
    points.push(s === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
    angle += track.curvature;
    x += Math.cos(angle) * stepLen;
    y += Math.sin(angle) * stepLen;
  }

  return points.join(" ");
}

interface Props {
  frames: EnhancedFrameData[];
}

export const BubbleChamber: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const _energy = eCount > 0 ? eSum / eCount : 0;

  const collisionEvents = React.useMemo(
    () => precomputeCollisions(frames, 3141_1977),
    [frames],
  );

  // Timing gate
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
  });
  const globalOpacity = Math.min(fadeIn, fadeOut) * 0.65;

  const activeEvents = collisionEvents.filter(
    (e) => frame >= e.frame && frame < e.frame + TRACK_LIFETIME,
  );

  if (activeEvents.length === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: globalOpacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="chamber-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {activeEvents.map((event, ei) => {
          const age = frame - event.frame;
          const eventOpacity = interpolate(age, [0, 10, TRACK_LIFETIME - 20, TRACK_LIFETIME], [0, 1, 0.6, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const ecx = event.cx * width;
          const ecy = event.cy * height;

          return (
            <g key={`event-${event.frame}-${ei}`} opacity={eventOpacity}>
              {/* Collision point flash */}
              {age < 15 && (
                <circle
                  cx={ecx}
                  cy={ecy}
                  r={3 + (15 - age) * 0.5}
                  fill="#FFFFFF"
                  opacity={interpolate(age, [0, 15], [0.8, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })}
                  filter="url(#chamber-glow)"
                />
              )}

              {/* Spiral tracks */}
              {event.tracks.map((track, ti) => {
                const trackPath = buildSpiralPath(ecx, ecy, track, age);
                const color = TRACK_COLORS[track.colorIdx];

                return (
                  <g key={`track-${ti}`}>
                    {/* Glow */}
                    <path
                      d={trackPath}
                      fill="none"
                      stroke={color}
                      strokeWidth={track.thickness + 3}
                      opacity={0.1}
                      strokeLinecap="round"
                    />
                    {/* Core line */}
                    <path
                      d={trackPath}
                      fill="none"
                      stroke={color}
                      strokeWidth={track.thickness}
                      opacity={0.7}
                      strokeLinecap="round"
                      filter="url(#chamber-glow)"
                    />
                    {/* Tiny ionization dots along path */}
                    {age > 5 && Array.from({ length: Math.min(8, Math.floor(age / 4)) }, (_, di) => {
                      const dotT = (di + 1) / 10;
                      const dotLen = Math.min(track.maxLen, age * track.speed) * dotT;
                      let dx = ecx;
                      let dy = ecy;
                      let dAngle = track.angle;
                      const dStep = dotLen / 10;
                      for (let s = 0; s < 10; s++) {
                        dAngle += track.curvature;
                        dx += Math.cos(dAngle) * dStep;
                        dy += Math.sin(dAngle) * dStep;
                      }
                      return (
                        <circle
                          key={`dot-${di}`}
                          cx={dx}
                          cy={dy}
                          r={0.8}
                          fill={color}
                          opacity={0.5}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
