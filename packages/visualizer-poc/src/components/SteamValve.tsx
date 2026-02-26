/**
 * SteamValve — Pressure gauge with needle + steam release bursts on high energy.
 * Large circular pressure gauge with a sweeping needle. When energy exceeds
 * threshold, a side valve opens and steam particles burst out.
 * Gauge face has tick marks and a red danger zone. Brass/copper piping aesthetic.
 * Positioned right-center. Cycle: 30s on, 25s off (55s = 1650f).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1650; // 55s at 30fps
const DURATION = 900; // 30s visible
const NUM_TICKS = 20;
const STEAM_PARTICLES = 25;

interface SteamParticle {
  angle: number;
  speed: number;
  size: number;
  driftY: number;
  lifespan: number;
  phaseOffset: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SteamValve: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate steam particles
  const steamParticles = React.useMemo((): SteamParticle[] => {
    const rng = seeded(88442);
    return Array.from({ length: STEAM_PARTICLES }, () => ({
      angle: (rng() - 0.5) * 0.8, // mostly rightward
      speed: 3 + rng() * 7,
      size: 3 + rng() * 8,
      driftY: (rng() - 0.5) * 3,
      lifespan: 20 + Math.floor(rng() * 30),
      phaseOffset: Math.floor(rng() * 50),
    }));
  }, []);

  // Tick mark positions
  const tickMarks = React.useMemo(() => {
    return Array.from({ length: NUM_TICKS + 1 }, (_, i) => {
      const angle = -Math.PI * 0.75 + (i / NUM_TICKS) * Math.PI * 1.5;
      const isMajor = i % 5 === 0;
      return { angle, isMajor };
    });
  }, []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Gauge geometry
  const gaugeCx = width * 0.78;
  const gaugeCy = height * 0.5;
  const gaugeR = 70;

  // Needle angle: maps energy 0-1 to gauge sweep (-135 to +135 degrees)
  const needleAngle = -Math.PI * 0.75 + energy * Math.PI * 1.5;
  const needleLen = gaugeR * 0.75;
  const needleX = Math.cos(needleAngle) * needleLen;
  const needleY = Math.sin(needleAngle) * needleLen;

  // Needle wobble for liveliness
  const wobble = Math.sin(frame * 0.3) * 0.03 * energy;
  const displayAngle = needleAngle + wobble;
  const displayNeedleX = Math.cos(displayAngle) * needleLen;
  const displayNeedleY = Math.sin(displayAngle) * needleLen;

  // Steam release threshold
  const steamActive = energy > 0.2;
  const steamIntensity = steamActive
    ? interpolate(energy, [0.2, 0.5], [0.2, 1.0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  // Valve position (pipe exit point)
  const valveX = gaugeCx + gaugeR + 30;
  const valveY = gaugeCy;

  // Danger zone color intensity
  const dangerGlow = interpolate(energy, [0.3, 0.5], [0, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity, willChange: "opacity" }}>
        <defs>
          <filter id="valve-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="gauge-face" cx="45%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#37474F" />
            <stop offset="80%" stopColor="#1A1A1A" />
            <stop offset="100%" stopColor="#0D0D0D" />
          </radialGradient>
        </defs>

        {/* Pipe connecting gauge to valve */}
        <line
          x1={gaugeCx + gaugeR}
          y1={gaugeCy}
          x2={valveX}
          y2={valveY}
          stroke="#B87333"
          strokeWidth={8}
          opacity={0.5}
          strokeLinecap="round"
        />

        {/* Gauge outer ring (brass) */}
        <circle
          cx={gaugeCx}
          cy={gaugeCy}
          r={gaugeR + 6}
          fill="none"
          stroke="#B87333"
          strokeWidth={5}
          opacity={0.6}
        />
        <circle
          cx={gaugeCx}
          cy={gaugeCy}
          r={gaugeR + 2}
          fill="none"
          stroke="#D4945A"
          strokeWidth={1}
          opacity={0.3}
        />

        {/* Gauge face */}
        <circle
          cx={gaugeCx}
          cy={gaugeCy}
          r={gaugeR}
          fill="url(#gauge-face)"
          opacity={0.8}
        />

        {/* Danger zone arc (last 30% of sweep) */}
        {(() => {
          const dangerStart = -Math.PI * 0.75 + Math.PI * 1.5 * 0.7;
          const dangerEnd = -Math.PI * 0.75 + Math.PI * 1.5;
          const arcR = gaugeR - 8;
          const x1 = gaugeCx + Math.cos(dangerStart) * arcR;
          const y1 = gaugeCy + Math.sin(dangerStart) * arcR;
          const x2 = gaugeCx + Math.cos(dangerEnd) * arcR;
          const y2 = gaugeCy + Math.sin(dangerEnd) * arcR;
          return (
            <path
              d={`M ${x1} ${y1} A ${arcR} ${arcR} 0 0 1 ${x2} ${y2}`}
              fill="none"
              stroke="#E53935"
              strokeWidth={6}
              opacity={0.3 + dangerGlow}
            />
          );
        })()}

        {/* Tick marks */}
        {tickMarks.map((tick, ti) => {
          const innerR = tick.isMajor ? gaugeR - 18 : gaugeR - 12;
          const outerR = gaugeR - 4;
          const x1 = gaugeCx + Math.cos(tick.angle) * innerR;
          const y1 = gaugeCy + Math.sin(tick.angle) * innerR;
          const x2 = gaugeCx + Math.cos(tick.angle) * outerR;
          const y2 = gaugeCy + Math.sin(tick.angle) * outerR;
          const isInDanger = ti / NUM_TICKS > 0.7;
          return (
            <line
              key={`tick-${ti}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isInDanger ? "#E53935" : "#90A4AE"}
              strokeWidth={tick.isMajor ? 2 : 1}
              opacity={tick.isMajor ? 0.7 : 0.4}
            />
          );
        })}

        {/* Needle */}
        <line
          x1={gaugeCx}
          y1={gaugeCy}
          x2={gaugeCx + displayNeedleX}
          y2={gaugeCy + displayNeedleY}
          stroke="#E53935"
          strokeWidth={2.5}
          opacity={0.8}
          strokeLinecap="round"
        />

        {/* Needle hub */}
        <circle cx={gaugeCx} cy={gaugeCy} r={5} fill="#B87333" opacity={0.7} />
        <circle cx={gaugeCx} cy={gaugeCy} r={2.5} fill="#D4945A" opacity={0.5} />

        {/* Glass highlight on gauge */}
        <ellipse
          cx={gaugeCx - gaugeR * 0.2}
          cy={gaugeCy - gaugeR * 0.25}
          rx={gaugeR * 0.35}
          ry={gaugeR * 0.2}
          fill="#FFFFFF"
          opacity={0.04}
        />

        {/* Valve body */}
        <rect
          x={valveX - 8}
          y={valveY - 12}
          width={16}
          height={24}
          rx={3}
          fill="#B87333"
          opacity={0.6}
        />
        {/* Valve handle */}
        <rect
          x={valveX - 12}
          y={valveY - 16}
          width={24}
          height={6}
          rx={2}
          fill="#D4945A"
          opacity={0.5}
          transform={`rotate(${steamActive ? 45 : 0}, ${valveX}, ${valveY - 13})`}
        />

        {/* Steam particles */}
        {steamActive && steamParticles.map((p, pi) => {
          const age = ((cycleFrame + p.phaseOffset) % p.lifespan) / p.lifespan;
          const px = valveX + 15 + Math.cos(p.angle) * p.speed * age * 30;
          const py = valveY + Math.sin(p.angle) * p.speed * age * 15 + p.driftY * age * 20;
          const r = p.size * interpolate(age, [0, 0.3, 1], [0.3, 1, 1.5], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const pOpacity = interpolate(age, [0, 0.15, 0.5, 1], [0, 0.5, 0.3, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) * steamIntensity;
          if (pOpacity < 0.02) return null;
          return (
            <circle
              key={`steam-${pi}`}
              cx={px}
              cy={py}
              r={r}
              fill="#B0BEC5"
              opacity={pOpacity}
            />
          );
        })}

        {/* Mounting bolts on pipe */}
        {[0.3, 0.7].map((t) => {
          const bx = gaugeCx + gaugeR + (valveX - gaugeCx - gaugeR) * t;
          return (
            <React.Fragment key={`bolt-${t}`}>
              <circle cx={bx} cy={valveY - 6} r={2.5} fill="#78909C" opacity={0.4} />
              <circle cx={bx} cy={valveY + 6} r={2.5} fill="#78909C" opacity={0.4} />
            </React.Fragment>
          );
        })}
      </svg>
    </div>
  );
};
