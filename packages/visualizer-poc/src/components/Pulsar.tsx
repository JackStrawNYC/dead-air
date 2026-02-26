/**
 * Pulsar — Pulsating neutron star with beam sweeps, pulse rate matches tempo.
 * Central ultra-bright point source with two opposing beam cones that sweep
 * around. Concentric pulse rings emanate outward at beat intervals. Beam
 * sweep speed follows the track's onset strength. Magnetic field lines
 * drawn as subtle ellipses around the core. Positioned center.
 * Cycles: 30s on, 50s off (80s total). Stagger: starts at frame 200.
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

interface PulseRing {
  birthFrame: number;
  speed: number;
  maxRadius: number;
  width: number;
}

const RING_SCHEDULE_LENGTH = 108000;
const RING_INTERVAL = 15;

function generateRingSchedule(seed: number): PulseRing[] {
  const rng = seeded(seed);
  const rings: PulseRing[] = [];
  for (let f = 0; f < RING_SCHEDULE_LENGTH; f += RING_INTERVAL) {
    if (rng() > 0.35) continue;
    rings.push({
      birthFrame: f,
      speed: 2 + rng() * 3,
      maxRadius: 200 + rng() * 300,
      width: 1 + rng() * 2,
    });
  }
  return rings;
}

interface FieldLine {
  tiltDeg: number;
  radiusX: number;
  radiusY: number;
  opacity: number;
}

function generateFieldLines(seed: number, count: number): FieldLine[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    tiltDeg: rng() * 360,
    radiusX: 30 + rng() * 80,
    radiusY: 60 + rng() * 120,
    opacity: 0.08 + rng() * 0.12,
  }));
}

const CYCLE = 2400; // 80s at 30fps
const DURATION = 900; // 30s
const STAGGER_START = 200;
const BEAM_HALF_ANGLE = 0.25; // radians, beam cone half-width

interface Props {
  frames: EnhancedFrameData[];
}

export const Pulsar: React.FC<Props> = ({ frames }) => {
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

  const ringSchedule = React.useMemo(() => generateRingSchedule(66260755), []);
  const fieldLines = React.useMemo(() => generateFieldLines(13807000, 6), []);

  // Stagger gate
  if (frame < STAGGER_START) return null;

  // Timing gate
  const adjustedFrame = frame - STAGGER_START;
  const cycleFrame = adjustedFrame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.5 + energy * 0.4);

  if (masterOpacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const coreRadius = 4 + energy * 4;

  // Beam rotation speed follows onset strength (smoothed)
  let onsetSum = 0;
  let onsetCount = 0;
  for (let i = Math.max(0, idx - 30); i <= Math.min(frames.length - 1, idx + 30); i++) {
    onsetSum += frames[i].onset;
    onsetCount++;
  }
  const onsetAvg = onsetCount > 0 ? onsetSum / onsetCount : 0;

  const beamSpeed = 0.02 + onsetAvg * 0.06;
  const beamAngle = frame * beamSpeed;

  // Beam length scales with energy
  const beamLength = interpolate(energy, [0.03, 0.3], [100, 350], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Find active pulse rings (from beats)
  const activeRings: { ring: PulseRing; age: number }[] = [];
  for (const ring of ringSchedule) {
    const age = frame - ring.birthFrame;
    if (age >= 0 && age < 90) {
      const currentRadius = age * ring.speed;
      if (currentRadius < ring.maxRadius) {
        activeRings.push({ ring, age });
      }
    }
    if (activeRings.length >= 6) break;
    if (ring.birthFrame > frame + 30) break;
  }

  // Beam polygon points
  const makeBeamPath = (baseAngle: number): string => {
    const leftAngle = baseAngle - BEAM_HALF_ANGLE;
    const rightAngle = baseAngle + BEAM_HALF_ANGLE;
    const nearDist = coreRadius * 1.5;
    const farDist = beamLength;

    const x1 = cx + Math.cos(leftAngle) * nearDist;
    const y1 = cy + Math.sin(leftAngle) * nearDist;
    const x2 = cx + Math.cos(rightAngle) * nearDist;
    const y2 = cy + Math.sin(rightAngle) * nearDist;
    const x3 = cx + Math.cos(rightAngle) * farDist;
    const y3 = cy + Math.sin(rightAngle) * farDist;
    const x4 = cx + Math.cos(leftAngle) * farDist;
    const y4 = cy + Math.sin(leftAngle) * farDist;

    return `M ${x1} ${y1} L ${x4} ${y4} L ${x3} ${y3} L ${x2} ${y2} Z`;
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, mixBlendMode: "screen" }}>
        <defs>
          <radialGradient id="pulsar-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="40%" stopColor="#C0D8FF" />
            <stop offset="80%" stopColor="#6090E0" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#4060C0" stopOpacity="0" />
          </radialGradient>
          <filter id="pulsar-bloom">
            <feGaussianBlur stdDeviation="6" result="bloom" />
            <feMerge>
              <feMergeNode in="bloom" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="pulsar-soft">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Magnetic field lines */}
        {fieldLines.map((fl, fi) => (
          <ellipse
            key={`fl${fi}`}
            cx={cx} cy={cy}
            rx={fl.radiusX + energy * 20}
            ry={fl.radiusY + energy * 30}
            fill="none"
            stroke={`rgba(120, 160, 255, ${fl.opacity})`}
            strokeWidth={0.8}
            strokeDasharray="4 6"
            transform={`rotate(${fl.tiltDeg + frame * 0.05}, ${cx}, ${cy})`}
          />
        ))}

        {/* Pulse rings */}
        {activeRings.map(({ ring, age }, ri) => {
          const r = age * ring.speed;
          const lifeProgress = age / 90;
          const ringAlpha = interpolate(lifeProgress, [0, 0.1, 0.8, 1], [0, 0.4, 0.2, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <circle
              key={`pr${ring.birthFrame}-${ri}`}
              cx={cx} cy={cy}
              r={r}
              fill="none"
              stroke={`rgba(150, 180, 255, ${ringAlpha * (0.5 + energy * 0.5)})`}
              strokeWidth={ring.width}
            />
          );
        })}

        {/* Beam cones (two opposing) */}
        <path
          d={makeBeamPath(beamAngle)}
          fill="rgba(160, 200, 255, 0.12)"
          stroke="rgba(180, 210, 255, 0.2)"
          strokeWidth={0.5}
          filter="url(#pulsar-soft)"
        />
        <path
          d={makeBeamPath(beamAngle + Math.PI)}
          fill="rgba(160, 200, 255, 0.12)"
          stroke="rgba(180, 210, 255, 0.2)"
          strokeWidth={0.5}
          filter="url(#pulsar-soft)"
        />

        {/* Core glow */}
        <circle cx={cx} cy={cy} r={coreRadius * 4} fill="url(#pulsar-core)" filter="url(#pulsar-bloom)" />
        <circle cx={cx} cy={cy} r={coreRadius} fill="#FFFFFF" filter="url(#pulsar-bloom)" />
        {/* Core pulse */}
        <circle
          cx={cx} cy={cy}
          r={coreRadius * (1.5 + Math.sin(frame * 0.15) * 0.3)}
          fill="rgba(200, 220, 255, 0.5)"
          filter="url(#pulsar-soft)"
        />
      </svg>
    </div>
  );
};
