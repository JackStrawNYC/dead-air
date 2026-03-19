/**
 * SkullRoses — THE iconic Grateful Dead image.
 * Skull with roses growing through eye sockets, detailed jaw/teeth,
 * 6 roses with stems, thorns, and leaves. Layer 2 Sacred, Tier A.
 * Slow breath with energy, chroma-derived colors, bass-reactive glow.
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

const SkullWithRosesSVG: React.FC<{
  size: number;
  skullColor: string;
  roseColor: string;
  stemColor: string;
  darkRoseColor: string;
}> = ({ size, skullColor, roseColor, stemColor, darkRoseColor }) => (
  <svg width={size} height={size} viewBox="0 0 240 240" fill="none">
    {/* ─── Skull ─── */}
    {/* Cranium */}
    <path
      d="M120 20 C80 20 55 50 55 85 C55 105 62 120 75 130 L75 145 L90 155 L150 155 L165 145 L165 130 C178 120 185 105 185 85 C185 50 160 20 120 20 Z"
      stroke={skullColor} strokeWidth="2.5" fill="none"
    />
    {/* Forehead detail */}
    <path d="M80 55 Q120 45 160 55" stroke={skullColor} strokeWidth="1" opacity="0.4" />

    {/* ─── Eye Sockets (large, angular) ─── */}
    <path
      d="M82 75 L95 62 L112 75 L100 90 Z"
      stroke={skullColor} strokeWidth="2.2" fill="none"
    />
    <path
      d="M128 75 L145 62 L158 75 L140 90 Z"
      stroke={skullColor} strokeWidth="2.2" fill="none"
    />
    {/* Inner eye darkness */}
    <path d="M82 75 L95 62 L112 75 L100 90 Z" fill={skullColor} opacity="0.15" />
    <path d="M128 75 L145 62 L158 75 L140 90 Z" fill={skullColor} opacity="0.15" />

    {/* ─── Nasal cavity ─── */}
    <path d="M114 92 L120 105 L126 92" stroke={skullColor} strokeWidth="2" fill="none" />
    <line x1="120" y1="98" x2="120" y2="105" stroke={skullColor} strokeWidth="1.2" />

    {/* ─── Upper jaw / maxilla ─── */}
    <path d="M85 115 Q120 108 155 115" stroke={skullColor} strokeWidth="2" fill="none" />

    {/* ─── Teeth (upper) ─── */}
    {[92, 98, 104, 110, 116, 122, 128, 134, 140, 146].map((tx, i) => (
      <rect key={`ut${i}`} x={tx - 2} y={113} width={4} height={7} rx={1}
        stroke={skullColor} strokeWidth="1" fill="none" opacity="0.8" />
    ))}

    {/* ─── Lower jaw / mandible ─── */}
    <path
      d="M78 125 Q82 120 90 118 L150 118 Q158 120 162 125 Q165 140 155 152 Q120 162 85 152 Q75 140 78 125 Z"
      stroke={skullColor} strokeWidth="2" fill="none"
    />

    {/* ─── Teeth (lower) ─── */}
    {[92, 98, 104, 110, 116, 122, 128, 134, 140, 146].map((tx, i) => (
      <rect key={`lt${i}`} x={tx - 2} y={120} width={4} height={7} rx={1}
        stroke={skullColor} strokeWidth="1" fill="none" opacity="0.8" />
    ))}

    {/* Jaw hinge lines */}
    <line x1="78" y1="125" x2="70" y2="115" stroke={skullColor} strokeWidth="1.5" opacity="0.5" />
    <line x1="162" y1="125" x2="170" y2="115" stroke={skullColor} strokeWidth="1.5" opacity="0.5" />

    {/* ─── Cheekbones ─── */}
    <path d="M65 90 L80 95 L82 105" stroke={skullColor} strokeWidth="1.8" fill="none" opacity="0.6" />
    <path d="M175 90 L160 95 L158 105" stroke={skullColor} strokeWidth="1.8" fill="none" opacity="0.6" />

    {/* ─── Rose 1: Left eye socket (growing out) ─── */}
    <path d="M97 73 C90 60 78 55 72 48" stroke={stemColor} strokeWidth="2" fill="none" />
    <line x1="88" y1="62" x2="84" y2="58" stroke={stemColor} strokeWidth="1" />
    <path d="M68 44 C62 38 58 42 62 47 C58 48 60 54 68 52 C75 54 77 48 73 47 C77 42 73 38 68 44 Z" fill={roseColor} opacity="0.85" />
    <circle cx="68" cy="47" r="7" fill={darkRoseColor} opacity="0.4" />
    <path d="M78 56 C72 53 69 56 74 59" fill={stemColor} opacity="0.7" />

    {/* ─── Rose 2: Right eye socket (growing out) ─── */}
    <path d="M143 73 C150 60 162 55 168 48" stroke={stemColor} strokeWidth="2" fill="none" />
    <line x1="152" y1="62" x2="156" y2="58" stroke={stemColor} strokeWidth="1" />
    <path d="M172 44 C178 38 182 42 178 47 C182 48 180 54 172 52 C165 54 163 48 167 47 C163 42 167 38 172 44 Z" fill={roseColor} opacity="0.85" />
    <circle cx="172" cy="47" r="7" fill={darkRoseColor} opacity="0.4" />
    <path d="M162 56 C168 53 171 56 166 59" fill={stemColor} opacity="0.7" />

    {/* ─── Rose 3: Top of skull ─── */}
    <path d="M120 20 C118 12 115 8 110 5" stroke={stemColor} strokeWidth="2" fill="none" />
    <path d="M106 2 C100 -3 96 0 100 5 C96 6 98 12 106 10 C113 12 115 6 111 5 C115 0 111 -3 106 2 Z" fill={roseColor} opacity="0.8" />
    <circle cx="106" cy="5" r="6" fill={darkRoseColor} opacity="0.35" />

    {/* ─── Rose 4: Left jawline ─── */}
    <path d="M78 135 C65 140 55 145 48 155" stroke={stemColor} strokeWidth="2" fill="none" />
    <path d="M62 142 C56 139 53 142 58 146" fill={stemColor} opacity="0.7" />
    <line x1="70" y1="138" x2="66" y2="135" stroke={stemColor} strokeWidth="1" />
    <path d="M44 158 C38 153 34 157 39 162 C35 163 37 169 44 167 C51 169 53 163 49 162 C53 157 49 153 44 158 Z" fill={roseColor} opacity="0.8" />
    <circle cx="44" cy="161" r="8" fill={darkRoseColor} opacity="0.4" />

    {/* ─── Rose 5: Right jawline ─── */}
    <path d="M162 135 C175 140 185 145 192 155" stroke={stemColor} strokeWidth="2" fill="none" />
    <path d="M178 142 C184 139 187 142 182 146" fill={stemColor} opacity="0.7" />
    <line x1="170" y1="138" x2="174" y2="135" stroke={stemColor} strokeWidth="1" />
    <path d="M196 158 C202 153 206 157 201 162 C205 163 203 169 196 167 C189 169 187 163 191 162 C187 157 191 153 196 158 Z" fill={roseColor} opacity="0.8" />
    <circle cx="196" cy="161" r="8" fill={darkRoseColor} opacity="0.4" />

    {/* ─── Rose 6: Chin center ─── */}
    <path d="M120 155 C120 168 118 178 115 188" stroke={stemColor} strokeWidth="2" fill="none" />
    <path d="M125 172 C130 169 133 172 128 176" fill={stemColor} opacity="0.7" />
    <path d="M111 192 C106 187 102 191 107 195 C103 196 105 202 111 200 C118 202 120 196 116 195 C120 191 116 187 111 192 Z" fill={roseColor} opacity="0.85" />
    <circle cx="111" cy="195" r="9" fill={darkRoseColor} opacity="0.4" />

    {/* ─── Extra vine tendrils ─── */}
    <path d="M48 155 C42 165 38 180 35 195" stroke={stemColor} strokeWidth="1.5" fill="none" opacity="0.6" />
    <path d="M192 155 C198 165 202 180 205 195" stroke={stemColor} strokeWidth="1.5" fill="none" opacity="0.6" />
    <path d="M38 185 C30 182 28 186 34 189" fill={stemColor} opacity="0.5" />
    <path d="M202 185 C210 182 212 186 206 189" fill={stemColor} opacity="0.5" />
  </svg>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const SkullRoses: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  const baseSize = Math.min(width, height) * 0.45;
  const breathe = interpolate(energy, [0.03, 0.35], [0.85, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const rotation = Math.sin(frame / 120 * tempoFactor) * 2 + snap.beatDecay * 1.2;

  const opacity = interpolate(energy, [0.02, 0.35], [0.25, 0.70], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const skullColor = hueToHex(chromaHue, 0.6, 0.75);
  const roseHue = ((chromaHue + 0.95) % 1);
  const roseColor = hueToHex(roseHue, 0.8, 0.55);
  const darkRoseColor = hueToHex(roseHue, 0.7, 0.4);
  const stemColor = hueToHex(0.33, 0.5, 0.35);

  const bassGlow = 0.8 + snap.bass * 1.2;
  const glowRadius = interpolate(energy, [0.05, 0.3], [6, 30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * bassGlow;

  const onsetScale = 1 + snap.onsetEnvelope * 0.05;
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
          filter: `drop-shadow(0 0 ${glowRadius}px ${skullColor}) drop-shadow(0 0 ${glowRadius * 1.6}px ${roseColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <SkullWithRosesSVG
          size={size}
          skullColor={skullColor}
          roseColor={roseColor}
          darkRoseColor={darkRoseColor}
          stemColor={stemColor}
        />
      </div>
    </div>
  );
};
