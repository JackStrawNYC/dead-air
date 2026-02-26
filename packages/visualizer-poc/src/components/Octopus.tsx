/**
 * Octopus — Octopus tentacles reaching inward from screen edges, undulating
 * with bass (sub + low) energy. 6-8 tentacles with suckers, built from bezier
 * curves. Tentacle thickness tapers. Deep purple/crimson palette with
 * bioluminescent suckers that pulse on beats. Head partially visible at edge.
 * Cycle: 65s (1950 frames), 18s (540 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 1950;   // 65s
const DURATION = 540;  // 18s
const NUM_TENTACLES = 7;
const SEGS_PER_TENTACLE = 18;

interface TentacleData {
  edge: number;      // 0=left, 1=right, 2=bottom
  position: number;  // 0-1 along edge
  length: number;
  baseWidth: number;
  waveFreq: number;
  wavePhase: number;
  waveAmp: number;
  curlFactor: number;
  hueShift: number;
}

function generate(seed: number): TentacleData[] {
  const rng = mulberry32(seed);
  return Array.from({ length: NUM_TENTACLES }, () => ({
    edge: Math.floor(rng() * 3),
    position: 0.15 + rng() * 0.7,
    length: 180 + rng() * 150,
    baseWidth: 10 + rng() * 8,
    waveFreq: 0.04 + rng() * 0.03,
    wavePhase: rng() * Math.PI * 2,
    waveAmp: 15 + rng() * 25,
    curlFactor: 0.5 + rng() * 0.8,
    hueShift: rng() * 30 - 15,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Octopus: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const tentacles = React.useMemo(() => generate(881234), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.6;
  if (masterOpacity < 0.01) return null;

  const frameData = frames[idx];
  const bassEnergy = ((frameData?.sub ?? 0) + (frameData?.low ?? 0)) / 2;
  const isBeat = frameData?.beat ?? false;

  /* reach: tentacles extend inward based on energy */
  const reachFactor = interpolate(energy, [0.03, 0.3], [0.4, 1.0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <filter id="octo-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {tentacles.map((tent, ti) => {
          /* anchor point on edge */
          let ax: number, ay: number, inwardAngle: number;
          switch (tent.edge) {
            case 0: // left
              ax = -5;
              ay = tent.position * height;
              inwardAngle = 0;
              break;
            case 1: // right
              ax = width + 5;
              ay = tent.position * height;
              inwardAngle = Math.PI;
              break;
            default: // bottom
              ax = tent.position * width;
              ay = height + 5;
              inwardAngle = -Math.PI / 2;
              break;
          }

          const hue = 290 + tent.hueShift;
          const tentColor = `hsl(${hue}, 60%, 30%)`;
          const tentLight = `hsl(${hue}, 50%, 45%)`;
          const suckerColor = isBeat
            ? `hsl(${hue + 60}, 80%, 70%)`
            : `hsl(${hue + 30}, 40%, 50%)`;

          /* build tentacle segments */
          const points: Array<{ x: number; y: number; w: number }> = [];
          for (let s = 0; s <= SEGS_PER_TENTACLE; s++) {
            const t = s / SEGS_PER_TENTACLE;
            const dist = t * tent.length * reachFactor;

            /* undulation driven by bass energy */
            const wave = Math.sin(
              frame * tent.waveFreq + tent.wavePhase + t * 4
            ) * tent.waveAmp * (0.3 + bassEnergy * 1.5) * t;

            /* perpendicular offset for wave */
            const perpAngle = inwardAngle + Math.PI / 2;
            const curl = Math.sin(t * Math.PI * tent.curlFactor) * 20 * t;

            const px = ax + Math.cos(inwardAngle) * dist + Math.cos(perpAngle) * (wave + curl);
            const py = ay + Math.sin(inwardAngle) * dist + Math.sin(perpAngle) * (wave + curl);

            /* taper width */
            const w = tent.baseWidth * (1 - t * 0.85);

            points.push({ x: px, y: py, w });
          }

          /* draw tentacle as thick path */
          const pathUpper: string[] = [];
          const pathLower: string[] = [];
          for (let s = 0; s < points.length; s++) {
            const p = points[s];
            const perpAngle = inwardAngle + Math.PI / 2;
            const ux = p.x + Math.cos(perpAngle) * p.w * 0.5;
            const uy = p.y + Math.sin(perpAngle) * p.w * 0.5;
            const lx = p.x - Math.cos(perpAngle) * p.w * 0.5;
            const ly = p.y - Math.sin(perpAngle) * p.w * 0.5;

            pathUpper.push(s === 0 ? `M ${ux} ${uy}` : `L ${ux} ${uy}`);
            pathLower.unshift(`L ${lx} ${ly}`);
          }
          const fullPath = pathUpper.join(" ") + " " + pathLower.join(" ") + " Z";

          /* suckers every 3 segments */
          const suckers: Array<{ x: number; y: number; r: number }> = [];
          for (let s = 2; s < points.length - 2; s += 3) {
            suckers.push({
              x: points[s].x,
              y: points[s].y,
              r: points[s].w * 0.25 + (isBeat ? 1 : 0),
            });
          }

          return (
            <g key={ti}>
              {/* tentacle body */}
              <path d={fullPath} fill={tentColor} stroke={tentLight} strokeWidth={0.8} opacity={0.8} />
              {/* center highlight */}
              {points.length > 2 && (
                <path
                  d={points.map((p, pi) => (pi === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ")}
                  fill="none" stroke={tentLight} strokeWidth={1.5} opacity={0.3}
                />
              )}
              {/* suckers */}
              {suckers.map((sk, ski) => (
                <g key={`sucker-${ski}`} filter={isBeat ? "url(#octo-glow)" : undefined}>
                  <circle cx={sk.x} cy={sk.y} r={sk.r} fill={suckerColor}
                    opacity={isBeat ? 0.8 : 0.4} />
                  <circle cx={sk.x} cy={sk.y} r={sk.r * 0.4} fill="rgba(0,0,0,0.3)" />
                </g>
              ))}
            </g>
          );
        })}

        {/* partial head visible at bottom-center if any bottom tentacles */}
        {tentacles.some((t) => t.edge === 2) && (
          <g opacity={0.5}>
            <ellipse cx={width * 0.5} cy={height + 30} rx={60} ry={40}
              fill="hsl(290, 50%, 25%)" />
            {/* eye */}
            <ellipse cx={width * 0.5 - 15} cy={height - 5} rx={8} ry={6}
              fill="#FFD700" opacity={0.5 + energy * 0.3} />
            <ellipse cx={width * 0.5 - 15} cy={height - 5} rx={2} ry={5}
              fill="#111" />
          </g>
        )}
      </svg>
    </div>
  );
};
