/**
 * BreathingStealie — sacred Steal Your Face that breathes with slow energy.
 * Always renders when overlay engine activates. Feels sacred and powerful.
 * Lightning bolt glows and flashes on onset, sends energy tendrils at peaks.
 * Skull color shifts with chromaHue. Slow, deliberate rotation.
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

/** Energy tendrils emanating from lightning bolt tip */
const EnergyTendrils: React.FC<{
  energy: number;
  beatDecay: number;
  boltColor: string;
  frame: number;
}> = ({ energy, beatDecay, boltColor, frame }) => {
  // Only render tendrils at peaks
  if (energy < 0.3) return null;

  const intensity = interpolate(energy, [0.3, 0.6], [0.3, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const numTendrils = 8;
  const tendrils: React.ReactNode[] = [];

  for (let i = 0; i < numTendrils; i++) {
    // Base angle spread radially from bolt tip (bottom of bolt at ~188,100 in viewBox)
    const baseAngle = (i / numTendrils) * Math.PI * 2;
    // Jitter angle slightly per frame for organic feel
    const jitter = Math.sin(frame * 0.15 + i * 2.3) * 0.2;
    const angle = baseAngle + jitter;

    // Length pulses with beat
    const baseLen = 12 + intensity * 20 + beatDecay * 15;
    const len = baseLen + Math.sin(frame * 0.2 + i * 1.7) * 5;

    // Origin: bolt tip (approximately center-bottom in 200x200 viewBox)
    const ox = 100;
    const oy = 170;
    const ex = ox + Math.cos(angle) * len;
    const ey = oy + Math.sin(angle) * len;

    // Opacity pulses
    const tendrilOpacity = intensity * (0.4 + beatDecay * 0.6) *
      (0.6 + Math.sin(frame * 0.3 + i * 0.8) * 0.4);

    tendrils.push(
      <line
        key={i}
        x1={ox} y1={oy}
        x2={ex} y2={ey}
        stroke={boltColor}
        strokeWidth={1.5 + intensity * 1.5}
        strokeLinecap="round"
        opacity={tendrilOpacity}
      />,
    );
  }

  return <>{tendrils}</>;
};

/** Full Steal Your Face SVG with dynamic bolt glow */
const Stealie: React.FC<{
  size: number;
  mainColor: string;
  boltColor: string;
  boltGlow: number;
  onsetFlash: number;
  energy: number;
  beatDecay: number;
  frame: number;
}> = ({ size, mainColor, boltColor, boltGlow, onsetFlash, energy, beatDecay, frame }) => {
  // Bolt brightness: base glow + onset flash
  const boltOpacity = Math.min(1, 0.8 + onsetFlash * 0.2);
  const boltFilter = boltGlow > 5
    ? `drop-shadow(0 0 ${boltGlow}px ${boltColor}) drop-shadow(0 0 ${boltGlow * 0.5}px white)`
    : "none";

  return (
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
      {/* Lightning bolt — glows and flashes on onset */}
      <g style={{ filter: boltFilter }}>
        <polygon
          points="100,12 88,82 108,82 78,188 118,105 96,105 116,12"
          fill={boltColor}
          opacity={boltOpacity}
        />
        {/* Onset flash overlay — white hot center */}
        {onsetFlash > 0.1 && (
          <polygon
            points="100,12 88,82 108,82 78,188 118,105 96,105 116,12"
            fill="white"
            opacity={onsetFlash * 0.5}
          />
        )}
      </g>
      {/* Eye sockets */}
      <circle cx="68" cy="76" r="18" stroke={mainColor} strokeWidth="3" />
      <circle cx="132" cy="76" r="18" stroke={mainColor} strokeWidth="3" />
      {/* Inner eye glow — pulses with energy */}
      <circle cx="68" cy="76" r="8" fill={mainColor} opacity={0.15 + energy * 0.35} />
      <circle cx="132" cy="76" r="8" fill={mainColor} opacity={0.15 + energy * 0.35} />
      {/* Energy tendrils from bolt tip at peaks */}
      <EnergyTendrils
        energy={energy}
        beatDecay={beatDecay}
        boltColor={boltColor}
        frame={frame}
      />
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const BreathingStealie: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Size: breathes with slowEnergy for sacred, tidal feel (0.7x-1.3x range)
  const baseSize = Math.min(width, height) * 0.20;
  const breathe = interpolate(slowEnergy, [0.02, 0.25], [0.7, 1.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Beat pulse adds subtle throb on top of slow breathing
  const beatPulse = snap.beatDecay * 0.06;
  const totalScale = breathe + beatPulse;

  const size = baseSize * totalScale;

  // Slow, sacred rotation — deliberate, not spinning
  // ~1 degree per second base, slight beat nudge
  const rotation = (frame / 30) * 1.0 * tempoFactor + snap.beatDecay * 1.5;

  // Opacity: wider range 0.40-0.80
  const opacity = interpolate(energy, [0.02, 0.3], [0.40, 0.80], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Colors from chroma
  const mainColor = hueToHex(chromaHue);
  const boltColor = hueToHex(chromaHue + 0.15);

  // Lightning bolt glow: onset-driven flash
  const onsetFlash = snap.onsetEnvelope;
  const boltGlow = interpolate(onsetFlash, [0, 0.3, 1.0], [4, 20, 50], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Overall glow: bass-driven ambient halo
  const bassGlow = 0.8 + snap.bass * 1.0;
  const glowRadius = interpolate(energy, [0.05, 0.3], [12, 35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * bassGlow;

  // Onset scale spike (+8% on transients)
  const onsetScale = 1 + onsetFlash * 0.08;

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
          transform: `rotate(${rotation}deg) scale(${totalScale * onsetScale})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${mainColor}) drop-shadow(0 0 ${glowRadius * 2}px ${boltColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <Stealie
          size={size}
          mainColor={mainColor}
          boltColor={boltColor}
          boltGlow={boltGlow}
          onsetFlash={onsetFlash}
          energy={energy}
          beatDecay={snap.beatDecay}
          frame={frame}
        />
      </div>
    </div>
  );
};
