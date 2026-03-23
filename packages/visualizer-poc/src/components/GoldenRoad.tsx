/**
 * GoldenRoad — shimmering path to horizon in perspective.
 * Layer 5, tier B, tags: dead-culture, organic.
 * Road/path narrowing toward vanishing point at top.
 * Dashed center line. Side grass marks. Golden shimmer particles along path.
 * Path glows brighter with energy. Perspective lines converge.
 * Warm gold/amber palette + chromaHue tint. Position: full screen, bottom to center.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/** Map 0-1 hue to an RGB hex string */
function hueToHex(h: number): string {
  const s = 0.85, l = 0.6;
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) { r = c; g = x; }
  else if (sector === 1) { r = x; g = c; }
  else if (sector === 2) { g = c; b = x; }
  else if (sector === 3) { g = x; b = c; }
  else if (sector === 4) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const GoldenRoad: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Opacity: tier B, 0.12-0.30
  const opacity = interpolate(energy, [0.02, 0.3], [0.12, 0.30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Gold base color, tinted by chromaHue
  const goldColor = hueToHex(0.12 + chromaHue * 0.08); // golden hue
  const amberColor = hueToHex(0.08 + chromaHue * 0.05); // warm amber
  const grassColor = hueToHex(0.28 + chromaHue * 0.05); // green-gold

  // Vanishing point
  const vpX = 150;
  const vpY = 55;

  // Road edges — converge to vanishing point
  const roadBottomLeft = 40;
  const roadBottomRight = 260;
  const roadHeight = 250;

  // Glow brighter with energy
  const pathGlow = interpolate(energy, [0.05, 0.4], [4, 16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Dashed center line segments — moving toward horizon
  const dashes: React.ReactNode[] = [];
  const dashCount = 10;
  for (let i = 0; i < dashCount; i++) {
    // t goes from 0 (bottom) to 1 (vanishing point)
    const scrollOffset = ((frame * 0.8 * tempoFactor) % 25) / 25;
    const tStart = (i / dashCount + scrollOffset / dashCount) * 0.85;
    const tEnd = tStart + 0.03;
    if (tStart > 0.85 || tEnd > 0.88) continue;

    // Interpolate position along the center line
    const y1 = roadHeight - tStart * (roadHeight - vpY);
    const y2 = roadHeight - tEnd * (roadHeight - vpY);
    const dashOpacity = interpolate(tStart, [0, 0.4, 0.85], [0.7, 0.5, 0.1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const dashWidth = interpolate(tStart, [0, 0.85], [2, 0.5], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    dashes.push(
      <line
        key={`dash-${i}`}
        x1={vpX} y1={y2}
        x2={vpX} y2={y1}
        stroke="#ffe8a0"
        strokeWidth={dashWidth}
        opacity={dashOpacity * (0.5 + energy * 0.5)}
        strokeLinecap="round"
      />,
    );
  }

  // Grass marks along road edges
  const grassMarks: React.ReactNode[] = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 14;
    const y = roadHeight - t * (roadHeight - vpY - 10);
    // Left edge
    const leftX = vpX - (vpX - roadBottomLeft) * (1 - t) - 2;
    // Right edge
    const rightX = vpX + (roadBottomRight - vpX) * (1 - t) + 2;
    const grassLen = interpolate(t, [0, 0.85], [8, 2], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const grassOp = interpolate(t, [0, 0.5, 0.85], [0.5, 0.3, 0.05], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    // Sway with beat
    const sway = Math.sin(frame * 0.08 * tempoFactor + i * 1.3) * 2 * (1 + snap.beatDecay * 0.5);

    grassMarks.push(
      <line
        key={`gl-${i}`}
        x1={leftX} y1={y}
        x2={leftX - grassLen + sway} y2={y - grassLen * 0.7}
        stroke={grassColor}
        strokeWidth={1}
        strokeLinecap="round"
        opacity={grassOp}
      />,
      <line
        key={`gr-${i}`}
        x1={rightX} y1={y}
        x2={rightX + grassLen + sway} y2={y - grassLen * 0.7}
        stroke={grassColor}
        strokeWidth={1}
        strokeLinecap="round"
        opacity={grassOp}
      />,
    );
  }

  // Shimmer particles along the path
  const particles: React.ReactNode[] = [];
  for (let i = 0; i < 12; i++) {
    const t = ((i / 12 + (frame * 0.3 * tempoFactor + i * 7) / 300) % 1);
    const y = roadHeight - t * (roadHeight - vpY - 5);
    // Particle wanders within the road width at its depth
    const roadWidthAtT = (roadBottomRight - roadBottomLeft) * (1 - t);
    const centerAtT = vpX;
    const xOffset = Math.sin(frame * 0.04 * tempoFactor + i * 2.1) * roadWidthAtT * 0.3;
    const px = centerAtT + xOffset;
    const particleSize = interpolate(t, [0, 0.85], [2.5, 0.5], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const particleOp = interpolate(t, [0, 0.3, 0.85], [0.3, 0.7, 0.1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) * (0.5 + energy * 0.5);

    particles.push(
      <circle
        key={`p-${i}`}
        cx={px} cy={y}
        r={particleSize}
        fill="#ffe8a0"
        opacity={particleOp}
      />,
    );
  }

  // Breathe with slowEnergy
  const breathe = interpolate(slowEnergy, [0.02, 0.25], [0.97, 1.03], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          transform: `scale(${breathe})`,
          opacity,
          filter: `drop-shadow(0 0 ${pathGlow}px ${goldColor})`,
          willChange: "transform, opacity, filter",
          width: "100%",
          height: "70%",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 300 250"
          fill="none"
          preserveAspectRatio="xMidYMax meet"
        >
          {/* Road surface — perspective trapezoid */}
          <polygon
            points={`${roadBottomLeft},${roadHeight} ${roadBottomRight},${roadHeight} ${vpX + 3},${vpY} ${vpX - 3},${vpY}`}
            fill={amberColor}
            opacity={0.08 + energy * 0.06}
          />

          {/* Left road edge */}
          <line
            x1={roadBottomLeft} y1={roadHeight}
            x2={vpX - 2} y2={vpY}
            stroke={goldColor}
            strokeWidth="1.5"
            opacity="0.4"
          />
          {/* Right road edge */}
          <line
            x1={roadBottomRight} y1={roadHeight}
            x2={vpX + 2} y2={vpY}
            stroke={goldColor}
            strokeWidth="1.5"
            opacity="0.4"
          />

          {/* Center dashed line */}
          {dashes}

          {/* Grass marks */}
          {grassMarks}

          {/* Shimmer particles */}
          {particles}

          {/* Horizon glow */}
          <circle
            cx={vpX} cy={vpY}
            r={8 + energy * 6}
            fill="#ffe8a0"
            opacity={0.1 + energy * 0.15}
          />

          {/* Vanishing point star */}
          <circle
            cx={vpX} cy={vpY}
            r={2 + snap.onsetEnvelope * 3}
            fill="white"
            opacity={0.3 + snap.onsetEnvelope * 0.4}
          />
        </svg>
      </div>
    </div>
  );
};
