/**
 * SkullKaleidoscope -- A+++ mesmerizing mandala of skulls.
 *
 * Central detailed skull with neon glow, surrounded by two concentric rings
 * of reflected/rotated skulls in 8-fold symmetry. Decorative connective
 * elements: ornamental arcs, rose motifs on the outer ring, and lightning
 * bolts radiating from center. Multi-speed counter-rotating rings,
 * breathing/pulsing driven by slowEnergy, beatDecay, onsetEnvelope, energy.
 *
 * Layer 5 Psychedelic, Tier A. 300+ lines, fully audio-reactive.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SEGMENTS = 8;
const CYCLE = 1200;
const DURATION = 420;

/* ------------------------------------------------------------------ */
/*  Color utility                                                      */
/* ------------------------------------------------------------------ */

function hsl(h: number, s: number, l: number): string {
  return `hsl(${((h % 360) + 360) % 360}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

/* ------------------------------------------------------------------ */
/*  DetailedSkull -- cranium, eye sockets with inner glow, nose,       */
/*  jaw with individual teeth, neon outline with glow                  */
/* ------------------------------------------------------------------ */

const DetailedSkull: React.FC<{
  size: number;
  color: string;
  glowColor: string;
  eyeGlow: number; // 0-1 intensity for inner eye socket glow
  glowRadius: number;
}> = ({ size, color, glowColor, eyeGlow, glowRadius }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
    <defs>
      <radialGradient id="eyeGlowL" cx="0.5" cy="0.5" r="0.6">
        <stop offset="0%" stopColor={glowColor} stopOpacity={eyeGlow * 0.9} />
        <stop offset="100%" stopColor={glowColor} stopOpacity={0} />
      </radialGradient>
      <radialGradient id="eyeGlowR" cx="0.5" cy="0.5" r="0.6">
        <stop offset="0%" stopColor={glowColor} stopOpacity={eyeGlow * 0.9} />
        <stop offset="100%" stopColor={glowColor} stopOpacity={0} />
      </radialGradient>
      <filter id="skullGlow">
        <feGaussianBlur stdDeviation={glowRadius * 0.3} />
      </filter>
    </defs>

    {/* Glow layer (blurred copy of cranium) */}
    <path
      d="M100 18 C65 18 42 46 42 78 C42 98 50 114 64 126 L64 140 L78 150 L122 150 L136 140 L136 126 C150 114 158 98 158 78 C158 46 135 18 100 18 Z"
      stroke={glowColor} strokeWidth="4" fill="none" filter="url(#skullGlow)" opacity="0.6"
    />

    {/* ── Cranium dome ── */}
    <path
      d="M100 18 C65 18 42 46 42 78 C42 98 50 114 64 126 L64 140 L78 150 L122 150 L136 140 L136 126 C150 114 158 98 158 78 C158 46 135 18 100 18 Z"
      stroke={color} strokeWidth="2.5" fill="none"
    />
    {/* Cranium suture lines */}
    <path d="M68 40 Q100 32 132 40" stroke={color} strokeWidth="0.8" opacity="0.3" />
    <path d="M100 18 C100 28 100 38 100 52" stroke={color} strokeWidth="0.6" opacity="0.2" />
    <path d="M58 65 Q80 60 100 62 Q120 60 142 65" stroke={color} strokeWidth="0.7" opacity="0.25" />

    {/* ── Temple arcs ── */}
    <path d="M48 72 Q44 85 48 100" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
    <path d="M152 72 Q156 85 152 100" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />

    {/* ── Cheekbones ── */}
    <path d="M52 82 L68 88 L72 100" stroke={color} strokeWidth="1.8" fill="none" opacity="0.5" />
    <path d="M148 82 L132 88 L128 100" stroke={color} strokeWidth="1.8" fill="none" opacity="0.5" />

    {/* ── Eye sockets (angular, deep) ── */}
    <path d="M70 70 L85 56 L102 70 L90 86 Z" stroke={color} strokeWidth="2.2" fill="none" />
    <path d="M98 70 L115 56 L130 70 L118 86 Z" stroke={color} strokeWidth="2.2" fill="none" />

    {/* Eye socket inner darkness */}
    <path d="M70 70 L85 56 L102 70 L90 86 Z" fill={color} opacity="0.12" />
    <path d="M98 70 L115 56 L130 70 L118 86 Z" fill={color} opacity="0.12" />

    {/* Eye socket inner glow (beat-reactive) */}
    <ellipse cx="86" cy="72" rx="12" ry="10" fill="url(#eyeGlowL)" />
    <ellipse cx="114" cy="72" rx="12" ry="10" fill="url(#eyeGlowR)" />

    {/* Pupil dots */}
    <circle cx="86" cy="72" r="3" fill={glowColor} opacity={eyeGlow * 0.7} />
    <circle cx="114" cy="72" r="3" fill={glowColor} opacity={eyeGlow * 0.7} />

    {/* ── Nasal cavity ── */}
    <path d="M94 86 L100 100 L106 86" stroke={color} strokeWidth="2" fill="none" />
    <line x1="100" y1="92" x2="100" y2="100" stroke={color} strokeWidth="1" />
    <path d="M95 88 Q100 96 105 88" fill={color} opacity="0.08" />

    {/* ── Upper jaw / maxilla ── */}
    <path d="M72 108 Q100 100 128 108" stroke={color} strokeWidth="2" fill="none" />

    {/* ── Upper teeth (10 individual teeth) ── */}
    {[78, 84, 89, 94, 99, 104, 109, 114, 119, 124].map((tx, i) => (
      <rect key={`ut${i}`} x={tx - 2.2} y={106} width={4.4} height={7} rx={1}
        stroke={color} strokeWidth="0.9" fill="none" opacity="0.8" />
    ))}

    {/* ── Lower jaw / mandible ── */}
    <path
      d="M66 118 Q70 112 78 110 L122 110 Q130 112 134 118 Q138 134 128 146 Q100 156 72 146 Q62 134 66 118 Z"
      stroke={color} strokeWidth="2" fill="none"
    />

    {/* ── Lower teeth (10 individual teeth) ── */}
    {[78, 84, 89, 94, 99, 104, 109, 114, 119, 124].map((tx, i) => (
      <rect key={`lt${i}`} x={tx - 2.2} y={112} width={4.4} height={7} rx={1}
        stroke={color} strokeWidth="0.9" fill="none" opacity="0.8" />
    ))}

    {/* Jaw hinge lines */}
    <line x1="66" y1="118" x2="58" y2="108" stroke={color} strokeWidth="1.5" opacity="0.4" />
    <line x1="134" y1="118" x2="142" y2="108" stroke={color} strokeWidth="1.5" opacity="0.4" />

    {/* Chin cleft */}
    <path d="M96 148 Q100 152 104 148" stroke={color} strokeWidth="0.8" opacity="0.3" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  MiniSkull -- simplified version for ring placement                 */
/* ------------------------------------------------------------------ */

const MiniSkull: React.FC<{
  size: number;
  color: string;
  glowColor: string;
  eyeGlow: number;
}> = ({ size, color, glowColor, eyeGlow }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <defs>
      <radialGradient id={`mEG_${size}`} cx="0.5" cy="0.5" r="0.6">
        <stop offset="0%" stopColor={glowColor} stopOpacity={eyeGlow * 0.8} />
        <stop offset="100%" stopColor={glowColor} stopOpacity={0} />
      </radialGradient>
    </defs>
    {/* Cranium */}
    <path
      d="M50 10 C32 10 20 28 20 42 C20 52 25 60 32 66 L32 72 L40 78 L60 78 L68 72 L68 66 C75 60 80 52 80 42 C80 28 68 10 50 10 Z"
      stroke={color} strokeWidth="1.8" fill="none"
    />
    {/* Eye sockets */}
    <path d="M34 38 L42 30 L52 38 L44 46 Z" stroke={color} strokeWidth="1.5" fill="none" />
    <path d="M48 38 L58 30 L66 38 L56 46 Z" stroke={color} strokeWidth="1.5" fill="none" />
    {/* Eye glow */}
    <ellipse cx="43" cy="38" rx="6" ry="5" fill={`url(#mEG_${size})`} />
    <ellipse cx="57" cy="38" rx="6" ry="5" fill={`url(#mEG_${size})`} />
    {/* Nose */}
    <path d="M47 46 L50 52 L53 46" stroke={color} strokeWidth="1.2" fill="none" />
    {/* Upper jaw */}
    <path d="M36 56 Q50 52 64 56" stroke={color} strokeWidth="1.2" fill="none" />
    {/* Teeth (6) */}
    {[40, 44, 48, 52, 56, 60].map((tx, i) => (
      <rect key={`t${i}`} x={tx - 1.5} y={55} width={3} height={4.5} rx={0.5}
        stroke={color} strokeWidth="0.7" fill="none" opacity="0.7" />
    ))}
    {/* Lower jaw */}
    <path
      d="M34 60 Q36 58 40 57 L60 57 Q64 58 66 60 Q68 68 62 74 Q50 78 38 74 Q32 68 34 60 Z"
      stroke={color} strokeWidth="1.5" fill="none"
    />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  RoseMotif -- small decorative rose for outer ring                  */
/* ------------------------------------------------------------------ */

const RoseMotif: React.FC<{ size: number; color: string; darkColor: string }> = ({
  size, color, darkColor,
}) => (
  <svg width={size} height={size} viewBox="0 0 30 30" fill="none">
    {/* Petals */}
    <path d="M15 8 C11 4 7 6 10 10 C6 11 7 16 13 14 C11 18 14 20 16 17 C19 20 22 18 19 14 C24 15 25 10 20 10 C24 6 20 4 15 8 Z"
      fill={color} opacity="0.8" />
    {/* Inner shadow */}
    <circle cx="15" cy="12" r="4" fill={darkColor} opacity="0.4" />
    {/* Center */}
    <circle cx="15" cy="12" r="1.5" fill={color} opacity="0.6" />
    {/* Leaves */}
    <path d="M10 18 C6 20 4 24 8 22 C6 26 10 26 12 22" fill={darkColor} opacity="0.5" />
    <path d="M20 18 C24 20 26 24 22 22 C24 26 20 26 18 22" fill={darkColor} opacity="0.5" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  LightningBolt -- radiating between inner ring skulls               */
/* ------------------------------------------------------------------ */

const LightningBolt: React.FC<{
  length: number;
  color: string;
  opacity: number;
}> = ({ length, color, opacity: op }) => (
  <svg width={14} height={length} viewBox={`0 0 14 ${length}`} fill="none">
    <path
      d={`M8 0 L4 ${length * 0.35} L8 ${length * 0.38} L3 ${length * 0.65} L7 ${length * 0.67} L5 ${length}`}
      stroke={color} strokeWidth="2" fill="none" opacity={op}
      strokeLinecap="round" strokeLinejoin="round"
    />
    {/* Glow layer */}
    <path
      d={`M8 0 L4 ${length * 0.35} L8 ${length * 0.38} L3 ${length * 0.65} L7 ${length * 0.67} L5 ${length}`}
      stroke={color} strokeWidth="4" fill="none" opacity={op * 0.3}
      strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  OrnamentalArc -- thin decorative arc connecting skull positions     */
/* ------------------------------------------------------------------ */

const OrnamentalArc: React.FC<{
  radius: number;
  startAngle: number;
  endAngle: number;
  color: string;
  opacity: number;
  strokeWidth?: number;
}> = ({ radius, startAngle, endAngle, color, opacity: op, strokeWidth = 1 }) => {
  const sRad = (startAngle * Math.PI) / 180;
  const eRad = (endAngle * Math.PI) / 180;
  const x1 = Math.cos(sRad) * radius;
  const y1 = Math.sin(sRad) * radius;
  const x2 = Math.cos(eRad) * radius;
  const y2 = Math.sin(eRad) * radius;
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const svgSize = radius * 2 + 20;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  return (
    <svg
      width={svgSize}
      height={svgSize}
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      style={{ position: "absolute", left: -svgSize / 2, top: -svgSize / 2, pointerEvents: "none" }}
    >
      <path
        d={`M ${cx + x1} ${cy + y1} A ${radius} ${radius} 0 ${largeArc} 1 ${cx + x2} ${cy + y2}`}
        stroke={color} strokeWidth={strokeWidth} fill="none" opacity={op}
        strokeDasharray="4 6"
      />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const SkullKaleidoscope: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const {
    energy,
    slowEnergy,
    beatDecay,
    onsetEnvelope,
    chromaHue,
    bass,
    highs,
    spectralFlux,
  } = snap;

  /* ── Visibility gate ── */
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION || energy < 0.08) return null;

  /* ── Fade in/out ── */
  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.82, 1], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) *
    interpolate(energy, [0.08, 0.35], [0.3, 0.75], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  /* ── Colors from chromaHue ── */
  const hue = chromaHue;
  const primaryColor = hsl(hue, 100, 70);
  const glowColor = hsl(hue, 100, 80);
  const secondaryColor = hsl(hue + 60, 90, 65);
  const tertiaryColor = hsl(hue + 120, 85, 60);
  const complementColor = hsl(hue + 180, 95, 65);
  const roseColor = hsl(hue + 200, 80, 55);
  const roseDarkColor = hsl(hue + 200, 70, 38);
  const boltColor = hsl(hue + 40, 100, 75);

  /* ── Inner ring skull hue offsets ── */
  const innerHueOffsets = useMemo(() =>
    Array.from({ length: SEGMENTS }, (_, i) => (i * 45) % 360),
  []);

  /* ── Outer ring skull hue offsets ── */
  const outerHueOffsets = useMemo(() =>
    Array.from({ length: SEGMENTS }, (_, i) => ((i * 45) + 22) % 360),
  []);

  /* ── Rotation speeds (scaled by tempoFactor) ── */
  const t = tempoFactor;
  const centerRotation = frame * 0.15 * t; // very slow
  const innerRotation = frame * 0.6 * t;   // moderate CW
  const outerRotation = -frame * 0.35 * t;  // slower CCW

  /* ── Breathing / pulsing ── */
  const breathScale = interpolate(slowEnergy, [0.02, 0.3], [0.88, 1.12], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const eyeGlow = 0.3 + beatDecay * 0.7;
  const boltFlash = Math.min(1, onsetEnvelope * 2.5);
  const masterGlowIntensity = interpolate(energy, [0.05, 0.4], [8, 35], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  /* ── Sizes ── */
  const baseRadius = Math.min(width, height) * 0.28;
  const innerRadius = baseRadius * 0.52;
  const outerRadius = baseRadius * 1.0;
  const centerSkullSize = 90 + energy * 40;
  const innerSkullSize = 48 + energy * 16;
  const outerSkullSize = 34 + energy * 10;
  const roseSize = 18 + energy * 6;
  const boltLength = innerRadius * 0.55;

  /* ── Arc breathing ── */
  const arcPulse = 0.3 + slowEnergy * 0.4 + highs * 0.15;

  /* ── Onset scale punch ── */
  const onsetPunch = 1 + onsetEnvelope * 0.04;

  /* ── Spectral shimmer (varies arc dashoffset over time) ── */
  const shimmer = spectralFlux * 0.5;

  const cx = width / 2;
  const cy = height / 2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Master container: centered, breathing, with master glow */}
      <div
        style={{
          position: "absolute",
          left: cx,
          top: cy,
          transform: `translate(-50%, -50%) scale(${breathScale * onsetPunch})`,
          opacity: masterOpacity,
          filter: [
            `drop-shadow(0 0 ${masterGlowIntensity}px ${primaryColor})`,
            `drop-shadow(0 0 ${masterGlowIntensity * 1.8}px ${glowColor})`,
            `drop-shadow(0 0 ${masterGlowIntensity * 0.5}px ${complementColor})`,
          ].join(" "),
          willChange: "transform, opacity, filter",
        }}
      >
        {/* ═══════════ OUTER RING: Ornamental arcs ═══════════ */}
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const startAngle = (i / SEGMENTS) * 360 + outerRotation;
          const endAngle = startAngle + (360 / SEGMENTS) * 0.7;
          return (
            <OrnamentalArc
              key={`arc-outer-${i}`}
              radius={outerRadius + 15}
              startAngle={startAngle}
              endAngle={endAngle}
              color={i % 2 === 0 ? primaryColor : secondaryColor}
              opacity={arcPulse * 0.6 + shimmer * 0.2}
              strokeWidth={0.8 + bass * 0.5}
            />
          );
        })}

        {/* ═══════════ INNER RING: Ornamental arcs ═══════════ */}
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const startAngle = (i / SEGMENTS) * 360 + innerRotation;
          const endAngle = startAngle + (360 / SEGMENTS) * 0.6;
          return (
            <OrnamentalArc
              key={`arc-inner-${i}`}
              radius={innerRadius + 10}
              startAngle={startAngle}
              endAngle={endAngle}
              color={i % 2 === 0 ? tertiaryColor : primaryColor}
              opacity={arcPulse * 0.45}
              strokeWidth={0.6 + bass * 0.3}
            />
          );
        })}

        {/* ═══════════ LIGHTNING BOLTS (between inner ring skulls) ═══════════ */}
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const midAngle = ((i + 0.5) / SEGMENTS) * 360;
          const rad = (midAngle * Math.PI) / 180;
          const boltMidR = innerRadius * 0.55;
          const bx = Math.cos(rad + innerRotation * Math.PI / 180) * boltMidR;
          const by = Math.sin(rad + innerRotation * Math.PI / 180) * boltMidR;
          const boltAngle = (midAngle + innerRotation) + 90; // radial outward
          return (
            <div
              key={`bolt-${i}`}
              style={{
                position: "absolute",
                left: bx,
                top: by,
                transform: `translate(-50%, -50%) rotate(${boltAngle}deg)`,
              }}
            >
              <LightningBolt
                length={boltLength}
                color={boltColor}
                opacity={boltFlash * (0.5 + energy * 0.5)}
              />
            </div>
          );
        })}

        {/* ═══════════ OUTER RING: 8 skulls + rose motifs ═══════════ */}
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const baseAngle = (i / SEGMENTS) * 360;
          const angle = baseAngle + outerRotation;
          const rad = (angle * Math.PI) / 180;
          const x = Math.cos(rad) * outerRadius;
          const y = Math.sin(rad) * outerRadius;
          const hueOff = outerHueOffsets[i];
          const skullHue = (hue + hueOff) % 360;
          const skullC = hsl(skullHue, 85, 62);
          const glowC = hsl(skullHue, 90, 75);
          const isEven = i % 2 === 0;

          // Rose position: halfway between this skull and next
          const nextAngle = ((i + 1) / SEGMENTS) * 360 + outerRotation;
          const nextRad = (nextAngle * Math.PI) / 180;
          const roseMidX = (Math.cos(rad) + Math.cos(nextRad)) * outerRadius * 0.5;
          const roseMidY = (Math.sin(rad) + Math.sin(nextRad)) * outerRadius * 0.5;

          return (
            <React.Fragment key={`outer-${i}`}>
              {/* Outer skull */}
              <div
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  transform: `translate(-50%, -50%) rotate(${angle + 90}deg) scaleX(${isEven ? 1 : -1})`,
                  opacity: 0.6 + energy * 0.25,
                }}
              >
                <MiniSkull
                  size={outerSkullSize}
                  color={skullC}
                  glowColor={glowC}
                  eyeGlow={eyeGlow * 0.6}
                />
              </div>

              {/* Rose motif between skulls */}
              <div
                style={{
                  position: "absolute",
                  left: roseMidX,
                  top: roseMidY,
                  transform: `translate(-50%, -50%) rotate(${angle + 22.5}deg)`,
                  opacity: 0.5 + slowEnergy * 0.3,
                }}
              >
                <RoseMotif
                  size={roseSize}
                  color={roseColor}
                  darkColor={roseDarkColor}
                />
              </div>
            </React.Fragment>
          );
        })}

        {/* ═══════════ INNER RING: 8 skulls ═══════════ */}
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const baseAngle = (i / SEGMENTS) * 360;
          const angle = baseAngle + innerRotation;
          const rad = (angle * Math.PI) / 180;
          const x = Math.cos(rad) * innerRadius;
          const y = Math.sin(rad) * innerRadius;
          const hueOff = innerHueOffsets[i];
          const skullHue = (hue + hueOff) % 360;
          const skullC = hsl(skullHue, 95, 68);
          const glowC = hsl(skullHue, 100, 80);
          const isEven = i % 2 === 0;

          return (
            <div
              key={`inner-${i}`}
              style={{
                position: "absolute",
                left: x,
                top: y,
                transform: `translate(-50%, -50%) rotate(${angle - 90}deg) scaleX(${isEven ? 1 : -1})`,
                opacity: 0.7 + energy * 0.2,
              }}
            >
              <MiniSkull
                size={innerSkullSize}
                color={skullC}
                glowColor={glowC}
                eyeGlow={eyeGlow * 0.85}
              />
            </div>
          );
        })}

        {/* ═══════════ CENTER SKULL ═══════════ */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translate(-50%, -50%) rotate(${centerRotation}deg)`,
          }}
        >
          <DetailedSkull
            size={centerSkullSize}
            color={primaryColor}
            glowColor={glowColor}
            eyeGlow={eyeGlow}
            glowRadius={masterGlowIntensity * 0.4}
          />
        </div>
      </div>
    </div>
  );
};
