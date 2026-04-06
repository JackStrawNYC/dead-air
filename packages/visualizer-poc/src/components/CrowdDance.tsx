/**
 * CrowdDance — A+++ dancing crowd silhouettes along the bottom of the screen.
 *
 * 14 fully-articulated dancing figures in 2 depth rows (front + back).
 * 4 body types (tall dancer, medium groover, compact bopper, lanky swayer).
 * 4 dance styles (swaying, bouncing, spinning, arm-waving) with per-figure
 * choreography driven by musicalTime, beatDecay, bass, and energy.
 *
 * Neon glow outlines colored by chromaHue. Beat-locked vertical bounce.
 * Bass drives stomp amplitude. Energy scales all movement intensity.
 * Energy gate: visible only when energy > 0.20.
 * Layer 1, high energy overlay.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ---- Body type definitions ---- */

type BodyType = "tall" | "medium" | "compact" | "lanky";
type DanceStyle = "sway" | "bounce" | "spin" | "armWave";

interface BodyProfile {
  heightScale: number; widthScale: number; headRatio: number;
  torsoRatio: number; legRatio: number; armLength: number;
  shoulderWidth: number; hipWidth: number;
}

const BODY_PROFILES: Record<BodyType, BodyProfile> = {
  tall:    { heightScale: 1.25, widthScale: 0.85, headRatio: 0.30, torsoRatio: 0.38, legRatio: 0.38, armLength: 0.34, shoulderWidth: 0.50, hipWidth: 0.32 },
  medium:  { heightScale: 1.00, widthScale: 1.00, headRatio: 0.34, torsoRatio: 0.35, legRatio: 0.36, armLength: 0.30, shoulderWidth: 0.55, hipWidth: 0.36 },
  compact: { heightScale: 0.82, widthScale: 1.12, headRatio: 0.38, torsoRatio: 0.33, legRatio: 0.34, armLength: 0.28, shoulderWidth: 0.58, hipWidth: 0.40 },
  lanky:   { heightScale: 1.15, widthScale: 0.78, headRatio: 0.28, torsoRatio: 0.40, legRatio: 0.36, armLength: 0.36, shoulderWidth: 0.46, hipWidth: 0.28 },
};

const BODY_TYPES: BodyType[] = ["tall", "medium", "compact", "lanky"];
const DANCE_STYLES: DanceStyle[] = ["sway", "bounce", "spin", "armWave"];

/* ---- Figure data ---- */

interface FigureData {
  x: number; bodyType: BodyType; danceStyle: DanceStyle; row: "front" | "back";
  swayFreq: number; swayPhase: number; swayAmp: number; bouncePhase: number;
  armExcitability: number; armPhaseOffset: number; legPhaseOffset: number;
  spinSpeed: number; darkness: number;
}

const NUM_FIGURES = 14;
const STAGGER_START = 45;
const clampOpts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

function generateFigures(seed: number): FigureData[] {
  const rng = seeded(seed + 777);
  const figures: FigureData[] = [];
  for (let i = 0; i < NUM_FIGURES; i++) {
    const row: "front" | "back" = i < 8 ? "front" : "back";
    const baseX = row === "front" ? 0.06 + (i / 8) * 0.88 : 0.10 + ((i - 8) / 6) * 0.80;
    const jitter = (rng() - 0.5) * 0.06;
    figures.push({
      x: Math.max(0.03, Math.min(0.97, baseX + jitter)),
      bodyType: BODY_TYPES[Math.floor(rng() * BODY_TYPES.length)],
      danceStyle: DANCE_STYLES[Math.floor(rng() * DANCE_STYLES.length)],
      row, swayFreq: 0.012 + rng() * 0.02, swayPhase: rng() * Math.PI * 2,
      swayAmp: 3 + rng() * 6, bouncePhase: rng() * Math.PI * 2,
      armExcitability: 0.35 + rng() * 0.65, armPhaseOffset: rng() * Math.PI * 2,
      legPhaseOffset: rng() * Math.PI * 2, spinSpeed: 0.6 + rng() * 0.8,
      darkness: 0.03 + rng() * 0.08,
    });
  }
  return figures;
}

/* ---- Articulated silhouette path builder ---- */

