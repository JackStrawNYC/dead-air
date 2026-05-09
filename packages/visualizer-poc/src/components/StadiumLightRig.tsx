/**
 * StadiumLightRig — A+++ tour-level stage-lighting overlay.
 *
 * Different from the concert_lighting full-frame shader. This is a
 * LAYERED overlay that composites stage-lighting elements OVER any
 * primary shader, so the visual reads as "this music is happening
 * at a real venue with real lights." Used at peak energy moments
 * across all set 2 / climax / encore songs.
 *
 * Rendered elements (top of frame down):
 *   1. Truss skeleton at top — exposed metal grid with mounted lights
 *   2. 4 follow-spot beams — wide cone shapes, audio-tracked tilt + brightness
 *   3. PAR can wash — colored circles bleeding from truss
 *   4. Gobo-pattern shadow projections on the floor (lower edge)
 *   5. Smoke/haze plume from below — volumetric warm haze
 *   6. Lens-flare halos at brightest spots
 *
 * Audio reactivity:
 *   energy            → beam intensity + reach
 *   bass              → PAR wash pulse, beams shake on bass hits
 *   vocalEnergy       → center spotlight tightens on vocal lead
 *   beatSnap          → followspot snap to next position
 *   chordIndex        → PAR wash hue cycle
 *   harmonicTension   → gobo pattern speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";

// ─── TRUSS SEGMENT ───────────────────────────────────────────────
// Aluminum truss with cross-bracing and mounted lights

const TrussSegment: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
}> = ({ x, y, w, h }) => {
  // Triangulated cross-bracing
  const segments = 12;
  const segW = w / segments;
  return (
    <g>
      {/* Top + bottom rails */}
      <rect x={x} y={y} width={w} height={4} fill="#3a3a3c" />
      <rect x={x} y={y + h - 4} width={w} height={4} fill="#2a2a2c" />
      {/* Vertical posts at every 2 segments */}
      {Array.from({ length: segments / 2 + 1 }).map((_, i) => (
        <rect key={`v${i}`} x={x + i * segW * 2} y={y} width={2.5} height={h} fill="#3a3a3c" />
      ))}
      {/* Cross-bracing — alternating diagonals */}
      {Array.from({ length: segments }).map((_, i) => {
        const sx = x + i * segW;
        return i % 2 === 0 ? (
          <line key={`x${i}`} x1={sx} y1={y + 2} x2={sx + segW} y2={y + h - 2} stroke="#4a4a4c" strokeWidth={1.2} />
        ) : (
          <line key={`x${i}`} x1={sx} y1={y + h - 2} x2={sx + segW} y2={y + 2} stroke="#4a4a4c" strokeWidth={1.2} />
        );
      })}
      {/* Highlight glints on top edge */}
      <line x1={x + 2} y1={y + 1} x2={x + w - 2} y2={y + 1} stroke="#7a7a7c" strokeWidth={0.6} opacity={0.7} />
    </g>
  );
};

// ─── FOLLOWSPOT FIXTURE ──────────────────────────────────────────
// Mounted on truss, casting cone

const FollowspotFixture: React.FC<{
  cx: number;
  cy: number;
  on: boolean;
}> = ({ cx, cy, on }) => (
  <g transform={`translate(${cx} ${cy})`}>
    {/* Yoke (mount) */}
    <rect x={-7} y={-4} width={14} height={4} fill="#1a1a1a" />
    <line x1={-5} y1={-4} x2={-5} y2={6} stroke="#2a2a2c" strokeWidth={1.4} />
    <line x1={5} y1={-4} x2={5} y2={6} stroke="#2a2a2c" strokeWidth={1.4} />
    {/* Body — squat cylindrical */}
    <rect x={-9} y={2} width={18} height={12} rx={2} fill="#0a0a0a" stroke="#3a3a3c" strokeWidth={0.6} />
    {/* Lens / front */}
    <ellipse cx={0} cy={14} rx={7} ry={2.5} fill={on ? "#fef0c0" : "#1a1a1a"} opacity={on ? 0.95 : 0.8} />
    {/* Lens reflection */}
    {on && <ellipse cx={-2} cy={13.5} rx={2} ry={1} fill="#ffffff" opacity={0.7} />}
    {/* Brand label */}
    <text x={0} y={11} fontFamily="Helvetica, sans-serif" fontSize={3} fill="#5a5a5c" textAnchor="middle">SUPER TROUPER</text>
  </g>
);

// ─── BEAM CONE ───────────────────────────────────────────────────
// Audio-reactive cone of light from a followspot

