/**
 * MushroomForest — A+++ psychedelic mushroom forest + skeleton crowd overlay.
 *
 * Rich mushroom forest across the bottom third with 3 depth layers (far/mid/close),
 * domed caps with gradient fills, gill detail, stem annulus rings, cap spots,
 * bioluminescent underglow, spore particles, ground vegetation (moss, ferns, leaves),
 * and an upgraded skeleton crowd with detailed skulls.
 *
 * Audio mapping:
 *   spaceScore  → mushroom visibility (quiet = more mushrooms)
 *   energy      → skeleton crowd intensity
 *   chromaHue   → bioluminescent glow tint + skull color
 *   beatDecay   → spore particle pulse + skull bob
 *   bass        → skull bob amplitude
 *   highs       → spore sparkle brightness
 *   timbralBrightness → cap spot luminosity
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

// ── TYPES ──────────────────────────────────────────────────────

interface MushroomData {
  x: number;          // 0-1 horizontal position
  height: number;     // base stem height in px
  capWidth: number;   // cap dome radius
  stemWidth: number;  // stem thickness
  capHue: number;     // base hue for gradient
  lean: number;       // tilt degrees
  spotCount: number;  // spots on cap
  layer: 0 | 1 | 2;  // 0=far, 1=mid, 2=close
  gillCount: number;  // radiating gill lines under cap
  hasRing: boolean;   // annulus ring on stem
  ringPos: number;    // 0-1 position along stem for ring
  glowRadius: number; // bioluminescent underglow radius factor
}

interface SporeData {
  x: number;       // 0-1 horizontal
  baseY: number;   // starting Y in 0-1 (bottom-relative)
  speed: number;    // upward drift speed
  size: number;     // particle radius
  phase: number;    // animation phase offset
  drift: number;    // horizontal drift amplitude
  hue: number;      // glow hue
  brightness: number;
}

interface FernData {
  x: number;
  size: number;
  lean: number;
  fronds: number;
  hue: number;
}

interface LeafData {
  x: number;
  y: number;
  size: number;
  rotation: number;
  hue: number;
  shape: number; // 0-1 round vs elongated
}

interface SkullData {
  x: number;
  size: number;
  bobPhase: number;
  bobSpeed: number;
  jawOpen: number;   // 0-1 how much jaw separates
  teethCount: number;
  eyeSize: number;   // relative eye socket size
  tiltBias: number;  // lean preference
}

// ── CONSTANTS ──────────────────────────────────────────────────

const GROW_FRAMES = 180;
const NUM_MUSHROOMS = 14;
const NUM_SPORES = 18;
const NUM_FERNS = 8;
const NUM_LEAVES = 12;
const NUM_SKULLS = 16;

// Depth layer config: [scale, opacity, yOffset from bottom]
const LAYER_CONFIG: Record<0 | 1 | 2, { scale: number; opacity: number; yBias: number }> = {
  0: { scale: 0.45, opacity: 0.35, yBias: 0.02 },  // far — small, dim, high
  1: { scale: 0.72, opacity: 0.6, yBias: 0.06 },    // mid
  2: { scale: 1.0, opacity: 0.85, yBias: 0.12 },    // close — large, bright, low
};

// ── GENERATORS ─────────────────────────────────────────────────

function generateMushrooms(seed: number): MushroomData[] {
  const rng = seeded(seed);
  // Distribute across 3 layers: 4 far, 5 mid, 5 close
  const layerAssignments: (0 | 1 | 2)[] = [0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2];
  return Array.from({ length: NUM_MUSHROOMS }, (_, i) => ({
    x: 0.04 + rng() * 0.92,
    height: 70 + rng() * 110,
    capWidth: 28 + rng() * 45,
    stemWidth: 7 + rng() * 12,
    capHue: rng() * 360,
    lean: (rng() - 0.5) * 18,
    spotCount: 3 + Math.floor(rng() * 5),
    layer: layerAssignments[i],
    gillCount: 5 + Math.floor(rng() * 6),
    hasRing: rng() > 0.3,
    ringPos: 0.35 + rng() * 0.3,
    glowRadius: 0.3 + rng() * 0.4,
  }));
}

function generateSpores(seed: number): SporeData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_SPORES }, () => ({
    x: 0.05 + rng() * 0.9,
    baseY: 0.55 + rng() * 0.35,
    speed: 0.4 + rng() * 0.8,
    size: 1.2 + rng() * 2.5,
    phase: rng() * Math.PI * 2,
    drift: 8 + rng() * 20,
    hue: rng() * 360,
    brightness: 0.5 + rng() * 0.5,
  }));
}

function generateFerns(seed: number): FernData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_FERNS }, () => ({
    x: 0.02 + rng() * 0.96,
    size: 18 + rng() * 30,
    lean: (rng() - 0.5) * 35,
    fronds: 3 + Math.floor(rng() * 4),
    hue: 90 + rng() * 60,  // green range
  }));
}

function generateLeaves(seed: number): LeafData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_LEAVES }, () => ({
    x: 0.05 + rng() * 0.9,
    y: 0.88 + rng() * 0.1,
    size: 4 + rng() * 8,
    rotation: rng() * 360,
    hue: 20 + rng() * 50,  // autumn tones
    shape: rng(),
  }));
}

function generateSkulls(seed: number): SkullData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_SKULLS }, () => ({
    x: rng(),
    size: 22 + rng() * 20,
    bobPhase: rng() * Math.PI * 2,
    bobSpeed: 3 + rng() * 4,
    jawOpen: 0.1 + rng() * 0.4,
    teethCount: 4 + Math.floor(rng() * 4),
    eyeSize: 0.12 + rng() * 0.08,
    tiltBias: (rng() - 0.5) * 6,
  }));
}

// ── SVG DEFS ───────────────────────────────────────────────────

const MushroomDefs: React.FC<{ chromaHue: number }> = ({ chromaHue }) => (
  <defs>
    {/* Bioluminescent glow filter */}
    <filter id="bioGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
    </filter>
    <filter id="bioGlowLarge" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="10" />
    </filter>
    <filter id="sporeGlow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
    </filter>
    <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
    </filter>
    {/* Moss texture pattern */}
    <pattern id="mossPattern" x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
      <rect width="12" height="12" fill={`hsl(${110 + chromaHue * 0.1}, 40%, 18%)`} />
      <circle cx="3" cy="3" r="2" fill={`hsl(${115 + chromaHue * 0.1}, 50%, 22%)`} opacity="0.6" />
      <circle cx="9" cy="8" r="1.5" fill={`hsl(${105 + chromaHue * 0.1}, 45%, 25%)`} opacity="0.5" />
      <circle cx="6" cy="11" r="1" fill={`hsl(${120 + chromaHue * 0.1}, 55%, 20%)`} opacity="0.4" />
    </pattern>
  </defs>
);

