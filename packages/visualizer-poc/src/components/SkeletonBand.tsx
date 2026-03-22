/**
 * SkeletonBand -- parade of 4 skeleton musicians crossing the screen.
 * Each skeleton is tied to a stem: bass, drums, guitar (other), vocals.
 * Silhouette style with backlit glow from chromaHue palette.
 * No energy gating -- renders whenever active (rotation engine controls timing).
 * Each musician plays their instrument when their stem is active.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

type IconFC = React.FC<{
  size: number;
  color: string;
  glowColor: string;
  activity: number; // 0-1 how active this stem is right now
  frame: number;
  tempoFactor: number;
}>;

/* ------------------------------------------------------------------ */
/*  Skeleton SVGs — silhouette style with instrument-playing poses     */
/* ------------------------------------------------------------------ */

/** Bass skeleton (Phil) — body bobs with bass, plucking hand moves */
const SkeletonBass: IconFC = ({ size, color, glowColor, activity, frame, tempoFactor }) => {
  const pluck = Math.sin(frame * 0.25 * tempoFactor) * activity * 8;
  const bodyBob = activity * 6;
  const headTilt = Math.sin(frame * 0.08 * tempoFactor) * activity * 4;
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 130" fill="none">
      {/* Backlit glow */}
      <ellipse cx="50" cy="65" rx="35" ry="55" fill={glowColor} opacity={0.08 + activity * 0.12} />
      {/* Head */}
      <circle cx="50" cy={16 - bodyBob * 0.3} r="13" fill={color} opacity="0.9"
        transform={`rotate(${headTilt}, 50, 16)`} />
      <circle cx="45" cy="13" r="2" fill="black" opacity="0.6" />
      <circle cx="55" cy="13" r="2" fill="black" opacity="0.6" />
      {/* Jaw — opens slightly with bass hits */}
      <rect x="44" y={21 + activity * 2} width="12" height={3 + activity * 3} rx="1" fill={color} opacity="0.5" />
      {/* Spine */}
      <line x1="50" y1={29 - bodyBob * 0.2} x2="50" y2={68 + bodyBob * 0.5} stroke={color} strokeWidth="3" />
      {/* Ribs */}
      <path d={`M 38 ${38 + bodyBob * 0.2} Q 44 ${42 + bodyBob * 0.3} 50 ${38 + bodyBob * 0.2} Q 56 ${42 + bodyBob * 0.3} 62 ${38 + bodyBob * 0.2}`} stroke={color} strokeWidth="1.5" opacity="0.4" />
      <path d={`M 40 ${45 + bodyBob * 0.3} Q 45 ${48 + bodyBob * 0.3} 50 ${45 + bodyBob * 0.3} Q 55 ${48 + bodyBob * 0.3} 60 ${45 + bodyBob * 0.3}`} stroke={color} strokeWidth="1.5" opacity="0.4" />
      {/* Left arm — neck hand (steady) */}
      <line x1="42" y1="40" x2="25" y2="30" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Right arm — plucking hand (moves with bass) */}
      <line x1="58" y1="42" x2={70 + pluck * 0.3} y2={58 + pluck} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Bass guitar body */}
      <ellipse cx="22" cy="78" rx="13" ry="17" fill={color} opacity={0.3 + activity * 0.2} />
      <circle cx="22" cy="76" r="3.5" fill="black" opacity="0.25" />
      {/* Bass neck */}
      <line x1="22" y1="61" x2="22" y2="8" stroke={color} strokeWidth="2.5" opacity="0.45" />
      <rect x="18" y="4" width="8" height="7" rx="2" fill={color} opacity="0.4" />
      {/* Strings vibrate with activity */}
      {activity > 0.15 && (
        <path d={`M 22 61 Q ${22 + Math.sin(frame * 0.6) * activity * 3} 40 22 18`}
          stroke={color} strokeWidth="0.8" opacity={activity * 0.6} />
      )}
      {/* Legs — slight bounce */}
      <line x1="45" y1={68 + bodyBob * 0.5} x2="38" y2={105 + bodyBob} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="55" y1={68 + bodyBob * 0.5} x2="62" y2={105 + bodyBob} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="36" cy={108 + bodyBob} rx="7" ry="3" fill={color} opacity="0.4" />
      <ellipse cx="64" cy={108 + bodyBob} rx="7" ry="3" fill={color} opacity="0.4" />
    </svg>
  );
};

