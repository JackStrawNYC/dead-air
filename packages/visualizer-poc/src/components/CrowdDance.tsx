/**
 * CrowdDance — A+++ overlay: a sea of dancing figures silhouetted against
 * a stage-lit horizon. 40+ articulated dancers across 3 depth rows, with
 * mountains, sky gradient, stage spotlight cones, drifting smoke, lasers,
 * star sparkle, and dust motes. The bottom 50% of the frame is the dance
 * pit; the top is the venue/sky. Bass drives stomp; energy drives arms;
 * beatDecay locks heads to the pulse. chromaHue tints the stage light.
 *
 * Audio reactivity:
 *   slowEnergy   → sky warmth and atmospheric mist density
 *   energy       → arm raise amplitude + figure sway intensity
 *   bass         → vertical stomp / ground rumble
 *   beatDecay    → head bob pulse, light cone strobe
 *   onsetEnvelope→ stage flash flares
 *   chromaHue    → stage light hue (gold↔magenta↔cyan)
 *   tempoFactor  → choreography tempo
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 820;
const FRONT_ROW = 14;
const MID_ROW = 16;
const BACK_ROW = 18;
const SPOT_BEAMS = 7;
const SMOKE_PUFFS = 14;
const STAR_COUNT = 60;
const DUST_COUNT = 48;

interface Dancer {
  x: number;
  baseHeight: number;
  swayFreq: number;
  swayPhase: number;
  bouncePhase: number;
  armPhase: number;
  armStyle: 0 | 1 | 2;
  hipPhase: number;
  legPhase: number;
  bodyShade: number;
  hatType: 0 | 1 | 2;
}

interface SpotBeam {
  x: number;
  angleBase: number;
  angleAmp: number;
  speed: number;
  hueOffset: number;
  width: number;
  phase: number;
}

interface SmokePuff {
  x: number;
  y: number;
  rx: number;
  ry: number;
  drift: number;
  shade: number;
  phase: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinkle: number;
  phase: number;
}

interface Mote {
  x: number;
  y: number;
  size: number;
  speed: number;
  phase: number;
}

function buildRow(seed: number, count: number): Dancer[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: (i + 0.4 + rng() * 0.2) / count,
    baseHeight: 0.78 + rng() * 0.34,
    swayFreq: 0.018 + rng() * 0.018,
    swayPhase: rng() * Math.PI * 2,
    bouncePhase: rng() * Math.PI * 2,
    armPhase: rng() * Math.PI * 2,
    armStyle: Math.floor(rng() * 3) as 0 | 1 | 2,
    hipPhase: rng() * Math.PI * 2,
    legPhase: rng() * Math.PI * 2,
    bodyShade: 0.04 + rng() * 0.10,
    hatType: Math.floor(rng() * 3) as 0 | 1 | 2,
  }));
}

function buildSpots(): SpotBeam[] {
  const rng = seeded(48_771_209);
  return Array.from({ length: SPOT_BEAMS }, (_, i) => ({
    x: 0.10 + (i / (SPOT_BEAMS - 1)) * 0.80,
    angleBase: -Math.PI / 2 + (rng() - 0.5) * 0.4,
    angleAmp: 0.18 + rng() * 0.22,
    speed: 0.005 + rng() * 0.012,
    hueOffset: -40 + rng() * 80,
    width: 70 + rng() * 50,
    phase: rng() * Math.PI * 2,
  }));
}

function buildSmoke(): SmokePuff[] {
  const rng = seeded(31_488_502);
  return Array.from({ length: SMOKE_PUFFS }, () => ({
    x: rng(),
    y: 0.32 + rng() * 0.26,
    rx: 0.12 + rng() * 0.18,
    ry: 0.04 + rng() * 0.05,
    drift: 0.00012 + rng() * 0.00038,
    shade: 0.20 + rng() * 0.30,
    phase: rng() * Math.PI * 2,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(99_117_604);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.30,
    size: 0.4 + rng() * 1.6,
    twinkle: 0.02 + rng() * 0.05,
    phase: rng() * Math.PI * 2,
  }));
}

function buildMotes(): Mote[] {
  const rng = seeded(74_226_180);
  return Array.from({ length: DUST_COUNT }, () => ({
    x: rng(),
    y: 0.20 + rng() * 0.50,
    size: 0.6 + rng() * 1.6,
    speed: 0.0008 + rng() * 0.0028,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CrowdDance: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const frontRow = React.useMemo(() => buildRow(11_223_344, FRONT_ROW), []);
  const midRow = React.useMemo(() => buildRow(22_334_455, MID_ROW), []);
  const backRow = React.useMemo(() => buildRow(33_445_566, BACK_ROW), []);
  const spots = React.useMemo(buildSpots, []);
  const smoke = React.useMemo(buildSmoke, []);
  const stars = React.useMemo(buildStars, []);
  const motes = React.useMemo(buildMotes, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const energy = snap.energy;
  const bass = snap.bass;
  const beatPulse = 1 + snap.beatDecay * 0.32;
  const slowGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const onsetFlash = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;
  const tempoBeat = frame * 0.085 * tempoFactor;

  const baseHue = 290;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.45) % 360 + 360) % 360;
  const lightHue = tintHue;
  const lightCore = `hsl(${lightHue}, 92%, 78%)`;
  const lightWarm = `hsl(${(lightHue + 30) % 360}, 80%, 62%)`;
  const lightCool = `hsl(${(lightHue + 200) % 360}, 75%, 58%)`;

  const horizonY = height * 0.50;
  const groundY = height * 0.62;
  const skyTop = `hsl(${(tintHue + 220) % 360}, 35%, 7%)`;
  const skyMid = `hsl(${(tintHue + 240) % 360}, 28%, 12%)`;
  const skyHorizon = `hsl(${(tintHue + 16) % 360}, 45%, 22%)`;

  // ===== build silhouettes for one row =====
  function renderRow(row: Dancer[], rowIndex: 0 | 1 | 2) {
    const baselineY = rowIndex === 0 ? height * 0.99 : rowIndex === 1 ? height * 0.92 : height * 0.84;
    const rowScale = rowIndex === 0 ? 1.0 : rowIndex === 1 ? 0.78 : 0.58;
    const rowDarkness = rowIndex === 0 ? 0.95 : rowIndex === 1 ? 0.78 : 0.58;
    const figureHeightBase = height * 0.42 * rowScale;

    return row.map((d, i) => {
      const px = d.x * width;
      const t = frame * d.swayFreq * tempoFactor + d.swayPhase;
      const sway = Math.sin(t) * (4 + energy * 12) * rowScale;
      const stomp = Math.abs(Math.sin(tempoBeat + d.bouncePhase)) * (3 + bass * 14) * rowScale;
      const figureH = figureHeightBase * d.baseHeight * (1 - stomp / 600);
      const baseY = baselineY - stomp;
      const headR = figureH * 0.075;
      const headY = baseY - figureH;
      const torsoTop = headY + headR * 1.6;
      const torsoBot = baseY - figureH * 0.42;
      const hipY = torsoBot + figureH * 0.02;

      // Arm choreography
      const armBaseAngle =
        d.armStyle === 0
          ? -Math.PI / 2 + Math.sin(tempoBeat * 1.2 + d.armPhase) * 0.5  // sway
          : d.armStyle === 1
          ? -Math.PI / 2 - 0.3 + Math.sin(tempoBeat + d.armPhase) * 0.3  // raised swaying
          : -Math.PI / 2 - 0.6 - energy * 0.5;                            // arms up
      const armRaise = energy * 0.6 + (d.armStyle === 2 ? 0.4 : 0);
      const armLen = figureH * 0.36;
      const shoulderY = torsoTop + figureH * 0.04;
      const lShoulderX = px - figureH * 0.10 + sway * 0.4;
      const rShoulderX = px + figureH * 0.10 + sway * 0.4;
      const lElbowAngle = armBaseAngle - 0.3 - armRaise * 0.5;
      const rElbowAngle = armBaseAngle + 0.3 + armRaise * 0.5;
      const lElbowX = lShoulderX + Math.cos(lElbowAngle) * armLen * 0.5;
      const lElbowY = shoulderY + Math.sin(lElbowAngle) * armLen * 0.5;
      const rElbowX = rShoulderX + Math.cos(rElbowAngle) * armLen * 0.5;
      const rElbowY = shoulderY + Math.sin(rElbowAngle) * armLen * 0.5;
      const lHandAngle = lElbowAngle - 0.1 - Math.sin(tempoBeat * 1.3 + d.armPhase) * 0.4;
      const rHandAngle = rElbowAngle + 0.1 + Math.sin(tempoBeat * 1.3 + d.armPhase + 1) * 0.4;
      const lHandX = lElbowX + Math.cos(lHandAngle) * armLen * 0.55;
      const lHandY = lElbowY + Math.sin(lHandAngle) * armLen * 0.55;
      const rHandX = rElbowX + Math.cos(rHandAngle) * armLen * 0.55;
      const rHandY = rElbowY + Math.sin(rHandAngle) * armLen * 0.55;

      // Legs
      const legSpread = figureH * 0.07;
      const legPhase = tempoBeat * 0.7 + d.legPhase;
      const lLegX = px - legSpread + Math.sin(legPhase) * 4;
      const rLegX = px + legSpread + Math.sin(legPhase + Math.PI) * 4;
      const lKneeY = hipY + figureH * 0.20 + Math.abs(Math.sin(legPhase)) * 4;
      const rKneeY = hipY + figureH * 0.20 + Math.abs(Math.sin(legPhase + Math.PI)) * 4;
      const lFootY = baseY;
      const rFootY = baseY;
      const lFootX = lLegX + Math.sin(legPhase) * 6;
      const rFootX = rLegX + Math.sin(legPhase + Math.PI) * 6;

      const fillR = Math.round(8 * rowDarkness);
      const fillG = Math.round(6 * rowDarkness);
      const fillB = Math.round(14 * rowDarkness);
      const figureFill = `rgba(${fillR},${fillG},${fillB},${0.92 * rowDarkness})`;
      const rimFill = `hsla(${lightHue}, 90%, 70%, ${0.18 * rowDarkness * beatPulse})`;

      return (
        <g key={`r${rowIndex}-d${i}`}>
          {/* Torso (tapered) */}
          <path
            d={`M ${px - figureH * 0.085} ${torsoTop}
                Q ${px - figureH * 0.10 + sway} ${(torsoTop + torsoBot) / 2} ${px - figureH * 0.075} ${torsoBot}
                L ${px + figureH * 0.075} ${torsoBot}
                Q ${px + figureH * 0.10 + sway} ${(torsoTop + torsoBot) / 2} ${px + figureH * 0.085} ${torsoTop}
                Z`}
            fill={figureFill}
          />
          {/* Hips/lower torso */}
          <path
            d={`M ${px - figureH * 0.075} ${torsoBot}
                Q ${px} ${hipY + figureH * 0.04} ${px + figureH * 0.075} ${torsoBot}
                L ${px + figureH * 0.06} ${hipY}
                L ${px - figureH * 0.06} ${hipY}
                Z`}
            fill={figureFill}
          />
          {/* Head */}
          <circle cx={px + sway * 0.5} cy={headY} r={headR} fill={figureFill} />
          {/* Hat overlay */}
          {d.hatType === 1 && (
            <ellipse cx={px + sway * 0.5} cy={headY - headR * 0.6} rx={headR * 1.4} ry={headR * 0.4} fill={figureFill} />
          )}
          {d.hatType === 2 && (
            <path
              d={`M ${px + sway * 0.5 - headR * 1.6} ${headY - headR * 0.2}
                  Q ${px + sway * 0.5} ${headY - headR * 1.8} ${px + sway * 0.5 + headR * 1.6} ${headY - headR * 0.2}
                  L ${px + sway * 0.5 + headR * 0.9} ${headY - headR * 0.4}
                  L ${px + sway * 0.5 - headR * 0.9} ${headY - headR * 0.4} Z`}
              fill={figureFill}
            />
          )}
          {/* Arms (shoulder→elbow→hand) */}
          <line x1={lShoulderX} y1={shoulderY} x2={lElbowX} y2={lElbowY} stroke={figureFill} strokeWidth={figureH * 0.04} strokeLinecap="round" />
          <line x1={lElbowX} y1={lElbowY} x2={lHandX} y2={lHandY} stroke={figureFill} strokeWidth={figureH * 0.035} strokeLinecap="round" />
          <line x1={rShoulderX} y1={shoulderY} x2={rElbowX} y2={rElbowY} stroke={figureFill} strokeWidth={figureH * 0.04} strokeLinecap="round" />
          <line x1={rElbowX} y1={rElbowY} x2={rHandX} y2={rHandY} stroke={figureFill} strokeWidth={figureH * 0.035} strokeLinecap="round" />
          {/* Legs */}
          <line x1={px - legSpread * 0.5} y1={hipY} x2={lLegX} y2={lKneeY} stroke={figureFill} strokeWidth={figureH * 0.045} strokeLinecap="round" />
          <line x1={lLegX} y1={lKneeY} x2={lFootX} y2={lFootY} stroke={figureFill} strokeWidth={figureH * 0.045} strokeLinecap="round" />
          <line x1={px + legSpread * 0.5} y1={hipY} x2={rLegX} y2={rKneeY} stroke={figureFill} strokeWidth={figureH * 0.045} strokeLinecap="round" />
          <line x1={rLegX} y1={rKneeY} x2={rFootX} y2={rFootY} stroke={figureFill} strokeWidth={figureH * 0.045} strokeLinecap="round" />
          {/* Rim light from above */}
          <circle cx={px + sway * 0.5} cy={headY - headR * 0.5} r={headR * 0.8} fill={rimFill} />
          <ellipse cx={px} cy={shoulderY - 2} rx={figureH * 0.10} ry={2.5} fill={rimFill} />
        </g>
      );
    });
  }

  // ===== distant mountains =====
  const mountainPath =
    `M 0 ${horizonY + 6} ` +
    `L ${width * 0.08} ${horizonY - height * 0.04} ` +
    `L ${width * 0.18} ${horizonY - height * 0.10} ` +
    `L ${width * 0.27} ${horizonY - height * 0.05} ` +
    `L ${width * 0.36} ${horizonY - height * 0.13} ` +
    `L ${width * 0.46} ${horizonY - height * 0.07} ` +
    `L ${width * 0.55} ${horizonY - height * 0.16} ` +
    `L ${width * 0.65} ${horizonY - height * 0.09} ` +
    `L ${width * 0.74} ${horizonY - height * 0.12} ` +
    `L ${width * 0.84} ${horizonY - height * 0.04} ` +
    `L ${width * 0.93} ${horizonY - height * 0.08} ` +
    `L ${width} ${horizonY + 6} Z`;

  // ===== spotlight beams =====
  const beams = spots.map((s, i) => {
    const angle = s.angleBase + Math.sin(frame * s.speed + s.phase) * s.angleAmp;
    const sx = s.x * width;
    const sy = horizonY * 0.10;
    const len = height * 0.95;
    const ex = sx + Math.cos(angle) * len;
    const ey = sy + Math.sin(angle) * len;
    const w = s.width * (1 + beatPulse * 0.18);
    const dx = -Math.sin(angle);
    const dy = Math.cos(angle);
    const beamHue = (lightHue + s.hueOffset + 360) % 360;
    const beamColor = `hsl(${beamHue}, 92%, 70%)`;
    const beamCore = `hsl(${beamHue}, 100%, 88%)`;
    return (
      <g key={`beam-${i}`} style={{ mixBlendMode: "screen" }}>
        <path
          d={`M ${sx - dx * w * 0.10} ${sy - dy * w * 0.10}
              L ${ex - dx * w * 0.6} ${ey - dy * w * 0.6}
              L ${ex + dx * w * 0.6} ${ey + dy * w * 0.6}
              L ${sx + dx * w * 0.10} ${sy + dy * w * 0.10} Z`}
          fill={beamColor}
          opacity={0.10 * slowGlow}
        />
        <path
          d={`M ${sx - dx * w * 0.05} ${sy - dy * w * 0.05}
              L ${ex - dx * w * 0.32} ${ey - dy * w * 0.32}
              L ${ex + dx * w * 0.32} ${ey + dy * w * 0.32}
              L ${sx + dx * w * 0.05} ${sy + dy * w * 0.05} Z`}
          fill={beamColor}
          opacity={0.22 * slowGlow}
        />
        <path
          d={`M ${sx - dx * w * 0.018} ${sy - dy * w * 0.018}
              L ${ex - dx * w * 0.10} ${ey - dy * w * 0.10}
              L ${ex + dx * w * 0.10} ${ey + dy * w * 0.10}
              L ${sx + dx * w * 0.018} ${sy + dy * w * 0.018} Z`}
          fill={beamCore}
          opacity={0.40 * slowGlow * beatPulse}
        />
        <circle cx={sx} cy={sy} r={10 + beatPulse * 6} fill={beamCore} opacity={0.7} />
      </g>
    );
  });

  // ===== smoke clouds =====
  const smokeNodes = smoke.map((c, i) => {
    const drift = (c.x + frame * c.drift) % 1.2 - 0.1;
    const breath = 1 + Math.sin(frame * 0.01 + c.phase) * 0.06;
    return (
      <ellipse
        key={`smoke-${i}`}
        cx={drift * width}
        cy={c.y * height}
        rx={c.rx * width * breath}
        ry={c.ry * height * breath}
        fill={`rgba(${30 + c.shade * 14},${24 + c.shade * 12},${42 + c.shade * 18},${0.45 + slowGlow * 0.18})`}
      />
    );
  });

  // ===== stars =====
  const starNodes = stars.map((s, i) => {
    const tw = 0.5 + Math.sin(frame * s.twinkle + s.phase) * 0.45;
    return (
      <circle
        key={`star-${i}`}
        cx={s.x * width}
        cy={s.y * height}
        r={s.size * tw}
        fill="rgba(240, 232, 220, 0.85)"
      />
    );
  });

  // ===== dust motes =====
  const moteNodes = motes.map((m, i) => {
    const t = frame * m.speed + m.phase;
    const px = ((m.x + t * 0.4) % 1.1 - 0.05) * width;
    const py = (m.y + Math.sin(t * 1.4) * 0.02) * height;
    const flicker = 0.4 + Math.sin(t * 2.3) * 0.4;
    return (
      <circle
        key={`mote-${i}`}
        cx={px}
        cy={py}
        r={m.size * (0.7 + slowGlow * 0.5)}
        fill={lightCore}
        opacity={0.32 * flicker}
      />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="cd-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="cd-mountains" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(28, 22, 38, 0.95)" />
            <stop offset="100%" stopColor="rgba(12, 8, 22, 0.98)" />
          </linearGradient>
          <radialGradient id="cd-stagelight" cx="0.5" cy="1" r="0.7">
            <stop offset="0%" stopColor={lightCore} stopOpacity="0.5" />
            <stop offset="40%" stopColor={lightWarm} stopOpacity="0.18" />
            <stop offset="100%" stopColor={lightCool} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="cd-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(8, 4, 12, 0.85)" />
            <stop offset="100%" stopColor="rgba(2, 1, 4, 0.98)" />
          </linearGradient>
          <filter id="cd-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#cd-sky)" />

        {/* Stars */}
        <g>{starNodes}</g>

        {/* Stage haze backwash */}
        <ellipse cx={width * 0.5} cy={horizonY + 8} rx={width * 0.7} ry={height * 0.12} fill="url(#cd-stagelight)" />

        {/* Distant mountains */}
        <path d={mountainPath} fill="url(#cd-mountains)" />

        {/* Distant stage rig (truss + scaffold) */}
        <g opacity={0.7}>
          <rect x={width * 0.12} y={horizonY - height * 0.04} width={width * 0.76} height={4} fill="rgba(20, 18, 28, 0.92)" />
          <rect x={width * 0.12} y={horizonY - height * 0.20} width={6} height={height * 0.20} fill="rgba(20, 18, 28, 0.92)" />
          <rect x={width * 0.88} y={horizonY - height * 0.20} width={6} height={height * 0.20} fill="rgba(20, 18, 28, 0.92)" />
          <rect x={width * 0.12} y={horizonY - height * 0.20} width={width * 0.76} height={4} fill="rgba(20, 18, 28, 0.92)" />
          {Array.from({ length: 14 }).map((_, i) => (
            <line
              key={`truss-${i}`}
              x1={width * 0.12 + i * (width * 0.76 / 14)}
              y1={horizonY - height * 0.20}
              x2={width * 0.12 + (i + 1) * (width * 0.76 / 14)}
              y2={horizonY - height * 0.04}
              stroke="rgba(30, 26, 40, 0.7)"
              strokeWidth={1.2}
            />
          ))}
        </g>

        {/* Smoke layer */}
        <g filter="url(#cd-blur)">{smokeNodes}</g>

        {/* Spotlight beams */}
        <g>{beams}</g>

        {/* Onset flash */}
        {onsetFlash > 0 && (
          <rect width={width} height={height} fill={`hsla(${lightHue}, 90%, 80%, ${onsetFlash * 0.10})`} />
        )}

        {/* Ground plane */}
        <rect x={0} y={groundY} width={width} height={height - groundY} fill="url(#cd-ground)" />

        {/* Back row dancers */}
        <g>{renderRow(backRow, 2)}</g>

        {/* Mid row dancers */}
        <g>{renderRow(midRow, 1)}</g>

        {/* Front row dancers */}
        <g>{renderRow(frontRow, 0)}</g>

        {/* Dust motes (top layer) */}
        <g style={{ mixBlendMode: "screen" }}>{moteNodes}</g>

        {/* Final atmospheric warmth wash */}
        <rect
          width={width}
          height={height}
          fill={`hsla(${lightHue}, 80%, 60%, ${0.05 + slowGlow * 0.04})`}
          style={{ mixBlendMode: "screen" }}
        />
      </svg>
    </div>
  );
};
