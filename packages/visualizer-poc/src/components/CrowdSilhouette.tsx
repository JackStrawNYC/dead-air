/**
 * CrowdSilhouette — A+++ overlay: POV from the back of the crowd looking
 * toward a stage. Heads/shoulders fill the bottom third in 3 depth bands;
 * a stage truss with band silhouettes glows at the back; phones and lighters
 * sparkle above the heads; haze fog drifts; bass thumps the row, beat pulses
 * the stage lights. Like being in the audience at a Dead show.
 *
 * Audio reactivity:
 *   slowEnergy   → stage atmospheric glow & smoke density
 *   energy       → arm/phone raise + halo brightness
 *   bass         → row sway and ground rumble
 *   beatDecay    → stage spotlight pulse
 *   onsetEnvelope→ flash flares from the stage
 *   chromaHue    → stage light tint
 *   tempoFactor  → light sweep speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 800;
const FRONT_HEAD_COUNT = 16;
const MID_HEAD_COUNT = 22;
const BACK_HEAD_COUNT = 26;
const PHONE_COUNT = 22;
const LIGHTER_COUNT = 14;
const STAGE_LIGHT_COUNT = 9;
const STAR_COUNT = 50;
const SMOKE_COUNT = 12;

interface Head {
  x: number;
  size: number;
  hairStyle: 0 | 1 | 2 | 3;
  hatType: 0 | 1 | 2;
  shoulderW: number;
  bobPhase: number;
  swayPhase: number;
  shade: number;
}

interface Phone {
  x: number;
  y: number;
  raise: number;
  tilt: number;
  brightness: number;
  phase: number;
}

interface Lighter {
  x: number;
  y: number;
  raise: number;
  flickerSpeed: number;
  phase: number;
}

interface StageLight {
  x: number;
  hueOffset: number;
  speed: number;
  phase: number;
  baseAngle: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

interface SmokeBlob {
  x: number;
  y: number;
  rx: number;
  ry: number;
  drift: number;
  phase: number;
}

function buildHeads(seed: number, count: number): Head[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: (i + 0.4 + rng() * 0.2) / count,
    size: 0.85 + rng() * 0.4,
    hairStyle: Math.floor(rng() * 4) as 0 | 1 | 2 | 3,
    hatType: rng() < 0.35 ? (Math.floor(rng() * 3) as 0 | 1 | 2) : 0,
    shoulderW: 1.4 + rng() * 0.8,
    bobPhase: rng() * Math.PI * 2,
    swayPhase: rng() * Math.PI * 2,
    shade: 0.05 + rng() * 0.15,
  }));
}

function buildPhones(): Phone[] {
  const rng = seeded(58_223_481);
  return Array.from({ length: PHONE_COUNT }, () => ({
    x: rng(),
    y: 0.45 + rng() * 0.20,
    raise: 0.5 + rng() * 0.5,
    tilt: (rng() - 0.5) * 0.5,
    brightness: 0.6 + rng() * 0.4,
    phase: rng() * Math.PI * 2,
  }));
}

function buildLighters(): Lighter[] {
  const rng = seeded(73_119_226);
  return Array.from({ length: LIGHTER_COUNT }, () => ({
    x: rng(),
    y: 0.50 + rng() * 0.18,
    raise: 0.6 + rng() * 0.4,
    flickerSpeed: 0.10 + rng() * 0.30,
    phase: rng() * Math.PI * 2,
  }));
}

function buildStageLights(): StageLight[] {
  const rng = seeded(46_018_752);
  return Array.from({ length: STAGE_LIGHT_COUNT }, (_, i) => ({
    x: 0.18 + (i / (STAGE_LIGHT_COUNT - 1)) * 0.64,
    hueOffset: -50 + rng() * 100,
    speed: 0.005 + rng() * 0.012,
    phase: rng() * Math.PI * 2,
    baseAngle: -Math.PI / 2 + (rng() - 0.5) * 0.5,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(97_550_113);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.36,
    size: 0.4 + rng() * 1.5,
    phase: rng() * Math.PI * 2,
  }));
}

function buildSmoke(): SmokeBlob[] {
  const rng = seeded(28_440_905);
  return Array.from({ length: SMOKE_COUNT }, () => ({
    x: rng(),
    y: 0.36 + rng() * 0.14,
    rx: 0.10 + rng() * 0.16,
    ry: 0.04 + rng() * 0.05,
    drift: 0.0001 + rng() * 0.00035,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CrowdSilhouette: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const frontHeads = React.useMemo(() => buildHeads(11_009_211, FRONT_HEAD_COUNT), []);
  const midHeads = React.useMemo(() => buildHeads(22_018_322, MID_HEAD_COUNT), []);
  const backHeads = React.useMemo(() => buildHeads(33_027_433, BACK_HEAD_COUNT), []);
  const phones = React.useMemo(buildPhones, []);
  const lighters = React.useMemo(buildLighters, []);
  const stageLights = React.useMemo(buildStageLights, []);
  const stars = React.useMemo(buildStars, []);
  const smoke = React.useMemo(buildSmoke, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const stageGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const energy = snap.energy;
  const bass = snap.bass;
  const beatPulse = 1 + snap.beatDecay * 0.4;
  const onsetFlash = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.7) : 0;

  const baseHue = 32;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.5) % 360 + 360) % 360;
  const lightCore = `hsl(${tintHue}, 95%, 80%)`;
  const lightWarm = `hsl(${(tintHue + 14) % 360}, 90%, 65%)`;

  const skyTop = `hsl(${(tintHue + 220) % 360}, 32%, 6%)`;
  const skyMid = `hsl(${(tintHue + 240) % 360}, 26%, 11%)`;
  const skyHorizon = `hsl(${(tintHue + 16) % 360}, 38%, 18%)`;

  const stageY = height * 0.46;
  const stageH = height * 0.16;
  const crowdBaseY = height * 0.99;

  // ===== Render head silhouette =====
  function renderHead(h: Head, rowIndex: 0 | 1 | 2, key: string) {
    const baseScale = rowIndex === 0 ? 1.0 : rowIndex === 1 ? 0.78 : 0.58;
    const baseY =
      rowIndex === 0
        ? crowdBaseY - height * 0.04
        : rowIndex === 1
        ? crowdBaseY - height * 0.10
        : crowdBaseY - height * 0.16;
    const headR = 28 * baseScale * h.size;
    const px = h.x * width;
    const sway = Math.sin(frame * 0.012 * tempoFactor + h.swayPhase) * (3 + bass * 8) * baseScale;
    const bob = Math.abs(Math.sin(frame * 0.035 * tempoFactor + h.bobPhase)) * (2 + energy * 6) * baseScale;
    const cy = baseY - headR * 1.05 - bob;
    const cx = px + sway;
    const fillIntensity = Math.round(7 - rowIndex * 1.8);
    const headFill = `rgba(${fillIntensity},${fillIntensity},${fillIntensity + 6},${0.96 - rowIndex * 0.12})`;
    const rimColor = `hsla(${tintHue}, 85%, 65%, ${(0.16 - rowIndex * 0.04) * beatPulse})`;
    return (
      <g key={key}>
        {/* Shoulders */}
        <path
          d={`M ${cx - headR * h.shoulderW * 1.4} ${baseY}
              Q ${cx - headR * h.shoulderW} ${cy + headR * 0.6} ${cx - headR * 0.7} ${cy + headR * 0.4}
              L ${cx + headR * 0.7} ${cy + headR * 0.4}
              Q ${cx + headR * h.shoulderW} ${cy + headR * 0.6} ${cx + headR * h.shoulderW * 1.4} ${baseY} Z`}
          fill={headFill}
        />
        {/* Neck */}
        <rect x={cx - headR * 0.30} y={cy + headR * 0.7} width={headR * 0.6} height={headR * 0.5} fill={headFill} />
        {/* Head circle */}
        <circle cx={cx} cy={cy} r={headR} fill={headFill} />
        {/* Hair styles */}
        {h.hairStyle === 0 && (
          <path
            d={`M ${cx - headR} ${cy - headR * 0.2}
                Q ${cx} ${cy - headR * 1.2} ${cx + headR} ${cy - headR * 0.2} L ${cx + headR * 0.9} ${cy - headR * 0.4}
                Q ${cx} ${cy - headR * 1.0} ${cx - headR * 0.9} ${cy - headR * 0.4} Z`}
            fill={headFill}
          />
        )}
        {h.hairStyle === 1 && (
          <path
            d={`M ${cx - headR * 1.05} ${cy - headR * 0.25}
                Q ${cx} ${cy - headR * 1.4} ${cx + headR * 1.05} ${cy - headR * 0.25}
                L ${cx + headR * 1.2} ${cy + headR * 1.6}
                Q ${cx} ${cy + headR * 1.2} ${cx - headR * 1.2} ${cy + headR * 1.6} Z`}
            fill={headFill}
          />
        )}
        {h.hairStyle === 2 && (
          <circle cx={cx} cy={cy - headR * 0.2} r={headR * 1.35} fill={headFill} />
        )}
        {h.hairStyle === 3 && (
          <path
            d={`M ${cx - headR * 1.1} ${cy - headR * 0.2}
                Q ${cx - headR * 0.8} ${cy - headR * 1.5} ${cx - headR * 0.2} ${cy - headR * 1.0}
                Q ${cx + headR * 0.2} ${cy - headR * 1.6} ${cx + headR * 0.8} ${cy - headR * 1.0}
                Q ${cx + headR * 1.2} ${cy - headR * 0.8} ${cx + headR * 1.1} ${cy - headR * 0.2}
                L ${cx + headR * 0.9} ${cy - headR * 0.4}
                Q ${cx} ${cy - headR * 1.0} ${cx - headR * 0.9} ${cy - headR * 0.4} Z`}
            fill={headFill}
          />
        )}
        {/* Hat */}
        {h.hatType === 1 && (
          <ellipse cx={cx} cy={cy - headR * 0.85} rx={headR * 1.5} ry={headR * 0.35} fill={headFill} />
        )}
        {h.hatType === 2 && (
          <rect x={cx - headR * 0.95} y={cy - headR * 0.4} width={headR * 1.9} height={headR * 0.30} fill={headFill} />
        )}
        {/* Rim halo */}
        <circle cx={cx} cy={cy - headR * 0.4} r={headR * 0.7} fill={rimColor} />
      </g>
    );
  }

  // ===== stage lights with cones =====
  const stageBeams = stageLights.map((s, i) => {
    const angle = s.baseAngle + Math.sin(frame * s.speed + s.phase) * 0.35;
    const sx = s.x * width;
    const sy = stageY + 6;
    const len = height * 0.22;
    const ex = sx + Math.cos(angle + Math.PI / 2) * len;
    const ey = sy - Math.abs(Math.sin(angle + Math.PI / 2)) * len;
    const w = 50 + beatPulse * 12;
    const beamHue = (tintHue + s.hueOffset + 360) % 360;
    const beamColor = `hsl(${beamHue}, 92%, 70%)`;
    return (
      <g key={`sb-${i}`} style={{ mixBlendMode: "screen" }}>
        <path
          d={`M ${sx - 4} ${sy}
              L ${ex - w * 0.5} ${ey}
              L ${ex + w * 0.5} ${ey}
              L ${sx + 4} ${sy} Z`}
          fill={beamColor}
          opacity={0.10 * stageGlow}
        />
        <path
          d={`M ${sx - 2} ${sy}
              L ${ex - w * 0.22} ${ey}
              L ${ex + w * 0.22} ${ey}
              L ${sx + 2} ${sy} Z`}
          fill={beamColor}
          opacity={0.22 * stageGlow}
        />
        <circle cx={sx} cy={sy} r={4 + beatPulse * 2} fill={beamColor} opacity={0.8} />
      </g>
    );
  });

  // ===== smoke =====
  const smokeNodes = smoke.map((c, i) => {
    const drift = (c.x + frame * c.drift) % 1.2 - 0.1;
    const breath = 1 + Math.sin(frame * 0.012 + c.phase) * 0.06;
    return (
      <ellipse
        key={`sm-${i}`}
        cx={drift * width}
        cy={c.y * height}
        rx={c.rx * width * breath}
        ry={c.ry * height * breath}
        fill={`rgba(40, 30, 50, ${0.45 + stageGlow * 0.20})`}
      />
    );
  });

  // ===== stars =====
  const starNodes = stars.map((s, i) => {
    const tw = 0.5 + Math.sin(frame * 0.05 + s.phase) * 0.45;
    return <circle key={`star-${i}`} cx={s.x * width} cy={s.y * height} r={s.size * tw} fill="rgba(240, 232, 220, 0.85)" />;
  });

  // ===== phones =====
  const phoneNodes = phones.map((p, i) => {
    const t = frame * 0.018 + p.phase;
    const raiseAmt = (0.6 + energy * 0.4) * p.raise;
    const px = p.x * width;
    const py = p.y * height - raiseAmt * 30 + Math.sin(t) * 4;
    const glow = 0.6 + Math.sin(t * 1.4) * 0.3 * p.brightness;
    return (
      <g key={`ph-${i}`}>
        <circle cx={px} cy={py} r={18 + beatPulse * 6} fill="rgba(180, 220, 255, 0.10)" />
        <circle cx={px} cy={py} r={9} fill="rgba(180, 220, 255, 0.30)" />
        <rect
          x={px - 4}
          y={py - 6}
          width={8}
          height={12}
          rx={1.2}
          fill="rgba(220, 240, 255, 0.95)"
          opacity={glow}
          transform={`rotate(${p.tilt * 30}, ${px}, ${py})`}
        />
      </g>
    );
  });

  // ===== lighters =====
  const lighterNodes = lighters.map((l, i) => {
    const t = frame * l.flickerSpeed + l.phase;
    const flicker = 0.7 + Math.sin(t * 3.2) * 0.3;
    const lx = l.x * width;
    const ly = l.y * height - l.raise * 40 + Math.sin(t) * 3;
    return (
      <g key={`lt-${i}`} style={{ mixBlendMode: "screen" }}>
        <circle cx={lx} cy={ly} r={26 + beatPulse * 6} fill="rgba(255, 200, 80, 0.10)" />
        <circle cx={lx} cy={ly} r={12} fill="rgba(255, 220, 120, 0.30)" />
        <ellipse cx={lx} cy={ly - 2} rx={3.4} ry={6 * flicker} fill="rgba(255, 200, 80, 0.90)" />
        <ellipse cx={lx} cy={ly - 3} rx={1.6} ry={4 * flicker} fill="rgba(255, 250, 220, 0.95)" />
      </g>
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="cs-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <radialGradient id="cs-stagewash" cx="0.5" cy="1" r="0.6">
            <stop offset="0%" stopColor={lightCore} stopOpacity="0.55" />
            <stop offset="100%" stopColor={lightWarm} stopOpacity="0" />
          </radialGradient>
          <filter id="cs-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#cs-sky)" />

        {/* Stars */}
        <g>{starNodes}</g>

        {/* Stage backwash glow */}
        <ellipse cx={width * 0.5} cy={stageY + 30} rx={width * 0.6} ry={height * 0.18} fill="url(#cs-stagewash)" />

        {/* Stage truss */}
        <g opacity={0.85}>
          <rect x={width * 0.14} y={stageY - 6} width={width * 0.72} height={4} fill="rgba(20, 16, 26, 0.95)" />
          <rect x={width * 0.14} y={stageY - 6} width={6} height={stageH + 6} fill="rgba(20, 16, 26, 0.95)" />
          <rect x={width * 0.86 - 6} y={stageY - 6} width={6} height={stageH + 6} fill="rgba(20, 16, 26, 0.95)" />
          {Array.from({ length: 16 }).map((_, i) => (
            <line
              key={`td-${i}`}
              x1={width * 0.14 + i * (width * 0.72 / 16)}
              y1={stageY - 2}
              x2={width * 0.14 + (i + 1) * (width * 0.72 / 16)}
              y2={stageY + 6}
              stroke="rgba(30, 24, 38, 0.7)"
              strokeWidth={1}
            />
          ))}
          <rect x={width * 0.18} y={stageY - 2} width={26} height={48} rx={3} fill="rgba(15, 10, 20, 0.95)" />
          <rect x={width * 0.78} y={stageY - 2} width={26} height={48} rx={3} fill="rgba(15, 10, 20, 0.95)" />
          <rect x={width * 0.10} y={stageY + stageH} width={width * 0.80} height={6} fill="rgba(8, 4, 14, 0.95)" />
        </g>

        {/* Stage band silhouettes */}
        <g>
          {[0.35, 0.50, 0.65].map((px, i) => {
            const x = px * width;
            const y = stageY + stageH - 4;
            const figH = stageH * 0.78;
            return (
              <g key={`band-${i}`}>
                <path
                  d={`M ${x - figH * 0.18} ${y}
                      Q ${x - figH * 0.20} ${y - figH * 0.55} ${x - figH * 0.10} ${y - figH * 0.78}
                      L ${x + figH * 0.10} ${y - figH * 0.78}
                      Q ${x + figH * 0.20} ${y - figH * 0.55} ${x + figH * 0.18} ${y} Z`}
                  fill="rgba(6, 3, 10, 0.95)"
                />
                <circle cx={x} cy={y - figH * 0.86} r={figH * 0.10} fill="rgba(6, 3, 10, 0.95)" />
              </g>
            );
          })}
          <ellipse cx={width * 0.50} cy={stageY + stageH - 8} rx={28} ry={10} fill="rgba(6, 3, 10, 0.95)" />
          <rect x={width * 0.50 - 18} y={stageY + stageH - 22} width={36} height={14} rx={4} fill="rgba(8, 4, 14, 0.95)" />
        </g>

        {/* Smoke */}
        <g filter="url(#cs-blur)">{smokeNodes}</g>

        {/* Stage spotlight beams */}
        <g>{stageBeams}</g>

        {/* Onset flash */}
        {onsetFlash > 0 && (
          <rect width={width} height={height} fill={`hsla(${tintHue}, 90%, 80%, ${onsetFlash * 0.10})`} />
        )}

        {/* Back row of crowd */}
        <g>{backHeads.map((h, i) => renderHead(h, 2, `back-${i}`))}</g>

        {/* Lighters layer */}
        <g>{lighterNodes}</g>

        {/* Phones layer */}
        <g>{phoneNodes}</g>

        {/* Mid row */}
        <g>{midHeads.map((h, i) => renderHead(h, 1, `mid-${i}`))}</g>

        {/* Front row (foreground) */}
        <g>{frontHeads.map((h, i) => renderHead(h, 0, `front-${i}`))}</g>

        {/* Final atmospheric wash */}
        <rect
          width={width}
          height={height}
          fill={`hsla(${tintHue}, 60%, 50%, ${0.04 + stageGlow * 0.04})`}
          style={{ mixBlendMode: "screen" }}
        />
      </svg>
    </div>
  );
};