function buildSilhouette(
  baseW: number, baseH: number, profile: BodyProfile,
  armRaise: number, armSwing: number, legBend: number, leanAngle: number,
): string {
  const w = baseW * profile.widthScale, h = baseH * profile.heightScale;
  const headR = w * profile.headRatio, neckH = h * 0.04;
  const shoulderW = w * profile.shoulderWidth, torsoH = h * profile.torsoRatio;
  const legH = h * profile.legRatio, hipW = w * profile.hipWidth;
  const armLen = h * profile.armLength;

  // Key Y positions
  const headCY = headR, neckY = headCY + headR + neckH * 0.5;
  const shoulderY = neckY + neckH, hipY = shoulderY + torsoH;
  const kneeY = hipY + legH * 0.48, footY = hipY + legH;
  const lx = leanAngle * w * 0.15; // lean offset

  // Arm angles: left/right differ via armSwing (-1..+1)
  const angL = interpolate(armRaise + armSwing * 0.3, [0, 1], [-25, -155], clampOpts);
  const angR = interpolate(armRaise - armSwing * 0.3, [0, 1], [-25, -155], clampOpts);
  const radL = (angL * Math.PI) / 180, radR = (angR * Math.PI) / 180;

  // Arm endpoints with elbow midpoint for natural curve
  const ef = 0.45; // elbow fraction
  const alEX = -shoulderW + Math.cos(radL) * armLen * ef;
  const alEY = shoulderY + Math.sin(radL) * armLen * ef;
  const alX = -shoulderW + Math.cos(radL * 0.85) * armLen;
  const alY = shoulderY + Math.sin(radL * 0.85) * armLen;
  const arEX = shoulderW + Math.cos(radR) * armLen * ef;
  const arEY = shoulderY + Math.sin(radR) * armLen * ef;
  const arX = shoulderW + Math.cos(radR * 0.85) * armLen;
  const arY = shoulderY + Math.sin(radR * 0.85) * armLen;
  const hr = w * 0.06; // hand radius

  // Leg positions with knee bend
  const ls = hipW * 0.6, kbx = legBend * w * 0.18, kby = legBend * legH * 0.06;
  const lKX = -ls * 0.5 - kbx + lx * 0.5, lKY = kneeY + kby;
  const lFX = -ls * 0.7 - kbx * 0.5 + lx * 0.3;
  const rKX = ls * 0.5 + kbx * 0.7 + lx * 0.5, rKY = kneeY - kby * 0.3;
  const rFX = ls * 0.7 + kbx * 0.3 + lx * 0.3;
  const fw = w * 0.12; // foot width
  const nw = w * 0.10; // neck width

  // Head (smooth ellipse)
  const p = [
    `M ${-headR + lx * 0.8} ${headCY}`,
    `A ${headR} ${headR * 1.05} 0 1 1 ${headR + lx * 0.8} ${headCY}`,
    `A ${headR} ${headR * 1.05} 0 1 1 ${-headR + lx * 0.8} ${headCY} Z`,
    // Body: neck -> left shoulder
    `M ${-nw + lx * 0.7} ${neckY}`,
    `Q ${-nw * 1.5 + lx * 0.6} ${shoulderY - neckH} ${-shoulderW + lx * 0.5} ${shoulderY}`,
    // Left arm out (elbow -> hand -> hand blob -> return)
    `L ${alEX + lx * 0.3} ${alEY}`,
    `Q ${(alEX + alX) * 0.5 + lx * 0.2} ${(alEY + alY) * 0.5 - 2} ${alX + lx * 0.2} ${alY}`,
    `A ${hr} ${hr} 0 1 1 ${alX + hr * 1.5 + lx * 0.2} ${alY + hr * 0.5}`,
    `A ${hr} ${hr} 0 1 1 ${alX + lx * 0.2} ${alY}`,
    `Q ${(alEX + alX) * 0.5 + lx * 0.2} ${(alEY + alY) * 0.5 + 2} ${alEX + lx * 0.3} ${alEY}`,
    `L ${-shoulderW + lx * 0.5} ${shoulderY}`,
    // Left torso (ribcage curve) -> hip
    `Q ${-shoulderW * 0.95 + lx * 0.3} ${(shoulderY + hipY) * 0.45} ${-hipW + lx * 0.2} ${hipY}`,
    // Left leg: hip -> knee -> foot (flat) -> back up
    `L ${lKX} ${lKY} L ${lFX - fw} ${footY} L ${lFX + fw} ${footY}`,
    `L ${-hipW * 0.3 + lx * 0.2} ${hipY + legH * 0.02}`,
    // Crotch crossover
    `L ${hipW * 0.3 + lx * 0.2} ${hipY + legH * 0.02}`,
    // Right leg
    `L ${rKX} ${rKY} L ${rFX - fw} ${footY} L ${rFX + fw} ${footY}`,
    `L ${hipW + lx * 0.2} ${hipY}`,
    // Right torso
    `Q ${shoulderW * 0.95 + lx * 0.3} ${(shoulderY + hipY) * 0.45} ${shoulderW + lx * 0.5} ${shoulderY}`,
    // Right arm
    `L ${arEX + lx * 0.3} ${arEY}`,
    `Q ${(arEX + arX) * 0.5 + lx * 0.2} ${(arEY + arY) * 0.5 - 2} ${arX + lx * 0.2} ${arY}`,
    `A ${hr} ${hr} 0 1 1 ${arX - hr * 1.5 + lx * 0.2} ${arY + hr * 0.5}`,
    `A ${hr} ${hr} 0 1 1 ${arX + lx * 0.2} ${arY}`,
    `Q ${(arEX + arX) * 0.5 + lx * 0.2} ${(arEY + arY) * 0.5 + 2} ${arEX + lx * 0.3} ${arEY}`,
    `L ${shoulderW + lx * 0.5} ${shoulderY}`,
    // Right neck close
    `Q ${nw * 1.5 + lx * 0.6} ${shoulderY - neckH} ${nw + lx * 0.7} ${neckY} Z`,
  ];
  return p.join(" ");
}

