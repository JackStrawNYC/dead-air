/**
 * LaserShow — A+++ overlay: a concert laser show with multiple beams crossing
 * the frame from various angles, rendered as proper light cones with falloff
 * and atmospheric scatter from heavy stage smoke. 14 lasers in a fan from
 * truss-mounted heads at the top, hitting the smoke layer and the ground.
 * Geometric scanning patterns. Stage at the bottom, crowd silhouette
 * foreground, smoke fills mid-air. NOT lines — actual cones.
 *
 * Audio reactivity:
 *   slowEnergy   → smoke density and base brightness
 *   energy       → cone width
 *   bass         → laser sweep amplitude
 *   beatDecay    → simultaneous strobe pulse
 *   onsetEnvelope→ flash burst
 *   chromaHue    → primary laser color
 *   tempoFactor  → sweep speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 800;
const BEAM_COUNT = 14;
const SCAN_BEAM_COUNT = 8;
const SMOKE_COUNT = 22;
const DUST_COUNT = 60;
const STAR_COUNT = 40;

interface Beam {
  x: number;
  baseAngle: number;
  sweepFreq: number;
  sweepAmp: number;
  sweepPhase: number;
  hueOffset: number;
  width: number;
  reach: number;
}

interface SmokeBlob {
  x: number;
  y: number;
  rx: number;
  ry: number;
  drift: number;
  shade: number;
  phase: number;
}

interface Dust {
  x: number;
  y: number;
  size: number;
  speed: number;
  phase: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

function buildBeams(): Beam[] {
  const rng = seeded(34_557_886);
  return Array.from({ length: BEAM_COUNT }, (_, i) => ({
    x: 0.10 + (i / (BEAM_COUNT - 1)) * 0.80,
    baseAngle: -Math.PI / 2 + (rng() - 0.5) * 0.30,
    sweepFreq: 0.008 + rng() * 0.020,
    sweepAmp: 0.50 + rng() * 0.45,
    sweepPhase: rng() * Math.PI * 2,
    hueOffset: -60 + rng() * 120,
    width: 50 + rng() * 30,
    reach: 0.85 + rng() * 0.20,
  }));
}

function buildScanBeams(): Beam[] {
  const rng = seeded(80_113_004);
  return Array.from({ length: SCAN_BEAM_COUNT }, (_, i) => ({
    x: 0.20 + (i / (SCAN_BEAM_COUNT - 1)) * 0.60,
    baseAngle: -Math.PI / 2,
    sweepFreq: 0.006 + rng() * 0.014,
    sweepAmp: 0.7 + rng() * 0.4,
    sweepPhase: i * 0.6,
    hueOffset: -30 + rng() * 60,
    width: 22,
    reach: 1.0,
  }));
}

function buildSmoke(): SmokeBlob[] {
  const rng = seeded(91_447_022);
  return Array.from({ length: SMOKE_COUNT }, () => ({
    x: rng(),
    y: 0.20 + rng() * 0.60,
    rx: 0.10 + rng() * 0.20,
    ry: 0.04 + rng() * 0.06,
    drift: 0.0001 + rng() * 0.00038,
    shade: 0.20 + rng() * 0.30,
    phase: rng() * Math.PI * 2,
  }));
}

function buildDust(): Dust[] {
  const rng = seeded(57_201_338);
  return Array.from({ length: DUST_COUNT }, () => ({
    x: rng(),
    y: 0.10 + rng() * 0.80,
    size: 0.6 + rng() * 1.4,
    speed: 0.0005 + rng() * 0.0028,
    phase: rng() * Math.PI * 2,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(63_004_891);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.30,
    size: 0.4 + rng() * 1.4,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const LaserShow: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const beams = React.useMemo(buildBeams, []);
  const scanBeams = React.useMemo(buildScanBeams, []);
  const smoke = React.useMemo(buildSmoke, []);
  const dust = React.useMemo(buildDust, []);
  const stars = React.useMemo(buildStars, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const beamGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.20], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const energy = snap.energy;
  const bass = snap.bass;
  const beatPulse = 1 + snap.beatDecay * 0.45;
  const onsetFlare = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.7) : 0;

  const baseHue = 320;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.6) % 360 + 360) % 360;

  const skyTop = `hsl(${(tintHue + 220) % 360}, 30%, 4%)`;
  const skyMid = `hsl(${(tintHue + 240) % 360}, 26%, 8%)`;
  const skyHorizon = `hsl(${(tintHue + 16) % 360}, 36%, 14%)`;

  const stageY = height * 0.78;
  const stageH = height * 0.22;
  const trussY = height * 0.04;

  // Build a beam cone (3 layered paths)
  function renderBeamCone(b: Beam, key: string, isScan: boolean) {
    const sx = b.x * width;
    const sy = trussY + 18;
    const angle = b.baseAngle + Math.sin(frame * b.sweepFreq * tempoFactor + b.sweepPhase) * b.sweepAmp * (1 + bass * 0.6);
    const len = height * b.reach;
    const ex = sx + Math.cos(angle + Math.PI / 2) * len;
    const ey = sy + Math.abs(Math.sin(angle + Math.PI / 2)) * len;
    const w = b.width * (1 + energy * 0.45) * (isScan ? 0.6 : 1.0);
    const beamHue = (tintHue + b.hueOffset + 360) % 360;
    const beamColor = `hsl(${beamHue}, 95%, 60%)`;
    const beamCore = `hsl(${beamHue}, 100%, 88%)`;
    const beamOuter = `hsl(${beamHue}, 90%, 50%)`;
    const dx = -Math.sin(angle + Math.PI / 2);
    const dy = Math.cos(angle + Math.PI / 2);
    return (
      <g key={key} style={{ mixBlendMode: "screen" }}>
        {/* outer atmospheric cone */}
        <path
          d={`M ${sx - dx * w * 0.10} ${sy - dy * w * 0.10}
              L ${ex - dx * w * 0.55} ${ey - dy * w * 0.55}
              L ${ex + dx * w * 0.55} ${ey + dy * w * 0.55}
              L ${sx + dx * w * 0.10} ${sy + dy * w * 0.10} Z`}
          fill={beamOuter}
          opacity={0.10 * beamGlow}
        />
        {/* mid cone */}
        <path
          d={`M ${sx - dx * w * 0.05} ${sy - dy * w * 0.05}
              L ${ex - dx * w * 0.28} ${ey - dy * w * 0.28}
              L ${ex + dx * w * 0.28} ${ey + dy * w * 0.28}
              L ${sx + dx * w * 0.05} ${sy + dy * w * 0.05} Z`}
          fill={beamColor}
          opacity={0.22 * beamGlow}
        />
        {/* core cone */}
        <path
          d={`M ${sx - dx * w * 0.018} ${sy - dy * w * 0.018}
              L ${ex - dx * w * 0.10} ${ey - dy * w * 0.10}
              L ${ex + dx * w * 0.10} ${ey + dy * w * 0.10}
              L ${sx + dx * w * 0.018} ${sy + dy * w * 0.018} Z`}
          fill={beamCore}
          opacity={0.42 * beamGlow * beatPulse}
        />
        {/* origin glow at the truss */}
        <circle cx={sx} cy={sy} r={10 + beatPulse * 5} fill={beamCore} opacity={0.85} />
        <circle cx={sx} cy={sy} r={20 + beatPulse * 8} fill={beamColor} opacity={0.40 * beamGlow} />
        {/* hit-point glow on the floor */}
        <circle cx={ex} cy={ey} r={8 + beatPulse * 6} fill={beamCore} opacity={0.7} />
        <circle cx={ex} cy={ey} r={20 + beatPulse * 10} fill={beamColor} opacity={0.30 * beamGlow} />
      </g>
    );
  }

  const beamNodes = beams.map((b, i) => renderBeamCone(b, `beam-${i}`, false));
  const scanNodes = scanBeams.map((b, i) => renderBeamCone(b, `scan-${i}`, true));

  // Smoke
  const smokeNodes = smoke.map((s, i) => {
    const drift = (s.x + frame * s.drift) % 1.2 - 0.1;
    const breath = 1 + Math.sin(frame * 0.012 + s.phase) * 0.06;
    return (
      <ellipse
        key={`sm-${i}`}
        cx={drift * width}
        cy={s.y * height}
        rx={s.rx * width * breath}
        ry={s.ry * height * breath}
        fill={`rgba(${30 + s.shade * 14},${24 + s.shade * 12},${44 + s.shade * 18},${0.42 + beamGlow * 0.25})`}
      />
    );
  });

  // Dust motes
  const dustNodes = dust.map((d, i) => {
    const t = frame * d.speed + d.phase;
    const px = ((d.x + t * 0.4) % 1.1 - 0.05) * width;
    const py = (d.y + Math.sin(t * 1.4) * 0.02) * height;
    const flicker = 0.4 + Math.sin(t * 2.3) * 0.4;
    return <circle key={`dust-${i}`} cx={px} cy={py} r={d.size * (0.7 + beamGlow * 0.5)} fill={`hsl(${tintHue}, 90%, 80%)`} opacity={0.32 * flicker} />;
  });

  // Stars
  const starNodes = stars.map((s, i) => {
    const tw = 0.5 + Math.sin(frame * 0.05 + s.phase) * 0.45;
    return <circle key={`star-${i}`} cx={s.x * width} cy={s.y * height} r={s.size * tw} fill="rgba(240, 232, 220, 0.85)" />;
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="ls-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="ls-stage" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(14, 8, 22, 0.95)" />
            <stop offset="100%" stopColor="rgba(2, 1, 6, 0.98)" />
          </linearGradient>
          <filter id="ls-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#ls-sky)" />

        {/* Stars */}
        <g>{starNodes}</g>

        {/* Top truss */}
        <g opacity={0.92}>
          <rect x={width * 0.06} y={trussY} width={width * 0.88} height={6} fill="rgba(20, 16, 26, 0.98)" />
          <rect x={width * 0.06} y={trussY} width={6} height={26} fill="rgba(20, 16, 26, 0.98)" />
          <rect x={width * 0.94 - 6} y={trussY} width={6} height={26} fill="rgba(20, 16, 26, 0.98)" />
          {Array.from({ length: 30 }).map((_, i) => (
            <line
              key={`tr-${i}`}
              x1={width * 0.06 + i * (width * 0.88 / 30)}
              y1={trussY + 4}
              x2={width * 0.06 + (i + 1) * (width * 0.88 / 30)}
              y2={trussY + 22}
              stroke="rgba(28, 22, 32, 0.7)"
              strokeWidth={1}
            />
          ))}
          {/* Laser fixtures */}
          {beams.map((b, i) => (
            <rect
              key={`fx-${i}`}
              x={b.x * width - 8}
              y={trussY + 8}
              width={16}
              height={14}
              rx={2}
              fill="rgba(8, 6, 14, 0.98)"
            />
          ))}
        </g>

        {/* Smoke layer (must be behind beams to scatter) */}
        <g filter="url(#ls-blur)">{smokeNodes}</g>

        {/* Onset flash */}
        {onsetFlare > 0 && (
          <rect width={width} height={height} fill={`hsla(${tintHue}, 90%, 80%, ${onsetFlare * 0.15})`} />
        )}

        {/* Main fan beams */}
        <g>{beamNodes}</g>

        {/* Scanning narrow beams */}
        <g>{scanNodes}</g>

        {/* Dust motes through the beams */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes}</g>

        {/* Stage at bottom */}
        <rect x={0} y={stageY} width={width} height={stageH} fill="url(#ls-stage)" />
        <rect x={width * 0.10} y={stageY - 4} width={width * 0.80} height={6} fill="rgba(18, 14, 22, 0.95)" />

        {/* Crowd silhouette foreground (heads bobbing) */}
        <g>
          {Array.from({ length: 22 }).map((_, i) => {
            const px = (i + 0.5) / 22 * width;
            const py = height * 0.97;
            const bob = Math.sin(frame * 0.025 + i * 0.7) * (2 + bass * 4);
            const r = 14 + (i % 3) * 3;
            return (
              <g key={`crowd-${i}`}>
                <circle cx={px} cy={py - 18 + bob} r={r} fill="rgba(4, 2, 8, 0.98)" />
                <ellipse cx={px} cy={py} rx={r * 1.6} ry={r * 0.8} fill="rgba(4, 2, 8, 0.98)" />
              </g>
            );
          })}
        </g>

        {/* Final atmospheric tint */}
        <rect
          width={width}
          height={height}
          fill={`hsla(${tintHue}, 70%, 50%, ${0.04 + beamGlow * 0.04})`}
          style={{ mixBlendMode: "screen" }}
        />
      </svg>
    </div>
  );
};
