/**
 * CrowdSilhouette — A+++ concert crowd silhouette along bottom of frame.
 *
 * 28 people with realistic SVG body shapes across 3 depth layers:
 *   - Front row (8): large, dark, detailed, lower on screen
 *   - Mid row (10): medium, semi-transparent, slightly higher
 *   - Back row (10): small, hazy, highest, overlapping
 *
 * Body variety: 4 templates (tall-thin, medium, stocky, small) with
 * accessories (hats, hair, raised fists, peace signs, open palms, lighters).
 *
 * Audio reactivity:
 *   - Beat-synced collective bob (bass drives amplitude)
 *   - Energy drives number of raised hands + bob intensity
 *   - ChromaHue tints neon glow outlines
 *   - BeatDecay pulses glow brightness
 *   - Individual sway layered over collective motion
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type BodyType = "tall" | "medium" | "stocky" | "small";
type HandGesture = "fist" | "peace" | "open" | "lighter" | "sway" | "none";
type Accessory = "hat" | "beanie" | "hair_long" | "hair_afro" | "none";
type DepthLayer = "front" | "mid" | "back";

interface PersonData {
  x: number; // 0-1 fraction of width
  bodyType: BodyType;
  handGesture: HandGesture;
  handThreshold: number; // energy threshold to raise hand
  accessory: Accessory;
  layer: DepthLayer;
  heightOffset: number; // random vertical jitter within layer
  waveFreq: number;
  wavePhase: number;
  bobPhase: number;
  swayPhase: number;
  swayAmp: number;
  handSide: -1 | 1;
  glowHueOffset: number;
  shoulderTilt: number; // slight lean
  headTilt: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NUM_FRONT = 8;
const NUM_MID = 10;
const NUM_BACK = 10;
const FADE_IN_FRAMES = 90;

const BODY_TYPES: BodyType[] = ["tall", "medium", "stocky", "small"];
const GESTURES: HandGesture[] = ["fist", "peace", "open", "lighter", "sway", "none"];
const ACCESSORIES: Accessory[] = ["hat", "beanie", "hair_long", "hair_afro", "none", "none", "none"];

/* ------------------------------------------------------------------ */
/*  Body dimensions per type                                           */
/* ------------------------------------------------------------------ */

interface BodyDims {
  headR: number;
  neckH: number;
  shoulderW: number;
  torsoH: number;
  torsoNarrow: number; // waist as fraction of shoulder
  armLen: number;
  scale: number;
}

const BODY_DIMS: Record<BodyType, BodyDims> = {
  tall:    { headR: 9,  neckH: 6,  shoulderW: 30, torsoH: 50, torsoNarrow: 0.65, armLen: 42, scale: 1.15 },
  medium:  { headR: 10, neckH: 5,  shoulderW: 34, torsoH: 44, torsoNarrow: 0.70, armLen: 38, scale: 1.0 },
  stocky:  { headR: 11, neckH: 4,  shoulderW: 40, torsoH: 40, torsoNarrow: 0.80, armLen: 34, scale: 0.95 },
  small:   { headR: 8,  neckH: 4,  shoulderW: 26, torsoH: 36, torsoNarrow: 0.68, armLen: 30, scale: 0.85 },
};

/* ------------------------------------------------------------------ */
/*  Layer configs                                                      */
/* ------------------------------------------------------------------ */

interface LayerConfig {
  baseY: number;      // fraction from bottom (0 = very bottom)
  opacity: number;    // fill darkness
  glowMult: number;   // glow strength multiplier
  scaleMult: number;  // size multiplier
  strokeW: number;
}

const LAYER_CFG: Record<DepthLayer, LayerConfig> = {
  front: { baseY: 0.02, opacity: 0.92, glowMult: 1.0,  scaleMult: 1.0,  strokeW: 0.7 },
  mid:   { baseY: 0.06, opacity: 0.80, glowMult: 0.7,  scaleMult: 0.82, strokeW: 0.5 },
  back:  { baseY: 0.10, opacity: 0.60, glowMult: 0.45, scaleMult: 0.65, strokeW: 0.3 },
};

