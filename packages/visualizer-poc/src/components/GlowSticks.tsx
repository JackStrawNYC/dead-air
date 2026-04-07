/**
 * GlowSticks — A+++ overlay: a sea of glow sticks waved by the crowd, with
 * vibrant colored streaks arcing across the frame. 60+ sticks held by
 * silhouetted hands at the bottom, each leaving a fading neon trail. Stage
 * truss in the back. Smoke and atmospheric haze. Pink, cyan, green, yellow,
 * red, blue. Each stick rotates and the trail tracks its swing path.
 *
 * Audio reactivity:
 *   slowEnergy   → trail length and saturation
 *   energy       → swing amplitude
 *   bass         → wave amplitude across the crowd
 *   beatDecay    → simultaneous brightness pulse
 *   onsetEnvelope→ flash/burst
 *   chromaHue    → color rotation
 *   tempoFactor  → swing speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 800;
const STICK_COUNT = 64;
const TRAIL_SAMPLES = 14;
const HAND_COUNT = 18;
const SMOKE_COUNT = 12;
const STAR_COUNT = 50;

interface Stick {
  baseX: number;
  baseY: number;
  swingFreq: number;
  swingAmp: number;
  swingPhase: number;
  hueOffset: number;
  length: number;
  spinSpeed: number;
  spinPhase: number;
  thickness: number;
}

interface Hand {
  x: number;
  y: number;
  size: number;
  bobPhase: number;
}

interface SmokeBlob {
  x: number;
  y: number;
  rx: number;
  ry: number;
  drift: number;
  phase: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

function buildSticks(): Stick[] {
  const rng = seeded(50_998_217);
  return Array.from({ length: STICK_COUNT }, () => ({
    baseX: rng(),
    baseY: 0.50 + rng() * 0.42,
    swingFreq: 0.025 + rng() * 0.040,
    swingAmp: 0.6 + rng() * 0.7,
    swingPhase: rng() * Math.PI * 2,
    hueOffset: rng() * 360,
    length: 22 + rng() * 24,
    spinSpeed: 0.04 + rng() * 0.10,
    spinPhase: rng() * Math.PI * 2,
    thickness: 2.4 + rng() * 1.6,
  }));
}

function buildHands(): Hand[] {
  const rng = seeded(72_117_002);
  return Array.from({ length: HAND_COUNT }, (_, i) => ({
    x: (i + 0.5 + rng() * 0.2) / HAND_COUNT,
    y: 0.92 + rng() * 0.06,
    size: 0.85 + rng() * 0.30,
    bobPhase: rng() * Math.PI * 2,
  }));
}

function buildSmoke(): SmokeBlob[] {
  const rng = seeded(38_779_115);
  return Array.from({ length: SMOKE_COUNT }, () => ({
    x: rng(),
    y: 0.30 + rng() * 0.30,
    rx: 0.10 + rng() * 0.18,
    ry: 0.04 + rng() * 0.05,
    drift: 0.0001 + rng() * 0.00040,
    phase: rng() * Math.PI * 2,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(94_002_337);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.30,
    size: 0.4 + rng() * 1.5,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const GlowSticks: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const sticks = React.useMemo(buildSticks, []);
  const hands = React.useMemo(buildHands, []);
  const smoke = React.useMemo(buildSmoke, []);
  const stars = React.useMemo(buildStars, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const trailGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const energy = snap.energy;
  const bass = snap.bass;
  const beatPulse = 1 + snap.beatDecay * 0.35;
  const onsetFlare = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  const baseHueShift = (snap.chromaHue - 180) * 0.6;
  const skyTop = `hsl(${(260 + baseHueShift) % 360}, 30%, 5%)`;
  const skyMid = `hsl(${(280 + baseHueShift) % 360}, 28%, 9%)`;
  const skyHorizon = `hsl(${(310 + baseHueShift) % 360}, 38%, 15%)`;

  const horizonY = height * 0.42;
  const stageY = height * 0.40;
  const stageH = height * 0.10;

  // Stick + trail renderer
  const stickNodes = sticks.map((s, i) => {
    const baseX = s.baseX * width;
    const baseY = s.baseY * height;
    const swingT = frame * s.swingFreq * tempoFactor + s.swingPhase;
    const stickAngle = Math.sin(swingT) * s.swingAmp + Math.sin(frame * s.spinSpeed + s.spinPhase) * 0.3;
    const swingTilt = stickAngle - Math.PI / 2;
    const len = s.length * (1 + energy * 0.20) * beatPulse;
    const hue = (s.hueOffset + baseHueShift + frame * 0.2) % 360;
    const stickColor = `hsl(${hue}, 100%, 65%)`;
    const stickCore = `hsl(${hue}, 100%, 88%)`;
    const stickGlow = `hsl(${hue}, 95%, 55%)`;

    // Trail of past positions (interpolated swing samples)
    const trailPaths: React.ReactNode[] = [];
    let prevX: number | null = null;
    let prevY: number | null = null;
    for (let t = 0; t < TRAIL_SAMPLES; t++) {
      const past = -t * 1.8;
      const ang = Math.sin(swingT + past * s.swingFreq * 0.5) * s.swingAmp + Math.sin((frame + past) * s.spinSpeed + s.spinPhase) * 0.3;
      const tilt = ang - Math.PI / 2;
      const tipX = baseX + Math.cos(tilt) * len;
      const tipY = baseY + Math.sin(tilt) * len;
      if (prevX !== null && prevY !== null) {
        const opacity = (1 - t / TRAIL_SAMPLES) * 0.55 * trailGlow;
        trailPaths.push(
          <line
            key={`tr-${i}-${t}`}
            x1={prevX}
            y1={prevY}
            x2={tipX}
            y2={tipY}
            stroke={stickColor}
            strokeWidth={s.thickness * 1.2 * (1 - t / TRAIL_SAMPLES)}
            strokeLinecap="round"
            opacity={opacity}
          />,
        );
      }
      prevX = tipX;
      prevY = tipY;
    }

    const tipX = baseX + Math.cos(swingTilt) * len;
    const tipY = baseY + Math.sin(swingTilt) * len;
    const midX = baseX + Math.cos(swingTilt) * len * 0.5;
    const midY = baseY + Math.sin(swingTilt) * len * 0.5;

    return (
      <g key={`stick-${i}`}>
        {/* Trail (fading) */}
        <g style={{ mixBlendMode: "screen" }}>{trailPaths}</g>

        {/* Outer stick glow */}
        <line
          x1={baseX}
          y1={baseY}
          x2={tipX}
          y2={tipY}
          stroke={stickGlow}
          strokeWidth={s.thickness * 4 * beatPulse}
          strokeLinecap="round"
          opacity={0.18 * trailGlow}
          style={{ mixBlendMode: "screen" }}
        />
        {/* Mid stick */}
        <line
          x1={baseX}
          y1={baseY}
          x2={tipX}
          y2={tipY}
          stroke={stickColor}
          strokeWidth={s.thickness * 1.8}
          strokeLinecap="round"
          opacity={0.55 * trailGlow}
          style={{ mixBlendMode: "screen" }}
        />
        {/* Bright core */}
        <line
          x1={baseX}
          y1={baseY}
          x2={tipX}
          y2={tipY}
          stroke={stickCore}
          strokeWidth={s.thickness * 0.7}
          strokeLinecap="round"
          opacity={0.95}
          style={{ mixBlendMode: "screen" }}
        />
        {/* Tip dot */}
        <circle cx={tipX} cy={tipY} r={s.thickness * 1.6 * beatPulse} fill={stickCore} opacity={0.9} style={{ mixBlendMode: "screen" }} />
        <circle cx={tipX} cy={tipY} r={s.thickness * 4} fill={stickColor} opacity={0.32 * trailGlow} style={{ mixBlendMode: "screen" }} />
        {/* Mid sparkle */}
        <circle cx={midX} cy={midY} r={s.thickness * 0.8} fill={stickCore} opacity={0.7} style={{ mixBlendMode: "screen" }} />
      </g>
    );
  });

  // Hand silhouettes at the bottom
  const handNodes = hands.map((h, i) => {
    const px = h.x * width;
    const py = h.y * height;
    const bob = Math.sin(frame * 0.025 + h.bobPhase) * (2 + bass * 4);
    const figH = 100 * h.size;
    const fill = "rgba(6, 4, 12, 0.95)";
    return (
      <g key={`hand-${i}`}>
        {/* shoulders */}
        <ellipse cx={px} cy={py + bob + figH * 0.05} rx={figH * 0.30} ry={figH * 0.10} fill={fill} />
        {/* head */}
        <circle cx={px} cy={py - figH * 0.18 + bob} r={figH * 0.12} fill={fill} />
        {/* raised arm */}
        <path
          d={`M ${px - figH * 0.10} ${py + bob}
              Q ${px - figH * 0.05} ${py - figH * 0.45 + bob} ${px - figH * 0.02} ${py - figH * 0.55 + bob}`}
          stroke={fill}
          strokeWidth={figH * 0.10}
          strokeLinecap="round"
          fill="none"
        />
      </g>
    );
  });

  // Smoke
  const smokeNodes = smoke.map((c, i) => {
    const drift = (c.x + frame * c.drift) % 1.2 - 0.1;
    const breath = 1 + Math.sin(frame * 0.012 + c.phase) * 0.06;
    return (
      <ellipse
        key={`sm-${i}`}
        cx={drift * width}
        cy={c.y * height}
        rx={c.rx * width * breath}
        ry={c.ry * height * breath}
        fill={`rgba(40, 30, 60, ${0.40 + trailGlow * 0.20})`}
      />
    );
  });

  // Stars
  const starNodes = stars.map((s, i) => {
    const tw = 0.5 + Math.sin(frame * 0.05 + s.phase) * 0.45;
    return <circle key={`star-${i}`} cx={s.x * width} cy={s.y * height} r={s.size * tw} fill="rgba(240, 232, 220, 0.85)" />;
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="gs-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="gs-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(8, 4, 16, 0.4)" />
            <stop offset="100%" stopColor="rgba(2, 1, 6, 0.95)" />
          </linearGradient>
          <filter id="gs-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#gs-sky)" />

        {/* Stars */}
        <g>{starNodes}</g>

        {/* Distant stage truss */}
        <g opacity={0.72}>
          <rect x={width * 0.18} y={stageY - 4} width={width * 0.64} height={4} fill="rgba(18, 14, 22, 0.95)" />
          <rect x={width * 0.18} y={stageY - 4} width={5} height={stageH + 4} fill="rgba(18, 14, 22, 0.95)" />
          <rect x={width * 0.82 - 5} y={stageY - 4} width={5} height={stageH + 4} fill="rgba(18, 14, 22, 0.95)" />
          {Array.from({ length: 14 }).map((_, i) => (
            <line
              key={`tr-${i}`}
              x1={width * 0.18 + i * (width * 0.64 / 14)}
              y1={stageY}
              x2={width * 0.18 + (i + 1) * (width * 0.64 / 14)}
              y2={stageY + 4}
              stroke="rgba(28, 22, 32, 0.7)"
              strokeWidth={1}
            />
          ))}
        </g>

        {/* Distant band */}
        <g>
          {[0.40, 0.50, 0.60].map((px, i) => {
            const x = px * width;
            const y = stageY + stageH;
            const figH = stageH * 0.85;
            return (
              <g key={`bd-${i}`}>
                <ellipse cx={x} cy={y - figH * 0.4} rx={figH * 0.18} ry={figH * 0.45} fill="rgba(6, 3, 12, 0.98)" />
                <circle cx={x} cy={y - figH * 0.85} r={figH * 0.10} fill="rgba(6, 3, 12, 0.98)" />
              </g>
            );
          })}
        </g>

        {/* Smoke layer */}
        <g filter="url(#gs-blur)">{smokeNodes}</g>

        {/* Onset flash */}
        {onsetFlare > 0 && (
          <rect width={width} height={height} fill={`hsla(${(280 + baseHueShift) % 360}, 80%, 80%, ${onsetFlare * 0.10})`} />
        )}

        {/* Floor wash */}
        <rect x={0} y={horizonY} width={width} height={height - horizonY} fill="url(#gs-floor)" />

        {/* Hand silhouettes (bottom layer) */}
        <g>{handNodes}</g>

        {/* Glow stick streaks (top layer, dominant) */}
        <g>{stickNodes}</g>

        {/* Final neon wash */}
        <rect
          width={width}
          height={height}
          fill={`hsla(${(290 + baseHueShift) % 360}, 80%, 60%, ${0.04 + trailGlow * 0.04})`}
          style={{ mixBlendMode: "screen" }}
        />
      </svg>
    </div>
  );
};
