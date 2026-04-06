/**
 * PrisonBars — Death row cell interior for "Sing Me Back Home" (Merle Haggard).
 *
 * View: Looking into a stone cell from outside the bars. 7 vertical iron
 * bars dominate the foreground, casting long shadows across the floor. A
 * small barred window high on the back wall pours a single shaft of warm
 * light through dust-laden air, splashing onto the worn stone floor. A
 * wooden bunk and stool sit silhouetted against the back wall. Tally marks
 * scratched into the brick count down the days.
 *
 * Mood: Mournful, heavy, claustrophobic — the lone warm beam is the only
 * comfort. VocalEnergy drives the beam intensity (the chaplain's voice as
 * a literal source of light), slowEnergy controls the haze and overall
 * atmosphere, chromaHue tints the warm light slightly, beatDecay pulses
 * the dust motes drifting through the beam.
 *
 * Cycle: 95s on / off, 26s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE = 2850;
const DURATION = 780;
const BAR_COUNT = 7;
const DUST_MOTE_COUNT = 48;
const BRICK_COLS = 14;
const BRICK_ROWS = 10;
const TALLY_GROUP_COUNT = 9;
const FLOOR_CRACK_COUNT = 6;

const STONE_DARKEST = "#1A1612";
const STONE_DARK = "#2A241E";
const STONE_MID = "#3D352B";
const STONE_HIGHLIGHT = "#6B5D4C";
const IRON_BLACK = "#0E0C0A";
const IRON_DARK = "#1F1B16";
const IRON_MID = "#3A332A";
const IRON_HIGHLIGHT = "#544A3C";
const RUST_DEEP = "#4A2A18";
const RUST_BRIGHT = "#7A3E20";

interface Props {
  frames: EnhancedFrameData[];
}

export const PrisonBars: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const sceneRng = React.useMemo(() => {
    const rng = seeded(73_812_491);
    const bricks = Array.from({ length: BRICK_ROWS * BRICK_COLS }, () => ({
      shadeOffset: rng() * 0.45 - 0.22,
      worn: rng() < 0.33,
      stained: rng() < 0.18,
      cracked: rng() < 0.12,
      offset: rng() * 6 - 3,
    }));
    const motes = Array.from({ length: DUST_MOTE_COUNT }, () => ({
      yPhase: rng() * Math.PI * 2,
      xPhase: rng() * Math.PI * 2,
      drift: 0.4 + rng() * 0.8,
      size: 0.9 + rng() * 2.2,
      brightness: 0.4 + rng() * 0.6,
      lifeOffset: rng(),
    }));
    const bars = Array.from({ length: BAR_COUNT }, () => ({
      rustSpots: Array.from({ length: 4 + Math.floor(rng() * 5) }, () => ({
        yFrac: 0.05 + rng() * 0.9,
        size: 3 + rng() * 6,
        intensity: 0.4 + rng() * 0.6,
        elongated: rng() < 0.4,
      })),
      pitting: Array.from({ length: 6 }, () => ({ yFrac: rng(), depth: rng() * 0.6 })),
      slightWobble: (rng() - 0.5) * 1.6,
    }));
    const tallyGroups = Array.from({ length: TALLY_GROUP_COUNT }, () => ({
      xFrac: 0.05 + rng() * 0.18,
      yFrac: 0.32 + rng() * 0.34,
      count: rng() < 0.85 ? 5 : 4 + Math.floor(rng() * 2),
      angle: (rng() - 0.5) * 0.18,
      length: 12 + rng() * 6,
      strikeThrough: rng() < 0.7,
    }));
    const floorCracks = Array.from({ length: FLOOR_CRACK_COUNT }, () => ({
      x1: rng(), y1: rng(), x2: rng(), y2: rng(), w: 0.5 + rng() * 1.2,
    }));
    return { bricks, motes, bars, tallyGroups, floorCracks };
  }, []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Audio reactivity
  const energy = snap.energy ?? 0;
  const slowEnergy = snap.slowEnergy ?? 0;
  const vocalEnergy = snap.vocalEnergy ?? 0;
  const chromaHue = snap.chromaHue ?? 35;
  const beatDecay = snap.beatDecay ?? 0;
  const onsetEnvelope = snap.onsetEnvelope ?? 0;

  const baseOpacity = 0.78 + energy * 0.22;
  const opacity = baseOpacity * fadeIn * fadeOut;
  const vocalGlow = 0.45 + vocalEnergy * 0.85;
  const beamFlash = onsetEnvelope * 0.35;
  const beamIntensity = Math.min(1.4, vocalGlow + beamFlash);
  const moodDepth = 0.55 + slowEnergy * 0.45;
  const hazeOpacity = 0.12 + slowEnergy * 0.18 + vocalEnergy * 0.08;
  const tintShift = ((chromaHue % 60) / 60 - 0.5) * 18;
  const beamHue = 38 + tintShift;
  const beamSat = 70 + slowEnergy * 18;

  // Layout
  const cellFloorY = height * 0.62;
  const backWallTop = height * 0.06;
  const windowCenterX = width * 0.5;
  const windowCenterY = height * 0.18;
  const windowW = width * 0.085;
  const windowH = height * 0.13;

  // Beam geometry
  const beamSourceX = windowCenterX;
  const beamSourceY = windowCenterY + windowH * 0.5;
  const beamHitX = width * 0.56;
  const beamHitY = height * 0.78;
  const beamAngle = Math.atan2(beamHitY - beamSourceY, beamHitX - beamSourceX);
  const beamLength = Math.hypot(beamHitX - beamSourceX, beamHitY - beamSourceY);
  const beamWidthNear = windowW * 0.35;
  const beamWidthFar = windowW * 1.55;
  const perpX = -Math.sin(beamAngle);
  const perpY = Math.cos(beamAngle);

  const beamPoly = (widthScale: number, alpha: number, blur: number) => {
    const wn = beamWidthNear * widthScale;
    const wf = beamWidthFar * widthScale;
    const x1 = beamSourceX + perpX * wn, y1 = beamSourceY + perpY * wn;
    const x2 = beamSourceX - perpX * wn, y2 = beamSourceY - perpY * wn;
    const x3 = beamHitX - perpX * wf, y3 = beamHitY - perpY * wf;
    const x4 = beamHitX + perpX * wf, y4 = beamHitY + perpY * wf;
    return (
      <polygon points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`} fill="url(#beamGradient)"
        opacity={alpha * beamIntensity} style={blur > 0 ? { filter: `blur(${blur}px)` } : undefined} />
    );
  };

  const bw = width / BRICK_COLS;
  const bh = (cellFloorY - backWallTop) / BRICK_ROWS;

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}>
      <defs>
        <linearGradient id="beamGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={`hsla(${beamHue}, ${beamSat}%, 92%, 0.95)`} />
          <stop offset="60%" stopColor={`hsla(${beamHue + 4}, ${beamSat - 8}%, 82%, 0.55)`} />
          <stop offset="100%" stopColor={`hsla(${beamHue + 8}, ${beamSat - 16}%, 70%, 0.18)`} />
        </linearGradient>
        <radialGradient id="floorPatch" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={`hsla(${beamHue}, ${beamSat + 6}%, 88%, ${0.78 * beamIntensity})`} />
          <stop offset="55%" stopColor={`hsla(${beamHue + 4}, ${beamSat}%, 72%, ${0.32 * beamIntensity})`} />
          <stop offset="100%" stopColor={`hsla(${beamHue + 8}, ${beamSat}%, 60%, 0)`} />
        </radialGradient>
        <radialGradient id="cellVignette" cx="50%" cy="50%" r="75%">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="65%" stopColor={`rgba(0,0,0,${0.35 * moodDepth})`} />
          <stop offset="100%" stopColor={`rgba(0,0,0,${0.85 * moodDepth})`} />
        </radialGradient>
        <linearGradient id="barGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={IRON_BLACK} />
          <stop offset="20%" stopColor={IRON_DARK} />
          <stop offset="48%" stopColor={IRON_HIGHLIGHT} />
          <stop offset="55%" stopColor={IRON_MID} />
          <stop offset="100%" stopColor={IRON_BLACK} />
        </linearGradient>
        <linearGradient id="floorGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={STONE_MID} />
          <stop offset="100%" stopColor={STONE_DARKEST} />
        </linearGradient>
        <linearGradient id="windowLightSource" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={`hsla(${beamHue}, ${beamSat + 10}%, 95%, ${beamIntensity})`} />
          <stop offset="100%" stopColor={`hsla(${beamHue + 6}, ${beamSat}%, 78%, ${0.6 * beamIntensity})`} />
        </linearGradient>
      </defs>

      {/* Stone wall background */}
      <rect x={0} y={0} width={width} height={cellFloorY} fill={STONE_DARK} />

      {/* Brick texture */}
      {sceneRng.bricks.map((b, i) => {
        const col = i % BRICK_COLS, row = Math.floor(i / BRICK_COLS);
        const stagger = row % 2 === 0 ? 0 : bw * 0.5;
        const bx = col * bw + stagger - bw * 0.5 + b.offset;
        const by = backWallTop + row * bh;
        const distFromBeam = Math.hypot(bx + bw / 2 - beamSourceX, by + bh / 2 - beamSourceY) / width;
        const lit = Math.max(0, 1 - distFromBeam * 2.2) * vocalEnergy * 0.4;
        const r = 35 + b.shadeOffset * 30 + lit * 80;
        const g = 30 + b.shadeOffset * 25 + lit * 60;
        const c = 24 + b.shadeOffset * 20 + lit * 30;
        const fill = `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(c)})`;
        return (
          <g key={`brick-${i}`}>
            <rect x={bx} y={by} width={bw - 2} height={bh - 2} fill={fill} opacity={0.85 + lit * 0.15} />
            {b.cracked && <line x1={bx + bw * 0.2} y1={by + bh * 0.2} x2={bx + bw * 0.8} y2={by + bh * 0.7} stroke={STONE_DARKEST} strokeWidth={0.5} opacity={0.6} />}
            {b.stained && <ellipse cx={bx + bw * 0.5} cy={by + bh * 0.5} rx={bw * 0.3} ry={bh * 0.25} fill={STONE_DARKEST} opacity={0.35} />}
          </g>
        );
      })}

      {/* Tally marks scratched into wall */}
      {sceneRng.tallyGroups.map((t, i) => {
        const cx = t.xFrac * width, cy = t.yFrac * cellFloorY;
        return (
          <g key={`tally-${i}`} transform={`rotate(${(t.angle * 180) / Math.PI} ${cx} ${cy})`}>
            {Array.from({ length: t.count }).map((_, j) => (
              <line key={j} x1={cx + j * 4} y1={cy} x2={cx + j * 4} y2={cy + t.length} stroke={STONE_HIGHLIGHT} strokeWidth={0.9} opacity={0.55} />
            ))}
            {t.strikeThrough && <line x1={cx - 2} y1={cy + t.length * 0.55} x2={cx + t.count * 4 + 4} y2={cy + t.length * 0.45} stroke={STONE_HIGHLIGHT} strokeWidth={0.9} opacity={0.55} />}
          </g>
        );
      })}

      {/* Window high on back wall */}
      <g>
        <rect x={windowCenterX - windowW * 0.62} y={windowCenterY - windowH * 0.62} width={windowW * 1.24} height={windowH * 1.24} fill={STONE_DARKEST} opacity={0.9} />
        <rect x={windowCenterX - windowW * 0.5} y={windowCenterY - windowH * 0.5} width={windowW} height={windowH} fill="url(#windowLightSource)" />
        {[0, 1, 2, 3].map((i) => {
          const wbx = windowCenterX - windowW * 0.5 + (windowW / 4) * (i + 0.5);
          return <rect key={`wbar-${i}`} x={wbx - 1} y={windowCenterY - windowH * 0.5} width={2} height={windowH} fill={IRON_BLACK} opacity={0.85} />;
        })}
        <rect x={windowCenterX - windowW * 0.5} y={windowCenterY - 1} width={windowW} height={2} fill={IRON_BLACK} opacity={0.85} />
        <rect x={windowCenterX - windowW * 0.85} y={windowCenterY - windowH * 0.85} width={windowW * 1.7} height={windowH * 1.7}
          fill={`hsla(${beamHue}, ${beamSat}%, 80%, ${0.18 * beamIntensity})`} style={{ filter: "blur(8px)" }} />
      </g>

      {/* Floor */}
      <rect x={0} y={cellFloorY} width={width} height={height - cellFloorY} fill="url(#floorGradient)" />
      {sceneRng.floorCracks.map((c, i) => (
        <line key={`crack-${i}`} x1={c.x1 * width} y1={cellFloorY + c.y1 * (height - cellFloorY)}
          x2={c.x2 * width} y2={cellFloorY + c.y2 * (height - cellFloorY)} stroke={STONE_DARKEST} strokeWidth={c.w} opacity={0.55} />
      ))}

      {/* Bunk silhouette */}
      <g opacity={0.92}>
        <rect x={width * 0.05} y={cellFloorY - height * 0.12} width={width * 0.28} height={height * 0.05} fill={STONE_DARKEST} />
        <path d={`M ${width * 0.06},${cellFloorY - height * 0.12} Q ${width * 0.12},${cellFloorY - height * 0.155} ${width * 0.18},${cellFloorY - height * 0.135} Q ${width * 0.25},${cellFloorY - height * 0.115} ${width * 0.32},${cellFloorY - height * 0.12} L ${width * 0.32},${cellFloorY - height * 0.07} L ${width * 0.06},${cellFloorY - height * 0.07} Z`} fill={STONE_DARK} />
        <rect x={width * 0.06} y={cellFloorY - height * 0.07} width={6} height={height * 0.07} fill={STONE_DARKEST} />
        <rect x={width * 0.31} y={cellFloorY - height * 0.07} width={6} height={height * 0.07} fill={STONE_DARKEST} />
        <ellipse cx={width * 0.085} cy={cellFloorY - height * 0.135} rx={width * 0.025} ry={height * 0.012} fill={STONE_MID} opacity={0.7} />
      </g>

      {/* Stool */}
      <g opacity={0.88}>
        <ellipse cx={width * 0.78} cy={cellFloorY - height * 0.05} rx={width * 0.025} ry={height * 0.008} fill={STONE_DARKEST} />
        <rect x={width * 0.762} y={cellFloorY - height * 0.05} width={3} height={height * 0.05} fill={STONE_DARKEST} />
        <rect x={width * 0.793} y={cellFloorY - height * 0.05} width={3} height={height * 0.05} fill={STONE_DARKEST} />
        <rect x={width * 0.778} y={cellFloorY - height * 0.025} width={20} height={2} fill={STONE_DARKEST} />
      </g>

      {/* Light beam — 3-layer volumetric */}
      <g style={{ mixBlendMode: "screen" }}>
        {beamPoly(2.4, 0.35, 14)}
        {beamPoly(1.4, 0.6, 6)}
        {beamPoly(0.85, 0.85, 2)}
        {beamPoly(0.32, 1.0, 0)}
      </g>
      <ellipse cx={beamHitX} cy={beamHitY} rx={width * 0.085} ry={height * 0.025} fill="url(#floorPatch)" style={{ mixBlendMode: "screen" }} />

      {/* Dust motes drifting in beam */}
      <g style={{ mixBlendMode: "screen" }}>
        {sceneRng.motes.map((m, i) => {
          const t = (((frame * 0.0035 * m.drift * tempoFactor) + m.lifeOffset) % 1 + 1) % 1;
          const along = beamLength * t;
          const lateralPhase = m.xPhase + frame * 0.012 * m.drift;
          const lateral = Math.sin(lateralPhase) * (beamWidthNear + (beamWidthFar - beamWidthNear) * t) * 0.7;
          const cx = beamSourceX + Math.cos(beamAngle) * along + perpX * lateral;
          const cy = beamSourceY + Math.sin(beamAngle) * along + perpY * lateral;
          const pulse = 1 + beatDecay * 0.8;
          const wobble = Math.sin(frame * 0.05 + m.yPhase) * 0.5 + 0.5;
          const alpha = m.brightness * (0.45 + wobble * 0.55) * beamIntensity * (0.4 + vocalEnergy * 0.6);
          return <circle key={`mote-${i}`} cx={cx} cy={cy} r={m.size * pulse} fill={`hsla(${beamHue + 5}, ${beamSat}%, 92%, 1)`} opacity={alpha} />;
        })}
      </g>

      {/* FOREGROUND: Iron bars */}
      {sceneRng.bars.map((b, i) => {
        const barW = width * 0.038;
        const gap = (width - barW * BAR_COUNT) / (BAR_COUNT + 1);
        const bx = gap * (i + 1) + barW * i + b.slightWobble;
        const shadowOffsetX = (bx - width * 0.5) * 0.18 + 14;
        return (
          <g key={`bar-${i}`}>
            {/* Floor shadow */}
            <polygon points={`${bx},${cellFloorY} ${bx + barW},${cellFloorY} ${bx + barW + shadowOffsetX + 4},${height} ${bx + shadowOffsetX},${height}`}
              fill={STONE_DARKEST} opacity={0.55 * moodDepth} />
            {/* Bar body */}
            <rect x={bx} y={-10} width={barW} height={height + 20} rx={barW * 0.45} ry={barW * 0.45} fill="url(#barGradient)" />
            {/* Highlight strip */}
            <rect x={bx + barW * 0.32} y={-10} width={barW * 0.12} height={height + 20}
              fill={`hsla(${beamHue}, ${beamSat - 20}%, 70%, ${0.18 + vocalEnergy * 0.22})`} opacity={0.7} />
            {/* Rust spots */}
            {b.rustSpots.map((spot, j) => (
              <ellipse key={`rust-${i}-${j}`} cx={bx + barW * 0.5} cy={spot.yFrac * height}
                rx={spot.size * (spot.elongated ? 0.6 : 1)} ry={spot.size * (spot.elongated ? 1.6 : 1)}
                fill={j % 2 === 0 ? RUST_DEEP : RUST_BRIGHT} opacity={spot.intensity * 0.7} />
            ))}
            {/* Pitting */}
            {b.pitting.map((p, j) => (
              <circle key={`pit-${i}-${j}`} cx={bx + barW * 0.5 + (j % 2 === 0 ? -2 : 2)} cy={p.yFrac * height} r={0.8} fill={IRON_BLACK} opacity={p.depth} />
            ))}
          </g>
        );
      })}

      {/* Horizontal cross-bars */}
      <rect x={0} y={height * 0.08} width={width} height={height * 0.022} fill={IRON_DARK} />
      <rect x={0} y={height * 0.084} width={width} height={height * 0.005} fill={IRON_HIGHLIGHT} opacity={0.5} />
      <rect x={0} y={height * 0.78} width={width} height={height * 0.022} fill={IRON_DARK} />
      <rect x={0} y={height * 0.784} width={width} height={height * 0.005} fill={IRON_HIGHLIGHT} opacity={0.5} />

      {/* Atmospheric haze (volumetric) */}
      <rect x={0} y={0} width={width} height={height} fill={`hsla(${beamHue + 4}, ${beamSat - 10}%, 55%, 1)`}
        opacity={hazeOpacity} style={{ mixBlendMode: "overlay" }} />

      {/* Heavy vignette */}
      <rect x={0} y={0} width={width} height={height} fill="url(#cellVignette)" />

      {/* Cool desaturation tint (leaves beam warm by contrast) */}
      <rect x={0} y={0} width={width} height={height} fill="rgba(20, 18, 24, 0.18)" style={{ mixBlendMode: "multiply" }} />
    </svg>
  );
};

export default PrisonBars;