/* ------------------------------------------------------------------ */
/*  Crowd Generation (deterministic)                                   */
/* ------------------------------------------------------------------ */

function generateCrowd(seed: number): PersonData[] {
  const rng = seeded(seed);
  const people: PersonData[] = [];

  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  const makePerson = (layer: DepthLayer, xMin: number, xMax: number): PersonData => ({
    x: xMin + rng() * (xMax - xMin),
    bodyType: pick(BODY_TYPES),
    handGesture: pick(GESTURES),
    handThreshold: 0.15 + rng() * 0.75, // staggered thresholds
    accessory: pick(ACCESSORIES),
    layer,
    heightOffset: (rng() - 0.5) * 12,
    waveFreq: 0.02 + rng() * 0.05,
    wavePhase: rng() * Math.PI * 2,
    bobPhase: rng() * Math.PI * 2,
    swayPhase: rng() * Math.PI * 2,
    swayAmp: 1.5 + rng() * 3,
    handSide: rng() > 0.5 ? 1 : -1,
    glowHueOffset: rng() * 60 - 30,
    shoulderTilt: (rng() - 0.5) * 6,
    headTilt: (rng() - 0.5) * 8,
  });

  // Back row: spread across full width
  for (let i = 0; i < NUM_BACK; i++) {
    people.push(makePerson("back", 0.02 + (i / NUM_BACK) * 0.88, 0.02 + ((i + 1) / NUM_BACK) * 0.88));
  }
  // Mid row: spread across full width
  for (let i = 0; i < NUM_MID; i++) {
    people.push(makePerson("mid", 0.01 + (i / NUM_MID) * 0.90, 0.01 + ((i + 1) / NUM_MID) * 0.90));
  }
  // Front row: spread across full width
  for (let i = 0; i < NUM_FRONT; i++) {
    people.push(makePerson("front", 0.01 + (i / NUM_FRONT) * 0.92, 0.01 + ((i + 1) / NUM_FRONT) * 0.92));
  }

  return people;
}

/* ------------------------------------------------------------------ */
/*  SVG Path builders                                                  */
/* ------------------------------------------------------------------ */

/** Head + neck + shoulders + torso as a single smooth SVG path */
function buildBodyPath(dims: BodyDims, tilt: number): string {
  const { headR, neckH, shoulderW, torsoH, torsoNarrow } = dims;
  const sw2 = shoulderW / 2;
  const waistW = sw2 * torsoNarrow;
  const headCY = -(neckH + headR);
  const neckW = headR * 0.45;

  // Build path: start at left waist, go up left torso, left shoulder,
  // up neck, around head, down neck, right shoulder, down right torso, close
  return [
    `M ${-waistW},${torsoH}`,
    // left torso up to shoulder (gentle curve)
    `C ${-waistW - 2},${torsoH * 0.5} ${-sw2 - 3},${8} ${-sw2},${0}`,
    // left shoulder to neck base (shoulder curve)
    `Q ${-sw2 + 4},${-3} ${-neckW},${-2}`,
    // left neck up
    `L ${-neckW},${-(neckH * 0.6)}`,
    // around the head (elliptical arc for realism)
    `Q ${-neckW - 1},${headCY + headR * 0.3} ${-headR * 0.9},${headCY + headR * 0.15}`,
    `A ${headR},${headR * 1.05} 0 1 1 ${headR * 0.9},${headCY + headR * 0.15}`,
    // right neck down
    `Q ${neckW + 1},${headCY + headR * 0.3} ${neckW},${-(neckH * 0.6)}`,
    `L ${neckW},${-2}`,
    // right shoulder
    `Q ${sw2 - 4},${-3} ${sw2},${0}`,
    // right torso down
    `C ${sw2 + 3},${8} ${waistW + 2},${torsoH * 0.5} ${waistW},${torsoH}`,
    "Z",
  ].join(" ");
}