/** Drum skeleton (Bill/Mickey) — sticks strike on drum onset */
const SkeletonDrums: IconFC = ({ size, color, glowColor, activity, frame, tempoFactor }) => {
  // Sticks slam down on hits, rest position up
  const stickStrike = activity > 0.3 ? activity * 25 : 0;
  const leftStickPhase = Math.sin(frame * 0.3 * tempoFactor) > 0 ? stickStrike : 0;
  const rightStickPhase = Math.sin(frame * 0.3 * tempoFactor + Math.PI) > 0 ? stickStrike : 0;
  const headBang = activity * 5;
  return (
    <svg width={size * 1.2} height={size * 1.2} viewBox="0 0 130 130" fill="none">
      <ellipse cx="65" cy="65" rx="40" ry="55" fill={glowColor} opacity={0.08 + activity * 0.12} />
      {/* Head — bangs forward on hits */}
      <circle cx="65" cy={16 + headBang * 0.4} r="13" fill={color} opacity="0.9" />
      <circle cx="60" cy="13" r="2" fill="black" opacity="0.6" />
      <circle cx="70" cy="13" r="2" fill="black" opacity="0.6" />
      <rect x="59" y="21" width="12" height="3" rx="1" fill={color} opacity="0.5" />
      {/* Spine */}
      <line x1="65" y1="29" x2="65" y2="62" stroke={color} strokeWidth="3" />
      <path d="M 53 38 Q 59 42 65 38 Q 71 42 77 38" stroke={color} strokeWidth="1.5" opacity="0.4" />
      {/* Left arm + stick — strikes down */}
      <line x1="55" y1="38" x2="30" y2={30 + leftStickPhase * 0.6} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="30" y1={30 + leftStickPhase * 0.6} x2={22 + leftStickPhase * 0.3} y2={20 + leftStickPhase} stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Right arm + stick — strikes down (alternating) */}
      <line x1="75" y1="38" x2="100" y2={30 + rightStickPhase * 0.6} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="100" y1={30 + rightStickPhase * 0.6} x2={108 - rightStickPhase * 0.3} y2={20 + rightStickPhase} stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Drum kit — glows on hit */}
      <ellipse cx="42" cy="77" rx="18" ry="12" stroke={color} strokeWidth="2"
        opacity={0.4 + (leftStickPhase > 5 ? 0.4 : 0)} />
      <ellipse cx="88" cy="77" rx="18" ry="12" stroke={color} strokeWidth="2"
        opacity={0.4 + (rightStickPhase > 5 ? 0.4 : 0)} />
      <ellipse cx="65" cy="87" rx="22" ry="14" stroke={color} strokeWidth="2.5"
        opacity={0.5 + activity * 0.3} />
      {/* Hit flash on drums */}
      {activity > 0.5 && (
        <>
          <ellipse cx="65" cy="87" rx="18" ry="10" fill={glowColor} opacity={activity * 0.25} />
        </>
      )}
      {/* Cymbal */}
      <ellipse cx="108" cy="58" rx="12" ry="3" stroke={color} strokeWidth="1.5" opacity={0.4 + activity * 0.3} />
      <line x1="108" y1="58" x2="108" y2="88" stroke={color} strokeWidth="1.5" opacity="0.3" />
      {/* Legs behind kit */}
      <line x1="59" y1="62" x2="50" y2="102" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      <line x1="71" y1="62" x2="80" y2="102" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
};

