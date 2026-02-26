/**
 * AstrolabeOverlay — Medieval astrolabe with rotating rete (star map)
 * and pointer (rule). The mater plate has altitude circles, the rete
 * rotates slowly over time, and the rule (pointer arm) sweeps based on
 * energy. Intricate filigree metalwork. Brass/copper aesthetic.
 * Cycle: 80s, 22s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 2400; // 80s at 30fps
const DURATION = 660; // 22s visible

interface StarPos {
  angle: number;
  dist: number;
  size: number;
  brightness: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const AstrolabeOverlay: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate star positions on the rete
  const stars = React.useMemo(() => {
    const rng = seeded(12345678);
    const pts: StarPos[] = [];
    for (let i = 0; i < 24; i++) {
      pts.push({
        angle: rng() * 360,
        dist: 0.3 + rng() * 0.55,
        size: 1.5 + rng() * 3,
        brightness: 0.3 + rng() * 0.5,
      });
    }
    return pts;
  }, []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Position: center
  const cx = width * 0.5;
  const cy = height * 0.48;
  const outerR = Math.min(width, height) * 0.22;

  // Colors
  const brassColor = "#C8A040";
  const brassDark = "#7A5A18";
  const copperColor = "#B87333";
  const copperDark = "#804A1A";
  const starColor = "#FFE8A0";

  // Rete rotation: slow continuous spin (1 full rotation over ~20s visible)
  const reteAngle = cycleFrame * 0.28;

  // Rule (pointer) rotation: driven by energy
  const ruleAngle = frame * 0.5 + energy * 120;

  const glowSize = interpolate(energy, [0.03, 0.3], [2, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Altitude circles on the mater (tympan)
  const altitudeCircles = [0.3, 0.5, 0.65, 0.78, 0.88];

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px rgba(200, 160, 64, 0.4))`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Outer limb (graduated ring) */}
          <circle cx={0} cy={0} r={outerR * 1.05} fill="none" stroke={brassColor} strokeWidth={4} opacity={0.5} />
          <circle cx={0} cy={0} r={outerR} fill="none" stroke={brassDark} strokeWidth={1.5} opacity={0.4} />

          {/* Degree markings on limb */}
          {Array.from({ length: 72 }).map((_, di) => {
            const deg = di * 5;
            const isMajor = deg % 30 === 0;
            const a = ((deg - 90) * Math.PI) / 180;
            const r1 = isMajor ? outerR * 0.92 : outerR * 0.95;
            const r2 = outerR * 0.99;
            return (
              <line
                key={`limb-${di}`}
                x1={Math.cos(a) * r1}
                y1={Math.sin(a) * r1}
                x2={Math.cos(a) * r2}
                y2={Math.sin(a) * r2}
                stroke={brassColor}
                strokeWidth={isMajor ? 1.5 : 0.5}
                opacity={isMajor ? 0.5 : 0.2}
              />
            );
          })}

          {/* Zodiac labels at 30-degree intervals */}
          {["Ari", "Tau", "Gem", "Can", "Leo", "Vir", "Lib", "Sco", "Sgr", "Cap", "Aqr", "Psc"].map((sign, si) => {
            const a = ((si * 30 + 15 - 90) * Math.PI) / 180;
            const r1 = outerR * 0.96;
            return (
              <text
                key={`zod-${si}`}
                x={Math.cos(a) * r1}
                y={Math.sin(a) * r1}
                textAnchor="middle"
                dominantBaseline="central"
                fill={brassColor}
                fontSize={5}
                fontFamily="serif"
                opacity={0.3}
                transform={`rotate(${si * 30 + 15}, ${Math.cos(a) * r1}, ${Math.sin(a) * r1})`}
              >
                {sign}
              </text>
            );
          })}

          {/* Tympan (mater plate) — altitude circles */}
          {altitudeCircles.map((frac, ai) => (
            <circle
              key={`alt-${ai}`}
              cx={0}
              cy={outerR * (1 - frac) * 0.2}
              r={outerR * frac}
              fill="none"
              stroke={copperDark}
              strokeWidth={0.6}
              opacity={0.2}
              strokeDasharray={ai % 2 === 0 ? "none" : "3,3"}
            />
          ))}

          {/* Azimuth lines on tympan */}
          {Array.from({ length: 6 }).map((_, li) => {
            const a = ((li * 30 - 90) * Math.PI) / 180;
            return (
              <line
                key={`azm-${li}`}
                x1={0}
                y1={0}
                x2={Math.cos(a) * outerR * 0.88}
                y2={Math.sin(a) * outerR * 0.88}
                stroke={copperDark}
                strokeWidth={0.4}
                opacity={0.15}
              />
            );
          })}

          {/* Rete (rotating star map overlay) */}
          <g transform={`rotate(${reteAngle})`}>
            {/* Ecliptic circle (off-center) */}
            <circle cx={outerR * 0.12} cy={-outerR * 0.08} r={outerR * 0.55} fill="none" stroke={brassColor} strokeWidth={1.2} opacity={0.35} />

            {/* Rete structural arms */}
            {[0, 60, 120, 180, 240, 300].map((deg) => {
              const a = (deg * Math.PI) / 180;
              return (
                <line
                  key={`rete-arm-${deg}`}
                  x1={Math.cos(a) * outerR * 0.15}
                  y1={Math.sin(a) * outerR * 0.15}
                  x2={Math.cos(a) * outerR * 0.85}
                  y2={Math.sin(a) * outerR * 0.85}
                  stroke={brassColor}
                  strokeWidth={1}
                  opacity={0.25}
                />
              );
            })}

            {/* Stars */}
            {stars.map((star, si) => {
              const a = (star.angle * Math.PI) / 180;
              const sx = Math.cos(a) * outerR * star.dist;
              const sy = Math.sin(a) * outerR * star.dist;
              // Stars brighten with energy
              const starBright = star.brightness + energy * 0.3;
              return (
                <g key={`star-${si}`}>
                  <circle cx={sx} cy={sy} r={star.size} fill={starColor} opacity={starBright * 0.6} />
                  {/* Star pointer (small triangle) */}
                  <line
                    x1={sx - star.size * 1.5}
                    y1={sy}
                    x2={sx + star.size * 1.5}
                    y2={sy}
                    stroke={brassColor}
                    strokeWidth={0.6}
                    opacity={starBright * 0.3}
                  />
                </g>
              );
            })}

            {/* Rete filigree arcs (decorative cutouts) */}
            {[0, 1, 2].map((qi) => {
              const startDeg = qi * 120 + 30;
              const endDeg = qi * 120 + 90;
              const r = outerR * 0.42;
              const x1 = Math.cos((startDeg * Math.PI) / 180) * r;
              const y1 = Math.sin((startDeg * Math.PI) / 180) * r;
              const x2 = Math.cos((endDeg * Math.PI) / 180) * r;
              const y2 = Math.sin((endDeg * Math.PI) / 180) * r;
              return (
                <path
                  key={`fili-${qi}`}
                  d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                  fill="none"
                  stroke={brassColor}
                  strokeWidth={0.8}
                  opacity={0.2}
                />
              );
            })}
          </g>

          {/* Rule (pointer arm) — rotates independently */}
          <g transform={`rotate(${ruleAngle})`}>
            <line
              x1={-outerR * 0.9}
              y1={0}
              x2={outerR * 0.9}
              y2={0}
              stroke={copperColor}
              strokeWidth={2}
              opacity={0.5}
            />
            {/* Rule fiducial marks */}
            {[-0.7, -0.4, 0.4, 0.7].map((frac) => (
              <line
                key={`rule-${frac}`}
                x1={outerR * frac}
                y1={-3}
                x2={outerR * frac}
                y2={3}
                stroke={copperColor}
                strokeWidth={1}
                opacity={0.4}
              />
            ))}
          </g>

          {/* Center pin */}
          <circle cx={0} cy={0} r={6} fill={brassColor} opacity={0.6} stroke={brassDark} strokeWidth={1.5} />
          <circle cx={0} cy={0} r={2.5} fill={copperColor} opacity={0.5} />

          {/* Throne (decorative top piece for hanging) */}
          <path
            d={`M -10 ${-outerR * 1.05} Q 0 ${-outerR * 1.25} 10 ${-outerR * 1.05}`}
            fill="none"
            stroke={brassColor}
            strokeWidth={2.5}
            opacity={0.4}
          />
          <circle cx={0} cy={-outerR * 1.18} r={4} fill="none" stroke={brassColor} strokeWidth={1.5} opacity={0.4} />
        </g>
      </svg>
    </div>
  );
};
