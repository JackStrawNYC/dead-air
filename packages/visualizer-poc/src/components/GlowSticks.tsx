/**
 * GlowSticks — A+++ neon glow sticks launched from the crowd into the air.
 *
 * 10-12 sticks in flight simultaneously, launched from the bottom crowd area.
 * Each stick is a rounded-rect tube with 3-layer glow: bright white-hot core,
 * saturated mid glow, and soft outer halo. Realistic parabolic arc physics
 * with per-stick tumble/spin. Trail of 4 fading ghost positions behind each
 * stick. 6 neon colors (green, pink, blue, yellow, orange, purple).
 *
 * Peak hang: sticks near apex glow brighter. Landing: brief flash on impact.
 * Audio: energy drives launch frequency, beatDecay triggers launches,
 * onsetEnvelope bursts 2-3 simultaneous sticks, chromaHue shifts palette,
 * tempoFactor scales physics speed.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ---- Color palette — 6 neon colors, hue-shiftable via chromaHue ---- */

const BASE_COLORS = [
  { h: 120, s: 100, l: 58 }, // neon green
  { h: 320, s: 100, l: 62 }, // hot pink
  { h: 200, s: 100, l: 58 }, // electric blue
  { h: 55, s: 100, l: 55 },  // yellow
  { h: 25, s: 100, l: 55 },  // orange
  { h: 280, s: 100, l: 62 }, // purple
];

function shiftedColor(idx: number, hueShift: number) {
  const base = BASE_COLORS[idx % BASE_COLORS.length];
  return { h: (base.h + hueShift) % 360, s: base.s, l: base.l };
}

