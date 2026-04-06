/**
 * MountainPanorama — A+++ atmospheric mountain range panorama silhouette.
 *
 * Sierra Nevada / Rocky Mountain feel evoking the West, the journey, and the
 * Dead's Americana side. Perfect for "Mountains of the Moon", "Mountain Jam",
 * "Friend of the Devil", "Brokedown Palace", and other westward-facing songs.
 *
 * Composition (back to front):
 *   1. Sky gradient (warm horizon → cool/dark above), chroma-tinted
 *   2. Sun/moon disc + halo + crepuscular rays through the peaks
 *   3. Back range (faint, jagged, smallest)  →  2nd range  →  3rd range
 *   4. Front range — tallest, darkest, snow caps + ridge lines + rocky outcrops
 *   5. Foreground valley hint (subtle gradient at very bottom)
 *
 * Audio reactivity:
 *   slowEnergy → sky glow intensity (sunrise/sunset feel)
 *   chromaHue  → sky tint (warm sunset ↔ cool moonlight)
 *   onsetEnv   → sun/moon glow flash + ray flicker
 *   energy     → crepuscular ray brightness
 *   bass       → parallax drift between mountain layers
 *   beatDecay  → snow cap shimmer
 *   tempoFactor→ ultra-slow drift across the entire scene
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

interface MountainPeak {
  x: number;             // normalized X (0-1)
  h: number;             // peak height fraction (0.45-1)
  sharpness: number;     // 0 rounded, 1 jagged
  subOffsets: number[];  // sub-peak offsets for jagged silhouette
}

interface MountainLayer {
  peaks: MountainPeak[];
  baseY: number;         // base elevation from bottom (0-1)
  maxHeight: number;     // max rise as fraction of screen height
  color: string;         // fill rgba
  parallax: number;      // drift multiplier
  rimColor: string;      // soft top-edge highlight
}

interface SnowCap { x: number; y: number; w: number; h: number; }
interface RockyOutcrop { x: number; y: number; size: number; tilt: number; }

const CYCLE_FRAMES = 2700;   // 90s — slow Americana cadence
const VISIBLE_FRAMES = 900;  // 30s on screen
const FADE_FRAMES = 120;     // 4s gentle fade

/* ------------------------------------------------------------------ */
/*  Generation                                                         */
/* ------------------------------------------------------------------ */

function generatePeaks(rng: () => number, count: number, sharpBias: number): MountainPeak[] {
  const peaks: MountainPeak[] = [];
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) / count + (rng() - 0.5) * 0.06;
    const h = 0.45 + rng() * 0.55;
    const sharpness = Math.min(1, Math.max(0, sharpBias + (rng() - 0.5) * 0.4));
    const subCount = 1 + Math.floor(rng() * 3);
    const subOffsets: number[] = [];
    for (let s = 0; s < subCount; s++) subOffsets.push((rng() - 0.5) * 0.08);
    peaks.push({ x: Math.min(1, Math.max(0, x)), h, sharpness, subOffsets });
  }
  peaks.sort((a, b) => a.x - b.x);
  return peaks;
}

function generateLayers(seed: number): MountainLayer[] {
  const rng = seeded(seed);
  return [
    // Back: distant, faint, low + small jagged peaks
    { peaks: generatePeaks(rng, 8, 0.55), baseY: 0.36, maxHeight: 0.10, color: "rgba(72, 78, 110, 0.42)", parallax: 0.10, rimColor: "rgba(180, 165, 140, 0.18)" },
    // 2nd
    { peaks: generatePeaks(rng, 7, 0.50), baseY: 0.30, maxHeight: 0.14, color: "rgba(54, 58, 88, 0.55)",  parallax: 0.18, rimColor: "rgba(190, 160, 130, 0.22)" },
    // 3rd
    { peaks: generatePeaks(rng, 6, 0.45), baseY: 0.22, maxHeight: 0.18, color: "rgba(38, 42, 65, 0.72)",  parallax: 0.30, rimColor: "rgba(200, 150, 110, 0.28)" },
    // Front: tall, dark, detailed
    { peaks: generatePeaks(rng, 5, 0.65), baseY: 0.10, maxHeight: 0.30, color: "rgba(14, 16, 28, 0.94)",  parallax: 0.55, rimColor: "rgba(220, 140, 90, 0.40)" },
  ];
}

