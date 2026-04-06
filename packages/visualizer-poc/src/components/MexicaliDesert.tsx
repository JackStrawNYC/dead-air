/**
 * MexicaliDesert — Sonoran desert sunset overlay for "Mexicali Blues", A+++ quality.
 *
 * Bob Weir cowboy song set in a Mexican border town. Wide-frame Sonoran landscape
 * at golden hour: saguaro cacti with raised arms standing over ochre earth, prickly
 * pear clusters and agave rosettes at their feet, mesa silhouettes layered into the
 * distance, and an oversized blood-orange sun sinking into a violet horizon. A
 * papel picado banner flutters across the top, a sombrero hangs from one saguaro
 * arm, an adobe and chapel bell tower sit far back, vultures wheel overhead, and
 * a lizard suns itself on a rock. Heat haze ripples up and a thin dust devil
 * twists past the foreground.
 *
 * Audio reactivity:
 *   slowEnergy  — drives sunset progression (sun height + sky gradient shift)
 *   energy      — heat haze intensity
 *   bass        — dust devil rotation speed and lean
 *   beatDecay   — pulses sun corona
 *   chromaHue   — tints the warm desert wash (+/- 14deg)
 *   tempoFactor — sways papel picado banner and saguaro arms
 *
 * Continuous rendering — rotation engine controls visibility externally.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

function hslToRgba(h: number, s: number, l: number, a: number): string {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hh < 60) { r = c; g = x; }
  else if (hh < 120) { r = x; g = c; }
  else if (hh < 180) { g = c; b = x; }
  else if (hh < 240) { g = x; b = c; }
  else if (hh < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return `rgba(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)},${a})`;
}

interface SaguaroData {
  x: number; scale: number; trunkH: number;
  armCount: 1 | 2 | 3;
  armHeights: number[]; armSides: (-1 | 1)[]; armLengths: number[];
  hasSombrero: boolean; ribCount: number;
}
interface PearData { x: number; scale: number; padCount: number; hasFruit: boolean; }
interface MesaData { x: number; width: number; height: number; topFlat: number; }
interface VultureData { cx: number; cy: number; radius: number; speed: number; size: number; phase: number; }

function generateSaguaros(seed: number): SaguaroData[] {
  const rng = seeded(seed);
  const positions = [0.08, 0.20, 0.36, 0.55, 0.78, 0.92];
  return positions.map((x, i) => {
    const armCount = (1 + Math.floor(rng() * 3)) as 1 | 2 | 3;
    const heights: number[] = [], sides: (-1 | 1)[] = [], lens: number[] = [];
    for (let a = 0; a < armCount; a++) {
      heights.push(0.32 + rng() * 0.36);
      sides.push(rng() < 0.5 ? -1 : 1);
      lens.push(0.65 + rng() * 0.5);
    }
    return {
      x, scale: 0.78 + rng() * 0.7, trunkH: 175 + rng() * 70,
      armCount, armHeights: heights, armSides: sides, armLengths: lens,
      hasSombrero: i === 2, ribCount: 4 + Math.floor(rng() * 4),
    };
  });
}

function generatePears(seed: number): PearData[] {
  const rng = seeded(seed);
  return [0.12, 0.30, 0.46, 0.66, 0.84].map((x) => ({
    x: x + (rng() - 0.5) * 0.04,
    scale: 0.6 + rng() * 0.6,
    padCount: 3 + Math.floor(rng() * 4),
    hasFruit: rng() > 0.3,
  }));
}

function generateMesas(): MesaData[] {
  return [
    { x: 0.22, width: 0.52, height: 0.18, topFlat: 0.68 },
    { x: 0.62, width: 0.42, height: 0.14, topFlat: 0.62 },
    { x: 0.78, width: 0.30, height: 0.22, topFlat: 0.74 },
  ];
}

function generateVultures(): VultureData[] {
  return [
    { cx: 0.66, cy: 0.20, radius: 0.07, speed: 0.0015, size: 12, phase: 0 },
    { cx: 0.70, cy: 0.24, radius: 0.05, speed: 0.0018, size: 9, phase: 1.6 },
    { cx: 0.18, cy: 0.16, radius: 0.04, speed: 0.0013, size: 7, phase: 3.2 },
  ];
}

interface Props { frames: EnhancedFrameData[]; }

export const MexicaliDesert: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const { slowEnergy, energy, bass, beatDecay, chromaHue } = snap;

  const saguaros = React.useMemo(() => generateSaguaros(19720415), []);
  const pears = React.useMemo(() => generatePears(19720416), []);
  const mesas = React.useMemo(() => generateMesas(), []);
  const vultures = React.useMemo(() => generateVultures(), []);

  const sunsetProg = interpolate(slowEnergy, [0.04, 0.55], [0.15, 0.95], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const horizonY = height * 0.66;
  const sunY = horizonY - height * (0.10 - sunsetProg * 0.08);
  const sunX = width * 0.62;
  const sunR = Math.min(width, height) * 0.085 * (1 + beatDecay * 0.08);

  const hueShift = (chromaHue - 0.5) * 28;
  const warmHue = 18 + hueShift;
  const skyRed = hslToRgba(warmHue + 4, 0.92, 0.52, 1);
  const skyOrange = hslToRgba(warmHue + 16, 0.95, 0.58, 1);
  const skyAmber = hslToRgba(warmHue + 30, 0.88, 0.62, 1);
  const skyViolet = hslToRgba(285 + hueShift * 0.4, 0.55, 0.30, 1);
  const skyDeep = hslToRgba(255 + hueShift * 0.4, 0.45, 0.16, 1);
  const groundFront = hslToRgba(22 + hueShift * 0.5, 0.55, 0.18, 1);
  const groundMid = hslToRgba(26 + hueShift * 0.5, 0.62, 0.28, 1);
  const groundBack = hslToRgba(30 + hueShift * 0.5, 0.55, 0.36, 1);
  const mesaBack = hslToRgba(280 + hueShift * 0.4, 0.30, 0.22, 1);
  const mesaMid = hslToRgba(20 + hueShift * 0.4, 0.45, 0.24, 1);
  const mesaFront = hslToRgba(18 + hueShift * 0.4, 0.55, 0.18, 1);
  const cactusDark = hslToRgba(115, 0.32, 0.10, 1);
  const cactusBody = hslToRgba(120, 0.28, 0.16, 1);
  const cactusHi = hslToRgba(95, 0.30, 0.24, 1);
  const rim = hslToRgba(warmHue + 18, 0.85, 0.55, 0.45);

  const hazeAmp = 0.6 + energy * 1.6;
  const hazeOpacity = 0.10 + energy * 0.18;
  const dustRot = frame * (0.6 + bass * 2.4);
  const dustLean = bass * 6;
  const bannerPhase = frame * 0.018 * tempoFactor;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="md-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={skyDeep} />
            <stop offset="0.30" stopColor={skyViolet} />
            <stop offset="0.55" stopColor={skyRed} />
            <stop offset="0.78" stopColor={skyOrange} />
            <stop offset="1" stopColor={skyAmber} />
          </linearGradient>
          <radialGradient id="md-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={hslToRgba(warmHue + 38, 1, 0.74, 1)} />
            <stop offset="0.45" stopColor={hslToRgba(warmHue + 18, 0.98, 0.58, 1)} />
            <stop offset="0.85" stopColor={hslToRgba(warmHue + 4, 0.95, 0.46, 0.6)} />
            <stop offset="1" stopColor={hslToRgba(warmHue, 0.90, 0.40, 0)} />
          </radialGradient>
          <radialGradient id="md-halo" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={hslToRgba(warmHue + 22, 0.95, 0.60, 0.55)} />
            <stop offset="0.6" stopColor={hslToRgba(warmHue + 10, 0.90, 0.50, 0.18)} />
            <stop offset="1" stopColor={hslToRgba(warmHue, 0.90, 0.40, 0)} />
          </radialGradient>
          <linearGradient id="md-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={groundBack} />
            <stop offset="0.4" stopColor={groundMid} />
            <stop offset="1" stopColor={groundFront} />
          </linearGradient>
          <filter id="md-haze" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency={`0.9 ${0.012 + energy * 0.02}`} numOctaves="2" seed="7">
              <animate attributeName="seed" from="1" to="40" dur="6s" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale={hazeAmp * 6} />
          </filter>
          <filter id="md-shadow"><feGaussianBlur stdDeviation="1.8" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>

        {/* SKY */}
        <rect x={0} y={0} width={width} height={horizonY + 4} fill="url(#md-sky)" />

        {/* SUN */}
        <circle cx={sunX} cy={sunY} r={sunR * 2.6} fill="url(#md-halo)" />
        <circle cx={sunX} cy={sunY} r={sunR} fill="url(#md-sun)" />
        <circle cx={sunX} cy={sunY} r={sunR * (0.42 + beatDecay * 0.10)} fill={hslToRgba(warmHue + 42, 1, 0.82, 0.55 + beatDecay * 0.25)} />

        {/* MESAS — three depth layers */}
        {mesas.map((m, mi) => {
          const fill = mi === 0 ? mesaBack : mi === 1 ? mesaMid : mesaFront;
          const baseY = horizonY + 2;
          const topY = baseY - height * m.height;
          const cx = m.x * width, w = m.width * width, flatW = w * m.topFlat, slopeW = (w - flatW) / 2;
          const path = `M ${cx - w / 2},${baseY} L ${cx - w / 2 + slopeW},${topY + 6} L ${cx - flatW / 2},${topY} L ${cx + flatW / 2},${topY} L ${cx + w / 2 - slopeW},${topY + 8} L ${cx + w / 2},${baseY} Z`;
          return <path key={`mesa${mi}`} d={path} fill={fill} opacity={0.92 - mi * 0.05} />;
        })}

        {/* CHAPEL BELL TOWER */}
        {(() => {
          const tx = width * 0.84, ty = horizonY - 24;
          return (
            <g opacity={0.78}>
              <rect x={tx - 8} y={ty} width={16} height={28} fill={mesaFront} />
              <polygon points={`${tx - 10},${ty} ${tx + 10},${ty} ${tx},${ty - 12}`} fill={mesaFront} />
              <line x1={tx} y1={ty - 14} x2={tx} y2={ty - 22} stroke={mesaFront} strokeWidth={1.2} />
              <line x1={tx - 4} y1={ty - 22} x2={tx + 4} y2={ty - 22} stroke={mesaFront} strokeWidth={1.4} />
              <rect x={tx - 3} y={ty + 10} width={6} height={6} fill={hslToRgba(warmHue + 26, 0.9, 0.45, 0.85)} />
            </g>
          );
        })()}

        {/* ADOBE BUILDING */}
        {(() => {
          const ax = width * 0.25, ay = horizonY - 18;
          return (
            <g opacity={0.85}>
              <rect x={ax - 22} y={ay} width={44} height={22} fill={hslToRgba(28 + hueShift * 0.5, 0.55, 0.32, 1)} />
              <rect x={ax - 22} y={ay} width={44} height={3} fill={hslToRgba(28 + hueShift * 0.5, 0.45, 0.22, 1)} />
              <rect x={ax - 4} y={ay + 8} width={8} height={9} fill={hslToRgba(warmHue + 30, 0.95, 0.45, 0.95)} />
              {[-16, -6, 4, 14].map((dx) => <circle key={dx} cx={ax + dx} cy={ay + 5} r={1.4} fill="rgba(20,12,8,0.7)" />)}
            </g>
          );
        })()}

        {/* VULTURES */}
        {vultures.map((v, vi) => {
          const t = frame * v.speed + v.phase;
          const vx = v.cx * width + Math.cos(t) * v.radius * width;
          const vy = v.cy * height + Math.sin(t) * v.radius * height * 0.45;
          const flap = Math.sin(frame * 0.15 + vi * 1.2) * 3;
          return (
            <path key={`vu${vi}`} opacity={0.7}
              d={`M ${vx - v.size},${vy + flap} Q ${vx - v.size * 0.4},${vy - v.size * 0.45 - flap} ${vx},${vy} Q ${vx + v.size * 0.4},${vy - v.size * 0.45 - flap} ${vx + v.size},${vy + flap}`}
              fill="none" stroke="rgba(20,12,8,0.85)" strokeWidth={1.6} strokeLinecap="round" />
          );
        })}

        {/* GROUND */}
        <rect x={0} y={horizonY} width={width} height={height - horizonY} fill="url(#md-ground)" />

        {/* LONG SHADOW STREAKS pulled left from low sun */}
        {[0.18, 0.34, 0.52, 0.70, 0.86].map((sx, si) => (
          <ellipse key={`sh${si}`} cx={sx * width - 18} cy={horizonY + 16 + si * 4} rx={50 + si * 6} ry={3.5} fill="rgba(20,8,4,0.25)" />
        ))}

        {/* HEAT HAZE BACK LAYER */}
        <g filter="url(#md-haze)" opacity={hazeOpacity}>
          <rect x={0} y={horizonY - 6} width={width} height={40} fill={hslToRgba(warmHue + 22, 0.6, 0.55, 0.6)} />
        </g>

        {/* AGAVE PLANTS — rosette of pointed leaves */}
        {[0.06, 0.40, 0.72].map((ax, ai) => {
          const cx = ax * width, cy = horizonY + 28 + ai * 6, leaves = 9;
          return (
            <g key={`ag${ai}`} filter="url(#md-shadow)">
              {Array.from({ length: leaves }).map((_, li) => {
                const angle = (li / leaves) * Math.PI - Math.PI;
                const len = 22 + (li % 2) * 4;
                return <line key={li} x1={cx} y1={cy} x2={cx + Math.cos(angle) * len} y2={cy + Math.sin(angle) * len * 0.6} stroke={cactusBody} strokeWidth={3.2} strokeLinecap="round" />;
              })}
              <circle cx={cx} cy={cy} r={3} fill={cactusDark} />
            </g>
          );
        })}

        {/* YUCCA WITH FLOWER SPIKE */}
        {(() => {
          const cx = width * 0.58, cy = horizonY + 20, leaves = 11;
          return (
            <g filter="url(#md-shadow)">
              {Array.from({ length: leaves }).map((_, li) => {
                const angle = (li / leaves) * Math.PI - Math.PI;
                const len = 18 + (li % 3) * 3;
                return <line key={li} x1={cx} y1={cy} x2={cx + Math.cos(angle) * len} y2={cy + Math.sin(angle) * len * 0.55} stroke={cactusBody} strokeWidth={2.4} strokeLinecap="round" />;
              })}
              <line x1={cx} y1={cy - 4} x2={cx} y2={cy - 50} stroke={cactusDark} strokeWidth={2} />
              {[0, 1, 2, 3, 4, 5].map((fi) => (
                <circle key={`yf${fi}`} cx={cx + (fi % 2 === 0 ? -3 : 3)} cy={cy - 12 - fi * 6} r={2.2} fill={hslToRgba(48, 0.8, 0.82, 0.9)} />
              ))}
            </g>
          );
        })()}

        {/* PRICKLY PEAR CLUSTERS */}
        {pears.map((p, pi) => {
          const cx = p.x * width, baseY = horizonY + 34;
          const padW = 18 * p.scale, padH = 22 * p.scale;
          return (
            <g key={`pp${pi}`} filter="url(#md-shadow)">
              <ellipse cx={cx} cy={baseY - padH * 0.45} rx={padW * 0.55} ry={padH * 0.55} fill={cactusBody} />
              <ellipse cx={cx - padW * 0.45} cy={baseY - padH * 1.05} rx={padW * 0.42} ry={padH * 0.42} fill={cactusBody} />
              <ellipse cx={cx + padW * 0.40} cy={baseY - padH * 0.95} rx={padW * 0.42} ry={padH * 0.42} fill={cactusBody} />
              {p.padCount > 4 && <ellipse cx={cx - padW * 0.05} cy={baseY - padH * 1.55} rx={padW * 0.38} ry={padH * 0.38} fill={cactusHi} opacity={0.85} />}
              {p.hasFruit && (
                <>
                  <circle cx={cx - padW * 0.45} cy={baseY - padH * 1.45} r={2.4} fill="#C62828" />
                  <circle cx={cx + padW * 0.40} cy={baseY - padH * 1.35} r={2.0} fill="#C62828" />
                  <circle cx={cx + padW * 0.10} cy={baseY - padH * 0.75} r={2.2} fill="#B71C1C" />
                </>
              )}
              {Array.from({ length: 6 }).map((_, si) => (
                <circle key={si} cx={cx + Math.cos(si * 1.05) * padW * 0.4} cy={baseY - padH * 0.5 + Math.sin(si * 1.05) * padH * 0.4} r={0.6} fill="rgba(240,230,200,0.7)" />
              ))}
            </g>
          );
        })}

        {/* SAGUARO CACTI */}
        {saguaros.map((s, si) => {
          const cx = s.x * width, baseY = horizonY + 42;
          const trunkH = s.trunkH * s.scale, trunkW = 18 * s.scale;
          const top = baseY - trunkH;
          const sway = Math.sin(frame * 0.018 * tempoFactor + si * 1.3) * (1.5 + energy * 3);
          return (
            <g key={`sg${si}`} transform={`translate(${sway}, 0)`} filter="url(#md-shadow)">
              <rect x={cx - trunkW / 2} y={top} width={trunkW} height={trunkH} rx={trunkW / 2} fill={cactusBody} />
              {/* Vertical ribs */}
              {Array.from({ length: s.ribCount }).map((_, ri) => {
                const rx = cx - trunkW / 2 + (ri + 0.5) * (trunkW / s.ribCount);
                return <line key={ri} x1={rx} y1={top + 6} x2={rx} y2={baseY - 4} stroke={ri % 2 === 0 ? cactusDark : cactusHi} strokeWidth={0.9} opacity={0.55} />;
              })}
              {/* Sun-side rim highlight */}
              <rect x={cx + trunkW / 2 - 3} y={top + 6} width={2.4} height={trunkH - 12} rx={1.2} fill={rim} />
              {/* Spine speckles */}
              {Array.from({ length: 8 }).map((_, di) => (
                <circle key={`sp${di}`} cx={cx + (di % 2 === 0 ? -3 : 3)} cy={top + 12 + di * (trunkH / 9)} r={0.5} fill="rgba(240,230,200,0.55)" />
              ))}
              {/* Arms */}
              {s.armHeights.map((h, ai) => {
                const side = s.armSides[ai];
                const armBaseY = baseY - trunkH * h;
                const armLen = 38 * s.scale * s.armLengths[ai];
                const armRise = armLen * 0.85;
                const armW = 14 * s.scale;
                const horizX1 = cx + (side * trunkW) / 2;
                const horizX2 = cx + side * armLen;
                return (
                  <g key={`a${ai}`}>
                    <line x1={horizX1} y1={armBaseY} x2={horizX2} y2={armBaseY} stroke={cactusBody} strokeWidth={armW} strokeLinecap="round" />
                    <line x1={horizX2} y1={armBaseY} x2={horizX2} y2={armBaseY - armRise} stroke={cactusBody} strokeWidth={armW} strokeLinecap="round" />
                    <line x1={horizX2 + (side > 0 ? 4 : -4)} y1={armBaseY} x2={horizX2 + (side > 0 ? 4 : -4)} y2={armBaseY - armRise + 4} stroke={rim} strokeWidth={1.6} strokeLinecap="round" />
                  </g>
                );
              })}
              {/* Sombrero hanging from first arm */}
              {s.hasSombrero && s.armCount >= 1 && (() => {
                const side = s.armSides[0];
                const armLen = 38 * s.scale * s.armLengths[0];
                const sx = cx + side * armLen;
                const sy = baseY - trunkH * s.armHeights[0] - 38 * s.scale;
                return (
                  <g transform={`translate(${sx}, ${sy})`}>
                    <ellipse cx={0} cy={6} rx={20} ry={5} fill="#3E2723" />
                    <ellipse cx={0} cy={0} rx={9} ry={6} fill="#5D4037" />
                    <path d="M -9 0 Q 0 -8 9 0" fill="#4E342E" />
                    <ellipse cx={0} cy={2} rx={9} ry={1.4} fill="#C62828" />
                    <ellipse cx={0} cy={6} rx={20} ry={5} fill="none" stroke="#1B0F08" strokeWidth={0.8} />
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* LIZARD ON A ROCK */}
        {(() => {
          const lx = width * 0.14, ly = horizonY + height * 0.20;
          return (
            <g filter="url(#md-shadow)">
              <ellipse cx={lx} cy={ly + 3} rx={26} ry={9} fill={hslToRgba(24, 0.40, 0.22, 1)} />
              <ellipse cx={lx - 4} cy={ly + 1} rx={22} ry={6} fill={hslToRgba(28, 0.45, 0.30, 1)} />
              <ellipse cx={lx + 2} cy={ly - 4} rx={11} ry={3.2} fill={hslToRgba(38, 0.55, 0.35, 1)} />
              <ellipse cx={lx + 12} cy={ly - 4.5} rx={3.4} ry={2.4} fill={hslToRgba(38, 0.55, 0.32, 1)} />
              <path d={`M ${lx - 8},${ly - 4} Q ${lx - 18},${ly - 8} ${lx - 16},${ly + 1}`} fill="none" stroke={hslToRgba(38, 0.55, 0.32, 1)} strokeWidth={2.4} strokeLinecap="round" />
              <line x1={lx - 4} y1={ly - 3} x2={lx - 6} y2={ly} stroke={hslToRgba(38, 0.55, 0.30, 1)} strokeWidth={1.2} />
              <line x1={lx + 6} y1={ly - 3} x2={lx + 8} y2={ly} stroke={hslToRgba(38, 0.55, 0.30, 1)} strokeWidth={1.2} />
              <circle cx={lx + 13} cy={ly - 5} r={0.5} fill="#000" />
            </g>
          );
        })()}

        {/* DUST DEVIL — bass-driven swirling tornado */}
        {(() => {
          const dx = width * 0.46, dy = horizonY + 8;
          const turns = 5, baseR = 4, topY = -70;
          return (
            <g opacity={0.42 + bass * 0.3} transform={`translate(${dx + dustLean}, ${dy}) rotate(${dustLean * 0.6})`}>
              {Array.from({ length: turns }).map((_, ti) => {
                const yf = ti / turns;
                const phase = dustRot * 0.04 + ti * 0.6;
                return <ellipse key={ti} cx={Math.sin(phase) * 2} cy={topY * yf} rx={baseR + ti * 3.2} ry={1.8 + ti * 0.3} fill="none" stroke={hslToRgba(30 + hueShift * 0.3, 0.45, 0.62, 0.32 + bass * 0.2)} strokeWidth={1.2} />;
              })}
              {Array.from({ length: 14 }).map((_, pi) => {
                const yf = pi / 14;
                return <circle key={`dp${pi}`} cx={(baseR + pi * 2.2) * Math.cos(dustRot * 0.05 + pi)} cy={topY * yf} r={0.8} fill={hslToRgba(34, 0.40, 0.65, 0.55)} />;
              })}
            </g>
          );
        })()}

        {/* HEAT HAZE FOREGROUND DISTORTION */}
        <g filter="url(#md-haze)" opacity={hazeOpacity * 0.7}>
          <rect x={0} y={horizonY - 2} width={width} height={20} fill="rgba(255,200,140,0.18)" />
        </g>

        {/* PAPEL PICADO BANNER */}
        {(() => {
          const flagCount = 11;
          const flagW = width / flagCount;
          const flagH = 56;
          const colors = ["#E91E63", "#FFEB3B", "#00BCD4", "#4CAF50", "#FF5722", "#9C27B0"];
          const catenary = (xn: number) => 18 + Math.sin((xn * Math.PI + bannerPhase) * 1.0) * 6;
          const stringPath = `M 0,${10 + catenary(0)} ` + Array.from({ length: 20 }).map((_, i) => {
            const xn = (i + 1) / 20;
            return `L ${xn * width},${10 + catenary(xn)}`;
          }).join(" ");
          return (
            <g>
              <path d={stringPath} fill="none" stroke="rgba(40,30,20,0.8)" strokeWidth={1.2} />
              {Array.from({ length: flagCount }).map((_, fi) => {
                const xn = (fi + 0.5) / flagCount;
                const fx = xn * width - flagW * 0.42;
                const fy = 10 + catenary(xn);
                const color = colors[fi % colors.length];
                const flutter = Math.sin(bannerPhase + fi * 0.7) * 3;
                return (
                  <g key={`flag${fi}`} transform={`translate(${fx}, ${fy}) skewX(${flutter})`}>
                    <path d={`M 0,0 L ${flagW * 0.84},0 L ${flagW * 0.84},${flagH} L ${flagW * 0.42},${flagH - 6} L 0,${flagH} Z`} fill={color} opacity={0.92} />
                    <circle cx={flagW * 0.20} cy={flagH * 0.30} r={3} fill="rgba(0,0,0,0.35)" />
                    <circle cx={flagW * 0.42} cy={flagH * 0.30} r={3} fill="rgba(0,0,0,0.35)" />
                    <circle cx={flagW * 0.64} cy={flagH * 0.30} r={3} fill="rgba(0,0,0,0.35)" />
                    <rect x={flagW * 0.30} y={flagH * 0.50} width={flagW * 0.24} height={3} fill="rgba(0,0,0,0.35)" />
                    <circle cx={flagW * 0.42} cy={flagH * 0.70} r={2} fill="rgba(0,0,0,0.35)" />
                    <path d={`M 0,0 L ${flagW * 0.84},0`} stroke="rgba(255,255,255,0.4)" strokeWidth={1} fill="none" />
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* WARM ATMOSPHERIC WASH */}
        <rect x={0} y={0} width={width} height={height} fill={hslToRgba(warmHue + 14, 0.75, 0.50, 0.06 + slowEnergy * 0.05)} />
      </svg>
    </div>
  );
};