/** Hat silhouette (wide brim) */
function hatPath(headR: number): string {
  const brim = headR * 1.6;
  const crownH = headR * 0.7;
  const crownW = headR * 0.85;
  return [
    `M ${-brim},0`,
    `L ${-brim},${-2}`,
    `Q ${-brim},${-4} ${-crownW},${-4}`,
    `L ${-crownW},${-crownH}`,
    `Q ${-crownW * 0.3},${-crownH - 4} ${0},${-crownH - 4}`,
    `Q ${crownW * 0.3},${-crownH - 4} ${crownW},${-crownH}`,
    `L ${crownW},${-4}`,
    `Q ${brim},${-4} ${brim},${-2}`,
    `L ${brim},0`,
    "Z",
  ].join(" ");
}

/** Beanie/knit cap */
function beaniePath(headR: number): string {
  const w = headR * 0.95;
  const h = headR * 0.55;
  return [
    `M ${-w},0`,
    `Q ${-w},${-h * 0.8} ${-w * 0.6},${-h}`,
    `Q ${0},${-h - 5} ${w * 0.6},${-h}`,
    `Q ${w},${-h * 0.8} ${w},0`,
    "Z",
  ].join(" ");
}

/** Long flowing hair outline */
function longHairPath(headR: number): string {
  const w = headR * 1.2;
  const drop = headR * 1.8;
  return [
    `M ${-w},${-headR * 0.2}`,
    `Q ${-w - 3},${drop * 0.4} ${-w + 2},${drop}`,
    `L ${-w + 6},${drop}`,
    `Q ${-headR * 0.5},${drop * 0.6} ${-headR * 0.5},${0}`,
    `M ${w},${-headR * 0.2}`,
    `Q ${w + 3},${drop * 0.4} ${w - 2},${drop}`,
    `L ${w - 6},${drop}`,
    `Q ${headR * 0.5},${drop * 0.6} ${headR * 0.5},${0}`,
  ].join(" ");
}

/** Afro silhouette (larger head halo) */
function afroPath(headR: number): string {
  const r = headR * 1.45;
  return `M 0,${-headR * 0.1} m ${-r},0 a ${r},${r * 1.1} 0 1,0 ${r * 2},0 a ${r},${r * 1.1} 0 1,0 ${-r * 2},0`;
}

/* ------------------------------------------------------------------ */
/*  Hand/arm gesture paths                                             */
/* ------------------------------------------------------------------ */

function fistPath(): string {
  // Closed fist at top of arm
  return [
    // arm
    `M -3,0 L -3,-30 Q -3,-32 -1,-33`,
    `L 5,-33 Q 7,-32 7,-30 L 7,0`,
    // fist knuckles
    `M -4,-33 Q -5,-38 -2,-40 L 6,-40 Q 9,-38 8,-33`,
  ].join(" ");
}

function peacePath(): string {
  // Peace sign: two fingers up
  return [
    // arm
    `M -3,0 L -3,-28 L 7,-28 L 7,0`,
    // index finger
    `M -1,-28 L -2,-44 L 1,-44 L 2,-28`,
    // middle finger
    `M 3,-28 L 4,-44 L 7,-44 L 6,-28`,
    // folded ring/pinky bump
    `M -3,-28 Q -5,-31 -3,-28`,
  ].join(" ");
}

function openPalmPath(): string {
  // Open hand with spread fingers
  return [
    // arm
    `M -3,0 L -3,-26 L 7,-26 L 7,0`,
    // palm
    `M -4,-26 L -5,-32 L 9,-32 L 8,-26`,
    // thumb
    `M -5,-28 L -9,-34 L -7,-35 L -4,-30`,
    // index
    `M -3,-32 L -4,-42 L -1,-42 L 0,-32`,
    // middle
    `M 0,-32 L 0,-44 L 3,-44 L 3,-32`,
    // ring
    `M 3,-32 L 4,-41 L 7,-41 L 6,-32`,
    // pinky
    `M 6,-32 L 8,-38 L 10,-37 L 8,-32`,
  ].join(" ");
}