/* ---- Dance choreography per style ---- */

interface DanceState {
  armRaise: number; armSwing: number; legBend: number;
  leanAngle: number; extraBounce: number;
}

function computeDance(
  style: DanceStyle, musicalTime: number, energy: number,
  bass: number, beatDecay: number, tempoFactor: number, fig: FigureData,
): DanceState {
  const t = musicalTime * tempoFactor;
  const ph = fig.armPhaseOffset, lph = fig.legPhaseOffset;
  const int = Math.max(0, Math.min(1, (energy - 0.15) / 0.45)); // intensity 0-1

  switch (style) {
    case "sway": {
      const s = Math.sin(t * Math.PI * 0.5 + ph);
      return {
        armRaise: 0.15 + int * 0.45 + beatDecay * 0.15,
        armSwing: s * (0.3 + int * 0.5),
        legBend: Math.abs(s) * int * 0.25,
        leanAngle: s * (0.2 + int * 0.4),
        extraBounce: bass * 2,
      };
    }
    case "bounce": {
      const b = Math.sin(t * Math.PI + lph);
      return {
        armRaise: 0.2 + int * 0.6 + beatDecay * 0.25,
        armSwing: Math.sin(t * Math.PI * 0.25 + ph) * int * 0.3,
        legBend: Math.abs(b) * (0.2 + int * 0.5),
        leanAngle: Math.sin(t * Math.PI * 0.33 + ph) * int * 0.15,
        extraBounce: bass * 5 + beatDecay * 4,
      };
    }
    case "spin": {
      const sp = t * fig.spinSpeed + ph;
      const c = Math.sin(sp * Math.PI * 0.5);
      return {
        armRaise: 0.3 + int * 0.5 + Math.abs(c) * 0.2,
        armSwing: c * (0.5 + int * 0.4),
        legBend: (0.15 + int * 0.3) * Math.abs(Math.sin(sp * Math.PI * 0.25 + lph)),
        leanAngle: c * (0.3 + int * 0.5),
        extraBounce: bass * 3 + beatDecay * 2,
      };
    }
    case "armWave": {
      const wt = t * 0.8 + ph;
      return {
        armRaise: 0.45 + int * 0.5 + beatDecay * 0.1,
        armSwing: Math.sin(wt * Math.PI) * (0.4 + int * 0.5),
        legBend: Math.abs(Math.sin(wt * Math.PI * 0.5 + lph)) * int * 0.2,
        leanAngle: Math.sin(wt * Math.PI * 0.33) * int * 0.2,
        extraBounce: bass * 2.5 + beatDecay * 1.5,
      };
    }
  }
}

/* ---- HSL helper ---- */

function hsl(h: number, s: number, l: number, a: number): string {
  return `hsla(${h % 360}, ${Math.round(s)}%, ${Math.round(l)}%, ${a.toFixed(3)})`;
}

/* ---- Component ---- */

interface Props {
  frames: EnhancedFrameData[];
}

