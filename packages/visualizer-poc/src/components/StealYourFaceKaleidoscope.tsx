/**
 * StealYourFaceKaleidoscope — A+++ mesmerizing kaleidoscopic mandala built
 * from Steal Your Face imagery with 8-fold symmetry, concentric rings,
 * decorative elements (roses, 13-pt stars, mini bolts), and deep audio
 * reactivity. Inner ring rotates CW, outer ring CCW, beat-synced speed.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

interface Props {
  frames: EnhancedFrameData[];
}

/* ------------------------------------------------------------------ */
/*  SVG Sub-Components                                                 */
/* ------------------------------------------------------------------ */

/** Full-detail Steal Your Face skull + lightning bolt */
const StealieIcon: React.FC<{
  size: number;
  hue: number;
  boltWhiteHot: number; // 0-1, onset flash
  glowIntensity: number;
  opacity: number;
  ringIndex: number; // 0=inner, 1=mid, 2=outer — affects detail level
}> = ({ size, hue, boltWhiteHot, glowIntensity, opacity, ringIndex }) => {
  const mainColor = `hsl(${hue}, 72%, 62%)`;
  const boltBase = `hsl(${(hue + 30) % 360}, 85%, 58%)`;
  const boltHot = `hsl(${(hue + 30) % 360}, 40%, ${58 + boltWhiteHot * 40}%)`;
  const eyeGlow = `hsl(${(hue + 180) % 360}, 80%, ${50 + glowIntensity * 30}%)`;
  const ringColor = `hsl(${hue}, 65%, 55%)`;
  const innerGlow = `hsl(${(hue + 15) % 360}, 90%, 70%)`;
  const glowR = 3 + glowIntensity * 8;
  const filterId = `syf-glow-${ringIndex}-${Math.round(hue)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      opacity={opacity}
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={glowR} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`eye-grad-${filterId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={eyeGlow} stopOpacity="0.9" />
          <stop offset="70%" stopColor={eyeGlow} stopOpacity="0.3" />
          <stop offset="100%" stopColor={eyeGlow} stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id={`bolt-grad-${filterId}`}
          x1="50%"
          y1="0%"
          x2="50%"
          y2="100%"
        >
          <stop offset="0%" stopColor={boltHot} />
          <stop offset="50%" stopColor={boltBase} />
          <stop offset="100%" stopColor={boltHot} />
        </linearGradient>
      </defs>

      <g filter={`url(#${filterId})`}>
        {/* Outer ring — thick circle */}
        <circle
          cx="60"
          cy="60"
          r="54"
          stroke={ringColor}
          strokeWidth="3.5"
          fill="none"
        />
        <circle
          cx="60"
          cy="60"
          r="51"
          stroke={mainColor}
          strokeWidth="1"
          fill="none"
          opacity="0.4"
        />

        {/* Skull dome — upper hemisphere */}
        <path
          d="M 16 60 A 44 44 0 0 1 104 60"
          stroke={mainColor}
          strokeWidth="2.5"
          fill="none"
        />

        {/* Skull top contour */}
        <path
          d="M 26 60 Q 30 22, 60 18 Q 90 22, 94 60"
          stroke={mainColor}
          strokeWidth="1.8"
          fill="none"
          opacity="0.6"
        />

        {/* Horizontal divider (jaw line) */}
        <line
          x1="16"
          y1="60"
          x2="104"
          y2="60"
          stroke={mainColor}
          strokeWidth="2"
        />

        {/* Eye sockets — left */}
        <ellipse
          cx="42"
          cy="44"
          rx="10"
          ry="9"
          stroke={mainColor}
          strokeWidth="1.8"
          fill="none"
        />
        <ellipse
          cx="42"
          cy="44"
          rx="6"
          ry="5.5"
          fill={`url(#eye-grad-${filterId})`}
        />

        {/* Eye sockets — right */}
        <ellipse
          cx="78"
          cy="44"
          rx="10"
          ry="9"
          stroke={mainColor}
          strokeWidth="1.8"
          fill="none"
        />
        <ellipse
          cx="78"
          cy="44"
          rx="6"
          ry="5.5"
          fill={`url(#eye-grad-${filterId})`}
        />

        {/* Nose triangle */}
        <path
          d="M 56 52 L 60 58 L 64 52"
          stroke={mainColor}
          strokeWidth="1.3"
          fill="none"
          opacity="0.5"
        />

        {/* Jaw / lower skull */}
        <path
          d="M 16 60 Q 20 90, 40 96 Q 50 100, 60 98 Q 70 100, 80 96 Q 100 90, 104 60"
          stroke={mainColor}
          strokeWidth="2"
          fill="none"
          opacity="0.7"
        />

        {/* Teeth hints */}
        {ringIndex <= 1 && (
          <g opacity="0.35">
            {[44, 50, 56, 62, 68, 74].map((x) => (
              <line
                key={x}
                x1={x}
                y1="60"
                x2={x}
                y2="66"
                stroke={mainColor}
                strokeWidth="0.8"
              />
            ))}
          </g>
        )}

        {/* Lightning bolt — main body */}
        <polygon
          points="60,10 52,46 62,44 42,98 48,98 66,54 56,56 68,10"
          fill={`url(#bolt-grad-${filterId})`}
          opacity={0.85 + boltWhiteHot * 0.15}
        />

        {/* Lightning bolt — inner glow layer */}
        <polygon
          points="60,14 54,44 61,43 46,92 50,92 64,53 57,54 66,14"
          fill={innerGlow}
          opacity={0.25 + boltWhiteHot * 0.55}
        />

        {/* Lightning bolt — white-hot core on onset */}
        {boltWhiteHot > 0.2 && (
          <polygon
            points="60,18 56,43 60,42 49,86 52,86 63,52 58,53 65,18"
            fill="white"
            opacity={boltWhiteHot * 0.6}
          />
        )}
      </g>
    </svg>
  );
};