function lighterPath(): string {
  // Hand holding up a lighter with flame
  return [
    // arm
    `M -3,0 L -3,-28 L 7,-28 L 7,0`,
    // hand grip
    `M -2,-28 L -2,-34 L 6,-34 L 6,-28`,
    // lighter body
    `M 0,-34 L 0,-42 L 4,-42 L 4,-34`,
    // flame (teardrop)
    `M 2,-42 Q -1,-48 2,-52 Q 5,-48 2,-42`,
  ].join(" ");
}

function swayArmPath(): string {
  // Arm raised overhead, waving side to side
  return [
    // arm (slightly curved)
    `M -2,0 Q -4,-15 -2,-30`,
    `L 4,-30 Q 6,-15 4,0`,
    // open hand
    `M -2,-30 L -3,-36 L 5,-36 L 4,-30`,
    // fingers
    `M -1,-36 L -1,-40 L 1,-40 L 1,-36`,
    `M 1,-36 L 2,-41 L 4,-41 L 3,-36`,
  ].join(" ");
}

const GESTURE_PATHS: Record<Exclude<HandGesture, "none">, string> = {
  fist: fistPath(),
  peace: peacePath(),
  open: openPalmPath(),
  lighter: lighterPath(),
  sway: swayArmPath(),
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const CrowdSilhouette: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, beatDecay, chromaHue, bass } = snap;

  const crowd = React.useMemo(() => generateCrowd(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  // Master fade-in over first 3 seconds
  const masterFade = interpolate(frame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Base opacity: always visible 10-22%, energy pushes slightly higher
  const baseOpacity = interpolate(energy, [0.03, 0.35], [0.10, 0.22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = baseOpacity * masterFade;
  if (masterOpacity < 0.01) return null;

  // Energy-driven hand raise threshold (high energy = lower threshold = more hands)
  const handRaiseThreshold = interpolate(energy, [0.05, 0.40], [0.85, 0.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bob intensity: bass drives amplitude
  const bobAmp = interpolate(bass, [0.02, 0.25], [1.5, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow intensity pulsing with beat
  const glowBase = interpolate(energy, [0.05, 0.35], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowPulse = glowBase * (1 + beatDecay * 0.6);

  // Collective beat bob: everyone moves together on beat hits
  const collectiveBob = beatDecay * bobAmp * 0.7;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          {/* Atmospheric haze gradient between depth layers */}
          <linearGradient id="crowd-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(10,8,20,0)" />
            <stop offset="40%" stopColor={`hsla(${chromaHue}, 30%, 15%, 0.08)`} />
            <stop offset="100%" stopColor="rgba(5,5,10,0)" />
          </linearGradient>
          {/* Bottom fade-out so silhouettes blend into frame edge */}
          <linearGradient id="crowd-bottom-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(5,5,10,1)" />
          </linearGradient>
        </defs>

        {/* Haze layer between back and front rows */}
        <rect
          x={0}
          y={height * 0.78}
          width={width}
          height={height * 0.22}
          fill="url(#crowd-haze)"
          opacity={0.5 + energy * 0.3}
        />

        {/* Render back-to-front for correct depth ordering */}
        {crowd.map((person, i) => {
          const lcfg = LAYER_CFG[person.layer];
          const dims = BODY_DIMS[person.bodyType];
          const s = dims.scale * lcfg.scaleMult;

          // Position
          const px = person.x * width;
          const baseYPos = height - height * lcfg.baseY + person.heightOffset;

          // Beat-synced bob (collective + personal)
          const personalBob =
            Math.sin(frame * 0.03 * tempoFactor + person.bobPhase) * bobAmp * 0.3;
          const totalBob = (collectiveBob + personalBob) * s;

          // Lateral sway
          const sway =
            Math.sin(frame * 0.015 * tempoFactor + person.swayPhase) * person.swayAmp * s;

          const cy = baseYPos + totalBob;
          const cx = px + sway;

          // Glow color: chromaHue + personal offset, pulsing brightness
          const hue = (chromaHue + person.glowHueOffset + 360) % 360;
          const glowAlpha = (0.3 + beatDecay * 0.4) * lcfg.glowMult;
          const glowColor = `hsla(${hue}, 90%, 65%, ${glowAlpha.toFixed(3)})`;
          const fillColor = `rgba(5, 5, 10, ${lcfg.opacity.toFixed(2)})`;
          const effectiveGlow = glowPulse * lcfg.glowMult;

          // Should this person's hand be raised?
          const handUp = person.handGesture !== "none" && person.handThreshold > handRaiseThreshold;

          // Hand wave/sway animation
          const waveAngle = handUp
            ? Math.sin(frame * person.waveFreq * tempoFactor + person.wavePhase) * 18
            : 0;

          // Accessory positioning: top of head
          const headCY = -(dims.neckH + dims.headR);
          const headTopY = headCY - dims.headR;

          return (
            <g
              key={i}
              transform={`translate(${cx.toFixed(1)},${cy.toFixed(1)}) scale(${s.toFixed(3)})`}
              style={{ filter: `drop-shadow(0 0 ${effectiveGlow.toFixed(1)}px ${glowColor})` }}
            >
              {/* Body silhouette */}
              <path
                d={buildBodyPath(dims, person.shoulderTilt)}
                fill={fillColor}
                stroke={glowColor}
                strokeWidth={lcfg.strokeW}
                strokeLinejoin="round"
              />

              {/* Accessory */}
              {person.accessory === "hat" && (
                <g transform={`translate(0,${headTopY + dims.headR * 0.35}) rotate(${person.headTilt * 0.5})`}>
                  <path d={hatPath(dims.headR)} fill={fillColor} stroke={glowColor} strokeWidth={lcfg.strokeW * 0.8} />
                </g>
              )}
              {person.accessory === "beanie" && (
                <g transform={`translate(0,${headTopY + dims.headR * 0.5})`}>
                  <path d={beaniePath(dims.headR)} fill={fillColor} stroke={glowColor} strokeWidth={lcfg.strokeW * 0.8} />
                </g>
              )}
              {person.accessory === "hair_long" && (
                <g transform={`translate(0,${headCY})`}>
                  <path d={longHairPath(dims.headR)} fill="none" stroke={glowColor} strokeWidth={lcfg.strokeW * 1.2} opacity={0.6} />
                </g>
              )}
              {person.accessory === "hair_afro" && (
                <g transform={`translate(0,${headCY})`}>
                  <path d={afroPath(dims.headR)} fill={fillColor} stroke={glowColor} strokeWidth={lcfg.strokeW * 0.7} />
                </g>
              )}

              {/* Raised arm + gesture */}
              {handUp && person.handGesture !== "none" && (
                <g
                  transform={[
                    `translate(${person.handSide * dims.shoulderW * 0.4},${-2})`,
                    `rotate(${-25 * person.handSide + waveAngle})`,
                    `scale(${person.handSide === -1 ? -1 : 1},1)`,
                  ].join(" ")}
                >
                  <path
                    d={GESTURE_PATHS[person.handGesture]}
                    fill={fillColor}
                    stroke={glowColor}
                    strokeWidth={lcfg.strokeW * 0.7}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {/* Lighter flame glow */}
                  {person.handGesture === "lighter" && (
                    <circle
                      cx={2}
                      cy={-48}
                      r={4 + beatDecay * 3}
                      fill={`hsla(${(hue + 30) % 360}, 100%, 80%, ${(0.3 + beatDecay * 0.4).toFixed(2)})`}
                      style={{ filter: `blur(${2 + beatDecay * 2}px)` }}
                    />
                  )}
                </g>
              )}

              {/* Lower body extension (below torso, fades into bottom) */}
              <rect
                x={-dims.shoulderW * dims.torsoNarrow * 0.5}
                y={dims.torsoH}
                width={dims.shoulderW * dims.torsoNarrow}
                height={40}
                fill={fillColor}
                opacity={0.9}
              />
            </g>
          );
        })}

        <rect
          x={0}
          y={height - 25}
          width={width}
          height={25}
          fill="url(#crowd-bottom-fade)"
        />
      </svg>
    </div>
  );
};
