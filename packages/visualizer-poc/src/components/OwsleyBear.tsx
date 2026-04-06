/**
 * OwsleyBear -- A+++ tribute to the original 1973 Owsley "Bear" Stanley dancing bear.
 *
 * This is the ORIGINAL Bob Thomas design from the back of the 1973 "History of the
 * Grateful Dead, Vol 1 (Bear's Choice)" LP -- a love letter to Owsley Stanley, the
 * Dead's legendary sound engineer / LSD chemist / spiritual patron. Bob Thomas drew
 * a bear in profile, walking, not the modern hopping/dancing version. Rounder, pudgier
 * proportions. Slightly goofy. Three pads visible per paw. A deep cut for real heads.
 *
 * One single LARGE featured bear -- not a parade -- centered in lower-mid frame,
 * walking in profile (rightward). Sunshine yellow, the warmest color in the Bear
 * palette, paying tribute to the radiance Owsley brought to the band. Tiny "OS"
 * initials in the lower corner, "1973" date marker on the opposite side.
 *
 * Walking animation: 4-leg stride cycle (front+back left lift while front+back right
 * plant, then alternate). Body bobs subtly with each step. Head tilts slightly with
 * the gait. Tiny stub tail flicks.
 *
 * Audio reactivity:
 *   - useTempoFactor drives walk speed (faster songs = faster stride)
 *   - musicalTime drives the walk cycle (locked to beat phase)
 *   - beatDecay pulses the body glow on each beat
 *   - energy drives glow intensity and overall vigor
 *   - chromaHue tints the warm halo (chroma rotation around sunshine yellow)
 *   - onsetEnvelope triggers tiny sparkle bursts in the dust motes
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Sunshine yellow -- the deep cut color for Owsley */
const BEAR_COLOR = "#FFD600";
/** Darker amber for inner shading, paw pads, snout shadow */
const BEAR_DARK = "#F9A825";
/** Deep amber-brown for outline strokes and small details */
const BEAR_OUTLINE = "#8D6E00";
/** Warm cream for belly highlight */
const BEAR_HIGHLIGHT = "#FFF59D";

const BEAR_SIZE_BASE = 520; // base width in px at 1080p
const NUM_DUST_MOTES = 14;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/* ------------------------------------------------------------------ */
/*  Profile Walking Bear SVG                                           */
/* ------------------------------------------------------------------ */

interface BearProps {
  size: number;
  /** 0..1 walk-cycle phase (one full stride per unit) */
  stridePhase: number;
  /** vertical body bob in viewBox units */
  bodyBob: number;
  /** head tilt in degrees */
  headTilt: number;
  /** 0..1 overall vigor */
  vigor: number;
  /** 0..1 beat pulse for eye/nose detail */
  beatPulse: number;
  /** small stub-tail flick angle */
  tailFlick: number;
}

