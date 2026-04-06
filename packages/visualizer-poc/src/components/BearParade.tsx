/**
 * BearParade — A+++ rainbow dancing bears grooving across the screen.
 *
 * 6 bears in classic Grateful Dead rainbow colors with rich SVG anatomy:
 * rounded torso with belly curve, head with snout/ears/eyes/nose/grin,
 * multi-segment arms with paw detail, multi-segment legs with feet and toes.
 *
 * Dance choreography: classic bear march with one arm up, one out, legs in stride.
 * Beat-synced stepping, head bobbing, independent limb animation.
 * Energy-responsive: gentle sway at low, full groove at high.
 * Neon glow per bear, ground shadows, musicalTime-driven walk cycle.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BEAR_COLORS = [
  "#FF1744", // red
  "#FF9100", // orange
  "#FFD600", // yellow
  "#00E676", // green
  "#2979FF", // blue
  "#D500F9", // purple
];

/** Darker shade per bear for inner-ear, nose, paw-pad detail */
const BEAR_DARKS = [
  "#B71C1C", // dark red
  "#E65100", // dark orange
  "#F9A825", // dark yellow
  "#00C853", // dark green
  "#1565C0", // dark blue
  "#9C27B0", // dark purple
];

const NUM_BEARS = 6;
const BEAR_SPACING_BASE = 190;
const BEAR_SIZE_BASE = 140;

/* ------------------------------------------------------------------ */
/*  Helper: clamp                                                      */
/* ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/* ------------------------------------------------------------------ */
/*  Helper: lerp between two values                                    */
/* ------------------------------------------------------------------ */

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/* ------------------------------------------------------------------ */
/*  Single Dancing Bear SVG                                            */
/* ------------------------------------------------------------------ */

interface BearProps {
  size: number;
  color: string;
  darkColor: string;
  /** -1 to 1, drives arm positions */
  armPhase: number;
  /** 0 to 1, drives leg stride cycle */
  legPhase: number;
  /** Pixels, head offset from body */
  headBob: number;
  /** 0 to 1, overall vigor multiplier */
  vigor: number;
  /** Beat decay for pulsing details */
  beatPulse: number;
}

