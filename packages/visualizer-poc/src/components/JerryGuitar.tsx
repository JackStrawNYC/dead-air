/**
 * JerryGuitar — Jerry Garcia's Tiger guitar silhouette.
 * Double-cutaway body, neck, headstock, 6 vibrating strings.
 * Mid-frequency band drives string vibration. Chroma-reactive color.
 * 60s cycle, 20s visible. Energy gate at 0.10.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

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

const CYCLE = 1800;    // 60 seconds at 30fps
const DURATION = 600;  // 20 seconds at 30fps

// String Y positions relative to guitar body (6 strings, high E to low E)
const STRING_Y = [0, 1, 2, 3, 4, 5];
const STRING_SPACING = 7;
const STRING_BASE_Y = 145;

interface Props {
  frames: EnhancedFrameData[];
}

export const JerryGuitar: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Smooth energy (151-frame window)
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Mid-band energy for string vibration (narrower window — 31 frames)
  let midSum = 0;
  let midCount = 0;
  for (let i = Math.max(0, idx - 15); i <= Math.min(frames.length - 1, idx + 15); i++) {
    midSum += frames[i].mid;
    midCount++;
  }
  const midEnergy = midCount > 0 ? midSum / midCount : 0;

  // Smooth chroma hue (31-frame window)
  let chromaSum = 0;
  let chromaCount = 0;
  for (let i = Math.max(0, idx - 15); i <= Math.min(frames.length - 1, idx + 15); i++) {
    const ch = frames[i].chroma;
    let maxI = 0;
    for (let j = 1; j < 12; j++) {
      if (ch[j] > ch[maxI]) maxI = j;
    }
    chromaSum += maxI / 12;
    chromaCount++;
  }
  const chromaHue = chromaCount > 0 ? chromaSum / chromaCount : 0;

  // Cycle timing
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade envelope: 10% in, hold, 10% out
  const envelope = interpolate(progress, [0, 0.1, 0.85, 1], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Energy gate at 0.10
  const energyGate = interpolate(energy, [0.05, 0.10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = envelope * energyGate * 0.5;
  if (opacity < 0.01) return null;

  // Scale breathing with energy
  const breathe = interpolate(energy, [0.05, 0.3], [0.95, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow rotation: ~2 deg/s
  const rotation = (frame / 30) * 2;

  // Colors from chroma
  const bodyColor = hueToHex(chromaHue);
  const glowColor = hueToHex(chromaHue + 0.1);
  const stringColor = hueToHex(chromaHue + 0.2);

  // String vibration amplitude from mid energy
  const vibAmp = interpolate(midEnergy, [0.02, 0.4], [0.5, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow from energy
  const glowRadius = interpolate(energy, [0.05, 0.3], [4, 15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Guitar SVG size — fit within viewport
  const svgScale = Math.min(width, height) * 0.45;

  // Build string paths with sinusoidal vibration
  const stringPaths = STRING_Y.map((si) => {
    const y = STRING_BASE_Y + si * STRING_SPACING;
    // Each string vibrates at a different frequency
    const freq = 3 + si * 1.2;
    const amp = vibAmp * (1 + si * 0.15); // lower strings vibrate more
    // Build wavy path from x=80 (bridge) to x=240 (nut)
    const points: string[] = [];
    for (let x = 80; x <= 240; x += 2) {
      const t = (x - 80) / 160; // 0 to 1 along string
      // Vibration envelope: zero at endpoints, max at center
      const envt = Math.sin(t * Math.PI);
      const dy = Math.sin(frame * 0.3 * freq + x * 0.05 + si) * amp * envt;
      points.push(`${x},${y + dy}`);
    }
    return points.join(" ");
  });

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
          transform: `rotate(${rotation}deg) scale(${breathe})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${bodyColor}) drop-shadow(0 0 ${glowRadius * 2}px ${glowColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <svg
          width={svgScale}
          height={svgScale * 0.65}
          viewBox="0 0 320 210"
          fill="none"
        >
          {/* Guitar body — double-cutaway Tiger shape */}
          <path
            d={[
              "M 100,90",   // upper horn start
              "C 70,85 50,100 45,130",  // upper bout curve
              "C 40,155 50,175 75,185", // lower bout left
              "C 95,192 115,195 130,190", // bottom curve
              "C 145,185 155,178 160,170", // waist right
              "C 165,162 160,150 155,140", // cutaway right lower
              "C 150,130 155,120 160,115", // cutaway right upper
              "C 155,105 145,95 130,90",   // upper bout right
              "Z",
            ].join(" ")}
            fill={bodyColor}
            opacity="0.3"
            stroke={bodyColor}
            strokeWidth="2"
          />

          {/* Pickguard */}
          <ellipse cx="105" cy="150" rx="30" ry="22" fill={bodyColor} opacity="0.15" />

          {/* Pickups (2 humbuckers) */}
          <rect x="90" y="130" width="30" height="8" rx="2" fill={bodyColor} opacity="0.5" />
          <rect x="90" y="155" width="30" height="8" rx="2" fill={bodyColor} opacity="0.5" />

          {/* Bridge */}
          <rect x="75" y="142" width="12" height="26" rx="1" fill={bodyColor} opacity="0.4" />

          {/* Neck */}
          <rect x="160" y="130" width="80" height="30" rx="2" fill={bodyColor} opacity="0.25" stroke={bodyColor} strokeWidth="1" />

          {/* Fret markers */}
          {[180, 200, 220].map((fx) => (
            <circle key={fx} cx={fx} cy={145} r="2" fill={bodyColor} opacity="0.3" />
          ))}

          {/* Headstock */}
          <path
            d="M 240,128 L 265,120 C 275,118 280,122 278,132 L 278,158 C 280,168 275,172 265,170 L 240,162 Z"
            fill={bodyColor}
            opacity="0.3"
            stroke={bodyColor}
            strokeWidth="1.5"
          />

          {/* Tuning pegs (6) */}
          {[0, 1, 2, 3, 4, 5].map((pi) => (
            <circle
              key={pi}
              cx={272}
              cy={126 + pi * 8}
              r="3"
              fill={bodyColor}
              opacity="0.5"
            />
          ))}

          {/* Vibrating strings */}
          {stringPaths.map((path, si) => (
            <polyline
              key={si}
              points={path}
              stroke={stringColor}
              strokeWidth={0.8 + si * 0.15}
              fill="none"
              opacity={0.6 + midEnergy * 0.4}
              style={{ filter: `drop-shadow(0 0 ${2 + midEnergy * 4}px ${stringColor})` }}
            />
          ))}

          {/* Sound hole (acoustic suggestion) */}
          <circle cx="108" cy="145" r="10" fill="none" stroke={bodyColor} strokeWidth="1" opacity="0.25" />
        </svg>
      </div>
    </div>
  );
};