const BeamCone: React.FC<{
  topX: number;
  topY: number;
  bottomX: number;
  bottomY: number;
  spread: number;       // bottom width
  intensity: number;    // 0..1
  color: string;
}> = ({ topX, topY, bottomX, bottomY, spread, intensity, color }) => {
  const dx = bottomX - topX;
  const dy = bottomY - topY;
  const len = Math.sqrt(dx * dx + dy * dy);
  // Perpendicular direction (normalized)
  const px = -dy / len;
  const py = dx / len;
  return (
    <g>
      {/* Outer glow — broad soft cone */}
      <path
        d={`M ${topX - 3} ${topY} L ${bottomX + spread * px} ${bottomY + spread * py} L ${bottomX - spread * px} ${bottomY - spread * py} L ${topX + 3} ${topY} Z`}
        fill={color}
        opacity={intensity * 0.18}
      />
      {/* Mid cone */}
      <path
        d={`M ${topX - 1.5} ${topY} L ${bottomX + spread * 0.6 * px} ${bottomY + spread * 0.6 * py} L ${bottomX - spread * 0.6 * px} ${bottomY - spread * 0.6 * py} L ${topX + 1.5} ${topY} Z`}
        fill={color}
        opacity={intensity * 0.35}
      />
      {/* Inner hot center */}
      <path
        d={`M ${topX - 0.6} ${topY} L ${bottomX + spread * 0.18 * px} ${bottomY + spread * 0.18 * py} L ${bottomX - spread * 0.18 * px} ${bottomY - spread * 0.18 * py} L ${topX + 0.6} ${topY} Z`}
        fill={color}
        opacity={intensity * 0.55}
      />
      {/* Bright source dot */}
      <circle cx={topX} cy={topY} r={2.5 + intensity * 1.5} fill={color} opacity={0.9} />
      {/* Outer halo */}
      <circle cx={topX} cy={topY} r={6 + intensity * 4} fill={color} opacity={intensity * 0.3} />
    </g>
  );
};

// ─── PAR CAN WASH ────────────────────────────────────────────────
// Colored circle bleed from truss

const ParWash: React.FC<{
  cx: number;
  cy: number;
  r: number;
  color: string;
  intensity: number;
}> = ({ cx, cy, r, color, intensity }) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill={color} opacity={intensity * 0.42} />
    <circle cx={cx} cy={cy} r={r * 0.6} fill={color} opacity={intensity * 0.5} />
    <circle cx={cx} cy={cy} r={r * 0.25} fill={color} opacity={intensity * 0.7} />
  </g>
);

// ─── GOBO PATTERN ────────────────────────────────────────────────
// Subtle moving pattern projected on the lower-frame "floor"

