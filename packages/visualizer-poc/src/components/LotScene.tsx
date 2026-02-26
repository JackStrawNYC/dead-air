/**
 * LotScene -- parking lot vendor/deadhead silhouettes along the bottom of the screen.
 * 12 silhouette figures in various poses with subtle neon outline glow.
 * Figures gently sway to audio energy. Slow left-to-right parallax pan.
 * Appears during mid-energy passages.
 * Deterministic via mulberry32 PRNG.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -- Silhouette SVGs --------------------------------------------------------
// Each returns a dark silhouette with a transparent background.

type SilhouetteFC = React.FC<{ height: number; color: string }>;

/** Standing figure with arms relaxed */
const Standing: SilhouetteFC = ({ height, color }) => (
  <svg width={height * 0.35} height={height} viewBox="0 0 35 100" fill={color}>
    <circle cx="17" cy="10" r="8" />
    <rect x="10" y="18" width="14" height="32" rx="5" />
    <rect x="4" y="22" width="7" height="24" rx="3" transform="rotate(-8 7 22)" />
    <rect x="24" y="22" width="7" height="24" rx="3" transform="rotate(8 28 22)" />
    <rect x="10" y="48" width="7" height="35" rx="3" transform="rotate(3 13 48)" />
    <rect x="18" y="48" width="7" height="35" rx="3" transform="rotate(-3 22 48)" />
  </svg>
);

/** Sitting cross-legged */
const Sitting: SilhouetteFC = ({ height, color }) => (
  <svg width={height * 0.55} height={height} viewBox="0 0 55 100" fill={color}>
    <circle cx="27" cy="25" r="9" />
    <rect x="19" y="34" width="16" height="28" rx="5" />
    <ellipse cx="27" cy="72" rx="24" ry="8" />
    <rect x="6" y="40" width="7" height="20" rx="3" transform="rotate(-20 9 40)" />
    <rect x="42" y="40" width="7" height="20" rx="3" transform="rotate(20 46 40)" />
  </svg>
);

/** Dancing figure with arms up */
const Dancing: SilhouetteFC = ({ height, color }) => (
  <svg width={height * 0.5} height={height} viewBox="0 0 50 100" fill={color}>
    <circle cx="25" cy="10" r="8" />
    <rect x="18" y="18" width="14" height="30" rx="5" />
    <rect x="8" y="18" width="7" height="28" rx="3" transform="rotate(-45 11 18)" />
    <rect x="35" y="18" width="7" height="28" rx="3" transform="rotate(40 38 18)" />
    <rect x="17" y="46" width="7" height="36" rx="3" transform="rotate(10 20 46)" />
    <rect x="26" y="46" width="7" height="36" rx="3" transform="rotate(-12 30 46)" />
  </svg>
);

/** Figure holding a sign */
const SignHolder: SilhouetteFC = ({ height, color }) => (
  <svg width={height * 0.55} height={height} viewBox="0 0 55 100" fill={color}>
    <circle cx="20" cy="12" r="8" />
    <rect x="13" y="20" width="14" height="30" rx="5" />
    <rect x="7" y="24" width="6" height="22" rx="3" transform="rotate(-10 10 24)" />
    <rect x="24" y="20" width="5" height="30" rx="2" transform="rotate(5 26 20)" />
    <rect x="24" y="0" width="26" height="18" rx="2" opacity="0.9" />
    <rect x="13" y="48" width="7" height="34" rx="3" />
    <rect x="21" y="48" width="7" height="34" rx="3" />
  </svg>
);

/** Twirling spinner */
const Spinner: SilhouetteFC = ({ height, color }) => (
  <svg width={height * 0.5} height={height} viewBox="0 0 50 100" fill={color}>
    <circle cx="25" cy="10" r="8" />
    <rect x="18" y="18" width="14" height="28" rx="5" />
    <rect x="6" y="20" width="6" height="26" rx="3" transform="rotate(-60 9 20)" />
    <rect x="38" y="20" width="6" height="26" rx="3" transform="rotate(55 41 20)" />
    <rect x="18" y="44" width="7" height="38" rx="3" transform="rotate(15 21 44)" />
    <rect x="25" y="44" width="7" height="38" rx="3" transform="rotate(-18 28 44)" />
  </svg>
);

/** Figure with guitar */
const Guitarist: SilhouetteFC = ({ height, color }) => (
  <svg width={height * 0.5} height={height} viewBox="0 0 50 100" fill={color}>
    <circle cx="22" cy="10" r="8" />
    <rect x="15" y="18" width="14" height="30" rx="5" />
    <ellipse cx="35" cy="52" rx="10" ry="14" opacity="0.8" />
    <rect x="30" y="24" width="3" height="30" rx="1" />
    <rect x="9" y="22" width="6" height="20" rx="3" transform="rotate(-15 12 22)" />
    <rect x="15" y="46" width="7" height="36" rx="3" />
    <rect x="23" y="46" width="7" height="36" rx="3" />
  </svg>
);

/** Hugging couple silhouette */
const Couple: SilhouetteFC = ({ height, color }) => (
  <svg width={height * 0.5} height={height} viewBox="0 0 50 100" fill={color}>
    <circle cx="18" cy="10" r="7" />
    <circle cx="32" cy="10" r="7" />
    <rect x="12" y="17" width="12" height="28" rx="5" />
    <rect x="26" y="17" width="12" height="28" rx="5" />
    <rect x="22" y="22" width="6" height="18" rx="3" opacity="0.7" />
    <rect x="12" y="43" width="7" height="34" rx="3" />
    <rect x="19" y="43" width="7" height="34" rx="3" transform="rotate(2 22 43)" />
    <rect x="26" y="43" width="7" height="34" rx="3" transform="rotate(-2 30 43)" />
    <rect x="32" y="43" width="7" height="34" rx="3" />
  </svg>
);

