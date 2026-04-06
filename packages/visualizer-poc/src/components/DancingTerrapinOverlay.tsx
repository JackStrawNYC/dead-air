/**
 * DancingTerrapinOverlay — A+++ Terrapin Station sea turtle overlay.
 *
 * Ornate, album-art-quality sea turtles swimming through cosmic space.
 * 3-5 turtles at varying depths with richly detailed SVG: domed hexagonal
 * shell with inner detail, jointed flippers with fin ridges, scaled head
 * with beak and eye, trailing wake bubbles. Psychedelic palette driven
 * by chromaHue, beat-synced flipper strokes, energy-driven glow.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useSongPalette } from "../data/SongPaletteContext";
import { useTempoFactor } from "../data/TempoContext";

interface Props {
  frames: EnhancedFrameData[];
}

/* ─── Turtle instance config ─── */
interface TurtleInstance {
  /** Normalized X center (0-1) */
  cx: number;
  /** Normalized Y center (0-1) */
  cy: number;
  /** Scale relative to base */
  scale: number;
  /** Phase offset for animation desync */
  phase: number;
  /** Heading angle (degrees, 0 = right) */
  heading: number;
  /** Opacity multiplier */
  opacity: number;
  /** Depth layer for parallax drift speed */
  depth: number;
}

const TURTLES: TurtleInstance[] = [
  { cx: 0.50, cy: 0.45, scale: 1.0,  phase: 0,    heading: -15, opacity: 1.0, depth: 1.0  },
  { cx: 0.20, cy: 0.30, scale: 0.65, phase: 1.8,  heading: 10,  opacity: 0.7, depth: 0.7  },
  { cx: 0.78, cy: 0.62, scale: 0.75, phase: 3.1,  heading: -25, opacity: 0.75, depth: 0.8 },
  { cx: 0.35, cy: 0.72, scale: 0.50, phase: 4.5,  heading: 5,   opacity: 0.55, depth: 0.5 },
  { cx: 0.82, cy: 0.22, scale: 0.42, phase: 5.9,  heading: -8,  opacity: 0.45, depth: 0.4 },
];

/* ─── Bubble config ─── */
interface Bubble {
  dx: number;
  dy: number;
  r: number;
  speed: number;
  phase: number;
}

function makeBubbles(count: number, seed: number): Bubble[] {
  const out: Bubble[] = [];
  for (let i = 0; i < count; i++) {
    const s = seed + i * 137.508;
    out.push({
      dx: -30 - (((s * 7.3) % 60)),
      dy: ((s * 3.7) % 40) - 20,
      r: 1.2 + ((s * 1.9) % 3),
      speed: 0.5 + ((s * 2.3) % 1.5),
      phase: (s * 0.8) % (Math.PI * 2),
    });
  }
  return out;
}

/* ─── Hex shell helper ─── */
function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(" ");
}

