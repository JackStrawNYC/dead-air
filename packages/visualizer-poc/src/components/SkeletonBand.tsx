/**
 * SkeletonBand — parade of skeletons with instruments crossing the screen.
 * 4 skeletons: guitarist, drummer, bassist, keyboardist (the Dead lineup).
 * Marches across mid-screen during high-energy passages.
 * Appears less frequently than bears — every ~45 seconds during loud sections.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

type IconFC = React.FC<{ size: number; color: string }>;

const SKELETON_COLORS = [
  "#FF1493", // deep pink
  "#00FFFF", // cyan
  "#FFD700", // gold
  "#76FF03", // neon green
];

/** Skeleton Guitarist (Jerry) */
const SkeletonGuitar: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none">
    <circle cx="50" cy="16" r="13" fill={color} />
    <circle cx="45" cy="13" r="2.5" fill="black" opacity="0.5" />
    <circle cx="55" cy="13" r="2.5" fill="black" opacity="0.5" />
    <rect x="44" y="21" width="12" height="4" rx="1" fill={color} opacity="0.6" />
    <line x1="50" y1="29" x2="50" y2="65" stroke={color} strokeWidth="3.5" />
    <path d="M 38 38 Q 44 42 50 38 Q 56 42 62 38" stroke={color} strokeWidth="2" opacity="0.5" />
    <path d="M 40 45 Q 45 48 50 45 Q 55 48 60 45" stroke={color} strokeWidth="2" opacity="0.5" />
    <line x1="42" y1="40" x2="20" y2="52" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="58" y1="40" x2="75" y2="55" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="70" cy="60" rx="15" ry="11" fill={color} opacity="0.5" />
    <ellipse cx="70" cy="70" rx="13" ry="10" fill={color} opacity="0.45" />
    <circle cx="70" cy="63" r="3" fill="black" opacity="0.3" />
    <line x1="57" y1="56" x2="20" y2="48" stroke={color} strokeWidth="3" opacity="0.6" />
    <line x1="46" y1="65" x2="36" y2="100" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="54" y1="65" x2="64" y2="100" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="34" cy="104" rx="8" ry="4" fill={color} opacity="0.5" />
    <ellipse cx="66" cy="104" rx="8" ry="4" fill={color} opacity="0.5" />
  </svg>
);

/** Skeleton Drummer (Bill/Mickey) */
const SkeletonDrums: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    <circle cx="60" cy="16" r="13" fill={color} />
    <circle cx="55" cy="13" r="2.5" fill="black" opacity="0.5" />
    <circle cx="65" cy="13" r="2.5" fill="black" opacity="0.5" />
    <rect x="54" y="21" width="12" height="4" rx="1" fill={color} opacity="0.6" />
    <line x1="60" y1="29" x2="60" y2="60" stroke={color} strokeWidth="3.5" />
    <path d="M 48 38 Q 54 42 60 38 Q 66 42 72 38" stroke={color} strokeWidth="2" opacity="0.5" />
    {/* Arms raised with sticks */}
    <line x1="50" y1="38" x2="25" y2="28" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="25" y1="28" x2="18" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="70" y1="38" x2="95" y2="28" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="95" y1="28" x2="102" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    {/* Drum kit */}
    <ellipse cx="40" cy="75" rx="18" ry="12" stroke={color} strokeWidth="2" opacity="0.6" />
    <ellipse cx="80" cy="75" rx="18" ry="12" stroke={color} strokeWidth="2" opacity="0.6" />
    <ellipse cx="60" cy="85" rx="22" ry="14" stroke={color} strokeWidth="2.5" opacity="0.7" />
    {/* Cymbal */}
    <ellipse cx="100" cy="55" rx="12" ry="3" stroke={color} strokeWidth="1.5" opacity="0.5" />
    <line x1="100" y1="55" x2="100" y2="85" stroke={color} strokeWidth="1.5" opacity="0.4" />
    {/* Legs behind kit */}
    <line x1="54" y1="60" x2="45" y2="100" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.5" />
    <line x1="66" y1="60" x2="75" y2="100" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.5" />
  </svg>
);

/** Skeleton Bassist (Phil) */
const SkeletonBass: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 100 120" fill="none">
    <circle cx="50" cy="16" r="13" fill={color} />
    <circle cx="45" cy="13" r="2.5" fill="black" opacity="0.5" />
    <circle cx="55" cy="13" r="2.5" fill="black" opacity="0.5" />
    <rect x="44" y="21" width="12" height="4" rx="1" fill={color} opacity="0.6" />
    <line x1="50" y1="29" x2="50" y2="68" stroke={color} strokeWidth="3.5" />
    <path d="M 38 38 Q 44 42 50 38 Q 56 42 62 38" stroke={color} strokeWidth="2" opacity="0.5" />
    <path d="M 40 45 Q 45 48 50 45 Q 55 48 60 45" stroke={color} strokeWidth="2" opacity="0.5" />
    {/* Arms on bass */}
    <line x1="42" y1="40" x2="25" y2="55" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="58" y1="42" x2="70" y2="60" stroke={color} strokeWidth="3" strokeLinecap="round" />
    {/* Bass guitar (tall) */}
    <ellipse cx="22" cy="80" rx="12" ry="16" fill={color} opacity="0.45" />
    <circle cx="22" cy="78" r="3" fill="black" opacity="0.3" />
    <line x1="22" y1="64" x2="22" y2="10" stroke={color} strokeWidth="3" opacity="0.5" />
    <rect x="18" y="6" width="8" height="8" rx="2" fill={color} opacity="0.5" />
    {/* Legs */}
    <line x1="45" y1="68" x2="38" y2="105" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="55" y1="68" x2="62" y2="105" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="36" cy="108" rx="7" ry="3" fill={color} opacity="0.5" />
    <ellipse cx="64" cy="108" rx="7" ry="3" fill={color} opacity="0.5" />
  </svg>
);