export const CrowdDance: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const { energy, beatDecay, musicalTime, chromaHue, bass, drumBeat, fastEnergy } = snap;

  const figures = React.useMemo(
    () => generateFigures(ctx?.showSeed ?? 19770508),
    [ctx?.showSeed],
  );

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 75], [0, 1], {
    ...clampOpts, easing: Easing.out(Easing.cubic),
  });

  // Energy gate: visible when energy > 0.20, full at 0.32
  const energyGate = interpolate(energy, [0.20, 0.32], [0, 1], clampOpts);
  const masterOpacity = energyGate * masterFade;
  if (masterOpacity < 0.01) return null;

  // Global beat bounce (sharp up, exponential settle via beatDecay)
  const bounceBase = interpolate(energy, [0.20, 0.50], [3, 14], clampOpts);
  const globalBounce = bounceBase * beatDecay;

  // Bass stomp amplifier
  const bassAmp = interpolate(bass, [0.1, 0.6], [0, 6], clampOpts);

  // Figure dimensions
  const baseW = 24, baseH = height * 0.13;

  // Neon glow intensity scales with energy
  const glowIntensity = interpolate(energy, [0.20, 0.55], [0.15, 0.8], clampOpts);
  const drumFlash = drumBeat * 0.3;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}
        style={{ opacity: masterOpacity, mixBlendMode: "screen" }}>
        <defs>
          <filter id="crowd-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={2 + glowIntensity * 3} result="blur1" />
            <feGaussianBlur in="SourceGraphic" stdDeviation={0.8} result="sharp" />
            <feMerge>
              <feMergeNode in="blur1" />
              <feMergeNode in="sharp" />
            </feMerge>
          </filter>
        </defs>

        {/* Back row renders first (behind), then front row on top */}
        {figures
          .slice()
          .sort((a, b) => (a.row === b.row ? 0 : a.row === "back" ? -1 : 1))
          .map((fig, i) => {
            const profile = BODY_PROFILES[fig.bodyType];
            const isBack = fig.row === "back";

            // Depth: back row is smaller, fainter, slightly higher
            const depthScale = isBack ? 0.65 : 1.0;
            const depthOpacity = isBack ? 0.45 : 0.75;

            const px = fig.x * width;
            const baseY = isBack ? height * 0.87 : height * 0.90;
            const figH = baseH * profile.heightScale * depthScale;
            const figW = baseW * depthScale;

            // Per-figure dance choreography
            const dance = computeDance(
              fig.danceStyle, musicalTime, energy, bass, beatDecay, tempoFactor, fig,
            );

            // Horizontal sway (tempo-scaled, energy-amplified)
            const swayX = Math.sin(
              frame * fig.swayFreq * tempoFactor + fig.swayPhase,
            ) * fig.swayAmp * (0.5 + energy);

            // Vertical bounce: global beat + dance-specific + bass stomp
            const phasedBounce =
              globalBounce * (0.5 + 0.5 * Math.sin(fig.bouncePhase)) +
              dance.extraBounce * (0.4 + 0.6 * fig.armExcitability) +
              bassAmp * (0.3 + 0.7 * Math.sin(fig.bouncePhase + 1.0));

            // Per-figure stagger entrance
            const delay = isBack ? 20 : 0;
            const staggerFade = interpolate(
              frame, [STAGGER_START + delay + i * 4, STAGGER_START + delay + i * 4 + 40],
              [0, 1], { ...clampOpts, easing: Easing.out(Easing.cubic) },
            );

            const path = buildSilhouette(
              figW, figH, profile,
              dance.armRaise, dance.armSwing, dance.legBend, dance.leanAngle,
            );

            // Dark body fill with subtle chromaHue tint
            const bodyAlpha = (0.55 + energy * 0.15 + drumFlash) * depthOpacity * staggerFade;
            const bodyLight = 4 + fig.darkness * 80 + (isBack ? 1.5 : 0);
            const bodyColor = hsl(chromaHue + 180, 15, bodyLight, bodyAlpha);

            // Neon glow outline in chromaHue (back row offset +30deg)
            const glowHue = chromaHue + (isBack ? 30 : 0);
            const glowAlpha = (glowIntensity + drumFlash) * depthOpacity * staggerFade;
            const glowColor = hsl(glowHue, 80 + energy * 15, 55 + fastEnergy * 20, glowAlpha * 0.7);

            // Warm stage rim light
            const rimAlpha = (0.06 + energy * 0.12 + beatDecay * 0.08) * depthOpacity * staggerFade;
            const rimColor = hsl(chromaHue + 40, 60, 70, rimAlpha);

            return (
              <g key={i}
                transform={`translate(${px + swayX}, ${baseY - phasedBounce - figH})`}
                opacity={staggerFade}>
                {/* Blurred neon glow */}
                <path d={path} fill="none" stroke={glowColor}
                  strokeWidth={1.5 + glowIntensity * 2} strokeLinejoin="round"
                  filter="url(#crowd-glow)" />
                {/* Solid body */}
                <path d={path} fill={bodyColor} />
                {/* Sharp neon edge */}
                <path d={path} fill="none" stroke={glowColor}
                  strokeWidth={0.6 + glowIntensity * 0.8} strokeLinejoin="round" />
                {/* Warm rim light */}
                <path d={path} fill="none" stroke={rimColor}
                  strokeWidth={0.4} strokeLinejoin="round" />
              </g>
            );
          })}
      </svg>
    </div>
  );
};
