/**
 * BirdInFlight — A single elegant bird soaring across a golden-hour sky.
 *
 * For "Bird Song" — Robert Hunter's lyric written for Janis Joplin after her
 * death in 1970. "All I know is something like a bird within her sang."
 *
 * A solitary swallow traces a curved arc across the frame. Wings flap in tempo,
 * body bobs with each beat. Behind it, ghost copies fade out — the bird's spirit
 * trail. Glowing dust drifts in its wake. The sky is warm with golden hour light,
 * a few wisp clouds, the first stars appearing. Tiny musical glyphs float along
 * the trail. This is Janis's soul rising — tender, soaring, free.
 *
 * Audio: vocalPresence → bird visibility (sings when there's vocal),
 *        beatDecay → wing flap pulse, slowEnergy → flight altitude/arc,
 *        chromaHue → trail + sky tint, musicalTime → wing flap phase,
 *        energy → glow intensity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CYCLE = 1500; // 50s at 30fps
const DURATION = 600; // 20s of visible flight per cycle

const NUM_TRAIL_GHOSTS = 4;
const NUM_DUST_PARTICLES = 38;
const NUM_NOTE_GLYPHS = 7;
const NUM_CLOUDS = 3;
const NUM_STARS = 14;

/* ------------------------------------------------------------------ */
/*  Generators                                                         */
/* ------------------------------------------------------------------ */

interface DustParticle {
  /** Phase offset along the trail 0-1 */
  phase: number;
  /** Lateral drift in pixels */
  drift: number;
  /** Drift frequency */
  driftFreq: number;
  /** Size in pixels */
  size: number;
  /** Brightness 0-1 */
  brightness: number;
  /** Lifetime variation */
  lifeMult: number;
}

interface NoteGlyph {
  /** Phase offset along trail 0-1 */
  phase: number;
  /** Vertical drift offset */
  driftY: number;
  /** Size scale */
  scale: number;
  /** Note shape: 0 = quarter, 1 = eighth, 2 = sixteenth */
  shape: number;
}

interface Cloud {
  /** Center x as fraction of width */
  x: number;
  /** Center y as fraction of height */
  y: number;
  /** Width scale */
  scale: number;
  /** Drift speed */
  speed: number;
  /** Opacity */
  opacity: number;
}

interface Star {
  /** X as fraction of width */
  x: number;
  /** Y as fraction of height */
  y: number;
  /** Twinkle phase */
  phase: number;
  /** Base brightness */
  brightness: number;
}

function pseudoRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function generateDust(seed: number): DustParticle[] {
  const rng = pseudoRandom(seed);
  return Array.from({ length: NUM_DUST_PARTICLES }, () => ({
    phase: rng(),
    drift: (rng() - 0.5) * 18,
    driftFreq: 0.012 + rng() * 0.025,
    size: 1.2 + rng() * 2.4,
    brightness: 0.4 + rng() * 0.6,
    lifeMult: 0.7 + rng() * 0.6,
  }));
}

function generateNotes(seed: number): NoteGlyph[] {
  const rng = pseudoRandom(seed + 4242);
  return Array.from({ length: NUM_NOTE_GLYPHS }, () => ({
    phase: rng(),
    driftY: (rng() - 0.5) * 14,
    scale: 0.7 + rng() * 0.6,
    shape: Math.floor(rng() * 3),
  }));
}

function generateClouds(seed: number): Cloud[] {
  const rng = pseudoRandom(seed + 8181);
  return Array.from({ length: NUM_CLOUDS }, (_, i) => ({
    x: 0.15 + i * 0.32 + (rng() - 0.5) * 0.1,
    y: 0.18 + rng() * 0.22,
    scale: 0.7 + rng() * 0.7,
    speed: 0.04 + rng() * 0.06,
    opacity: 0.35 + rng() * 0.25,
  }));
}

function generateStars(seed: number): Star[] {
  const rng = pseudoRandom(seed + 1337);
  return Array.from({ length: NUM_STARS }, () => ({
    x: rng(),
    y: rng() * 0.45,
    phase: rng() * Math.PI * 2,
    brightness: 0.4 + rng() * 0.6,
  }));
}

/* ------------------------------------------------------------------ */
/*  Bird flight path — bezier arc                                      */
/* ------------------------------------------------------------------ */