// ── GROUND LAYER ───────────────────────────────────────────────

const GroundLayer: React.FC<{
  width: number;
  height: number;
  growPhase: number;
  chromaHue: number;
  frame: number;
  tempoFactor: number;
}> = ({ width, height, growPhase, chromaHue, frame, tempoFactor }) => {
  const groundY = height * 0.88;
  const groundH = height * 0.12;
  const ferns = React.useMemo(() => generateFerns(7891), []);
  const leaves = React.useMemo(() => generateLeaves(3456), []);

  return (
    <g opacity={growPhase}>
      {/* Mossy ground strip */}
      <rect
        x={0}
        y={groundY}
        width={width}
        height={groundH}
        fill="url(#mossPattern)"
        opacity={0.5 * growPhase}
      />

      {/* Undulating moss mounds */}
      {[0.08, 0.22, 0.38, 0.55, 0.72, 0.88].map((pos, i) => {
        const cx = pos * width;
        const sway = Math.sin(frame * 0.008 * tempoFactor + i * 1.7) * 3;
        return (
          <ellipse
            key={`moss-${i}`}
            cx={cx + sway}
            cy={groundY + 4}
            rx={30 + i * 8}
            ry={6 + i * 2}
            fill={`hsl(${108 + chromaHue * 0.05 + i * 5}, 45%, ${18 + i * 2}%)`}
            opacity={0.4 * growPhase}
          />
        );
      })}

      {/* Fallen leaves */}
      {leaves.map((leaf, i) => {
        const lx = leaf.x * width;
        const ly = leaf.y * height;
        const rot = leaf.rotation + Math.sin(frame * 0.01 + i) * 3;
        const rx = leaf.size * (0.6 + leaf.shape * 0.4);
        const ry = leaf.size * (0.3 + (1 - leaf.shape) * 0.3);
        return (
          <ellipse
            key={`leaf-${i}`}
            cx={lx}
            cy={ly}
            rx={rx * growPhase}
            ry={ry * growPhase}
            fill={`hsl(${leaf.hue + chromaHue * 0.1}, 55%, 30%)`}
            opacity={0.35 * growPhase}
            transform={`rotate(${rot} ${lx} ${ly})`}
          />
        );
      })}

      {/* Ferns */}
      {ferns.map((fern, i) => {
        const fx = fern.x * width;
        const fy = groundY + 2;
        const sway = Math.sin(frame * 0.015 * tempoFactor + i * 2.3) * 4;
        const fernScale = growPhase * LAYER_CONFIG[1].scale;

        return (
          <g key={`fern-${i}`} transform={`translate(${fx + sway}, ${fy}) rotate(${fern.lean * growPhase * 0.5})`}>
            {/* Fern stem */}
            <line
              x1={0} y1={0}
              x2={0} y2={-fern.size * fernScale}
              stroke={`hsl(${fern.hue}, 50%, 25%)`}
              strokeWidth={1.5}
              opacity={0.5}
            />
            {/* Fronds — alternating leaf pairs along stem */}
            {Array.from({ length: fern.fronds }, (_, j) => {
              const fPos = (j + 1) / (fern.fronds + 1);
              const fY = -fern.size * fPos * fernScale;
              const fLen = fern.size * 0.4 * (1 - fPos * 0.5) * fernScale;
              const angle = 35 + j * 5;
              return (
                <g key={j}>
                  {/* Left frond */}
                  <line
                    x1={0} y1={fY}
                    x2={-fLen * Math.cos(angle * Math.PI / 180)}
                    y2={fY - fLen * Math.sin(angle * Math.PI / 180) * 0.5}
                    stroke={`hsl(${fern.hue + j * 3}, 55%, ${28 + j * 2}%)`}
                    strokeWidth={1.2}
                    opacity={0.45}
                  />
                  {/* Right frond */}
                  <line
                    x1={0} y1={fY}
                    x2={fLen * Math.cos(angle * Math.PI / 180)}
                    y2={fY - fLen * Math.sin(angle * Math.PI / 180) * 0.5}
                    stroke={`hsl(${fern.hue + j * 3}, 55%, ${28 + j * 2}%)`}
                    strokeWidth={1.2}
                    opacity={0.45}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
};

// ── SINGLE MUSHROOM ────────────────────────────────────────────

const Mushroom: React.FC<{
  m: MushroomData;
  idx: number;
  width: number;
  height: number;
  growPhase: number;
  chromaHue: number;
  beatDecay: number;
  timbralBrightness: number;
  frame: number;
  tempoFactor: number;
}> = ({ m, idx, width, height, growPhase, chromaHue, beatDecay, timbralBrightness, frame, tempoFactor }) => {
  const layer = LAYER_CONFIG[m.layer];
  const scale = layer.scale;
  const layerOpacity = layer.opacity;

  const x = m.x * width;
  const baseY = height - height * layer.yBias;

  const mHeight = m.height * scale * growPhase;
  const capW = m.capWidth * scale * growPhase;
  const capH = capW * 0.55;
  const stemW = m.stemWidth * scale;

  // Hue modulated by chromaHue — each mushroom gets a shifted hue
  const hue = (m.capHue + chromaHue * 0.6 + idx * 25) % 360;
  const capColorDark = `hsl(${hue}, 70%, 25%)`;
  const capColorMid = `hsl(${hue}, 75%, 45%)`;
  const capColorLight = `hsl(${hue}, 65%, 60%)`;
  const stemColor = `hsl(${(hue + 30) % 360}, 25%, 65%)`;
  const stemColorDark = `hsl(${(hue + 30) % 360}, 20%, 45%)`;
  const gillColor = `hsl(${(hue + 10) % 360}, 50%, 35%)`;
  const spotLum = 55 + timbralBrightness * 25;
  const spotColor = `hsl(${(hue + 180) % 360}, 60%, ${spotLum}%)`;

  // Bioluminescent glow color — tinted by chromaHue
  const glowHue = (chromaHue + idx * 30) % 360;
  const glowPulse = 0.3 + beatDecay * 0.5;
  const glowColor = `hsla(${glowHue}, 80%, 60%, ${glowPulse * layerOpacity})`;

  // Gentle sway — far layers sway less (parallax)
  const sway = Math.sin(frame * 0.025 * tempoFactor + idx * 1.9) * (4 + scale * 4) * growPhase;

  // Unique gradient IDs per mushroom
  const capGradId = `capGrad-${idx}`;
  const stemGradId = `stemGrad-${idx}`;
  const glowGradId = `glowGrad-${idx}`;

  return (
    <g transform={`translate(${x + sway}, ${baseY}) rotate(${m.lean * growPhase * 0.7})`} opacity={layerOpacity}>
      {/* Gradient defs for this mushroom */}
      <defs>
        <radialGradient id={capGradId} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor={capColorDark} />
          <stop offset="50%" stopColor={capColorMid} />
          <stop offset="100%" stopColor={capColorLight} />
        </radialGradient>
        <linearGradient id={stemGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={stemColorDark} />
          <stop offset="40%" stopColor={stemColor} />
          <stop offset="100%" stopColor={stemColorDark} />
        </linearGradient>
        <radialGradient id={glowGradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={glowColor} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      {/* === STEM === */}
      {/* Main stem body — rounded rect */}
      <rect
        x={-stemW / 2}
        y={-mHeight}
        width={stemW}
        height={mHeight}
        rx={stemW / 2}
        fill={`url(#${stemGradId})`}
      />
      {/* Stem surface detail — slight taper line */}
      <line
        x1={0} y1={-mHeight * 0.15}
        x2={0} y2={-mHeight * 0.85}
        stroke={stemColorDark}
        strokeWidth={0.6}
        opacity={0.25}
      />

      {/* === ANNULUS / RING on stem === */}
      {m.hasRing && (
        <g>
          <ellipse
            cx={0}
            cy={-mHeight * m.ringPos}
            rx={stemW * 0.9}
            ry={3 * scale}
            fill={stemColor}
            opacity={0.6}
          />
          <ellipse
            cx={0}
            cy={-mHeight * m.ringPos - 1.5 * scale}
            rx={stemW * 0.75}
            ry={2 * scale}
            fill={stemColorDark}
            opacity={0.3}
          />
        </g>
      )}

      {/* === BIOLUMINESCENT UNDERGLOW === */}
      {/* Large soft glow emanating from under the cap */}
      <ellipse
        cx={0}
        cy={-mHeight + capH * 0.3}
        rx={capW * m.glowRadius * 1.4}
        ry={capH * 0.7}
        fill={`url(#${glowGradId})`}
        filter="url(#bioGlowLarge)"
      />
      {/* Tighter bright core glow */}
      <ellipse
        cx={0}
        cy={-mHeight + capH * 0.15}
        rx={capW * m.glowRadius * 0.6}
        ry={capH * 0.35}
        fill={glowColor}
        filter="url(#bioGlow)"
        opacity={glowPulse * 0.6}
      />

      {/* === GILLS — radiating lines under cap === */}
      {Array.from({ length: m.gillCount }, (_, j) => {
        const angle = Math.PI + (j / (m.gillCount - 1)) * Math.PI; // half-circle underneath
        const innerR = stemW * 0.6;
        const outerR = capW * 0.45;
        const gillY = -mHeight + capH * 0.25;
        return (
          <line
            key={`gill-${j}`}
            x1={Math.cos(angle) * innerR}
            y1={gillY + Math.sin(angle) * 2}
            x2={Math.cos(angle) * outerR}
            y2={gillY + Math.sin(angle) * capH * 0.2}
            stroke={gillColor}
            strokeWidth={0.8 * scale}
            opacity={0.4}
          />
        );
      })}
      {/* Gill rim — curved underside of cap */}
      <ellipse
        cx={0}
        cy={-mHeight + capH * 0.3}
        rx={capW * 0.46}
        ry={capH * 0.12}
        fill="none"
        stroke={gillColor}
        strokeWidth={0.8 * scale}
        opacity={0.35}
      />

      {/* === CAP — domed with gradient === */}
      <ellipse
        cx={0}
        cy={-mHeight}
        rx={capW / 2}
        ry={capH / 2}
        fill={`url(#${capGradId})`}
      />
      {/* Cap highlight — specular gloss */}
      <ellipse
        cx={-capW * 0.12}
        cy={-mHeight - capH * 0.12}
        rx={capW * 0.18}
        ry={capH * 0.15}
        fill="white"
        opacity={0.08 + timbralBrightness * 0.06}
      />

      {/* === SPOTS on cap === */}
      {Array.from({ length: m.spotCount }, (_, j) => {
        const rng = seeded(idx * 100 + j * 7);
        const spotAngle = (j / m.spotCount) * Math.PI * 1.6 - Math.PI * 0.3 + (rng() - 0.5) * 0.4;
        const spotDist = capW * 0.2 + rng() * capW * 0.12;
        const spotR = (2 + rng() * 3.5) * scale;
        return (
          <circle
            key={`spot-${j}`}
            cx={Math.cos(spotAngle) * spotDist * growPhase * 0.5}
            cy={-mHeight + Math.sin(spotAngle) * capH * 0.22 * growPhase}
            r={spotR * growPhase}
            fill={spotColor}
            opacity={0.5 + timbralBrightness * 0.2}
          />
        );
      })}

      {/* === STEM BASE — flared bottom === */}
      <ellipse
        cx={0}
        cy={-1}
        rx={stemW * 0.7}
        ry={3 * scale}
        fill={stemColorDark}
        opacity={0.4}
      />
    </g>
  );
};

// ── SPORE PARTICLES ────────────────────────────────────────────

const SporeParticles: React.FC<{
  width: number;
  height: number;
  chromaHue: number;
  beatDecay: number;
  highs: number;
  frame: number;
  tempoFactor: number;
  growPhase: number;
}> = ({ width, height, chromaHue, beatDecay, highs, frame, tempoFactor, growPhase }) => {
  const spores = React.useMemo(() => generateSpores(9999), []);

  return (
    <g opacity={growPhase * 0.8}>
      {spores.map((s, i) => {
        // Continuous upward float — loops every ~600 frames per spore
        const cycleLen = 300 + i * 40;
        const t = ((frame * s.speed * tempoFactor + s.phase * 100) % cycleLen) / cycleLen;

        const sx = s.x * width + Math.sin(frame * 0.02 * tempoFactor + s.phase) * s.drift;
        const sy = height * s.baseY - t * height * 0.45; // float upward

        // Beat pulse makes spores brighten and grow
        const pulse = 1 + beatDecay * 0.8;
        const sparkle = 0.3 + highs * 0.4 + beatDecay * 0.3;
        const r = s.size * pulse * (0.5 + t * 0.5); // grow slightly as they rise

        const hue = (s.hue + chromaHue * 0.8) % 360;

        // Fade in near bottom, fade out near top
        const fadeIn = interpolate(t, [0, 0.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const fadeOut = interpolate(t, [0.8, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const alpha = fadeIn * fadeOut * sparkle * s.brightness;

        return (
          <g key={`spore-${i}`}>
            {/* Outer glow */}
            <circle
              cx={sx}
              cy={sy}
              r={r * 2.5}
              fill={`hsla(${hue}, 70%, 65%, ${alpha * 0.2})`}
              filter="url(#sporeGlow)"
            />
            {/* Core bright dot */}
            <circle
              cx={sx}
              cy={sy}
              r={r}
              fill={`hsla(${hue}, 80%, 80%, ${alpha})`}
            />
          </g>
        );
      })}
    </g>
  );
};

// ── MUSHROOM FOREST OVERLAY ────────────────────────────────────

const MushroomForestOverlay: React.FC<{
  width: number;
  height: number;
  energy: number;
  chromaHue: number;
  spaceScore: number;
  beatDecay: number;
  highs: number;
  timbralBrightness: number;
  tempoFactor: number;
  frame: number;
}> = ({ width, height, energy, chromaHue, spaceScore, beatDecay, highs, timbralBrightness, tempoFactor, frame }) => {
  // Mushrooms prefer quieter/spacey moments
  const quietEnergy = Math.max(
    spaceScore,
    1 - interpolate(energy, [0.05, 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  if (quietEnergy < 0.15) return null;

  const mushrooms = React.useMemo(() => generateMushrooms(420), []);

  const growPhase = interpolate(frame, [0, GROW_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const opacity =
    interpolate(growPhase, [0, 0.15], [0, 0.75], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) *
    quietEnergy;

  // Sort by layer so far mushrooms render behind close ones
  const sorted = React.useMemo(
    () => [...mushrooms].sort((a, b) => a.layer - b.layer),
    [mushrooms],
  );

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}>
      <MushroomDefs chromaHue={chromaHue} />

      {/* Ground vegetation */}
      <GroundLayer
        width={width}
        height={height}
        growPhase={growPhase}
        chromaHue={chromaHue}
        frame={frame}
        tempoFactor={tempoFactor}
      />

      {/* Mushrooms — rendered layer by layer (far → close) */}
      {sorted.map((m, i) => (
        <Mushroom
          key={i}
          m={m}
          idx={i}
          width={width}
          height={height}
          growPhase={growPhase}
          chromaHue={chromaHue}
          beatDecay={beatDecay}
          timbralBrightness={timbralBrightness}
          frame={frame}
          tempoFactor={tempoFactor}
        />
      ))}

      {/* Spore particles floating upward */}
      <SporeParticles
        width={width}
        height={height}
        chromaHue={chromaHue}
        beatDecay={beatDecay}
        highs={highs}
        frame={frame}
        tempoFactor={tempoFactor}
        growPhase={growPhase}
      />
    </svg>
  );
};

// ── SKELETON CROWD ─────────────────────────────────────────────

const SkeletonCrowd: React.FC<{
  width: number;
  height: number;
  energy: number;
  bass: number;
  chromaHue: number;
  beatDecay: number;
  tempoFactor: number;
  frame: number;
}> = ({ width, height, energy, bass, chromaHue, beatDecay, tempoFactor, frame }) => {
  if (energy < 0.12) return null;

  const opacity = interpolate(energy, [0.12, 0.3], [0, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const skulls = React.useMemo(() => generateSkulls(5081977), []);
  const baseY = height - 38;

  const hue = chromaHue;
  const glowIntensity = 5 + beatDecay * 10;
  const color = `hsl(${hue}, 80%, ${58 + beatDecay * 14}%)`;
  const glow = `drop-shadow(0 0 ${glowIntensity}px ${color})`;

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, opacity, filter: glow, pointerEvents: "none" }}
    >
      {skulls.map((s, i) => {
        const x = s.x * width;
        // Bass drives the bob more than generic energy
        const bobAmp = 4 + bass * 8 + energy * 3;
        const bob = beatDecay * bobAmp + Math.sin(frame * s.bobSpeed * 0.02 * tempoFactor + s.bobPhase) * (3 + energy * 4);
        const y = baseY + bob;
        const tilt = s.tiltBias + Math.sin(frame * 0.045 * tempoFactor + i * 1.3) * (6 + energy * 4);
        const skullHue = (hue + i * 22) % 360;
        const skullColor = `hsl(${skullHue}, 75%, 58%)`;
        const skullColorDark = `hsl(${skullHue}, 60%, 40%)`;
        const jawColor = `hsl(${skullHue}, 65%, 50%)`;

        // Jaw bob — opens slightly on beat
        const jawDrop = s.jawOpen * (1 + beatDecay * 2) * s.size;

        return (
          <g key={i} transform={`translate(${x}, ${y}) rotate(${tilt})`}>
            {/* Cranium — main skull shape */}
            <ellipse
              cx={0}
              cy={0}
              rx={s.size * 0.72}
              ry={s.size * 0.88}
              fill={skullColor}
              opacity={0.75}
            />
            {/* Cranium shading — darker sides */}
            <ellipse
              cx={-s.size * 0.35}
              cy={-s.size * 0.1}
              rx={s.size * 0.2}
              ry={s.size * 0.5}
              fill={skullColorDark}
              opacity={0.15}
            />
            <ellipse
              cx={s.size * 0.35}
              cy={-s.size * 0.1}
              rx={s.size * 0.2}
              ry={s.size * 0.5}
              fill={skullColorDark}
              opacity={0.15}
            />
            {/* Brow ridge */}
            <ellipse
              cx={0}
              cy={-s.size * 0.28}
              rx={s.size * 0.55}
              ry={s.size * 0.08}
              fill={skullColorDark}
              opacity={0.2}
            />

            {/* Eye sockets — dark with inner glow */}
            {[-1, 1].map((side) => (
              <g key={`eye-${side}`}>
                {/* Socket cavity */}
                <ellipse
                  cx={side * s.size * 0.24}
                  cy={-s.size * 0.12}
                  rx={s.size * s.eyeSize}
                  ry={s.size * s.eyeSize * 1.15}
                  fill="black"
                  opacity={0.7}
                />
                {/* Glowing pupil — pulses with beat */}
                <circle
                  cx={side * s.size * 0.24}
                  cy={-s.size * 0.1}
                  r={s.size * s.eyeSize * 0.4 * (0.6 + beatDecay * 0.6)}
                  fill={`hsl(${skullHue}, 90%, ${50 + beatDecay * 30}%)`}
                  opacity={0.3 + beatDecay * 0.5}
                />
              </g>
            ))}

            {/* Nasal cavity */}
            <path
              d={`M ${-s.size * 0.06} ${s.size * 0.05}
                  L 0 ${s.size * 0.2}
                  L ${s.size * 0.06} ${s.size * 0.05}
                  Z`}
              fill="black"
              opacity={0.5}
            />

            {/* Cheekbone lines */}
            <line
              x1={-s.size * 0.5}
              y1={s.size * 0.05}
              x2={-s.size * 0.25}
              y2={s.size * 0.15}
              stroke={skullColorDark}
              strokeWidth={0.8}
              opacity={0.2}
            />
            <line
              x1={s.size * 0.5}
              y1={s.size * 0.05}
              x2={s.size * 0.25}
              y2={s.size * 0.15}
              stroke={skullColorDark}
              strokeWidth={0.8}
              opacity={0.2}
            />

            {/* Jaw — separated, drops on beat */}
            <g transform={`translate(0, ${jawDrop})`}>
              {/* Mandible */}
              <rect
                x={-s.size * 0.42}
                y={s.size * 0.38}
                width={s.size * 0.84}
                height={s.size * 0.28}
                rx={s.size * 0.06}
                fill={jawColor}
                opacity={0.6}
              />
              {/* Jaw chin curve */}
              <ellipse
                cx={0}
                cy={s.size * 0.66}
                rx={s.size * 0.3}
                ry={s.size * 0.08}
                fill={jawColor}
                opacity={0.4}
              />

              {/* Teeth — individual rectangles */}
              {Array.from({ length: s.teethCount }, (_, t) => {
                const toothWidth = (s.size * 0.76) / s.teethCount;
                const tx = -s.size * 0.38 + t * toothWidth;
                const toothH = s.size * 0.12 + Math.sin(t * 1.5) * s.size * 0.03;
                return (
                  <g key={`tooth-${t}`}>
                    {/* Upper teeth (on skull) — offset back up by jawDrop */}
                    <rect
                      x={tx + toothWidth * 0.1}
                      y={s.size * 0.34 - jawDrop}
                      width={toothWidth * 0.75}
                      height={toothH}
                      rx={1}
                      fill="white"
                      opacity={0.4}
                    />
                    {/* Lower teeth (on jaw) */}
                    <rect
                      x={tx + toothWidth * 0.1}
                      y={s.size * 0.38}
                      width={toothWidth * 0.75}
                      height={toothH * 0.85}
                      rx={1}
                      fill="white"
                      opacity={0.35}
                    />
                    {/* Tooth gap line */}
                    <line
                      x1={tx + toothWidth}
                      y1={s.size * 0.34 - jawDrop}
                      x2={tx + toothWidth}
                      y2={s.size * 0.38 + toothH * 0.85}
                      stroke="black"
                      strokeWidth={0.5}
                      opacity={0.2}
                    />
                  </g>
                );
              })}
            </g>

            {/* Skull crown cracks — decorative suture lines */}
            <path
              d={`M ${-s.size * 0.1} ${-s.size * 0.7}
                  Q ${-s.size * 0.05} ${-s.size * 0.5} ${s.size * 0.08} ${-s.size * 0.35}`}
              fill="none"
              stroke={skullColorDark}
              strokeWidth={0.6}
              opacity={0.2}
            />
            <path
              d={`M ${s.size * 0.15} ${-s.size * 0.65}
                  Q ${s.size * 0.2} ${-s.size * 0.45} ${s.size * 0.05} ${-s.size * 0.3}`}
              fill="none"
              stroke={skullColorDark}
              strokeWidth={0.5}
              opacity={0.15}
            />
          </g>
        );
      })}
    </svg>
  );
};

// ── MAIN COMPONENT ─────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const MushroomForest: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, chromaHue, beatDecay, spaceScore, bass, highs, timbralBrightness } = snap;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <MushroomForestOverlay
        width={width}
        height={height}
        energy={energy}
        chromaHue={chromaHue}
        spaceScore={spaceScore ?? 0}
        beatDecay={beatDecay}
        highs={highs}
        timbralBrightness={timbralBrightness}
        tempoFactor={tempoFactor}
        frame={frame}
      />
      <SkeletonCrowd
        width={width}
        height={height}
        energy={energy}
        bass={bass}
        chromaHue={chromaHue}
        beatDecay={beatDecay}
        tempoFactor={tempoFactor}
        frame={frame}
      />
    </div>
  );
};
