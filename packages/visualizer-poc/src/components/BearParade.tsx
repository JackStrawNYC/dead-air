/**
 * BearParade — A+++ overlay: a line of 7 dancing bears parading across the
 * frame. Each bear distinct (color and size from depth perspective), rainbow
 * tie-dye trails, joyful walking animation. Bears are the central row across
 * the frame. Sky/horizon backdrop with concert silhouettes and twinkling
 * stage lights.
 *
 * Audio reactivity:
 *   slowEnergy → spotlight warmth + trail glow
 *   energy     → bear bounce intensity
 *   bass       → low-end paw stomp depth
 *   beatDecay  → synced hop on every beat
 *   onsetEnvelope → confetti burst
 *   chromaHue  → rainbow trail tint shift
 *   tempoFactor → walk cycle rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { PsychedelicDefs, FILTER_IDS, PATTERN_IDS, NoiseLayer } from "./psychedelic-filters";
import { ProjectorEffect } from "./ProjectorEffect";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const BEAR_COUNT = 7;
const CONFETTI_COUNT = 80;
const STAR_COUNT = 70;

interface BearSpec { idx: number; depth: number; phase: number; hue: number; speed: number; xOffset: number; }
interface Spark { x: number; y: number; r: number; speed: number; phase: number; hue: number; }

function buildBears(): BearSpec[] {
  // Dead-era bear palette — warm, earthy, jewel-toned (not bright primary rainbow)
  // Inspired by Bob Thomas's original marching bears: rich, saturated but warm
  const hues = [355, 22, 42, 145, 195, 268, 330];
  const rng = seeded(11_447_338);
  return Array.from({ length: BEAR_COUNT }, (_, i) => ({
    idx: i,
    depth: 0.6 + rng() * 0.45,
    phase: rng() * Math.PI * 2,
    hue: hues[i],
    speed: 0.95 + rng() * 0.15,
    xOffset: i * (1.0 / BEAR_COUNT) + rng() * 0.04 - 0.02,
  }));
}

function buildConfetti(): Spark[] {
  const rng = seeded(76_991_204);
  return Array.from({ length: CONFETTI_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.85,
    r: 0.7 + rng() * 2.4,
    speed: 0.005 + rng() * 0.04,
    phase: rng() * Math.PI * 2,
    hue: rng() * 360,
  }));
}

function buildStars(): Spark[] {
  const rng = seeded(48_338_771);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.45,
    r: 0.5 + rng() * 1.5,
    speed: 0.005 + rng() * 0.03,
    phase: rng() * Math.PI * 2,
    hue: 0,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const BearParade: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const bears = React.useMemo(buildBears, []);
  const confetti = React.useMemo(buildConfetti, []);
  const stars = React.useMemo(buildStars, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives — widened for dramatic quiet/loud contrast
  const warmth = interpolate(snap.slowEnergy, [0.02, 0.32], [0.20, 1.50], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bounce = interpolate(snap.energy, [0.02, 0.30], [0.20, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stomp = interpolate(snap.bass, [0.0, 0.65], [0.15, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Warm concert-hall palette — amber spotlight tones, not rainbow
  const tintShift = snap.chromaHue - 180;
  const baseHue = 30;
  const tintHue = ((baseHue + tintShift * 0.45) % 360 + 360) % 360;
  const tintCore = `hsl(${tintHue}, 75%, 70%)`;
  // Dark venue — deep indigo/black, not bright sky
  const skyTop = `hsl(${(tintHue + 220) % 360}, 30%, 4%)`;
  const skyMid = `hsl(${(tintHue + 230) % 360}, 25%, 7%)`;
  const skyHorizon = `hsl(${(tintHue + 20) % 360}, 30%, 12%)`;

  // ─── HERO LAYOUT ───────────────────────────────────────────────────
  const groundY = height * 0.78;
  const baseBearH = height * 0.42;

  // Star nodes
  const starNodes = stars.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`st-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + flick * 0.6)}
        fill="#fff5d0" opacity={0.45 + flick * 0.45} />
    );
  });

  // Confetti sparkles
  const confettiNodes = confetti.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    const yDrift = (s.y + frame * 0.0008) % 1;
    return (
      <circle key={`con-${i}`} cx={s.x * width} cy={yDrift * height}
        r={s.r * (0.7 + bounce * 0.6)}
        fill={`hsl(${(s.hue + tintShift) % 360}, 70%, 55%)`} opacity={0.35 * flick * bounce} />
    );
  });

  // ── BEAR BUILDER — organic bezier curves, not geometric primitives ──
  // All coordinates are relative to (bx, by) center of mass, scaled by bW/bH.
  // Helper: absolute point from normalized (-1..1) bear-space
  const p = (bx: number, by: number, bW: number, bH: number, nx: number, ny: number) =>
    `${bx + nx * bW * 0.5} ${by + ny * bH * 0.5}`;

  function buildBear(spec: BearSpec): React.ReactNode {
    const scale = spec.depth;
    const bH = baseBearH * scale;
    const bW = bH * 0.95;
    const slowDrift = (frame * 0.00012 * spec.speed * tempoFactor) % 1;
    const xPos = ((spec.xOffset + slowDrift) % 1.10) - 0.05;
    const cxBear = xPos * width;
    const bobPhase = frame * 0.10 * tempoFactor + spec.phase;
    const bob = Math.sin(bobPhase) * (2 + bounce * 10 + snap.beatDecay * 12) * scale;
    const stompPush = stomp * snap.beatDecay * 6 * scale;
    const cyBear = groundY - bH * 0.50 + bob + stompPush;

    const hue = ((spec.hue + tintShift) % 360 + 360) % 360;
    // Deeper, richer tones — like vintage Dead poster art, not bright clip art
    const fillCol = `hsl(${hue}, 72%, 42%)`;
    const fillCore = `hsl(${hue}, 78%, 55%)`;
    const fillDeep = `hsl(${hue}, 68%, 28%)`;
    const fillShadow = `hsl(${hue}, 60%, 18%)`;
    const fillHighlight = `hsl(${hue}, 75%, 58%)`;
    const stroke = "rgba(15, 5, 0, 0.90)";
    const padColor = `hsl(${hue}, 45%, 25%)`;

    const bx = cxBear;
    const by = cyBear;
    const legA = Math.sin(bobPhase) * 8 * scale;
    const legB = -legA;
    const armA = Math.sin(bobPhase * 1.2 + 0.6) * 6 * scale;
    const armB = -armA;

    // Organic body path — pear-shaped torso with rounded belly
    // Bears have a chunky round body wider at the belly than shoulders
    const bodyPath = `
      M ${p(bx,by,bW,bH, 0, -0.55)}
      C ${p(bx,by,bW,bH, 0.50, -0.58)} ${p(bx,by,bW,bH, 0.82, -0.30)} ${p(bx,by,bW,bH, 0.85, -0.05)}
      C ${p(bx,by,bW,bH, 0.88, 0.20)} ${p(bx,by,bW,bH, 0.84, 0.50)} ${p(bx,by,bW,bH, 0.70, 0.60)}
      C ${p(bx,by,bW,bH, 0.55, 0.68)} ${p(bx,by,bW,bH, 0.20, 0.72)} ${p(bx,by,bW,bH, 0, 0.70)}
      C ${p(bx,by,bW,bH, -0.20, 0.72)} ${p(bx,by,bW,bH, -0.55, 0.68)} ${p(bx,by,bW,bH, -0.70, 0.60)}
      C ${p(bx,by,bW,bH, -0.84, 0.50)} ${p(bx,by,bW,bH, -0.88, 0.20)} ${p(bx,by,bW,bH, -0.85, -0.05)}
      C ${p(bx,by,bW,bH, -0.82, -0.30)} ${p(bx,by,bW,bH, -0.50, -0.58)} ${p(bx,by,bW,bH, 0, -0.55)}
      Z
    `;

    // Belly patch — organic lighter area (not an ellipse)
    const bellyPath = `
      M ${p(bx,by,bW,bH, -0.10, -0.20)}
      C ${p(bx,by,bW,bH, 0.35, -0.25)} ${p(bx,by,bW,bH, 0.50, 0.0)} ${p(bx,by,bW,bH, 0.45, 0.30)}
      C ${p(bx,by,bW,bH, 0.38, 0.52)} ${p(bx,by,bW,bH, 0.10, 0.58)} ${p(bx,by,bW,bH, -0.10, 0.50)}
      C ${p(bx,by,bW,bH, -0.35, 0.42)} ${p(bx,by,bW,bH, -0.45, 0.15)} ${p(bx,by,bW,bH, -0.35, -0.10)}
      C ${p(bx,by,bW,bH, -0.28, -0.22)} ${p(bx,by,bW,bH, -0.18, -0.22)} ${p(bx,by,bW,bH, -0.10, -0.20)}
      Z
    `;

    // Head center (offset left for profile walking pose)
    const hcx = bx - bW * 0.32;
    const hcy = by - bH * 0.20;
    const hr = bH * 0.20;

    // Organic head — slightly pear-shaped, wider jaw/cheeks
    const headPath = `
      M ${hcx} ${hcy - hr}
      C ${hcx + hr * 0.85} ${hcy - hr * 1.05} ${hcx + hr * 1.15} ${hcy - hr * 0.35} ${hcx + hr * 1.10} ${hcy + hr * 0.10}
      C ${hcx + hr * 1.05} ${hcy + hr * 0.55} ${hcx + hr * 0.75} ${hcy + hr * 1.0} ${hcx + hr * 0.15} ${hcy + hr * 1.05}
      C ${hcx - hr * 0.30} ${hcy + hr * 1.08} ${hcx - hr * 0.85} ${hcy + hr * 0.85} ${hcx - hr * 1.05} ${hcy + hr * 0.30}
      C ${hcx - hr * 1.15} ${hcy - hr * 0.25} ${hcx - hr * 0.90} ${hcy - hr * 1.0} ${hcx} ${hcy - hr}
      Z
    `;

    // Organic leg — tapered bezier shape (wider at hip, narrower mid-leg, flared paw)
    function legPath(lx: number, ly: number, legOffset: number, mirror: boolean): string {
      const w = bW * 0.08; // half-width at hip
      const h = bH * 0.38;
      const pw = bW * 0.11; // paw width
      const dir = mirror ? -1 : 1;
      const x = lx;
      const y = ly + legOffset;
      return `
        M ${x - w} ${y}
        C ${x - w * 0.6} ${y + h * 0.2} ${x - w * 0.4} ${y + h * 0.5} ${x - w * 0.5} ${y + h * 0.75}
        C ${x - w * 0.6} ${y + h * 0.88} ${x - pw} ${y + h * 0.95} ${x - pw} ${y + h}
        Q ${x - pw} ${y + h * 1.08} ${x} ${y + h * 1.08}
        Q ${x + pw} ${y + h * 1.08} ${x + pw} ${y + h}
        C ${x + pw} ${y + h * 0.95} ${x + w * 0.6} ${y + h * 0.88} ${x + w * 0.5} ${y + h * 0.75}
        C ${x + w * 0.4} ${y + h * 0.5} ${x + w * 0.6} ${y + h * 0.2} ${x + w} ${y}
        Z
      `;
    }

    // Paw pad detail — rounded pad with toe bumps
    function pawPath(px: number, py: number, pw: number): string {
      const padH = bH * 0.035;
      return `
        M ${px - pw * 0.7} ${py}
        Q ${px - pw * 0.7} ${py + padH} ${px} ${py + padH}
        Q ${px + pw * 0.7} ${py + padH} ${px + pw * 0.7} ${py}
        Z
      `;
    }

    // Organic arm — curved, tapered limb
    function armPath(ax: number, ay: number, angle: number, pivotX: number, pivotY: number): string {
      const w = bW * 0.055;
      const h = bH * 0.24;
      return `
        M ${ax - w} ${ay}
        C ${ax - w * 0.7} ${ay + h * 0.3} ${ax - w * 0.5} ${ay + h * 0.7} ${ax - w * 0.8} ${ay + h}
        Q ${ax} ${ay + h * 1.1} ${ax + w * 0.8} ${ay + h}
        C ${ax + w * 0.5} ${ay + h * 0.7} ${ax + w * 0.7} ${ay + h * 0.3} ${ax + w} ${ay}
        Z
      `;
    }

    // Organic ear — irregular round bump
    function earPath(ex: number, ey: number, r: number): string {
      return `
        M ${ex} ${ey - r}
        C ${ex + r * 1.1} ${ey - r * 0.9} ${ex + r * 1.1} ${ey + r * 0.7} ${ex + r * 0.2} ${ey + r * 0.9}
        C ${ex - r * 0.5} ${ey + r * 0.8} ${ex - r * 1.1} ${ey + r * 0.3} ${ex - r * 1.0} ${ey - r * 0.3}
        C ${ex - r * 0.9} ${ey - r * 0.8} ${ex - r * 0.5} ${ey - r * 1.0} ${ex} ${ey - r}
        Z
      `;
    }

    // Snout path — protruding rounded shape
    const snoutPath = `
      M ${hcx - hr * 0.55} ${hcy + hr * 0.25}
      C ${hcx - hr * 0.55} ${hcy + hr * 0.0} ${hcx - hr * 0.20} ${hcy - hr * 0.10} ${hcx + hr * 0.05} ${hcy + hr * 0.10}
      C ${hcx + hr * 0.20} ${hcy + hr * 0.25} ${hcx + hr * 0.30} ${hcy + hr * 0.55} ${hcx + hr * 0.10} ${hcy + hr * 0.70}
      C ${hcx - hr * 0.05} ${hcy + hr * 0.78} ${hcx - hr * 0.40} ${hcy + hr * 0.70} ${hcx - hr * 0.55} ${hcy + hr * 0.50}
      C ${hcx - hr * 0.60} ${hcy + hr * 0.40} ${hcx - hr * 0.58} ${hcy + hr * 0.30} ${hcx - hr * 0.55} ${hcy + hr * 0.25}
      Z
    `;

    // Tail — organic S-curve with tuft
    const tailPath = `
      M ${bx + bW * 0.38} ${by - bH * 0.08}
      C ${bx + bW * 0.42} ${by - bH * 0.18} ${bx + bW * 0.48} ${by - bH * 0.22} ${bx + bW * 0.44} ${by - bH * 0.12}
      C ${bx + bW * 0.46} ${by - bH * 0.08} ${bx + bW * 0.42} ${by - bH * 0.02} ${bx + bW * 0.38} ${by - bH * 0.08}
      Z
    `;

    // Fur tufts along body outline
    const furTufts = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2 + spec.phase;
      const fx = bx + Math.cos(angle) * bW * 0.44;
      const fy = by + Math.sin(angle) * bH * 0.34 + bH * 0.05;
      const len = bH * 0.025 + (i % 3) * bH * 0.008;
      const dx = Math.cos(angle) * len;
      const dy = Math.sin(angle) * len;
      return (
        <path key={`fur-${i}`}
          d={`M ${fx} ${fy} Q ${fx + dx * 0.5 + dy * 0.3} ${fy + dy * 0.5 - dx * 0.3} ${fx + dx} ${fy + dy}`}
          stroke={fillDeep} strokeWidth={1.2} fill="none" strokeLinecap="round" opacity={0.6} />
      );
    });

    // Ear positions
    const earLx = hcx - hr * 0.65;
    const earLy = hcy - hr * 0.75;
    const earRx = hcx + hr * 0.50;
    const earRy = hcy - hr * 0.75;
    const earR = hr * 0.30;

    // Leg positions
    const hindLegX = bx + bW * 0.16;
    const hindLegY = by + bH * 0.12;
    const frontLegX = bx - bW * 0.18;
    const frontLegY = by + bH * 0.12;
    const armRaisedX = bx - bW * 0.30;
    const armRaisedY = by - bH * 0.18;
    const armDownX = bx + bW * 0.30;
    const armDownY = by - bH * 0.08;

    return (
      <g key={`bear-${spec.idx}`}>
        {/* Rainbow trail behind */}
        {Array.from({ length: 5 }).map((_, k) => {
          const tailX = bx - bW * 0.5 - k * (bW * 0.16);
          const tailHue = (spec.hue + tintShift + k * 40) % 360;
          return (
            <path key={`trail-${k}`}
              d={`M ${tailX - bW * 0.18 * (1 - k * 0.12)} ${by + bH * 0.22}
                  Q ${tailX} ${by + bH * 0.14} ${tailX + bW * 0.18 * (1 - k * 0.12)} ${by + bH * 0.22}
                  Q ${tailX} ${by + bH * 0.32} ${tailX - bW * 0.18 * (1 - k * 0.12)} ${by + bH * 0.22} Z`}
              fill={`hsl(${tailHue}, 85%, 60%)`} opacity={(0.42 - k * 0.07) * warmth} />
          );
        })}

        {/* Ground shadow — organic blob, not ellipse */}
        <path d={`
          M ${bx - bW * 0.45} ${groundY + 4}
          Q ${bx} ${groundY - 2} ${bx + bW * 0.45} ${groundY + 4}
          Q ${bx} ${groundY + 10} ${bx - bW * 0.45} ${groundY + 4} Z
        `} fill="rgba(0,0,0,0.45)" />

        {/* Hind leg */}
        <g transform={`translate(0, ${legB})`}>
          <path d={legPath(hindLegX, hindLegY, 0, false)} fill={fillDeep} stroke={stroke} strokeWidth={1.4} />
          <path d={pawPath(hindLegX, hindLegY + bH * 0.38, bW * 0.10)} fill={padColor} opacity={0.7} />
        </g>

        {/* Rear arm (behind body) */}
        <g transform={`rotate(${10 + armB * 0.5} ${armDownX} ${armDownY})`}>
          <path d={armPath(armDownX, armDownY, 0, armDownX, armDownY)} fill={fillDeep} stroke={stroke} strokeWidth={1.4} />
        </g>

        {/* Body — organic pear shape */}
        <path d={bodyPath} fill={fillCol} stroke={stroke} strokeWidth={2} strokeLinejoin="round" />

        {/* Belly patch — organic lighter area */}
        <path d={bellyPath} fill={fillCore} opacity={0.45} />

        {/* Body shading — dark shadow on underside */}
        <path d={`
          M ${p(bx,by,bW,bH, -0.60, 0.35)}
          C ${p(bx,by,bW,bH, -0.30, 0.65)} ${p(bx,by,bW,bH, 0.30, 0.65)} ${p(bx,by,bW,bH, 0.60, 0.35)}
          C ${p(bx,by,bW,bH, 0.50, 0.62)} ${p(bx,by,bW,bH, -0.50, 0.62)} ${p(bx,by,bW,bH, -0.60, 0.35)}
          Z
        `} fill={fillShadow} opacity={0.25} />

        {/* Body highlight — top shoulder gleam */}
        <path d={`
          M ${p(bx,by,bW,bH, -0.30, -0.48)}
          C ${p(bx,by,bW,bH, 0.0, -0.52)} ${p(bx,by,bW,bH, 0.25, -0.45)} ${p(bx,by,bW,bH, 0.40, -0.35)}
          C ${p(bx,by,bW,bH, 0.20, -0.38)} ${p(bx,by,bW,bH, -0.10, -0.42)} ${p(bx,by,bW,bH, -0.30, -0.48)}
          Z
        `} fill={fillHighlight} opacity={0.30} />

        {/* Fur tufts along body edge */}
        {furTufts}

        {/* Front leg */}
        <g transform={`translate(0, ${legA})`}>
          <path d={legPath(frontLegX, frontLegY, 0, true)} fill={fillDeep} stroke={stroke} strokeWidth={1.4} />
          <path d={pawPath(frontLegX, frontLegY + bH * 0.38, bW * 0.10)} fill={padColor} opacity={0.7} />
        </g>

        {/* Front arm (raised, in front of body) */}
        <g transform={`rotate(${-15 + armA * 0.8} ${armRaisedX} ${armRaisedY})`}>
          <path d={armPath(armRaisedX, armRaisedY, 0, armRaisedX, armRaisedY)} fill={fillDeep} stroke={stroke} strokeWidth={1.4} />
          {/* Paw at end of arm */}
          <path d={pawPath(armRaisedX, armRaisedY + bH * 0.24, bW * 0.06)} fill={padColor} opacity={0.6} />
        </g>

        {/* Tail — organic S-curve */}
        <path d={tailPath} fill={fillCol} stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />

        {/* Head — organic pear-shape, wider cheeks */}
        <path d={headPath} fill={fillCol} stroke={stroke} strokeWidth={2} strokeLinejoin="round" />

        {/* Head highlight — forehead gleam */}
        <path d={`
          M ${hcx - hr * 0.35} ${hcy - hr * 0.75}
          C ${hcx + hr * 0.10} ${hcy - hr * 0.85} ${hcx + hr * 0.55} ${hcy - hr * 0.55} ${hcx + hr * 0.45} ${hcy - hr * 0.25}
          C ${hcx + hr * 0.20} ${hcy - hr * 0.40} ${hcx - hr * 0.15} ${hcy - hr * 0.65} ${hcx - hr * 0.35} ${hcy - hr * 0.75}
          Z
        `} fill={fillHighlight} opacity={0.25} />

        {/* Ears — organic irregular shape */}
        <path d={earPath(earLx, earLy, earR)} fill={fillCol} stroke={stroke} strokeWidth={1.6} />
        <path d={earPath(earLx, earLy, earR * 0.45)} fill={fillDeep} />
        <path d={earPath(earRx, earRy, earR)} fill={fillCol} stroke={stroke} strokeWidth={1.6} />
        <path d={earPath(earRx, earRy, earR * 0.45)} fill={fillDeep} />

        {/* Snout — protruding organic shape */}
        <path d={snoutPath} fill={fillCore} stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />

        {/* Nose — organic bean shape */}
        <path d={`
          M ${hcx - hr * 0.12} ${hcy + hr * 0.15}
          C ${hcx - hr * 0.12} ${hcy + hr * 0.05} ${hcx + hr * 0.12} ${hcy + hr * 0.05} ${hcx + hr * 0.12} ${hcy + hr * 0.15}
          C ${hcx + hr * 0.10} ${hcy + hr * 0.22} ${hcx - hr * 0.10} ${hcy + hr * 0.22} ${hcx - hr * 0.12} ${hcy + hr * 0.15}
          Z
        `} fill="rgba(20, 8, 2, 0.92)" />

        {/* Eyes — with organic shape, not circles */}
        <path d={`
          M ${hcx - hr * 0.55} ${hcy - hr * 0.28}
          C ${hcx - hr * 0.55} ${hcy - hr * 0.42} ${hcx - hr * 0.30} ${hcy - hr * 0.42} ${hcx - hr * 0.30} ${hcy - hr * 0.28}
          C ${hcx - hr * 0.30} ${hcy - hr * 0.15} ${hcx - hr * 0.55} ${hcy - hr * 0.15} ${hcx - hr * 0.55} ${hcy - hr * 0.28}
          Z
        `} fill="rgba(20, 8, 2, 0.92)" />
        <path d={`
          M ${hcx + hr * 0.10} ${hcy - hr * 0.28}
          C ${hcx + hr * 0.10} ${hcy - hr * 0.42} ${hcx + hr * 0.35} ${hcy - hr * 0.42} ${hcx + hr * 0.35} ${hcy - hr * 0.28}
          C ${hcx + hr * 0.35} ${hcy - hr * 0.15} ${hcx + hr * 0.10} ${hcy - hr * 0.15} ${hcx + hr * 0.10} ${hcy - hr * 0.28}
          Z
        `} fill="rgba(20, 8, 2, 0.92)" />
        {/* Eye shine */}
        <path d={`
          M ${hcx - hr * 0.49} ${hcy - hr * 0.34}
          C ${hcx - hr * 0.49} ${hcy - hr * 0.39} ${hcx - hr * 0.42} ${hcy - hr * 0.39} ${hcx - hr * 0.42} ${hcy - hr * 0.34}
          Z
        `} fill="white" opacity={0.85} />
        <path d={`
          M ${hcx + hr * 0.17} ${hcy - hr * 0.34}
          C ${hcx + hr * 0.17} ${hcy - hr * 0.39} ${hcx + hr * 0.24} ${hcy - hr * 0.39} ${hcx + hr * 0.24} ${hcy - hr * 0.34}
          Z
        `} fill="white" opacity={0.85} />

        {/* Mouth — happy grin curve */}
        <path d={`
          M ${hcx - hr * 0.40} ${hcy + hr * 0.42}
          Q ${hcx - hr * 0.15} ${hcy + hr * 0.65} ${hcx + hr * 0.15} ${hcy + hr * 0.42}
        `} stroke={stroke} strokeWidth={1.6} fill="none" strokeLinecap="round" />

        {/* Cheek blush */}
        <path d={`
          M ${hcx - hr * 0.70} ${hcy + hr * 0.15}
          C ${hcx - hr * 0.70} ${hcy + hr * 0.05} ${hcx - hr * 0.50} ${hcy + hr * 0.05} ${hcx - hr * 0.50} ${hcy + hr * 0.15}
          C ${hcx - hr * 0.50} ${hcy + hr * 0.25} ${hcx - hr * 0.70} ${hcy + hr * 0.25} ${hcx - hr * 0.70} ${hcy + hr * 0.15}
          Z
        `} fill={`hsl(${(hue + 340) % 360}, 70%, 60%)`} opacity={0.20} />
        <path d={`
          M ${hcx + hr * 0.40} ${hcy + hr * 0.15}
          C ${hcx + hr * 0.40} ${hcy + hr * 0.05} ${hcx + hr * 0.60} ${hcy + hr * 0.05} ${hcx + hr * 0.60} ${hcy + hr * 0.15}
          C ${hcx + hr * 0.60} ${hcy + hr * 0.25} ${hcx + hr * 0.40} ${hcy + hr * 0.25} ${hcx + hr * 0.40} ${hcy + hr * 0.15}
          Z
        `} fill={`hsl(${(hue + 340) % 360}, 70%, 60%)`} opacity={0.20} />
      </g>
    );
  }

  // Sort by depth (back to front)
  const sortedBears = [...bears].sort((a, b) => a.depth - b.depth);

  return (
    <ProjectorEffect width={width} height={height} frame={frame} intensity={0.7}>
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <PsychedelicDefs
            prefix="bp"
            frame={frame}
            energy={bounce}
            bass={stomp}
            beatDecay={snap.beatDecay}
            turbulenceFreq={0.010}
            include={["posterize", "glowBleed", "filmGrain", "inkWash", "organicDistort", "liquidDistort"]}
          />
          <linearGradient id="bp-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="35%" stopColor={skyMid} />
            <stop offset="70%" stopColor={skyHorizon} />
            <stop offset="100%" stopColor={`hsl(${(tintHue + 10) % 360}, 40%, 22%)`} />
          </linearGradient>
          <linearGradient id="bp-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(40, 24, 8, 0.95)" />
            <stop offset="100%" stopColor="rgba(15, 8, 2, 1)" />
          </linearGradient>
          <radialGradient id="bp-spot">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.55} />
            <stop offset="45%" stopColor={tintCore} stopOpacity={0.18} />
            <stop offset="100%" stopColor={tintCore} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="bp-spot-warm">
            <stop offset="0%" stopColor={`hsl(${tintHue}, 85%, 75%)`} stopOpacity={0.30} />
            <stop offset="60%" stopColor={`hsl(${(tintHue + 30) % 360}, 60%, 50%)`} stopOpacity={0.08} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="bp-vig">
            <stop offset="45%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.72)" />
          </radialGradient>
          {/* Stage footlights — colored pools of light at bear feet */}
          <radialGradient id="bp-footlight" cx="50%" cy="0%" r="80%">
            <stop offset="0%" stopColor={`hsl(${(tintHue + 40) % 360}, 80%, 65%)`} stopOpacity={0.25} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {/* Sky — with ink wash texture */}
        <g filter={`url(#${FILTER_IDS.inkWash("bp")})`}>
          <rect width={width} height={height} fill="url(#bp-sky)" />
        </g>

        {/* Stars */}
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Distant horizon mountains — with organic edge distortion */}
        <g filter={`url(#${FILTER_IDS.organicDistort("bp")})`}>
          <path d={`M 0 ${height * 0.70} L ${width * 0.18} ${height * 0.62} L ${width * 0.32} ${height * 0.66} L ${width * 0.5} ${height * 0.58} L ${width * 0.68} ${height * 0.65} L ${width * 0.85} ${height * 0.60} L ${width} ${height * 0.68} L ${width} ${height * 0.78} L 0 ${height * 0.78} Z`}
            fill="rgba(20, 12, 30, 0.85)" />
          {/* Tree silhouettes on mountain ridge */}
          {Array.from({ length: 18 }, (_, i) => {
            const tx = (i / 18) * width;
            const ridgeY = height * 0.58 + Math.sin(i * 0.9) * height * 0.06;
            const th = 12 + (i % 5) * 6;
            return (
              <path key={`tree-${i}`}
                d={`M ${tx} ${ridgeY} L ${tx - 4 - (i % 3) * 2} ${ridgeY} L ${tx} ${ridgeY - th} L ${tx + 4 + (i % 3) * 2} ${ridgeY} Z`}
                fill="rgba(12, 6, 22, 0.80)" />
            );
          })}
        </g>

        {/* Crowd silhouettes — roughened edges */}
        <g filter={`url(#${FILTER_IDS.organicDistort("bp")})`}>
          {Array.from({ length: 45 }, (_, i) => {
            const cx = (i / 45) * width + ((i * 7) % 11) - 5;
            const headR = 4 + (i % 4) * 1.5;
            const bodyH = 8 + (i % 5) * 2;
            const sway = Math.sin(frame * 0.015 + i * 0.7) * 2 * bounce;
            return (
              <g key={`crowd-${i}`}>
                <circle cx={cx + sway} cy={height * 0.73 - bodyH} r={headR} fill="rgba(8, 4, 12, 0.85)" />
                <ellipse cx={cx + sway * 0.5} cy={height * 0.74} rx={headR * 0.9} ry={bodyH * 0.55} fill="rgba(8, 4, 12, 0.85)" />
                {/* Raised arm on some — beat reactive */}
                {i % 4 === 0 && bounce > 0.3 && (
                  <line x1={cx + sway} y1={height * 0.73 - bodyH}
                    x2={cx + sway + (i % 2 ? 6 : -6)} y2={height * 0.73 - bodyH - 12 - bounce * 6}
                    stroke="rgba(8, 4, 12, 0.85)" strokeWidth={2} strokeLinecap="round" />
                )}
              </g>
            );
          })}
        </g>

        {/* Main spotlight — with glow bleed */}
        <g filter={`url(#${FILTER_IDS.glowBleed("bp")})`}>
          <ellipse cx={width / 2} cy={groundY - baseBearH * 0.4} rx={width * 0.65} ry={baseBearH * 0.7}
            fill="url(#bp-spot)" style={{ mixBlendMode: "screen" }} opacity={warmth} />
        </g>
        {/* Secondary warm spotlight haze */}
        <ellipse cx={width / 2} cy={groundY - baseBearH * 0.2} rx={width * 0.45} ry={baseBearH * 0.5}
          fill="url(#bp-spot-warm)" style={{ mixBlendMode: "screen" }} opacity={warmth * 0.6} />

        {/* Stage floor — with ink wash texture */}
        <g filter={`url(#${FILTER_IDS.inkWash("bp")})`}>
          <rect x={0} y={groundY} width={width} height={height - groundY} fill="url(#bp-ground)" />
          {Array.from({ length: 12 }, (_, i) => (
            <line key={`plank-${i}`} x1={0} y1={groundY + i * 10 + 2} x2={width} y2={groundY + i * 10 + 2}
              stroke="rgba(70, 40, 14, 0.30)" strokeWidth={0.6 + (i % 3) * 0.3} />
          ))}
          {/* Wood knot details */}
          {Array.from({ length: 6 }, (_, i) => (
            <ellipse key={`knot-${i}`}
              cx={width * (0.1 + (i * 0.17) % 0.9)}
              cy={groundY + 15 + (i * 23) % 60}
              rx={3 + i % 3} ry={2 + i % 2}
              fill="none" stroke="rgba(50, 28, 8, 0.25)" strokeWidth={0.6} />
          ))}
        </g>

        {/* Footlight glow pools at stage edge */}
        {Array.from({ length: 5 }, (_, i) => (
          <ellipse key={`foot-${i}`}
            cx={width * (0.15 + i * 0.18)}
            cy={groundY + 3}
            rx={width * 0.08} ry={20}
            fill="url(#bp-footlight)" style={{ mixBlendMode: "screen" }}
            opacity={0.4 + bounce * 0.4} />
        ))}

        {/* Bears — POSTERIZE filter: organic distortion + ink texture + grain + glow */}
        <g filter={`url(#${FILTER_IDS.posterize("bp")})`}>
          {sortedBears.map(buildBear)}
        </g>

        {/* Confetti sparkles — with liquid distortion */}
        <g style={{ mixBlendMode: "screen" }} filter={`url(#${FILTER_IDS.liquidDistort("bp")})`}>
          {confettiNodes}
        </g>

        {/* Onset flash */}
        {flash > 0.05 && (
          <rect width={width} height={height}
            fill={`rgba(255, 245, 220, ${flash * 0.10})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Film grain overlay — analog texture over entire scene */}
        <NoiseLayer width={width} height={height}
          filterId={PATTERN_IDS.noiseTexture("bp")}
          opacity={0.05 + snap.beatDecay * 0.04}
          blendMode="overlay" />

        {/* Vignette — tighter for stage focus */}
        <rect width={width} height={height} fill="url(#bp-vig)" />
      </svg>
    </div>
    </ProjectorEffect>
  );
};