/**
 * Returns the bird's position and tangent angle along its arc.
 * The arc enters from the left, rises to a peak in the upper-middle,
 * and exits to the right with a slight descent.
 *
 * Speed varies — slower at the peak, faster on entry/exit.
 */
function birdArcPosition(
  t: number,
  width: number,
  height: number,
  altitude: number,
): { x: number; y: number; angle: number; speedFactor: number } {
  // Reshape t so the bird lingers near the peak (slower at apex)
  // Ease curve: t' = 0.5 * (1 - cos(pi * t)) creates slow-mid behavior reversed
  const tShaped = t < 0.5
    ? 2 * t * t
    : 1 - Math.pow(-2 * t + 2, 2) / 2;

  // Cubic Bezier: P0 = start, P1/P2 control points, P3 = end
  const p0x = -width * 0.18;
  const p0y = height * (0.55 - altitude * 0.1);
  const p1x = width * 0.25;
  const p1y = height * (0.18 - altitude * 0.12);
  const p2x = width * 0.7;
  const p2y = height * (0.2 - altitude * 0.10);
  const p3x = width * 1.18;
  const p3y = height * (0.42 - altitude * 0.05);

  const u = 1 - tShaped;
  const x =
    u * u * u * p0x +
    3 * u * u * tShaped * p1x +
    3 * u * tShaped * tShaped * p2x +
    tShaped * tShaped * tShaped * p3x;
  const y =
    u * u * u * p0y +
    3 * u * u * tShaped * p1y +
    3 * u * tShaped * tShaped * p2y +
    tShaped * tShaped * tShaped * p3y;

  // Tangent (derivative)
  const dx =
    3 * u * u * (p1x - p0x) +
    6 * u * tShaped * (p2x - p1x) +
    3 * tShaped * tShaped * (p3x - p2x);
  const dy =
    3 * u * u * (p1y - p0y) +
    6 * u * tShaped * (p2y - p1y) +
    3 * tShaped * tShaped * (p3y - p2y);
  const angle = Math.atan2(dy, dx);

  // Slow at the apex (around t=0.5), faster on the descent
  const speedFactor =
    0.55 + 0.45 * Math.abs(t - 0.5) * 2 + (t > 0.55 ? 0.18 : 0);

  return { x, y, angle, speedFactor };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const BirdInFlight: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const {
    energy,
    slowEnergy,
    vocalEnergy,
    vocalPresence,
    chromaHue,
    beatDecay,
    musicalTime,
  } = snap;

  const dust = React.useMemo(() => generateDust(7_19_70), []);
  const notes = React.useMemo(() => generateNotes(10_4_70), []);
  const clouds = React.useMemo(() => generateClouds(8_15_70), []);
  const stars = React.useMemo(() => generateStars(7_28_70), []);

  /* ---- Cycle / visibility ---- */
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const baseOpacity = interpolate(
    progress,
    [0, 0.06, 0.92, 1],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Vocal presence drives final visibility — bird sings when there's vocal
  const vocalGate = interpolate(vocalPresence, [0.05, 0.35], [0.45, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = baseOpacity * vocalGate;
  if (opacity < 0.01) return null;

  /* ---- Audio-driven parameters ---- */
  const altitude = interpolate(slowEnergy, [0.04, 0.28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowIntensity = 0.35 + energy * 0.85;
  const trailHue = chromaHue;
  // Sky tint shifts subtly with chromaHue, biased toward warm gold
  const skyHue = interpolate(chromaHue, [0, 360], [28, 48]);

  /* ---- Bird position along arc ---- */
  // Smooth t along progress; the bird traces the full arc once per cycle
  const arcT = progress;
  const { x: birdX, y: birdY, angle: tangentAngle, speedFactor } =
    birdArcPosition(arcT, width, height, altitude);

  // Body bob — pulses with beat
  const wingFlapPhase = musicalTime * Math.PI * 4 * tempoFactor;
  const wingAngle = Math.sin(wingFlapPhase) * 0.95 + beatDecay * 0.35;
  const bodyBob = Math.cos(wingFlapPhase * 0.5) * (3 + beatDecay * 4);

  /* ---- Color helpers ---- */
  const trailColor = (alpha: number) =>
    `hsla(${trailHue}, 75%, ${68 + glowIntensity * 12}%, ${alpha})`;
  const birdSilhouette = (alpha: number) =>
    `hsla(${(trailHue + 8) % 360}, 35%, ${22 + glowIntensity * 10}%, ${alpha})`;
  const skyColorTop = `hsla(${skyHue + 200}, 55%, 28%, 1)`;
  const skyColorMid = `hsla(${skyHue}, 70%, 62%, 1)`;
  const skyColorBottom = `hsla(${(skyHue + 12) % 360}, 80%, 76%, 1)`;
  const cloudColor = (a: number) =>
    `hsla(${(skyHue + 18) % 360}, 60%, 88%, ${a})`;

  /* ---- SVG gradient & filter IDs ---- */
  const skyGradId = `bird-sky-${frame % 10000}`;
  const glowFilterId = `bird-glow-${frame % 10000}`;
  const trailGradId = `bird-trail-${frame % 10000}`;

  /* ---- Bird SVG path generator ---- */
  // Each bird needs to be drawn at a position with a wing angle and rotation.
  const renderBird = (
    cx: number,
    cy: number,
    rotation: number,
    wingAngleLocal: number,
    scale: number,
    bodyAlpha: number,
    keyPrefix: string,
  ) => {
    // Bird measurements (in local pixels, then scaled)
    const bodyLen = 22 * scale;
    const bodyHeight = 7 * scale;
    const wingLen = 30 * scale;
    const tailLen = 14 * scale;

    // Wing flap: positive angle = up, negative = down
    // Upper wing rises, lower wing falls (mid-flap)
    const upperWingAngle = wingAngleLocal * 0.9;
    const lowerWingAngle = -wingAngleLocal * 0.7;

    // Wing tip positions in local space (rotated by wingAngle)
    const upperTipX = -bodyLen * 0.15 + Math.cos(upperWingAngle - Math.PI / 2) * wingLen;
    const upperTipY = Math.sin(upperWingAngle - Math.PI / 2) * wingLen;
    const lowerTipX = -bodyLen * 0.15 + Math.cos(lowerWingAngle + Math.PI / 2) * wingLen;
    const lowerTipY = Math.sin(lowerWingAngle + Math.PI / 2) * wingLen;

    // Primary feather lines (5 per wing)
    const upperFeathers: Array<{ x: number; y: number }> = [];
    const lowerFeathers: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 5; i++) {
      const t = (i + 1) / 6;
      const upperFx = -bodyLen * 0.15 + Math.cos(upperWingAngle - Math.PI / 2) * wingLen * t;
      const upperFy = Math.sin(upperWingAngle - Math.PI / 2) * wingLen * t;
      const lowerFx = -bodyLen * 0.15 + Math.cos(lowerWingAngle + Math.PI / 2) * wingLen * t;
      const lowerFy = Math.sin(lowerWingAngle + Math.PI / 2) * wingLen * t;
      upperFeathers.push({ x: upperFx, y: upperFy });
      lowerFeathers.push({ x: lowerFx, y: lowerFy });
    }

    // Tail feathers (5 spread)
    const tailFeathers: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 5; i++) {
      const spread = (i - 2) * 0.18;
      const tx = -bodyLen + Math.cos(Math.PI + spread) * tailLen;
      const ty = Math.sin(Math.PI + spread) * tailLen;
      tailFeathers.push({ x: tx, y: ty });
    }

    return (
      <g
        key={keyPrefix}
        transform={`translate(${cx}, ${cy}) rotate(${(rotation * 180) / Math.PI})`}
      >
        {/* Body — elongated ellipse */}
        <ellipse
          cx={0}
          cy={0}
          rx={bodyLen * 0.55}
          ry={bodyHeight}
          fill={birdSilhouette(bodyAlpha)}
        />
        {/* Neck — short curve from body to head */}
        <path
          d={`M ${bodyLen * 0.4} ${-bodyHeight * 0.4} Q ${bodyLen * 0.6} ${-bodyHeight * 1.2} ${bodyLen * 0.75} ${-bodyHeight * 0.6}`}
          fill="none"
          stroke={birdSilhouette(bodyAlpha)}
          strokeWidth={bodyHeight * 1.1}
          strokeLinecap="round"
        />
        {/* Head */}
        <circle
          cx={bodyLen * 0.78}
          cy={-bodyHeight * 0.7}
          r={bodyHeight * 1.1}
          fill={birdSilhouette(bodyAlpha)}
        />
        {/* Beak */}
        <path
          d={`M ${bodyLen * 0.92} ${-bodyHeight * 0.7} L ${bodyLen * 1.18} ${-bodyHeight * 0.55} L ${bodyLen * 0.92} ${-bodyHeight * 0.4} Z`}
          fill={birdSilhouette(bodyAlpha)}
        />
        {/* Eye dot */}
        <circle
          cx={bodyLen * 0.86}
          cy={-bodyHeight * 0.85}
          r={bodyHeight * 0.22}
          fill={`hsla(45, 90%, 92%, ${bodyAlpha * 0.85})`}
        />
        {/* Tail base */}
        <path
          d={`M ${-bodyLen * 0.55} ${0} L ${-bodyLen * 0.95} ${-bodyHeight * 0.4} L ${-bodyLen * 0.95} ${bodyHeight * 0.4} Z`}
          fill={birdSilhouette(bodyAlpha)}
        />
        {/* Tail feathers — 5 spread lines */}
        {tailFeathers.map((tf, i) => (
          <line
            key={`tail-${i}`}
            x1={-bodyLen * 0.55}
            y1={0}
            x2={tf.x}
            y2={tf.y}
            stroke={birdSilhouette(bodyAlpha * 0.95)}
            strokeWidth={1.5 * scale}
            strokeLinecap="round"
          />
        ))}

        {/* Upper wing — main shape (triangular blade) */}
        <path
          d={`M ${-bodyLen * 0.15} ${0} Q ${upperTipX * 0.5} ${upperTipY * 0.6 - 4 * scale} ${upperTipX} ${upperTipY} Q ${upperTipX * 0.6} ${upperTipY * 0.7 + 5 * scale} ${-bodyLen * 0.15} ${-bodyHeight * 0.3} Z`}
          fill={birdSilhouette(bodyAlpha * 0.92)}
        />
        {/* Upper wing primary feathers */}
        {upperFeathers.map((wf, i) => (
          <line
            key={`upf-${i}`}
            x1={-bodyLen * 0.15 + (wf.x - -bodyLen * 0.15) * 0.35}
            y1={wf.y * 0.35}
            x2={wf.x}
            y2={wf.y}
            stroke={birdSilhouette(bodyAlpha * 0.95)}
            strokeWidth={1.6 * scale}
            strokeLinecap="round"
          />
        ))}
        {/* Upper wing leading edge */}
        <line
          x1={-bodyLen * 0.15}
          y1={0}
          x2={upperTipX}
          y2={upperTipY}
          stroke={birdSilhouette(bodyAlpha)}
          strokeWidth={1.8 * scale}
          strokeLinecap="round"
        />

        {/* Lower wing — main shape */}
        <path
          d={`M ${-bodyLen * 0.15} ${0} Q ${lowerTipX * 0.5} ${lowerTipY * 0.6 + 4 * scale} ${lowerTipX} ${lowerTipY} Q ${lowerTipX * 0.6} ${lowerTipY * 0.7 - 5 * scale} ${-bodyLen * 0.15} ${bodyHeight * 0.3} Z`}
          fill={birdSilhouette(bodyAlpha * 0.85)}
        />
        {/* Lower wing primary feathers */}
        {lowerFeathers.map((wf, i) => (
          <line
            key={`lwf-${i}`}
            x1={-bodyLen * 0.15 + (wf.x - -bodyLen * 0.15) * 0.35}
            y1={wf.y * 0.35}
            x2={wf.x}
            y2={wf.y}
            stroke={birdSilhouette(bodyAlpha * 0.88)}
            strokeWidth={1.5 * scale}
            strokeLinecap="round"
          />
        ))}
        {/* Lower wing leading edge */}
        <line
          x1={-bodyLen * 0.15}
          y1={0}
          x2={lowerTipX}
          y2={lowerTipY}
          stroke={birdSilhouette(bodyAlpha * 0.9)}
          strokeWidth={1.6 * scale}
          strokeLinecap="round"
        />
      </g>
    );
  };

  /* ---- Trail ghost positions (sample arc at past offsets) ---- */
  const ghostOffsets = [0.012, 0.028, 0.05, 0.078]; // fractional t lookbacks
  const ghosts = ghostOffsets.slice(0, NUM_TRAIL_GHOSTS).map((dt) => {
    const tg = Math.max(0, arcT - dt);
    const pos = birdArcPosition(tg, width, height, altitude);
    return { t: tg, ...pos };
  });

  /* ---- Render musical notes along trail ---- */
  const renderNote = (
    cx: number,
    cy: number,
    scale: number,
    shape: number,
    alpha: number,
    keyId: string,
  ) => {
    const headR = 3.2 * scale;
    const stemH = 12 * scale;
    const flagW = 5 * scale;
    return (
      <g key={keyId} transform={`translate(${cx}, ${cy})`}>
        {/* Note head */}
        <ellipse
          cx={0}
          cy={0}
          rx={headR}
          ry={headR * 0.78}
          fill={trailColor(alpha)}
          transform="rotate(-20)"
        />
        {/* Stem */}
        <line
          x1={headR * 0.85}
          y1={0}
          x2={headR * 0.85}
          y2={-stemH}
          stroke={trailColor(alpha)}
          strokeWidth={1.2 * scale}
          strokeLinecap="round"
        />
        {/* Flag (eighth or sixteenth) */}
        {shape >= 1 && (
          <path
            d={`M ${headR * 0.85} ${-stemH} Q ${headR * 0.85 + flagW} ${-stemH + 3 * scale} ${headR * 0.85 + flagW * 0.6} ${-stemH + 7 * scale}`}
            fill="none"
            stroke={trailColor(alpha)}
            strokeWidth={1.4 * scale}
            strokeLinecap="round"
          />
        )}
        {shape === 2 && (
          <path
            d={`M ${headR * 0.85} ${-stemH + 5 * scale} Q ${headR * 0.85 + flagW} ${-stemH + 8 * scale} ${headR * 0.85 + flagW * 0.6} ${-stemH + 12 * scale}`}
            fill="none"
            stroke={trailColor(alpha * 0.9)}
            strokeWidth={1.3 * scale}
            strokeLinecap="round"
          />
        )}
      </g>
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          {/* Sky gradient */}
          <linearGradient id={skyGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyColorTop} />
            <stop offset="55%" stopColor={skyColorMid} />
            <stop offset="100%" stopColor={skyColorBottom} />
          </linearGradient>

          {/* Trail gradient (radial, fades from bird outward) */}
          <radialGradient id={trailGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={trailColor(0.6 * glowIntensity)} />
            <stop offset="100%" stopColor={trailColor(0)} />
          </radialGradient>

          {/* Glow filter */}
          <filter id={glowFilterId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={3 + beatDecay * 5} />
          </filter>
        </defs>

        {/* ============ SKY BACKGROUND ============ */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={`url(#${skyGradId})`}
          opacity={0.55 + slowEnergy * 0.15}
        />

        {/* ============ DISTANT STARS ============ */}
        {stars.map((star, i) => {
          const twinkle =
            0.5 + 0.5 * Math.sin(cycleFrame * 0.04 + star.phase);
          const sx = star.x * width;
          const sy = star.y * height;
          return (
            <circle
              key={`star-${i}`}
              cx={sx}
              cy={sy}
              r={1 + twinkle * 0.8}
              fill={`hsla(50, 80%, 95%, ${star.brightness * twinkle * 0.7 * (1 - vocalPresence * 0.2)})`}
            />
          );
        })}

        {/* ============ CLOUD WISPS ============ */}
        {clouds.map((cloud, i) => {
          const cx = ((cloud.x + cycleFrame * cloud.speed * 0.001) % 1.2) * width;
          const cy = cloud.y * height;
          const cw = 140 * cloud.scale;
          const ch = 22 * cloud.scale;
          return (
            <g key={`cloud-${i}`} opacity={cloud.opacity * (0.6 + slowEnergy * 0.4)}>
              <ellipse
                cx={cx}
                cy={cy}
                rx={cw}
                ry={ch}
                fill={cloudColor(0.5)}
                style={{ filter: "blur(8px)" }}
              />
              <ellipse
                cx={cx + cw * 0.4}
                cy={cy + ch * 0.3}
                rx={cw * 0.7}
                ry={ch * 0.85}
                fill={cloudColor(0.4)}
                style={{ filter: "blur(10px)" }}
              />
              <ellipse
                cx={cx - cw * 0.45}
                cy={cy - ch * 0.2}
                rx={cw * 0.55}
                ry={ch * 0.75}
                fill={cloudColor(0.35)}
                style={{ filter: "blur(9px)" }}
              />
            </g>
          );
        })}

        {/* ============ TRAIL GLOW (radial halo behind bird) ============ */}
        <circle
          cx={birdX}
          cy={birdY + bodyBob}
          r={70 + glowIntensity * 50}
          fill={`url(#${trailGradId})`}
          opacity={0.75 * glowIntensity}
          style={{ filter: "blur(14px)" }}
        />

        {/* ============ DUST PARTICLES (drifting in wake) ============ */}
        {dust.map((d, i) => {
          // Position the particle along the trail behind the bird
          const lookback = d.phase * 0.16; // up to 16% of arc behind
          const tDust = Math.max(0, arcT - lookback);
          if (tDust <= 0) return null;
          const pos = birdArcPosition(tDust, width, height, altitude);

          // Lateral drift over time
          const driftPhase = cycleFrame * d.driftFreq + d.phase * 7;
          const lx = pos.x + Math.sin(driftPhase) * d.drift;
          const ly = pos.y + Math.cos(driftPhase * 1.3) * d.drift * 0.7
            - lookback * 80; // particles also rise

          // Fade by lookback (older = dimmer)
          const lifeAlpha = interpolate(lookback, [0, 0.16 * d.lifeMult], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const finalAlpha = d.brightness * lifeAlpha * glowIntensity * 0.7;
          if (finalAlpha < 0.02) return null;

          return (
            <circle
              key={`dust-${i}`}
              cx={lx}
              cy={ly}
              r={d.size * (0.7 + glowIntensity * 0.4)}
              fill={trailColor(finalAlpha)}
              style={{ filter: "blur(1.5px)" }}
            />
          );
        })}

        {/* ============ TRAILING GHOST BIRDS ============ */}
        {ghosts.map((g, i) => {
          const ghostAlpha =
            (1 - i / NUM_TRAIL_GHOSTS) * 0.45 * glowIntensity * vocalGate;
          const ghostScale = 1 - i * 0.04;
          // Use slightly damped wing angles for ghosts
          const ghostWingAngle =
            wingAngle * (1 - i * 0.18) + Math.sin(wingFlapPhase - i * 0.6) * 0.1;
          return renderBird(
            g.x,
            g.y + bodyBob * (1 - i * 0.2),
            g.angle,
            ghostWingAngle,
            ghostScale,
            ghostAlpha,
            `ghost-${i}`,
          );
        })}

        {/* ============ MUSICAL NOTE GLYPHS ============ */}
        {notes.map((n, i) => {
          // Notes float along the trail at varying lookbacks
          const lookback = 0.04 + n.phase * 0.13;
          const tNote = Math.max(0, arcT - lookback);
          if (tNote <= 0) return null;
          const pos = birdArcPosition(tNote, width, height, altitude);

          // Float upward with time
          const floatY = -lookback * 100 + n.driftY +
            Math.sin(cycleFrame * 0.025 + n.phase * 5) * 4;
          const noteX = pos.x + (n.phase - 0.5) * 30;
          const noteY = pos.y + floatY;

          const noteAlpha = interpolate(lookback, [0.04, 0.17], [0.85, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) * glowIntensity * vocalEnergy * 1.6;

          if (noteAlpha < 0.04) return null;

          return renderNote(noteX, noteY, n.scale, n.shape, noteAlpha, `note-${i}`);
        })}

        {/* ============ MAIN BIRD ============ */}
        {renderBird(
          birdX,
          birdY + bodyBob,
          tangentAngle,
          wingAngle,
          1.0 + speedFactor * 0.05,
          0.92 * vocalGate,
          "bird-main",
        )}

        {/* ============ BIRD GLOW HIGHLIGHT (subtle white edge) ============ */}
        <circle
          cx={birdX}
          cy={birdY + bodyBob}
          r={6 + beatDecay * 5}
          fill={`hsla(50, 95%, 88%, ${0.55 * glowIntensity * vocalGate})`}
          style={{ filter: "blur(4px)" }}
        />
      </svg>
    </div>
  );
};