/* ─── Single ornate turtle SVG ─── */
function OrnateTurtle({
  hue1,
  hue2,
  chromaHue,
  flipperAngle,
  breathScale,
  glowIntensity,
  id,
}: {
  hue1: number;
  hue2: number;
  chromaHue: number;
  flipperAngle: number;
  breathScale: number;
  glowIntensity: number;
  id: string;
}) {
  // Shell gradient colors — psychedelic chroma-driven
  const shellBase = `hsl(${hue1}, 55%, 42%)`;
  const shellLight = `hsl(${hue1}, 60%, 62%)`;
  const shellDark = `hsl(${hue1}, 50%, 28%)`;
  const shellAccent = `hsl(${chromaHue}, 65%, 55%)`;
  const bodyColor = `hsl(${hue2}, 40%, 35%)`;
  const bodyLight = `hsl(${hue2}, 35%, 50%)`;
  const scaleColor = `hsl(${hue2}, 30%, 28%)`;
  const eyeColor = `hsl(${(chromaHue + 60) % 360}, 70%, 60%)`;
  const neonGlow = `hsl(${chromaHue}, 80%, 65%)`;
  const hexDetailColor = `hsl(${(hue1 + 30) % 360}, 50%, 55%)`;

  // Shell hex centers (7 hexagons: 1 center + 6 ring)
  const hexR = 14;
  const hexCenters = [
    { x: 100, y: 90 },
    { x: 100, y: 90 - hexR * 1.7 },
    { x: 100 + hexR * 1.5, y: 90 - hexR * 0.85 },
    { x: 100 + hexR * 1.5, y: 90 + hexR * 0.85 },
    { x: 100, y: 90 + hexR * 1.7 },
    { x: 100 - hexR * 1.5, y: 90 + hexR * 0.85 },
    { x: 100 - hexR * 1.5, y: 90 - hexR * 0.85 },
  ];

  const fAngle = flipperAngle;

  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Shell dome gradient */}
        <radialGradient id={`${id}-shell`} cx="45%" cy="35%" r="60%">
          <stop offset="0%" stopColor={shellLight} stopOpacity={0.95} />
          <stop offset="50%" stopColor={shellBase} stopOpacity={0.9} />
          <stop offset="100%" stopColor={shellDark} stopOpacity={0.85} />
        </radialGradient>
        {/* Highlight sheen on upper shell */}
        <radialGradient id={`${id}-sheen`} cx="40%" cy="25%" r="35%">
          <stop offset="0%" stopColor="white" stopOpacity={0.25} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </radialGradient>
        {/* Hex cell gradient */}
        <radialGradient id={`${id}-hex`} cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor={shellAccent} stopOpacity={0.6} />
          <stop offset="100%" stopColor={shellDark} stopOpacity={0.3} />
        </radialGradient>
        {/* Body gradient */}
        <linearGradient id={`${id}-body`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={bodyLight} />
          <stop offset="100%" stopColor={bodyColor} />
        </linearGradient>
        {/* Neon outer glow */}
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={3 + glowIntensity * 4} result="blur" />
          <feFlood floodColor={neonGlow} floodOpacity={0.4 + glowIntensity * 0.3} result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter={`url(#${id}-glow)`} transform={`scale(${breathScale})`} style={{ transformOrigin: "100px 95px" }}>

        {/* ════════ TAIL ════════ */}
        <path
          d="M 100 138 Q 97 150, 102 158 Q 105 163, 99 168"
          stroke={bodyColor}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          opacity={0.65}
        />
        <path
          d="M 99 168 Q 94 170, 97 165 Q 103 165, 99 168"
          fill={bodyColor}
          opacity={0.5}
        />

        {/* ════════ REAR FLIPPERS ════════ */}
        {/* Left rear flipper */}
        <g transform={`rotate(${12 + fAngle * 0.6} 68 125)`}>
          <ellipse cx="52" cy="128" rx="18" ry="7" fill={`url(#${id}-body)`} opacity={0.7} />
          {/* Fin ridges */}
          <line x1="42" y1="125" x2="38" y2="128" stroke={scaleColor} strokeWidth="0.8" opacity={0.5} />
          <line x1="46" y1="124" x2="42" y2="127" stroke={scaleColor} strokeWidth="0.8" opacity={0.5} />
          <line x1="50" y1="124" x2="46" y2="126" stroke={scaleColor} strokeWidth="0.8" opacity={0.5} />
          {/* Joint line */}
          <line x1="60" y1="126" x2="48" y2="128" stroke={scaleColor} strokeWidth="1" opacity={0.4} />
        </g>
        {/* Right rear flipper */}
        <g transform={`rotate(${-12 - fAngle * 0.6} 132 125)`}>
          <ellipse cx="148" cy="128" rx="18" ry="7" fill={`url(#${id}-body)`} opacity={0.7} />
          <line x1="158" y1="125" x2="162" y2="128" stroke={scaleColor} strokeWidth="0.8" opacity={0.5} />
          <line x1="154" y1="124" x2="158" y2="127" stroke={scaleColor} strokeWidth="0.8" opacity={0.5} />
          <line x1="150" y1="124" x2="154" y2="126" stroke={scaleColor} strokeWidth="0.8" opacity={0.5} />
          <line x1="140" y1="126" x2="152" y2="128" stroke={scaleColor} strokeWidth="1" opacity={0.4} />
        </g>

        {/* ════════ FRONT FLIPPERS ════════ */}
        {/* Left front flipper — full paddle stroke */}
        <g transform={`rotate(${-20 + fAngle} 60 82)`}>
          <path
            d="M 60 82 Q 38 74, 22 80 Q 16 83, 20 88 Q 28 94, 55 90"
            fill={`url(#${id}-body)`}
            opacity={0.8}
          />
          {/* Fin ridges */}
          <line x1="30" y1="79" x2="26" y2="84" stroke={scaleColor} strokeWidth="0.9" opacity={0.5} />
          <line x1="36" y1="78" x2="32" y2="82" stroke={scaleColor} strokeWidth="0.9" opacity={0.5} />
          <line x1="42" y1="78" x2="38" y2="81" stroke={scaleColor} strokeWidth="0.9" opacity={0.5} />
          <line x1="48" y1="79" x2="44" y2="82" stroke={scaleColor} strokeWidth="0.9" opacity={0.5} />
          {/* Joint detail */}
          <ellipse cx="55" cy="85" rx="4" ry="3" fill={scaleColor} opacity={0.3} />
        </g>
        {/* Right front flipper */}
        <g transform={`rotate(${20 - fAngle} 140 82)`}>
          <path
            d="M 140 82 Q 162 74, 178 80 Q 184 83, 180 88 Q 172 94, 145 90"
            fill={`url(#${id}-body)`}
            opacity={0.8}
          />
          <line x1="170" y1="79" x2="174" y2="84" stroke={scaleColor} strokeWidth="0.9" opacity={0.5} />
          <line x1="164" y1="78" x2="168" y2="82" stroke={scaleColor} strokeWidth="0.9" opacity={0.5} />
          <line x1="158" y1="78" x2="162" y2="81" stroke={scaleColor} strokeWidth="0.9" opacity={0.5} />
          <line x1="152" y1="79" x2="156" y2="82" stroke={scaleColor} strokeWidth="0.9" opacity={0.5} />
          <ellipse cx="145" cy="85" rx="4" ry="3" fill={scaleColor} opacity={0.3} />
        </g>

        {/* ════════ SHELL — outer shape ════════ */}
        <ellipse cx="100" cy="90" rx="52" ry="44" fill={`url(#${id}-shell)`} />
        {/* Rim edge — dark outline for 3D pop */}
        <ellipse cx="100" cy="90" rx="52" ry="44" stroke={shellDark} strokeWidth="2" fill="none" />
        {/* Scute border lines — major divisions */}
        <path d="M 100 46 L 100 134" stroke={shellDark} strokeWidth="1.2" opacity={0.35} />
        <path d="M 58 68 Q 100 90, 142 68" stroke={shellDark} strokeWidth="1" opacity={0.3} />
        <path d="M 58 112 Q 100 90, 142 112" stroke={shellDark} strokeWidth="1" opacity={0.3} />

        {/* ════════ SHELL — 7 hexagonal scutes ════════ */}
        {hexCenters.map((h, i) => {
          const r = i === 0 ? hexR + 2 : hexR;
          const detailR = r * 0.55;
          return (
            <g key={i}>
              {/* Hex outline */}
              <polygon
                points={hexPoints(h.x, h.y, r)}
                fill={`url(#${id}-hex)`}
                stroke={shellAccent}
                strokeWidth="1.2"
                opacity={0.7}
              />
              {/* Inner detail — smaller concentric hex */}
              <polygon
                points={hexPoints(h.x, h.y, detailR)}
                fill="none"
                stroke={hexDetailColor}
                strokeWidth="0.7"
                opacity={0.5}
              />
              {/* Radial detail lines from inner to outer hex */}
              {[0, 1, 2, 3, 4, 5].map((j) => {
                const aOuter = (Math.PI / 3) * j - Math.PI / 6;
                const aInner = aOuter;
                return (
                  <line
                    key={j}
                    x1={h.x + detailR * Math.cos(aInner)}
                    y1={h.y + detailR * Math.sin(aInner)}
                    x2={h.x + r * Math.cos(aOuter)}
                    y2={h.y + r * Math.sin(aOuter)}
                    stroke={hexDetailColor}
                    strokeWidth="0.5"
                    opacity={0.35}
                  />
                );
              })}
              {/* Center dot */}
              <circle cx={h.x} cy={h.y} r="1.5" fill={shellAccent} opacity={0.4} />
            </g>
          );
        })}

        {/* ════════ SHELL — highlight sheen ════════ */}
        <ellipse cx="100" cy="90" rx="52" ry="44" fill={`url(#${id}-sheen)`} />
        {/* Marginal scutes — small bumps along shell rim */}
        {Array.from({ length: 14 }, (_, i) => {
          const angle = (Math.PI / 7) * i + Math.PI * 0.06;
          const rx = 52, ry = 44;
          const px = 100 + rx * Math.cos(angle + Math.PI);
          const py = 90 + ry * Math.sin(angle + Math.PI);
          return (
            <circle
              key={`m${i}`}
              cx={px}
              cy={py}
              r="2.5"
              fill={shellDark}
              opacity={0.3}
              stroke={shellBase}
              strokeWidth="0.5"
            />
          );
        })}

        {/* ════════ HEAD ════════ */}
        {/* Neck */}
        <path
          d="M 88 52 Q 92 38, 100 32 Q 108 38, 112 52"
          fill={`url(#${id}-body)`}
          opacity={0.85}
        />
        {/* Neck scales */}
        <path d="M 93 48 Q 96 44, 100 43 Q 104 44, 107 48" stroke={scaleColor} strokeWidth="0.7" fill="none" opacity={0.4} />
        <path d="M 91 52 Q 95 47, 100 46 Q 105 47, 109 52" stroke={scaleColor} strokeWidth="0.7" fill="none" opacity={0.35} />
        <path d="M 94 44 Q 97 41, 100 40 Q 103 41, 106 44" stroke={scaleColor} strokeWidth="0.6" fill="none" opacity={0.3} />
        {/* Head shape — slightly angular/beak-like */}
        <path
          d="M 92 38 Q 92 28, 100 24 Q 108 28, 108 38 Q 104 42, 100 42 Q 96 42, 92 38Z"
          fill={`url(#${id}-body)`}
          stroke={scaleColor}
          strokeWidth="1"
          opacity={0.9}
        />
        {/* Beak / mouth */}
        <path
          d="M 96 28 Q 100 22, 104 28"
          stroke={scaleColor}
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          opacity={0.7}
        />
        <line x1="100" y1="22" x2="100" y2="25" stroke={scaleColor} strokeWidth="0.8" opacity={0.5} />
        {/* Eyes */}
        <ellipse cx="95" cy="32" rx="3" ry="2.5" fill="black" opacity={0.8} />
        <ellipse cx="95" cy="32" rx="2" ry="1.8" fill={eyeColor} opacity={0.9} />
        <circle cx="94.5" cy="31.5" r="0.8" fill="white" opacity={0.85} />
        <ellipse cx="105" cy="32" rx="3" ry="2.5" fill="black" opacity={0.8} />
        <ellipse cx="105" cy="32" rx="2" ry="1.8" fill={eyeColor} opacity={0.9} />
        <circle cx="104.5" cy="31.5" r="0.8" fill="white" opacity={0.85} />
        {/* Brow ridges */}
        <path d="M 91 30 Q 95 28, 97 30" stroke={scaleColor} strokeWidth="0.8" fill="none" opacity={0.5} />
        <path d="M 103 30 Q 105 28, 109 30" stroke={scaleColor} strokeWidth="0.8" fill="none" opacity={0.5} />
      </g>
    </svg>
  );
}

