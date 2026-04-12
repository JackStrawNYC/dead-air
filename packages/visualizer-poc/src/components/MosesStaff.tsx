/**
 * MosesStaff — A+++ overlay for "Greatest Story Ever Told" (Bob Weir).
 * Moses' shepherd staff before a stormy parting sea, stone tablets floating,
 * Mount Sinai brooding in the distance, divine god-rays from the crook.
 *
 * Audio reactivity:
 *   slowEnergy → divine glow / sky warmth
 *   energy → ray brightness + particle drift
 *   bass → storm intensity, cloud churn, lightning probability
 *   beatDecay → staff glow pulse
 *   onsetEnvelope → lightning strike trigger
 *   chromaHue → divine light tint (gold ↔ violet ↔ celestial)
 *   tempoFactor → ray rotation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const RAY_COUNT = 14;
const PARTICLE_COUNT = 64;
const CLOUD_COUNT = 9;
const REED_COUNT = 22;
const WAVE_COUNT = 10;

interface Particle { baseAngle: number; baseRadius: number; speed: number; size: number; drift: number; phase: number; }
interface Cloud { cx: number; cy: number; rx: number; ry: number; drift: number; shade: number; }
interface Reed { x: number; height: number; sway: number; phase: number; }

function buildParticles(): Particle[] {
  const rng = seeded(91_447_233);
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    baseAngle: rng() * Math.PI * 2,
    baseRadius: 60 + rng() * 240,
    speed: 0.004 + rng() * 0.012,
    size: 1.2 + rng() * 3.4,
    drift: 6 + rng() * 14,
    phase: rng() * Math.PI * 2,
  }));
}

function buildClouds(): Cloud[] {
  const rng = seeded(73_882_165);
  return Array.from({ length: CLOUD_COUNT }, () => ({
    cx: rng(),
    cy: 0.05 + rng() * 0.32,
    rx: 0.18 + rng() * 0.22,
    ry: 0.05 + rng() * 0.07,
    drift: 0.0001 + rng() * 0.00035,
    shade: 0.18 + rng() * 0.34,
  }));
}

function buildReeds(): Reed[] {
  const rng = seeded(55_211_904);
  return Array.from({ length: REED_COUNT }, () => ({
    x: rng(),
    height: 28 + rng() * 70,
    sway: 0.003 + rng() * 0.012,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const MosesStaff: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const particles = React.useMemo(buildParticles, []);
  const clouds = React.useMemo(buildClouds, []);
  const reeds = React.useMemo(buildReeds, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives
  const divineGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rayBright = interpolate(snap.energy, [0.02, 0.30], [0.20, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stormDrive = interpolate(snap.bass, [0.0, 0.65], [0.30, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const staffPulse = 1 + snap.beatDecay * 0.35;
  const flashSeed = (frame * 0.137 + Math.sin(frame * 0.041) * 1.7) % 1;
  const lightningFlash = snap.onsetEnvelope > 0.55 && flashSeed > 0.74
    ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.7) : 0;

  // Divine light tint — gold base, modulated by chromaHue
  const baseHue = 44;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.35) % 360 + 360) % 360;
  const tintLight = 70 + rayBright * 12;
  const tintColor = `hsl(${tintHue}, 70%, ${tintLight}%)`;
  const tintCore = `hsl(${tintHue}, 88%, ${Math.min(96, tintLight + 18)}%)`;
  const rayRotation = (frame * 0.18 * tempoFactor) % 360;

  // Geometry
  const cx = width * 0.5;
  const cy = height * 0.5;
  const staffLen = Math.min(width, height) * 0.62;
  const staffTop = cy - staffLen * 0.55;
  const staffBot = cy + staffLen * 0.45;
  const staffTilt = Math.sin(frame * 0.004) * 3 - 4;
  const crookCenterY = staffTop + 18;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 32%, 8%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 24%, 14%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 38%, 22%)`;

  // God rays — 3 layers each (atmospheric, main, bright core)
  const rays: React.ReactNode[] = [];
  for (let r = 0; r < RAY_COUNT; r++) {
    const a = (r / RAY_COUNT) * Math.PI * 2 + (rayRotation * Math.PI) / 180;
    const lengthBoost = 0.85 + (Math.cos(a - Math.PI / 2) * 0.5 + 0.5) * 0.4; // brighter at crook end
    const len = staffLen * 1.2 * lengthBoost * (0.85 + rayBright * 0.45);
    const x2 = Math.cos(a) * len;
    const y2 = Math.sin(a) * len;
    const w0 = 14 + rayBright * 18;
    rays.push(
      <g key={`ray-${r}`}>
        <path d={`M 0 0 L ${x2 - w0 * 0.6} ${y2} L ${x2 + w0 * 0.6} ${y2} Z`} fill={tintColor} opacity={0.10 * rayBright} />
        <path d={`M 0 0 L ${x2 - w0 * 0.32} ${y2} L ${x2 + w0 * 0.32} ${y2} Z`} fill={tintColor} opacity={0.22 * rayBright} />
        <path d={`M 0 0 L ${x2 - w0 * 0.12} ${y2} L ${x2 + w0 * 0.12} ${y2} Z`} fill={tintCore} opacity={0.40 * rayBright} />
      </g>,
    );
  }

  // Storm clouds
  const cloudNodes = clouds.map((c, i) => {
    const cxN = ((c.cx + frame * c.drift * (1 + stormDrive * 0.6)) % 1.2) - 0.1;
    const churn = 1 + stormDrive * 0.18 + Math.sin(frame * 0.012 + i) * 0.04;
    return (
      <ellipse key={`cloud-${i}`} cx={cxN * width} cy={c.cy * height}
        rx={c.rx * width * churn} ry={c.ry * height * churn}
        fill={`rgba(${20 + c.shade * 10}, ${22 + c.shade * 10}, ${30 + c.shade * 12}, ${0.55 + stormDrive * 0.22})`} />
    );
  });

  // Reeds (skip near staff base)
  const reedNodes = reeds.map((r, i) => {
    const x = r.x * width;
    if (Math.abs(x - cx) < 60) return null;
    const sway = Math.sin(frame * r.sway + r.phase) * 6;
    const baseY = height * 0.78;
    return (
      <path key={`reed-${i}`}
        d={`M ${x} ${baseY} Q ${x + sway} ${baseY - r.height * 0.55} ${x + sway * 1.6} ${baseY - r.height}`}
        stroke="rgba(40, 55, 35, 0.65)" strokeWidth={1.4} fill="none" />
    );
  });

  // Parted-sea wave walls
  const waveLeftPaths: React.ReactNode[] = [];
  const waveRightPaths: React.ReactNode[] = [];
  const waterY = height * 0.78;
  const waterH = height * 0.22;
  for (let w = 0; w < WAVE_COUNT; w++) {
    const yT = waterY + (w / WAVE_COUNT) * waterH;
    const phase = frame * 0.04 + w * 0.7;
    const ampL = 18 + Math.sin(phase) * 12;
    const ampR = 18 + Math.cos(phase * 1.1) * 12;
    const leftEdge = cx - 90 - w * 6 + Math.sin(phase * 1.3) * 8;
    const rightEdge = cx + 90 + w * 6 + Math.cos(phase * 1.4) * 8;
    waveLeftPaths.push(
      <path key={`wL-${w}`} d={`M 0 ${yT} Q ${leftEdge * 0.5} ${yT - ampL * 0.4} ${leftEdge} ${yT}`}
        stroke={`rgba(60, 90, 130, ${0.35 - w * 0.02})`} strokeWidth={2.4 - w * 0.15} fill="none" />,
    );
    waveRightPaths.push(
      <path key={`wR-${w}`} d={`M ${rightEdge} ${yT} Q ${(rightEdge + width) * 0.5} ${yT - ampR * 0.4} ${width} ${yT}`}
        stroke={`rgba(60, 90, 130, ${0.35 - w * 0.02})`} strokeWidth={2.4 - w * 0.15} fill="none" />,
    );
  }

  // Stone tablet builder — rounded top, weathered, Hebrew-suggesting lines
  const tabletDx = staffLen * 0.42;
  const tabletW = 110;
  const tabletH = 150;
  const tabletY = cy - 30;
  const tabletFloat = Math.sin(frame * 0.018) * 6;
  function buildTablet(side: -1 | 1): React.ReactNode {
    const tx = cx + side * tabletDx;
    const ty = tabletY + tabletFloat * (side === -1 ? 1 : -1);
    const lines: React.ReactNode[] = [];
    for (let li = 0; li < 8; li++) {
      const ly = ty - tabletH * 0.3 + li * 14;
      const segs = 4 + (li % 3);
      for (let s = 0; s < segs; s++) {
        const sx = tx - tabletW * 0.32 + s * (tabletW * 0.18);
        lines.push(
          <line key={`t${side}-l${li}-s${s}`} x1={sx} y1={ly} x2={sx + 8 + (s % 2) * 4} y2={ly}
            stroke="rgba(30, 22, 14, 0.55)" strokeWidth={1.4} strokeLinecap="round" />,
        );
      }
    }
    const tabletPath = `M ${tx - tabletW / 2} ${ty + tabletH / 2}
      L ${tx - tabletW / 2} ${ty - tabletH / 2 + 28}
      Q ${tx - tabletW / 2} ${ty - tabletH / 2} ${tx - tabletW / 2 + 28} ${ty - tabletH / 2}
      L ${tx + tabletW / 2 - 28} ${ty - tabletH / 2}
      Q ${tx + tabletW / 2} ${ty - tabletH / 2} ${tx + tabletW / 2} ${ty - tabletH / 2 + 28}
      L ${tx + tabletW / 2} ${ty + tabletH / 2} Z`;
    return (
      <g key={`tablet-${side}`} transform={`rotate(${side * 4}, ${tx}, ${ty})`}>
        <path d={tabletPath} fill="url(#tabletGrad)" stroke="rgba(20, 14, 8, 0.7)" strokeWidth={1.6} />
        <path d={`M ${tx - tabletW * 0.2} ${ty - tabletH * 0.3} L ${tx - tabletW * 0.05} ${ty + tabletH * 0.1}`}
          stroke="rgba(20, 14, 8, 0.25)" strokeWidth={0.8} fill="none" />
        <path d={`M ${tx + tabletW * 0.18} ${ty - tabletH * 0.1} L ${tx + tabletW * 0.06} ${ty + tabletH * 0.3}`}
          stroke="rgba(20, 14, 8, 0.22)" strokeWidth={0.7} fill="none" />
        {lines}
        <path d={tabletPath} fill={tintColor} opacity={0.10 * divineGlow} />
      </g>
    );
  }

  // Particles around the staff
  const particleNodes = particles.map((p, i) => {
    const t = frame * p.speed + p.phase;
    const ang = p.baseAngle + t;
    const rad = p.baseRadius + Math.sin(t * 1.3) * p.drift;
    const px = cx + Math.cos(ang) * rad;
    const py = (cy - 20) + Math.sin(ang) * rad * 0.85;
    const flicker = 0.55 + Math.sin(t * 2.1) * 0.35;
    return (
      <circle key={`p-${i}`} cx={px} cy={py} r={p.size * (0.7 + rayBright * 0.6)}
        fill={tintCore} opacity={0.42 * flicker * rayBright} />
    );
  });

  const staffWidth = 16;
  const gripStart = staffTop + staffLen * 0.40;
  const gripEnd = staffTop + staffLen * 0.55;

  // Wood-grain striations
  const grainLines = Array.from({ length: 24 }).map((_, gi) => {
    const gy = staffTop + 14 + gi * ((staffBot - staffTop - 18) / 24);
    return (
      <line key={`grain-${gi}`} x1={cx - staffWidth / 2 + 1} y1={gy}
        x2={cx + staffWidth / 2 - 1} y2={gy + (gi % 2 === 0 ? 1 : -1)}
        stroke="rgba(20, 12, 4, 0.45)" strokeWidth={0.6} />
    );
  });

  // Leather grip cross-hatch wraps
  const wrapLines = Array.from({ length: 12 }).map((_, wi) => {
    const wy = gripStart + 4 + wi * ((gripEnd - gripStart - 8) / 12);
    return (
      <g key={`wrap-${wi}`}>
        <line x1={cx - staffWidth / 2 - 2} y1={wy} x2={cx + staffWidth / 2 + 2} y2={wy + 2}
          stroke="rgba(8, 4, 1, 0.7)" strokeWidth={0.9} />
        <line x1={cx - staffWidth / 2 - 2} y1={wy + 1} x2={cx + staffWidth / 2 + 2} y2={wy + 3}
          stroke="rgba(80, 50, 18, 0.55)" strokeWidth={0.5} />
      </g>
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="moses-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="moses-mountain" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(38, 30, 42, 0.95)" />
            <stop offset="100%" stopColor="rgba(18, 14, 22, 0.98)" />
          </linearGradient>
          <linearGradient id="staff-wood" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2a1808" />
            <stop offset="35%" stopColor="#5a3818" />
            <stop offset="60%" stopColor="#7a4e22" />
            <stop offset="100%" stopColor="#1f1206" />
          </linearGradient>
          <linearGradient id="staff-leather" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1c0f06" />
            <stop offset="50%" stopColor="#3a200d" />
            <stop offset="100%" stopColor="#150a04" />
          </linearGradient>
          <linearGradient id="staff-metal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3a3530" />
            <stop offset="50%" stopColor="#9a8a70" />
            <stop offset="100%" stopColor="#2a2520" />
          </linearGradient>
          <linearGradient id="tabletGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7a6e5a" />
            <stop offset="50%" stopColor="#5c5240" />
            <stop offset="100%" stopColor="#3a3326" />
          </linearGradient>
          <radialGradient id="divine-glow">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.85} />
            <stop offset="35%" stopColor={tintColor} stopOpacity={0.40} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="scriptural-shaft" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.32} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </linearGradient>
          <filter id="cloudBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#moses-sky)" />

        {/* Stormy clouds */}
        <g filter="url(#cloudBlur)">{cloudNodes}</g>

        {/* Lightning */}
        {lightningFlash > 0 && (
          <>
            <rect width={width} height={height} fill={`rgba(255, 250, 230, ${lightningFlash * 0.18})`} />
            <path d={`M ${width * 0.18} 0 L ${width * 0.21} ${height * 0.12} L ${width * 0.17} ${height * 0.18} L ${width * 0.22} ${height * 0.32}`}
              stroke={`rgba(255, 250, 230, ${lightningFlash})`} strokeWidth={2.4} fill="none" />
            <path d={`M ${width * 0.78} 0 L ${width * 0.74} ${height * 0.10} L ${width * 0.79} ${height * 0.16} L ${width * 0.73} ${height * 0.26}`}
              stroke={`rgba(255, 250, 230, ${lightningFlash * 0.85})`} strokeWidth={1.8} fill="none" />
          </>
        )}

        {/* Mount Sinai */}
        <path d={`M 0 ${height * 0.78} L ${width * 0.18} ${height * 0.62} L ${width * 0.32} ${height * 0.55} L ${width * 0.42} ${height * 0.48} L ${width * 0.50} ${height * 0.42} L ${width * 0.58} ${height * 0.50} L ${width * 0.68} ${height * 0.56} L ${width * 0.82} ${height * 0.63} L ${width} ${height * 0.78} L ${width} ${height * 0.82} L 0 ${height * 0.82} Z`}
          fill="url(#moses-mountain)" />
        <ellipse cx={width * 0.5} cy={height * 0.55} rx={width * 0.32} ry={20}
          fill="rgba(120, 110, 130, 0.25)" filter="url(#cloudBlur)" />

        {/* Scriptural shafts from above */}
        <g opacity={0.55 * divineGlow}>
          <path d={`M ${cx - 220} 0 L ${cx - 80} ${height * 0.55} L ${cx - 40} ${height * 0.55} L ${cx - 160} 0 Z`} fill="url(#scriptural-shaft)" />
          <path d={`M ${cx - 30} 0 L ${cx - 10} ${height * 0.6} L ${cx + 10} ${height * 0.6} L ${cx + 30} 0 Z`} fill="url(#scriptural-shaft)" />
          <path d={`M ${cx + 160} 0 L ${cx + 40} ${height * 0.55} L ${cx + 80} ${height * 0.55} L ${cx + 220} 0 Z`} fill="url(#scriptural-shaft)" />
        </g>

        {/* Volumetric mist */}
        <ellipse cx={cx} cy={cy + 30} rx={width * 0.45} ry={height * 0.18}
          fill={`rgba(${180 + rayBright * 30}, ${165 + rayBright * 25}, ${130 + rayBright * 20}, ${0.10 + rayBright * 0.06})`}
          filter="url(#cloudBlur)" />

        {/* Parted sea */}
        <g>
          {waveLeftPaths}
          {waveRightPaths}
          <path d={`M ${cx - 90} ${waterY} Q ${cx} ${waterY + 24} ${cx + 90} ${waterY} L ${cx + 80} ${height} L ${cx - 80} ${height} Z`}
            fill="rgba(70, 56, 36, 0.5)" />
          {reedNodes}
        </g>

        {/* Stone tablets */}
        {buildTablet(-1)}
        {buildTablet(1)}

        {/* God-rays from crook */}
        <g transform={`translate(${cx}, ${crookCenterY})`} style={{ mixBlendMode: "screen" }}>
          {rays}
        </g>

        {/* Divine halo */}
        <circle cx={cx} cy={crookCenterY} r={staffLen * 0.55 * (0.85 + divineGlow * 0.4) * staffPulse}
          fill="url(#divine-glow)" style={{ mixBlendMode: "screen" }} />

        {/* Staff (tilted around base) */}
        <g transform={`rotate(${staffTilt}, ${cx}, ${staffBot})`}>
          <rect x={cx - staffWidth / 2 - 1} y={staffTop + 10} width={staffWidth + 2}
            height={staffBot - staffTop - 10} fill="rgba(0,0,0,0.5)" rx={3} />
          <rect x={cx - staffWidth / 2} y={staffTop + 10} width={staffWidth}
            height={staffBot - staffTop - 10} fill="url(#staff-wood)" rx={3} />
          {grainLines}
          <rect x={cx - staffWidth / 2 + 1} y={staffTop + 10} width={3} height={staffBot - staffTop - 10}
            fill={`rgba(255, 220, 160, ${0.32 + divineGlow * 0.22})`} rx={1.5} />

          {/* Crook (curved hook) */}
          <path d={`M ${cx - staffWidth / 2} ${staffTop + 10}
              L ${cx - staffWidth / 2} ${staffTop + 30}
              Q ${cx - staffWidth / 2} ${staffTop - 36} ${cx - 56} ${staffTop - 18}
              Q ${cx - 78} ${staffTop - 6} ${cx - 56} ${staffTop + 18}
              Q ${cx - 30} ${staffTop + 28} ${cx + staffWidth / 2 - 4} ${staffTop + 18}
              Q ${cx + staffWidth / 2 + 4} ${staffTop - 18} ${cx - 18} ${staffTop - 26}
              Q ${cx - 56} ${staffTop - 30} ${cx - 64} ${staffTop - 4}
              Q ${cx - 64} ${staffTop + 22} ${cx - 36} ${staffTop + 30}
              L ${cx + staffWidth / 2} ${staffTop + 30}
              L ${cx + staffWidth / 2} ${staffTop + 10} Z`}
            fill="url(#staff-wood)" stroke="rgba(20, 10, 2, 0.85)" strokeWidth={1.2} />
          <path d={`M ${cx - 56} ${staffTop - 18} Q ${cx - 70} ${staffTop - 4} ${cx - 56} ${staffTop + 14}`}
            stroke={`rgba(255, 220, 160, ${0.45 + divineGlow * 0.25})`} strokeWidth={2.2}
            fill="none" strokeLinecap="round" />

          {/* Leather grip */}
          <rect x={cx - staffWidth / 2 - 2} y={gripStart} width={staffWidth + 4} height={gripEnd - gripStart}
            fill="url(#staff-leather)" stroke="rgba(10, 5, 2, 0.85)" strokeWidth={0.8} rx={2} />
          {wrapLines}
          <ellipse cx={cx + staffWidth / 2 + 1} cy={gripEnd - 4} rx={3} ry={2} fill="rgba(40, 22, 8, 0.95)" />

          {/* Metal cap */}
          <rect x={cx - staffWidth / 2 - 2} y={staffBot - 22} width={staffWidth + 4} height={22}
            fill="url(#staff-metal)" stroke="rgba(15, 12, 8, 0.85)" strokeWidth={0.9} rx={1.5} />
          <circle cx={cx - staffWidth / 2 + 2} cy={staffBot - 16} r={1.4} fill="rgba(20, 18, 14, 0.95)" />
          <circle cx={cx + staffWidth / 2 - 2} cy={staffBot - 16} r={1.4} fill="rgba(20, 18, 14, 0.95)" />
          <circle cx={cx - staffWidth / 2 + 2} cy={staffBot - 6} r={1.4} fill="rgba(20, 18, 14, 0.95)" />
          <circle cx={cx + staffWidth / 2 - 2} cy={staffBot - 6} r={1.4} fill="rgba(20, 18, 14, 0.95)" />
          <line x1={cx - staffWidth / 2} y1={staffBot - 18} x2={cx + staffWidth / 2} y2={staffBot - 18}
            stroke="rgba(220, 200, 160, 0.75)" strokeWidth={0.6} />
        </g>

        {/* Dust / ember particles */}
        <g style={{ mixBlendMode: "screen" }}>{particleNodes}</g>

        {/* Crook tight halo (pulse) */}
        <circle cx={cx} cy={crookCenterY} r={(36 + rayBright * 18) * staffPulse}
          fill={tintCore} opacity={0.30 * divineGlow} style={{ mixBlendMode: "screen" }} />
        <circle cx={cx} cy={crookCenterY} r={(14 + rayBright * 6) * staffPulse}
          fill="rgba(255, 250, 230, 1)" opacity={0.50 * divineGlow} style={{ mixBlendMode: "screen" }} />
      </svg>
    </div>
  );
};
