/**
 * ChinaCatSunflower -- Cat silhouette with sunflower halo.
 * SVG cat silhouette (pointed ears, arched back, curled tail).
 * Behind the cat: a large sunflower (circle center + 12-16 petal ellipses).
 * Cat is dark/outlined, sunflower is bright yellow/gold/orange.
 * Sunflower petals slowly rotate. Cat eyes glow with chroma-based color.
 * Appears every 70s for 10s. Positioned off-center.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface PetalData {
  angle: number;
  length: number;
  width: number;
  hueShift: number;
}

const NUM_PETALS = 14;
const CYCLE = 2100; // 70 seconds at 30fps
const DURATION = 300; // 10 seconds at 30fps

function generatePetals(seed: number): PetalData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_PETALS }, (_, i) => ({
    angle: (i / NUM_PETALS) * Math.PI * 2 + (rng() - 0.5) * 0.1,
    length: 55 + rng() * 25,
    width: 18 + rng() * 10,
    hueShift: rng() * 20 - 10, // -10 to +10 around gold
  }));
}

/** Cat silhouette as SVG path -- simple stylized sitting cat */
const CatSilhouette: React.FC<{
  x: number;
  y: number;
  scale: number;
  outlineColor: string;
  eyeColor: string;
  eyeGlow: number;
}> = ({ x, y, scale, outlineColor, eyeColor, eyeGlow }) => (
  <g transform={`translate(${x}, ${y}) scale(${scale})`}>
    {/* Body: sitting cat with arched back */}
    <path
      d={`
        M 0 0
        C -5 -10 -15 -30 -12 -50
        C -10 -62 -5 -68 0 -70
        C 5 -68 10 -62 12 -50
        C 15 -30 5 -10 0 0
        Z
      `}
      fill="rgba(10,10,20,0.85)"
      stroke={outlineColor}
      strokeWidth={1.5}
    />
    {/* Left ear */}
    <path
      d="M -8 -65 L -16 -85 L -4 -68 Z"
      fill="rgba(10,10,20,0.85)"
      stroke={outlineColor}
      strokeWidth={1.2}
    />
    {/* Right ear */}
    <path
      d="M 8 -65 L 16 -85 L 4 -68 Z"
      fill="rgba(10,10,20,0.85)"
      stroke={outlineColor}
      strokeWidth={1.2}
    />
    {/* Tail: curled to the right */}
    <path
      d="M 8 -5 C 25 -15 35 -30 30 -45 C 28 -50 22 -48 25 -40"
      fill="none"
      stroke={outlineColor}
      strokeWidth={3}
      strokeLinecap="round"
    />
    {/* Left eye */}
    <ellipse
      cx={-5} cy={-60}
      rx={3} ry={2.5}
      fill={eyeColor}
      style={{ filter: `drop-shadow(0 0 ${eyeGlow}px ${eyeColor})` }}
    />
    {/* Right eye */}
    <ellipse
      cx={5} cy={-60}
      rx={3} ry={2.5}
      fill={eyeColor}
      style={{ filter: `drop-shadow(0 0 ${eyeGlow}px ${eyeColor})` }}
    />
    {/* Nose */}
    <path
      d="M -1.5 -55 L 0 -53 L 1.5 -55 Z"
      fill={outlineColor}
      opacity="0.6"
    />
    {/* Whiskers */}
    <line x1={-4} y1={-55} x2={-20} y2={-58} stroke={outlineColor} strokeWidth={0.6} opacity="0.4" />
    <line x1={-4} y1={-54} x2={-18} y2={-52} stroke={outlineColor} strokeWidth={0.6} opacity="0.4" />
    <line x1={4} y1={-55} x2={20} y2={-58} stroke={outlineColor} strokeWidth={0.6} opacity="0.4" />
    <line x1={4} y1={-54} x2={18} y2={-52} stroke={outlineColor} strokeWidth={0.6} opacity="0.4" />
    {/* Front paws */}
    <ellipse cx={-6} cy={2} rx={4} ry={2.5} fill="rgba(10,10,20,0.85)" stroke={outlineColor} strokeWidth={1} />
    <ellipse cx={6} cy={2} rx={4} ry={2.5} fill="rgba(10,10,20,0.85)" stroke={outlineColor} strokeWidth={1} />
  </g>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const ChinaCatSunflower: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const petals = React.useMemo(() => generatePetals(508_1977), []);

  // Smooth chroma for eye color
  const chromaHue = React.useMemo(() => {
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
    return chromaCount > 0 ? chromaSum / chromaCount : 0;
  }, [frames, idx]);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const opacity = interpolate(progress, [0, 0.1, 0.85, 1], [0, 0.8, 0.8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.01) return null;

  // Positioned off-center (right side)
  const cx = width * 0.72;
  const cy = height * 0.55;

  // Sunflower center radius
  const centerR = 30;

  // Petal rotation: slow continuous
  const petalRotation = frame * 0.3; // degrees

  // Scale-in effect
  const scaleIn = interpolate(progress, [0, 0.15], [0.4, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Energy drives petal vibrancy and eye glow
  const vibrancy = interpolate(energy, [0.05, 0.3], [0.5, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const eyeHue = chromaHue * 360;
  const eyeColor = `hsl(${eyeHue}, 100%, 65%)`;
  const eyeGlow = interpolate(energy, [0.05, 0.3], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Gentle bob
  const bob = Math.sin(cycleFrame * 0.03) * 6;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          <radialGradient id="ccs-center" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#8B4513" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#654321" stopOpacity="0.7" />
          </radialGradient>
        </defs>

        <g transform={`translate(${cx}, ${cy + bob}) scale(${scaleIn})`}>
          {/* Sunflower petals (behind cat) */}
          <g
            transform={`rotate(${petalRotation})`}
            style={{ filter: `drop-shadow(0 0 10px hsla(45, 100%, 55%, ${vibrancy * 0.6})) drop-shadow(0 0 20px hsla(35, 100%, 50%, ${vibrancy * 0.3}))` }}
          >
            {petals.map((petal, pi) => {
              const a = petal.angle + petalRotation * (Math.PI / 180) * 0.3;
              const px = Math.cos(a) * (centerR + petal.length * 0.4);
              const py = Math.sin(a) * (centerR + petal.length * 0.4);
              const hue = 42 + petal.hueShift;

              // Slight petal breathing
              const breathe = 1 + Math.sin(frame * 0.04 + pi * 0.5) * 0.08 * vibrancy;

              return (
                <ellipse
                  key={`petal-${pi}`}
                  cx={px}
                  cy={py}
                  rx={petal.width * 0.5 * breathe}
                  ry={petal.length * 0.5 * breathe}
                  fill={`hsla(${hue}, 95%, ${55 + vibrancy * 15}%, ${0.7 + vibrancy * 0.2})`}
                  transform={`rotate(${a * (180 / Math.PI)}, ${px}, ${py})`}
                />
              );
            })}

            {/* Inner ring of smaller petals */}
            {petals.map((petal, pi) => {
              const a = petal.angle + Math.PI / NUM_PETALS;
              const px = Math.cos(a) * (centerR + petal.length * 0.15);
              const py = Math.sin(a) * (centerR + petal.length * 0.15);
              const hue = 30 + petal.hueShift;

              return (
                <ellipse
                  key={`inner-${pi}`}
                  cx={px}
                  cy={py}
                  rx={petal.width * 0.3}
                  ry={petal.length * 0.3}
                  fill={`hsla(${hue}, 100%, ${60 + vibrancy * 10}%, 0.6)`}
                  transform={`rotate(${a * (180 / Math.PI)}, ${px}, ${py})`}
                />
              );
            })}
          </g>

          {/* Sunflower center */}
          <circle cx={0} cy={0} r={centerR} fill="url(#ccs-center)" />

          {/* Seed pattern dots */}
          {Array.from({ length: 12 }, (_, i) => {
            const sa = (i / 12) * Math.PI * 2;
            const sr = centerR * 0.55;
            return (
              <circle
                key={`seed-${i}`}
                cx={Math.cos(sa) * sr}
                cy={Math.sin(sa) * sr}
                r={2}
                fill="hsla(30, 60%, 30%, 0.5)"
              />
            );
          })}

          {/* Cat silhouette (in front of sunflower) */}
          <CatSilhouette
            x={0}
            y={25}
            scale={1.3}
            outlineColor={`hsla(270, 60%, 70%, ${0.5 + vibrancy * 0.3})`}
            eyeColor={eyeColor}
            eyeGlow={eyeGlow}
          />
        </g>
      </svg>
    </div>
  );
};