/** Person with hat / vendor */
const Vendor: SilhouetteFC = ({ height, color }) => (
  <svg width={height * 0.45} height={height} viewBox="0 0 45 100" fill={color}>
    <ellipse cx="22" cy="6" rx="14" ry="3" />
    <circle cx="22" cy="14" r="8" />
    <rect x="15" y="22" width="14" height="30" rx="5" />
    <rect x="8" y="26" width="6" height="22" rx="3" transform="rotate(-12 11 26)" />
    <rect x="30" y="26" width="6" height="22" rx="3" transform="rotate(12 33 26)" />
    <rect x="15" y="50" width="7" height="34" rx="3" />
    <rect x="23" y="50" width="7" height="34" rx="3" />
  </svg>
);

/** Dog silhouette */
const Dog: SilhouetteFC = ({ height, color }) => {
  const h = height * 0.5;
  return (
    <svg width={h * 1.4} height={h} viewBox="0 0 70 50" fill={color}>
      <ellipse cx="35" cy="25" rx="22" ry="12" />
      <circle cx="56" cy="16" r="8" />
      <polygon points="50,10 48,2 53,8" />
      <polygon points="58,10 60,2 55,8" />
      <rect x="18" y="34" width="5" height="14" rx="2" />
      <rect x="26" y="34" width="5" height="14" rx="2" />
      <rect x="40" y="34" width="5" height="14" rx="2" />
      <rect x="48" y="34" width="5" height="14" rx="2" />
      <path d="M 13 25 Q 5 20 2 28" stroke={color} strokeWidth="3" fill="none" />
    </svg>
  );
};

// -- Figure registry --------------------------------------------------------

const SILHOUETTES: SilhouetteFC[] = [
  Standing, Dancing, Sitting, SignHolder, Standing, Spinner,
  Guitarist, Couple, Vendor, Standing, Dancing, Dog,
];

// -- Figure layout config ---------------------------------------------------

interface FigureConfig {
  silhouetteIdx: number;
  xPosition: number; // 0-1 relative to scene width
  height: number;
  swayPhase: number;
  swayAmount: number;
}

function generateFigures(masterSeed: number): FigureConfig[] {
  const rng = seeded(masterSeed);
  const figures: FigureConfig[] = [];
  const count = 12;

  for (let i = 0; i < count; i++) {
    figures.push({
      silhouetteIdx: Math.floor(rng() * SILHOUETTES.length),
      xPosition: (i / count) + (rng() - 0.5) * 0.04,
      height: 55 + Math.floor(rng() * 35), // 55-90px
      swayPhase: rng() * Math.PI * 2,
      swayAmount: 2 + rng() * 4, // 2-6 degrees
    });
  }

  return figures;
}

// -- Component --------------------------------------------------------------

interface Props {
  frames: EnhancedFrameData[];
}

export const LotScene: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  // Rolling energy (75-frame window each side)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let energySum = 0;
  let energyCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    energySum += frames[i].rms;
    energyCount++;
  }
  const energy = energyCount > 0 ? energySum / energyCount : 0;

  // Show during mid-energy passages (fade based on energy range)
  const visibilityFade = interpolate(energy, [0.06, 0.12, 0.35, 0.45], [0, 1, 1, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow fade in at composition start
  const startFade = interpolate(frame, [0, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const opacity = visibilityFade * startFade * 0.7;

  if (opacity < 0.02) return null;

  const figures = React.useMemo(() => generateFigures(19770508), []);

  // Slow parallax scroll: total scene width is wider than viewport
  const sceneWidth = width * 1.8;
  const panProgress = (frame / durationInFrames) % 1;
  const panOffset = interpolate(panProgress, [0, 1], [0, -(sceneWidth - width)], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Energy drives sway intensity
  const swayMult = interpolate(energy, [0.05, 0.3], [0.3, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Neon outline glow color (slowly shifts)
  const glowHue = (frame * 0.3) % 360;
  const glowColor = `hsl(${glowHue}, 100%, 60%)`;
  const glowColorDim = `hsl(${glowHue}, 80%, 40%)`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: sceneWidth,
          height: 120,
          transform: `translateX(${panOffset}px)`,
          opacity,
          willChange: "transform, opacity",
        }}
      >
        {figures.map((fig, i) => {
          const Silhouette = SILHOUETTES[fig.silhouetteIdx];
          const x = fig.xPosition * sceneWidth;

          // Sway: gentle rotation based on energy
          const swayAngle =
            Math.sin(frame * 0.04 + fig.swayPhase) *
            fig.swayAmount *
            swayMult;

          // Subtle vertical bob on beat
          const currentBeat = frames[idx]?.beat ? 1 : 0;
          const bobY = currentBeat * -3;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                bottom: 4,
                transformOrigin: "bottom center",
                transform: `rotate(${swayAngle}deg) translateY(${bobY}px)`,
                filter: `drop-shadow(0 0 3px ${glowColorDim}) drop-shadow(0 0 6px ${glowColor})`,
                willChange: "transform",
              }}
            >
              <Silhouette height={fig.height} color="rgba(20, 15, 30, 0.85)" />
            </div>
          );
        })}

        {/* Ground line */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, transparent 0%, ${glowColorDim} 20%, ${glowColor} 50%, ${glowColorDim} 80%, transparent 100%)`,
            opacity: 0.4,
          }}
        />
      </div>
    </div>
  );
};