/* ─── Main component ─── */

export const DancingTerrapinOverlay: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const palette = useSongPalette();
  const tempoFactor = useTempoFactor();

  const t = frame / 30;

  // Global audio-derived values
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue;
  const beatDecay = snap.beatDecay;
  const bass = snap.bass;

  // Flipper stroke: beat-synced paddle using musicalTime
  const musicalTime = snap.musicalTime;
  const flipperBase = Math.sin(musicalTime * Math.PI * 2) * 15;

  // Energy-driven glow intensity
  const glowIntensity = interpolate(energy, [0.03, 0.4], [0.0, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Breathing scale from slow energy
  const breathBase = interpolate(slowEnergy, [0.02, 0.25], [0.95, 1.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Overall opacity — atmospheric presence, never overpowering
  const globalOpacity = interpolate(energy, [0.02, 0.25], [0.14, 0.32], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Hues: blend palette + chroma for psychedelic drift
  const hue1 = (palette.primary + chromaHue * 0.3) % 360;
  const hue2 = (palette.secondary + chromaHue * 0.2) % 360;

  // Pre-generate bubble sets per turtle (stable reference via index)
  const bubbleSets = React.useMemo(
    () => TURTLES.map((_, i) => makeBubbles(6, i * 1000 + 42)),
    [],
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {TURTLES.map((turtle, idx) => {
        const phase = turtle.phase;
        const depthMod = turtle.depth;

        // Per-turtle swimming motion — parallax by depth
        const swimX =
          Math.sin(t * 0.4 * tempoFactor + phase) * 20 * depthMod +
          Math.cos(t * 0.15 + phase * 2) * 10 * depthMod;
        const swimY =
          Math.cos(t * 0.5 * tempoFactor + phase) * 12 * depthMod +
          bass * 6 * depthMod;

        // Body undulation — gentle sine wave
        const undulate = Math.sin(t * 2.0 * tempoFactor + phase) * 2.5;

        // Rotation — very slow drift
        const rot = Math.sin(t * 0.2 + phase) * 4 + turtle.heading;

        // Flipper desync per turtle
        const flipper = flipperBase * (0.8 + depthMod * 0.4) + Math.sin(t * 3 + phase) * 5 * beatDecay;

        // Scale breath
        const breath = breathBase + Math.sin(t * 1.2 + phase) * 0.02;

        // Per-turtle opacity
        const turtleOpacity = globalOpacity * turtle.opacity;

        const baseSize = Math.min(width, height) * 0.18 * turtle.scale;
        const cx = turtle.cx * width;
        const cy = turtle.cy * height;

        // Bubbles for this turtle
        const bubbles = bubbleSets[idx];

        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: cx - baseSize / 2 + swimX,
              top: cy - baseSize / 2 + swimY,
              width: baseSize,
              height: baseSize,
              opacity: turtleOpacity,
              transform: `rotate(${rot + undulate}deg)`,
              willChange: "transform, opacity, left, top",
            }}
          >
            {/* Wake bubbles — trailing behind each turtle */}
            <svg
              style={{
                position: "absolute",
                left: -baseSize * 0.4,
                top: -baseSize * 0.15,
                width: baseSize * 1.8,
                height: baseSize * 1.3,
                overflow: "visible",
                pointerEvents: "none",
              }}
              viewBox="0 0 200 200"
            >
              {bubbles.map((b, bi) => {
                const bt = t * b.speed + b.phase;
                const bx = 100 + b.dx + Math.sin(bt * 2) * 5;
                const by = 100 + b.dy + Math.cos(bt * 1.5) * 4;
                const bOpacity = 0.15 + beatDecay * 0.2 + Math.sin(bt) * 0.05;
                const bScale = 1 + energy * 0.5;
                return (
                  <circle
                    key={bi}
                    cx={bx}
                    cy={by}
                    r={b.r * bScale}
                    fill={`hsl(${chromaHue}, 50%, 70%)`}
                    opacity={Math.max(0, Math.min(0.4, bOpacity))}
                  />
                );
              })}
            </svg>

            {/* The turtle itself */}
            <OrnateTurtle
              hue1={hue1}
              hue2={hue2}
              chromaHue={chromaHue}
              flipperAngle={flipper}
              breathScale={breath}
              glowIntensity={glowIntensity}
              id={`terrapin-${idx}`}
            />
          </div>
        );
      })}
    </div>
  );
};