/** Small lightning bolt decorative element */
const MiniBolt: React.FC<{
  size: number;
  hue: number;
  opacity: number;
}> = ({ size, hue, opacity }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 40"
    fill="none"
    opacity={opacity}
  >
    <polygon
      points="10,0 7,16 12,15 5,40 8,40 14,18 9,19 13,0"
      fill={`hsl(${(hue + 30) % 360}, 85%, 65%)`}
    />
  </svg>
);

/** 13-point star (Grateful Dead motif) */
const ThirteenPointStar: React.FC<{
  size: number;
  hue: number;
  opacity: number;
  rotation: number;
}> = ({ size, hue, opacity, rotation }) => {
  const points: string[] = [];
  for (let i = 0; i < 26; i++) {
    const angle = (i * Math.PI * 2) / 26 - Math.PI / 2;
    const r = i % 2 === 0 ? 18 : 8;
    points.push(`${20 + r * Math.cos(angle)},${20 + r * Math.sin(angle)}`);
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      opacity={opacity}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <polygon
        points={points.join(" ")}
        fill={`hsl(${(hue + 120) % 360}, 70%, 60%)`}
        opacity="0.7"
      />
      <polygon
        points={points.join(" ")}
        stroke={`hsl(${(hue + 120) % 360}, 80%, 75%)`}
        strokeWidth="0.6"
        fill="none"
      />
    </svg>
  );
};

