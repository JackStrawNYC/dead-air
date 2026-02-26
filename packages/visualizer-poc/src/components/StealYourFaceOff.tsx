/**
 * StealYourFaceOff -- The Stealie shattering apart and reforming.
 * Complete Steal Your Face (circle + lightning bolt + horizontal line).
 * Over 8 seconds, pieces separate and drift apart (fragments move outward).
 * Then over 4 seconds, pieces magnetically pull back together.
 * Fragment rotation and drift speed driven by energy.
 * Neon colors with heavy glow. Appears every 90s for 14s.
 * Dramatic breakup/reform cycle.
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

interface Fragment {
  /** SVG path or shape identifier */
  id: string;
  /** Drift direction angle */
  driftAngle: number;
  /** Drift distance multiplier */
  driftDistance: number;
  /** Rotation speed */
  rotSpeed: number;
  /** Rotation direction */
  rotDir: number;
  /** Scale jitter */
  scaleJitter: number;
}

const CYCLE = 2700; // 90 seconds at 30fps
const DURATION = 420; // 14 seconds at 30fps
const BREAK_DURATION = 240; // 8 seconds: breaking apart
const REFORM_DURATION = 120; // 4 seconds: reforming
// Remaining 2 seconds: hold complete at start

function generateFragments(seed: number): Fragment[] {
  const rng = seeded(seed);
  const ids = [
    "outer-ring",
    "inner-ring",
    "top-half-fill",
    "bottom-half-fill",
    "horizontal-line",
    "bolt-upper",
    "bolt-lower",
    "left-eye",
    "right-eye",
  ];
  return ids.map((id) => ({
    id,
    driftAngle: rng() * Math.PI * 2,
    driftDistance: 80 + rng() * 200,
    rotSpeed: (rng() - 0.5) * 4,
    rotDir: rng() > 0.5 ? 1 : -1,
    scaleJitter: 0.9 + rng() * 0.2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const StealYourFaceOff: React.FC<Props> = ({ frames }) => {
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

  const fragments = React.useMemo(() => generateFragments(19_770_508), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Master opacity: fade in / fade out
  const masterOpacity = interpolate(progress, [0, 0.05, 0.9, 1], [0, 0.9, 0.9, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (masterOpacity < 0.01) return null;

  // Phase: 0-60 frames hold, 60-300 break apart, 300-420 reform
  const holdEnd = 60;
  const breakEnd = holdEnd + BREAK_DURATION;

  let shatterProgress: number; // 0 = intact, 1 = fully shattered
  if (cycleFrame < holdEnd) {
    shatterProgress = 0;
  } else if (cycleFrame < breakEnd) {
    // Breaking apart: ease out for dramatic initial burst
    shatterProgress = interpolate(cycleFrame, [holdEnd, breakEnd], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
  } else {
    // Reforming: ease in for magnetic pull
    shatterProgress = interpolate(cycleFrame, [breakEnd, breakEnd + REFORM_DURATION], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    });
  }

  // Energy amplifies drift distance and rotation speed
  const energyMult = interpolate(energy, [0.05, 0.3], [0.6, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cx = width / 2;
  const cy = height / 2;
  const baseSize = Math.min(width, height) * 0.25;

  // Neon color cycling
  const hueBase = (frame * 0.5) % 360;
  const mainColor = `hsl(${hueBase}, 100%, 65%)`;
  const boltColor = `hsl(${(hueBase + 120) % 360}, 100%, 70%)`;
  const accentColor = `hsl(${(hueBase + 240) % 360}, 90%, 60%)`;
  const glowColor = `hsla(${hueBase}, 100%, 70%, 0.6)`;

  // Render a fragment with its shatter transform
  const renderFragment = (fragIdx: number, children: React.ReactNode) => {
    const frag = fragments[fragIdx];
    const dx = Math.cos(frag.driftAngle) * frag.driftDistance * shatterProgress * energyMult;
    const dy = Math.sin(frag.driftAngle) * frag.driftDistance * shatterProgress * energyMult;
    const rot = shatterProgress * frag.rotSpeed * energyMult * 180 * frag.rotDir;
    const scale = 1 + (frag.scaleJitter - 1) * shatterProgress;

    return (
      <g key={frag.id} transform={`translate(${dx}, ${dy}) rotate(${rot}) scale(${scale})`}>
        {children}
      </g>
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <g
          transform={`translate(${cx}, ${cy}) scale(${baseSize / 100})`}
          style={{ filter: `drop-shadow(0 0 12px ${glowColor}) drop-shadow(0 0 24px ${glowColor})` }}
        >
          {/* Fragment 0: Outer ring */}
          {renderFragment(0, (
            <circle cx={0} cy={0} r={94} fill="none" stroke={mainColor} strokeWidth={5} />
          ))}

          {/* Fragment 1: Inner ring */}
          {renderFragment(1, (
            <circle cx={0} cy={0} r={88} fill="none" stroke={mainColor} strokeWidth={1.5} opacity={0.5} />
          ))}

          {/* Fragment 2: Top half fill (skull dome) */}
          {renderFragment(2, (
            <path
              d="M -88 0 A 88 88 0 0 1 88 0 L -88 0 Z"
              fill={accentColor}
              opacity={0.15}
            />
          ))}

          {/* Fragment 3: Bottom half fill */}
          {renderFragment(3, (
            <path
              d="M -88 0 A 88 88 0 0 0 88 0 L -88 0 Z"
              fill={mainColor}
              opacity={0.08}
            />
          ))}

          {/* Fragment 4: Horizontal line */}
          {renderFragment(4, (
            <line x1={-94} y1={0} x2={94} y2={0} stroke={mainColor} strokeWidth={3} />
          ))}

          {/* Fragment 5: Upper lightning bolt */}
          {renderFragment(5, (
            <polygon
              points="0,-88 -12,-18 8,-18"
              fill={boltColor}
            />
          ))}

          {/* Fragment 6: Lower lightning bolt */}
          {renderFragment(6, (
            <polygon
              points="-22,88 18,5 -4,5"
              fill={boltColor}
            />
          ))}

          {/* Fragment 7: Left eye */}
          {renderFragment(7, (
            <>
              <circle cx={-32} cy={-24} r={18} fill="none" stroke={mainColor} strokeWidth={3} />
              <circle cx={-32} cy={-24} r={8} fill={mainColor} opacity={0.3} />
            </>
          ))}

          {/* Fragment 8: Right eye */}
          {renderFragment(8, (
            <>
              <circle cx={32} cy={-24} r={18} fill="none" stroke={mainColor} strokeWidth={3} />
              <circle cx={32} cy={-24} r={8} fill={mainColor} opacity={0.3} />
            </>
          ))}
        </g>
      </svg>
    </div>
  );
};