const ProfileBear: React.FC<BearProps> = ({
  size,
  stridePhase,
  bodyBob,
  headTilt,
  vigor,
  beatPulse,
  tailFlick,
}) => {
  // ViewBox sized for a profile-view bear walking right
  const vw = 200;
  const vh = 160;

  // === GAIT MATH ===
  // Diagonal-pair gait (like a real bear amble): front-left + rear-right lift
  // together, then front-right + rear-left lift together. Phase 0..1 covers a
  // complete cycle. We use sine for a smooth lift curve, abs for ground contact.
  const phaseA = Math.sin(stridePhase * Math.PI * 2);
  const phaseB = Math.sin((stridePhase + 0.5) * Math.PI * 2);
  // Lift heights (positive = leg up off ground)
  const liftA = Math.max(0, phaseA) * 6 * (0.6 + vigor * 0.4);
  const liftB = Math.max(0, phaseB) * 6 * (0.6 + vigor * 0.4);
  // Forward/back swing of legs
  const swingA = phaseA * 4 * (0.6 + vigor * 0.4);
  const swingB = phaseB * 4 * (0.6 + vigor * 0.4);

  // === TORSO PATH ===
  // Bob Thomas style: thick rounded barrel torso with a slight belly droop
  // and a high rounded shoulder hump. Walking right (head on right side).
  const torsoPath = [
    // Start at rear haunch top
    "M 36 78",
    // Sweep up over the rump
    "Q 30 64 42 56",
    // Across the back (slight shoulder hump near front)
    "Q 70 44 110 50",
    // Up and over the shoulder hump (front end is taller -- bear posture)
    "Q 130 46 144 58",
    // Curve down the chest
    "Q 152 72 148 90",
    // Belly bulge (slight droop, this is the chunky look)
    "Q 130 110 96 108",
    // Rear belly back toward the haunch
    "Q 60 106 44 96",
    // Close the loop at haunch
    "Q 34 88 36 78",
    "Z",
  ].join(" ");

  // === HEAD ===
  // Profile head -- rounder than dancing bear, snout protrudes right
  // headCx/Cy is the center of the cranium, snout sticks out from there.
  const headCx = 150;
  const headCy = 50 + bodyBob * 0.3;

  // Snout: protrudes forward and slightly down
  const snoutTipX = 178;
  const snoutTipY = 60;
  const snoutPath = [
    `M ${headCx + 10} ${headCy - 4}`,
    `Q ${headCx + 22} ${headCy - 6} ${snoutTipX} ${snoutTipY - 2}`,
    `Q ${snoutTipX + 4} ${snoutTipY + 4} ${snoutTipX - 4} ${snoutTipY + 6}`,
    `Q ${headCx + 22} ${headCy + 10} ${headCx + 8} ${headCy + 8}`,
    "Z",
  ].join(" ");

  // === LEGS ===
  // Profile view: 4 legs, two visible front legs, two visible rear legs
  // Rear legs anchored at the haunch, front legs anchored at the shoulder.
  // The "diagonal pair" gait pairs FrontL+RearR vs FrontR+RearL.
  //
  // In profile we layer: far legs behind body, near legs in front.
  // Far legs use slightly desaturated color so they read as depth.
  const farColor = BEAR_DARK;
  const nearColor = BEAR_COLOR;

  // Hip/shoulder anchor points
  const rearHipX = 50;
  const rearHipY = 100;
  const frontShoulderX = 132;
  const frontShoulderY = 96;

  // Foot ground line (where paws plant)
  const groundY = 138;

  // Far rear leg (paired with phaseA)
  const farRearFoot = {
    x: rearHipX - 4 + swingA,
    y: groundY - liftA,
  };
  // Near rear leg (paired with phaseB)
  const nearRearFoot = {
    x: rearHipX + 4 + swingB,
    y: groundY - liftB,
  };
  // Far front leg (paired with phaseB -- diagonal of far rear)
  const farFrontFoot = {
    x: frontShoulderX - 4 + swingB,
    y: groundY - liftB,
  };
  // Near front leg (paired with phaseA -- diagonal of near rear)
  const nearFrontFoot = {
    x: frontShoulderX + 4 + swingA,
    y: groundY - liftA,
  };

  const legWidth = 11;
  const farLegWidth = 9.5;

  // Paw pad helper -- 3 visible toe pads at the bottom of each foot
  // (this is the iconic Owsley/Bob Thomas detail -- exactly 3 round pads)
  const pawPads = (
    cx: number,
    cy: number,
    color: string,
    isNear: boolean,
  ) => {
    const padR = isNear ? 1.6 : 1.4;
    const spread = isNear ? 2.6 : 2.2;
    const padY = cy + 3.2;
    return (
      <>
        <circle cx={cx - spread} cy={padY} r={padR} fill={color} />
        <circle cx={cx} cy={padY + 0.4} r={padR} fill={color} />
        <circle cx={cx + spread} cy={padY} r={padR} fill={color} />
      </>
    );
  };

  // Single foot pad: ellipse base + 3 toe pads
  const foot = (
    fx: number,
    fy: number,
    color: string,
    padColor: string,
    isNear: boolean,
  ) => (
    <g>
      <ellipse cx={fx} cy={fy + 1} rx={isNear ? 6 : 5.2} ry={3} fill={color} />
      {pawPads(fx, fy, padColor, isNear)}
    </g>
  );

  // Beat pulse on eye + nose
  const eyeShineScale = 1 + beatPulse * 0.25;

  // Belly highlight oscillates with bob for a "breathing" feel
  const bellyOpacity = 0.18 + beatPulse * 0.1;

  return (
    <svg
      width={size}
      height={size * (vh / vw)}
      viewBox={`0 0 ${vw} ${vh}`}
      fill="none"
    >
      {/* === FAR LEGS (behind body) === */}
      {/* Far rear thigh + calf */}
      <line
        x1={rearHipX - 2} y1={rearHipY}
        x2={farRearFoot.x} y2={farRearFoot.y}
        stroke={farColor} strokeWidth={farLegWidth} strokeLinecap="round"
      />
      {foot(farRearFoot.x, farRearFoot.y, farColor, BEAR_OUTLINE, false)}

      {/* Far front leg */}
      <line
        x1={frontShoulderX - 2} y1={frontShoulderY}
        x2={farFrontFoot.x} y2={farFrontFoot.y}
        stroke={farColor} strokeWidth={farLegWidth} strokeLinecap="round"
      />
      {foot(farFrontFoot.x, farFrontFoot.y, farColor, BEAR_OUTLINE, false)}

      {/* === TAIL (tiny stub on the rear) === */}
      <g transform={`rotate(${tailFlick}, 32, 70)`}>
        <ellipse cx={29} cy={71} rx={4.5} ry={3.5} fill={BEAR_COLOR} />
        <ellipse cx={28} cy={70} rx={2} ry={1.5} fill={BEAR_HIGHLIGHT} opacity={0.5} />
      </g>

      {/* === TORSO === */}
      <path d={torsoPath} fill={BEAR_COLOR} />
      {/* Belly highlight -- soft cream patch underneath */}
      <ellipse
        cx={92} cy={94}
        rx={32} ry={11}
        fill={BEAR_HIGHLIGHT}
        opacity={bellyOpacity}
      />
      {/* Shoulder hump highlight */}
      <ellipse
        cx={120} cy={54}
        rx={14} ry={5}
        fill={BEAR_HIGHLIGHT}
        opacity={0.22}
      />
      {/* Subtle outline along the back for definition */}
      <path
        d="M 42 56 Q 70 44 110 50 Q 130 46 144 58"
        stroke={BEAR_OUTLINE}
        strokeWidth={1.2}
        opacity={0.3}
        fill="none"
      />

      {/* === NEAR LEGS (in front of body) === */}
      {/* Near rear */}
      <line
        x1={rearHipX + 2} y1={rearHipY}
        x2={nearRearFoot.x} y2={nearRearFoot.y}
        stroke={nearColor} strokeWidth={legWidth} strokeLinecap="round"
      />
      {foot(nearRearFoot.x, nearRearFoot.y, nearColor, BEAR_DARK, true)}

      {/* Near front */}
      <line
        x1={frontShoulderX + 2} y1={frontShoulderY}
        x2={nearFrontFoot.x} y2={nearFrontFoot.y}
        stroke={nearColor} strokeWidth={legWidth} strokeLinecap="round"
      />
      {foot(nearFrontFoot.x, nearFrontFoot.y, nearColor, BEAR_DARK, true)}

      {/* === HEAD GROUP (tilted with gait) === */}
      <g transform={`rotate(${headTilt}, ${headCx}, ${headCy})`}>
        {/* Cranium -- rounded ball */}
        <circle cx={headCx} cy={headCy} r={20} fill={BEAR_COLOR} />

        {/* Bear ears -- small, rounded, NOT pointy -- one visible (near) ear,
            and a tiny sliver of the far ear peeking over the top */}
        {/* Far ear (small sliver) */}
        <ellipse
          cx={headCx - 6} cy={headCy - 17}
          rx={5} ry={5.5}
          fill={BEAR_DARK}
        />
        {/* Near ear (full) */}
        <ellipse
          cx={headCx + 4} cy={headCy - 17}
          rx={6} ry={6.5}
          fill={BEAR_COLOR}
        />
        <ellipse
          cx={headCx + 4} cy={headCy - 16}
          rx={3} ry={3.5}
          fill={BEAR_DARK}
          opacity={0.6}
        />

        {/* Snout protrudes right */}
        <path d={snoutPath} fill={BEAR_COLOR} />
        {/* Snout shading underneath */}
        <ellipse
          cx={headCx + 22} cy={headCy + 6}
          rx={10} ry={3}
          fill={BEAR_DARK}
          opacity={0.4}
        />

        {/* Nose dot -- the iconic black nose at the snout tip */}
        <ellipse
          cx={snoutTipX - 1} cy={snoutTipY - 1}
          rx={3 * eyeShineScale} ry={2.4 * eyeShineScale}
          fill="#1a1a1a"
        />
        {/* Nose shine */}
        <circle
          cx={snoutTipX - 2} cy={snoutTipY - 2}
          r={0.8}
          fill="white"
          opacity={0.7}
        />

        {/* Eye -- single round happy eye (profile view) */}
        <circle
          cx={headCx + 8} cy={headCy - 4}
          r={2.6 * eyeShineScale}
          fill="#1a1a1a"
        />
        <circle
          cx={headCx + 8.7} cy={headCy - 4.7}
          r={0.9}
          fill="white"
          opacity={0.85}
        />
        {/* Eyebrow tuft -- a hint of fur over the eye, gives "happy" cast */}
        <path
          d={`M ${headCx + 5} ${headCy - 8} Q ${headCx + 8} ${headCy - 10} ${headCx + 12} ${headCy - 7}`}
          stroke={BEAR_OUTLINE}
          strokeWidth={1}
          opacity={0.5}
          fill="none"
        />

        {/* Slight smile -- a tiny upward curve below the snout */}
        <path
          d={`M ${headCx + 18} ${snoutTipY + 4} Q ${headCx + 22} ${snoutTipY + 6.5} ${headCx + 26} ${snoutTipY + 4.5}`}
          stroke={BEAR_OUTLINE}
          strokeWidth={1.1}
          strokeLinecap="round"
          fill="none"
          opacity={0.55}
        />

        {/* Cheek blush -- soft warm patch */}
        <ellipse
          cx={headCx + 12} cy={headCy + 2}
          rx={3} ry={1.6}
          fill="#FF8A65"
          opacity={0.18}
        />
      </g>
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Floating Dust Motes / Sparkles                                     */
/* ------------------------------------------------------------------ */

interface MoteProps {
  index: number;
  centerX: number;
  centerY: number;
  spread: number;
  frame: number;
  hue: number;
  vigor: number;
  onsetBurst: number;
}

const DustMote: React.FC<MoteProps> = ({
  index,
  centerX,
  centerY,
  spread,
  frame,
  hue,
  vigor,
  onsetBurst,
}) => {
  // Deterministic per-mote orbit parameters
  const seed = index * 17.31 + 4.2;
  const angle = (frame * 0.012 + seed) % (Math.PI * 2);
  const radiusBase = spread * (0.35 + ((index * 37) % 100) / 100 * 0.65);
  const radius = radiusBase + Math.sin(frame * 0.02 + seed) * spread * 0.08;
  const x = centerX + Math.cos(angle) * radius;
  const yOffset = Math.sin(frame * 0.018 + seed * 1.7) * spread * 0.15;
  const y = centerY + Math.sin(angle) * radius * 0.45 + yOffset;
  const size = 1.5 + ((index * 13) % 7) * 0.6 + onsetBurst * 2.5;
  const flicker = 0.4 + Math.sin(frame * 0.08 + seed * 2.3) * 0.3;
  const moteHue = (hue + index * 23) % 360;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size,
        top: y - size,
        width: size * 2,
        height: size * 2,
        borderRadius: "50%",
        background: `radial-gradient(circle, hsl(${moteHue}, 100%, 80%) 0%, hsl(${moteHue}, 100%, 65%, 0.6) 40%, transparent 70%)`,
        opacity: clamp(flicker * (0.4 + vigor * 0.6) + onsetBurst * 0.4, 0, 1),
        filter: `blur(${0.5 + onsetBurst * 1.5}px)`,
        boxShadow: `0 0 ${4 + onsetBurst * 8}px hsl(${moteHue}, 100%, 70%)`,
        willChange: "transform, opacity",
      }}
    />
  );
};

