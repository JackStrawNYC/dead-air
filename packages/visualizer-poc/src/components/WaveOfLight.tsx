/**
 * WaveOfLight — Light beam entering a prism, splitting into spectrum.
 * Single white beam from left, triangular prism center, 7 rainbow beams
 * spreading right. Chroma-driven rainbow hue shift. Layer 3 Reactive, Tier B.
 * Beams pulse with energy, prism breathes with beat.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

function hueToHex(h: number, s = 0.85, l = 0.6): string {
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

/** Base hues for 7 rainbow beams (red through violet), shifted by chromaHue */
function rainbowHues(chromaShift: number): number[] {
  const base = [0.0, 0.06, 0.13, 0.33, 0.55, 0.7, 0.82]; // R O Y G B I V
  return base.map((h) => (h + chromaShift) % 1);
}

const PrismSVG: React.FC<{
  size: number;
  beamColor: string;
  prismColor: string;
  rainbowColors: string[];
  energy: number;
  beatDecay: number;
  frame: number;
  tempoFactor: number;
}> = ({ size, beamColor, prismColor, rainbowColors, energy, beatDecay, frame, tempoFactor }) => {
  const prismBreath = 1 + beatDecay * 0.03;
  const beamPulse = 0.6 + energy * 0.8;

  // Prism center coordinates
  const px = 140;
  const py = 110;
  const prismH = 80 * prismBreath;
  const prismW = 50 * prismBreath;

  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 320 190" fill="none">
      {/* ─── Incoming white light beam ─── */}
      {/* Main beam */}
      <line
        x1="0" y1="110" x2={px - prismW / 2 + 5} y2="110"
        stroke={beamColor} strokeWidth={3 * beamPulse} opacity={0.7 * beamPulse}
      />
      {/* Beam glow */}
      <line
        x1="10" y1="110" x2={px - prismW / 2 + 5} y2="110"
        stroke={beamColor} strokeWidth={8 * beamPulse} opacity={0.15 * beamPulse}
      />
      {/* Beam edge lines (subtle) */}
      <line
        x1="0" y1="107" x2={px - prismW / 2 + 8} y2="109"
        stroke={beamColor} strokeWidth="0.8" opacity="0.3"
      />
      <line
        x1="0" y1="113" x2={px - prismW / 2 + 8} y2="111"
        stroke={beamColor} strokeWidth="0.8" opacity="0.3"
      />

      {/* ─── Triangular Prism ─── */}
      <polygon
        points={`${px},${py - prismH / 2} ${px - prismW / 2},${py + prismH / 2} ${px + prismW / 2},${py + prismH / 2}`}
        stroke={prismColor}
        strokeWidth="2.5"
        fill="none"
        strokeLinejoin="round"
      />
      {/* Prism fill — translucent */}
      <polygon
        points={`${px},${py - prismH / 2} ${px - prismW / 2},${py + prismH / 2} ${px + prismW / 2},${py + prismH / 2}`}
        fill={prismColor}
        opacity="0.08"
      />
      {/* Prism internal refraction lines */}
      <line
        x1={px - prismW / 2 + 10} y1={py + prismH / 2 - 10}
        x2={px + prismW / 2 - 5} y2={py + prismH / 2 - 10}
        stroke={prismColor} strokeWidth="0.8" opacity="0.25"
      />
      <line
        x1={px - 5} y1={py - prismH / 2 + 15}
        x2={px + prismW / 2 - 8} y2={py + prismH / 2 - 5}
        stroke={prismColor} strokeWidth="0.8" opacity="0.2"
      />
      {/* Prism highlights */}
      <path
        d={`M${px - 2} ${py - prismH / 2 + 8} L${px - prismW / 2 + 8} ${py + prismH / 2 - 5}`}
        stroke={prismColor} strokeWidth="1" opacity="0.15"
      />

      {/* ─── 7 Rainbow beams spreading right ─── */}
      {rainbowColors.map((color, i) => {
        const startX = px + prismW / 2 - 2;
        const startY = py + (i - 3) * 3;
        const spreadAngle = ((i - 3) / 3) * 22;
        const endX = 320;
        const endY = startY + Math.tan((spreadAngle * Math.PI) / 180) * (endX - startX);
        // Each beam pulses slightly out of phase
        const phasedPulse = beamPulse * (0.8 + 0.2 * Math.sin(frame / 15 * tempoFactor + i * 0.9));

        return (
          <g key={`beam${i}`}>
            {/* Main beam */}
            <line
              x1={startX} y1={startY}
              x2={endX} y2={endY}
              stroke={color}
              strokeWidth={2.5 * phasedPulse}
              opacity={0.7 * phasedPulse}
              strokeLinecap="round"
            />
            {/* Beam glow */}
            <line
              x1={startX + 20} y1={startY + (endY - startY) * 0.1}
              x2={endX} y2={endY}
              stroke={color}
              strokeWidth={6 * phasedPulse}
              opacity={0.12 * phasedPulse}
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {/* ─── Light scatter at prism entry ─── */}
      <circle
        cx={px - prismW / 2 + 5} cy="110" r={4 * beamPulse}
        fill={beamColor} opacity={0.2 * beamPulse}
      />

      {/* ─── Light scatter at prism exit ─── */}
      <circle
        cx={px + prismW / 2} cy={py} r={6 * beamPulse}
        fill={prismColor} opacity={0.15 * beamPulse}
      />

      {/* ─── Caustic light pools on "surface" ─── */}
      <ellipse
        cx={px - 15} cy={py + prismH / 2 + 15}
        rx={20 * beamPulse} ry={3}
        fill={prismColor} opacity={0.08 * beamPulse}
      />
      <ellipse
        cx={px + 25} cy={py + prismH / 2 + 12}
        rx={15 * beamPulse} ry={2.5}
        fill={rainbowColors[2]} opacity={0.06 * beamPulse}
      />

      {/* ─── Subtle spectrum reflections on prism face ─── */}
      {rainbowColors.map((color, i) => (
        <line
          key={`ref${i}`}
          x1={px + prismW / 2 - 3} y1={py - 15 + i * 6}
          x2={px + prismW / 2 - 1} y2={py - 12 + i * 6}
          stroke={color} strokeWidth="1.5" opacity="0.3"
        />
      ))}

      {/* ─── Light source glow (far left) ─── */}
      <circle cx="5" cy="110" r={8 * beamPulse} fill={beamColor} opacity={0.1 * beamPulse} />
      <circle cx="5" cy="110" r={3} fill={beamColor} opacity={0.4 * beamPulse} />
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const WaveOfLight: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  const baseSize = Math.min(width, height) * 0.5;
  const breathe = interpolate(energy, [0.03, 0.3], [0.93, 1.07], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const tilt = Math.sin(frame / 100 * tempoFactor) * 1;

  const opacity = interpolate(energy, [0.02, 0.3], [0.20, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // White beam color (slightly tinted by chroma)
  const beamColor = hueToHex(chromaHue, 0.15, 0.9);
  const prismColor = hueToHex((chromaHue + 0.55) % 1, 0.5, 0.65);

  // Rainbow colors shifted by chroma
  const hues = rainbowHues(chromaHue);
  const rainbowColors = hues.map((h) => hueToHex(h, 0.9, 0.55));

  const bassGlow = 0.6 + snap.bass * 0.7;
  const glowRadius = interpolate(energy, [0.05, 0.3], [3, 18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * bassGlow;

  const onsetScale = 1 + snap.onsetEnvelope * 0.02;
  const size = baseSize * breathe;

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
          transform: `rotate(${tilt}deg) scale(${breathe * onsetScale})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${prismColor}) drop-shadow(0 0 ${glowRadius * 1.2}px ${beamColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <PrismSVG
          size={size}
          beamColor={beamColor}
          prismColor={prismColor}
          rainbowColors={rainbowColors}
          energy={energy}
          beatDecay={snap.beatDecay}
          frame={frame}
          tempoFactor={tempoFactor}
        />
      </div>
    </div>
  );
};
