/**
 * EgyptianEye — Eye of Horus with Dead bolt detailing.
 * Egypt '78 culture reference. Classic Egyptian proportions
 * with 13-point bolt as pupil/iris detail. Hieroglyphic border.
 * Layer 2 Sacred, Tier B. Slow rotation on beat.
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

const EyeOfHorusSVG: React.FC<{
  size: number;
  primaryColor: string;
  accentColor: string;
  glyphColor: string;
}> = ({ size, primaryColor, accentColor, glyphColor }) => (
  <svg width={size} height={size * 0.7} viewBox="0 0 300 210" fill="none">
    {/* ─── Hieroglyphic border ─── */}
    {/* Top border glyphs */}
    {[30, 70, 110, 150, 190, 230, 270].map((gx, i) => (
      <g key={`tg${i}`} opacity="0.4">
        {i % 3 === 0 && (
          /* Ankh glyph */
          <>
            <circle cx={gx} cy={12} r={4} stroke={glyphColor} strokeWidth="1.2" fill="none" />
            <line x1={gx} y1={16} x2={gx} y2={28} stroke={glyphColor} strokeWidth="1.2" />
            <line x1={gx - 4} y1={22} x2={gx + 4} y2={22} stroke={glyphColor} strokeWidth="1.2" />
          </>
        )}
        {i % 3 === 1 && (
          /* Djed pillar */
          <>
            <line x1={gx} y1={8} x2={gx} y2={28} stroke={glyphColor} strokeWidth="1.5" />
            <line x1={gx - 4} y1={12} x2={gx + 4} y2={12} stroke={glyphColor} strokeWidth="1" />
            <line x1={gx - 4} y1={18} x2={gx + 4} y2={18} stroke={glyphColor} strokeWidth="1" />
            <line x1={gx - 4} y1={24} x2={gx + 4} y2={24} stroke={glyphColor} strokeWidth="1" />
          </>
        )}
        {i % 3 === 2 && (
          /* Was scepter simplified */
          <>
            <path d={`M${gx - 3} 8 L${gx} 12 L${gx + 3} 8`} stroke={glyphColor} strokeWidth="1" fill="none" />
            <line x1={gx} y1={12} x2={gx} y2={28} stroke={glyphColor} strokeWidth="1.2" />
            <path d={`M${gx - 2} 28 L${gx + 2} 28`} stroke={glyphColor} strokeWidth="1" />
          </>
        )}
      </g>
    ))}

    {/* Bottom border glyphs */}
    {[30, 70, 110, 150, 190, 230, 270].map((gx, i) => (
      <g key={`bg${i}`} opacity="0.35" transform={`translate(${gx}, 195)`}>
        {i % 2 === 0 ? (
          /* Scarab simplified */
          <>
            <ellipse cx={0} cy={5} rx={5} ry={3} stroke={glyphColor} strokeWidth="1" fill="none" />
            <path d={`M-5 5 C-8 0 -6 -2 -3 2`} stroke={glyphColor} strokeWidth="0.8" fill="none" />
            <path d={`M5 5 C8 0 6 -2 3 2`} stroke={glyphColor} strokeWidth="0.8" fill="none" />
          </>
        ) : (
          /* Eye glyph mini */
          <>
            <path d={`M-5 5 Q0 0 5 5 Q0 8 -5 5`} stroke={glyphColor} strokeWidth="1" fill="none" />
            <circle cx={0} cy={5} r={1.5} fill={glyphColor} opacity="0.6" />
          </>
        )}
      </g>
    ))}

    {/* ─── Main Eye of Horus ─── */}
    {/* Upper eyelid — sweeping curve */}
    <path
      d="M40 100 Q90 45 150 55 Q210 45 260 100"
      stroke={primaryColor} strokeWidth="3.5" fill="none" strokeLinecap="round"
    />
    {/* Lower eyelid */}
    <path
      d="M40 100 Q90 130 150 125 Q210 130 260 100"
      stroke={primaryColor} strokeWidth="3" fill="none" strokeLinecap="round"
    />

    {/* ─── Iris circle ─── */}
    <circle cx="150" cy="90" r="28" stroke={primaryColor} strokeWidth="2.5" fill="none" />
    <circle cx="150" cy="90" r="20" stroke={accentColor} strokeWidth="2" fill="none" />
    <circle cx="150" cy="90" r="28" fill={primaryColor} opacity="0.08" />

    {/* ─── Dead 13-point bolt as pupil ─── */}
    <circle cx="150" cy="90" r="12" fill={accentColor} opacity="0.25" />
    <path
      d="M150 78 L153 86 L160 83 L155 90 L162 92 L153 95 L156 102 L150 96 L144 102 L147 95 L138 92 L145 90 L140 83 L147 86 Z"
      fill={accentColor} opacity="0.9"
    />
    {/* 13-point bolt ring (simplified) */}
    {Array.from({ length: 13 }).map((_, i) => {
      const angle = (i / 13) * Math.PI * 2 - Math.PI / 2;
      const ix = 150 + Math.cos(angle) * 16;
      const iy = 90 + Math.sin(angle) * 16;
      return <circle key={`bp${i}`} cx={ix} cy={iy} r="1" fill={accentColor} opacity="0.6" />;
    })}

    {/* ─── Eye cosmetic line (Horus tail) ─── */}
    <path
      d="M40 100 L20 115 L25 105"
      stroke={primaryColor} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"
    />

    {/* ─── Tear drop / cheek line (wadjet) ─── */}
    <path
      d="M130 125 C125 140 120 155 125 170"
      stroke={primaryColor} strokeWidth="2.5" fill="none" strokeLinecap="round"
    />
    <path
      d="M125 170 C128 178 132 178 130 170"
      fill={primaryColor} opacity="0.6"
    />

    {/* ─── Eyebrow arch detail ─── */}
    <path
      d="M50 90 Q100 35 155 45 Q210 35 255 90"
      stroke={primaryColor} strokeWidth="2" fill="none" opacity="0.5"
    />

    {/* ─── Spiral falcon marking ─── */}
    <path
      d="M170 125 C175 135 185 140 195 138 C205 136 210 128 205 120"
      stroke={primaryColor} strokeWidth="2" fill="none" opacity="0.45" strokeLinecap="round"
    />

    {/* ─── Inner iris radial lines ─── */}
    {Array.from({ length: 8 }).map((_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      const ix1 = 150 + Math.cos(angle) * 20;
      const iy1 = 90 + Math.sin(angle) * 20;
      const ix2 = 150 + Math.cos(angle) * 27;
      const iy2 = 90 + Math.sin(angle) * 27;
      return (
        <line key={`ir${i}`} x1={ix1} y1={iy1} x2={ix2} y2={iy2}
          stroke={accentColor} strokeWidth="1" opacity="0.35" />
      );
    })}
  </svg>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const EgyptianEye: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  const baseSize = Math.min(width, height) * 0.42;
  const breathe = interpolate(energy, [0.03, 0.3], [0.92, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow rotation on beat — ponderous, ancient feel
  const rotation = snap.beatDecay * 3.5 + Math.sin(frame / 200 * tempoFactor) * 1.5;

  const opacity = interpolate(energy, [0.02, 0.3], [0.20, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Egyptian gold base, shifted by chroma
  const primaryColor = hueToHex((chromaHue + 0.12) % 1, 0.75, 0.6);
  const accentColor = hueToHex(chromaHue, 0.8, 0.55);
  const glyphColor = hueToHex((chromaHue + 0.08) % 1, 0.5, 0.5);

  const bassGlow = 0.7 + snap.bass * 0.9;
  const glowRadius = interpolate(energy, [0.05, 0.3], [5, 25], {
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
          transform: `rotate(${rotation}deg) scale(${breathe * onsetScale})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${primaryColor}) drop-shadow(0 0 ${glowRadius * 1.5}px ${accentColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <EyeOfHorusSVG
          size={size}
          primaryColor={primaryColor}
          accentColor={accentColor}
          glyphColor={glyphColor}
        />
      </div>
    </div>
  );
};
