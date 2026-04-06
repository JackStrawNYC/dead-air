/**
 * StageLights — A+++ par can stage lights mounted on a truss rig.
 *
 * 8 par cans on a detailed truss bar with cross-braces.
 * Each par can: cylindrical housing with lens detail, barn door flap suggestion.
 * Light cone: 3-layer trapezoid (outer atmospheric haze, main body gradient,
 * inner hot core). Beams create pools on floor. Atmospheric haze crossing
 * through beams. Individual flicker per par can.
 *
 * Audio mapping:
 *   energy      → beam intensity gate + cone opacity
 *   chromaHue   → per-can color palette (offset per can)
 *   beatDecay   → flicker intensity + cone pulse
 *   bass        → cone width expansion
 *   highs       → lens flare brightness
 *   tempoFactor → flicker frequency
 *   slowEnergy  → atmospheric haze density
 *   centroid    → hot-core brightness
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Par can data                                                       */
/* ------------------------------------------------------------------ */

interface ParCanData {
  /** x position as fraction of width */
  x: number;
  /** Base hue offset (0-360) */
  baseHue: number;
  /** Cone spread angle (degrees) */
  coneSpread: number;
  /** Flicker frequency */
  flickerFreq: number;
  /** Flicker phase */
  flickerPhase: number;
  /** Intensity multiplier */
  intensityMult: number;
  /** Secondary flicker (slower, for drift) */
  driftFreq: number;
  driftPhase: number;
  /** Barn door tilt offset (degrees) */
  barnDoorTilt: number;
}

const NUM_PARS = 8;

function generatePars(seed: number): ParCanData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_PARS }, (_, i) => ({
    x: 0.07 + (i / (NUM_PARS - 1)) * 0.86,
    baseHue: (i * 45 + rng() * 20 - 10),
    coneSpread: 16 + rng() * 12,
    flickerFreq: 0.04 + rng() * 0.06,
    flickerPhase: rng() * Math.PI * 2,
    intensityMult: 0.75 + rng() * 0.25,
    driftFreq: 0.008 + rng() * 0.012,
    driftPhase: rng() * Math.PI * 2,
    barnDoorTilt: rng() * 4 - 2,
  }));
}

/* ------------------------------------------------------------------ */
/*  Haze particle data                                                 */
/* ------------------------------------------------------------------ */

interface HazeParticle {
  /** y position as fraction of height (0.1-0.7) */
  y: number;
  /** x drift speed */
  speed: number;
  /** x start offset */
  xOffset: number;
  /** thickness */
  thickness: number;
  /** base opacity */
  baseAlpha: number;
}

const NUM_HAZE = 6;