const GoboPattern: React.FC<{
  width: number;
  height: number;
  time: number;
  speed: number;
}> = ({ width, height, time, speed }) => {
  const t = time * speed;
  return (
    <g opacity={0.18}>
      {/* Six rotating leaf shapes */}
      {Array.from({ length: 6 }).map((_, i) => {
        const cx = (i + 0.5) * (width / 6);
        const phase = i * 0.4 + t;
        const sx = Math.cos(phase) * 12;
        return (
          <ellipse
            key={i}
            cx={cx + sx}
            cy={height - 30}
            rx={28}
            ry={6}
            fill="rgba(220,200,150,0.5)"
            transform={`rotate(${(phase * 30) % 360} ${cx + sx} ${height - 30})`}
          />
        );
      })}
    </g>
  );
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const StadiumLightRig: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const audio = useAudioSnapshot(frames);

  const energy = Math.min(1, audio?.energy ?? 0);
  const bass = Math.min(1, audio?.bass ?? 0);
  const vocalE = Math.min(1, audio?.vocalEnergy ?? 0);
  const beatSnap = Math.min(1, audio?.drumOnset ?? 0);
  const harmT = Math.min(1, audio?.harmonicTension ?? 0);
  const chordIdx = Math.floor((audio?.chromaHue ?? 0) * 12) % 12;

  // Truss spans top of frame
  const trussY = -2;
  const trussH = 22;

  // 4 followspot positions across the truss
  const fixtureXs = [width * 0.18, width * 0.4, width * 0.6, width * 0.82];

  // Beam target points — followspots track to vocal lead in center
  // when vocal is up, spread to corners when band is jamming
  const vocalCenter = vocalE > 0.3;
  const targetBaseY = height * 0.78;

  // Bass-driven beam shake
  const shake = bass * 4;

  // PAR wash colors cycle on chord index
  const parPalette = [
    "#e34050", "#f5b020", "#5a98c0", "#9c5ac0",
    "#30c050", "#f0f060", "#e0a040", "#a040c0",
    "#40d0e0", "#c83080", "#80a0d0", "#e08040",
  ];
  const parColor1 = parPalette[chordIdx];
  const parColor2 = parPalette[(chordIdx + 4) % 12];
  const parColor3 = parPalette[(chordIdx + 8) % 12];

  // Truss-mounted-light ON state — 1-3 lit at any given moment, beat-driven cycle
  const beatPhase = Math.floor(frame / 8) % 4;

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.34 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>

        {/* PAR wash — bleed from truss across upper frame */}
        <ParWash cx={width * 0.22} cy={trussY + 60} r={140 + bass * 30} color={parColor1} intensity={0.5 + energy * 0.5} />
        <ParWash cx={width * 0.5} cy={trussY + 80} r={170 + bass * 40} color={parColor2} intensity={0.4 + energy * 0.6} />
        <ParWash cx={width * 0.78} cy={trussY + 60} r={140 + bass * 30} color={parColor3} intensity={0.5 + energy * 0.5} />

        {/* Followspot beams — drawn BEHIND truss so they appear to come from the rig */}
        {fixtureXs.map((fx, i) => {
          const lit = i === beatPhase || (vocalCenter && (i === 1 || i === 2));
          if (!lit) return null;
          // Target: when vocal is leading, all beams converge center-low
          const targetX = vocalCenter
            ? width * 0.5 + (i - 1.5) * 30 + Math.sin(frame * 0.04 + i) * 10
            : width * (0.15 + i * 0.22) + Math.cos(frame * 0.03 + i) * 50;
          const targetY = targetBaseY + Math.sin(frame * 0.05 + i) * 20;
          const beamColor = i % 2 === 0 ? "#fef0c0" : "#fed8a0";
          const beamIntensity = 0.5 + energy * 0.5 + beatSnap * 0.2;
          return (
            <BeamCone
              key={i}
              topX={fx + (i % 2 === 0 ? shake : -shake)}
              topY={trussY + 18}
              bottomX={targetX}
              bottomY={targetY}
              spread={50 + bass * 18 + (vocalCenter ? -15 : 0)}
              intensity={beamIntensity}
              color={beamColor}
            />
          );
        })}

        {/* Truss spans top of frame */}
        <TrussSegment x={width * 0.05} y={trussY} w={width * 0.9} h={trussH} />

        {/* Vertical truss legs descending from edges */}
        <rect x={width * 0.05} y={trussY + trussH} width={4} height={20} fill="#3a3a3c" />
        <rect x={width * 0.95 - 4} y={trussY + trussH} width={4} height={20} fill="#3a3a3c" />

        {/* Followspot fixtures mounted on truss */}
        {fixtureXs.map((fx, i) => {
          const lit = i === beatPhase || (vocalCenter && (i === 1 || i === 2));
          return <FollowspotFixture key={i} cx={fx} cy={trussY + 15} on={lit} />;
        })}

        {/* PAR cans visible on truss between followspots */}
        {[width * 0.28, width * 0.5, width * 0.72].map((px, i) => (
          <g key={`par-${i}`} transform={`translate(${px} ${trussY + 14})`}>
            <rect x={-4} y={0} width={8} height={6} rx={1} fill="#0a0a0a" />
            <ellipse cx={0} cy={7} rx={3} ry={1.2} fill={[parColor1, parColor2, parColor3][i]} opacity={0.85} />
          </g>
        ))}

        {/* Smoke/haze plume rising from bottom edge */}
        <defs>
          <radialGradient id="venueHaze" cx="0.5" cy="1" r="1">
            <stop offset="0%" stopColor="rgba(255,200,140,0.22)" />
            <stop offset="60%" stopColor="rgba(220,180,120,0.10)" />
            <stop offset="100%" stopColor="rgba(220,180,120,0)" />
          </radialGradient>
        </defs>
        <rect x={0} y={height - 220} width={width} height={220} fill="url(#venueHaze)" opacity={0.65 + energy * 0.25} />

        {/* Drifting haze wisps */}
        <g opacity={0.4}>
          {Array.from({ length: 6 }).map((_, i) => {
            const phase = (frame * 0.005 + i * 0.7) % 1;
            const wx = (i + 0.5) * (width / 6) + Math.sin(frame * 0.02 + i) * 30;
            const wy = height - 120 - phase * 80;
            return (
              <ellipse
                key={i}
                cx={wx}
                cy={wy}
                rx={70 + i * 6}
                ry={20 + i * 2}
                fill="rgba(240,210,160,0.25)"
                opacity={(1 - phase) * 0.7}
              />
            );
          })}
        </g>

        {/* Gobo pattern projecting on floor */}
        <GoboPattern width={width} height={height} time={frame * 0.04} speed={1 + harmT * 1.5} />

        {/* Lens flare halos at brightest beam tops */}
        {fixtureXs.map((fx, i) => {
          const lit = i === beatPhase || (vocalCenter && (i === 1 || i === 2));
          if (!lit) return null;
          return (
            <g key={`flare-${i}`}>
              <circle cx={fx} cy={trussY + 18} r={20 + energy * 10} fill="rgba(255,240,200,0.25)" />
              {/* Cross-glints */}
              <line x1={fx - 24} y1={trussY + 18} x2={fx + 24} y2={trussY + 18} stroke="rgba(255,240,200,0.5)" strokeWidth={0.6} />
              <line x1={fx} y1={trussY + 4} x2={fx} y2={trussY + 32} stroke="rgba(255,240,200,0.45)" strokeWidth={0.5} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
