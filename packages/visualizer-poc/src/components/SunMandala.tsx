/**
 * SunMandala — Radiating sun with flame corona, pulsing with energy.
 * Concentric mandala rings of varying geometric patterns (rays, petals, dots)
 * surrounding a bright core. Outer flame corona tendrils wave outward.
 * Each ring rotates at different speeds. Ring opacity and size pulse with energy.
 * Positioned center-upper. Cycles: 30s on, 55s off (85s total).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface MandalaRing {
  radius: number;
  count: number;
  rotSpeed: number;
  phase: number;
  style: "ray" | "petal" | "dot";
  size: number;
  hueShift: number;
}

interface FlameData {
  angle: number;
  length: number;
  width: number;
  speed: number;
  phase: number;
}

function generateRings(seed: number): MandalaRing[] {
  const rng = seeded(seed);
  const styles: Array<"ray" | "petal" | "dot"> = ["ray", "petal", "dot"];
  return Array.from({ length: 5 }, (_, i) => ({
    radius: 0.15 + i * 0.12,
    count: 8 + i * 4 + Math.floor(rng() * 4),
    rotSpeed: (0.003 + rng() * 0.005) * (i % 2 === 0 ? 1 : -1),
    phase: rng() * Math.PI * 2,
    style: styles[i % 3],
    size: 0.02 + rng() * 0.03,
    hueShift: i * 15,
  }));
}

function generateFlames(seed: number): FlameData[] {
  const rng = seeded(seed);
  return Array.from({ length: 16 }, (_, i) => ({
    angle: (i / 16) * Math.PI * 2 + rng() * 0.2,
    length: 0.4 + rng() * 0.5,
    width: 3 + rng() * 5,
    speed: 0.02 + rng() * 0.04,
    phase: rng() * Math.PI * 2,
  }));
}

const CYCLE = 2550; // 85s at 30fps
const DURATION = 900; // 30s

interface Props {
  frames: EnhancedFrameData[];
}

export const SunMandala: React.FC<Props> = ({ frames }) => {
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

  const rings = React.useMemo(() => generateRings(27182818), []);
  const flames = React.useMemo(() => generateFlames(31415926), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.45 + energy * 0.4);

  if (masterOpacity < 0.01) return null;

  const baseSize = Math.min(width, height);
  const cx = width * 0.5;
  const cy = height * 0.3;
  const coreRadius = baseSize * 0.04 * (1 + energy * 0.3);

  // Pulse: energy-driven breathing
  const pulse = 1 + Math.sin(frame * 0.08) * energy * 0.15;

  // Base hue: warm gold shifting with energy
  const baseHue = 35 + energy * 20;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, mixBlendMode: "screen" }}>
        <defs>
          <radialGradient id="mandala-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="40%" stopColor="#FFFDE0" />
            <stop offset="70%" stopColor="#FFD700" />
            <stop offset="100%" stopColor="#FF8C00" stopOpacity="0.4" />
          </radialGradient>
          <filter id="mandala-glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Flame corona */}
        {flames.map((fl, fi) => {
          const wave = Math.sin(frame * fl.speed + fl.phase);
          const angleWobble = wave * 0.15;
          const angle = fl.angle + angleWobble;
          const len = fl.length * baseSize * (0.08 + energy * 0.12) * pulse;

          const sx = cx + Math.cos(angle) * coreRadius * 1.2;
          const sy = cy + Math.sin(angle) * coreRadius * 1.2;
          const ex = cx + Math.cos(angle) * (coreRadius * 1.2 + len);
          const ey = cy + Math.sin(angle) * (coreRadius * 1.2 + len);

          // Curved tendril
          const cpAngle = angle + wave * 0.3;
          const cpDist = coreRadius * 1.2 + len * 0.5;
          const cpx = cx + Math.cos(cpAngle) * cpDist;
          const cpy = cy + Math.sin(cpAngle) * cpDist;

          const flameHue = baseHue + fi * 5;
          const flameAlpha = 0.3 + energy * 0.4 + wave * 0.1;

          return (
            <path
              key={`fl${fi}`}
              d={`M ${sx} ${sy} Q ${cpx} ${cpy}, ${ex} ${ey}`}
              fill="none"
              stroke={`hsla(${flameHue}, 90%, 60%, ${Math.max(0, flameAlpha)})`}
              strokeWidth={fl.width * (0.8 + energy * 0.5)}
              strokeLinecap="round"
              filter="url(#mandala-glow)"
            />
          );
        })}

        {/* Mandala rings */}
        {rings.map((ring, ri) => {
          const r = ring.radius * baseSize * pulse;
          const rotation = frame * ring.rotSpeed + ring.phase;
          const ringHue = (baseHue + ring.hueShift) % 360;
          const ringAlpha = interpolate(energy, [0.03, 0.25], [0.15, 0.5], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <g key={`ring${ri}`} opacity={ringAlpha}>
              {Array.from({ length: ring.count }, (_, ei) => {
                const angle = rotation + (ei / ring.count) * Math.PI * 2;
                const px = cx + Math.cos(angle) * r;
                const py = cy + Math.sin(angle) * r;
                const elemSize = ring.size * baseSize * pulse;

                if (ring.style === "dot") {
                  return (
                    <circle
                      key={`e${ei}`}
                      cx={px} cy={py}
                      r={elemSize * 0.5}
                      fill={`hsla(${ringHue}, 85%, 65%, 0.7)`}
                    />
                  );
                } else if (ring.style === "ray") {
                  const outerX = cx + Math.cos(angle) * (r + elemSize * 2);
                  const outerY = cy + Math.sin(angle) * (r + elemSize * 2);
                  return (
                    <line
                      key={`e${ei}`}
                      x1={px} y1={py} x2={outerX} y2={outerY}
                      stroke={`hsla(${ringHue}, 80%, 60%, 0.6)`}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                  );
                } else {
                  // petal
                  const petalLen = elemSize * 2;
                  const petalAngle = angle;
                  const tip = { x: cx + Math.cos(petalAngle) * (r + petalLen), y: cy + Math.sin(petalAngle) * (r + petalLen) };
                  const left = { x: px + Math.cos(petalAngle + 0.3) * petalLen * 0.3, y: py + Math.sin(petalAngle + 0.3) * petalLen * 0.3 };
                  const right = { x: px + Math.cos(petalAngle - 0.3) * petalLen * 0.3, y: py + Math.sin(petalAngle - 0.3) * petalLen * 0.3 };
                  return (
                    <path
                      key={`e${ei}`}
                      d={`M ${px} ${py} Q ${left.x} ${left.y}, ${tip.x} ${tip.y} Q ${right.x} ${right.y}, ${px} ${py}`}
                      fill={`hsla(${ringHue}, 85%, 60%, 0.4)`}
                      stroke={`hsla(${ringHue}, 80%, 70%, 0.5)`}
                      strokeWidth={0.5}
                    />
                  );
                }
              })}
            </g>
          );
        })}

        {/* Core */}
        <circle cx={cx} cy={cy} r={coreRadius * 2} fill="url(#mandala-core)" opacity={0.3} style={{ filter: "blur(10px)" }} />
        <circle cx={cx} cy={cy} r={coreRadius} fill="url(#mandala-core)" filter="url(#mandala-glow)" />
        <circle cx={cx} cy={cy} r={coreRadius * 0.35} fill="#FFFFFF" opacity={0.8 + energy * 0.2} />
      </svg>
    </div>
  );
};
