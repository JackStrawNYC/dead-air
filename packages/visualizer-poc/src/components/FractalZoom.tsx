/**
 * FractalZoom — A+++ infinite spiraling fractal tunnel effect.
 *
 * 16 concentric hexagonal rings zooming outward from center.
 * Each ring: 3-layer rendering (outer glow, main body, inner bright edge).
 * Rings scale exponentially for zoom-through illusion.
 * Per-ring hue offset from chromaHue for rainbow cycling.
 * Center glow mandala with rotating petals.
 * Echo/ghost trails behind each ring (2 faded copies at slightly smaller scale).
 * Particle motes along ring edges.
 *
 * Audio mapping:
 *   energy      → zoom speed + ring count + stroke weight
 *   beatDecay   → ring brightness pulse
 *   chromaHue   → spectrum base hue (per-ring offset for rainbow)
 *   tempoFactor → animation speed scaling
 *   bass        → center mandala intensity
 *   onsetEnvelope → particle mote spawning
 *   centroid    → glow radius
 *   slowEnergy  → ghost trail opacity
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NUM_RINGS = 16;
const SIDES = 6; // hexagons
const NUM_MANDALA_PETALS = 12;
const MOTES_PER_RING = 3;

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

/** Build a regular polygon path string centered at origin */
function hexPath(r: number, sides: number): string {
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    points.push(`${(Math.cos(angle) * r).toFixed(2)},${(Math.sin(angle) * r).toFixed(2)}`);
  }
  return `M ${points.join(" L ")} Z`;
}

/** Get a point on a hex ring edge at parameter t (0-1 around perimeter) */
function hexEdgePoint(r: number, sides: number, t: number): [number, number] {
  const total = t * sides;
  const sideIdx = Math.floor(total) % sides;
  const frac = total - Math.floor(total);
  const a0 = (sideIdx / sides) * Math.PI * 2 - Math.PI / 2;
  const a1 = ((sideIdx + 1) / sides) * Math.PI * 2 - Math.PI / 2;
  const x = Math.cos(a0) * r * (1 - frac) + Math.cos(a1) * r * frac;
  const y = Math.sin(a0) * r * (1 - frac) + Math.sin(a1) * r * frac;
  return [x, y];
}

/* ------------------------------------------------------------------ */
/*  Ring data                                                          */
/* ------------------------------------------------------------------ */

interface RingData {
  phaseOffset: number;
  rotOffset: number;
  baseStrokeWidth: number;
  hueOffset: number;
  /** Mote positions as fraction along edge perimeter (0-1) */
  motePositions: number[];
}

