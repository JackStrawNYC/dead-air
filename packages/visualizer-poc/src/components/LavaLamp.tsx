/**
 * LavaLamp — A+++ overlay: richly detailed 60s lava lamp with glass housing,
 * organic wax blobs, internal light refraction, and psychedelic glow.
 *
 * NOT flat CSS blobs — this is a full SVG scene with:
 *   - Metallic lamp base and cap with rivet details
 *   - Glass vessel with refraction highlights and internal caustics
 *   - 8 wax blobs with turbulence-distorted organic shapes
 *   - Internal light source casting colored caustic patterns
 *   - Radial glow halo around the lamp
 *   - Heat shimmer rising from the base
 *   - Film grain + ink wash via psychedelic filter library
 *
 * Audio reactivity:
 *   slowEnergy → wax rise speed + glow intensity
 *   energy     → blob morph rate + color saturation
 *   bass       → blob size pulse + base vibration
 *   beatDecay  → light flicker + caustic pulse
 *   chromaHue  → wax color palette shift
 *   tempoFactor → overall animation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { PsychedelicDefs, FILTER_IDS, PATTERN_IDS, NoiseLayer } from "./psychedelic-filters";

const NUM_BLOBS = 8;
const CAUSTIC_COUNT = 12;

interface WaxBlob {
  /** Base vertical position (0=bottom, 1=top) in the glass */
  baseY: number;
  /** Horizontal offset from center (-1 to 1) */
  xOffset: number;
  /** Base radius as fraction of glass width */
  radius: number;
  /** Vertical drift speed */
  riseSpeed: number;
  /** Morph frequency */
  morphFreq: number;
  /** Phase offset */
  phase: number;
  /** Hue offset from base palette */
  hueOffset: number;
}

interface Caustic {
  x: number;
  y: number;
  rx: number;
  ry: number;
  phase: number;
  speed: number;
}

function buildBlobs(): WaxBlob[] {
  const rng = seeded(19670114);
  return Array.from({ length: NUM_BLOBS }, () => ({
    baseY: rng(),
    xOffset: (rng() - 0.5) * 1.4,
    radius: 0.08 + rng() * 0.12,
    riseSpeed: 0.0006 + rng() * 0.0015,
    morphFreq: 0.015 + rng() * 0.025,
    phase: rng() * Math.PI * 2,
    hueOffset: rng() * 60 - 30,
  }));
}

