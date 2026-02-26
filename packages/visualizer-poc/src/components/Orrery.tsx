/**
 * Orrery — Mechanical solar system model, planet speeds follow spectral bands.
 * Central sun with concentric orbit rings. Each planet orbits at a speed driven
 * by a different spectral band (sub, low, mid, high). Planet sizes and colors
 * vary. Orbit lines are thin, elegant. Moons orbit some planets. Gear-like
 * decorative elements at pivot points. Energy scales overall animation speed
 * and planet glow. Positioned center. Cycles: 40s on, 45s off (85s total).
 * Stagger: starts at frame 600.
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

interface Planet {
  name: string;
  orbitRadius: number; // normalized 0-1
  baseSpeed: number;
  size: number;
  hue: number;
  saturation: number;
  lightness: number;
  spectralBand: "sub" | "low" | "mid" | "high";
  hasMoon: boolean;
  moonOrbitRadius: number;
  moonSpeed: number;
  moonSize: number;
}

interface GearDecor {
  radius: number;
  teeth: number;
  toothSize: number;
  rotSpeed: number;
  angle: number;
}

function generatePlanets(): Planet[] {
  return [
    { name: "Mercury", orbitRadius: 0.12, baseSpeed: 0.04, size: 3, hue: 35, saturation: 50, lightness: 65, spectralBand: "high", hasMoon: false, moonOrbitRadius: 0, moonSpeed: 0, moonSize: 0 },
    { name: "Venus", orbitRadius: 0.2, baseSpeed: 0.028, size: 4.5, hue: 45, saturation: 70, lightness: 70, spectralBand: "high", hasMoon: false, moonOrbitRadius: 0, moonSpeed: 0, moonSize: 0 },
    { name: "Earth", orbitRadius: 0.3, baseSpeed: 0.02, size: 5, hue: 210, saturation: 65, lightness: 55, spectralBand: "mid", hasMoon: true, moonOrbitRadius: 12, moonSpeed: 0.06, moonSize: 1.8 },
    { name: "Mars", orbitRadius: 0.4, baseSpeed: 0.015, size: 4, hue: 10, saturation: 75, lightness: 50, spectralBand: "mid", hasMoon: true, moonOrbitRadius: 9, moonSpeed: 0.08, moonSize: 1.2 },
    { name: "Jupiter", orbitRadius: 0.55, baseSpeed: 0.008, size: 9, hue: 30, saturation: 55, lightness: 60, spectralBand: "low", hasMoon: true, moonOrbitRadius: 16, moonSpeed: 0.05, moonSize: 2 },
    { name: "Saturn", orbitRadius: 0.7, baseSpeed: 0.005, size: 7.5, hue: 42, saturation: 45, lightness: 65, spectralBand: "low", hasMoon: false, moonOrbitRadius: 0, moonSpeed: 0, moonSize: 0 },
    { name: "Uranus", orbitRadius: 0.82, baseSpeed: 0.003, size: 6, hue: 180, saturation: 50, lightness: 60, spectralBand: "sub", hasMoon: false, moonOrbitRadius: 0, moonSpeed: 0, moonSize: 0 },
    { name: "Neptune", orbitRadius: 0.93, baseSpeed: 0.002, size: 5.5, hue: 230, saturation: 65, lightness: 50, spectralBand: "sub", hasMoon: true, moonOrbitRadius: 11, moonSpeed: 0.04, moonSize: 1.5 },
  ];
}

function generateGears(seed: number): GearDecor[] {
  const rng = seeded(seed);
  return Array.from({ length: 4 }, (_, i) => ({
    radius: 8 + rng() * 6,
    teeth: 8 + Math.floor(rng() * 8),
    toothSize: 2 + rng() * 2,
    rotSpeed: 0.01 + rng() * 0.02,
    angle: rng() * Math.PI * 2,
  }));
}

const CYCLE = 2550; // 85s at 30fps
const DURATION = 1200; // 40s
const STAGGER_START = 600;

interface Props {
  frames: EnhancedFrameData[];
}

export const Orrery: React.FC<Props> = ({ frames }) => {
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

  const planets = React.useMemo(() => generatePlanets(), []);
  const gears = React.useMemo(() => generateGears(98765432), []);

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
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.45 + energy * 0.35);

  if (masterOpacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxOrbit = Math.min(width, height) * 0.38;

  // Spectral band values
  const spectral = {
    sub: frames[idx]?.sub ?? 0,
    low: frames[idx]?.low ?? 0,
    mid: frames[idx]?.mid ?? 0,
    high: frames[idx]?.high ?? 0,
  };

  // Overall speed multiplier from energy
  const speedMult = 0.5 + energy * 2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <radialGradient id="orrery-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="40%" stopColor="#FFE860" />
            <stop offset="70%" stopColor="#FFA500" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#FF6600" stopOpacity="0" />
          </radialGradient>
          <filter id="orrery-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Orbit rings */}
        {planets.map((planet, pi) => {
          const orbitR = planet.orbitRadius * maxOrbit;
          return (
            <circle
              key={`orbit${pi}`}
              cx={cx} cy={cy}
              r={orbitR}
              fill="none"
              stroke="rgba(120, 140, 180, 0.15)"
              strokeWidth={0.5}
              strokeDasharray="3 4"
            />
          );
        })}

        {/* Gear decorations at a few orbit intersections */}
        {gears.map((gear, gi) => {
          const gearOrbit = planets[gi * 2]?.orbitRadius ?? 0.3;
          const gearAngle = gear.angle + frame * gear.rotSpeed;
          const gx = cx + Math.cos(gearAngle) * gearOrbit * maxOrbit * 0.5;
          const gy = cy + Math.sin(gearAngle) * gearOrbit * maxOrbit * 0.5;
          const gearRotation = frame * gear.rotSpeed * 50;

          // Draw gear teeth as small rectangles around a circle
          return (
            <g key={`gear${gi}`} opacity={0.12 + energy * 0.1}>
              <circle
                cx={gx} cy={gy}
                r={gear.radius}
                fill="none"
                stroke="rgba(160, 170, 200, 0.3)"
                strokeWidth={0.8}
              />
              {Array.from({ length: gear.teeth }, (_, ti) => {
                const toothAngle = (gearRotation * Math.PI / 180) + (ti / gear.teeth) * Math.PI * 2;
                const innerR = gear.radius;
                const outerR = gear.radius + gear.toothSize;
                return (
                  <line
                    key={`t${ti}`}
                    x1={gx + Math.cos(toothAngle) * innerR}
                    y1={gy + Math.sin(toothAngle) * innerR}
                    x2={gx + Math.cos(toothAngle) * outerR}
                    y2={gy + Math.sin(toothAngle) * outerR}
                    stroke="rgba(160, 170, 200, 0.25)"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          );
        })}

        {/* Sun */}
        <circle cx={cx} cy={cy} r={12 + energy * 4} fill="url(#orrery-sun)" filter="url(#orrery-glow)" />
        <circle cx={cx} cy={cy} r={5} fill="#FFFFFF" opacity={0.8} />

        {/* Planets */}
        {planets.map((planet, pi) => {
          const orbitR = planet.orbitRadius * maxOrbit;
          // Speed modulated by its spectral band
          const bandVal = spectral[planet.spectralBand];
          const planetSpeed = planet.baseSpeed * speedMult * (0.5 + bandVal * 2);
          const angle = frame * planetSpeed;

          const px = cx + Math.cos(angle) * orbitR;
          const py = cy + Math.sin(angle) * orbitR;

          const glowAlpha = interpolate(energy, [0.05, 0.3], [0.1, 0.4], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <g key={`planet${pi}`}>
              {/* Planet glow */}
              <circle
                cx={px} cy={py}
                r={planet.size * 2.5}
                fill={`hsla(${planet.hue}, ${planet.saturation}%, ${planet.lightness}%, ${glowAlpha})`}
                style={{ filter: "blur(4px)" }}
              />
              {/* Planet body */}
              <circle
                cx={px} cy={py}
                r={planet.size}
                fill={`hsl(${planet.hue}, ${planet.saturation}%, ${planet.lightness}%)`}
              />
              {/* Saturn ring */}
              {planet.name === "Saturn" && (
                <ellipse
                  cx={px} cy={py}
                  rx={planet.size * 2}
                  ry={planet.size * 0.6}
                  fill="none"
                  stroke={`hsla(${planet.hue}, 40%, 70%, 0.5)`}
                  strokeWidth={1.5}
                  transform={`rotate(${15}, ${px}, ${py})`}
                />
              )}
              {/* Connecting arm line from sun to planet */}
              <line
                x1={cx} y1={cy}
                x2={px} y2={py}
                stroke="rgba(140, 150, 180, 0.06)"
                strokeWidth={0.5}
              />
              {/* Moon */}
              {planet.hasMoon && (
                <circle
                  cx={px + Math.cos(frame * planet.moonSpeed) * planet.moonOrbitRadius}
                  cy={py + Math.sin(frame * planet.moonSpeed) * planet.moonOrbitRadius}
                  r={planet.moonSize}
                  fill="rgba(200, 210, 230, 0.7)"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
