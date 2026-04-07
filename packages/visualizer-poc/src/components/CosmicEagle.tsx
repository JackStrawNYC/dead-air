/**
 * CosmicEagle — A+++ overlay.
 * A LARGE eagle in flight (60% of frame width), wings spread, soaring through
 * a cosmic nebula. Detailed feathers, head, talons, star field background,
 * nebula clouds. Native American / mystic vibe.
 *
 * Audio reactivity:
 *   slowEnergy → nebula bloom + cosmic warmth
 *   energy     → wing brightness + star halo
 *   bass       → eagle low-frequency wingbeat amplitude
 *   beatDecay  → eagle pulse + tail flick
 *   onsetEnvelope → star flares
 *   chromaHue  → tribal/mystic palette tint
 *   tempoFactor → wing flap rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const STAR_COUNT = 140;
const NEBULA_COUNT = 8;
const FEATHER_PER_WING = 14;
const COVERT_PER_WING = 9;
const TAIL_FEATHER_COUNT = 9;

interface Star {
  x: number;
  y: number;
  r: number;
  twinkleSpeed: number;
  phase: number;
  hueOffset: number;
  isGiant: boolean;
}
interface Nebula {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotation: number;
  hueOffset: number;
  drift: number;
}
interface Particle {
  baseAngle: number;
  baseRadius: number;
  speed: number;
  size: number;
  phase: number;
}

function buildStars(): Star[] {
  const rng = seeded(81_447_991);
  return Array.from({ length: STAR_COUNT }, () => {
    const isGiant = rng() > 0.86;
    return {
      x: rng(),
      y: rng(),
      r: isGiant ? 1.8 + rng() * 2.5 : 0.4 + rng() * 1.4,
      twinkleSpeed: 0.02 + rng() * 0.05,
      phase: rng() * Math.PI * 2,
      hueOffset: (rng() - 0.5) * 60,
      isGiant,
    };
  });
}
function buildNebulae(): Nebula[] {
  const rng = seeded(67_338_512);
  return Array.from({ length: NEBULA_COUNT }, () => ({
    x: rng(),
    y: rng(),
    rx: 0.18 + rng() * 0.22,
    ry: 0.10 + rng() * 0.16,
    rotation: rng() * 360,
    hueOffset: (rng() - 0.5) * 120,
    drift: 0.00008 + rng() * 0.00018,
  }));
}
function buildParticles(): Particle[] {
  const rng = seeded(44_881_223);
  return Array.from({ length: 56 }, () => ({
    baseAngle: rng() * Math.PI * 2,
    baseRadius: 80 + rng() * 280,
    speed: 0.003 + rng() * 0.008,
    size: 0.8 + rng() * 2.2,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CosmicEagle: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const stars = React.useMemo(buildStars, []);
  const nebulae = React.useMemo(buildNebulae, []);
  const particles = React.useMemo(buildParticles, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives
  const cosmicGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const wingGlow = interpolate(snap.energy, [0.02, 0.32], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const wingDrive = interpolate(snap.bass, [0.0, 0.6], [0.30, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const eaglePulse = 1 + snap.beatDecay * 0.30;
  const flareBurst = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Mystic palette — base teal/cyan modulated by chromaHue
  const baseHue = 198;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.45) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 70%, 65%)`;
  const tintCore = `hsl(${tintHue}, 90%, 84%)`;
  const tintDeep = `hsl(${(tintHue + 8) % 360}, 60%, 30%)`;
  const skyTop = `hsl(${(tintHue + 220) % 360}, 38%, 6%)`;
  const skyMid = `hsl(${(tintHue + 240) % 360}, 36%, 10%)`;
  const skyBot = `hsl(${(tintHue + 200) % 360}, 30%, 14%)`;

  // Hero geometry — eagle is the focus (60% of frame)
  const cx = width / 2;
  const cy = height / 2;
  const eagleW = width * 0.60;
  const eagleH = height * 0.50;
  const wingSpan = eagleW;
  const bodyW = eagleW * 0.10;
  const bodyH = eagleH * 0.55;

  const flapPhase = frame * 0.04 * tempoFactor + Math.sin(frame * 0.012) * 0.4;
  const wingFlap = Math.sin(flapPhase) * (8 + wingDrive * 12);
  const wingLift = Math.cos(flapPhase) * (4 + wingDrive * 6);
  const headTilt = Math.sin(frame * 0.006) * 4;
  const tailFlick = Math.sin(frame * 0.018) * (3 + snap.beatDecay * 4);

  // Stars
  const starNodes = stars.map((s, i) => {
    const t = frame * s.twinkleSpeed + s.phase;
    const twinkle = 0.55 + Math.sin(t) * 0.4;
    const sx = s.x * width;
    const sy = s.y * height;
    const r = s.r * (0.85 + twinkle * 0.3);
    const flare = s.isGiant ? flareBurst * 0.6 : 0;
    const sHue = (tintHue + s.hueOffset + 360) % 360;
    return (
      <g key={`star-${i}`}>
        {s.isGiant && (
          <circle cx={sx} cy={sy} r={r * 4} fill={`hsl(${sHue}, 80%, 75%)`} opacity={0.10 * twinkle} />
        )}
        <circle cx={sx} cy={sy} r={r * 2} fill={`hsl(${sHue}, 70%, 70%)`} opacity={0.22 * twinkle} />
        <circle cx={sx} cy={sy} r={r} fill={`hsl(${sHue}, 90%, 88%)`} opacity={0.85 * twinkle + flare} />
        {s.isGiant && flareBurst > 0.1 && (
          <>
            <line x1={sx - r * 6} y1={sy} x2={sx + r * 6} y2={sy}
              stroke={`hsl(${sHue}, 90%, 90%)`} strokeWidth={0.6} opacity={flare} />
            <line x1={sx} y1={sy - r * 6} x2={sx} y2={sy + r * 6}
              stroke={`hsl(${sHue}, 90%, 90%)`} strokeWidth={0.6} opacity={flare} />
          </>
        )}
      </g>
    );
  });

  // Nebulae
  const nebulaNodes = nebulae.map((n, i) => {
    const drift = (n.x + frame * n.drift) % 1;
    const nx = drift * width;
    const ny = n.y * height;
    const nHue = (tintHue + n.hueOffset + 360) % 360;
    return (
      <g key={`neb-${i}`} transform={`translate(${nx}, ${ny}) rotate(${n.rotation + frame * 0.01})`}>
        <ellipse rx={n.rx * width * 1.4} ry={n.ry * height * 1.4} fill={`hsl(${nHue}, 65%, 50%)`} opacity={0.06 * cosmicGlow} />
        <ellipse rx={n.rx * width * 1.0} ry={n.ry * height * 1.0} fill={`hsl(${nHue}, 75%, 58%)`} opacity={0.10 * cosmicGlow} />
        <ellipse rx={n.rx * width * 0.55} ry={n.ry * height * 0.55} fill={`hsl(${nHue}, 85%, 70%)`} opacity={0.14 * cosmicGlow} />
        <ellipse rx={n.rx * width * 0.25} ry={n.ry * height * 0.25} fill={`hsl(${nHue}, 95%, 82%)`} opacity={0.18 * cosmicGlow} />
      </g>
    );
  });

  // Cosmic dust particles
  const particleNodes = particles.map((p, i) => {
    const t = frame * p.speed + p.phase;
    const ang = p.baseAngle + t * 0.4;
    const rad = p.baseRadius + Math.sin(t) * 18;
    const px = cx + Math.cos(ang) * rad;
    const py = cy + Math.sin(ang) * rad * 0.8;
    const flicker = 0.55 + Math.sin(t * 2.1) * 0.4;
    return (
      <circle key={`dust-${i}`} cx={px} cy={py} r={p.size * (0.7 + wingGlow * 0.5)}
        fill={tintCore} opacity={0.45 * flicker * wingGlow} />
    );
  });

  // ─── EAGLE BUILDER ───
  function buildWing(side: -1 | 1): React.ReactNode {
    const dir = side;
    const wingTipX = cx + dir * (wingSpan / 2);
    const wingTipY = cy + wingFlap * (dir === -1 ? 1 : -1) * 0.5 + wingLift * 0.3;
    const wingMidX = cx + dir * (wingSpan / 4);
    const wingMidY = cy - wingLift * 0.7 + wingFlap * 0.3;
    const wingRootX = cx + dir * (bodyW * 0.6);
    const wingRootY = cy - bodyH * 0.15;

    const wingPath = `M ${wingRootX} ${wingRootY}
      Q ${wingMidX} ${wingMidY - eagleH * 0.18} ${wingTipX} ${wingTipY}
      Q ${wingMidX} ${wingMidY + eagleH * 0.04} ${wingRootX} ${wingRootY + bodyH * 0.35} Z`;

    const primaries: React.ReactNode[] = [];
    for (let f = 0; f < FEATHER_PER_WING; f++) {
      const t = f / (FEATHER_PER_WING - 1);
      const fx0 = cx + dir * (bodyW * 0.6 + (wingSpan / 2 - bodyW * 0.6) * t);
      const fy0 = cy - bodyH * 0.15 + (wingTipY - (cy - bodyH * 0.15)) * t + Math.sin(t * Math.PI) * (-eagleH * 0.16);
      const fLen = 50 + Math.sin(t * Math.PI) * (60 + wingDrive * 30);
      const fAng = Math.PI * (0.55 + t * 0.35);
      const fx1 = fx0 + Math.cos(fAng) * fLen * dir;
      const fy1 = fy0 + Math.sin(fAng) * fLen + 20;
      const fOpacity = 0.7 + Math.sin(flapPhase + f * 0.3) * 0.1;
      primaries.push(
        <g key={`pf-${dir}-${f}`}>
          <path d={`M ${fx0} ${fy0} Q ${(fx0 + fx1) / 2 + dir * 4} ${(fy0 + fy1) / 2 - 6} ${fx1} ${fy1}`}
            stroke={tintDeep} strokeWidth={6} fill="none" strokeLinecap="round" opacity={fOpacity * 0.85} />
          <path d={`M ${fx0} ${fy0} Q ${(fx0 + fx1) / 2 + dir * 4} ${(fy0 + fy1) / 2 - 6} ${fx1} ${fy1}`}
            stroke={tintColor} strokeWidth={3} fill="none" strokeLinecap="round" opacity={fOpacity} />
          <path d={`M ${fx0} ${fy0} Q ${(fx0 + fx1) / 2 + dir * 4} ${(fy0 + fy1) / 2 - 6} ${fx1} ${fy1}`}
            stroke={tintCore} strokeWidth={1} fill="none" strokeLinecap="round" opacity={fOpacity * wingGlow} />
        </g>
      );
    }

    const coverts: React.ReactNode[] = [];
    for (let f = 0; f < COVERT_PER_WING; f++) {
      const t = f / (COVERT_PER_WING - 1);
      const cxF = cx + dir * (bodyW * 0.6 + (wingSpan / 2.5) * t);
      const cyF = cy - bodyH * 0.10 - Math.sin(t * Math.PI) * eagleH * 0.10;
      coverts.push(
        <ellipse key={`cv-${dir}-${f}`} cx={cxF} cy={cyF} rx={9} ry={5}
          transform={`rotate(${dir * 30 - t * 14}, ${cxF}, ${cyF})`}
          fill={tintColor} stroke={tintDeep} strokeWidth={0.8} opacity={0.85} />
      );
    }

    return (
      <g key={`wing-${dir}`}>
        <path d={wingPath} fill={tintColor} opacity={0.10 * wingGlow * eaglePulse} />
        <path d={wingPath} fill="rgba(20, 28, 42, 0.92)" stroke={tintDeep} strokeWidth={1.2} />
        <path d={wingPath} fill={tintCore} opacity={0.12 * wingGlow} />
        {primaries}
        {coverts}
      </g>
    );
  }

  const bodyPath = `M ${cx} ${cy - bodyH * 0.5}
    Q ${cx + bodyW} ${cy - bodyH * 0.2} ${cx + bodyW * 0.7} ${cy + bodyH * 0.5}
    Q ${cx} ${cy + bodyH * 0.6} ${cx - bodyW * 0.7} ${cy + bodyH * 0.5}
    Q ${cx - bodyW} ${cy - bodyH * 0.2} ${cx} ${cy - bodyH * 0.5} Z`;

  const headCx = cx;
  const headCy = cy - bodyH * 0.55;
  const headR = bodyW * 0.85;
  const beakX = headCx + Math.sin((headTilt * Math.PI) / 180) * 6;
  const beakY = headCy + headR * 0.55;

  // Tail feathers
  const tailNodes: React.ReactNode[] = [];
  for (let i = 0; i < TAIL_FEATHER_COUNT; i++) {
    const t = (i / (TAIL_FEATHER_COUNT - 1) - 0.5) * 2;
    const tx0 = cx + t * bodyW * 0.5;
    const ty0 = cy + bodyH * 0.5;
    const tx1 = cx + t * bodyW * 1.4 + tailFlick * t * 0.3;
    const ty1 = ty0 + bodyH * 0.55 + Math.abs(t) * 12;
    tailNodes.push(
      <g key={`tail-${i}`}>
        <path d={`M ${tx0} ${ty0} Q ${(tx0 + tx1) / 2} ${(ty0 + ty1) / 2 + 6} ${tx1} ${ty1}`}
          stroke={tintDeep} strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.85} />
        <path d={`M ${tx0} ${ty0} Q ${(tx0 + tx1) / 2} ${(ty0 + ty1) / 2 + 6} ${tx1} ${ty1}`}
          stroke="rgba(245, 240, 220, 0.95)" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      </g>
    );
  }

  // Talons
  const talonY = cy + bodyH * 0.6;
  const talonNodes = (
    <g>
      {[-1, 0, 1].map((side) => (
        <g key={`talon-${side}`}>
          <path d={`M ${cx + side * 14} ${talonY}
            Q ${cx + side * 16} ${talonY + 14} ${cx + side * 18 + side * 4} ${talonY + 22}`}
            stroke="rgba(220, 180, 60, 0.9)" strokeWidth={3.4} fill="none" strokeLinecap="round" />
          <path d={`M ${cx + side * 14} ${talonY}
            Q ${cx + side * 16} ${talonY + 14} ${cx + side * 18 + side * 4} ${talonY + 22}`}
            stroke="rgba(255, 220, 120, 1)" strokeWidth={1.4} fill="none" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="ce-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <radialGradient id="ce-eagle-halo">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.45} />
            <stop offset="40%" stopColor={tintColor} stopOpacity={0.18} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="ce-head-grad">
            <stop offset="0%" stopColor="#fefef8" />
            <stop offset="60%" stopColor="#e6e0c4" />
            <stop offset="100%" stopColor="#9c8a60" />
          </radialGradient>
          <linearGradient id="ce-body-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(40, 30, 20, 0.96)" />
            <stop offset="100%" stopColor="rgba(18, 14, 10, 0.98)" />
          </linearGradient>
          <filter id="ce-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        <rect width={width} height={height} fill="url(#ce-sky)" />
        <g filter="url(#ce-blur)">{nebulaNodes}</g>
        {starNodes}

        <ellipse cx={cx} cy={cy} rx={eagleW * 0.62 * eaglePulse} ry={eagleH * 0.52 * eaglePulse}
          fill="url(#ce-eagle-halo)" style={{ mixBlendMode: "screen" }} />

        <g style={{ mixBlendMode: "screen" }}>{particleNodes}</g>

        {buildWing(-1)}
        {buildWing(1)}

        <path d={bodyPath} fill="url(#ce-body-grad)" stroke={tintDeep} strokeWidth={1.4} />
        {Array.from({ length: 18 }).map((_, i) => {
          const ty = cy - bodyH * 0.4 + i * (bodyH * 0.85 / 18);
          return (
            <line key={`bs-${i}`}
              x1={cx - bodyW * 0.6} y1={ty}
              x2={cx + bodyW * 0.6} y2={ty + (i % 2 === 0 ? 1 : -1)}
              stroke="rgba(80, 70, 50, 0.5)" strokeWidth={0.6} />
          );
        })}

        {tailNodes}
        {talonNodes}

        <g transform={`rotate(${headTilt}, ${headCx}, ${headCy})`}>
          <circle cx={headCx} cy={headCy} r={headR + 4} fill={tintColor} opacity={0.18 * wingGlow} />
          <circle cx={headCx} cy={headCy} r={headR} fill="url(#ce-head-grad)" stroke="rgba(60, 48, 24, 0.9)" strokeWidth={1.6} />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const r0 = headR * 0.6;
            const r1 = headR * 0.95;
            return (
              <line key={`hf-${i}`}
                x1={headCx + Math.cos(a) * r0} y1={headCy + Math.sin(a) * r0}
                x2={headCx + Math.cos(a) * r1} y2={headCy + Math.sin(a) * r1}
                stroke="rgba(140, 120, 80, 0.55)" strokeWidth={0.9} />
            );
          })}
          <circle cx={headCx + 6} cy={headCy - 2} r={5} fill="#1a1208" />
          <circle cx={headCx + 6} cy={headCy - 2} r={3.6} fill="#fcc83a" />
          <circle cx={headCx + 6} cy={headCy - 2} r={1.6} fill="#1a1208" />
          <circle cx={headCx + 7} cy={headCy - 3} r={0.7} fill="#fff" opacity={0.95} />
          <path d={`M ${headCx - 2} ${headCy - 6} Q ${headCx + 6} ${headCy - 10} ${headCx + 14} ${headCy - 4}`}
            stroke="rgba(40, 28, 12, 0.9)" strokeWidth={1.6} fill="none" />
          <path d={`M ${headCx - 4} ${beakY - 4} Q ${headCx + 6} ${beakY + 4} ${beakX + 18} ${beakY + 12} Q ${headCx + 4} ${beakY + 6} ${headCx - 4} ${beakY - 4} Z`}
            fill="#f4c544" stroke="rgba(120, 80, 12, 0.9)" strokeWidth={1.2} />
          <path d={`M ${headCx} ${beakY + 6} Q ${headCx + 8} ${beakY + 9} ${beakX + 14} ${beakY + 11}`}
            stroke="rgba(120, 80, 12, 0.7)" strokeWidth={0.6} fill="none" />
        </g>

        <circle cx={cx} cy={cy} r={(20 + wingGlow * 14) * eaglePulse}
          fill={tintCore} opacity={0.18 * cosmicGlow} style={{ mixBlendMode: "screen" }} />

        <path d={`M ${cx - eagleW * 0.45} ${cy - eagleH * 0.55}
          Q ${cx} ${cy - eagleH * 0.85} ${cx + eagleW * 0.45} ${cy - eagleH * 0.55}`}
          stroke={tintCore} strokeWidth={1.6} fill="none" opacity={0.4 * cosmicGlow} strokeDasharray="2 6" />
        <path d={`M ${cx - eagleW * 0.50} ${cy + eagleH * 0.55}
          Q ${cx} ${cy + eagleH * 0.78} ${cx + eagleW * 0.50} ${cy + eagleH * 0.55}`}
          stroke={tintCore} strokeWidth={1.4} fill="none" opacity={0.32 * cosmicGlow} strokeDasharray="2 6" />
      </svg>
    </div>
  );
};