function buildCaustics(): Caustic[] {
  const rng = seeded(42_991_337);
  return Array.from({ length: CAUSTIC_COUNT }, () => ({
    x: 0.2 + rng() * 0.6,
    y: 0.15 + rng() * 0.7,
    rx: 3 + rng() * 8,
    ry: 2 + rng() * 5,
    phase: rng() * Math.PI * 2,
    speed: 0.008 + rng() * 0.015,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const LavaLamp: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const blobs = React.useMemo(buildBlobs, []);
  const caustics = React.useMemo(buildCaustics, []);

  // Fade in
  const masterFade = interpolate(frame, [60, 150], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Overall opacity: always present at 12-30%, energy adds intensity
  const baseOpacity = interpolate(snap.slowEnergy, [0.02, 0.3], [0.12, 0.30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = baseOpacity * masterFade;
  if (opacity < 0.01) return null;

  // Audio drives
  const riseMultiplier = interpolate(snap.slowEnergy, [0.03, 0.35], [0.5, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const morphRate = interpolate(snap.energy, [0.03, 0.35], [0.6, 1.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const blobPulse = 1 + snap.bass * 0.25 + snap.beatDecay * 0.15;
  const glowIntensity = interpolate(snap.slowEnergy, [0.02, 0.3], [0.3, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const causticBright = 0.15 + snap.beatDecay * 0.25 + snap.energy * 0.15;

  // Color palette — psychedelic warm shifted by chromaHue
  const baseHue = 320; // magenta base
  const hueShift = snap.chromaHue - 180;
  const h = ((baseHue + hueShift * 0.4) % 360 + 360) % 360;

  // ─── LAMP GEOMETRY (viewBox 0 0 200 500) ─────────────────────────
  // Lamp is centered, takes ~30% of screen width
  const lampScale = Math.min(width, height) * 0.4;
  const vbW = 200;
  const vbH = 500;

  // Glass vessel bounds (inside the viewBox)
  const glassLeft = 55;
  const glassRight = 145;
  const glassTop = 60;
  const glassBottom = 390;
  const glassWidth = glassRight - glassLeft;
  const glassHeight = glassBottom - glassTop;
  const glassCX = (glassLeft + glassRight) / 2;

  const t = frame * tempoFactor;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        mixBlendMode: "screen",
      }}
    >
      <svg
        width={lampScale}
        height={lampScale * (vbH / vbW)}
        viewBox={`0 0 ${vbW} ${vbH}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <PsychedelicDefs
            prefix="ll"
            frame={frame}
            energy={snap.energy}
            bass={snap.bass}
            beatDecay={snap.beatDecay}
            turbulenceFreq={0.015}
            include={["organicDistort", "liquidDistort", "glowBleed", "filmGrain"]}
          />

          {/* Glass vessel clip path — rounded rectangle */}
          <clipPath id="ll-glass-clip">
            <path d={`
              M ${glassLeft + 8} ${glassTop}
              Q ${glassLeft} ${glassTop} ${glassLeft} ${glassTop + 15}
              L ${glassLeft - 4} ${glassBottom - 20}
              Q ${glassLeft - 4} ${glassBottom} ${glassLeft + 12} ${glassBottom}
              L ${glassRight - 12} ${glassBottom}
              Q ${glassRight + 4} ${glassBottom} ${glassRight + 4} ${glassBottom - 20}
              L ${glassRight} ${glassTop + 15}
              Q ${glassRight} ${glassTop} ${glassRight - 8} ${glassTop}
              Z
            `} />
          </clipPath>

          {/* Internal light gradient — hot bottom to cool top */}
          <linearGradient id="ll-inner-light" x1="50%" y1="100%" x2="50%" y2="0%">
            <stop offset="0%" stopColor={`hsl(${h}, 80%, 55%)`} stopOpacity={0.6} />
            <stop offset="40%" stopColor={`hsl(${(h + 30) % 360}, 70%, 40%)`} stopOpacity={0.3} />
            <stop offset="100%" stopColor={`hsl(${(h + 60) % 360}, 50%, 20%)`} stopOpacity={0.1} />
          </linearGradient>

          {/* Glass refraction highlight */}
          <linearGradient id="ll-glass-highlight" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="15%" stopColor="rgba(255,255,255,0.25)" />
            <stop offset="25%" stopColor="rgba(255,255,255,0.04)" />
            <stop offset="75%" stopColor="rgba(255,255,255,0)" />
            <stop offset="88%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          {/* Metal base gradient */}
          <linearGradient id="ll-metal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2a1a0a" />
            <stop offset="25%" stopColor="#6b4a2a" />
            <stop offset="50%" stopColor="#8a6a42" />
            <stop offset="75%" stopColor="#6b4a2a" />
            <stop offset="100%" stopColor="#2a1a0a" />
          </linearGradient>

          {/* Radial glow behind lamp */}
          <radialGradient id="ll-halo" cx="50%" cy="55%">
            <stop offset="0%" stopColor={`hsl(${h}, 70%, 55%)`} stopOpacity={0.35 * glowIntensity} />
            <stop offset="50%" stopColor={`hsl(${(h + 20) % 360}, 55%, 40%)`} stopOpacity={0.12 * glowIntensity} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* Wax blob glow filter */}
          <filter id="ll-wax-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={3 + snap.energy * 4} />
          </filter>

          {/* Wax blob inner blur for organic shape */}
          <filter id="ll-wax-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>

        {/* ============ HALO GLOW behind lamp ============ */}
        <ellipse
          cx={glassCX} cy={glassTop + glassHeight * 0.5}
          rx={glassWidth * 1.2} ry={glassHeight * 0.7}
          fill="url(#ll-halo)"
        />

        {/* ============ LAMP BASE (metallic) ============ */}
        <g filter={`url(#${FILTER_IDS.organicDistort("ll")})`}>
          {/* Base cone */}
          <path d={`
            M ${glassCX - 50} ${glassBottom + 8}
            L ${glassCX - 35} ${vbH - 20}
            Q ${glassCX - 35} ${vbH - 8} ${glassCX - 25} ${vbH - 8}
            L ${glassCX + 25} ${vbH - 8}
            Q ${glassCX + 35} ${vbH - 8} ${glassCX + 35} ${vbH - 20}
            L ${glassCX + 50} ${glassBottom + 8}
            Z
          `} fill="url(#ll-metal)" />
          {/* Base rim */}
          <ellipse cx={glassCX} cy={glassBottom + 8} rx={50} ry={5}
            fill="#8a6a42" stroke="#4a2a0a" strokeWidth={0.8} />
          {/* Rivet details */}
          {[0.25, 0.5, 0.75].map((t, i) => (
            <circle key={`rivet-${i}`}
              cx={glassCX - 30 + i * 30}
              cy={glassBottom + 8 + (vbH - 8 - glassBottom - 8) * t}
              r={1.5}
              fill="#a08050" stroke="#4a2a0a" strokeWidth={0.4} />
          ))}
          {/* Bottom foot ring */}
          <ellipse cx={glassCX} cy={vbH - 8} rx={28} ry={4}
            fill="#6b4a2a" stroke="#3a1a0a" strokeWidth={0.6} />
        </g>

        {/* ============ CAP (metallic top) ============ */}
        <g filter={`url(#${FILTER_IDS.organicDistort("ll")})`}>
          <path d={`
            M ${glassCX - 42} ${glassTop - 2}
            Q ${glassCX - 42} ${glassTop - 18} ${glassCX - 20} ${glassTop - 22}
            L ${glassCX + 20} ${glassTop - 22}
            Q ${glassCX + 42} ${glassTop - 18} ${glassCX + 42} ${glassTop - 2}
            Z
          `} fill="url(#ll-metal)" />
          {/* Cap knob */}
          <circle cx={glassCX} cy={glassTop - 26} r={6}
            fill="#8a6a42" stroke="#4a2a0a" strokeWidth={0.8} />
          <circle cx={glassCX - 1.5} cy={glassTop - 27.5} r={1.5}
            fill="#c0a878" opacity={0.5} />
          {/* Cap rim */}
          <ellipse cx={glassCX} cy={glassTop - 2} rx={42} ry={4}
            fill="#7a5a32" stroke="#4a2a0a" strokeWidth={0.6} />
        </g>

        {/* ============ GLASS VESSEL ============ */}
        {/* Outer glass shape */}
        <path d={`
          M ${glassLeft + 8} ${glassTop}
          Q ${glassLeft} ${glassTop} ${glassLeft} ${glassTop + 15}
          L ${glassLeft - 4} ${glassBottom - 20}
          Q ${glassLeft - 4} ${glassBottom} ${glassLeft + 12} ${glassBottom}
          L ${glassRight - 12} ${glassBottom}
          Q ${glassRight + 4} ${glassBottom} ${glassRight + 4} ${glassBottom - 20}
          L ${glassRight} ${glassTop + 15}
          Q ${glassRight} ${glassTop} ${glassRight - 8} ${glassTop}
          Z
        `} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" strokeWidth={0.8} />

        {/* Internal light fill */}
        <g clipPath="url(#ll-glass-clip)">
          <rect x={glassLeft - 4} y={glassTop} width={glassWidth + 8} height={glassHeight}
            fill="url(#ll-inner-light)" />

          {/* ---- CAUSTIC light patterns ---- */}
          {caustics.map((c, i) => {
            const cx = glassLeft + c.x * glassWidth;
            const cy = glassTop + c.y * glassHeight;
            const flicker = 0.5 + Math.sin(t * c.speed + c.phase) * 0.5;
            const drift = Math.sin(t * c.speed * 0.7 + c.phase) * 6;
            return (
              <ellipse key={`caustic-${i}`}
                cx={cx + drift} cy={cy}
                rx={c.rx * (0.8 + snap.beatDecay * 0.5)}
                ry={c.ry * (0.8 + snap.beatDecay * 0.4)}
                fill={`hsl(${(h + i * 25) % 360}, 70%, 65%)`}
                opacity={causticBright * flicker}
                transform={`rotate(${t * c.speed * 20 + i * 30} ${cx} ${cy})`}
              />
            );
          })}

          {/* ---- WAX BLOBS — organic turbulence-distorted shapes ---- */}
          <g filter={`url(#${FILTER_IDS.liquidDistort("ll")})`}>
            {blobs.map((blob, i) => {
              // Vertical oscillation: blobs rise and fall like real lava
              const riseT = (blob.baseY + t * blob.riseSpeed * riseMultiplier) % 1;
              // Slow sinusoidal rise with gravity return at top
              const yNorm = riseT < 0.85
                ? riseT / 0.85
                : 1 - (riseT - 0.85) / 0.15 * 0.3;
              const by = glassBottom - 20 - yNorm * (glassHeight - 40);

              // Horizontal drift
              const bx = glassCX + blob.xOffset * (glassWidth * 0.3) +
                Math.sin(t * blob.morphFreq * morphRate + blob.phase) * 12;

              // Blob size: pulses with bass, stretches while rising
              const stretchY = 1 + Math.abs(blob.riseSpeed) * riseMultiplier * 120;
              const r = glassWidth * blob.radius * blobPulse;

              // Morph the blob shape with 4 lobes
              const m1 = r * (1.0 + Math.sin(t * blob.morphFreq + blob.phase) * 0.3);
              const m2 = r * (1.0 + Math.cos(t * blob.morphFreq * 0.8 + blob.phase * 1.3) * 0.25);
              const m3 = r * (1.0 + Math.sin(t * blob.morphFreq * 1.2 + blob.phase * 0.7) * 0.35);
              const m4 = r * (1.0 + Math.cos(t * blob.morphFreq * 0.6 + blob.phase * 2.1) * 0.2);

              const blobHue = (h + blob.hueOffset + t * 0.08) % 360;
              const sat = 75 + snap.energy * 20;
              const lit = 48 + snap.energy * 18;

              return (
                <g key={`blob-${i}`}>
                  {/* Glow aura behind blob */}
                  <ellipse cx={bx} cy={by} rx={m1 * 1.8} ry={m2 * 1.8 * stretchY}
                    fill={`hsl(${blobHue}, ${sat}%, ${lit}%)`}
                    opacity={0.15 * glowIntensity}
                    filter="url(#ll-wax-glow)" />
                  {/* Main blob body — organic 4-point shape */}
                  <path d={`
                    M ${bx} ${by - m2 * stretchY}
                    C ${bx + m1 * 0.8} ${by - m2 * stretchY * 0.6}
                      ${bx + m3} ${by - m4 * 0.2}
                      ${bx + m3} ${by}
                    C ${bx + m3} ${by + m4 * 0.3}
                      ${bx + m1 * 0.7} ${by + m2 * stretchY * 0.7}
                      ${bx} ${by + m2 * stretchY}
                    C ${bx - m1 * 0.7} ${by + m2 * stretchY * 0.7}
                      ${bx - m3} ${by + m4 * 0.3}
                      ${bx - m3} ${by}
                    C ${bx - m3} ${by - m4 * 0.2}
                      ${bx - m1 * 0.8} ${by - m2 * stretchY * 0.6}
                      ${bx} ${by - m2 * stretchY}
                    Z
                  `}
                    fill={`hsl(${blobHue}, ${sat}%, ${lit}%)`}
                    opacity={0.75 + snap.energy * 0.2}
                    filter="url(#ll-wax-soft)"
                  />
                  {/* Inner highlight — hot core */}
                  <ellipse cx={bx - r * 0.15} cy={by - r * 0.2}
                    rx={m1 * 0.4} ry={m2 * 0.35 * stretchY}
                    fill={`hsl(${blobHue}, ${Math.min(100, sat + 15)}%, ${lit + 20}%)`}
                    opacity={0.4 + snap.beatDecay * 0.2} />
                </g>
              );
            })}
          </g>

          {/* ---- Heat shimmer at base ---- */}
          <g filter={`url(#${FILTER_IDS.liquidDistort("ll")})`} opacity={0.12 + snap.slowEnergy * 0.15}>
            {Array.from({ length: 5 }, (_, i) => {
              const shimX = glassLeft + 10 + i * (glassWidth / 5);
              const shimY = glassBottom - 15 - Math.sin(t * 0.02 + i * 1.3) * 8;
              return (
                <ellipse key={`shim-${i}`}
                  cx={shimX} cy={shimY}
                  rx={6 + snap.energy * 4} ry={15 + snap.energy * 8}
                  fill={`hsl(${(h + 10) % 360}, 65%, 55%)`}
                  opacity={0.2 + Math.sin(t * 0.03 + i) * 0.1} />
              );
            })}
          </g>
        </g>

        {/* Glass refraction highlight — vertical strip */}
        <path d={`
          M ${glassLeft + 8} ${glassTop + 5}
          L ${glassLeft + 2} ${glassBottom - 25}
          L ${glassLeft + 18} ${glassBottom - 25}
          L ${glassLeft + 22} ${glassTop + 5}
          Z
        `} fill="rgba(255,255,255,0.14)" />
        {/* Secondary thin highlight on right side */}
        <path d={`
          M ${glassRight - 10} ${glassTop + 10}
          L ${glassRight + 1} ${glassBottom - 30}
          L ${glassRight - 4} ${glassBottom - 30}
          L ${glassRight - 6} ${glassTop + 10}
          Z
        `} fill="rgba(255,255,255,0.06)" />

        {/* Film grain over entire lamp */}
        <NoiseLayer width={vbW} height={vbH}
          filterId={PATTERN_IDS.noiseTexture("ll")}
          opacity={0.04 + snap.beatDecay * 0.03}
          blendMode="overlay" />
      </svg>
    </div>
  );
};
