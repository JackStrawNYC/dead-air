/**
 * TerrapinStation — Turtle carrying a temple dome with stars.
 * Detailed turtle with hexagonal shell pattern, columned temple dome
 * on its back, 8 twinkling stars. Layer 6 Character, Tier A.
 * Gentle bobbing/swimming motion, beat-synced star twinkle.
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

/** 4-point star path centered at (cx, cy) with given radius */
function starPath(cx: number, cy: number, r: number): string {
  const ir = r * 0.35;
  let d = "";
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : ir;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    d += (i === 0 ? "M" : "L") + `${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d + "Z";
}

const TerrapinSVG: React.FC<{
  size: number;
  shellColor: string;
  bodyColor: string;
  templeColor: string;
  starColor: string;
  frame: number;
  beatDecay: number;
}> = ({ size, shellColor, bodyColor, templeColor, starColor, frame, beatDecay }) => (
  <svg width={size} height={size} viewBox="0 0 280 280" fill="none">
    {/* ─── Stars (8 scattered, twinkle with beat) ─── */}
    {[
      { x: 30, y: 25, r: 5, phase: 0 },
      { x: 250, y: 20, r: 4, phase: 1.2 },
      { x: 60, y: 55, r: 3.5, phase: 2.4 },
      { x: 220, y: 50, r: 4.5, phase: 0.8 },
      { x: 15, y: 80, r: 3, phase: 3.1 },
      { x: 265, y: 85, r: 3.5, phase: 1.9 },
      { x: 45, y: 110, r: 4, phase: 0.5 },
      { x: 235, y: 105, r: 3, phase: 2.7 },
    ].map((star, i) => {
      const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(frame / 20 + star.phase + beatDecay * 3));
      return (
        <path
          key={`star${i}`}
          d={starPath(star.x, star.y, star.r)}
          fill={starColor}
          opacity={twinkle * 0.8}
        />
      );
    })}

    {/* ─── Temple dome (on turtle's back) ─── */}
    {/* Dome */}
    <path
      d="M110 95 Q140 40 170 95"
      stroke={templeColor} strokeWidth="2.5" fill="none"
    />
    <path d="M110 95 Q140 40 170 95" fill={templeColor} opacity="0.1" />

    {/* Dome finial */}
    <circle cx="140" cy="48" r="4" stroke={templeColor} strokeWidth="1.5" fill="none" />
    <line x1="140" y1="52" x2="140" y2="60" stroke={templeColor} strokeWidth="1.5" />

    {/* Columns */}
    <line x1="115" y1="95" x2="115" y2="120" stroke={templeColor} strokeWidth="2.5" />
    <line x1="128" y1="95" x2="128" y2="120" stroke={templeColor} strokeWidth="2" />
    <line x1="140" y1="90" x2="140" y2="120" stroke={templeColor} strokeWidth="2" />
    <line x1="152" y1="95" x2="152" y2="120" stroke={templeColor} strokeWidth="2" />
    <line x1="165" y1="95" x2="165" y2="120" stroke={templeColor} strokeWidth="2.5" />

    {/* Column capitals */}
    {[115, 128, 140, 152, 165].map((cx, i) => (
      <rect key={`cap${i}`} x={cx - 3} y={93} width={6} height={3} fill={templeColor} opacity="0.6" rx={0.5} />
    ))}

    {/* Architrave / base */}
    <rect x="108" y="118" width="64" height="5" stroke={templeColor} strokeWidth="1.5" fill="none" rx={1} />
    <line x1="108" y1="93" x2="172" y2="93" stroke={templeColor} strokeWidth="2" />

    {/* ─── Turtle shell (hexagonal pattern) ─── */}
    <ellipse cx="140" cy="160" rx="55" ry="38" stroke={shellColor} strokeWidth="3" fill="none" />
    <ellipse cx="140" cy="160" rx="55" ry="38" fill={shellColor} opacity="0.1" />

    {/* Central hex */}
    <polygon
      points="140,140 155,148 155,168 140,176 125,168 125,148"
      stroke={shellColor} strokeWidth="1.8" fill="none"
    />
    {/* Surrounding hex segments */}
    <path d="M125 148 L110 142 L108 155 L125 168" stroke={shellColor} strokeWidth="1.2" fill="none" opacity="0.7" />
    <path d="M155 148 L170 142 L172 155 L155 168" stroke={shellColor} strokeWidth="1.2" fill="none" opacity="0.7" />
    <path d="M125 168 L115 180 L130 190 L140 176" stroke={shellColor} strokeWidth="1.2" fill="none" opacity="0.7" />
    <path d="M155 168 L165 180 L150 190 L140 176" stroke={shellColor} strokeWidth="1.2" fill="none" opacity="0.7" />
    <path d="M140 140 L130 128 L115 135 L125 148" stroke={shellColor} strokeWidth="1.2" fill="none" opacity="0.7" />
    <path d="M140 140 L150 128 L165 135 L155 148" stroke={shellColor} strokeWidth="1.2" fill="none" opacity="0.7" />

    {/* Shell edge scutes */}
    {[
      "M95 155 L108 155", "M95 165 L110 170", "M100 145 L110 142",
      "M185 155 L172 155", "M185 165 L170 170", "M180 145 L170 142",
      "M120 192 L130 190", "M160 192 L150 190",
    ].map((d, i) => (
      <path key={`sc${i}`} d={d} stroke={shellColor} strokeWidth="1" opacity="0.5" />
    ))}

    {/* ─── Turtle head ─── */}
    <ellipse cx="140" cy="118" rx="12" ry="8" stroke={bodyColor} strokeWidth="2.5" fill="none" />
    <ellipse cx="140" cy="118" rx="12" ry="8" fill={bodyColor} opacity="0.1" />
    {/* Eyes */}
    <circle cx="135" cy="115" r="2" fill={bodyColor} opacity="0.6" />
    <circle cx="145" cy="115" r="2" fill={bodyColor} opacity="0.6" />
    {/* Beak / mouth */}
    <path d="M137 122 L140 125 L143 122" stroke={bodyColor} strokeWidth="1" fill="none" />

    {/* ─── Front flippers ─── */}
    <path
      d="M90 150 C75 140 60 138 55 145 C50 152 60 158 75 155 L90 155"
      stroke={bodyColor} strokeWidth="2.2" fill="none" strokeLinecap="round"
    />
    <path
      d="M190 150 C205 140 220 138 225 145 C230 152 220 158 205 155 L190 155"
      stroke={bodyColor} strokeWidth="2.2" fill="none" strokeLinecap="round"
    />
    {/* Flipper digits */}
    <path d="M55 145 L48 140 M55 145 L50 148" stroke={bodyColor} strokeWidth="1.2" opacity="0.6" />
    <path d="M225 145 L232 140 M225 145 L230 148" stroke={bodyColor} strokeWidth="1.2" opacity="0.6" />

    {/* ─── Rear flippers ─── */}
    <path
      d="M100 185 C90 195 82 200 80 195 C78 190 85 185 95 183"
      stroke={bodyColor} strokeWidth="2" fill="none"
    />
    <path
      d="M180 185 C190 195 198 200 200 195 C202 190 195 185 185 183"
      stroke={bodyColor} strokeWidth="2" fill="none"
    />

    {/* ─── Tail ─── */}
    <path d="M140 195 L140 210 L138 208" stroke={bodyColor} strokeWidth="1.5" fill="none" strokeLinecap="round" />

    {/* ─── Water ripple suggestion ─── */}
    <path d="M60 230 Q80 225 100 230 Q120 235 140 230 Q160 225 180 230 Q200 235 220 230"
      stroke={bodyColor} strokeWidth="1" opacity="0.25" />
    <path d="M50 240 Q75 235 100 240 Q125 245 150 240 Q175 235 200 240 Q225 245 250 240"
      stroke={bodyColor} strokeWidth="0.8" opacity="0.18" />
  </svg>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const TerrapinStation: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  const baseSize = Math.min(width, height) * 0.42;
  const breathe = interpolate(energy, [0.03, 0.3], [0.90, 1.10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Gentle bobbing — sine wave swimming motion
  const bobY = Math.sin(frame / 40 * tempoFactor) * 8;
  const bobX = Math.cos(frame / 60 * tempoFactor) * 4;
  const tilt = Math.sin(frame / 55 * tempoFactor) * 1.5;

  const opacity = interpolate(energy, [0.02, 0.3], [0.25, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const shellColor = hueToHex((chromaHue + 0.1) % 1, 0.65, 0.55);
  const bodyColor = hueToHex((chromaHue + 0.05) % 1, 0.55, 0.5);
  const templeColor = hueToHex((chromaHue + 0.15) % 1, 0.5, 0.65);
  const starColor = hueToHex((chromaHue + 0.5) % 1, 0.7, 0.75);

  const bassGlow = 0.7 + snap.bass * 0.8;
  const glowRadius = interpolate(energy, [0.05, 0.3], [4, 22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * bassGlow;

  const onsetScale = 1 + snap.onsetEnvelope * 0.03;
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
          transform: `translate(${bobX}px, ${bobY}px) rotate(${tilt}deg) scale(${breathe * onsetScale})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${shellColor}) drop-shadow(0 0 ${glowRadius * 1.4}px ${starColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <TerrapinSVG
          size={size}
          shellColor={shellColor}
          bodyColor={bodyColor}
          templeColor={templeColor}
          starColor={starColor}
          frame={frame}
          beatDecay={snap.beatDecay}
        />
      </div>
    </div>
  );
};
