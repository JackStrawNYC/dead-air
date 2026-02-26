/**
 * SolarEclipse — Solar eclipse animation.
 * Dark circle (moon) slowly crossing in front of bright circle (sun).
 * Corona rays visible around the edges during eclipse.
 * Diamond ring effect at second contact.
 * Sun color shifts from yellow to red during eclipse.
 * Energy drives corona intensity. Cycle: 80s, 25s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 2400;    // 80 seconds at 30fps
const DURATION = 750;  // 25 seconds
const NUM_CORONA_RAYS = 24;
const NUM_PROMINENCES = 6;

interface CoronaRayData {
  angle: number;
  length: number;
  width: number;
  waveMult: number;
  phase: number;
}

interface ProminenceData {
  angle: number;
  height: number;
  width: number;
  curvature: number;
  phase: number;
}

function generateCoronaRays(seed: number): CoronaRayData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_CORONA_RAYS }, (_, i) => ({
    angle: (i / NUM_CORONA_RAYS) * Math.PI * 2 + (rng() - 0.5) * 0.15,
    length: 0.4 + rng() * 0.8,
    width: 0.02 + rng() * 0.04,
    waveMult: 0.8 + rng() * 0.4,
    phase: rng() * Math.PI * 2,
  }));
}

function generateProminences(seed: number): ProminenceData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_PROMINENCES }, () => ({
    angle: rng() * Math.PI * 2,
    height: 0.15 + rng() * 0.25,
    width: 0.08 + rng() * 0.12,
    curvature: (rng() - 0.5) * 0.3,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SolarEclipse: React.FC<Props> = ({ frames }) => {
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

  const coronaRays = React.useMemo(() => generateCoronaRays(8080), []);
  const prominences = React.useMemo(() => generateProminences(8081), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.8;

  const cx = width / 2;
  const cy = height / 2;
  const sunRadius = Math.min(width, height) * 0.12;
  const moonRadius = sunRadius * 1.02; // slightly larger for total eclipse

  // Moon crosses from left to right over the sun
  // Eclipse phases: approach (0-0.3), contact (0.3-0.7), departure (0.7-1.0)
  const moonOffsetX = interpolate(progress, [0, 0.3, 0.5, 0.7, 1], [sunRadius * 3, sunRadius * 0.8, 0, -sunRadius * 0.8, -sunRadius * 3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const moonX = cx + moonOffsetX;
  const moonY = cy;

  // Eclipse coverage (0 = no eclipse, 1 = total)
  const dist = Math.abs(moonOffsetX);
  const eclipseCoverage = interpolate(dist, [0, sunRadius * 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sun color shifts from yellow to red during eclipse
  const sunHue = interpolate(eclipseCoverage, [0, 0.8, 1], [45, 25, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sunBrightness = interpolate(eclipseCoverage, [0, 1], [70, 50], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Corona visibility increases during eclipse
  const coronaOpacity = interpolate(eclipseCoverage, [0.3, 0.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Diamond ring effect: bright flash at second/third contact
  const diamondRing = eclipseCoverage > 0.85
    ? interpolate(eclipseCoverage, [0.85, 0.95, 1.0], [0, 1, 0.5], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  const coronaIntensity = (0.5 + energy * 1.0) * coronaOpacity;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="eclipse-sun-glow">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="eclipse-corona-glow">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="eclipse-diamond-glow">
            <feGaussianBlur stdDeviation="15" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="sun-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`hsl(${sunHue}, 100%, ${sunBrightness + 15}%)`} />
            <stop offset="70%" stopColor={`hsl(${sunHue}, 90%, ${sunBrightness}%)`} />
            <stop offset="100%" stopColor={`hsl(${sunHue}, 80%, ${sunBrightness - 10}%)`} stopOpacity="0.6" />
          </radialGradient>
          <mask id="eclipse-mask">
            <rect x={0} y={0} width={width} height={height} fill="white" />
            <circle cx={moonX} cy={moonY} r={moonRadius} fill="black" />
          </mask>
        </defs>

        {/* Sun outer glow */}
        <circle
          cx={cx}
          cy={cy}
          r={sunRadius * 1.8}
          fill={`hsla(${sunHue}, 90%, 60%, 0.12)`}
          filter="url(#eclipse-sun-glow)"
        />

        {/* Corona rays (visible during eclipse) */}
        {coronaIntensity > 0.01 && coronaRays.map((ray, ri) => {
          const waveOffset = Math.sin(frame * 0.03 * ray.waveMult + ray.phase) * 0.15;
          const rayLength = sunRadius * (1.2 + ray.length + waveOffset + energy * 0.4);
          const rayWidth = sunRadius * ray.width * (1 + energy * 0.5);
          const angle = ray.angle + Math.sin(frame * 0.01 + ray.phase) * 0.03;

          const x1 = cx + Math.cos(angle) * sunRadius * 0.95;
          const y1 = cy + Math.sin(angle) * sunRadius * 0.95;
          const x2 = cx + Math.cos(angle) * rayLength;
          const y2 = cy + Math.sin(angle) * rayLength;
          const perpX = Math.cos(angle + Math.PI / 2) * rayWidth;
          const perpY = Math.sin(angle + Math.PI / 2) * rayWidth;

          return (
            <polygon
              key={`ray-${ri}`}
              points={`${x1 + perpX},${y1 + perpY} ${x2},${y2} ${x1 - perpX},${y1 - perpY}`}
              fill={`hsla(${sunHue + 10}, 80%, 80%, ${coronaIntensity * 0.25})`}
              filter="url(#eclipse-corona-glow)"
            />
          );
        })}

        {/* Solar prominences during eclipse */}
        {coronaIntensity > 0.3 && prominences.map((prom, pi) => {
          const wobble = Math.sin(frame * 0.04 + prom.phase) * 0.05;
          const promAngle = prom.angle + wobble;
          const baseX = cx + Math.cos(promAngle) * sunRadius;
          const baseY = cy + Math.sin(promAngle) * sunRadius;
          const tipDist = sunRadius * (1 + prom.height + energy * 0.2);
          const tipX = cx + Math.cos(promAngle) * tipDist;
          const tipY = cy + Math.sin(promAngle) * tipDist;
          const cpAngle = promAngle + prom.curvature;
          const cpDist = sunRadius * (1 + prom.height * 0.6);
          const cpX = cx + Math.cos(cpAngle) * cpDist;
          const cpY = cy + Math.sin(cpAngle) * cpDist;

          return (
            <path
              key={`prom-${pi}`}
              d={`M ${baseX} ${baseY} Q ${cpX} ${cpY}, ${tipX} ${tipY}`}
              fill="none"
              stroke={`hsla(${sunHue + 5}, 100%, 70%, ${coronaIntensity * 0.4})`}
              strokeWidth={sunRadius * prom.width}
              strokeLinecap="round"
              filter="url(#eclipse-corona-glow)"
            />
          );
        })}

        {/* Sun disk (masked by moon) */}
        <circle
          cx={cx}
          cy={cy}
          r={sunRadius}
          fill="url(#sun-gradient)"
          mask="url(#eclipse-mask)"
          filter="url(#eclipse-sun-glow)"
        />

        {/* Moon (dark disk) */}
        <circle
          cx={moonX}
          cy={moonY}
          r={moonRadius}
          fill="#0A0A12"
          opacity={0.95}
        />
        {/* Moon edge highlight (earthshine) */}
        <circle
          cx={moonX}
          cy={moonY}
          r={moonRadius}
          fill="none"
          stroke="#223344"
          strokeWidth={1}
          opacity={0.3 * eclipseCoverage}
        />

        {/* Diamond ring effect */}
        {diamondRing > 0.01 && (
          <circle
            cx={moonX + moonRadius * 0.85}
            cy={moonY - moonRadius * 0.3}
            r={4 + diamondRing * 8 + energy * 4}
            fill={`hsla(${sunHue + 20}, 100%, 95%, ${diamondRing * 0.9})`}
            filter="url(#eclipse-diamond-glow)"
          />
        )}
      </svg>
    </div>
  );
};
