/**
 * BreathingStealie — large Steal Your Face watermark that breathes with the music.
 * Always present at low opacity, pulses bigger/brighter on peaks.
 * Slow rotation, color shifts with chroma data.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";

/** Full Steal Your Face SVG — detailed version */
const Stealie: React.FC<{ size: number; mainColor: string; boltColor: string }> = ({
  size,
  mainColor,
  boltColor,
}) => (
  <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
    {/* Outer ring */}
    <circle cx="100" cy="100" r="94" stroke={mainColor} strokeWidth="5" />
    <circle cx="100" cy="100" r="88" stroke={mainColor} strokeWidth="1.5" opacity="0.4" />
    {/* Upper skull dome */}
    <path
      d="M 12 100 A 88 88 0 0 1 188 100"
      fill={mainColor}
      opacity="0.15"
    />
    {/* Horizontal divider */}
    <line x1="6" y1="100" x2="194" y2="100" stroke={mainColor} strokeWidth="3" />
    {/* Lightning bolt */}
    <polygon
      points="100,12 88,82 108,82 78,188 118,105 96,105 116,12"
      fill={boltColor}
    />
    {/* Eye sockets */}
    <circle cx="68" cy="76" r="18" stroke={mainColor} strokeWidth="3" />
    <circle cx="132" cy="76" r="18" stroke={mainColor} strokeWidth="3" />
    {/* Inner eye glow */}
    <circle cx="68" cy="76" r="8" fill={mainColor} opacity="0.2" />
    <circle cx="132" cy="76" r="8" fill={mainColor} opacity="0.2" />
  </svg>
);

/** Map 0-1 hue to an RGB hex string */
function hueToHex(h: number): string {
  const s = 0.85;
  const l = 0.6;
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

export const BreathingStealie: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const chromaHue = snap.chromaHue / 360; // normalize to 0-1 for hueToHex

  // Size: breathes with energy (300-500px)
  const baseSize = Math.min(width, height) * 0.35;
  const breathe = interpolate(energy, [0.03, 0.35], [0.85, 1.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const size = baseSize * breathe;

  // Slow rotation + beat impulse (+2deg on beat)
  const rotation = (frame / 30) * 3 + snap.beatDecay * 2;

  // Opacity: always visible but brighter on peaks
  const opacity = interpolate(energy, [0.02, 0.3], [0.08, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Colors from chroma
  const mainColor = hueToHex(chromaHue);
  const boltColor = hueToHex(chromaHue + 0.15);

  // Glow intensity from energy + bass (0.8x-1.4x)
  const bassGlow = 0.8 + snap.bass * 1.2; // clamps ~0.8-1.4
  const glowRadius = interpolate(energy, [0.05, 0.3], [10, 40], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * bassGlow;

  // Onset → scale spike (+5%)
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
          transform: `rotate(${rotation}deg) scale(${breathe * onsetScale})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${mainColor}) drop-shadow(0 0 ${glowRadius * 2}px ${boltColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <Stealie size={size} mainColor={mainColor} boltColor={boltColor} />
      </div>
    </div>
  );
};
