/**
 * DrummersDuo — Layer 6 (Character)
 * Bill Kreutzmann + Mickey Hart — the legendary dual drummer setup.
 * Fully articulated silhouettes with drumstick motion, visible drum kits,
 * hit effects, rim lighting, and neon glow outlines.
 * For Drums/Space segments.
 * Tier A+++ | Tags: dead-culture, intense | dutyCycle: 100 | energyBand: mid
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STAGGER_START = 120;
const STAGGER_DUR = 60;

/** Neon color palette — Bill gets warm amber, Mickey gets cool cyan */
const BILL_HUE = 35;
const MICKEY_HUE = 195;

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

/** Polar to cartesian offset from joint */
function armEndpoint(
  angle: number,
  length: number,
): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: Math.cos(rad) * length, y: Math.sin(rad) * length };
}

/** Clamp utility */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Smooth step for glow transitions */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** Individual cymbal with splash effect */
const Cymbal: React.FC<{
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  hue: number;
  flash: number;
  standHeight: number;
}> = ({ cx, cy, rx, ry, hue, flash, standHeight }) => (
  <g>
    {/* Stand */}
    <line
      x1={cx}
      y1={cy + ry + 1}
      x2={cx}
      y2={cy + standHeight}
      stroke={`hsla(${hue}, 15%, 35%, 0.4)`}
      strokeWidth={1.2}
    />
    {/* Cymbal body */}
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill={`hsla(48, 55%, ${50 + flash * 30}%, ${0.15 + flash * 0.5})`}
      stroke={`hsla(48, 60%, ${55 + flash * 25}%, ${0.3 + flash * 0.5})`}
      strokeWidth={0.8}
    />
    {/* Bell (center dot) */}
    <circle
      cx={cx}
      cy={cy}
      r={rx * 0.18}
      fill={`hsla(48, 50%, 60%, ${0.2 + flash * 0.4})`}
    />
    {/* Splash ring on hit */}
    {flash > 0.05 && (
      <>
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx + flash * 18}
          ry={ry + flash * 6}
          fill="none"
          stroke={`hsla(48, 70%, 80%, ${flash * 0.4})`}
          strokeWidth={0.6}
        />
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx + flash * 30}
          ry={ry + flash * 10}
          fill="none"
          stroke={`hsla(48, 70%, 85%, ${flash * 0.2})`}
          strokeWidth={0.4}
        />
      </>
    )}
  </g>
);

