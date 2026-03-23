/**
 * CommunityCircle — dancing stick figures arranged in a circle.
 * Layer 6, tier B, tags: dead-culture, festival.
 * 8 stick figures holding hands, arms sway with beatDecay.
 * Circle slowly rotates. Figures "dance" (vertical bounce) with energy.
 * Colors from chromaHue. Position: center, medium size.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/** Map 0-1 hue to an RGB hex string */
function hueToHex(h: number): string {
  const s = 0.85;
  const l = 0.6;
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

export const CommunityCircle: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Opacity: 0.15-0.45
  const opacity = interpolate(energy, [0.02, 0.35], [0.15, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow circle rotation
  const rotation = (frame / 30) * 2.5 * tempoFactor;

  // Colors — each figure gets slightly shifted hue
  const figureCount = 8;
  const circleRadius = 65; // in viewBox units
  const cx = 100;
  const cy = 100;

  // Size
  const size = Math.min(width, height) * 0.30;

  const figures: React.ReactNode[] = [];

  for (let i = 0; i < figureCount; i++) {
    const angle = (i / figureCount) * Math.PI * 2 - Math.PI / 2;
    const figX = cx + Math.cos(angle) * circleRadius;
    const figY = cy + Math.sin(angle) * circleRadius;

    // Dance bounce: each figure offset in phase
    const bouncePhase = frame * 0.15 * tempoFactor + i * 0.8;
    const bounce = Math.sin(bouncePhase) * energy * 5;

    // Arm sway with beatDecay
    const armSway = Math.sin(frame * 0.1 * tempoFactor + i * 1.2) * snap.beatDecay * 8;

    // Color per figure
    const figColor = hueToHex(chromaHue + i * 0.06);

    // Figure faces outward from center
    const facingAngle = angle * (180 / Math.PI) + 90;

    figures.push(
      <g
        key={i}
        transform={`translate(${figX}, ${figY + bounce}) rotate(${facingAngle}, 0, 0)`}
      >
        {/* Head */}
        <circle cx="0" cy="-12" r="4" stroke={figColor} strokeWidth="1.2" fill="none" />
        {/* Body */}
        <line x1="0" y1="-8" x2="0" y2="4" stroke={figColor} strokeWidth="1.2" />
        {/* Left leg */}
        <line x1="0" y1="4" x2="-4" y2="12" stroke={figColor} strokeWidth="1" />
        {/* Right leg */}
        <line x1="0" y1="4" x2="4" y2="12" stroke={figColor} strokeWidth="1" />
        {/* Left arm — swaying */}
        <line
          x1="0"
          y1="-4"
          x2={-7 - armSway}
          y2={-1 + Math.abs(armSway) * 0.3}
          stroke={figColor}
          strokeWidth="1"
        />
        {/* Right arm — swaying opposite */}
        <line
          x1="0"
          y1="-4"
          x2={7 + armSway}
          y2={-1 + Math.abs(armSway) * 0.3}
          stroke={figColor}
          strokeWidth="1"
        />
      </g>,
    );
  }

  // Hand connections (arcs between adjacent figures' outstretched hands)
  const connections: React.ReactNode[] = [];
  for (let i = 0; i < figureCount; i++) {
    const angle1 = (i / figureCount) * Math.PI * 2 - Math.PI / 2;
    const angle2 = ((i + 1) / figureCount) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + Math.cos(angle1) * (circleRadius + 7);
    const y1 = cy + Math.sin(angle1) * (circleRadius + 7);
    const x2 = cx + Math.cos(angle2) * (circleRadius + 7);
    const y2 = cy + Math.sin(angle2) * (circleRadius + 7);
    const midAngle = ((i + 0.5) / figureCount) * Math.PI * 2 - Math.PI / 2;
    const arcR = circleRadius + 12 + snap.beatDecay * 4;
    const mx = cx + Math.cos(midAngle) * arcR;
    const my = cy + Math.sin(midAngle) * arcR;

    connections.push(
      <path
        key={`conn-${i}`}
        d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
        stroke={hueToHex(chromaHue + 0.3)}
        strokeWidth="0.8"
        fill="none"
        opacity={0.3 + snap.beatDecay * 0.4}
      />,
    );
  }

  // Scale breathes gently with slowEnergy
  const scale = interpolate(slowEnergy, [0.02, 0.3], [0.9, 1.1], {
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
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          transform: `rotate(${rotation}deg) scale(${scale})`,
          opacity,
          willChange: "transform, opacity",
        }}
      >
        <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
          {connections}
          {figures}
        </svg>
      </div>
    </div>
  );
};