/** Simple rose shape (5-petal) */
const Rose: React.FC<{
  size: number;
  hue: number;
  opacity: number;
  rotation: number;
}> = ({ size, hue, opacity, rotation }) => {
  const petalColor = `hsl(${(hue + 240) % 360}, 65%, 55%)`;
  const centerColor = `hsl(${(hue + 60) % 360}, 80%, 70%)`;
  const petals: React.ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i * 72 * Math.PI) / 180;
    const cx = 20 + 9 * Math.cos(angle);
    const cy = 20 + 9 * Math.sin(angle);
    petals.push(
      <ellipse
        key={i}
        cx={cx}
        cy={cy}
        rx="7"
        ry="4.5"
        fill={petalColor}
        transform={`rotate(${i * 72}, ${cx}, ${cy})`}
        opacity="0.75"
      />,
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      opacity={opacity}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      {petals}
      <circle cx="20" cy="20" r="4" fill={centerColor} opacity="0.9" />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Ring Configuration                                                 */
/* ------------------------------------------------------------------ */

interface RingConfig {
  radius: number; // fraction of container
  count: number; // stealies in this ring
  scale: number; // base scale
  opacityBase: number;
  direction: 1 | -1; // CW or CCW
  speedMultiplier: number;
}

const RINGS: RingConfig[] = [
  {
    radius: 0,
    count: 1,
    scale: 1.0,
    opacityBase: 1.0,
    direction: 1,
    speedMultiplier: 0.5,
  },
  {
    radius: 0.28,
    count: 8,
    scale: 0.52,
    opacityBase: 0.85,
    direction: 1,
    speedMultiplier: 1.0,
  },
  {
    radius: 0.52,
    count: 8,
    scale: 0.38,
    opacityBase: 0.6,
    direction: -1,
    speedMultiplier: 0.7,
  },
];

/* ------------------------------------------------------------------ */
/*  Decorative Element Ring                                            */
/* ------------------------------------------------------------------ */

interface DecoConfig {
  radius: number;
  count: number;
  type: "bolt" | "star" | "rose";
  size: number;
  speedMultiplier: number;
  direction: 1 | -1;
}

const DECO_RINGS: DecoConfig[] = [
  {
    radius: 0.16,
    count: 8,
    type: "bolt",
    size: 16,
    speedMultiplier: 1.3,
    direction: -1,
  },
  {
    radius: 0.4,
    count: 8,
    type: "star",
    size: 18,
    speedMultiplier: 0.6,
    direction: 1,
  },
  {
    radius: 0.62,
    count: 8,
    type: "rose",
    size: 20,
    speedMultiplier: 0.4,
    direction: -1,
  },
];

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export const StealYourFaceKaleidoscope: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  /* --- Audio extraction --- */
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue;
  const beatDecay = snap.beatDecay;
  const onsetEnvelope = snap.onsetEnvelope;
  const musicalTime = snap.musicalTime;
  const bass = snap.bass;
  const spectralFlux = snap.spectralFlux;

  /* --- Derived values --- */
  const t = frame / fps; // time in seconds
  const baseSpeed = 18 * tempoFactor; // degrees per second

  // Beat pulse: sharp attack, smooth decay
  const beatPulse = Math.pow(beatDecay, 0.6);

  // Onset flash: white-hot bolt intensity
  const onsetFlash = Math.min(1, onsetEnvelope * 1.8);

  // Overall breathing from slow energy
  const breathe = interpolate(slowEnergy, [0, 1], [0.92, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow intensity from energy
  const glowIntensity = interpolate(energy, [0, 0.8], [0.15, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Hue cycling: chromaHue drives base, slow drift adds variation
  const hue = (chromaHue + t * 8) % 360;

  // Container size based on slow energy breathing
  const containerSize = 700 * breathe;

  // Overall component opacity
  const componentOpacity = interpolate(energy, [0, 0.15, 0.6], [0.12, 0.25, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Decorative element opacity from energy
  const decoOpacity = interpolate(energy, [0, 0.3, 0.7], [0.1, 0.3, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Drop shadow glow
  const dropGlow = 8 + energy * 24 + beatPulse * 12;
  const dropColor = `hsl(${hue}, 70%, 55%)`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: componentOpacity,
      }}
    >
      <div
        style={{
          position: "relative",
          width: containerSize,
          height: containerSize,
          filter: `drop-shadow(0 0 ${dropGlow}px ${dropColor})`,
          willChange: "transform, filter, opacity",
        }}
      >
        {/* --- Stealie Rings --- */}
        {RINGS.map((ring, ri) => {
          const rotDeg =
            t * baseSpeed * ring.speedMultiplier * ring.direction +
            beatPulse * 6 * ring.direction;

          const ringScale =
            ring.scale * breathe * (ri === 1 ? 1 + beatPulse * 0.08 : 1);

          // Per-ring hue offset for color variation
          const ringHue = (hue + ri * 45) % 360;

          if (ring.count === 1) {
            // Center stealie
            const centerScale =
              ringScale * (1 + beatPulse * 0.12) * (1 + bass * 0.06);
            const centerSize = containerSize * 0.32 * centerScale;
            return (
              <div
                key={`ring-${ri}`}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: `translate(-50%, -50%) rotate(${rotDeg}deg)`,
                  transformOrigin: "center center",
                }}
              >
                <StealieIcon
                  size={centerSize}
                  hue={ringHue}
                  boltWhiteHot={onsetFlash}
                  glowIntensity={glowIntensity}
                  opacity={ring.opacityBase}
                  ringIndex={0}
                />
              </div>
            );
          }

          const segAngle = 360 / ring.count;
          return (
            <div
              key={`ring-${ri}`}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 0,
                height: 0,
                transform: `rotate(${rotDeg}deg)`,
                transformOrigin: "center center",
              }}
            >
              {Array.from({ length: ring.count }).map((_, si) => {
                const angle = si * segAngle;
                const angleRad = (angle * Math.PI) / 180;
                const r = (containerSize / 2) * ring.radius;
                const px = r * Math.cos(angleRad);
                const py = r * Math.sin(angleRad);

                // Per-segment micro-variation
                const segPhase = Math.sin(t * 1.2 + si * 0.9) * 0.03;
                const segScale = ringScale * (1 + segPhase);

                // Fade stealies by position (top brighter, bottom slightly dimmer)
                const posFade =
                  ring.opacityBase -
                  Math.abs(Math.sin(angleRad)) * 0.08;

                const segSize = containerSize * 0.18 * segScale;

                // Per-segment hue shift for rainbow kaleidoscope effect
                const segHue = (ringHue + si * (360 / ring.count) * 0.3) % 360;

                return (
                  <div
                    key={si}
                    style={{
                      position: "absolute",
                      transform: `translate(${px - segSize / 2}px, ${py - segSize / 2}px) rotate(${angle}deg)`,
                    }}
                  >
                    <StealieIcon
                      size={segSize}
                      hue={segHue}
                      boltWhiteHot={onsetFlash * (0.6 + (si % 2) * 0.4)}
                      glowIntensity={glowIntensity * (0.7 + ri * 0.15)}
                      opacity={posFade}
                      ringIndex={ri}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* --- Decorative Element Rings --- */}
        {DECO_RINGS.map((deco, di) => {
          const decoRot =
            t * baseSpeed * deco.speedMultiplier * deco.direction +
            spectralFlux * 4 * deco.direction;

          return (
            <div
              key={`deco-${di}`}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 0,
                height: 0,
                transform: `rotate(${decoRot}deg)`,
                transformOrigin: "center center",
              }}
            >
              {Array.from({ length: deco.count }).map((_, ei) => {
                const angle = ei * (360 / deco.count);
                const angleRad = (angle * Math.PI) / 180;
                const r = (containerSize / 2) * deco.radius;
                const px = r * Math.cos(angleRad);
                const py = r * Math.sin(angleRad);

                const elemHue = (hue + di * 60 + ei * 25) % 360;
                const elemRot = t * 30 * (ei % 2 === 0 ? 1 : -1);
                const elemOpacity =
                  decoOpacity * (0.7 + Math.sin(t * 2 + ei) * 0.3);

                const halfSize = deco.size / 2;

                return (
                  <div
                    key={ei}
                    style={{
                      position: "absolute",
                      transform: `translate(${px - halfSize}px, ${py - halfSize}px)`,
                    }}
                  >
                    {deco.type === "bolt" && (
                      <MiniBolt
                        size={deco.size}
                        hue={elemHue}
                        opacity={elemOpacity}
                      />
                    )}
                    {deco.type === "star" && (
                      <ThirteenPointStar
                        size={deco.size}
                        hue={elemHue}
                        opacity={elemOpacity}
                        rotation={elemRot}
                      />
                    )}
                    {deco.type === "rose" && (
                      <Rose
                        size={deco.size}
                        hue={elemHue}
                        opacity={elemOpacity}
                        rotation={elemRot * 0.5}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