function generateSnowCaps(rng: () => number, layer: MountainLayer): SnowCap[] {
  const caps: SnowCap[] = [];
  for (const p of layer.peaks) {
    if (p.h > 0.7 && rng() > 0.25) {
      caps.push({ x: p.x, y: 1 - p.h, w: 0.018 + rng() * 0.014, h: 0.022 + rng() * 0.018 });
    }
  }
  return caps;
}

function generateOutcrops(rng: () => number, count: number): RockyOutcrop[] {
  return Array.from({ length: count }, () => ({
    x: 0.05 + rng() * 0.9,
    y: 0.04 + rng() * 0.18,
    size: 4 + rng() * 6,
    tilt: rng() * Math.PI,
  }));
}

/* ------------------------------------------------------------------ */
/*  Path builder — smooth ridgeline through peaks + sub-peaks          */
/* ------------------------------------------------------------------ */

function buildRidgePath(layer: MountainLayer, width: number, height: number, drift: number): string {
  const baseY = height - layer.baseY * height;
  const maxRise = layer.maxHeight * height;
  const points: Array<[number, number]> = [];

  // Anchor below screen on the left
  points.push([-40 + drift, baseY + 20]);

  for (let i = 0; i < layer.peaks.length; i++) {
    const peak = layer.peaks[i];
    const prevX = i === 0 ? 0 : layer.peaks[i - 1].x;
    const midLeftX = (prevX + peak.x) * 0.5;
    points.push([midLeftX * width + drift, baseY - maxRise * 0.15]); // valley dip

    // Jagged sub-peak shoulders
    for (const off of peak.subOffsets) {
      const subX = (peak.x + off) * width + drift;
      const subH = peak.h * (0.55 + Math.abs(off) * 3);
      points.push([subX, baseY - maxRise * Math.min(1, subH)]);
    }

    // Main peak with sharp notch
    const peakX = peak.x * width + drift;
    const peakY = baseY - maxRise * peak.h;
    const drop = peak.sharpness * 4;
    points.push([peakX - drop, peakY + drop * 0.5]);
    points.push([peakX, peakY]);
    points.push([peakX + drop, peakY + drop * 0.5]);
  }

  // Right anchor below screen
  points.push([width + 40 + drift, baseY + 20]);

  let d = `M ${points[0][0]},${height + 40} L ${points[0][0]},${points[0][1]} `;
  for (let i = 1; i < points.length; i++) d += `L ${points[i][0]},${points[i][1]} `;
  d += `L ${points[points.length - 1][0]},${height + 40} Z`;
  return d;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props { frames: EnhancedFrameData[]; }

export const MountainPanorama: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { slowEnergy, energy, chromaHue, bass, beatDecay, onsetEnvelope: onset } = snap;

  /* --- visibility cycle --- */
  const cycleFrame = frame % CYCLE_FRAMES;
  const isVisible = cycleFrame < VISIBLE_FRAMES;
  const fadeIn = interpolate(cycleFrame, [0, FADE_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(cycleFrame, [VISIBLE_FRAMES - FADE_FRAMES, VISIBLE_FRAMES], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = isVisible ? Math.min(fadeIn, fadeOut) : 0;
  if (masterOpacity < 0.01) return null;

  /* --- stable composition --- */
  const layers = React.useMemo(() => generateLayers(19770508), []);
  const snowCaps = React.useMemo(() => generateSnowCaps(seeded(72081572), layers[3]), [layers]);
  const outcrops = React.useMemo(() => generateOutcrops(seeded(78090377), 9), []);
  const ridgeLines = React.useMemo(() => {
    const rng = seeded(78070878);
    return Array.from({ length: 6 }, () => ({
      x: 0.1 + rng() * 0.8,
      slope: 0.4 + rng() * 0.5,
      length: 0.06 + rng() * 0.08,
      alpha: 0.10 + rng() * 0.15,
    }));
  }, []);

  /* --- chroma-driven sky tint: warm sunset ↔ cool moonlight --- */
  const warmth = (Math.cos(((chromaHue - 30) * Math.PI) / 180) + 1) * 0.5;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const horizonWarm: [number, number, number] = [255, 168, 95];
  const horizonCool: [number, number, number] = [120, 138, 200];
  const skyTopWarm: [number, number, number] = [62, 38, 78];
  const skyTopCool: [number, number, number] = [12, 16, 38];
  const horizon: [number, number, number] = [
    lerp(horizonCool[0], horizonWarm[0], warmth),
    lerp(horizonCool[1], horizonWarm[1], warmth),
    lerp(horizonCool[2], horizonWarm[2], warmth),
  ];
  const skyTop: [number, number, number] = [
    lerp(skyTopCool[0], skyTopWarm[0], warmth),
    lerp(skyTopCool[1], skyTopWarm[1], warmth),
    lerp(skyTopCool[2], skyTopWarm[2], warmth),
  ];
  const rgb = (c: [number, number, number], a: number) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;

  const skyGlow = interpolate(slowEnergy, [0.04, 0.22], [0.55, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  /* --- sun/moon position + glow (drifts very slowly across the cycle) --- */
  const driftT = cycleFrame / VISIBLE_FRAMES;
  const sunX = width * (0.62 + Math.sin(driftT * Math.PI * 0.5 + frame * 0.0001) * 0.04);
  const sunY = height * (0.20 - slowEnergy * 0.04);
  const sunBaseR = Math.min(width, height) * 0.045;
  const sunR = sunBaseR * (1 + onset * 0.6);
  const sunCore: [number, number, number] = warmth > 0.5 ? [255, 230, 170] : [225, 230, 255];
  const sunHaloAlpha = (0.55 + skyGlow * 0.35) * (0.8 + onset * 0.4);

  /* --- crepuscular rays --- */
  const rayCount = 9;
  const rayBrightness = interpolate(energy, [0.05, 0.30], [0.10, 0.42], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rayFlicker = 1 + onset * 0.5 + Math.sin(frame * 0.03) * 0.06;
  const rays = Array.from({ length: rayCount }, (_, i) => {
    const angle = -Math.PI / 2 + ((i / (rayCount - 1)) - 0.5) * Math.PI * 0.7;
    const len = Math.min(width, height) * (0.55 + (i % 3) * 0.06);
    return { x2: sunX + Math.cos(angle) * len, y2: sunY - Math.sin(angle) * len };
  });

  /* --- bass + tempo parallax + snow shimmer --- */
  const tempoDrift = Math.sin(frame * 0.0006 * tempoFactor) * 18;
  const bassParallax = bass * 24;
  const snowShimmer = 0.85 + beatDecay * 0.30;
  const front = layers[3];
  const frontDrift = tempoDrift * front.parallax + bassParallax * front.parallax;
  const frontBaseY = height - front.baseY * height;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", opacity: masterOpacity }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        <defs>
          <linearGradient id="mp-sky-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={rgb(skyTop, 1)} />
            <stop offset="55%" stopColor={rgb(horizon, 0.85 * skyGlow + 0.15)} />
            <stop offset="78%" stopColor={rgb(horizon, skyGlow)} />
            <stop offset="100%" stopColor={rgb(horizon, 0.6 * skyGlow)} />
          </linearGradient>
          <radialGradient id="mp-sun-halo">
            <stop offset="0%" stopColor={rgb(sunCore, sunHaloAlpha)} />
            <stop offset="35%" stopColor={rgb(sunCore, sunHaloAlpha * 0.45)} />
            <stop offset="70%" stopColor={rgb(sunCore, sunHaloAlpha * 0.15)} />
            <stop offset="100%" stopColor={rgb(sunCore, 0)} />
          </radialGradient>
          <linearGradient id="mp-ray-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`rgba(255, 220, 170, ${rayBrightness * rayFlicker})`} />
            <stop offset="60%" stopColor={`rgba(255, 200, 140, ${rayBrightness * rayFlicker * 0.4})`} />
            <stop offset="100%" stopColor="rgba(255, 200, 140, 0)" />
          </linearGradient>
          <linearGradient id="mp-haze-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor={rgb(horizon, 0.18 * skyGlow)} />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <linearGradient id="mp-valley-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(8, 10, 18, 0.7)" />
          </linearGradient>
        </defs>

        {/* Sky */}
        <rect x={0} y={0} width={width} height={height} fill="url(#mp-sky-grad)" />

        {/* Sun/moon halo */}
        <circle cx={sunX} cy={sunY} r={sunR * 6} fill="url(#mp-sun-halo)" />

        {/* Crepuscular rays — drawn before mountains so they get occluded */}
        <g style={{ mixBlendMode: "screen" }}>
          {rays.map((r, i) => (
            <line key={`ray${i}`} x1={sunX} y1={sunY} x2={r.x2} y2={r.y2}
              stroke="url(#mp-ray-grad)" strokeWidth={14 + (i % 3) * 6}
              strokeLinecap="round" opacity={0.55 + (i % 2) * 0.15} />
          ))}
        </g>

        {/* Sun/moon core */}
        <circle cx={sunX} cy={sunY} r={sunR} fill={rgb(sunCore, 0.92)}
          style={{ filter: `drop-shadow(0 0 ${12 + onset * 18}px ${rgb(sunCore, 0.7)})` }} />

        {/* Distant haze band above the back range */}
        <rect x={0} y={height * 0.32} width={width} height={height * 0.12} fill="url(#mp-haze-grad)" />

        {/* Mountain layers — back to front, with rim lights + interlayer haze */}
        {layers.map((layer, li) => {
          const drift = tempoDrift * layer.parallax + bassParallax * layer.parallax;
          const d = buildRidgePath(layer, width, height, drift);
          return (
            <g key={`layer${li}`}>
              <path d={d} fill={layer.color} />
              <path d={d} fill="none" stroke={layer.rimColor}
                strokeWidth={li === 3 ? 1.6 : 1.0} strokeLinejoin="round"
                opacity={0.55 + skyGlow * 0.35} />
              {li < 3 && (
                <rect x={0} y={height - layer.baseY * height - 12} width={width}
                  height={26} fill="url(#mp-haze-grad)" opacity={0.55} />
              )}
            </g>
          );
        })}

        {/* Front-range ridge lines (slope hints) */}
        <g>
          {ridgeLines.map((rl, i) => {
            const x1 = rl.x * width + frontDrift;
            const y1 = frontBaseY - front.maxHeight * height * 0.6;
            const x2 = x1 + rl.length * width * 0.25;
            const y2 = y1 + rl.length * height * rl.slope;
            return (
              <line key={`ridge${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={`rgba(60, 50, 70, ${rl.alpha})`}
                strokeWidth={1.2} strokeLinecap="round" />
            );
          })}
          {/* Rocky outcrops on the front range */}
          {outcrops.map((o, i) => {
            const cx = o.x * width + frontDrift;
            const cy = frontBaseY - o.y * height;
            const cs = Math.cos(o.tilt);
            const sn = Math.sin(o.tilt);
            const pts = [
              [-o.size, o.size * 0.6], [0, -o.size], [o.size, o.size * 0.5],
              [o.size * 0.4, o.size * 0.9], [-o.size * 0.6, o.size * 0.8],
            ].map(([px, py]) => `${cx + px * cs - py * sn},${cy + px * sn + py * cs}`).join(" ");
            return (
              <polygon key={`oc${i}`} points={pts}
                fill="rgba(20, 18, 26, 0.85)"
                stroke="rgba(80, 60, 50, 0.4)" strokeWidth={0.8} />
            );
          })}
        </g>

        {/* Snow caps on tall front-range peaks */}
        <g>
          {snowCaps.map((cap, i) => {
            const peakY = frontBaseY - front.maxHeight * height * (1 - cap.y);
            const cx = cap.x * width + frontDrift;
            const cw = cap.w * width;
            const ch = cap.h * height;
            const pts = `${cx - cw / 2},${peakY + ch} ${cx},${peakY - ch * 0.2} ${cx + cw / 2},${peakY + ch} ${cx + cw / 4},${peakY + ch * 0.4} ${cx - cw / 4},${peakY + ch * 0.5}`;
            return (
              <polygon key={`snow${i}`} points={pts}
                fill={`rgba(245, 248, 255, ${0.85 * snowShimmer})`}
                style={{ filter: `drop-shadow(0 0 3px rgba(220, 230, 255, ${0.5 * snowShimmer}))` }} />
            );
          })}
        </g>

        {/* Foreground valley hint */}
        <rect x={0} y={height * 0.86} width={width} height={height * 0.14} fill="url(#mp-valley-grad)" />
      </svg>
    </div>
  );
};