/** Drum (tom/snare/kick) with hit ripple */
const Drum: React.FC<{
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  hue: number;
  hit: number;
  isKick?: boolean;
  shellHeight?: number;
}> = ({ cx, cy, rx, ry, hue, hit, isKick = false, shellHeight = 12 }) => {
  const rimBrightness = 40 + hit * 35;
  const headAlpha = 0.08 + hit * 0.15;
  return (
    <g>
      {/* Shell (side visible) */}
      <rect
        x={cx - rx}
        y={cy}
        width={rx * 2}
        height={shellHeight}
        rx={2}
        fill={`hsla(${hue}, 20%, 25%, 0.25)`}
        stroke={`hsla(${hue}, 25%, ${rimBrightness}%, 0.3)`}
        strokeWidth={0.6}
      />
      {/* Drum head (top ellipse) */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill={`hsla(${hue}, 10%, 50%, ${headAlpha})`}
        stroke={`hsla(${hue}, 30%, ${rimBrightness}%, ${0.35 + hit * 0.3})`}
        strokeWidth={isKick ? 1.5 : 1}
      />
      {/* Rim highlight */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx - 1.5}
        ry={ry - 0.8}
        fill="none"
        stroke={`hsla(${hue}, 40%, 70%, ${0.06 + hit * 0.2})`}
        strokeWidth={0.5}
      />
      {/* Hit ripple */}
      {hit > 0.08 && (
        <>
          <ellipse
            cx={cx}
            cy={cy}
            rx={rx * (0.3 + hit * 0.6)}
            ry={ry * (0.3 + hit * 0.6)}
            fill="none"
            stroke={`hsla(${hue}, 50%, 75%, ${hit * 0.35})`}
            strokeWidth={0.5}
          />
          {isKick && (
            <ellipse
              cx={cx}
              cy={cy}
              rx={rx * (0.5 + hit * 0.4)}
              ry={ry * (0.5 + hit * 0.4)}
              fill={`hsla(${hue}, 40%, 60%, ${hit * 0.1})`}
            />
          )}
        </>
      )}
    </g>
  );
};

/** Hi-hat assembly */
const HiHat: React.FC<{
  cx: number;
  cy: number;
  hue: number;
  openness: number;
  flash: number;
  standHeight: number;
}> = ({ cx, cy, hue, openness, flash, standHeight }) => {
  const gap = openness * 4;
  return (
    <g>
      {/* Stand */}
      <line
        x1={cx}
        y1={cy + 4}
        x2={cx}
        y2={cy + standHeight}
        stroke={`hsla(${hue}, 15%, 35%, 0.35)`}
        strokeWidth={1}
      />
      {/* Bottom hat */}
      <ellipse
        cx={cx}
        cy={cy + gap / 2 + 1}
        rx={12}
        ry={2.5}
        fill={`hsla(48, 45%, 45%, ${0.15 + flash * 0.3})`}
        stroke={`hsla(48, 50%, 55%, ${0.25 + flash * 0.3})`}
        strokeWidth={0.6}
      />
      {/* Top hat */}
      <ellipse
        cx={cx}
        cy={cy - gap / 2}
        rx={12}
        ry={2.5}
        fill={`hsla(48, 50%, 50%, ${0.18 + flash * 0.35})`}
        stroke={`hsla(48, 55%, 60%, ${0.3 + flash * 0.35})`}
        strokeWidth={0.6}
      />
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Full Drummer Rig                                                   */
/* ------------------------------------------------------------------ */

interface DrummerProps {
  /** Center X of the drummer */
  cx: number;
  /** Baseline Y (seat level) */
  baseY: number;
  /** Overall scale */
  scale: number;
  /** Hue for this drummer's palette */
  hue: number;
  /** Left stick angle from rest (degrees, negative = up) */
  leftStickAngle: number;
  /** Right stick angle from rest */
  rightStickAngle: number;
  /** 0-1 how hard the left arm is hitting this frame */
  leftHit: number;
  /** 0-1 how hard the right arm is hitting this frame */
  rightHit: number;
  /** 0-1 bass / kick drum pulse */
  kickPulse: number;
  /** 0-1 cymbal flash */
  cymbalFlash: number;
  /** 0-1 hi-hat flash */
  hiHatFlash: number;
  /** 0-1 hi-hat openness */
  hiHatOpen: number;
  /** 0-1 snare hit intensity */
  snareHit: number;
  /** Slight head/torso bob in px */
  bodyBob: number;
  /** Chromatic hue for accent glow */
  chromaHue: number;
  /** Mirror the drummer (for facing each other) */
  mirror?: boolean;
  /** Glow intensity multiplier 0-1 */
  glowIntensity: number;
  /** Seat random offset from seeded rng */
  seatJitter: number;
}

const DrummerRig: React.FC<DrummerProps> = ({
  cx,
  baseY,
  scale,
  hue,
  leftStickAngle,
  rightStickAngle,
  leftHit,
  rightHit,
  kickPulse,
  cymbalFlash,
  hiHatFlash,
  hiHatOpen,
  snareHit,
  bodyBob,
  chromaHue,
  mirror = false,
  glowIntensity,
  seatJitter,
}) => {
  const dir = mirror ? -1 : 1;
  const filterId = mirror ? "glow-mickey" : "glow-bill";

  /* ---- Body geometry (relative to seat at 0,0) ---- */
  const headY = -78 + bodyBob * 0.6;
  const headR = 10;
  const torsoTopY = -65 + bodyBob * 0.3;
  const torsoBottomY = -30;
  const torsoW = 15;

  /* Shoulders */
  const lShoulderX = -14 * dir;
  const rShoulderX = 14 * dir;
  const shoulderY = -60 + bodyBob * 0.25;

  /* Upper arm length, forearm length, stick length */
  const upperArmLen = 22;
  const forearmLen = 20;
  const stickLen = 28;

  /* Compute arm positions — left arm */
  const lElbow = armEndpoint(-90 + leftStickAngle * 0.4 + 15 * dir, upperArmLen);
  const lElbowX = lShoulderX + lElbow.x;
  const lElbowY = shoulderY + lElbow.y;
  const lWrist = armEndpoint(-90 + leftStickAngle * 0.8 + 25 * dir, forearmLen);
  const lWristX = lElbowX + lWrist.x;
  const lWristY = lElbowY + lWrist.y;
  const lStickEnd = armEndpoint(-90 + leftStickAngle + 35 * dir, stickLen);
  const lStickTipX = lWristX + lStickEnd.x;
  const lStickTipY = lWristY + lStickEnd.y;

  /* Right arm */
  const rElbow = armEndpoint(-90 + rightStickAngle * 0.4 - 15 * dir, upperArmLen);
  const rElbowX = rShoulderX + rElbow.x;
  const rElbowY = shoulderY + rElbow.y;
  const rWrist = armEndpoint(-90 + rightStickAngle * 0.8 - 25 * dir, forearmLen);
  const rWristX = rElbowX + rWrist.x;
  const rWristY = rElbowY + rWrist.y;
  const rStickEnd = armEndpoint(-90 + rightStickAngle - 35 * dir, stickLen);
  const rStickTipX = rWristX + rStickEnd.x;
  const rStickTipY = rWristY + rStickEnd.y;

  /* Legs — seated, mostly static */
  const lKneeX = -10 * dir;
  const lKneeY = -10;
  const lFootX = -16 * dir;
  const lFootY = 12 + kickPulse * 3;
  const rKneeX = 10 * dir;
  const rKneeY = -10;
  const rFootX = 16 * dir;
  const rFootY = 12;

  /* Drum kit positions (relative) */
  const snareX = -8 * dir;
  const snareY = -18;
  const kickX = 0;
  const kickY = 10;
  const tom1X = -4 * dir;
  const tom1Y = -34;
  const tom2X = 10 * dir;
  const tom2Y = -32;
  const floorTomX = 26 * dir;
  const floorTomY = -12;
  const hiHatX = -28 * dir;
  const hiHatY = -42;
  const rideX = 30 * dir;
  const rideY = -44;
  const crashX = -18 * dir;
  const crashY = -52;

  /* Skin/body color */
  const skinAlpha = 0.55 + glowIntensity * 0.2;
  const bodyColor = `hsla(${hue}, 25%, 45%, ${skinAlpha})`;
  const bodyStroke = `hsla(${hue}, 35%, 55%, ${skinAlpha + 0.1})`;
  const stickColor = `hsla(30, 50%, 65%, ${0.6 + glowIntensity * 0.25})`;
  const stickTipColor = `hsla(30, 40%, 55%, ${0.5 + glowIntensity * 0.2})`;
  const neonGlow = `hsla(${chromaHue}, 80%, 65%, ${0.12 + glowIntensity * 0.25})`;
  const rimLight = `hsla(${chromaHue}, 60%, 70%, ${0.08 + glowIntensity * 0.18})`;

  return (
    <g
      transform={`translate(${cx}, ${baseY}) scale(${scale})`}
      filter={`url(#${filterId})`}
    >
      {/* === DRUM KIT (behind drummer) === */}

      {/* Kick drum — large circle */}
      <Drum
        cx={kickX}
        cy={kickY}
        rx={22}
        ry={10}
        hue={hue}
        hit={kickPulse}
        isKick
        shellHeight={18}
      />
      {/* Kick drum front face circle */}
      <ellipse
        cx={kickX}
        cy={kickY + 9}
        rx={18}
        ry={8}
        fill="none"
        stroke={`hsla(${hue}, 20%, 40%, ${0.15 + kickPulse * 0.25})`}
        strokeWidth={1.2}
      />
      {/* Kick pedal */}
      <line
        x1={kickX - 3}
        y1={kickY + 18}
        x2={kickX - 3}
        y2={kickY + 26 - kickPulse * 4}
        stroke={`hsla(${hue}, 15%, 40%, 0.3)`}
        strokeWidth={1.5}
      />

      {/* Floor tom */}
      <Drum
        cx={floorTomX}
        cy={floorTomY}
        rx={16}
        ry={6}
        hue={hue}
        hit={rightHit * 0.4}
        shellHeight={14}
      />

      {/* Tom 1 (rack, higher) */}
      <Drum cx={tom1X} cy={tom1Y} rx={11} ry={4.5} hue={hue} hit={leftHit * 0.5} shellHeight={8} />

      {/* Tom 2 (rack, lower) */}
      <Drum cx={tom2X} cy={tom2Y} rx={12} ry={5} hue={hue} hit={rightHit * 0.35} shellHeight={9} />

      {/* Snare */}
      <Drum cx={snareX} cy={snareY} rx={13} ry={5} hue={hue} hit={snareHit} shellHeight={6} />
      {/* Snare wires glow on hit */}
      {snareHit > 0.1 && (
        <g opacity={snareHit * 0.6}>
          {Array.from({ length: 5 }).map((_, i) => (
            <line
              key={i}
              x1={snareX - 10 + i * 5}
              y1={snareY + 6}
              x2={snareX - 10 + i * 5}
              y2={snareY + 5.5}
              stroke={`hsla(${hue}, 50%, 75%, ${snareHit * 0.5})`}
              strokeWidth={0.3}
            />
          ))}
        </g>
      )}

      {/* Hi-hat */}
      <HiHat
        cx={hiHatX}
        cy={hiHatY}
        hue={hue}
        openness={hiHatOpen}
        flash={hiHatFlash}
        standHeight={30}
      />

      {/* Ride cymbal */}
      <Cymbal
        cx={rideX}
        cy={rideY}
        rx={16}
        ry={3.5}
        hue={hue}
        flash={cymbalFlash * 0.6}
        standHeight={28}
      />

      {/* Crash cymbal */}
      <Cymbal
        cx={crashX}
        cy={crashY}
        rx={14}
        ry={3}
        hue={hue}
        flash={cymbalFlash}
        standHeight={22}
      />

      {/* === DRUM THRONE === */}
      <ellipse
        cx={0}
        cy={-22 + seatJitter}
        rx={11}
        ry={4}
        fill={`hsla(${hue}, 15%, 30%, 0.3)`}
        stroke={`hsla(${hue}, 20%, 40%, 0.2)`}
        strokeWidth={0.5}
      />

      {/* === DRUMMER BODY (in front of kit) === */}

      {/* Legs */}
      <line
        x1={-4 * dir}
        y1={torsoBottomY}
        x2={lKneeX}
        y2={lKneeY}
        stroke={bodyColor}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1={lKneeX}
        y1={lKneeY}
        x2={lFootX}
        y2={lFootY}
        stroke={bodyColor}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <line
        x1={4 * dir}
        y1={torsoBottomY}
        x2={rKneeX}
        y2={rKneeY}
        stroke={bodyColor}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1={rKneeX}
        y1={rKneeY}
        x2={rFootX}
        y2={rFootY}
        stroke={bodyColor}
        strokeWidth={4.5}
        strokeLinecap="round"
      />

      {/* Torso */}
      <path
        d={`M ${-torsoW * dir} ${torsoBottomY}
            Q ${-torsoW * 1.1 * dir} ${(torsoTopY + torsoBottomY) / 2} ${-torsoW * 0.9 * dir} ${torsoTopY}
            L ${torsoW * 0.9 * dir} ${torsoTopY}
            Q ${torsoW * 1.1 * dir} ${(torsoTopY + torsoBottomY) / 2} ${torsoW * dir} ${torsoBottomY}
            Z`}
        fill={bodyColor}
        stroke={bodyStroke}
        strokeWidth={0.8}
      />
      {/* Rim light on torso edge */}
      <path
        d={`M ${-torsoW * 0.85 * dir} ${torsoTopY + 2}
            Q ${-torsoW * 1.05 * dir} ${(torsoTopY + torsoBottomY) / 2} ${-torsoW * 0.95 * dir} ${torsoBottomY - 2}`}
        fill="none"
        stroke={rimLight}
        strokeWidth={1.2}
      />

      {/* Head */}
      <circle
        cx={0}
        cy={headY}
        r={headR}
        fill={bodyColor}
        stroke={bodyStroke}
        strokeWidth={0.6}
      />
      {/* Neon rim light on head */}
      <circle
        cx={0}
        cy={headY}
        r={headR + 1.5}
        fill="none"
        stroke={neonGlow}
        strokeWidth={1}
      />

      {/* Neck */}
      <line
        x1={0}
        y1={headY + headR}
        x2={0}
        y2={torsoTopY}
        stroke={bodyColor}
        strokeWidth={4}
        strokeLinecap="round"
      />

      {/* === LEFT ARM === */}
      {/* Upper arm */}
      <line
        x1={lShoulderX}
        y1={shoulderY}
        x2={lElbowX}
        y2={lElbowY}
        stroke={bodyColor}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      {/* Forearm */}
      <line
        x1={lElbowX}
        y1={lElbowY}
        x2={lWristX}
        y2={lWristY}
        stroke={bodyColor}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      {/* Left drumstick */}
      <line
        x1={lWristX}
        y1={lWristY}
        x2={lStickTipX}
        y2={lStickTipY}
        stroke={stickColor}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      {/* Stick tip (rounded bead) */}
      <circle cx={lStickTipX} cy={lStickTipY} r={2} fill={stickTipColor} />
      {/* Hit flash at stick tip */}
      {leftHit > 0.15 && (
        <circle
          cx={lStickTipX}
          cy={lStickTipY}
          r={3 + leftHit * 6}
          fill={`hsla(${chromaHue}, 70%, 75%, ${leftHit * 0.35})`}
        />
      )}

      {/* === RIGHT ARM === */}
      <line
        x1={rShoulderX}
        y1={shoulderY}
        x2={rElbowX}
        y2={rElbowY}
        stroke={bodyColor}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <line
        x1={rElbowX}
        y1={rElbowY}
        x2={rWristX}
        y2={rWristY}
        stroke={bodyColor}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      {/* Right drumstick */}
      <line
        x1={rWristX}
        y1={rWristY}
        x2={rStickTipX}
        y2={rStickTipY}
        stroke={stickColor}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <circle cx={rStickTipX} cy={rStickTipY} r={2} fill={stickTipColor} />
      {rightHit > 0.15 && (
        <circle
          cx={rStickTipX}
          cy={rStickTipY}
          r={3 + rightHit * 6}
          fill={`hsla(${chromaHue}, 70%, 75%, ${rightHit * 0.35})`}
        />
      )}

      {/* === NEON OUTLINE GLOW (full body silhouette edge) === */}
      <circle
        cx={0}
        cy={headY}
        r={headR + 3}
        fill="none"
        stroke={neonGlow}
        strokeWidth={1.5}
        opacity={0.4 + glowIntensity * 0.3}
      />
      <path
        d={`M ${-torsoW * 1.1 * dir} ${torsoTopY - 1}
            Q ${-torsoW * 1.3 * dir} ${(torsoTopY + torsoBottomY) / 2} ${-torsoW * 1.1 * dir} ${torsoBottomY + 1}
            L ${torsoW * 1.1 * dir} ${torsoBottomY + 1}
            Q ${torsoW * 1.3 * dir} ${(torsoTopY + torsoBottomY) / 2} ${torsoW * 1.1 * dir} ${torsoTopY - 1}
            Z`}
        fill="none"
        stroke={neonGlow}
        strokeWidth={1.2}
        opacity={0.25 + glowIntensity * 0.2}
      />
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const DrummersDuo: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const rng = useMemo(() => seeded(420_777), []);
  const seatJitterBill = useMemo(() => (rng() - 0.5) * 3, [rng]);
  const seatJitterMickey = useMemo(() => (rng() - 0.5) * 3, [rng]);

  /* ---- Audio extraction ---- */
  const energy = snap.energy;
  const bass = snap.bass;
  const drumOnset = snap.drumOnset;
  const drumBeat = snap.drumBeat;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue;
  const highs = snap.highs;
  const mids = snap.mids;
  const musicalTime = snap.musicalTime;

  /* ---- Fade in ---- */
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + STAGGER_DUR], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  /* Opacity: visible but not overpowering — brighter with energy */
  const masterOpacity =
    interpolate(energy, [0.03, 0.12, 0.3, 0.6], [0.02, 0.08, 0.12, 0.15], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) * masterFade;

  if (masterOpacity < 0.005) return null;

  /* ---- Beat / onset tracking ---- */
  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Frames since last drum beat for cymbal/snare flash
  let framesSinceDrumBeat = 999;
  for (let i = idx; i >= Math.max(0, idx - 15); i--) {
    if (frames[i].stemDrumBeat || frames[i].beat) {
      framesSinceDrumBeat = idx - i;
      break;
    }
  }

  /* ---- Derived animation values ---- */

  // Cymbal flash from beat
  const cymbalFlash = framesSinceDrumBeat < 10 ? Math.exp(-framesSinceDrumBeat * 0.35) : 0;

  // Snare hit — hi mids + onset
  const snareHit = smoothstep(0.1, 0.5, drumOnset) * smoothstep(0.2, 0.6, mids);

  // Hi-hat from highs
  const hiHatFlash = smoothstep(0.15, 0.5, highs) * beatDecay;
  const hiHatOpen = smoothstep(0.3, 0.7, energy) * 0.8;

  // Kick drum from bass
  const kickPulse = smoothstep(0.15, 0.55, bass) * clamp(drumBeat + drumOnset * 0.3, 0, 1);

  // Body bob — subtle, driven by beat
  const bodyBob = Math.sin(musicalTime * Math.PI * 2) * (2 + energy * 4);

  // Glow intensity
  const glowIntensity = smoothstep(0.1, 0.5, energy);

  /* ---- Drumstick angles — alternating L/R synced to musical time ---- */
  const phase = musicalTime * Math.PI * 2 * tempoFactor;

  // Bill: left hand leads on even beats, right on odd
  const billLeftAngle = -25 + Math.sin(phase) * (15 + drumOnset * 35);
  const billRightAngle = -25 + Math.sin(phase + Math.PI) * (15 + drumOnset * 35);
  const billLeftHit = clamp(Math.sin(phase) * 0.5 + 0.5, 0, 1) * drumOnset;
  const billRightHit = clamp(Math.sin(phase + Math.PI) * 0.5 + 0.5, 0, 1) * drumOnset;

  // Mickey: offset phase — slightly different timing (the interplay!)
  const mickeyPhase = phase + Math.PI * 0.5;
  const mickeyLeftAngle = -25 + Math.sin(mickeyPhase + 0.3) * (15 + drumOnset * 35);
  const mickeyRightAngle = -25 + Math.sin(mickeyPhase + Math.PI + 0.3) * (15 + drumOnset * 35);
  const mickeyLeftHit = clamp(Math.sin(mickeyPhase + 0.3) * 0.5 + 0.5, 0, 1) * drumOnset;
  const mickeyRightHit =
    clamp(Math.sin(mickeyPhase + Math.PI + 0.3) * 0.5 + 0.5, 0, 1) * drumOnset;

  /* ---- Positioning ---- */
  const billX = width * 0.37;
  const mickeyX = width * 0.63;
  const drummerY = height * 0.62;
  const drummerScale = Math.min(width / 1920, height / 1080) * 0.65;

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
        style={{ opacity: masterOpacity, mixBlendMode: "screen" }}
      >
        <defs>
          {/* Glow filter for Bill */}
          <filter id="glow-bill" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={1.5 + glowIntensity * 2} />
            <feColorMatrix
              type="matrix"
              values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${0.6 + glowIntensity * 0.4} 0`}
            />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Glow filter for Mickey */}
          <filter id="glow-mickey" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={1.5 + glowIntensity * 2} />
            <feColorMatrix
              type="matrix"
              values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${0.6 + glowIntensity * 0.4} 0`}
            />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient stage glow behind drummers */}
        <radialGradient id="stage-glow" cx="50%" cy="60%" r="35%">
          <stop
            offset="0%"
            stopColor={`hsla(${chromaHue}, 60%, 50%, ${0.03 + glowIntensity * 0.04})`}
          />
          <stop offset="100%" stopColor="hsla(0, 0%, 0%, 0)" />
        </radialGradient>
        <rect x={0} y={0} width={width} height={height} fill="url(#stage-glow)" />

        {/* Bill Kreutzmann — stage left */}
        <DrummerRig
          cx={billX}
          baseY={drummerY}
          scale={drummerScale}
          hue={BILL_HUE}
          leftStickAngle={billLeftAngle}
          rightStickAngle={billRightAngle}
          leftHit={billLeftHit}
          rightHit={billRightHit}
          kickPulse={kickPulse}
          cymbalFlash={cymbalFlash}
          hiHatFlash={hiHatFlash}
          hiHatOpen={hiHatOpen}
          snareHit={snareHit}
          bodyBob={bodyBob}
          chromaHue={chromaHue}
          mirror={false}
          glowIntensity={glowIntensity}
          seatJitter={seatJitterBill}
        />

        {/* Mickey Hart — stage right, mirrored */}
        <DrummerRig
          cx={mickeyX}
          baseY={drummerY}
          scale={drummerScale}
          hue={MICKEY_HUE}
          leftStickAngle={mickeyLeftAngle}
          rightStickAngle={mickeyRightAngle}
          leftHit={mickeyLeftHit}
          rightHit={mickeyRightHit}
          kickPulse={kickPulse * 0.8}
          cymbalFlash={cymbalFlash * 0.7}
          hiHatFlash={hiHatFlash * 0.8}
          hiHatOpen={hiHatOpen}
          snareHit={snareHit * 0.6}
          bodyBob={bodyBob * 0.85}
          chromaHue={chromaHue}
          mirror
          glowIntensity={glowIntensity}
          seatJitter={seatJitterMickey}
        />

        {/* Cross-stage cymbal splash ring on big hits */}
        {cymbalFlash > 0.2 && (
          <g opacity={cymbalFlash * 0.25}>
            <ellipse
              cx={(billX + mickeyX) / 2}
              cy={drummerY - 60 * drummerScale}
              rx={40 + cymbalFlash * 80}
              ry={8 + cymbalFlash * 20}
              fill="none"
              stroke={`hsla(48, 70%, 80%, ${cymbalFlash * 0.3})`}
              strokeWidth={0.8}
            />
          </g>
        )}

        {/* Ground reflection (subtle) */}
        <line
          x1={billX - 50 * drummerScale}
          y1={drummerY + 30 * drummerScale}
          x2={mickeyX + 50 * drummerScale}
          y2={drummerY + 30 * drummerScale}
          stroke={`hsla(${chromaHue}, 40%, 50%, ${0.04 + glowIntensity * 0.06})`}
          strokeWidth={1}
        />
      </svg>
    </div>
  );
};
