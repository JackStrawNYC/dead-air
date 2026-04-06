/**
 * OregonSunBlaze — The blazing 100°F sun of Veneta 8/27/72 (Sunshine Daydream).
 *
 * Massive sun with rich detail: white-yellow inner disc, layered plasma corona,
 * convection cell texture, solar flare loops at the rim, 12 long radiating rays
 * (3-layer atmospheric/main/inner), 8 medium rays between, slow rotation, ray
 * length pulsing with energy. Heat shimmer bands rise from below the sun, lens
 * flare hexagons along the sun-axis, hazy washed-out blue-white sky gradient.
 *
 * Audio reactivity:
 *  - slowEnergy → sun pulsation/breathing radius
 *  - energy → ray length and brightness
 *  - beatDecay → corona flicker
 *  - onsetEnvelope → extra solar flares pop
 *  - chromaHue → subtle sun color shift (orange-red intense → cool yellow contemplative)
 *  - tempoFactor → ray rotation speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

interface Props {
  frames: EnhancedFrameData[];
}

interface ConvectionCell {
  angle: number;
  dist: number;
  size: number;
  darkness: number;
}

interface FlareLoop {
  angle: number;
  size: number;
  curvature: number;
  phase: number;
}

interface LensFlare {
  position: number; // 0-1 along axis from sun to opposite corner
  radius: number;
  hueOffset: number;
  shape: "hex" | "circle";
  alpha: number;
}

// Deterministic seeded RNG (LCG)
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function generateConvectionCells(): ConvectionCell[] {
  const rng = makeRng(827721972);
  return Array.from({ length: 6 }, () => ({
    angle: rng() * Math.PI * 2,
    dist: 0.25 + rng() * 0.55,
    size: 0.08 + rng() * 0.12,
    darkness: 0.15 + rng() * 0.2,
  }));
}

function generateFlareLoops(): FlareLoop[] {
  const rng = makeRng(8271972);
  return Array.from({ length: 4 }, (_, i) => ({
    angle: (i / 4) * Math.PI * 2 + rng() * 0.6,
    size: 0.18 + rng() * 0.15,
    curvature: 0.4 + rng() * 0.5,
    phase: rng() * Math.PI * 2,
  }));
}

function generateLensFlares(): LensFlare[] {
  const rng = makeRng(19720827);
  const base: LensFlare[] = [
    { position: 0.28, radius: 0.025, hueOffset: -8, shape: "hex", alpha: 0.32 },
    { position: 0.46, radius: 0.018, hueOffset: 12, shape: "circle", alpha: 0.22 },
    { position: 0.64, radius: 0.04, hueOffset: -20, shape: "hex", alpha: 0.28 },
    { position: 0.82, radius: 0.022, hueOffset: 25, shape: "circle", alpha: 0.18 },
  ];
  return base.map((f) => ({ ...f, position: f.position + (rng() - 0.5) * 0.04 }));
}

export const OregonSunBlaze: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue;
  const beatDecay = snap.beatDecay;
  const onsetEnvelope = snap.onsetEnvelope;

  const cells = React.useMemo(() => generateConvectionCells(), []);
  const flareLoops = React.useMemo(() => generateFlareLoops(), []);
  const lensFlares = React.useMemo(() => generateLensFlares(), []);

  // Sun position — upper right, where the Oregon afternoon sun would blaze
  const baseSize = Math.min(width, height);
  const cx = width * 0.68;
  const cy = height * 0.32;

  // Slow breathing pulse from slowEnergy — the sun expands and contracts
  const breath = 1 + Math.sin(frame * 0.012) * 0.04 + slowEnergy * 0.18;
  const sunRadius = baseSize * 0.11 * breath;

  // Energy-driven ray length multiplier
  const rayPower = 0.8 + energy * 1.4 + slowEnergy * 0.5;

  // Slow rotation, tempo-aware
  const rotation = frame * 0.0018 * tempoFactor;

  // Color temperature — chromaHue drives hue shift between intense red-orange (~15°)
  // and cooler yellow (~52°). Use circular distance from "warm" anchor.
  const hueNorm = ((chromaHue + 720) % 360) / 360; // 0-1
  // Map: red/orange chroma → intense, blue/green chroma → cooler yellow
  const warmth = Math.cos(hueNorm * Math.PI * 2 - Math.PI * 0.1) * 0.5 + 0.5; // 0=cool, 1=warm
  const sunHue = interpolate(warmth, [0, 1], [52, 18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const coronaHue = sunHue + 6;

  // Corona flicker from beatDecay
  const coronaFlicker = 1 + beatDecay * 0.22 + Math.sin(frame * 0.4) * 0.04;

  // Extra flares triggered by onsets
  const flareBurst = onsetEnvelope;

  // Heat shimmer bands rising from below
  const shimmerBands = 7;
  const shimmerSpeed = 0.6 + slowEnergy * 0.4;

  // Sky gradient brightness
  const skyHotness = 0.55 + slowEnergy * 0.3 + energy * 0.15;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}
      >
        <defs>
          {/* Hazy washed-out sky — hottest near sun, cooling outward */}
          <radialGradient
            id="osb-sky"
            cx={`${(cx / width) * 100}%`}
            cy={`${(cy / height) * 100}%`}
            r="120%"
          >
            <stop offset="0%" stopColor={`hsl(${sunHue + 8}, 70%, ${72 + skyHotness * 18}%)`} stopOpacity={0.55} />
            <stop offset="20%" stopColor={`hsl(${sunHue + 18}, 55%, ${70 + skyHotness * 14}%)`} stopOpacity={0.35} />
            <stop offset="55%" stopColor="hsl(35, 30%, 78%)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="hsl(205, 40%, 72%)" stopOpacity={0.05} />
          </radialGradient>

          {/* Inner solar disc — bright white-yellow core */}
          <radialGradient id="osb-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
            <stop offset="22%" stopColor="#FFFFF2" stopOpacity={0.98} />
            <stop offset="45%" stopColor={`hsl(${sunHue + 12}, 100%, 88%)`} stopOpacity={0.96} />
            <stop offset="72%" stopColor={`hsl(${sunHue + 4}, 100%, 65%)`} stopOpacity={0.85} />
            <stop offset="100%" stopColor={`hsl(${sunHue - 6}, 100%, 50%)`} stopOpacity={0.55} />
          </radialGradient>

          {/* Outer corona — layered photosphere/plasma */}
          <radialGradient id="osb-corona" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`hsl(${coronaHue}, 100%, 70%)`} stopOpacity={0.7} />
            <stop offset="35%" stopColor={`hsl(${coronaHue - 4}, 100%, 60%)`} stopOpacity={0.42} />
            <stop offset="70%" stopColor={`hsl(${coronaHue - 14}, 95%, 50%)`} stopOpacity={0.18} />
            <stop offset="100%" stopColor={`hsl(${coronaHue - 22}, 85%, 40%)`} stopOpacity={0} />
          </radialGradient>

          {/* Outermost atmospheric glow */}
          <radialGradient id="osb-atmo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`hsl(${sunHue + 2}, 100%, 75%)`} stopOpacity={0.35} />
            <stop offset="50%" stopColor={`hsl(${sunHue - 8}, 90%, 55%)`} stopOpacity={0.12} />
            <stop offset="100%" stopColor={`hsl(${sunHue - 18}, 70%, 40%)`} stopOpacity={0} />
          </radialGradient>

          {/* Heat shimmer band gradient */}
          <linearGradient id="osb-shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsla(40, 80%, 85%, 0)" />
            <stop offset="20%" stopColor="hsla(38, 90%, 88%, 0.45)" />
            <stop offset="50%" stopColor="hsla(45, 95%, 92%, 0.7)" />
            <stop offset="80%" stopColor="hsla(38, 90%, 88%, 0.45)" />
            <stop offset="100%" stopColor="hsla(40, 80%, 85%, 0)" />
          </linearGradient>

          {/* Convection cell darkening */}
          <radialGradient id="osb-cell" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8B2200" stopOpacity={0.55} />
            <stop offset="60%" stopColor="#A03300" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#C04400" stopOpacity={0} />
          </radialGradient>

          <filter id="osb-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="osb-bigglow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="22" />
          </filter>

          <filter id="osb-shimmerblur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>

        {/* Sky background — washed-out blue-white, hottest near the sun */}
        <rect x={0} y={0} width={width} height={height} fill="url(#osb-sky)" opacity={0.55 + slowEnergy * 0.25} />

        {/* Outermost atmospheric haze halo */}
        <circle
          cx={cx}
          cy={cy}
          r={sunRadius * 5.2}
          fill="url(#osb-atmo)"
          opacity={0.45 + slowEnergy * 0.3}
          filter="url(#osb-bigglow)"
        />

        {/* Lens flares along the optical axis from sun toward opposite corner */}
        {(() => {
          const axisDx = (width * 0.5 - cx) * 2.4;
          const axisDy = (height * 0.5 - cy) * 2.4;
          return lensFlares.map((lf, i) => {
            const fx = cx + axisDx * lf.position;
            const fy = cy + axisDy * lf.position;
            const fr = baseSize * lf.radius * (1 + slowEnergy * 0.25 + flareBurst * 0.4);
            const fHue = (sunHue + lf.hueOffset + chromaHue * 0.05) % 360;
            const fAlpha = lf.alpha * (0.6 + energy * 0.6 + flareBurst * 0.5);

            if (lf.shape === "hex") {
              const points: string[] = [];
              for (let p = 0; p < 6; p++) {
                const a = (p / 6) * Math.PI * 2 + Math.PI / 6;
                points.push(`${fx + Math.cos(a) * fr},${fy + Math.sin(a) * fr}`);
              }
              return (
                <g key={`lf${i}`}>
                  <polygon
                    points={points.join(" ")}
                    fill={`hsla(${fHue}, 95%, 70%, ${fAlpha * 0.4})`}
                    stroke={`hsla(${fHue}, 100%, 80%, ${fAlpha})`}
                    strokeWidth={1.2}
                    filter="url(#osb-glow)"
                  />
                  <circle cx={fx} cy={fy} r={fr * 0.35} fill={`hsla(${fHue}, 100%, 90%, ${fAlpha * 0.7})`} />
                </g>
              );
            }
            return (
              <g key={`lf${i}`}>
                <circle cx={fx} cy={fy} r={fr} fill={`hsla(${fHue}, 100%, 75%, ${fAlpha * 0.35})`} filter="url(#osb-glow)" />
                <circle cx={fx} cy={fy} r={fr * 0.5} fill={`hsla(${fHue}, 100%, 88%, ${fAlpha * 0.7})`} />
                <circle cx={fx} cy={fy} r={fr * 0.18} fill="#FFFFFF" opacity={fAlpha * 0.8} />
              </g>
            );
          });
        })()}

        {/* 12 long primary rays (3-layer rendering) */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = rotation + (i / 12) * Math.PI * 2;
          // Ray length pulses individually with rotating phase
          const lenPhase = Math.sin(frame * 0.02 + i * 0.7) * 0.15 + 1;
          const rayLen = sunRadius * (3.4 + energy * 4.0) * lenPhase * rayPower * 0.55;
          const sx = cx + Math.cos(angle) * sunRadius * 0.95;
          const sy = cy + Math.sin(angle) * sunRadius * 0.95;
          const ex = cx + Math.cos(angle) * (sunRadius + rayLen);
          const ey = cy + Math.sin(angle) * (sunRadius + rayLen);
          const rayHue = sunHue + (i % 3) * 4;
          const baseAlpha = 0.45 + energy * 0.4 + beatDecay * 0.15;

          return (
            <g key={`ray${i}`}>
              {/* Outer atmospheric glow — wide soft */}
              <line
                x1={sx} y1={sy} x2={ex} y2={ey}
                stroke={`hsla(${rayHue - 8}, 100%, 60%, ${baseAlpha * 0.35})`}
                strokeWidth={14 + energy * 10}
                strokeLinecap="round"
                filter="url(#osb-bigglow)"
              />
              {/* Main ray body */}
              <line
                x1={sx} y1={sy} x2={ex} y2={ey}
                stroke={`hsla(${rayHue}, 100%, 70%, ${baseAlpha * 0.7})`}
                strokeWidth={5 + energy * 4}
                strokeLinecap="round"
                filter="url(#osb-glow)"
              />
              {/* Inner bright core */}
              <line
                x1={sx} y1={sy} x2={ex} y2={ey}
                stroke={`hsla(${rayHue + 12}, 100%, 92%, ${baseAlpha})`}
                strokeWidth={1.6 + energy * 1.4}
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* 8 medium rays interleaved between primaries */}
        {Array.from({ length: 8 }, (_, i) => {
          const angle = rotation + (i / 8) * Math.PI * 2 + Math.PI / 12;
          const rayLen = sunRadius * (1.8 + energy * 2.2) * rayPower * 0.55;
          const sx = cx + Math.cos(angle) * sunRadius * 0.92;
          const sy = cy + Math.sin(angle) * sunRadius * 0.92;
          const ex = cx + Math.cos(angle) * (sunRadius + rayLen);
          const ey = cy + Math.sin(angle) * (sunRadius + rayLen);
          const rayHue = sunHue + 8;
          const alpha = 0.3 + energy * 0.35;
          return (
            <g key={`mray${i}`}>
              <line
                x1={sx} y1={sy} x2={ex} y2={ey}
                stroke={`hsla(${rayHue}, 100%, 70%, ${alpha * 0.6})`}
                strokeWidth={6 + energy * 5}
                strokeLinecap="round"
                filter="url(#osb-bigglow)"
              />
              <line
                x1={sx} y1={sy} x2={ex} y2={ey}
                stroke={`hsla(${rayHue + 10}, 100%, 88%, ${alpha})`}
                strokeWidth={2 + energy * 1.5}
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* Outer corona disc */}
        <circle
          cx={cx}
          cy={cy}
          r={sunRadius * 2.4 * coronaFlicker}
          fill="url(#osb-corona)"
          filter="url(#osb-bigglow)"
        />

        {/* Mid corona ring */}
        <circle
          cx={cx}
          cy={cy}
          r={sunRadius * 1.7 * coronaFlicker}
          fill="url(#osb-corona)"
          opacity={0.55 + beatDecay * 0.25}
          filter="url(#osb-glow)"
        />

        {/* Inner solar disc */}
        <circle
          cx={cx}
          cy={cy}
          r={sunRadius}
          fill="url(#osb-core)"
          filter="url(#osb-glow)"
        />

        {/* Convection cells — darker patches on photosphere surface */}
        {cells.map((c, i) => {
          const wobble = Math.sin(frame * 0.015 + i * 1.3) * 0.06;
          const ca = c.angle + wobble;
          const cd = c.dist + wobble * 0.3;
          const px = cx + Math.cos(ca) * sunRadius * cd;
          const py = cy + Math.sin(ca) * sunRadius * cd;
          const cs = sunRadius * c.size * (1 + Math.sin(frame * 0.025 + i) * 0.1);
          return (
            <ellipse
              key={`cell${i}`}
              cx={px}
              cy={py}
              rx={cs}
              ry={cs * 0.75}
              fill="url(#osb-cell)"
              opacity={c.darkness * (0.7 + slowEnergy * 0.3)}
              transform={`rotate(${(ca * 180) / Math.PI} ${px} ${py})`}
              style={{ mixBlendMode: "multiply" }}
            />
          );
        })}

        {/* Solar flare loops at the rim — small prominences */}
        {flareLoops.map((fl, i) => {
          const animPhase = frame * 0.018 + fl.phase;
          const swell = 1 + Math.sin(animPhase) * 0.25 + flareBurst * 0.5;
          const a = fl.angle + Math.sin(animPhase * 0.6) * 0.08;
          const baseR = sunRadius * 1.02;
          const loopH = sunRadius * fl.size * swell;
          const sx = cx + Math.cos(a - 0.12) * baseR;
          const sy = cy + Math.sin(a - 0.12) * baseR;
          const ex = cx + Math.cos(a + 0.12) * baseR;
          const ey = cy + Math.sin(a + 0.12) * baseR;
          const tipR = baseR + loopH;
          const tx = cx + Math.cos(a) * tipR;
          const ty = cy + Math.sin(a) * tipR;
          const cp1x = cx + Math.cos(a - 0.09) * (baseR + loopH * 0.6);
          const cp1y = cy + Math.sin(a - 0.09) * (baseR + loopH * 0.6);
          const cp2x = cx + Math.cos(a + 0.09) * (baseR + loopH * 0.6);
          const cp2y = cy + Math.sin(a + 0.09) * (baseR + loopH * 0.6);
          const flareHue = sunHue + 4;
          const flareAlpha = 0.55 + energy * 0.3 + flareBurst * 0.4;
          return (
            <g key={`flare${i}`}>
              <path
                d={`M ${sx} ${sy} Q ${cp1x} ${cp1y}, ${tx} ${ty} Q ${cp2x} ${cp2y}, ${ex} ${ey}`}
                fill="none"
                stroke={`hsla(${flareHue}, 100%, 75%, ${flareAlpha * 0.6})`}
                strokeWidth={6 + energy * 4}
                strokeLinecap="round"
                filter="url(#osb-bigglow)"
              />
              <path
                d={`M ${sx} ${sy} Q ${cp1x} ${cp1y}, ${tx} ${ty} Q ${cp2x} ${cp2y}, ${ex} ${ey}`}
                fill="none"
                stroke={`hsla(${flareHue + 10}, 100%, 90%, ${flareAlpha})`}
                strokeWidth={1.8 + energy * 1.2}
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* Bright white-hot center pip */}
        <circle
          cx={cx}
          cy={cy}
          r={sunRadius * 0.42}
          fill="#FFFFFF"
          opacity={0.85 + energy * 0.15}
        />
        <circle
          cx={cx}
          cy={cy}
          r={sunRadius * 0.18}
          fill="#FFFFFF"
        />

        {/* Heat shimmer bands rising from below the sun */}
        {Array.from({ length: shimmerBands }, (_, i) => {
          // Bands start below the sun and drift slowly upward
          const bandSeed = i * 0.137;
          const bandStartY = cy + sunRadius * 1.6;
          const driftRange = height - bandStartY + sunRadius;
          const driftY = ((frame * shimmerSpeed * 0.5 + i * 80 + bandSeed * 200) % driftRange);
          const by = bandStartY + driftRange - driftY - sunRadius * 0.5;
          const bandWidth = sunRadius * (3.8 + i * 0.3);
          const bandHeight = 4 + Math.sin(frame * 0.04 + i * 1.7) * 1.2;
          const bandAlpha = interpolate(driftY, [0, driftRange * 0.15, driftRange * 0.7, driftRange], [0, 0.6, 0.4, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          // Horizontal undulation
          const bandX = cx - bandWidth / 2 + Math.sin(frame * 0.03 + i * 2.1) * sunRadius * 0.15;
          return (
            <rect
              key={`shim${i}`}
              x={bandX}
              y={by}
              width={bandWidth}
              height={bandHeight}
              fill="url(#osb-shimmer)"
              opacity={bandAlpha * (0.5 + slowEnergy * 0.4)}
              filter="url(#osb-shimmerblur)"
              rx={bandHeight / 2}
            />
          );
        })}
      </svg>
    </div>
  );
};