/** Skeleton Keyboardist (Keith/Brent) */
const SkeletonKeys: IconFC = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    <circle cx="60" cy="16" r="13" fill={color} />
    <circle cx="55" cy="13" r="2.5" fill="black" opacity="0.5" />
    <circle cx="65" cy="13" r="2.5" fill="black" opacity="0.5" />
    <rect x="54" y="21" width="12" height="4" rx="1" fill={color} opacity="0.6" />
    <line x1="60" y1="29" x2="60" y2="62" stroke={color} strokeWidth="3.5" />
    <path d="M 48 38 Q 54 42 60 38 Q 66 42 72 38" stroke={color} strokeWidth="2" opacity="0.5" />
    {/* Arms reaching to keys */}
    <line x1="50" y1="40" x2="30" y2="58" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="70" y1="40" x2="90" y2="58" stroke={color} strokeWidth="3" strokeLinecap="round" />
    {/* Keyboard */}
    <rect x="15" y="60" width="90" height="18" rx="2" stroke={color} strokeWidth="2" opacity="0.7" />
    {/* White keys */}
    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((k) => (
      <line key={k} x1={22 + k * 7} y1="60" x2={22 + k * 7} y2="78" stroke={color} strokeWidth="0.8" opacity="0.4" />
    ))}
    {/* Black keys */}
    {[0, 1, 3, 4, 5, 7, 8, 10, 11].map((k) => (
      <rect key={k} x={23 + k * 7} y="60" width="4" height="10" fill={color} opacity="0.35" />
    ))}
    {/* Keyboard stand */}
    <line x1="25" y1="78" x2="30" y2="105" stroke={color} strokeWidth="2" opacity="0.5" />
    <line x1="95" y1="78" x2="90" y2="105" stroke={color} strokeWidth="2" opacity="0.5" />
    {/* Legs (seated) */}
    <line x1="55" y1="62" x2="45" y2="90" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="65" y1="62" x2="75" y2="90" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="45" y1="90" x2="40" y2="105" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <line x1="75" y1="90" x2="80" y2="105" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const SKELETONS: IconFC[] = [SkeletonGuitar, SkeletonDrums, SkeletonBass, SkeletonKeys];
const SKELETON_SPACING = 160;

interface Props {
  frames: EnhancedFrameData[];
}

export const SkeletonBand: React.FC<Props> = ({ frames }) => {
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

  // Only appear during high energy (> 0.15 rolling RMS)
  if (energy < 0.12) return null;

  const CYCLE = 1350; // 45 seconds
  const MARCH_DURATION = 600; // 20 seconds to cross

  const cycleFrame = frame % CYCLE;
  const cycleIndex = Math.floor(frame / CYCLE);
  const goingRight = cycleIndex % 2 === 0;

  if (cycleFrame >= MARCH_DURATION) return null;

  const progress = cycleFrame / MARCH_DURATION;

  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.94, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0.12, 0.25], [0.3, 0.8], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const totalWidth = SKELETONS.length * SKELETON_SPACING;
  const yBase = height * 0.35; // mid-screen

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {SKELETONS.map((Skeleton, i) => {
        const skelProgress = progress - i * 0.025;
        const color = SKELETON_COLORS[i % SKELETON_COLORS.length];

        let x: number;
        if (goingRight) {
          x = interpolate(skelProgress, [0, 1], [-totalWidth, width + SKELETON_SPACING], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          }) + i * SKELETON_SPACING;
        } else {
          x = interpolate(skelProgress, [0, 1], [width + SKELETON_SPACING, -totalWidth], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          }) - i * SKELETON_SPACING + totalWidth;
        }

        const bob = Math.sin((frame * 0.1) + i * 1.5) * (6 + energy * 12);
        const tilt = Math.sin((frame * 0.06) + i * 0.8) * 5;
        const glow = `drop-shadow(0 0 10px ${color}) drop-shadow(0 0 25px ${color})`;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: yBase + bob,
              transform: `rotate(${tilt}deg) scaleX(${goingRight ? 1 : -1})`,
              opacity,
              filter: glow,
              willChange: "transform, opacity",
            }}
          >
            <Skeleton size={100} color={color} />
          </div>
        );
      })}
    </div>
  );
};
