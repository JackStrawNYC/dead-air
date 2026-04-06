/**
 * LaserShow — Concert laser beams from the top of the frame.
 *
 * 10-12 laser beams originating from the top (rigging position), each rendered
 * with a 3-layer approach: thin bright core + medium glow + wide soft bloom.
 * Beams scan sinusoidally at different frequencies/phases. 5 laser colors
 * (green, red, blue, amber, white) matching real laser rigs. Beam endpoints
 * hit the "floor" with bright impact dots. Beams crossing create bright
 * intersection flares. Fan patterns (3-4 beams from same origin) and parallel
 * sweeps (2-3 beams together). 2-3 horizontal atmospheric haze bands. Beams
 * widen slightly in the middle section (smoke visibility). At high energy:
 * faster sweeps, more beams. At peaks: brief strobe flash.
 *
 * Appears every 40s for 12s when energy > 0.10.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BeamDef {
  /** Origin X as fraction of width (0-1) */
  originFrac: number;
  /** Base angle offset from vertical (radians, 0 = straight down) */
  baseAngle: number;
  /** Sweep frequency (radians per frame) */
  sweepFreq: number;
  /** Sweep amplitude (radians) */
  sweepAmp: number;
  /** Phase offset */
  sweepPhase: number;
  /** Index into LASER_COLORS */
  colorIdx: number;
  /** Base core stroke width */
  coreWidth: number;
  /** Base brightness 0-1 */
  brightness: number;
  /** Group: "fan-L" | "fan-R" | "parallel" | "solo" — determines sweep coupling */
  group: string;
}

interface LaserColor {
  core: string;
  glow: string;
  bloom: string;
  /** Color for impact dots and intersection flares */
  flare: string;
}

/* ------------------------------------------------------------------ */
/*  Laser color palette — 5 colors like real laser rigs               */
/* ------------------------------------------------------------------ */

const LASER_COLORS: LaserColor[] = [
  {
    core: "rgba(0,255,60,1)",
    glow: "rgba(0,255,60,0.45)",
    bloom: "rgba(0,255,60,0.12)",
    flare: "rgba(180,255,200,0.9)",
  },
  {
    core: "rgba(255,25,25,1)",
    glow: "rgba(255,25,25,0.4)",
    bloom: "rgba(255,25,25,0.1)",
    flare: "rgba(255,180,160,0.9)",
  },
  {
    core: "rgba(50,140,255,1)",
    glow: "rgba(50,140,255,0.4)",
    bloom: "rgba(50,140,255,0.1)",
    flare: "rgba(180,210,255,0.9)",
  },
  {
    core: "rgba(255,180,30,1)",
    glow: "rgba(255,180,30,0.35)",
    bloom: "rgba(255,180,30,0.09)",
    flare: "rgba(255,230,160,0.9)",
  },
  {
    core: "rgba(255,255,255,1)",
    glow: "rgba(255,255,255,0.35)",
    bloom: "rgba(255,255,255,0.08)",
    flare: "rgba(255,255,255,0.95)",
  },
];

const NUM_BEAMS = 12;

/* ------------------------------------------------------------------ */
/*  Beam generation — deterministic from seed                          */
/* ------------------------------------------------------------------ */

