/**
 * GlowSticks — Floating glow stick arcs thrown in the air with trails.
 * Sticks are launched upward on beat frames, follow parabolic arcs with
 * rotation. Each stick leaves a fading trail of its recent positions.
 * Neon colors (green, pink, blue, yellow, orange). Sticks spin as they fly.
 * Triggered deterministically on beats when energy > 0.15.
 * No cycle timer — fires whenever the music warrants it.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";

const STICK_COLORS = [
  { h: 120, s: 100, l: 60 }, // neon green
  { h: 320, s: 100, l: 65 }, // hot pink
  { h: 200, s: 100, l: 60 }, // blue
  { h: 55, s: 100, l: 55 },  // yellow
  { h: 25, s: 100, l: 55 },  // orange
  { h: 280, s: 100, l: 65 }, // purple
];

interface StickData {
  startX: number;
  vx: number;
  vy: number;
  colorIdx: number;
  stickLen: number;
  spinSpeed: number;
  spinPhase: number;
  lifetime: number;
}

interface StickEvent {
  frame: number;
  stick: StickData;
}

const GRAVITY = 0.1;
const MAX_CONCURRENT = 8;
const STICK_LIFETIME = 80;

function precomputeSticks(
  frames: EnhancedFrameData[],
  masterSeed: number,
): StickEvent[] {
  const rng = seeded(masterSeed);
  const events: StickEvent[] = [];

  for (let f = 0; f < frames.length; f++) {
    if (frames[f].beat && frames[f].rms > 0.15) {
      const active = events.filter((e) => f - e.frame < STICK_LIFETIME);
      if (active.length >= MAX_CONCURRENT) continue;

      // Throttle: at least 8 frames between launches
      const lastEvent = events[events.length - 1];
      if (lastEvent && f - lastEvent.frame < 8) continue;

      events.push({
        frame: f,
        stick: {
          startX: 0.15 + rng() * 0.7,
          vx: (rng() - 0.5) * 4,
          vy: -(5 + rng() * 5),
          colorIdx: Math.floor(rng() * STICK_COLORS.length),
          stickLen: 40 + rng() * 30,
          spinSpeed: 0.12 + rng() * 0.2,
          spinPhase: rng() * Math.PI * 2,
          lifetime: 60 + Math.floor(rng() * 30),
        },
      });
    }
  }

  return events;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const GlowSticks: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  // Use shared audio snapshot (replaces inline energy loop)
  const _snap = useAudioSnapshot(frames);

  const stickEvents = React.useMemo(
    () => precomputeSticks(frames, (ctx?.showSeed ?? 19770508)),
    [frames, ctx?.showSeed],
  );

  // Active sticks
  const activeSticks = stickEvents.filter(
    (e) => frame >= e.frame && frame < e.frame + e.stick.lifetime,
  );

  if (activeSticks.length === 0) return null;

  const launchY = height * 0.85;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}>
        {activeSticks.map((event, si) => {
          const age = frame - event.frame;
          const stick = event.stick;

          // Position via physics
          const px = stick.startX * width + stick.vx * age;
          const py = launchY + stick.vy * age + 0.5 * GRAVITY * age * age;

          // Spin
          const rotation = (stick.spinPhase + age * stick.spinSpeed) * (180 / Math.PI);

          // Trail: render last N positions
          const TRAIL_LEN = 8;
          const trailPositions: Array<{ x: number; y: number }> = [];
          for (let t = Math.max(0, age - TRAIL_LEN); t < age; t++) {
            trailPositions.push({
              x: stick.startX * width + stick.vx * t,
              y: launchY + stick.vy * t + 0.5 * GRAVITY * t * t,
            });
          }

          // Fade out
          const lifeProgress = age / stick.lifetime;
          const alpha = interpolate(lifeProgress, [0, 0.1, 0.8, 1], [0.3, 1, 0.8, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          if (alpha < 0.02) return null;

          const color = STICK_COLORS[stick.colorIdx];
          const fillHsl = `hsla(${color.h}, ${color.s}%, ${color.l}%, ${alpha})`;
          const glowHsl = `hsla(${color.h}, 100%, ${color.l + 15}%, ${alpha * 0.5})`;

          const halfLen = stick.stickLen / 2;
          const radians = stick.spinPhase + age * stick.spinSpeed;
          const dx = Math.cos(radians) * halfLen;
          const dy = Math.sin(radians) * halfLen;

          return (
            <g key={`stick-${event.frame}-${si}`}>
              {/* Trail */}
              {trailPositions.map((tp, ti) => {
                const trailAlpha = (ti / TRAIL_LEN) * alpha * 0.4;
                return (
                  <circle
                    key={ti}
                    cx={tp.x}
                    cy={tp.y}
                    r={2}
                    fill={`hsla(${color.h}, ${color.s}%, ${color.l}%, ${trailAlpha})`}
                  />
                );
              })}
              {/* Glow halo */}
              <line
                x1={px - dx}
                y1={py - dy}
                x2={px + dx}
                y2={py + dy}
                stroke={glowHsl}
                strokeWidth={14}
                strokeLinecap="round"
                style={{ filter: `blur(4px)` }}
              />
              {/* Core stick */}
              <line
                x1={px - dx}
                y1={py - dy}
                x2={px + dx}
                y2={py + dy}
                stroke={fillHsl}
                strokeWidth={6}
                strokeLinecap="round"
                style={{
                  filter: `drop-shadow(0 0 6px ${glowHsl})`,
                }}
                transform={`rotate(${rotation - rotation}, ${px}, ${py})`}
              />
              {/* End caps glow */}
              <circle cx={px - dx} cy={py - dy} r={6} fill={fillHsl} style={{ filter: `blur(3px)` }} />
              <circle cx={px + dx} cy={py + dy} r={6} fill={fillHsl} style={{ filter: `blur(3px)` }} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
