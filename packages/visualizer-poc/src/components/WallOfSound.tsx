/**
 * WallOfSound — The legendary 1974 Wall of Sound PA system.
 * 604 speakers, 26,400 watts, the most ambitious concert sound system ever built.
 * Three iconic elements rendered with rich detail:
 * - Wall of Sound: towering speaker stacks with realistic cabinets, cones, and depth
 * - Vinyl record: detailed spinning record with label art
 * - Neon sign: "GRATEFUL DEAD" with authentic neon tube aesthetics
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

// ── SPEAKER CABINET ─────────────────────────────────────────────
// A single speaker cabinet with realistic cone detail

const SpeakerCone: React.FC<{
  cx: number;
  cy: number;
  r: number;
  color: string;
  glowColor: string;
  excursion: number; // 0-1, bass-driven cone push
  brightness: number;
}> = ({ cx, cy, r, color, glowColor, excursion, brightness }) => {
  const coneDepth = r * 0.15 * excursion;
  const dustCapR = r * 0.22;
  const surroundR = r * 0.92;
  const frameR = r;

  return (
    <g>
      {/* Outer frame ring */}
      <circle cx={cx} cy={cy} r={frameR} fill="none" stroke={color} strokeWidth={1.2} opacity={0.5 * brightness} />
      {/* Rubber surround — subtle ridge */}
      <circle cx={cx} cy={cy} r={surroundR} fill="none" stroke={color} strokeWidth={2.5} opacity={0.2 * brightness} />
      {/* Cone body — radial lines suggesting paper cone */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const innerR = dustCapR + 1;
        const outerR = surroundR - 2;
        return (
          <line
            key={angle}
            x1={cx + Math.cos(rad) * innerR}
            y1={cy + Math.sin(rad) * innerR}
            x2={cx + Math.cos(rad) * outerR}
            y2={cy + Math.sin(rad) * outerR}
            stroke={color}
            strokeWidth={0.5}
            opacity={0.15 * brightness}
          />
        );
      })}
      {/* Cone surface — gradient from rim to center */}
      <circle
        cx={cx}
        cy={cy}
        r={surroundR - 2}
        fill={`rgba(${20 + excursion * 30}, ${20 + excursion * 20}, ${30 + excursion * 20}, ${0.08 * brightness})`}
      />
      {/* Dust cap — the center dome, pushes out on bass */}
      <circle
        cx={cx}
        cy={cy}
        r={dustCapR + coneDepth}
        fill={glowColor}
        opacity={0.25 + excursion * 0.3}
      />
      <circle
        cx={cx}
        cy={cy}
        r={dustCapR + coneDepth}
        fill="none"
        stroke={color}
        strokeWidth={1}
        opacity={0.6 * brightness}
      />
      {/* Highlight dot — specular on dust cap */}
      <circle
        cx={cx - dustCapR * 0.25}
        cy={cy - dustCapR * 0.25}
        r={dustCapR * 0.15}
        fill="white"
        opacity={0.08 + excursion * 0.12}
      />
    </g>
  );
};

const Cabinet: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  glowColor: string;
  bass: number;
  beatDecay: number;
  brightness: number;
  rows: number;
  cols: number;
}> = ({ x, y, w, h, color, glowColor, bass, beatDecay, brightness, rows, cols }) => {
  const padX = 6;
  const padY = 8;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const coneR = Math.min(innerW / (cols * 2), innerH / (rows * 2)) * 0.85;
  const excursion = bass * 0.6 + beatDecay * 0.4;

  return (
    <g>
      {/* Cabinet body — dark fill with border */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={3}
        fill="rgba(8, 8, 12, 0.7)"
        stroke={color}
        strokeWidth={1.5}
        opacity={0.6 * brightness}
      />
      {/* Inner bezel */}
      <rect
        x={x + 3}
        y={y + 3}
        width={w - 6}
        height={h - 6}
        rx={2}
        fill="none"
        stroke={color}
        strokeWidth={0.5}
        opacity={0.2 * brightness}
      />
      {/* Tolex texture — horizontal lines */}
      {Array.from({ length: Math.floor(h / 8) }, (_, i) => (
        <line
          key={`tex-${i}`}
          x1={x + 4}
          y1={y + 4 + i * 8}
          x2={x + w - 4}
          y2={y + 4 + i * 8}
          stroke={color}
          strokeWidth={0.3}
          opacity={0.04 * brightness}
        />
      ))}
      {/* Speaker cones grid */}
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => {
          const cx = x + padX + (col + 0.5) * (innerW / cols);
          const cy = y + padY + (row + 0.5) * (innerH / rows);
          return (
            <SpeakerCone
              key={`${row}-${col}`}
              cx={cx}
              cy={cy}
              r={coneR}
              color={color}
              glowColor={glowColor}
              excursion={excursion}
              brightness={brightness}
            />
          );
        })
      )}
      {/* Corner screws */}
      {[
        [x + 5, y + 5],
        [x + w - 5, y + 5],
        [x + 5, y + h - 5],
        [x + w - 5, y + h - 5],
      ].map(([sx, sy], i) => (
        <g key={`screw-${i}`}>
          <circle cx={sx} cy={sy} r={2} fill={color} opacity={0.3 * brightness} />
          <line x1={sx - 1} y1={sy} x2={sx + 1} y2={sy} stroke="black" strokeWidth={0.5} opacity={0.3} />
        </g>
      ))}
    </g>
  );
};