/** Guitar skeleton (Jerry) — strumming hand moves with stemOtherRms */
const SkeletonGuitar: IconFC = ({ size, color, glowColor, activity, frame, tempoFactor }) => {
  const strum = Math.sin(frame * 0.2 * tempoFactor) * activity * 10;
  const sway = Math.sin(frame * 0.05 * tempoFactor) * activity * 6;
  const neckBend = Math.sin(frame * 0.04 * tempoFactor) * activity * 3;
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 130" fill="none">
      <ellipse cx="50" cy="65" rx="35" ry="55" fill={glowColor} opacity={0.08 + activity * 0.12} />
      {/* Head — sways with playing */}
      <g transform={`translate(${sway * 0.3}, 0)`}>
        <circle cx="50" cy="16" r="13" fill={color} opacity="0.9" />
        <circle cx="45" cy="13" r="2" fill="black" opacity="0.6" />
        <circle cx="55" cy="13" r="2" fill="black" opacity="0.6" />
        <rect x="44" y="21" width="12" height="3" rx="1" fill={color} opacity="0.5" />
      </g>
      {/* Spine — slight sway */}
      <line x1={50 + sway * 0.2} y1="29" x2={50 + sway * 0.1} y2="68" stroke={color} strokeWidth="3" />
      <path d={`M ${38 + sway * 0.15} 38 Q ${44 + sway * 0.15} 42 ${50 + sway * 0.15} 38 Q ${56 + sway * 0.15} 42 ${62 + sway * 0.15} 38`} stroke={color} strokeWidth="1.5" opacity="0.4" />
      {/* Left arm — fretting hand (subtle neck movement) */}
      <line x1="42" y1="40" x2={20 + neckBend} y2="52" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Right arm — strumming hand */}
      <line x1="58" y1="40" x2={73 + strum * 0.5} y2={55 + strum} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Guitar body */}
      <ellipse cx="70" cy="60" rx="15" ry="11" fill={color} opacity={0.35 + activity * 0.15} />
      <ellipse cx="70" cy="70" rx="13" ry="10" fill={color} opacity={0.3 + activity * 0.15} />
      <circle cx="70" cy="63" r="3" fill="black" opacity="0.25" />
      {/* Guitar neck */}
      <line x1="57" y1="56" x2="20" y2="48" stroke={color} strokeWidth="2.5" opacity="0.5" />
      {/* Strings vibration */}
      {activity > 0.15 && (
        <path d={`M 57 56 Q ${40 + Math.sin(frame * 0.5) * activity * 4} ${52 + Math.cos(frame * 0.7) * activity * 2} 20 48`}
          stroke={color} strokeWidth="0.7" opacity={activity * 0.5} />
      )}
      {/* Legs */}
      <line x1="46" y1="68" x2="36" y2="105" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="54" y1="68" x2="64" y2="105" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="34" cy="108" rx="7" ry="3" fill={color} opacity="0.4" />
      <ellipse cx="66" cy="108" rx="7" ry="3" fill={color} opacity="0.4" />
    </svg>
  );
};

/** Vocal skeleton (Bobby/Jerry vocal) — jaw moves with stemVocalRms */
const SkeletonVocal: IconFC = ({ size, color, glowColor, activity, frame, tempoFactor }) => {
  const jawOpen = activity * 8;
  const armGesture = Math.sin(frame * 0.07 * tempoFactor) * activity * 12;
  const bodyRock = Math.sin(frame * 0.06 * tempoFactor) * activity * 4;
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 130" fill="none">
      <ellipse cx="50" cy="65" rx="35" ry="55" fill={glowColor} opacity={0.08 + activity * 0.12} />
      {/* Head */}
      <circle cx="50" cy="16" r="13" fill={color} opacity="0.9" />
      <circle cx="45" cy="13" r="2" fill="black" opacity="0.6" />
      <circle cx="55" cy="13" r="2" fill="black" opacity="0.6" />
      {/* Jaw — wide open when singing */}
      <ellipse cx="50" cy={22 + jawOpen * 0.5} rx="6" ry={2 + jawOpen * 0.6} fill={color} opacity="0.5" />
      {/* Visible mouth cavity when singing */}
      {activity > 0.2 && (
        <ellipse cx="50" cy={23 + jawOpen * 0.4} rx={3 + activity * 2} ry={activity * 3} fill="black" opacity={0.3 + activity * 0.2} />
      )}
      {/* Spine */}
      <line x1={50 + bodyRock} y1="29" x2={50 + bodyRock * 0.5} y2="68" stroke={color} strokeWidth="3" />
      <path d={`M ${38 + bodyRock * 0.3} 38 Q ${44 + bodyRock * 0.3} 42 ${50 + bodyRock * 0.3} 38 Q ${56 + bodyRock * 0.3} 42 ${62 + bodyRock * 0.3} 38`} stroke={color} strokeWidth="1.5" opacity="0.4" />
      <path d={`M ${40 + bodyRock * 0.2} 45 Q ${45 + bodyRock * 0.2} 48 ${50 + bodyRock * 0.2} 45 Q ${55 + bodyRock * 0.2} 48 ${60 + bodyRock * 0.2} 45`} stroke={color} strokeWidth="1.5" opacity="0.4" />
      {/* Left arm — mic hand (holding steady) */}
      <line x1="42" y1="40" x2="35" y2="28" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Microphone */}
      <rect x="32" y="18" width="6" height="12" rx="3" fill={color} opacity={0.5 + activity * 0.3} />
      <line x1="35" y1="30" x2="35" y2="28" stroke={color} strokeWidth="1.5" opacity="0.4" />
      {/* Right arm — gesturing */}
      <line x1="58" y1="40" x2={72 + armGesture} y2={48 - Math.abs(armGesture) * 0.5} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Sound waves from mouth when singing */}
      {activity > 0.25 && (
        <>
          <path d={`M 40 ${20 + jawOpen * 0.3} Q 32 ${16 + jawOpen * 0.3} 28 ${18 + jawOpen * 0.3}`}
            stroke={color} strokeWidth="1" opacity={activity * 0.4} fill="none" />
          <path d={`M 60 ${20 + jawOpen * 0.3} Q 68 ${16 + jawOpen * 0.3} 72 ${18 + jawOpen * 0.3}`}
            stroke={color} strokeWidth="1" opacity={activity * 0.4} fill="none" />
        </>
      )}
      {/* Legs */}
      <line x1="45" y1="68" x2="38" y2="105" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="55" y1="68" x2="62" y2="105" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="36" cy="108" rx="7" ry="3" fill={color} opacity="0.4" />
      <ellipse cx="64" cy="108" rx="7" ry="3" fill={color} opacity="0.4" />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Band layout: Bass, Drums, Guitar, Vocals                          */
