/**
 * Moth — 5-8 moths circling a central light source. Flight paths are elliptical
 * orbits with spectral data driving orbit eccentricity and speed. Wings flutter
 * rapidly. Moths are drawn to the light more intensely at higher energy.
 * Dusty brown/tan wings with subtle eye-spot patterns. Light source pulses
 * with energy.
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

const CYCLE = 1800;   // 60s
const DURATION = 600;  // 20s
const MAX_MOTHS = 7;

interface MothData {
  orbitRx: number;    // base x radius
  orbitRy: number;    // base y radius
  orbitSpeed: number; // radians per frame
  orbitPhase: number; // starting angle
  wingSpeed: number;
  wingPhase: number;
  size: number;
  hue: number;        // base hue (dusty browns)
  tilt: number;       // orbit tilt in degrees
  spotCount: number;
}

function generate(seed: number): MothData[] {
  const rng = mulberry32(seed);
  return Array.from({ length: MAX_MOTHS }, () => ({
    orbitRx: 60 + rng() * 120,
    orbitRy: 40 + rng() * 80,
    orbitSpeed: 0.015 + rng() * 0.025,
    orbitPhase: rng() * Math.PI * 2,
    wingSpeed: 0.3 + rng() * 0.3,
    wingPhase: rng() * Math.PI * 2,
    size: 10 + rng() * 10,
    hue: 25 + rng() * 25,  // 25-50: dusty tan/brown
    tilt: (rng() - 0.5) * 30,
    spotCount: 1 + Math.floor(rng() * 3),
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Moth: React.FC<Props> = ({ frames }) => {
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

  const moths = React.useMemo(() => generate(227733), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.7;
  if (masterOpacity < 0.01) return null;

  const frameData = frames[idx];
  const contrast = frameData?.contrast ?? [0, 0, 0, 0, 0, 0, 0];
  const centroid = frameData?.centroid ?? 0;

  /* light source center */
  const lightX = width * 0.55;
  const lightY = height * 0.35;
  const lightPulse = 0.6 + energy * 0.8;
  const lightRadius = 15 + energy * 20;

  /* attraction: higher energy = tighter orbits */
  const attraction = interpolate(energy, [0.03, 0.3], [1.0, 0.5], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  /* spectral data modulates orbit shape */
  const spectralMod = centroid * 0.5;

  const visibleCount = Math.floor(
    interpolate(energy, [0.02, 0.2], [3, MAX_MOTHS], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    }),
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <radialGradient id="moth-light-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFDE7" stopOpacity={lightPulse} />
            <stop offset="40%" stopColor="#FFF9C4" stopOpacity={lightPulse * 0.5} />
            <stop offset="100%" stopColor="#FFF9C4" stopOpacity={0} />
          </radialGradient>
          <filter id="moth-light-glow">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* light source */}
        <g filter="url(#moth-light-glow)">
          <circle cx={lightX} cy={lightY} r={lightRadius * 3} fill="url(#moth-light-grad)" />
          <circle cx={lightX} cy={lightY} r={lightRadius} fill="#FFFDE7" opacity={lightPulse * 0.6} />
          <circle cx={lightX} cy={lightY} r={lightRadius * 0.4} fill="#FFF" opacity={lightPulse * 0.8} />
        </g>

        {/* moths */}
        {moths.slice(0, visibleCount).map((m, mi) => {
          /* orbit eccentricity modulated by spectral contrast */
          const contrastBand = contrast[mi % 7];
          const rx = m.orbitRx * attraction * (1 + spectralMod * 0.3 + contrastBand * 0.2);
          const ry = m.orbitRy * attraction * (1 - spectralMod * 0.2);

          /* orbit speed increases with energy */
          const speed = m.orbitSpeed * (1 + energy * 2);
          const angle = frame * speed + m.orbitPhase;

          /* position on elliptical orbit around light */
          const tiltRad = (m.tilt * Math.PI) / 180;
          const rawX = Math.cos(angle) * rx;
          const rawY = Math.sin(angle) * ry;
          const mx = lightX + rawX * Math.cos(tiltRad) - rawY * Math.sin(tiltRad);
          const my = lightY + rawX * Math.sin(tiltRad) + rawY * Math.cos(tiltRad);

          /* heading: tangent to orbit */
          const headingAngle = Math.atan2(
            Math.cos(angle) * ry * Math.cos(tiltRad) + Math.cos(angle) * rx * Math.sin(tiltRad),
            -Math.sin(angle) * rx * Math.cos(tiltRad) + Math.sin(angle) * ry * Math.sin(tiltRad)
          ) * (180 / Math.PI);

          /* wing flutter */
          const flutter = Math.sin(frame * m.wingSpeed + m.wingPhase);
          const wingScale = 0.2 + (flutter + 1) * 0.4;

          const s = m.size;
          const bodyColor = `hsl(${m.hue}, 30%, 30%)`;
          const wingColor = `hsla(${m.hue}, 25%, 45%, 0.6)`;
          const wingEdge = `hsla(${m.hue}, 20%, 35%, 0.8)`;

          return (
            <g key={mi} transform={`translate(${mx}, ${my}) rotate(${headingAngle})`}>
              {/* body */}
              <ellipse cx={0} cy={0} rx={s * 0.12} ry={s * 0.45} fill={bodyColor} />
              {/* antennae (feathery for moths) */}
              <path d={`M -${s * 0.04} ${-s * 0.45} Q ${-s * 0.25} ${-s * 0.7}, ${-s * 0.3} ${-s * 0.6}`}
                fill="none" stroke={bodyColor} strokeWidth={0.8} />
              <path d={`M ${s * 0.04} ${-s * 0.45} Q ${s * 0.25} ${-s * 0.7}, ${s * 0.3} ${-s * 0.6}`}
                fill="none" stroke={bodyColor} strokeWidth={0.8} />
              {/* upper wings */}
              <ellipse cx={-s * 0.35} cy={-s * 0.1} rx={s * 0.4} ry={s * 0.35 * wingScale}
                fill={wingColor} stroke={wingEdge} strokeWidth={0.5} />
              <ellipse cx={s * 0.35} cy={-s * 0.1} rx={s * 0.4} ry={s * 0.35 * wingScale}
                fill={wingColor} stroke={wingEdge} strokeWidth={0.5} />
              {/* lower wings */}
              <ellipse cx={-s * 0.25} cy={s * 0.2} rx={s * 0.28} ry={s * 0.22 * wingScale}
                fill={wingColor} stroke={wingEdge} strokeWidth={0.5} opacity={0.8} />
              <ellipse cx={s * 0.25} cy={s * 0.2} rx={s * 0.28} ry={s * 0.22 * wingScale}
                fill={wingColor} stroke={wingEdge} strokeWidth={0.5} opacity={0.8} />
              {/* eye spots on upper wings */}
              {m.spotCount >= 1 && (
                <>
                  <circle cx={-s * 0.35} cy={-s * 0.1} r={s * 0.1} fill="hsla(45, 40%, 50%, 0.4)" />
                  <circle cx={s * 0.35} cy={-s * 0.1} r={s * 0.1} fill="hsla(45, 40%, 50%, 0.4)" />
                </>
              )}
              {m.spotCount >= 2 && (
                <>
                  <circle cx={-s * 0.35} cy={-s * 0.1} r={s * 0.05} fill="hsla(30, 30%, 25%, 0.5)" />
                  <circle cx={s * 0.35} cy={-s * 0.1} r={s * 0.05} fill="hsla(30, 30%, 25%, 0.5)" />
                </>
              )}
              {/* fuzzy thorax */}
              <ellipse cx={0} cy={0} rx={s * 0.15} ry={s * 0.2} fill={bodyColor} opacity={0.7} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