function generateBeams(seed: number): BeamDef[] {
  const rng = seeded(seed + 7777);
  const beams: BeamDef[] = [];

  // Fan-Left group: 3 beams from ~25% x, spreading outward
  const fanLOrigin = 0.22 + rng() * 0.06;
  for (let i = 0; i < 3; i++) {
    beams.push({
      originFrac: fanLOrigin + (rng() - 0.5) * 0.02,
      baseAngle: -0.3 + i * 0.25,
      sweepFreq: 0.018 + rng() * 0.012,
      sweepAmp: 0.08 + rng() * 0.12,
      sweepPhase: rng() * Math.PI * 2,
      colorIdx: i % 3, // green, red, blue
      coreWidth: 1.0 + rng() * 0.5,
      brightness: 0.75 + rng() * 0.25,
      group: "fan-L",
    });
  }

  // Fan-Right group: 3 beams from ~75% x, spreading outward
  const fanROrigin = 0.72 + rng() * 0.06;
  for (let i = 0; i < 3; i++) {
    beams.push({
      originFrac: fanROrigin + (rng() - 0.5) * 0.02,
      baseAngle: -0.3 + i * 0.25,
      sweepFreq: 0.02 + rng() * 0.015,
      sweepAmp: 0.1 + rng() * 0.15,
      sweepPhase: rng() * Math.PI * 2,
      colorIdx: (i + 2) % 5, // blue, amber, white
      coreWidth: 1.0 + rng() * 0.5,
      brightness: 0.7 + rng() * 0.3,
      group: "fan-R",
    });
  }

  // Parallel sweep group: 3 beams from center, sweeping together
  for (let i = 0; i < 3; i++) {
    const sharedFreq = 0.025 + rng() * 0.01;
    const sharedPhase = rng() * Math.PI * 2;
    beams.push({
      originFrac: 0.42 + i * 0.08,
      baseAngle: -0.05 + i * 0.05,
      sweepFreq: sharedFreq,
      sweepAmp: 0.35 + rng() * 0.15,
      sweepPhase: sharedPhase + i * 0.15,
      colorIdx: [0, 3, 4][i], // green, amber, white
      coreWidth: 0.8 + rng() * 0.6,
      brightness: 0.65 + rng() * 0.35,
      group: "parallel",
    });
  }

  // Solo beams: 3 independent beams placed across the top
  for (let i = 0; i < 3; i++) {
    beams.push({
      originFrac: 0.15 + rng() * 0.7,
      baseAngle: (rng() - 0.5) * 0.6,
      sweepFreq: 0.015 + rng() * 0.03,
      sweepAmp: 0.2 + rng() * 0.4,
      sweepPhase: rng() * Math.PI * 2,
      colorIdx: Math.floor(rng() * 5),
      coreWidth: 0.9 + rng() * 0.7,
      brightness: 0.6 + rng() * 0.4,
      group: "solo",
    });
  }

  return beams;
}

/* ------------------------------------------------------------------ */
/*  Haze band definitions                                              */
/* ------------------------------------------------------------------ */

interface HazeBand {
  yFrac: number; // vertical position as fraction of height
  widthFrac: number; // thickness as fraction of height
  drift: number; // horizontal drift speed
  opacity: number;
}

function generateHaze(seed: number): HazeBand[] {
  const rng = seeded(seed + 3333);
  return [
    { yFrac: 0.3 + rng() * 0.1, widthFrac: 0.08 + rng() * 0.04, drift: 0.3 + rng() * 0.2, opacity: 0.12 },
    { yFrac: 0.5 + rng() * 0.1, widthFrac: 0.06 + rng() * 0.04, drift: -(0.2 + rng() * 0.3), opacity: 0.09 },
    { yFrac: 0.7 + rng() * 0.08, widthFrac: 0.05 + rng() * 0.03, drift: 0.15 + rng() * 0.15, opacity: 0.07 },
  ];
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

/** Compute beam endpoint — beam goes from origin (top) downward. */
function beamEndpoint(
  originX: number,
  originY: number,
  angle: number,
  length: number,
): { x: number; y: number } {
  return {
    x: originX + Math.sin(angle) * length,
    y: originY + Math.cos(angle) * length,
  };
}

/** Line-line intersection (returns null if parallel or out of segment). */
function lineIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): { x: number; y: number } | null {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 0.001) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  if (t < 0.05 || t > 0.95 || u < 0.05 || u > 0.95) return null;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

/* ------------------------------------------------------------------ */
/*  Timing constants                                                    */
/* ------------------------------------------------------------------ */

