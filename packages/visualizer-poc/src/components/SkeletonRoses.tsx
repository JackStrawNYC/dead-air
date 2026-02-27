/**
 * SkeletonRoses — centered breathing skeleton-with-roses composite.
 * Classic Grateful Dead album art fusion: skeleton entwined with climbing roses.
 * Always present at low opacity (0.05-0.25), breathes with energy.
 * Slow rotation, chroma-derived coloring, bass-reactive glow.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/** Map 0-1 hue to an RGB hex string */
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

/** Multi-element skeleton entwined with roses SVG */
const SkeletonWithRoses: React.FC<{
  size: number;
  skeletonColor: string;
  roseColor: string;
  stemColor: string;
}> = ({ size, skeletonColor, roseColor, stemColor }) => (
  <svg width={size} height={size} viewBox="0 0 200 240" fill="none">
    {/* ─── Skull ─── */}
    <ellipse cx="100" cy="32" rx="22" ry="26" stroke={skeletonColor} strokeWidth="2.5" fill="none" />
    {/* Eye sockets */}
    <circle cx="90" cy="28" r="6" stroke={skeletonColor} strokeWidth="2" />
    <circle cx="110" cy="28" r="6" stroke={skeletonColor} strokeWidth="2" />
    {/* Inner eye glow */}
    <circle cx="90" cy="28" r="2.5" fill={skeletonColor} opacity="0.3" />
    <circle cx="110" cy="28" r="2.5" fill={skeletonColor} opacity="0.3" />
    {/* Nose */}
    <path d="M97 36 L100 40 L103 36" stroke={skeletonColor} strokeWidth="1.5" fill="none" />
    {/* Jaw */}
    <path d="M82 40 Q100 55 118 40" stroke={skeletonColor} strokeWidth="2" fill="none" />
    {/* Teeth */}
    <line x1="92" y1="42" x2="92" y2="46" stroke={skeletonColor} strokeWidth="1.2" />
    <line x1="97" y1="43" x2="97" y2="48" stroke={skeletonColor} strokeWidth="1.2" />
    <line x1="103" y1="43" x2="103" y2="48" stroke={skeletonColor} strokeWidth="1.2" />
    <line x1="108" y1="42" x2="108" y2="46" stroke={skeletonColor} strokeWidth="1.2" />

    {/* ─── Spine ─── */}
    <path d="M100 55 L100 160" stroke={skeletonColor} strokeWidth="3" strokeLinecap="round" />
    {/* Vertebrae notches */}
    {[65, 80, 95, 110, 125, 140].map((y) => (
      <line key={y} x1="96" y1={y} x2="104" y2={y} stroke={skeletonColor} strokeWidth="1.5" opacity="0.6" />
    ))}

    {/* ─── Ribcage ─── */}
    <path d="M75 70 Q88 62 100 70 Q112 62 125 70" stroke={skeletonColor} strokeWidth="2" fill="none" />
    <path d="M78 80 Q90 72 100 80 Q110 72 122 80" stroke={skeletonColor} strokeWidth="2" fill="none" />
    <path d="M80 90 Q92 83 100 90 Q108 83 120 90" stroke={skeletonColor} strokeWidth="2" fill="none" />
    <path d="M82 100 Q93 94 100 100 Q107 94 118 100" stroke={skeletonColor} strokeWidth="1.8" fill="none" />

    {/* ─── Arms (slightly raised, embracing roses) ─── */}
    {/* Left arm */}
    <path d="M75 70 L55 85 L40 72" stroke={skeletonColor} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    {/* Left hand (open) */}
    <path d="M40 72 L35 65 M40 72 L33 70 M40 72 L34 75 M40 72 L37 78" stroke={skeletonColor} strokeWidth="1.5" strokeLinecap="round" />
    {/* Right arm */}
    <path d="M125 70 L145 85 L160 72" stroke={skeletonColor} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    {/* Right hand */}
    <path d="M160 72 L165 65 M160 72 L167 70 M160 72 L166 75 M160 72 L163 78" stroke={skeletonColor} strokeWidth="1.5" strokeLinecap="round" />

    {/* ─── Pelvis ─── */}
    <path d="M82 155 Q100 170 118 155" stroke={skeletonColor} strokeWidth="2.5" fill="none" />

    {/* ─── Legs ─── */}
    <line x1="88" y1="160" x2="80" y2="220" stroke={skeletonColor} strokeWidth="2.5" strokeLinecap="round" />
    <line x1="112" y1="160" x2="120" y2="220" stroke={skeletonColor} strokeWidth="2.5" strokeLinecap="round" />

    {/* ─── Climbing Rose — Left Vine ─── */}
    <path
      d="M45 220 C42 200 55 185 50 170 C45 155 60 140 55 125 C50 110 60 95 52 80 C48 70 55 60 60 50"
      stroke={stemColor}
      strokeWidth="2.5"
      fill="none"
      strokeLinecap="round"
    />
    {/* Left leaves */}
    <path d="M48 190 C38 185 35 190 42 195" fill={stemColor} opacity="0.7" />
    <path d="M55 150 C45 145 42 150 50 155" fill={stemColor} opacity="0.7" />
    <path d="M50 115 C40 110 38 115 46 120" fill={stemColor} opacity="0.7" />
    {/* Left thorns */}
    <line x1="52" y1="175" x2="48" y2="170" stroke={stemColor} strokeWidth="1" />
    <line x1="47" y1="135" x2="43" y2="130" stroke={stemColor} strokeWidth="1" />

    {/* Left Rose 1 (bottom) */}
    <circle cx="45" cy="200" r="10" fill={roseColor} opacity="0.6" />
    <path d="M45 195 C40 190 35 195 40 200 C35 200 38 207 45 205 C52 207 55 200 50 200 C55 195 50 190 45 195 Z" fill={roseColor} opacity="0.8" />
    {/* Left Rose 2 (mid) */}
    <circle cx="52" cy="130" r="8" fill={roseColor} opacity="0.6" />
    <path d="M52 125 C48 122 44 125 47 128 C44 129 46 134 52 133 C58 134 60 129 57 128 C60 125 56 122 52 125 Z" fill={roseColor} opacity="0.8" />
    {/* Left Rose 3 (top, near skull) */}
    <circle cx="58" cy="55" r="9" fill={roseColor} opacity="0.6" />
    <path d="M58 50 C53 47 49 50 53 54 C49 55 51 60 58 59 C65 60 67 55 63 54 C67 50 63 47 58 50 Z" fill={roseColor} opacity="0.85" />

    {/* ─── Climbing Rose — Right Vine ─── */}
    <path
      d="M155 220 C158 200 145 185 150 170 C155 155 140 140 145 125 C150 110 140 95 148 80 C152 70 145 60 140 50"
      stroke={stemColor}
      strokeWidth="2.5"
      fill="none"
      strokeLinecap="round"
    />
    {/* Right leaves */}
    <path d="M152 190 C162 185 165 190 158 195" fill={stemColor} opacity="0.7" />
    <path d="M145 150 C155 145 158 150 150 155" fill={stemColor} opacity="0.7" />
    <path d="M150 115 C160 110 162 115 154 120" fill={stemColor} opacity="0.7" />
    {/* Right thorns */}
    <line x1="148" y1="175" x2="152" y2="170" stroke={stemColor} strokeWidth="1" />
    <line x1="153" y1="135" x2="157" y2="130" stroke={stemColor} strokeWidth="1" />

    {/* Right Rose 1 (bottom) */}
    <circle cx="155" cy="200" r="10" fill={roseColor} opacity="0.6" />
    <path d="M155 195 C150 190 145 195 150 200 C145 200 148 207 155 205 C162 207 165 200 160 200 C165 195 160 190 155 195 Z" fill={roseColor} opacity="0.8" />
    {/* Right Rose 2 (mid) */}
    <circle cx="148" cy="130" r="8" fill={roseColor} opacity="0.6" />
    <path d="M148 125 C144 122 140 125 143 128 C140 129 142 134 148 133 C154 134 156 129 153 128 C156 125 152 122 148 125 Z" fill={roseColor} opacity="0.8" />
    {/* Right Rose 3 (top, near skull) */}
    <circle cx="142" cy="55" r="9" fill={roseColor} opacity="0.6" />
    <path d="M142 50 C137 47 133 50 137 54 C133 55 135 60 142 59 C149 60 151 55 147 54 C151 50 147 47 142 50 Z" fill={roseColor} opacity="0.85" />

    {/* ─── Center rose on ribcage ─── */}
    <circle cx="100" cy="85" r="11" fill={roseColor} opacity="0.5" />
    <path d="M100 79 C94 75 89 79 94 84 C89 85 92 91 100 90 C108 91 111 85 106 84 C111 79 106 75 100 79 Z" fill={roseColor} opacity="0.75" />
  </svg>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const SkeletonRoses: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Size: breathes with energy
  const baseSize = Math.min(width, height) * 0.4;
  const breathe = interpolate(energy, [0.03, 0.35], [0.85, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow rotation (tempo-scaled) + beat impulse
  const rotation = (frame / 30) * 1.5 * tempoFactor + snap.beatDecay * 1.5;

  // Opacity: always visible but brighter on peaks (0.05 - 0.25)
  const opacity = interpolate(energy, [0.02, 0.3], [0.05, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Colors from chroma
  const skeletonColor = hueToHex(chromaHue, 0.7, 0.7);
  const roseHue = ((chromaHue + 0.95) % 1); // shift toward red/pink
  const roseColor = hueToHex(roseHue, 0.75, 0.55);
  const stemColor = hueToHex(0.33, 0.5, 0.35); // green stems

  // Glow from energy + bass
  const bassGlow = 0.8 + snap.bass * 1.0;
  const glowRadius = interpolate(energy, [0.05, 0.3], [8, 35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * bassGlow;

  // Onset → scale spike
  const onsetScale = 1 + snap.onsetEnvelope * 0.04;

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
          filter: `drop-shadow(0 0 ${glowRadius}px ${skeletonColor}) drop-shadow(0 0 ${glowRadius * 1.8}px ${roseColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <SkeletonWithRoses
          size={size}
          skeletonColor={skeletonColor}
          roseColor={roseColor}
          stemColor={stemColor}
        />
      </div>
    </div>
  );
};
