/**
 * SunMoonMotif — cosmic duality overlay.
 * High energy: sun dominates (orange/gold, rays pulse with drumOnset).
 * Low energy: moon dominates (cool blue crescent, gentle glow).
 * Mid energy: eclipse transition. Position drifts with sin(frame * 0.003).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";

interface Props {
  frames: EnhancedFrameData[];
}

export const SunMoonMotif: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);

  const energy = snap.energy;
  const drumOnset = snap.drumOnset;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue;

  // Sun/Moon balance: 0 = full moon, 1 = full sun
  const sunBalance = interpolate(energy, [0.08, 0.30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Drifting position
  const driftX = Math.sin(frame * 0.003) * width * 0.15;
  const driftY = Math.cos(frame * 0.0025) * height * 0.08;
  const centerX = width * 0.75 + driftX;
  const centerY = height * 0.25 + driftY;

  const baseRadius = Math.min(width, height) * 0.08;

  // Sun: rays pulse with drum onset
  const sunRadius = baseRadius * (1 + drumOnset * 0.2 + beatDecay * 0.1);
  const sunOpacity = sunBalance * (0.2 + energy * 0.25);
  const rayCount = 12;
  const rayLength = sunRadius * (0.6 + drumOnset * 0.5);

  // Moon: crescent with gentle glow
  const moonOpacity = (1 - sunBalance) * (0.15 + (1 - energy) * 0.2);
  const moonRadius = baseRadius * 0.9;
  const crescentOffset = moonRadius * 0.3;

  // Eclipse: both visible during transition
  const eclipseOpacity = Math.max(0, 1 - Math.abs(sunBalance - 0.5) * 4) * 0.3;

  // Glow
  const sunGlow = 10 + energy * 30;
  const moonGlow = 8 + (1 - energy) * 15;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <radialGradient id="sunGrad">
            <stop offset="0%" stopColor="rgba(255, 200, 50, 0.8)" />
            <stop offset="60%" stopColor="rgba(255, 140, 30, 0.4)" />
            <stop offset="100%" stopColor="rgba(255, 80, 0, 0)" />
          </radialGradient>
          <radialGradient id="moonGrad">
            <stop offset="0%" stopColor="rgba(180, 200, 240, 0.7)" />
            <stop offset="60%" stopColor="rgba(120, 150, 200, 0.3)" />
            <stop offset="100%" stopColor="rgba(60, 80, 140, 0)" />
          </radialGradient>
        </defs>

        {/* Sun */}
        <g opacity={sunOpacity} filter={`url(#sunBlur)`}>
          {/* Sun glow */}
          <circle
            cx={centerX}
            cy={centerY}
            r={sunRadius * 1.8}
            fill="url(#sunGrad)"
            style={{ filter: `blur(${sunGlow}px)` }}
          />
          {/* Sun body */}
          <circle
            cx={centerX}
            cy={centerY}
            r={sunRadius}
            fill="rgba(255, 200, 80, 0.6)"
            stroke="rgba(255, 180, 50, 0.4)"
            strokeWidth={1.5}
          />
          {/* Sun rays */}
          {Array.from({ length: rayCount }).map((_, i) => {
            const angle = (i / rayCount) * Math.PI * 2 + frame * 0.005;
            const innerR = sunRadius * 1.1;
            const outerR = sunRadius * 1.1 + rayLength * (0.8 + Math.sin(frame * 0.08 + i) * 0.2);
            const x1 = centerX + Math.cos(angle) * innerR;
            const y1 = centerY + Math.sin(angle) * innerR;
            const x2 = centerX + Math.cos(angle) * outerR;
            const y2 = centerY + Math.sin(angle) * outerR;
            return (
              <line
                key={`ray-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(255, 200, 80, 0.5)"
                strokeWidth={2 + drumOnset * 2}
                strokeLinecap="round"
              />
            );
          })}
        </g>

        {/* Moon */}
        <g opacity={moonOpacity}>
          {/* Moon glow */}
          <circle
            cx={centerX}
            cy={centerY}
            r={moonRadius * 2}
            fill="url(#moonGrad)"
            style={{ filter: `blur(${moonGlow}px)` }}
          />
          {/* Moon body (crescent via overlapping circles) */}
          <circle
            cx={centerX}
            cy={centerY}
            r={moonRadius}
            fill="rgba(200, 220, 255, 0.5)"
          />
          {/* Dark overlay for crescent shape */}
          <circle
            cx={centerX + crescentOffset}
            cy={centerY - crescentOffset * 0.3}
            r={moonRadius * 0.85}
            fill="rgba(0, 0, 0, 0.7)"
          />
          {/* Subtle surface details */}
          <circle cx={centerX - moonRadius * 0.2} cy={centerY + moonRadius * 0.1} r={moonRadius * 0.08} fill="rgba(160, 180, 220, 0.3)" />
          <circle cx={centerX - moonRadius * 0.4} cy={centerY - moonRadius * 0.2} r={moonRadius * 0.05} fill="rgba(160, 180, 220, 0.2)" />
        </g>

        {/* Eclipse corona (during transition) */}
        {eclipseOpacity > 0.01 && (
          <circle
            cx={centerX}
            cy={centerY}
            r={baseRadius * 1.5}
            fill="none"
            stroke={`rgba(255, 220, 180, ${eclipseOpacity})`}
            strokeWidth={3}
            style={{ filter: `blur(${4 + eclipseOpacity * 10}px)` }}
          />
        )}
      </svg>
    </div>
  );
};