const CYCLE_PERIOD = 1200; // every 40s at 30fps
const SHOW_DURATION = 360; // 12s
const FADE_FRAMES = 45;

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const LaserShow: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const audio = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const {
    energy,
    beatDecay,
    onsetEnvelope,
    chromaHue,
    bass,
    highs,
    fastEnergy,
  } = audio;

  // Seed from show context or fallback
  const beams = React.useMemo(() => generateBeams(19770508), []);
  const hazeBands = React.useMemo(() => generateHaze(19770508), []);

  /* ---- Cycle timing ---- */
  const cyclePos = frame % CYCLE_PERIOD;
  const inShowWindow = cyclePos < SHOW_DURATION;
  const energyGate = energy > 0.10 ? 1 : 0;

  const showFadeIn = interpolate(cyclePos, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const showFadeOut = interpolate(
    cyclePos,
    [SHOW_DURATION - FADE_FRAMES, SHOW_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) },
  );
  const showEnvelope = Math.min(showFadeIn, showFadeOut);
  const masterOpacity = inShowWindow ? showEnvelope * energyGate : 0;

  if (masterOpacity < 0.01) return null;

  /* ---- Audio-derived parameters ---- */

  // Sweep speed: energy + tempo drive scanning speed
  const sweepSpeed = interpolate(energy, [0.1, 0.5], [0.5, 2.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * tempoFactor;

  // Visible beam count: more beams at higher energy
  const visibleCount = Math.max(
    4,
    Math.round(interpolate(energy, [0.1, 0.4], [4, NUM_BEAMS], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })),
  );

  // Strobe flash: triggered by beatDecay peaks at high energy
  const strobeActive = energy > 0.35 && beatDecay > 0.7;
  const strobeFlash = strobeActive
    ? 0.3 + beatDecay * 0.7
    : 0;

  // Onset brightness boost
  const onsetBoost = 1 + onsetEnvelope * 0.6;

  // Color palette hue shift from chromaHue (0-360)
  const hueShift = chromaHue / 360;

  // Beam length: from top origin to past bottom
  const beamLength = height * 1.25;
  const originY = -10; // just above frame

  /* ---- Compute beam positions this frame ---- */

  interface ComputedBeam {
    ox: number;
    oy: number;
    ex: number;
    ey: number;
    color: LaserColor;
    coreWidth: number;
    alpha: number;
    /** Beam widens in the middle (haze effect) */
    midWidenFactor: number;
  }

  const computed: ComputedBeam[] = [];

  for (let i = 0; i < visibleCount && i < beams.length; i++) {
    const b = beams[i];

    // Sweep angle
    const sweepT = frame * b.sweepFreq * sweepSpeed;
    const angle =
      b.baseAngle +
      Math.sin(sweepT + b.sweepPhase) * b.sweepAmp +
      Math.sin(sweepT * 0.37 + b.sweepPhase * 1.7) * b.sweepAmp * 0.3; // secondary harmonic

    const ox = b.originFrac * width;
    const oy = originY;
    const end = beamEndpoint(ox, oy, angle, beamLength);

    // Flicker: subtle per-beam variation
    const flicker = 0.85 + Math.sin(frame * 0.18 + i * 3.1) * 0.15;

    // Hue-shifted color index
    const shiftedIdx = (b.colorIdx + Math.floor(hueShift * 5)) % 5;
    const color = LASER_COLORS[shiftedIdx];

    // Brightness: base * flicker * onset boost
    const alpha = Math.min(1, b.brightness * flicker * onsetBoost);

    // Beam widens in the middle third (visible in haze)
    const midWidenFactor = 1 + energy * 0.8;

    computed.push({
      ox,
      oy,
      ex: end.x,
      ey: end.y,
      color,
      coreWidth: b.coreWidth,
      alpha,
      midWidenFactor,
    });
  }

  /* ---- Find beam intersections ---- */
  interface Intersection {
    x: number;
    y: number;
    color1: LaserColor;
    color2: LaserColor;
  }

  const intersections: Intersection[] = [];
  for (let i = 0; i < computed.length; i++) {
    for (let j = i + 1; j < computed.length; j++) {
      const a = computed[i];
      const b = computed[j];
      const pt = lineIntersect(a.ox, a.oy, a.ex, a.ey, b.ox, b.oy, b.ex, b.ey);
      if (pt && pt.x > -50 && pt.x < width + 50 && pt.y > -50 && pt.y < height + 50) {
        intersections.push({ x: pt.x, y: pt.y, color1: a.color, color2: b.color });
      }
    }
  }
  // Limit to 8 most visible intersections (avoid clutter)
  const visibleIntersections = intersections.slice(0, 8);

  /* ---- Impact dots where beams hit the floor ---- */
  interface ImpactDot {
    x: number;
    y: number;
    color: LaserColor;
    intensity: number;
  }

  const impacts: ImpactDot[] = [];
  for (const beam of computed) {
    // Clip beam to bottom of frame
    if (beam.ey >= height * 0.85) {
      // Interpolate to find floor hit point
      const t = (height - beam.oy) / (beam.ey - beam.oy);
      const hitX = beam.ox + t * (beam.ex - beam.ox);
      if (hitX > -20 && hitX < width + 20) {
        impacts.push({
          x: hitX,
          y: height,
          color: beam.color,
          intensity: beam.alpha * 0.8,
        });
      }
    }
  }

  /* ---- SVG filter IDs ---- */
  const filterId = `laser-glow-${frame % 100}`;
  const hazeFilterId = `haze-blur-${frame % 100}`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          {/* Glow filter for beam bloom layer */}
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <filter id={hazeFilterId} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="20" />
          </filter>

          {/* Radial gradient for impact dots */}
          {computed.map((beam, i) => (
            <radialGradient key={`impact-grad-${i}`} id={`impact-${i}`}>
              <stop offset="0%" stopColor={beam.color.flare} stopOpacity={0.9} />
              <stop offset="40%" stopColor={beam.color.glow} stopOpacity={0.4} />
              <stop offset="100%" stopColor={beam.color.bloom} stopOpacity={0} />
            </radialGradient>
          ))}

          {/* Radial gradient for intersection flares */}
          {visibleIntersections.map((ix, i) => (
            <radialGradient key={`ix-grad-${i}`} id={`ix-${i}`}>
              <stop offset="0%" stopColor="rgba(255,255,255,0.95)" stopOpacity={1} />
              <stop offset="30%" stopColor={ix.color1.flare} stopOpacity={0.6} />
              <stop offset="100%" stopColor={ix.color2.bloom} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>

        {/* ---- Strobe flash overlay ---- */}
        {strobeFlash > 0.05 && (
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="white"
            opacity={strobeFlash * 0.15}
          />
        )}

        {/* ---- Atmospheric haze bands ---- */}
        {hazeBands.map((band, i) => {
          const bandY = band.yFrac * height;
          const bandH = band.widthFrac * height;
          const driftX = Math.sin(frame * 0.005 * band.drift + i * 2) * width * 0.08;
          const hazeOpacity = band.opacity * (0.7 + energy * 0.6);

          return (
            <rect
              key={`haze-${i}`}
              x={-width * 0.1 + driftX}
              y={bandY - bandH / 2}
              width={width * 1.2}
              height={bandH}
              rx={bandH / 2}
              fill="rgba(200,210,230,0.3)"
              opacity={hazeOpacity}
              filter={`url(#${hazeFilterId})`}
            />
          );
        })}

        {/* ---- Beam layers: bloom (widest, softest) ---- */}
        {computed.map((beam, i) => {
          // Beam widens in the middle: interpolate stroke width
          // We draw the bloom as a thick blurred line
          const bloomWidth = (beam.coreWidth * 12 + bass * 8) * beam.midWidenFactor;

          return (
            <line
              key={`bloom-${i}`}
              x1={beam.ox}
              y1={beam.oy}
              x2={beam.ex}
              y2={beam.ey}
              stroke={beam.color.bloom}
              strokeWidth={bloomWidth}
              strokeLinecap="round"
              opacity={beam.alpha * 0.3}
              filter={`url(#${filterId})`}
            />
          );
        })}

        {/* ---- Beam layers: glow (medium width) ---- */}
        {computed.map((beam, i) => {
          const glowWidth = beam.coreWidth * 4 + highs * 3;

          return (
            <line
              key={`glow-${i}`}
              x1={beam.ox}
              y1={beam.oy}
              x2={beam.ex}
              y2={beam.ey}
              stroke={beam.color.glow}
              strokeWidth={glowWidth}
              strokeLinecap="round"
              opacity={beam.alpha * 0.55}
            />
          );
        })}

        {/* ---- Beam layers: core (thin, bright) ---- */}
        {computed.map((beam, i) => (
          <line
            key={`core-${i}`}
            x1={beam.ox}
            y1={beam.oy}
            x2={beam.ex}
            y2={beam.ey}
            stroke={beam.color.core}
            strokeWidth={beam.coreWidth}
            strokeLinecap="round"
            opacity={beam.alpha * 0.95}
          />
        ))}

        {/* ---- Beam haze widening in middle section ---- */}
        {computed.map((beam, i) => {
          // A shorter, wider segment in the middle third of the beam
          const t1 = 0.3;
          const t2 = 0.7;
          const mx1 = beam.ox + t1 * (beam.ex - beam.ox);
          const my1 = beam.oy + t1 * (beam.ey - beam.oy);
          const mx2 = beam.ox + t2 * (beam.ex - beam.ox);
          const my2 = beam.oy + t2 * (beam.ey - beam.oy);
          const hazeWidth = beam.coreWidth * 6 * beam.midWidenFactor;

          return (
            <line
              key={`haze-beam-${i}`}
              x1={mx1}
              y1={my1}
              x2={mx2}
              y2={my2}
              stroke={beam.color.glow}
              strokeWidth={hazeWidth}
              strokeLinecap="round"
              opacity={beam.alpha * 0.15}
              filter={`url(#${filterId})`}
            />
          );
        })}

        {/* ---- Impact dots on the floor ---- */}
        {impacts.map((dot, i) => {
          const pulseR = 10 + fastEnergy * 15 + Math.sin(frame * 0.12 + i * 1.5) * 3;

          return (
            <g key={`impact-${i}`}>
              {/* Outer bloom */}
              <ellipse
                cx={dot.x}
                cy={dot.y}
                rx={pulseR * 2.5}
                ry={pulseR * 0.6}
                fill={dot.color.bloom}
                opacity={dot.intensity * 0.3}
                filter={`url(#${filterId})`}
              />
              {/* Mid glow */}
              <ellipse
                cx={dot.x}
                cy={dot.y}
                rx={pulseR * 1.2}
                ry={pulseR * 0.35}
                fill={dot.color.glow}
                opacity={dot.intensity * 0.5}
              />
              {/* Bright core */}
              <ellipse
                cx={dot.x}
                cy={dot.y}
                rx={pulseR * 0.4}
                ry={pulseR * 0.15}
                fill={dot.color.flare}
                opacity={dot.intensity * 0.8}
              />
            </g>
          );
        })}

        {/* ---- Intersection flares ---- */}
        {visibleIntersections.map((ix, i) => {
          const flareR = 6 + beatDecay * 12;
          const flareAlpha = 0.4 + beatDecay * 0.4;

          return (
            <g key={`ix-${i}`}>
              {/* Outer bloom */}
              <circle
                cx={ix.x}
                cy={ix.y}
                r={flareR * 2.5}
                fill={`url(#ix-${i})`}
                opacity={flareAlpha * 0.25}
                filter={`url(#${filterId})`}
              />
              {/* Bright center */}
              <circle
                cx={ix.x}
                cy={ix.y}
                r={flareR * 0.5}
                fill="white"
                opacity={flareAlpha * 0.7}
              />
              {/* Cross-hair lines (small starburst) */}
              <line
                x1={ix.x - flareR}
                y1={ix.y}
                x2={ix.x + flareR}
                y2={ix.y}
                stroke="rgba(255,255,255,0.6)"
                strokeWidth={0.8}
                opacity={flareAlpha * 0.5}
              />
              <line
                x1={ix.x}
                y1={ix.y - flareR}
                x2={ix.x}
                y2={ix.y + flareR}
                stroke="rgba(255,255,255,0.6)"
                strokeWidth={0.8}
                opacity={flareAlpha * 0.5}
              />
            </g>
          );
        })}

        {/* ---- Origin glow points (laser emitter housings) ---- */}
        {computed.map((beam, i) => {
          const emitterR = 3 + onsetEnvelope * 4;

          return (
            <circle
              key={`emitter-${i}`}
              cx={beam.ox}
              cy={Math.max(0, beam.oy)}
              r={emitterR}
              fill={beam.color.flare}
              opacity={beam.alpha * 0.6}
              filter={`url(#${filterId})`}
            />
          );
        })}
      </svg>
    </div>
  );
};