// ── WALL OF SOUND STRUCTURE ─────────────────────────────────────

const WallStructure: React.FC<{
  width: number;
  height: number;
  energy: number;
  bass: number;
  chromaHue: number;
  beatDecay: number;
  frame: number;
}> = ({ width, height, energy, bass, chromaHue, beatDecay }) => {
  if (energy < 0.12) return null;

  const brightness = interpolate(energy, [0.12, 0.35], [0.3, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const color = `hsl(${chromaHue}, 70%, ${45 + beatDecay * 10}%)`;
  const glowColor = `hsl(${chromaHue}, 80%, ${55 + beatDecay * 15}%)`;
  const wallGlow = `drop-shadow(0 0 ${6 + bass * 12}px ${glowColor}) drop-shadow(0 0 ${15 + energy * 20}px hsl(${chromaHue}, 60%, 40%))`;

  // Wall configuration: stacks of different heights, like the real Wall of Sound
  // Center stacks tallest (vocal/lead), sides shorter (bass/rhythm)
  const baseY = height - 8;
  const stackW = 72;
  const numStacks = Math.ceil(width / stackW) + 1;
  const centerIdx = numStacks / 2;

  return (
    <svg
      width={width}
      height={height}
      style={{
        position: "absolute",
        inset: 0,
        opacity: brightness,
        filter: wallGlow,
        pointerEvents: "none",
      }}
    >
      {/* Structural rigging bar across top of wall */}
      <rect
        x={0}
        y={baseY - 280}
        width={width}
        height={3}
        fill={color}
        opacity={0.15 * brightness}
      />

      {Array.from({ length: numStacks }, (_, i) => {
        const x = i * stackW;
        // Height curve: tallest at center, shorter at edges (parabolic)
        const distFromCenter = Math.abs(i - centerIdx) / centerIdx;
        const heightMult = 1 - distFromCenter * 0.4;
        const baseH = (200 + energy * 60) * heightMult;

        // Each stack is 2-3 cabinets vertically
        const cabH = baseH / 3;
        const cabW = stackW - 4;

        return (
          <g key={i}>
            {/* Bottom cabinet: 4x2 — subwoofers */}
            <Cabinet
              x={x + 2}
              y={baseY - cabH}
              w={cabW}
              h={cabH}
              color={color}
              glowColor={glowColor}
              bass={bass}
              beatDecay={beatDecay}
              brightness={brightness}
              rows={2}
              cols={2}
            />
            {/* Middle cabinet: 4x2 — mids */}
            <Cabinet
              x={x + 2}
              y={baseY - cabH * 2 - 2}
              w={cabW}
              h={cabH}
              color={color}
              glowColor={glowColor}
              bass={bass * 0.5}
              beatDecay={beatDecay}
              brightness={brightness * 0.9}
              rows={2}
              cols={2}
            />
            {/* Top cabinet: smaller — tweeters */}
            {heightMult > 0.7 && (
              <Cabinet
                x={x + 2}
                y={baseY - cabH * 3 - 4}
                w={cabW}
                h={cabH * 0.8}
                color={color}
                glowColor={glowColor}
                bass={bass * 0.2}
                beatDecay={beatDecay}
                brightness={brightness * 0.7}
                rows={2}
                cols={3}
              />
            )}
            {/* Vertical support struts between stacks */}
            <line
              x1={x}
              y1={baseY}
              x2={x}
              y2={baseY - baseH - 10}
              stroke={color}
              strokeWidth={1.5}
              opacity={0.12 * brightness}
            />
          </g>
        );
      })}

      {/* Ground reflection glow */}
      <rect
        x={0}
        y={baseY}
        width={width}
        height={20}
        fill={`url(#wall-ground-glow)`}
        opacity={0.3 * brightness}
      />
      <defs>
        <linearGradient id="wall-ground-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={glowColor} stopOpacity={0.4} />
          <stop offset="100%" stopColor={glowColor} stopOpacity={0} />
        </linearGradient>
      </defs>
    </svg>
  );
};

// ── SPINNING VINYL ──────────────────────────────────────────────

const VinylRecord: React.FC<{
  energy: number;
  chromaHue: number;
  tempoFactor: number;
  beatDecay: number;
  frame: number;
}> = ({ energy, chromaHue, tempoFactor, beatDecay, frame }) => {
  const size = 130;
  const rotation = frame * (1.5 + energy * 2.5) * tempoFactor;
  const labelColor = `hsl(${chromaHue}, 60%, 45%)`;
  const labelHighlight = `hsl(${(chromaHue + 30) % 360}, 70%, 55%)`;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        right: 20,
        opacity: interpolate(energy, [0.05, 0.2], [0.3, 0.65], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        filter: `drop-shadow(0 0 ${6 + beatDecay * 8}px ${labelColor})`,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 130 130">
        <defs>
          {/* Vinyl surface gradient — subtle sheen */}
          <radialGradient id="vinyl-surface" cx="50%" cy="45%" r="50%">
            <stop offset="0%" stopColor="#1a1a1a" />
            <stop offset="60%" stopColor="#0d0d0d" />
            <stop offset="100%" stopColor="#111" />
          </radialGradient>
          {/* Label gradient */}
          <radialGradient id="label-gradient" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor={labelHighlight} stopOpacity={0.8} />
            <stop offset="100%" stopColor={labelColor} stopOpacity={0.6} />
          </radialGradient>
        </defs>
        <g transform={`rotate(${rotation} 65 65)`}>
          {/* Record body */}
          <circle cx="65" cy="65" r="62" fill="url(#vinyl-surface)" stroke="#333" strokeWidth={0.5} />
          {/* Grooves — many concentric rings with varying opacity */}
          {Array.from({ length: 18 }, (_, i) => {
            const r = 22 + i * 2.2;
            return (
              <circle
                key={i}
                cx="65"
                cy="65"
                r={r}
                stroke="rgba(180, 180, 180, 0.06)"
                strokeWidth={0.6}
                fill="none"
              />
            );
          })}
          {/* Light reflection arc — the characteristic vinyl sheen */}
          <path
            d="M 25 55 Q 65 30 105 55"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={12}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 30 58 Q 65 38 100 58"
            stroke="rgba(255, 255, 255, 0.04)"
            strokeWidth={6}
            fill="none"
          />
          {/* Label */}
          <circle cx="65" cy="65" r="20" fill="url(#label-gradient)" />
          <circle cx="65" cy="65" r="19.5" stroke={labelHighlight} strokeWidth={0.5} fill="none" opacity={0.4} />
          {/* Label text — Grateful Dead */}
          <text
            x="65"
            y="60"
            textAnchor="middle"
            fontSize="5.5"
            fill="white"
            opacity={0.7}
            fontFamily="'Georgia', serif"
            fontWeight="bold"
            letterSpacing="0.8"
          >
            GRATEFUL DEAD
          </text>
          {/* Label subtext */}
          <text
            x="65"
            y="67"
            textAnchor="middle"
            fontSize="3.5"
            fill="white"
            opacity={0.45}
            fontFamily="'Georgia', serif"
            letterSpacing="0.5"
          >
            WALL OF SOUND
          </text>
          <text
            x="65"
            y="73"
            textAnchor="middle"
            fontSize="3"
            fill="white"
            opacity={0.35}
            fontFamily="'Georgia', serif"
          >
            1974
          </text>
          {/* Center spindle hole */}
          <circle cx="65" cy="65" r="3" fill="#000" />
          <circle cx="65" cy="65" r="3.5" stroke="#444" strokeWidth={0.5} fill="none" />
        </g>
      </svg>
    </div>
  );
};

// ── NEON SIGN ───────────────────────────────────────────────────

const NeonSign: React.FC<{
  energy: number;
  chromaHue: number;
  onsetEnvelope: number;
  beatDecay: number;
  frame: number;
}> = ({ energy, chromaHue, onsetEnvelope, beatDecay, frame }) => {
  const opacity = interpolate(energy, [0.05, 0.25], [0.4, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Neon buzz — subtle rapid oscillation like real gas discharge tubes
  const buzz = 0.92 + Math.sin(frame * 11.3) * 0.04 + Math.sin(frame * 7.7) * 0.04;
  // Onset-triggered power surge — tubes flare bright then settle
  const surge = onsetEnvelope > 0.35 ? 1 + onsetEnvelope * 0.3 : 1;
  const flicker1 = buzz * surge;
  // "DEAD" flickers independently with slight phase offset
  const buzz2 = 0.93 + Math.sin(frame * 9.1 + 2) * 0.04 + Math.sin(frame * 13.3) * 0.03;
  const flicker2 = buzz2 * surge;

  const hue = chromaHue;
  const lightness = 58 + beatDecay * 12;
  const color1 = `hsl(${hue}, 100%, ${lightness}%)`;
  const color2 = `hsl(${(hue + 55) % 360}, 100%, ${lightness}%)`;
  // Warm glow around tubes — slightly desaturated, wider spread
  const glowColor1 = `hsl(${hue}, 60%, ${lightness - 10}%)`;
  const glowColor2 = `hsl(${(hue + 55) % 360}, 60%, ${lightness - 10}%)`;

  return (
    <div
      style={{
        position: "absolute",
        top: "44%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        opacity,
        pointerEvents: "none",
      }}
    >
      {/* "GRATEFUL" — upper tube */}
      <div
        style={{
          fontSize: 62,
          fontWeight: 900,
          fontFamily: "'Georgia', serif",
          letterSpacing: 14,
          color: color1,
          opacity: flicker1,
          textShadow: `
            0 0 4px ${color1},
            0 0 8px ${color1},
            0 0 20px ${glowColor1},
            0 0 40px ${glowColor1},
            0 0 80px ${glowColor1}
          `,
          textAlign: "center",
          lineHeight: 1,
          WebkitTextStroke: `0.5px ${color1}`,
        }}
      >
        GRATEFUL
      </div>
      {/* "DEAD" — lower tube, complementary color */}
      <div
        style={{
          fontSize: 78,
          fontWeight: 900,
          fontFamily: "'Georgia', serif",
          letterSpacing: 22,
          color: color2,
          opacity: flicker2,
          textShadow: `
            0 0 4px ${color2},
            0 0 8px ${color2},
            0 0 20px ${glowColor2},
            0 0 40px ${glowColor2},
            0 0 80px ${glowColor2}
          `,
          textAlign: "center",
          lineHeight: 1,
          marginTop: 6,
          WebkitTextStroke: `0.5px ${color2}`,
        }}
      >
        DEAD
      </div>
      {/* Mounting bar — the sign hangs from something */}
      <div
        style={{
          position: "absolute",
          top: -12,
          left: "10%",
          right: "10%",
          height: 2,
          background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)`,
        }}
      />
    </div>
  );
};

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const WallOfSound: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, bass, chromaHue, beatDecay, onsetEnvelope } = snap;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <WallStructure
        width={width}
        height={height}
        energy={energy}
        bass={bass}
        chromaHue={chromaHue}
        beatDecay={beatDecay}
        frame={frame}
      />
      <VinylRecord
        energy={energy}
        chromaHue={chromaHue}
        tempoFactor={tempoFactor}
        beatDecay={beatDecay}
        frame={frame}
      />
      <NeonSign
        energy={energy}
        chromaHue={chromaHue}
        onsetEnvelope={onsetEnvelope}
        beatDecay={beatDecay}
        frame={frame}
      />
    </div>
  );
};