const Bear: React.FC<BearProps> = ({
  size,
  color,
  darkColor,
  armPhase,
  legPhase,
  headBob,
  vigor,
  beatPulse,
}) => {
  // ViewBox: 0 0 100 130 — gives room for full bear anatomy
  const vw = 100;
  const vh = 130;

  // --- HEAD ---
  const headCx = 50;
  const headCy = 24 + headBob;
  const headRx = 15;
  const headRy = 13;

  // Ears
  const earL = { cx: headCx - 12, cy: headCy - 10, r: 7 };
  const earR = { cx: headCx + 12, cy: headCy - 10, r: 7 };
  const innerEarR = 4;

  // Snout protruding forward
  const snoutCx = headCx;
  const snoutCy = headCy + 5;
  const snoutRx = 7;
  const snoutRy = 5;

  // Eyes — beady
  const eyeL = { cx: headCx - 6, cy: headCy - 2, r: 2.2 };
  const eyeR = { cx: headCx + 6, cy: headCy - 2, r: 2.2 };

  // Nose
  const noseY = snoutCy - 1;

  // Grin — a subtle arc below the snout
  const grinY = snoutCy + 3;

  // --- TORSO ---
  // Rounded body with a slight belly curve (path instead of ellipse)
  const torsoTop = 38;
  const torsoBottom = 82;
  const torsoLeft = 30;
  const torsoRight = 70;
  const bellyBulge = 4; // extra roundness on the belly side

  const torsoPath = [
    `M ${torsoLeft + 5} ${torsoTop}`,
    // Top curve (shoulders)
    `Q ${50} ${torsoTop - 4} ${torsoRight - 5} ${torsoTop}`,
    // Right side
    `Q ${torsoRight + 2} ${torsoTop + 10} ${torsoRight + bellyBulge} ${(torsoTop + torsoBottom) / 2}`,
    // Right lower belly curve
    `Q ${torsoRight + bellyBulge + 1} ${torsoBottom - 8} ${torsoRight - 8} ${torsoBottom}`,
    // Bottom (crotch)
    `Q ${50} ${torsoBottom + 3} ${torsoLeft + 8} ${torsoBottom}`,
    // Left lower belly
    `Q ${torsoLeft - bellyBulge - 1} ${torsoBottom - 8} ${torsoLeft - bellyBulge} ${(torsoTop + torsoBottom) / 2}`,
    // Left side up
    `Q ${torsoLeft - 2} ${torsoTop + 10} ${torsoLeft + 5} ${torsoTop}`,
    "Z",
  ].join(" ");

  // --- ARMS (two segments each: upper arm + forearm with paw) ---
  // Left arm: classic bear dance = one arm up
  const shoulderL = { x: torsoLeft + 2, y: torsoTop + 6 };
  const shoulderR = { x: torsoRight - 2, y: torsoTop + 6 };

  // Arm swing: armPhase from -1 to 1
  // Left arm goes UP when armPhase > 0, right arm goes UP when armPhase < 0
  // (classic alternating dance pose)
  const leftArmUp = clamp(armPhase, 0, 1);
  const rightArmUp = clamp(-armPhase, 0, 1);

  // Left arm elbow and paw
  const lElbow = {
    x: shoulderL.x - 10 - leftArmUp * 4 * vigor,
    y: shoulderL.y + 10 - leftArmUp * 22 * vigor,
  };
  const lPaw = {
    x: lElbow.x - 6 - leftArmUp * 2 * vigor,
    y: lElbow.y - 6 - leftArmUp * 10 * vigor + (1 - leftArmUp) * 14,
  };

  // Right arm elbow and paw
  const rElbow = {
    x: shoulderR.x + 10 + rightArmUp * 4 * vigor,
    y: shoulderR.y + 10 - rightArmUp * 22 * vigor,
  };
  const rPaw = {
    x: rElbow.x + 6 + rightArmUp * 2 * vigor,
    y: rElbow.y - 6 - rightArmUp * 10 * vigor + (1 - rightArmUp) * 14,
  };

  // --- LEGS (two segments: thigh + lower leg with foot) ---
  const hipL = { x: 38, y: torsoBottom - 2 };
  const hipR = { x: 62, y: torsoBottom - 2 };

  const legSin = Math.sin(legPhase * Math.PI * 2);
  const legCos = Math.cos(legPhase * Math.PI * 2);

  // Left leg leads, right leg trails (180-degree offset)
  const lKnee = {
    x: hipL.x - 4 + legSin * 8 * vigor,
    y: hipL.y + 16 - Math.abs(legSin) * 6 * vigor,
  };
  const lFoot = {
    x: lKnee.x - 2 + legSin * 10 * vigor,
    y: lKnee.y + 16 - Math.max(0, legSin) * 8 * vigor,
  };

  const rKnee = {
    x: hipR.x + 4 - legSin * 8 * vigor,
    y: hipR.y + 16 - Math.abs(legSin) * 6 * vigor,
  };
  const rFoot = {
    x: rKnee.x + 2 - legSin * 10 * vigor,
    y: rKnee.y + 16 - Math.max(0, -legSin) * 8 * vigor,
  };

  // Foot flat base (small rectangle effect via path)
  const footLength = 10;
  const footHeight = 4;

  // Paw toe bumps helper
  const toeBumps = (cx: number, cy: number, flipX: boolean) => {
    const dir = flipX ? -1 : 1;
    return (
      <>
        <circle cx={cx + dir * 0} cy={cy - 3} r={1.8} fill={color} />
        <circle cx={cx + dir * 3.5} cy={cy - 2.5} r={1.6} fill={color} />
        <circle cx={cx - dir * 3.5} cy={cy - 2.5} r={1.6} fill={color} />
        <circle cx={cx + dir * 6} cy={cy - 1.5} r={1.3} fill={color} />
      </>
    );
  };

  // Foot toe bumps helper
  const footToeBumps = (fx: number, fy: number) => {
    return (
      <>
        <circle cx={fx - 3} cy={fy - 2} r={1.5} fill={color} />
        <circle cx={fx} cy={fy - 2.5} r={1.5} fill={color} />
        <circle cx={fx + 3} cy={fy - 2} r={1.5} fill={color} />
      </>
    );
  };

  const limbWidth = 8;
  const forearmWidth = 7;
  const thighWidth = 9;
  const calfWidth = 7.5;

  // Paw pads (circles on palm side)
  const pawPad = (px: number, py: number) => (
    <circle cx={px} cy={py} r={3.5} fill={darkColor} opacity={0.35} />
  );

  // Beat pulse for subtle detail animation
  const eyeScale = 1 + beatPulse * 0.15;

  return (
    <svg
      width={size}
      height={size * (vh / vw)}
      viewBox={`0 0 ${vw} ${vh}`}
      fill="none"
    >
      {/* === LEGS (behind body) === */}
      {/* Left thigh */}
      <line
        x1={hipL.x} y1={hipL.y}
        x2={lKnee.x} y2={lKnee.y}
        stroke={color} strokeWidth={thighWidth} strokeLinecap="round"
      />
      {/* Left calf */}
      <line
        x1={lKnee.x} y1={lKnee.y}
        x2={lFoot.x} y2={lFoot.y}
        stroke={color} strokeWidth={calfWidth} strokeLinecap="round"
      />
      {/* Left foot */}
      <ellipse
        cx={lFoot.x} cy={lFoot.y + footHeight / 2}
        rx={footLength / 2} ry={footHeight / 2 + 1}
        fill={color}
      />
      {footToeBumps(lFoot.x, lFoot.y - 1)}

      {/* Right thigh */}
      <line
        x1={hipR.x} y1={hipR.y}
        x2={rKnee.x} y2={rKnee.y}
        stroke={color} strokeWidth={thighWidth} strokeLinecap="round"
      />
      {/* Right calf */}
      <line
        x1={rKnee.x} y1={rKnee.y}
        x2={rFoot.x} y2={rFoot.y}
        stroke={color} strokeWidth={calfWidth} strokeLinecap="round"
      />
      {/* Right foot */}
      <ellipse
        cx={rFoot.x} cy={rFoot.y + footHeight / 2}
        rx={footLength / 2} ry={footHeight / 2 + 1}
        fill={color}
      />
      {footToeBumps(rFoot.x, rFoot.y - 1)}

      {/* === TORSO === */}
      <path d={torsoPath} fill={color} />
      {/* Belly highlight */}
      <ellipse
        cx={50} cy={63}
        rx={12} ry={14}
        fill="white" opacity={0.07}
      />

      {/* === ARMS (in front of body) === */}
      {/* Left upper arm */}
      <line
        x1={shoulderL.x} y1={shoulderL.y}
        x2={lElbow.x} y2={lElbow.y}
        stroke={color} strokeWidth={limbWidth} strokeLinecap="round"
      />
      {/* Left forearm */}
      <line
        x1={lElbow.x} y1={lElbow.y}
        x2={lPaw.x} y2={lPaw.y}
        stroke={color} strokeWidth={forearmWidth} strokeLinecap="round"
      />
      {/* Left paw */}
      <circle cx={lPaw.x} cy={lPaw.y} r={5} fill={color} />
      {pawPad(lPaw.x, lPaw.y)}
      {toeBumps(lPaw.x, lPaw.y, true)}

      {/* Right upper arm */}
      <line
        x1={shoulderR.x} y1={shoulderR.y}
        x2={rElbow.x} y2={rElbow.y}
        stroke={color} strokeWidth={limbWidth} strokeLinecap="round"
      />
      {/* Right forearm */}
      <line
        x1={rElbow.x} y1={rElbow.y}
        x2={rPaw.x} y2={rPaw.y}
        stroke={color} strokeWidth={forearmWidth} strokeLinecap="round"
      />
      {/* Right paw */}
      <circle cx={rPaw.x} cy={rPaw.y} r={5} fill={color} />
      {pawPad(rPaw.x, rPaw.y)}
      {toeBumps(rPaw.x, rPaw.y, false)}

      {/* === HEAD === */}
      <g>
        {/* Ears */}
        <circle cx={earL.cx} cy={earL.cy} r={earL.r} fill={color} />
        <circle cx={earL.cx} cy={earL.cy} r={innerEarR} fill={darkColor} opacity={0.4} />
        <circle cx={earR.cx} cy={earR.cy} r={earR.r} fill={color} />
        <circle cx={earR.cx} cy={earR.cy} r={innerEarR} fill={darkColor} opacity={0.4} />

        {/* Head shape */}
        <ellipse cx={headCx} cy={headCy} rx={headRx} ry={headRy} fill={color} />

        {/* Snout */}
        <ellipse
          cx={snoutCx} cy={snoutCy}
          rx={snoutRx} ry={snoutRy}
          fill={color}
        />
        {/* Snout lighter patch */}
        <ellipse
          cx={snoutCx} cy={snoutCy + 1}
          rx={snoutRx - 1.5} ry={snoutRy - 1.5}
          fill="white" opacity={0.1}
        />

        {/* Eyes — beady with subtle beat pulse */}
        <circle
          cx={eyeL.cx} cy={eyeL.cy}
          r={eyeL.r * eyeScale}
          fill="black" opacity={0.75}
        />
        {/* Eye shine */}
        <circle
          cx={eyeL.cx + 0.7} cy={eyeL.cy - 0.7}
          r={0.8}
          fill="white" opacity={0.6}
        />
        <circle
          cx={eyeR.cx} cy={eyeR.cy}
          r={eyeR.r * eyeScale}
          fill="black" opacity={0.75}
        />
        <circle
          cx={eyeR.cx + 0.7} cy={eyeR.cy - 0.7}
          r={0.8}
          fill="white" opacity={0.6}
        />

        {/* Nose */}
        <ellipse
          cx={snoutCx} cy={noseY}
          rx={2.5} ry={1.8}
          fill="black" opacity={0.65}
        />

        {/* Grin */}
        <path
          d={`M ${snoutCx - 5} ${grinY} Q ${snoutCx} ${grinY + 3.5} ${snoutCx + 5} ${grinY}`}
          stroke="black" strokeWidth={1.2} strokeLinecap="round"
          fill="none" opacity={0.45}
        />
      </g>
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Ground Shadow                                                      */
/* ------------------------------------------------------------------ */

const GroundShadow: React.FC<{
  width: number;
  color: string;
  opacity: number;
}> = ({ width, color, opacity }) => (
  <div
    style={{
      width: width * 0.7,
      height: width * 0.08,
      borderRadius: "50%",
      background: `radial-gradient(ellipse, ${color}44 0%, transparent 70%)`,
      opacity: clamp(opacity, 0, 1),
      margin: "0 auto",
      marginTop: -width * 0.04,
      filter: `blur(${Math.round(width * 0.02)}px)`,
    }}
  />
);

/* ------------------------------------------------------------------ */
/*  BearParade — main overlay component                                */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const BearParade: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const beatDecay = snap.beatDecay;
  const musicalTime = snap.musicalTime;
  const bass = snap.bass;
  const chromaHue = snap.chromaHue;

  // Scale proportionally with resolution (designed at 1080p)
  const resScale = height / 1080;
  const BEAR_SIZE = Math.round(BEAR_SIZE_BASE * resScale);
  const BEAR_SPACING = Math.round(BEAR_SPACING_BASE * resScale);

  // Energy-derived vigor: 0 = gentle, 1 = full groove
  const vigor = interpolate(energy, [0.03, 0.12, 0.3], [0.2, 0.6, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Opacity: always visible when overlay engine activates, dim during quiet
  const opacity = interpolate(energy, [0.02, 0.1, 0.25], [0.3, 0.6, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Horizontal drift speed — bears march across, tempo-scaled
  const driftSpeed =
    interpolate(energy, [0.02, 0.15, 0.35], [0.15, 0.4, 0.7], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) * tempoFactor;

  const totalWidth = NUM_BEARS * BEAR_SPACING;
  // Position bears in the lower portion of the frame
  const yBase = height - Math.round(BEAR_SIZE * 1.35) - Math.round(20 * resScale);

  // Chroma-hue-driven glow tint offset (subtle)
  const hueShift = chromaHue ?? 0;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {BEAR_COLORS.map((color, i) => {
        const darkColor = BEAR_DARKS[i];
        // Each bear has a unique phase offset for organic feel
        const phaseOffset = i * 0.38;

        // Horizontal position: continuous drift with wrap-around
        const rawX =
          (frame * driftSpeed + i * BEAR_SPACING) % (totalWidth + width);
        const x = rawX - BEAR_SIZE;

        // Beat-synced vertical bob
        const bearBeatFrac = (musicalTime + phaseOffset * 0.5) % 1;
        const bearStepCurve = Math.pow(1 - bearBeatFrac, 2.5);

        // Bass-enhanced bounce: big bottom notes = extra dip
        const bassBoost = bass * 0.5;

        let bob: number;
        if (vigor < 0.35) {
          // Low energy: gentle sine sway
          const bobAmp = 3 + beatDecay * 5;
          bob =
            Math.sin(frame * 0.03 * tempoFactor + phaseOffset) * bobAmp;
        } else {
          // Mid-high energy: beat-synced bounce
          const bobAmp = lerp(6, 20, vigor) + beatDecay * lerp(8, 22, vigor);
          bob = -bearStepCurve * (bobAmp + bassBoost * 12);
        }

        // --- ARM PHASE ---
        // Classic alternating dance: armPhase swings -1 to 1 on beat
        // Each bear offset so they don't all sync identically
        let armPhase: number;
        if (vigor < 0.35) {
          // Gentle sway
          armPhase =
            Math.sin(frame * 0.04 * tempoFactor + phaseOffset) * 0.3;
        } else {
          // Beat-locked arm swing, vigor scales amplitude
          const armCycle =
            (bearBeatFrac + phaseOffset * 0.3) * Math.PI * 2;
          armPhase = Math.sin(armCycle) * lerp(0.5, 1.0, vigor);
        }

        // --- LEG PHASE ---
        // Half-beat offset from arms for natural walk
        let legPhase: number;
        if (vigor < 0.35) {
          legPhase =
            (frame * 0.02 * tempoFactor + phaseOffset) * 0.3;
        } else {
          legPhase = bearBeatFrac + 0.25 + phaseOffset * 0.1;
        }

        // --- HEAD BOB ---
        let headBob: number;
        if (vigor < 0.35) {
          headBob =
            Math.sin(frame * 0.05 * tempoFactor + phaseOffset + 0.5) * 1.5;
        } else {
          // Head bobs slightly after body (delayed reaction)
          const headBeatFrac = (musicalTime + phaseOffset * 0.5 + 0.1) % 1;
          const headPulse = Math.pow(1 - headBeatFrac, 3);
          headBob = -headPulse * lerp(3, 7, vigor);
        }

        // Body tilt — more pronounced at high vigor
        const tiltRange = lerp(2, 14, vigor);
        const tilt =
          Math.sin(
            (bearBeatFrac + phaseOffset * 0.2) * Math.PI * 2,
          ) * tiltRange;

        // --- NEON GLOW ---
        // Chroma hue subtly rotates the glow color
        const glowBase = 6 + beatDecay * 14;
        const glowOuter = glowBase * 2.5;
        const glowHue = (hueShift + i * 60) % 360;
        const glowTint = `hsl(${glowHue}, 100%, 60%)`;
        const glow = [
          `drop-shadow(0 0 ${glowBase}px ${color})`,
          `drop-shadow(0 0 ${glowOuter}px ${color})`,
          `drop-shadow(0 0 ${glowOuter * 1.5}px ${glowTint})`,
        ].join(" ");

        // Shadow opacity tracks bear proximity to ground
        const shadowOpacity = interpolate(
          -bob,
          [0, 20],
          [0.35, 0.15],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: yBase + bob,
              transform: `rotate(${tilt}deg)`,
              transformOrigin: "center bottom",
              opacity,
              filter: glow,
              willChange: "transform, opacity, filter",
            }}
          >
            <Bear
              size={BEAR_SIZE}
              color={color}
              darkColor={darkColor}
              armPhase={armPhase}
              legPhase={legPhase}
              headBob={headBob}
              vigor={vigor}
              beatPulse={beatDecay}
            />
            <GroundShadow
              width={BEAR_SIZE}
              color={darkColor}
              opacity={shadowOpacity}
            />
          </div>
        );
      })}
    </div>
  );
};
