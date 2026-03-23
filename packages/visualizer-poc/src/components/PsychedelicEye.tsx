/**
 * PsychedelicEye — all-seeing eye with rainbow iris.
 * Layer 2, tier A, tags: psychedelic, cosmic.
 * Almond-shaped eye outline. Iris ring that pulses with bass.
 * Pupil dilates/contracts with energy. Rainbow iris cycling with chromaHue.
 * Radiating eyelash rays that glow with onset. Central specular highlight.
 * Position: center, breathes with slowEnergy.
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

export const PsychedelicEye: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Opacity — tier A, visible range
  const opacity = interpolate(energy, [0.02, 0.3], [0.30, 0.70], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Breathe with slowEnergy
  const breathe = interpolate(slowEnergy, [0.02, 0.25], [0.9, 1.1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pupil dilation — high energy = large pupil
  const pupilRadius = interpolate(energy, [0.0, 0.5], [6, 18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Iris pulse with bass
  const irisRadius = interpolate(snap.bass, [0.0, 0.5], [22, 28], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Iris rotation — slow cycle
  const irisRotation = (frame / 30) * 8 * tempoFactor;

  // Rainbow iris colors — 6 segments cycling with chromaHue
  const irisSegments: React.ReactNode[] = [];
  const segCount = 12;
  for (let i = 0; i < segCount; i++) {
    const segHue = (chromaHue + i / segCount) % 1;
    const startAngle = (i / segCount) * Math.PI * 2;
    const endAngle = ((i + 1) / segCount) * Math.PI * 2;
    const innerR = pupilRadius + 2;
    const outerR = irisRadius;

    const x1 = Math.cos(startAngle) * outerR;
    const y1 = Math.sin(startAngle) * outerR;
    const x2 = Math.cos(endAngle) * outerR;
    const y2 = Math.sin(endAngle) * outerR;
    const x3 = Math.cos(endAngle) * innerR;
    const y3 = Math.sin(endAngle) * innerR;
    const x4 = Math.cos(startAngle) * innerR;
    const y4 = Math.sin(startAngle) * innerR;

    irisSegments.push(
      <path
        key={i}
        d={`M ${x4} ${y4} L ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 0 0 ${x4} ${y4}`}
        fill={hueToHex(segHue)}
        opacity={0.7 + snap.bass * 0.3}
      />,
    );
  }

  // Radiating eyelash rays — glow with onset
  const rays: React.ReactNode[] = [];
  const rayCount = 16;
  const rayOpacity = interpolate(snap.onsetEnvelope, [0, 0.5], [0.1, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2;
    const innerDist = 38;
    const outerDist = 50 + snap.onsetEnvelope * 15 + Math.sin(frame * 0.1 * tempoFactor + i * 1.5) * 3;
    const x1 = 100 + Math.cos(angle) * innerDist;
    const y1 = 60 + Math.sin(angle) * innerDist * 0.5;
    const x2 = 100 + Math.cos(angle) * outerDist;
    const y2 = 60 + Math.sin(angle) * outerDist * 0.5;

    rays.push(
      <line
        key={i}
        x1={x1} y1={y1}
        x2={x2} y2={y2}
        stroke={hueToHex(chromaHue + 0.1)}
        strokeWidth={1 + snap.onsetEnvelope * 1.5}
        strokeLinecap="round"
        opacity={rayOpacity * (0.6 + Math.sin(frame * 0.08 + i * 0.7) * 0.4)}
      />,
    );
  }

  // Glow
  const glowRadius = interpolate(energy, [0.05, 0.4], [8, 25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const baseSize = Math.min(width, height) * 0.30;
  const onsetScale = 1 + snap.onsetEnvelope * 0.05;

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
          transform: `scale(${breathe * onsetScale})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${hueToHex(chromaHue)}) drop-shadow(0 0 ${glowRadius * 1.5}px ${hueToHex(chromaHue + 0.3)})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <svg
          width={baseSize}
          height={baseSize * 0.6}
          viewBox="0 0 200 120"
          fill="none"
        >
          {/* Eyelash rays */}
          {rays}

          {/* Almond-shaped eye outline */}
          <path
            d="M 10,60 Q 60,10 100,10 Q 140,10 190,60 Q 140,110 100,110 Q 60,110 10,60 Z"
            fill="none"
            stroke={hueToHex(chromaHue)}
            strokeWidth="2.5"
            opacity="0.8"
          />

          {/* Eye white fill */}
          <path
            d="M 15,60 Q 60,15 100,15 Q 140,15 185,60 Q 140,105 100,105 Q 60,105 15,60 Z"
            fill="white"
            opacity="0.08"
          />

          {/* Iris + pupil group — centered at eye center */}
          <g transform={`translate(100, 60) rotate(${irisRotation})`}>
            {/* Rainbow iris segments */}
            {irisSegments}

            {/* Iris outer ring */}
            <circle
              cx={0} cy={0}
              r={irisRadius}
              fill="none"
              stroke={hueToHex(chromaHue + 0.5)}
              strokeWidth="1.5"
              opacity="0.6"
            />

            {/* Pupil — dilates with energy */}
            <circle
              cx={0} cy={0}
              r={pupilRadius}
              fill="#0a0a0a"
            />

            {/* Pupil inner glow */}
            <circle
              cx={0} cy={0}
              r={pupilRadius * 0.6}
              fill={hueToHex(chromaHue)}
              opacity={0.1 + energy * 0.15}
            />
          </g>

          {/* Specular highlight — stays fixed */}
          <ellipse
            cx={92} cy={52}
            rx={4} ry={3}
            fill="white"
            opacity={0.6}
          />
          <circle
            cx={108} cy={56}
            r={2}
            fill="white"
            opacity={0.35}
          />
        </svg>
      </div>
    </div>
  );
};