function generateRings(seed: number): RingData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_RINGS }, (_, i) => ({
    phaseOffset: i / NUM_RINGS,
    rotOffset: rng() * 30 - 15,
    baseStrokeWidth: 1.2 + rng() * 1.8,
    hueOffset: i * (360 / NUM_RINGS),
    motePositions: Array.from({ length: MOTES_PER_RING }, () => rng()),
  }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const FractalZoom: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, chromaHue, beatDecay, onsetEnvelope, bass, slowEnergy, centroid } = snap;

  const rings = React.useMemo(() => generateRings(19650813), []);

  /* --- master opacity --- */
  const masterOpacity = interpolate(energy, [0.04, 0.25], [0.15, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.55;

  /* --- speed --- */
  const speedMult = interpolate(energy, [0.03, 0.3], [0.4, 2.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * tempoFactor;

  const globalRotation = frame * 0.35 * speedMult;
  const baseHue = chromaHue;

  /* --- glow filter size from centroid --- */
  const glowSize = 3 + centroid * 8 + energy * 6;

  /* ---------------------------------------------------------------- */
  /*  Ring rendering                                                   */
  /* ---------------------------------------------------------------- */

  const ringElements: React.ReactNode[] = [];

  rings.forEach((ring, ri) => {
    const scaleProgress = ((frame * 0.013 * speedMult + ring.phaseOffset) % 1);
    // Exponential scaling for zoom-through feel
    const scale = scaleProgress * scaleProgress;
    const r = scale * maxRadius;

    if (r < 4) return;

    const distNorm = r / maxRadius;

    // Ring alpha: fade in from center, peak, fade at edges
    const ringAlpha = interpolate(distNorm, [0, 0.1, 0.3, 0.7, 0.9, 1], [0, 0.3, 0.9, 1, 0.5, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    if (ringAlpha < 0.02) return;

    const rotation = globalRotation + ring.rotOffset + scaleProgress * 35;
    const hue = (baseHue + ring.hueOffset) % 360;
    const sat = 85 + energy * 15;
    const beatPulse = beatDecay * 25;
    const lightBase = 50 + beatPulse;

    const strokeW = ring.baseStrokeWidth * (0.5 + energy * 0.7);

    /* --- 2 ghost/echo trails (slightly smaller, faded) --- */
    const ghostAlpha = ringAlpha * slowEnergy * 0.35;
    if (ghostAlpha > 0.01) {
      // Ghost 1: 94% scale
      ringElements.push(
        <g key={`g1-${ri}`} transform={`rotate(${rotation - 2})`} opacity={ghostAlpha * 0.6}>
          <path d={hexPath(r * 0.94, SIDES)}
            stroke={`hsla(${hue}, ${sat}%, ${lightBase - 10}%, 1)`}
            strokeWidth={strokeW * 0.35} fill="none" strokeLinejoin="round" />
        </g>,
      );
      // Ghost 2: 88% scale
      ringElements.push(
        <g key={`g2-${ri}`} transform={`rotate(${rotation - 4})`} opacity={ghostAlpha * 0.35}>
          <path d={hexPath(r * 0.88, SIDES)}
            stroke={`hsla(${hue}, ${sat - 10}%, ${lightBase - 15}%, 1)`}
            strokeWidth={strokeW * 0.25} fill="none" strokeLinejoin="round" />
        </g>,
      );
    }

    /* --- Layer 1: outer glow (wide, soft) --- */
    const outerGlowColor = `hsla(${hue}, 100%, 70%, ${ringAlpha * 0.3})`;
    ringElements.push(
      <g key={`outer-${ri}`} transform={`rotate(${rotation})`}>
        <path d={hexPath(r, SIDES)}
          stroke={outerGlowColor}
          strokeWidth={strokeW * 2.5 + glowSize * 0.5}
          fill="none" strokeLinejoin="round"
          style={{ filter: `blur(${2 + energy * 3}px)` }}
        />
      </g>,
    );

    /* --- Layer 2: main body --- */
    const mainColor = `hsla(${hue}, ${sat}%, ${lightBase}%, ${ringAlpha})`;
    ringElements.push(
      <g key={`main-${ri}`} transform={`rotate(${rotation})`}>
        <path d={hexPath(r, SIDES)}
          stroke={mainColor}
          strokeWidth={strokeW}
          fill="none" strokeLinejoin="round"
        />
      </g>,
    );

    /* --- Layer 3: inner bright edge (thin, hot) --- */
    const innerColor = `hsla(${(hue + 15) % 360}, 100%, ${Math.min(90, lightBase + 20)}%, ${ringAlpha * 0.8})`;
    ringElements.push(
      <g key={`inner-${ri}`} transform={`rotate(${rotation})`}>
        <path d={hexPath(r * 0.97, SIDES)}
          stroke={innerColor}
          strokeWidth={strokeW * 0.4}
          fill="none" strokeLinejoin="round"
        />
      </g>,
    );

    /* --- Particle motes along ring edges --- */
    if (onsetEnvelope > 0.08 && distNorm > 0.15 && distNorm < 0.85) {
      ring.motePositions.forEach((moteT, mi) => {
        // Motes orbit along the hex edge
        const adjustedT = (moteT + frame * 0.002 * speedMult) % 1;
        const [mx, my] = hexEdgePoint(r, SIDES, adjustedT);

        // Rotate mote position to match ring
        const rotRad = (rotation * Math.PI) / 180;
        const rmx = mx * Math.cos(rotRad) - my * Math.sin(rotRad);
        const rmy = mx * Math.sin(rotRad) + my * Math.cos(rotRad);

        const moteAlpha = ringAlpha * onsetEnvelope * 0.8;
        const moteR = 1 + energy * 2;

        if (moteAlpha > 0.02) {
          ringElements.push(
            <circle key={`mote-${ri}-${mi}`}
              cx={rmx} cy={rmy} r={moteR}
              fill={`hsla(${(hue + 30) % 360}, 100%, 85%, ${moteAlpha})`}
            />,
          );
        }
      });
    }
  });

  /* ---------------------------------------------------------------- */
  /*  Center mandala glow                                              */
  /* ---------------------------------------------------------------- */

  const mandalaElements: React.ReactNode[] = [];
  const mandalaRadius = 12 + energy * 20 + bass * 15;
  const mandalaAlpha = 0.2 + energy * 0.35 + bass * 0.2;

  // Soft center glow
  mandalaElements.push(
    <circle key="center-glow"
      cx={0} cy={0} r={mandalaRadius * 1.5}
      fill={`hsla(${baseHue}, 100%, 75%, ${mandalaAlpha * 0.4})`}
      style={{ filter: `blur(${5 + energy * 8}px)` }}
    />,
  );

  // Mandala petals — rotating spokes
  const petalRotation = frame * 0.6 * speedMult;
  for (let i = 0; i < NUM_MANDALA_PETALS; i++) {
    const angle = (i / NUM_MANDALA_PETALS) * Math.PI * 2 + (petalRotation * Math.PI) / 180;
    const petalLength = mandalaRadius * (0.8 + beatDecay * 0.5);
    const px = Math.cos(angle) * petalLength;
    const py = Math.sin(angle) * petalLength;
    const petalHue = (baseHue + i * 30) % 360;

    mandalaElements.push(
      <line key={`petal-${i}`}
        x1={0} y1={0} x2={px} y2={py}
        stroke={`hsla(${petalHue}, 90%, 70%, ${mandalaAlpha * 0.6})`}
        strokeWidth={1.5 + beatDecay * 1.5}
        strokeLinecap="round"
      />,
    );
  }

  // Hot center point
  mandalaElements.push(
    <circle key="center-core"
      cx={0} cy={0} r={3 + beatDecay * 4}
      fill={`hsla(${baseHue}, 100%, 90%, ${0.5 + beatDecay * 0.4})`}
    />,
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          mixBlendMode: "screen",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {ringElements}
          {mandalaElements}
        </g>
      </svg>
    </div>
  );
};