/* ------------------------------------------------------------------ */

const SKELETONS: IconFC[] = [SkeletonBass, SkeletonDrums, SkeletonGuitar, SkeletonVocal];
const SKELETON_SPACING = 300;
const MARCH_DURATION = 450; // 15 seconds to cross at 30fps

interface Props {
  frames: EnhancedFrameData[];
}

export const SkeletonBand: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const fd = frames[idx];

  // Per-stem activity levels (0-1) with fallbacks
  const stemActivity = [
    fd.stemBassRms ?? fd.sub,                        // bass skeleton
    fd.stemDrumOnset ?? fd.onset,                     // drum skeleton
    fd.stemOtherRms ?? fd.mid,                        // guitar skeleton
    fd.stemVocalRms ?? snap.energy,                   // vocal skeleton
  ];

  // March progress: simple linear crossing, no energy gating
  const progress = (frame % MARCH_DURATION) / MARCH_DURATION;
  const marchIndex = Math.floor(frame / MARCH_DURATION);
  const goingRight = marchIndex % 2 === 0;

  // Palette-driven colors from chromaHue
  const hue = snap.chromaHue;
  const skeletonColors = [
    `hsl(${hue}, 70%, 65%)`,
    `hsl(${(hue + 90) % 360}, 75%, 60%)`,
    `hsl(${(hue + 180) % 360}, 70%, 65%)`,
    `hsl(${(hue + 270) % 360}, 75%, 60%)`,
  ];
  const glowColors = [
    `hsla(${hue}, 80%, 70%, 0.5)`,
    `hsla(${(hue + 90) % 360}, 85%, 65%, 0.5)`,
    `hsla(${(hue + 180) % 360}, 80%, 70%, 0.5)`,
    `hsla(${(hue + 270) % 360}, 85%, 65%, 0.5)`,
  ];

  // Fade in/out at march edges
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.94, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Lower opacity when quiet, but never fully invisible
  const energyOpacity = interpolate(snap.energy, [0.02, 0.15], [0.3, 0.75], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * energyOpacity;

  const totalWidth = SKELETONS.length * SKELETON_SPACING;
  const yBase = height * 0.35;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {SKELETONS.map((Skeleton, i) => {
        const skelProgress = progress - i * 0.025;
        const color = skeletonColors[i];
        const glowColor = glowColors[i];
        const activity = stemActivity[i];

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

        // Stem-reactive bob: each skeleton bobs to their own stem
        const bob = Math.sin((frame * 0.1 * tempoFactor) + i * 1.5) * (4 + activity * 14 + snap.beatDecay * 6);
        const tilt = Math.sin((frame * 0.06 * tempoFactor) + i * 0.8) * (3 + activity * 4);

        // Backlit silhouette glow — brighter when stem is active
        const glowIntensity = 8 + activity * 20;
        const glow = `drop-shadow(0 0 ${glowIntensity}px ${glowColor}) drop-shadow(0 0 ${glowIntensity * 2}px ${glowColor})`;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: yBase + bob,
              transform: `rotate(${tilt}deg) scaleX(${goingRight ? 1 : -1})`,
              opacity: masterOpacity,
              filter: glow,
              willChange: "transform, opacity",
            }}
          >
            <Skeleton
              size={120}
              color={color}
              glowColor={glowColor}
              activity={activity}
              frame={frame}
              tempoFactor={tempoFactor}
            />
          </div>
        );
      })}
    </div>
  );
};