function generateHaze(seed: number): HazeParticle[] {
  const rng = seeded(seed + 999);
  return Array.from({ length: NUM_HAZE }, () => ({
    y: 0.12 + rng() * 0.55,
    speed: 0.15 + rng() * 0.35,
    xOffset: rng() * 1000,
    thickness: 15 + rng() * 35,
    baseAlpha: 0.02 + rng() * 0.04,
  }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const StageLights: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, chromaHue, beatDecay, bass, highs, slowEnergy, centroid } = snap;

  const pars = React.useMemo(() => generatePars(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);
  const hazeParticles = React.useMemo(() => generateHaze(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  /* --- energy gate --- */
  if (energy <= 0.08) return null;

  const beamIntensity = interpolate(energy, [0.08, 0.45], [0.2, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* --- bass-driven cone width expansion --- */
  const coneWidthMult = 1 + interpolate(bass, [0.05, 0.4], [0, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* --- rig position --- */
  const rigY = 28;
  const rigThickness = 10;

  /* --- truss constants --- */
  const trussTop = rigY - rigThickness / 2;
  const trussBot = rigY + rigThickness / 2;
  const trussColor = "rgba(25, 25, 30, 0.85)";
  const trussBraceColor = "rgba(45, 45, 55, 0.6)";

  /* --- floor Y for beam pools --- */
  const floorY = height - 20;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}>
        <defs>
          {/* Per-par-can gradients for main cone body */}
          {pars.map((par, i) => {
            const hue = (chromaHue + par.baseHue + frame * 0.25 * tempoFactor) % 360;
            return (
              <React.Fragment key={`defs-${i}`}>
                {/* Main cone gradient — vertical linear */}
                <linearGradient id={`cone-main-${i}`} x1="0.5" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor={`hsla(${hue}, 92%, 72%, 0.65)`} />
                  <stop offset="30%" stopColor={`hsla(${hue}, 88%, 58%, 0.35)`} />
                  <stop offset="70%" stopColor={`hsla(${hue}, 82%, 45%, 0.12)`} />
                  <stop offset="100%" stopColor={`hsla(${hue}, 75%, 35%, 0.02)`} />
                </linearGradient>
                {/* Hot core gradient */}
                <linearGradient id={`cone-core-${i}`} x1="0.5" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor={`hsla(${hue}, 100%, 90%, 0.8)`} />
                  <stop offset="20%" stopColor={`hsla(${hue}, 95%, 80%, 0.4)`} />
                  <stop offset="60%" stopColor={`hsla(${hue}, 90%, 65%, 0.08)`} />
                  <stop offset="100%" stopColor={`hsla(${hue}, 80%, 50%, 0)`} />
                </linearGradient>
                {/* Floor pool radial */}
                <radialGradient id={`pool-${i}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={`hsla(${hue}, 80%, 60%, 0.25)`} />
                  <stop offset="60%" stopColor={`hsla(${hue}, 75%, 45%, 0.08)`} />
                  <stop offset="100%" stopColor={`hsla(${hue}, 70%, 35%, 0)`} />
                </radialGradient>
              </React.Fragment>
            );
          })}
          {/* Atmospheric haze gradient */}
          <linearGradient id="haze-grad" x1="0" y1="0.5" x2="1" y2="0.5">
            <stop offset="0%" stopColor="rgba(180, 180, 200, 0)" />
            <stop offset="20%" stopColor="rgba(180, 180, 200, 1)" />
            <stop offset="80%" stopColor="rgba(180, 180, 200, 1)" />
            <stop offset="100%" stopColor="rgba(180, 180, 200, 0)" />
          </linearGradient>
        </defs>

        {/* ============================================================ */}
        {/*  LIGHT CONES — rendered behind truss                         */}
        {/* ============================================================ */}
        {pars.map((par, i) => {
          const px = par.x * width;
          const hue = (chromaHue + par.baseHue + frame * 0.25 * tempoFactor) % 360;

          // Individual flicker: fast beat pulse + slow drift
          const fastFlicker = Math.sin(frame * par.flickerFreq * tempoFactor + par.flickerPhase) * 0.12;
          const slowDrift = Math.sin(frame * par.driftFreq * tempoFactor + par.driftPhase) * 0.06;
          const flicker = 0.6 + beatDecay * 0.4 + fastFlicker + slowDrift;
          const alpha = Math.min(1, beamIntensity * par.intensityMult * flicker);

          // Cone geometry with bass width expansion
          const coneHalfAngle = ((par.coneSpread * coneWidthMult) * Math.PI) / 180;
          const barnTiltRad = (par.barnDoorTilt * Math.PI) / 180;
          const coneHeight = floorY - (trussBot + 8);
          const halfWidth = Math.tan(coneHalfAngle) * coneHeight;

          // Slight tilt from barn door
          const tiltOffset = Math.sin(barnTiltRad) * coneHeight * 0.3;
          const topWidth = 7; // narrow at fixture

          const leftBot = px - halfWidth + tiltOffset;
          const rightBot = px + halfWidth + tiltOffset;

          if (alpha < 0.02) return null;

          return (
            <g key={`cone-${i}`} style={{ mixBlendMode: "screen" }}>
              {/* Layer 1: outer atmospheric cone (widest, softest) */}
              <polygon
                points={`${px - topWidth * 1.5},${trussBot + 8} ${px + topWidth * 1.5},${trussBot + 8} ${rightBot + 20},${floorY} ${leftBot - 20},${floorY}`}
                fill={`hsla(${hue}, 60%, 55%, ${alpha * 0.06})`}
                style={{ filter: `blur(${8 + slowEnergy * 10}px)` }}
              />

              {/* Layer 2: main body cone */}
              <polygon
                points={`${px - topWidth},${trussBot + 8} ${px + topWidth},${trussBot + 8} ${rightBot},${floorY} ${leftBot},${floorY}`}
                fill={`url(#cone-main-${i})`}
                opacity={alpha}
              />

              {/* Layer 3: inner hot core (narrow) */}
              <polygon
                points={`${px - topWidth * 0.5},${trussBot + 8} ${px + topWidth * 0.5},${trussBot + 8} ${px + halfWidth * 0.3 + tiltOffset},${floorY} ${px - halfWidth * 0.3 + tiltOffset},${floorY}`}
                fill={`url(#cone-core-${i})`}
                opacity={alpha * (0.5 + centroid * 0.5)}
              />

              {/* Floor pool */}
              <ellipse
                cx={px + tiltOffset}
                cy={floorY}
                rx={halfWidth * 0.8}
                ry={18 + bass * 12}
                fill={`url(#pool-${i})`}
                opacity={alpha * 0.7}
              />
            </g>
          );
        })}

        {/* ============================================================ */}
        {/*  ATMOSPHERIC HAZE — drifting wisps crossing beams            */}
        {/* ============================================================ */}
        {hazeParticles.map((hz, i) => {
          const hazeAlpha = hz.baseAlpha * (0.5 + slowEnergy * 1.5);
          if (hazeAlpha < 0.005) return null;

          const xPos = ((frame * hz.speed + hz.xOffset) % (width + 200)) - 100;
          const yPos = hz.y * height;
          // Sine wobble on y
          const yWobble = Math.sin(frame * 0.015 + hz.xOffset) * 12;

          return (
            <rect key={`haze-${i}`}
              x={xPos - 200}
              y={yPos + yWobble - hz.thickness / 2}
              width={400}
              height={hz.thickness}
              fill="url(#haze-grad)"
              opacity={hazeAlpha}
              style={{ filter: `blur(${8 + hz.thickness * 0.3}px)` }}
              rx={hz.thickness / 2}
            />
          );
        })}

        {/* ============================================================ */}
        {/*  TRUSS RIG — structural detail                               */}
        {/* ============================================================ */}
        {/* Main horizontal bars (top and bottom of truss) */}
        <rect x={0} y={trussTop} width={width} height={3} fill={trussColor} rx={1} />
        <rect x={0} y={trussBot - 3} width={width} height={3} fill={trussColor} rx={1} />

        {/* Cross-braces — diagonal X pattern between verticals */}
        {Array.from({ length: 17 }, (_, i) => {
          const x1 = (i / 17) * width;
          const x2 = ((i + 1) / 17) * width;
          const midX = (x1 + x2) / 2;
          return (
            <g key={`brace-${i}`}>
              {/* Vertical */}
              <line x1={x1} y1={trussTop} x2={x1} y2={trussBot}
                stroke={trussBraceColor} strokeWidth={1.5} />
              {/* Diagonal cross */}
              <line x1={x1} y1={trussTop + 1} x2={midX} y2={trussBot - 1}
                stroke={trussBraceColor} strokeWidth={0.8} />
              <line x1={midX} y1={trussTop + 1} x2={x1} y2={trussBot - 1}
                stroke={trussBraceColor} strokeWidth={0.8} />
            </g>
          );
        })}

        {/* ============================================================ */}
        {/*  PAR CAN HOUSINGS — cylindrical with lens detail             */}
        {/* ============================================================ */}
        {pars.map((par, i) => {
          const px = par.x * width;
          const hue = (chromaHue + par.baseHue + frame * 0.25 * tempoFactor) % 360;

          // Per-can flicker for housing glow
          const fastFlicker = Math.sin(frame * par.flickerFreq * tempoFactor + par.flickerPhase) * 0.12;
          const alpha = Math.min(1, beamIntensity * par.intensityMult * (0.6 + beatDecay * 0.4 + fastFlicker));

          const housingW = 20;
          const housingH = 14;

          return (
            <g key={`housing-${i}`}>
              {/* Mounting bracket — connects to truss */}
              <rect
                x={px - 2} y={trussBot}
                width={4} height={6}
                fill="rgba(40, 40, 50, 0.9)"
                rx={1}
              />

              {/* Cylindrical housing body */}
              <rect
                x={px - housingW / 2}
                y={trussBot + 5}
                width={housingW}
                height={housingH}
                fill="rgba(20, 20, 28, 0.95)"
                stroke="rgba(50, 50, 65, 0.6)"
                strokeWidth={1}
                rx={3}
              />

              {/* Barn door flap suggestion — thin lines at bottom edges */}
              <line
                x1={px - housingW / 2 + 2} y1={trussBot + 5 + housingH}
                x2={px - housingW / 2 - 1} y2={trussBot + 5 + housingH + 4}
                stroke="rgba(35, 35, 45, 0.7)" strokeWidth={1.5} strokeLinecap="round"
              />
              <line
                x1={px + housingW / 2 - 2} y1={trussBot + 5 + housingH}
                x2={px + housingW / 2 + 1} y2={trussBot + 5 + housingH + 4}
                stroke="rgba(35, 35, 45, 0.7)" strokeWidth={1.5} strokeLinecap="round"
              />

              {/* Lens ring — circular detail at bottom of housing */}
              <ellipse
                cx={px}
                cy={trussBot + 5 + housingH}
                rx={housingW / 2 - 2}
                ry={3}
                fill="rgba(15, 15, 20, 0.9)"
                stroke={`hsla(${hue}, 50%, 40%, 0.4)`}
                strokeWidth={1}
              />

              {/* Lens glow — illuminated aperture */}
              <ellipse
                cx={px}
                cy={trussBot + 5 + housingH + 1}
                rx={5 + alpha * 2}
                ry={2.5 + alpha}
                fill={`hsla(${hue}, 90%, 80%, ${alpha * 0.85})`}
                style={{ filter: `blur(${2 + beatDecay * 2}px)` }}
              />

              {/* Lens flare — highs-driven star burst */}
              {highs > 0.15 && alpha > 0.3 && (
                <>
                  <line
                    x1={px - 8 - highs * 10} y1={trussBot + 5 + housingH + 1}
                    x2={px + 8 + highs * 10} y2={trussBot + 5 + housingH + 1}
                    stroke={`hsla(${hue}, 100%, 90%, ${highs * 0.5 * alpha})`}
                    strokeWidth={0.8}
                    strokeLinecap="round"
                  />
                  <line
                    x1={px} y1={trussBot + 5 + housingH + 1 - 5 - highs * 6}
                    x2={px} y2={trussBot + 5 + housingH + 1 + 5 + highs * 6}
                    stroke={`hsla(${hue}, 100%, 90%, ${highs * 0.35 * alpha})`}
                    strokeWidth={0.6}
                    strokeLinecap="round"
                  />
                </>
              )}

              {/* Housing highlight — rim light suggestion */}
              <rect
                x={px - housingW / 2 + 1}
                y={trussBot + 6}
                width={housingW - 2}
                height={2}
                fill="rgba(70, 70, 85, 0.25)"
                rx={1}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
