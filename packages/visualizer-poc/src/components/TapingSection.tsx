/**
 * TapingSection — reel-to-reel tape decks + microphones.
 * Layer 7, tier B, tags: dead-culture, retro.
 * Two tape reels spin with tempo, microphone stand between them,
 * tape ribbon connecting reels. Reels spin faster with energy.
 * Low opacity (0.15-0.35). Position: bottom-right corner area.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

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

export const TapingSection: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Opacity: low range 0.15-0.35
  const opacity = interpolate(energy, [0.02, 0.4], [0.15, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Reel rotation: tempo-driven, energy boosts speed
  const reelSpeed = tempoFactor * (1 + energy * 1.5);
  const reelRotation = frame * reelSpeed * 3;

  // Color from chroma
  const mainColor = hueToHex(chromaHue);
  const accentColor = hueToHex(chromaHue + 0.1);

  // Size of the component
  const size = Math.min(width, height) * 0.22;

  // Spoke generator for tape reel
  const renderReel = (cx: number, cy: number, r: number, rot: number) => {
    const spokes: React.ReactNode[] = [];
    const spokeCount = 6;
    for (let i = 0; i < spokeCount; i++) {
      const angle = (rot + (i * 360) / spokeCount) * (Math.PI / 180);
      const x2 = cx + Math.cos(angle) * r * 0.85;
      const y2 = cy + Math.sin(angle) * r * 0.85;
      spokes.push(
        <line
          key={`spoke-${i}`}
          x1={cx}
          y1={cy}
          x2={x2}
          y2={y2}
          stroke={mainColor}
          strokeWidth="1.5"
          opacity="0.7"
        />,
      );
    }
    return (
      <g>
        {/* Outer reel ring */}
        <circle cx={cx} cy={cy} r={r} stroke={mainColor} strokeWidth="2" fill="none" />
        {/* Inner hub */}
        <circle cx={cx} cy={cy} r={r * 0.25} stroke={mainColor} strokeWidth="1.5" fill="none" />
        <circle cx={cx} cy={cy} r={r * 0.1} fill={mainColor} opacity="0.4" />
        {/* Tape remaining — fills with slowEnergy */}
        <circle
          cx={cx}
          cy={cy}
          r={r * (0.3 + slowEnergy * 0.5)}
          stroke={accentColor}
          strokeWidth="1"
          fill={accentColor}
          opacity="0.15"
        />
        {/* Spokes */}
        {spokes}
      </g>
    );
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-end",
        padding: size * 0.2,
      }}
    >
      <div
        style={{
          opacity,
          willChange: "transform, opacity",
        }}
      >
        <svg width={size} height={size * 0.8} viewBox="0 0 200 160" fill="none">
          {/* Left reel */}
          {renderReel(55, 55, 40, reelRotation)}
          {/* Right reel — counter-rotate */}
          {renderReel(145, 55, 40, -reelRotation)}

          {/* Tape ribbon connecting reels — bottom arc */}
          <path
            d={`M 55 95 Q 100 ${130 + snap.beatDecay * 10} 145 95`}
            stroke={mainColor}
            strokeWidth="1.5"
            fill="none"
            opacity="0.5"
          />
          {/* Top tape path */}
          <line x1="55" y1="15" x2="145" y2="15" stroke={mainColor} strokeWidth="1" opacity="0.3" />

          {/* Microphone stand — center */}
          <line x1="100" y1="70" x2="100" y2="145" stroke={mainColor} strokeWidth="2" opacity="0.6" />
          {/* Mic base */}
          <line x1="82" y1="145" x2="118" y2="145" stroke={mainColor} strokeWidth="2.5" opacity="0.5" />
          {/* Mic head */}
          <ellipse
            cx="100"
            cy="65"
            rx="10"
            ry="14"
            stroke={accentColor}
            strokeWidth="1.5"
            fill={accentColor}
            opacity={0.2 + snap.bass * 0.3}
          />
          {/* Mic grille lines */}
          <line x1="93" y1="60" x2="107" y2="60" stroke={accentColor} strokeWidth="0.8" opacity="0.4" />
          <line x1="92" y1="65" x2="108" y2="65" stroke={accentColor} strokeWidth="0.8" opacity="0.4" />
          <line x1="93" y1="70" x2="107" y2="70" stroke={accentColor} strokeWidth="0.8" opacity="0.4" />

          {/* VU meter indicator */}
          <rect x="85" y="110" width="30" height="8" rx="2" stroke={mainColor} strokeWidth="1" fill="none" opacity="0.4" />
          <rect
            x="86"
            y="111"
            width={28 * energy}
            height="6"
            rx="1"
            fill={energy > 0.7 ? "#cc3333" : mainColor}
            opacity="0.5"
          />
        </svg>
      </div>
    </div>
  );
};