function hsl(h: number, s: number, l: number, a: number): string {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

/* ---- Types ---- */

interface StickData {
  startX: number; vx: number; vy: number; colorIdx: number;
  stickLen: number; stickWidth: number; spinSpeed: number;
  spinPhase: number; tumbleAxis: number; lifetime: number;
}

interface StickEvent { frame: number; stick: StickData; }

/* ---- Physics constants ---- */

const GRAVITY = 0.12;
const MAX_CONCURRENT = 12;
const BASE_LIFETIME = 90;
const GHOST_COUNT = 4;
const LAUNCH_Y_FRAC = 0.88;
const MIN_LAUNCH_GAP = 6;
const IMPACT_FLASH_FRAMES = 5;

/* ---- Precompute — deterministic stick launch schedule ---- */

function precomputeSticks(frames: EnhancedFrameData[], masterSeed: number): StickEvent[] {
  const rng = seeded(masterSeed);
  const events: StickEvent[] = [];

  for (let f = 0; f < frames.length; f++) {
    const fd = frames[f];
    const energy = fd.rms ?? 0;
    const isBeat = fd.beat;
    const isOnset = (fd.onset ?? 0) > 0.3;

    const activeCount = events.filter(
      (e) => f >= e.frame && f < e.frame + e.stick.lifetime,
    ).length;

    const lastEvent = events[events.length - 1];
    if (lastEvent && f - lastEvent.frame < MIN_LAUNCH_GAP) continue;

    // Determine how many sticks to launch this frame
    let launchCount = 0;
    if (isOnset && energy > 0.2 && activeCount + 3 <= MAX_CONCURRENT) {
      launchCount = 2 + (rng() > 0.5 ? 1 : 0); // onset burst: 2-3
    } else if (isBeat && energy > 0.12 && activeCount < MAX_CONCURRENT) {
      launchCount = 1;
      if (energy > 0.35 && rng() > 0.4 && activeCount + 2 <= MAX_CONCURRENT) launchCount = 2;
    } else if (energy > 0.4 && rng() > 0.85 && activeCount < MAX_CONCURRENT - 2) {
      launchCount = 1; // high energy fill
    }

    if (launchCount === 0) continue;

    for (let b = 0; b < launchCount; b++) {
      const startX = 0.08 + rng() * 0.84;
      const energyBoost = 1 + energy * 0.8;
      const baseVy = -(6 + rng() * 5) * energyBoost;
      const centerBias = (startX - 0.5) * -1.5;
      const vx = (rng() - 0.5) * 3.5 + centerBias * 0.5;
      const lifetime = BASE_LIFETIME + Math.floor(rng() * 30) + Math.floor(Math.abs(baseVy) * 2);

      events.push({
        frame: f,
        stick: {
          startX, vx, vy: baseVy,
          colorIdx: Math.floor(rng() * BASE_COLORS.length),
          stickLen: 38 + rng() * 28,
          stickWidth: 4 + rng() * 3,
          spinSpeed: 0.08 + rng() * 0.25,
          spinPhase: rng() * Math.PI * 2,
          tumbleAxis: 0.02 + rng() * 0.04,
          lifetime,
        },
      });
    }
  }
  return events;
}

/* ---- Physics helpers ---- */

function getPosition(
  s: StickData, age: number, launchY: number, w: number, ts: number,
): { x: number; y: number } {
  const t = age * ts;
  return { x: s.startX * w + s.vx * t, y: launchY + s.vy * t + 0.5 * GRAVITY * t * t };
}

function getRotation(s: StickData, age: number, ts: number): number {
  const t = age * ts;
  return s.spinPhase + t * s.spinSpeed + Math.sin(t * s.tumbleAxis * 7) * 0.3;
}

/** 0-1: how close to apex (1 = at peak) */
function apexProximity(s: StickData, age: number, ts: number): number {
  const t = age * ts;
  const tApex = -s.vy / GRAVITY;
  return Math.max(0, 1 - Math.abs(t - tApex) / 18);
}

/** Has the stick fallen back below launch height? */
function hasLanded(s: StickData, age: number, launchY: number, w: number, ts: number): boolean {
  const { y } = getPosition(s, age, launchY, w, ts);
  return age > 10 && y >= launchY + 10;
}

/* ---- Component ---- */

interface Props { frames: EnhancedFrameData[]; }

export const GlowSticks: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const stickEvents = React.useMemo(
    () => precomputeSticks(frames, ctx?.showSeed ?? 19770508),
    [frames, ctx?.showSeed],
  );

  const tempoScale = 0.85 + tempoFactor * 0.15;
  const hueShift = (snap.chromaHue ?? 0) * 0.15;
  const launchY = height * LAUNCH_Y_FRAC;

  const activeSticks = stickEvents.filter(
    (e) => frame >= e.frame && frame < e.frame + e.stick.lifetime,
  );

  if (activeSticks.length === 0) return null;

  const midFilter = "glowstick-mid";
  const outerFilter = "glowstick-outer";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}>
        <defs>
          <filter id={midFilter} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <filter id={outerFilter} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        {activeSticks.map((event, si) => {
          const age = frame - event.frame;
          const stick = event.stick;
          const lifeProgress = age / stick.lifetime;

          const pos = getPosition(stick, age, launchY, width, tempoScale);
          if (pos.x < -100 || pos.x > width + 100 || pos.y < -200 || pos.y > height + 100) {
            return null;
          }

          const radians = getRotation(stick, age, tempoScale);
          const halfLen = stick.stickLen / 2;
          const dx = Math.cos(radians) * halfLen;
          const dy = Math.sin(radians) * halfLen;

          // Alpha envelope: quick fade in, long sustain, fade out
          const alpha = interpolate(lifeProgress, [0, 0.06, 0.75, 1], [0.2, 1, 0.85, 0], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          if (alpha < 0.02) return null;

          // Apex: brighter glow when stick hangs at peak
          const apex = apexProximity(stick, age, tempoScale);
          const apexBoost = apex * 12;

          // Landing flash: brief bright burst on impact
          const landed = hasLanded(stick, age, launchY, width, tempoScale);
          const landAge = landed ? Math.max(0, age - (stick.lifetime - IMPACT_FLASH_FRAMES)) : -1;
          const flash = landed && landAge >= 0 && landAge < IMPACT_FLASH_FRAMES
            ? interpolate(landAge, [0, IMPACT_FLASH_FRAMES], [1, 0], {
                extrapolateLeft: "clamp", extrapolateRight: "clamp",
              })
            : 0;

          const color = shiftedColor(stick.colorIdx, hueShift);

          // 3-layer glow: outer halo, mid bloom, bright core
          const outerHsl = hsl(color.h, color.s, color.l - 5, alpha * 0.25);
          const midHsl = hsl(color.h, color.s, color.l + 5 + apexBoost * 0.5, alpha * 0.6);
          const coreHsl = hsl(color.h, color.s - 15, Math.min(95, color.l + 25 + apexBoost), alpha);

          // Ghost trail: 4 fading echo positions
          const ghosts: Array<{ x: number; y: number; a: number; rad: number }> = [];
          for (let g = 1; g <= GHOST_COUNT; g++) {
            const ghostAge = age - g * 3;
            if (ghostAge < 0) continue;
            const gPos = getPosition(stick, ghostAge, launchY, width, tempoScale);
            const gRad = getRotation(stick, ghostAge, tempoScale);
            ghosts.push({ x: gPos.x, y: gPos.y, a: alpha * (1 - g / (GHOST_COUNT + 1)) * 0.35, rad: gRad });
          }

          return (
            <g key={`stick-${event.frame}-${si}`}>
              {/* Ghost trail — fading echoes behind the stick */}
              {ghosts.map((ghost, gi) => {
                const gDx = Math.cos(ghost.rad) * halfLen * 0.9;
                const gDy = Math.sin(ghost.rad) * halfLen * 0.9;
                return (
                  <line
                    key={`g${gi}`}
                    x1={ghost.x - gDx} y1={ghost.y - gDy}
                    x2={ghost.x + gDx} y2={ghost.y + gDy}
                    stroke={hsl(color.h, color.s, color.l + 10, ghost.a)}
                    strokeWidth={stick.stickWidth + 6}
                    strokeLinecap="round"
                    filter={`url(#${midFilter})`}
                  />
                );
              })}

              {/* Layer 1: Outer halo — wide, soft, atmospheric */}
              <line
                x1={pos.x - dx} y1={pos.y - dy} x2={pos.x + dx} y2={pos.y + dy}
                stroke={outerHsl}
                strokeWidth={stick.stickWidth + 22}
                strokeLinecap="round"
                filter={`url(#${outerFilter})`}
              />

              {/* Layer 2: Mid glow — saturated color bloom */}
              <line
                x1={pos.x - dx} y1={pos.y - dy} x2={pos.x + dx} y2={pos.y + dy}
                stroke={midHsl}
                strokeWidth={stick.stickWidth + 10}
                strokeLinecap="round"
                filter={`url(#${midFilter})`}
              />

              {/* Layer 3: Bright core — white-hot center tube */}
              <line
                x1={pos.x - dx} y1={pos.y - dy} x2={pos.x + dx} y2={pos.y + dy}
                stroke={coreHsl}
                strokeWidth={stick.stickWidth}
                strokeLinecap="round"
              />

              {/* End cap glow — bright points at stick tips */}
              <circle
                cx={pos.x - dx} cy={pos.y - dy}
                r={stick.stickWidth * 0.8 + apex * 3}
                fill={coreHsl} filter={`url(#${midFilter})`}
              />
              <circle
                cx={pos.x + dx} cy={pos.y + dy}
                r={stick.stickWidth * 0.8 + apex * 3}
                fill={coreHsl} filter={`url(#${midFilter})`}
              />

              {/* Apex glow pulse — extra bloom when stick hangs at peak */}
              {apex > 0.3 && (
                <circle
                  cx={pos.x} cy={pos.y}
                  r={stick.stickLen * 0.4 * apex}
                  fill={hsl(color.h, color.s, color.l + 20, apex * alpha * 0.15)}
                  filter={`url(#${outerFilter})`}
                />
              )}

              {/* Landing impact flash — brief bright circle on ground hit */}
              {flash > 0.05 && (
                <>
                  <circle
                    cx={pos.x} cy={launchY}
                    r={30 + flash * 40}
                    fill={hsl(color.h, 40, 95, flash * 0.8)}
                    filter={`url(#${outerFilter})`}
                  />
                  <circle
                    cx={pos.x} cy={launchY}
                    r={8 + flash * 15}
                    fill={hsl(color.h, 60, 95, flash * 0.9)}
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