/* ------------------------------------------------------------------ */
/*  OwsleyBear -- main overlay component                                */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const OwsleyBear: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const beatDecay = snap.beatDecay;
  const musicalTime = snap.musicalTime;
  const chromaHue = snap.chromaHue ?? 0;
  const onsetEnvelope = snap.onsetEnvelope ?? 0;

  // Scale designed at 1080p
  const resScale = height / 1080;
  const BEAR_SIZE = Math.round(BEAR_SIZE_BASE * resScale);
  const BEAR_HEIGHT = BEAR_SIZE * (160 / 200);

  // Energy-derived vigor: 0 = gentle stroll, 1 = brisk amble
  const vigor = interpolate(energy, [0.03, 0.12, 0.3], [0.25, 0.6, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Opacity: visible whenever overlay engine has us up, brighter at higher energy
  const opacity = interpolate(energy, [0.02, 0.1, 0.25], [0.35, 0.7, 0.92], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // === WALK CYCLE ===
  // Locked to musicalTime so the stride syncs to the beat. Two strides per beat.
  // Falls back to a tempo-scaled frame counter when musicalTime is unavailable.
  const stridePhase = musicalTime > 0
    ? (musicalTime * 2) % 1
    : (frame * 0.025 * tempoFactor) % 1;

  // === BODY BOB ===
  // Two body lifts per stride cycle (one per leg pair plant).
  // Use absolute sin so the body rises on each footfall.
  const bobAmp = lerp(2, 6, vigor) + beatDecay * lerp(2, 5, vigor);
  const bodyBob = -Math.abs(Math.sin(stridePhase * Math.PI * 2)) * bobAmp;

  // === HEAD TILT ===
  // Subtle nodding tilt that follows the gait
  const headTilt = Math.sin(stridePhase * Math.PI * 2 + 0.4) * lerp(1.5, 4, vigor);

  // === TAIL FLICK ===
  // Stub tail flicks slightly out of phase with the gait
  const tailFlick = Math.sin(stridePhase * Math.PI * 2 + 1.2) * 8 * vigor;

  // === FRAME POSITION ===
  // Anchor in lower-mid frame, slightly left of center so bear appears to walk
  // toward the right side of the screen (he's moving forward)
  const centerX = width * 0.5;
  const yBase = height - Math.round(BEAR_HEIGHT * 1.05) - Math.round(60 * resScale);
  const bearLeft = centerX - BEAR_SIZE / 2;

  // === GLOW ===
  // Heavy neon glow with chroma-hue-tinted halo
  const glowBase = 10 + beatDecay * 22 + energy * 14;
  const glowOuter = glowBase * 2.4;
  const haloHue = (chromaHue + 50) % 360; // bias toward warm/yellow
  const haloTint = `hsl(${haloHue}, 100%, 65%)`;
  const glow = [
    `drop-shadow(0 0 ${glowBase}px ${BEAR_COLOR})`,
    `drop-shadow(0 0 ${glowOuter}px ${BEAR_COLOR})`,
    `drop-shadow(0 0 ${glowOuter * 1.4}px ${haloTint})`,
    `drop-shadow(0 0 ${glowOuter * 2}px ${haloTint})`,
  ].join(" ");

  // === GROUND SHADOW ===
  // Tracks bear position, opacity reduces as body bobs up
  const shadowOpacity = interpolate(-bodyBob, [0, 6], [0.42, 0.18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // === DUST MOTE CENTER ===
  const moteCenterX = bearLeft + BEAR_SIZE * 0.5;
  const moteCenterY = yBase + BEAR_HEIGHT * 0.5;
  const moteSpread = BEAR_SIZE * 0.6;

  // === HALO BACKGROUND GLOW DISC ===
  // Soft warm radial behind the bear, breathing with energy
  const haloRadius = BEAR_SIZE * (0.62 + energy * 0.12 + beatDecay * 0.08);
  const haloOpacity = 0.18 + energy * 0.18 + beatDecay * 0.1;

  // Tribute text size scales with resolution
  const tributeFontSize = Math.round(14 * resScale);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Soft radial halo behind bear -- chroma-tinted warm glow */}
      <div
        style={{
          position: "absolute",
          left: moteCenterX - haloRadius,
          top: moteCenterY - haloRadius,
          width: haloRadius * 2,
          height: haloRadius * 2,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${haloTint} 0%, ${BEAR_COLOR}88 25%, transparent 65%)`,
          opacity: clamp(haloOpacity, 0, 1),
          filter: `blur(${Math.round(20 * resScale)}px)`,
          mixBlendMode: "screen",
          willChange: "opacity, transform",
        }}
      />

      {/* Floating dust / sparkle motes orbiting the bear */}
      {Array.from({ length: NUM_DUST_MOTES }).map((_, i) => (
        <DustMote
          key={i}
          index={i}
          centerX={moteCenterX}
          centerY={moteCenterY}
          spread={moteSpread}
          frame={frame}
          hue={chromaHue}
          vigor={vigor}
          onsetBurst={onsetEnvelope}
        />
      ))}

      {/* The featured bear */}
      <div
        style={{
          position: "absolute",
          left: bearLeft,
          top: yBase + bodyBob,
          opacity,
          filter: glow,
          willChange: "transform, opacity, filter",
        }}
      >
        <ProfileBear
          size={BEAR_SIZE}
          stridePhase={stridePhase}
          bodyBob={bodyBob}
          headTilt={headTilt}
          vigor={vigor}
          beatPulse={beatDecay}
          tailFlick={tailFlick}
        />

        {/* Ground shadow -- soft elliptical drop under the paws */}
        <div
          style={{
            width: BEAR_SIZE * 0.78,
            height: BEAR_SIZE * 0.07,
            borderRadius: "50%",
            background: `radial-gradient(ellipse, ${BEAR_OUTLINE}77 0%, transparent 70%)`,
            opacity: clamp(shadowOpacity, 0, 1),
            margin: "0 auto",
            marginTop: -Math.round(BEAR_SIZE * 0.04),
            filter: `blur(${Math.round(BEAR_SIZE * 0.018)}px)`,
          }}
        />
      </div>

      {/* === TRIBUTE MARKERS === */}
      {/* "OS" initials, lower-left -- Owsley Stanley */}
      <div
        style={{
          position: "absolute",
          left: Math.round(40 * resScale),
          bottom: Math.round(40 * resScale),
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic",
          fontSize: tributeFontSize,
          color: BEAR_COLOR,
          opacity: opacity * 0.6,
          textShadow: `0 0 ${Math.round(8 * resScale)}px ${BEAR_COLOR}, 0 0 ${Math.round(16 * resScale)}px ${haloTint}`,
          letterSpacing: "0.15em",
          willChange: "opacity",
        }}
      >
        OS
      </div>
      {/* "1973" date marker, lower-right -- year of the Bear's Choice LP */}
      <div
        style={{
          position: "absolute",
          right: Math.round(40 * resScale),
          bottom: Math.round(40 * resScale),
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic",
          fontSize: tributeFontSize,
          color: BEAR_COLOR,
          opacity: opacity * 0.6,
          textShadow: `0 0 ${Math.round(8 * resScale)}px ${BEAR_COLOR}, 0 0 ${Math.round(16 * resScale)}px ${haloTint}`,
          letterSpacing: "0.2em",
          willChange: "opacity",
        }}
      >
        1973
      </div>
    </div>
  );
};
