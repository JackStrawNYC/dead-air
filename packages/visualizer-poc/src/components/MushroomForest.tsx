/**
 * MushroomForest — A+++ psychedelic mushroom forest scene.
 *
 * Hero: 6 oversized fly-agaric / oyster / morel mushrooms across the bottom
 * half of the frame, with full caps (red with white spots, blue oysters,
 * golden chanterelles, purple amanita), glowing bioluminescent gills,
 * intricate stem detail, surrounded by ferns, fronds, fairy lights and
 * floating spore particles.
 *
 * NO conditional gating on energy/spaceScore. The hero must always be
 * visible during the cycle window. Cycle visibility is the only gate.
 *
 * Audio reactivity:
 *   slowEnergy → fairy light warmth, sky tint
 *   energy     → cap glow + spore brightness
 *   bass       → mushroom stem pulse
 *   beatDecay  → cap pulse + spore drift
 *   onsetEnvelope → twinkling sparkle bursts
 *   chromaHue  → palette shift
 *   tempoFactor → drift/sway speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const NUM_MUSHROOMS = 7;
const NUM_SPORES = 80;
const NUM_FERNS = 14;
const NUM_FAIRY = 32;
const NUM_FRONDS = 18;
const NUM_GROUND_DETAILS = 26;

interface MushroomSpec {
  xFrac: number;       // 0..1 horizontal placement
  capWidthFrac: number; // fraction of frame width for cap diameter
  capHue: number;       // base hue for the cap
  capStyle: "amanita" | "blue-oyster" | "chanterelle" | "morel" | "violet" | "white";
  stemHueOffset: number;
  swayPhase: number;
  bobSpeed: number;
  glowSeed: number;
  ringPos: number;
  spotSeed: number;
  depth: number;        // 0.6 = back, 1.0 = hero, 1.05 = front
}

interface FernSpec { xFrac: number; size: number; lean: number; fronds: number; }
interface FrondSpec { xFrac: number; baseY: number; len: number; lean: number; phase: number; }
interface SporeSpec { xFrac: number; baseY: number; speed: number; size: number; phase: number; drift: number; hue: number; }
interface FairyLight { xFrac: number; yFrac: number; size: number; speed: number; phase: number; hue: number; }
interface GroundDetail { xFrac: number; yOff: number; size: number; type: "moss" | "stone" | "leaf"; hue: number; }

function buildMushrooms(): MushroomSpec[] {
  const styles: MushroomSpec["capStyle"][] = [
    "amanita", "blue-oyster", "chanterelle", "violet", "morel", "amanita", "white",
  ];
  const xPositions = [0.08, 0.22, 0.36, 0.52, 0.68, 0.82, 0.94];
  const hues = [0, 200, 38, 280, 24, 350, 60];
  const widths = [0.13, 0.10, 0.16, 0.12, 0.09, 0.18, 0.08];
  const depths = [0.78, 0.92, 1.05, 0.88, 0.82, 1.00, 0.72];
  const rng = seeded(91_447_233);
  return styles.map((style, i) => ({
    xFrac: xPositions[i],
    capWidthFrac: widths[i],
    capHue: hues[i],
    capStyle: style,
    stemHueOffset: rng() * 30 - 15,
    swayPhase: rng() * Math.PI * 2,
    bobSpeed: 0.012 + rng() * 0.018,
    glowSeed: rng() * Math.PI * 2,
    ringPos: 0.32 + rng() * 0.18,
    spotSeed: rng() * 1000,
    depth: depths[i],
  }));
}

function buildFerns(): FernSpec[] {
  const rng = seeded(2_115_881);
  return Array.from({ length: NUM_FERNS }, () => ({
    xFrac: rng(),
    size: 60 + rng() * 90,
    lean: (rng() - 0.5) * 35,
    fronds: 5 + Math.floor(rng() * 4),
  }));
}

function buildFronds(): FrondSpec[] {
  const rng = seeded(11_388_002);
  return Array.from({ length: NUM_FRONDS }, () => ({
    xFrac: rng(),
    baseY: 0.78 + rng() * 0.18,
    len: 30 + rng() * 60,
    lean: (rng() - 0.5) * 40,
    phase: rng() * Math.PI * 2,
  }));
}

function buildSpores(): SporeSpec[] {
  const rng = seeded(73_882_165);
  return Array.from({ length: NUM_SPORES }, () => ({
    xFrac: rng(),
    baseY: 0.40 + rng() * 0.50,
    speed: 0.0008 + rng() * 0.0024,
    size: 0.8 + rng() * 2.6,
    phase: rng() * Math.PI * 2,
    drift: 5 + rng() * 18,
    hue: rng() * 360,
  }));
}

function buildFairyLights(): FairyLight[] {
  const rng = seeded(55_211_904);
  return Array.from({ length: NUM_FAIRY }, () => ({
    xFrac: rng(),
    yFrac: 0.05 + rng() * 0.55,
    size: 1.2 + rng() * 3.0,
    speed: 0.02 + rng() * 0.06,
    phase: rng() * Math.PI * 2,
    hue: 30 + rng() * 60,
  }));
}

function buildGroundDetails(): GroundDetail[] {
  const rng = seeded(38_220_117);
  const types: GroundDetail["type"][] = ["moss", "stone", "leaf"];
  return Array.from({ length: NUM_GROUND_DETAILS }, () => ({
    xFrac: rng(),
    yOff: rng() * 24,
    size: 6 + rng() * 14,
    type: types[Math.floor(rng() * 3)],
    hue: 90 + rng() * 70,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const MushroomForest: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const mushrooms = React.useMemo(buildMushrooms, []);
  const ferns = React.useMemo(buildFerns, []);
  const fronds = React.useMemo(buildFronds, []);
  const spores = React.useMemo(buildSpores, []);
  const fairy = React.useMemo(buildFairyLights, []);
  const groundDetails = React.useMemo(buildGroundDetails, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const warmth = interpolate(snap.slowEnergy, [0.0, 0.32], [0.55, 1.10], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glow = interpolate(snap.energy, [0.0, 0.30], [0.45, 1.10], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stemPulse = 1 + snap.bass * 0.06;
  const capPulse = 1 + snap.beatDecay * 0.05;
  const sparkle = snap.onsetEnvelope > 0.45 ? Math.min(1, (snap.onsetEnvelope - 0.35) * 1.6) : 0;

  const baseHue = 280;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.40) % 360 + 360) % 360;
  const skyTop = `hsl(${(tintHue + 240) % 360}, 55%, 6%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 45%, 12%)`;
  const skyHorizon = `hsl(${(tintHue + 90) % 360}, 35%, 18%)`;
  const groundDark = `hsl(${(tintHue + 80) % 360}, 30%, 7%)`;
  const groundMid = `hsl(${(tintHue + 110) % 360}, 35%, 12%)`;

  const groundY = height * 0.84;

  // ─── MUSHROOM BUILDER ──────────────────────────────────────────────
  function buildMushroom(spec: MushroomSpec, idx: number): React.ReactNode {
    const cx = spec.xFrac * width;
    const sway = Math.sin(frame * 0.014 * tempoFactor + spec.swayPhase) * 5 * spec.depth;
    const bob = Math.sin(frame * spec.bobSpeed * tempoFactor + spec.swayPhase * 1.4) * 3 * spec.depth;

    const capW = width * spec.capWidthFrac * spec.depth * capPulse;
    const capH = capW * 0.62;
    const stemH = height * 0.22 * spec.depth * stemPulse;
    const stemW = capW * 0.18;
    const baseY = groundY - 6 + bob;
    const capY = baseY - stemH;

    const hue = (spec.capHue + (snap.chromaHue - 180) * 0.30 + 360) % 360;
    const stemHue = (hue + spec.stemHueOffset + 200) % 360;

    // Cap base colors per style
    let capCore: string;
    let capMid: string;
    let capRim: string;
    let spotColor = "rgba(255, 248, 240, 0.95)";
    let underGill = `hsl(${(hue + 30) % 360}, 40%, 62%)`;

    switch (spec.capStyle) {
      case "amanita":
        capCore = `hsl(${hue}, 92%, 62%)`;
        capMid = `hsl(${hue}, 88%, 48%)`;
        capRim = `hsl(${hue}, 78%, 32%)`;
        spotColor = "rgba(255, 252, 245, 0.96)";
        underGill = "hsl(50, 30%, 88%)";
        break;
      case "blue-oyster":
        capCore = `hsl(${hue}, 68%, 58%)`;
        capMid = `hsl(${hue}, 62%, 42%)`;
        capRim = `hsl(${(hue + 20) % 360}, 55%, 22%)`;
        spotColor = `hsl(${hue}, 30%, 78%)`;
        underGill = `hsl(${hue}, 25%, 70%)`;
        break;
      case "chanterelle":
        capCore = `hsl(${hue}, 92%, 64%)`;
        capMid = `hsl(${hue}, 90%, 50%)`;
        capRim = `hsl(${(hue - 12 + 360) % 360}, 80%, 30%)`;
        spotColor = `hsl(${hue}, 40%, 74%)`;
        underGill = `hsl(${(hue + 14) % 360}, 70%, 60%)`;
        break;
      case "morel":
        capCore = `hsl(${hue}, 60%, 48%)`;
        capMid = `hsl(${hue}, 50%, 32%)`;
        capRim = `hsl(${hue}, 40%, 16%)`;
        spotColor = `hsl(${hue}, 30%, 30%)`;
        underGill = `hsl(${hue}, 30%, 38%)`;
        break;
      case "violet":
        capCore = `hsl(${hue}, 78%, 64%)`;
        capMid = `hsl(${hue}, 72%, 44%)`;
        capRim = `hsl(${(hue + 16) % 360}, 60%, 24%)`;
        spotColor = `hsl(${(hue + 60) % 360}, 90%, 86%)`;
        underGill = `hsl(${(hue + 30) % 360}, 50%, 68%)`;
        break;
      default: // "white"
        capCore = "hsl(45, 60%, 92%)";
        capMid = "hsl(40, 35%, 78%)";
        capRim = "hsl(28, 45%, 50%)";
        spotColor = "hsl(28, 35%, 30%)";
        underGill = "hsl(45, 25%, 80%)";
    }

    const stemMid = `hsl(${stemHue}, 22%, 78%)`;
    const stemDark = `hsl(${stemHue}, 18%, 48%)`;
    const stemHi = `hsl(${stemHue}, 30%, 92%)`;

    const stemX = cx + sway;
    const capCx = stemX;
    const capCy = capY;

    // Cap silhouette: dome ellipse + slight skirt shadow underneath
    const dome = `M ${capCx - capW * 0.5} ${capCy + capH * 0.18}
      Q ${capCx - capW * 0.55} ${capCy - capH * 0.05}
        ${capCx - capW * 0.42} ${capCy - capH * 0.40}
      Q ${capCx - capW * 0.20} ${capCy - capH * 0.62}
        ${capCx} ${capCy - capH * 0.62}
      Q ${capCx + capW * 0.20} ${capCy - capH * 0.62}
        ${capCx + capW * 0.42} ${capCy - capH * 0.40}
      Q ${capCx + capW * 0.55} ${capCy - capH * 0.05}
        ${capCx + capW * 0.5} ${capCy + capH * 0.18}
      Q ${capCx + capW * 0.30} ${capCy + capH * 0.30}
        ${capCx} ${capCy + capH * 0.30}
      Q ${capCx - capW * 0.30} ${capCy + capH * 0.30}
        ${capCx - capW * 0.5} ${capCy + capH * 0.18} Z`;

    const stroke = "rgba(20, 12, 6, 0.85)";

    // Spots on cap
    const spotRng = seeded(spec.spotSeed);
    const numSpots = spec.capStyle === "amanita" ? 7
      : spec.capStyle === "morel" ? 0
      : spec.capStyle === "violet" ? 5
      : 4;
    const spots: React.ReactNode[] = [];
    for (let s = 0; s < numSpots; s++) {
      const sa = spotRng() * Math.PI * 0.9 - Math.PI * 0.05 - Math.PI * 0.4;
      const sr = spotRng() * capW * 0.32;
      const sx = capCx + Math.cos(sa) * sr;
      const sy = capCy - capH * 0.20 + Math.sin(sa) * sr * 0.6;
      const ss = capW * (0.04 + spotRng() * 0.05);
      spots.push(
        <ellipse key={`s-${idx}-${s}`} cx={sx} cy={sy} rx={ss} ry={ss * 0.85}
          fill={spotColor} stroke={stroke} strokeWidth={1.0} opacity={0.96} />,
      );
    }

    // Morel honeycomb pits
    const morelDetails: React.ReactNode[] = [];
    if (spec.capStyle === "morel") {
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 7; col++) {
          const px = capCx + (col - 3) * capW * 0.10 + (row % 2) * capW * 0.05;
          const py = capCy - capH * 0.40 + row * capH * 0.12;
          if (Math.abs(px - capCx) > capW * 0.42) continue;
          morelDetails.push(
            <ellipse key={`m-${idx}-${row}-${col}`} cx={px} cy={py} rx={capW * 0.05} ry={capH * 0.05}
              fill={`hsl(${hue}, 50%, ${22 + row * 3}%)`} stroke="rgba(10, 6, 2, 0.7)" strokeWidth={0.8} />,
          );
        }
      }
    }

    // Chanterelle ridges
    const ridgeDetails: React.ReactNode[] = [];
    if (spec.capStyle === "chanterelle") {
      for (let g = 0; g < 12; g++) {
        const a = (g / 11) * Math.PI - Math.PI;
        const x1 = capCx + Math.cos(a) * capW * 0.10;
        const y1 = capCy + capH * 0.16;
        const x2 = capCx + Math.cos(a) * capW * 0.45;
        const y2 = capCy + capH * 0.30 - Math.sin(a) * 4;
        ridgeDetails.push(
          <line key={`r-${idx}-${g}`} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={`hsl(${hue}, 80%, 36%)`} strokeWidth={1.4} opacity={0.8} />,
        );
      }
    }

    return (
      <g key={`mush-${idx}`}>
        {/* Bioluminescent ground glow */}
        <ellipse cx={stemX} cy={baseY + 4} rx={capW * 0.7} ry={10}
          fill={`hsl(${hue}, 80%, 52%)`} opacity={0.40 * glow * warmth}
          filter="url(#mushBlurLg)" />
        <ellipse cx={stemX} cy={baseY + 4} rx={capW * 0.32} ry={5}
          fill="rgba(0,0,0,0.7)" />

        {/* Stem with bulb */}
        <path d={`M ${stemX - stemW * 0.6} ${baseY}
          Q ${stemX - stemW * 1.1} ${baseY - 6} ${stemX - stemW * 0.85} ${baseY - stemH * 0.25}
          Q ${stemX - stemW * 0.55} ${baseY - stemH * 0.65} ${stemX - stemW * 0.45} ${capY + capH * 0.20}
          L ${stemX + stemW * 0.45} ${capY + capH * 0.20}
          Q ${stemX + stemW * 0.55} ${baseY - stemH * 0.65} ${stemX + stemW * 0.85} ${baseY - stemH * 0.25}
          Q ${stemX + stemW * 1.1} ${baseY - 6} ${stemX + stemW * 0.6} ${baseY} Z`}
          fill={stemMid} stroke={stroke} strokeWidth={1.6} />
        {/* Stem highlight */}
        <path d={`M ${stemX - stemW * 0.18} ${baseY - stemH * 0.05}
          Q ${stemX - stemW * 0.30} ${baseY - stemH * 0.5} ${stemX - stemW * 0.10} ${capY + capH * 0.20}`}
          stroke={stemHi} strokeWidth={2.2} fill="none" opacity={0.65} strokeLinecap="round" />
        {/* Stem shadow */}
        <path d={`M ${stemX + stemW * 0.18} ${baseY - stemH * 0.05}
          Q ${stemX + stemW * 0.30} ${baseY - stemH * 0.5} ${stemX + stemW * 0.10} ${capY + capH * 0.20}`}
          stroke={stemDark} strokeWidth={2.0} fill="none" opacity={0.45} strokeLinecap="round" />

        {/* Annulus / skirt ring */}
        <ellipse cx={stemX} cy={baseY - stemH * spec.ringPos}
          rx={stemW * 1.25} ry={stemW * 0.30}
          fill={stemMid} stroke={stroke} strokeWidth={1.2} />
        <ellipse cx={stemX} cy={baseY - stemH * spec.ringPos - stemW * 0.18}
          rx={stemW * 1.15} ry={stemW * 0.18}
          fill={stemHi} opacity={0.6} />

        {/* Gills under cap (visible curve at the cap base) */}
        <path d={`M ${capCx - capW * 0.46} ${capCy + capH * 0.16}
          Q ${capCx} ${capCy + capH * 0.32}
            ${capCx + capW * 0.46} ${capCy + capH * 0.16}`}
          fill={underGill} stroke={stroke} strokeWidth={1.4} opacity={0.85} />
        {Array.from({ length: 11 }).map((_, gi) => {
          const t = (gi / 10) - 0.5;
          const gx1 = capCx + t * capW * 0.85;
          const gy1 = capCy + capH * 0.22;
          const gx2 = capCx + t * capW * 0.55;
          const gy2 = capCy + capH * 0.30;
          return (
            <line key={`gill-${idx}-${gi}`} x1={gx1} y1={gy1} x2={gx2} y2={gy2}
              stroke={`hsl(${hue}, 25%, 28%)`} strokeWidth={0.8} opacity={0.7} />
          );
        })}

        {/* Cap dome */}
        <path d={dome} fill={`url(#capGrad-${idx})`} stroke={stroke} strokeWidth={2.0} />
        {/* Cap rim crescent */}
        <path d={`M ${capCx - capW * 0.46} ${capCy - capH * 0.03}
          Q ${capCx - capW * 0.30} ${capCy + capH * 0.10}
            ${capCx} ${capCy + capH * 0.16}
          Q ${capCx + capW * 0.30} ${capCy + capH * 0.10}
            ${capCx + capW * 0.46} ${capCy - capH * 0.03}`}
          stroke={capRim} strokeWidth={2.4} fill="none" opacity={0.85} />
        {/* Cap top sheen */}
        <ellipse cx={capCx - capW * 0.10} cy={capCy - capH * 0.42}
          rx={capW * 0.18} ry={capH * 0.10}
          fill="rgba(255, 255, 255, 0.40)" />

        {/* Style-specific details */}
        {morelDetails}
        {ridgeDetails}
        {spots}

        {/* Inner cap glow halo */}
        <ellipse cx={capCx} cy={capCy + capH * 0.28}
          rx={capW * 0.55} ry={capH * 0.22}
          fill={`hsl(${hue}, 80%, 60%)`} opacity={0.32 * glow}
          filter="url(#mushBlurLg)" />

        {/* Per-mushroom gradient def */}
      </g>
    );
  }

  // ─── FERN BUILDER ──
  const fernNodes = ferns.map((f, i) => {
    const fx = f.xFrac * width;
    const fy = groundY - 4;
    const sway2 = Math.sin(frame * 0.024 * tempoFactor + i * 1.4) * 6;
    const lean = f.lean + sway2;
    const fronds_: React.ReactNode[] = [];
    for (let j = 0; j < f.fronds; j++) {
      const pf = (j + 1) / (f.fronds + 1);
      const fy2 = fy - f.size * pf;
      const fx2L = fx + lean * pf - 18 - j * 4;
      const fx2R = fx + lean * pf + 18 + j * 4;
      fronds_.push(
        <line key={`L-${i}-${j}`} x1={fx + lean * pf * 0.5} y1={fy - f.size * pf * 0.6}
          x2={fx2L} y2={fy2} stroke={`hsl(${110 + j * 4}, 50%, 28%)`} strokeWidth={1.4} opacity={0.7} />,
        <line key={`R-${i}-${j}`} x1={fx + lean * pf * 0.5} y1={fy - f.size * pf * 0.6}
          x2={fx2R} y2={fy2} stroke={`hsl(${110 + j * 4}, 50%, 28%)`} strokeWidth={1.4} opacity={0.7} />,
      );
    }
    return (
      <g key={`fern-${i}`}>
        <path d={`M ${fx} ${fy} Q ${fx + lean * 0.5} ${fy - f.size * 0.6} ${fx + lean} ${fy - f.size}`}
          stroke="hsl(120, 55%, 22%)" strokeWidth={2.4} fill="none" strokeLinecap="round" />
        {fronds_}
      </g>
    );
  });

  // ─── FROND BUILDER (low foreground grass) ──
  const frondNodes = fronds.map((fr, i) => {
    const fx = fr.xFrac * width;
    const fy = fr.baseY * height;
    const sw = Math.sin(frame * 0.018 * tempoFactor + fr.phase) * 4;
    return (
      <path key={`fr-${i}`}
        d={`M ${fx} ${fy} Q ${fx + (fr.lean + sw) * 0.5} ${fy - fr.len * 0.5} ${fx + fr.lean + sw} ${fy - fr.len}`}
        stroke={`hsl(${100 + i * 3}, 45%, 24%)`} strokeWidth={1.8} fill="none" strokeLinecap="round" opacity={0.65} />
    );
  });

  // ─── SPORE BUILDER ──
  const sporeNodes = spores.map((sp, i) => {
    const t = (frame * sp.speed * tempoFactor + sp.phase) % 1;
    const sx = sp.xFrac * width + Math.sin(frame * 0.018 + sp.phase) * sp.drift;
    const sy = sp.baseY * height - t * height * 0.40;
    const flick = 0.5 + Math.sin(frame * 0.05 + sp.phase) * 0.5;
    const fadeT = Math.sin(t * Math.PI);
    const r = sp.size * (0.6 + glow * 0.6) * (1 + flick * 0.4);
    const hue = (sp.hue + (snap.chromaHue - 180) * 0.5) % 360;
    return (
      <g key={`spore-${i}`}>
        <circle cx={sx} cy={sy} r={r * 2.5}
          fill={`hsl(${hue}, 80%, 70%)`} opacity={0.18 * fadeT * glow}
          filter="url(#mushBlur)" />
        <circle cx={sx} cy={sy} r={r}
          fill={`hsl(${hue}, 90%, 80%)`} opacity={0.85 * fadeT} />
      </g>
    );
  });

  // ─── FAIRY LIGHTS ──
  const fairyNodes = fairy.map((fl, i) => {
    const flick = 0.5 + Math.sin(frame * fl.speed + fl.phase) * 0.5;
    const fr = fl.size * (0.7 + flick * 0.7);
    return (
      <g key={`fl-${i}`}>
        <circle cx={fl.xFrac * width} cy={fl.yFrac * height} r={fr * 3}
          fill={`hsl(${fl.hue}, 90%, 75%)`} opacity={0.35 * flick * warmth}
          filter="url(#mushBlur)" />
        <circle cx={fl.xFrac * width} cy={fl.yFrac * height} r={fr}
          fill={`hsl(${fl.hue}, 95%, 86%)`} opacity={0.92 * flick} />
      </g>
    );
  });

  // ─── GROUND DETAILS ──
  const groundNodes = groundDetails.map((g, i) => {
    const gx = g.xFrac * width;
    const gy = groundY + g.yOff + 8;
    if (g.type === "stone") {
      return (
        <ellipse key={`gd-${i}`} cx={gx} cy={gy} rx={g.size} ry={g.size * 0.5}
          fill={`hsl(${g.hue - 40}, 12%, 22%)`} stroke="rgba(0,0,0,0.6)" strokeWidth={0.8} />
      );
    }
    if (g.type === "leaf") {
      return (
        <ellipse key={`gd-${i}`} cx={gx} cy={gy} rx={g.size * 0.7} ry={g.size * 0.3}
          fill={`hsl(${g.hue}, 50%, 26%)`} opacity={0.7} />
      );
    }
    return (
      <circle key={`gd-${i}`} cx={gx} cy={gy} r={g.size * 0.4}
        fill={`hsl(${g.hue}, 55%, 22%)`} opacity={0.8} />
    );
  });

  // Sort mushrooms by depth so back ones render first
  const sortedMushrooms = [...mushrooms]
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.depth - b.m.depth);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="mush-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="mush-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={groundMid} />
            <stop offset="100%" stopColor={groundDark} />
          </linearGradient>
          <radialGradient id="mush-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>
          <filter id="mushBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id="mushBlurLg" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          {mushrooms.map((spec, i) => {
            const hue = (spec.capHue + (snap.chromaHue - 180) * 0.30 + 360) % 360;
            let inner: string;
            let middle: string;
            let outer: string;
            switch (spec.capStyle) {
              case "amanita":
                inner = `hsl(${hue}, 95%, 72%)`;
                middle = `hsl(${hue}, 92%, 52%)`;
                outer = `hsl(${hue}, 85%, 32%)`;
                break;
              case "blue-oyster":
                inner = `hsl(${hue}, 70%, 70%)`;
                middle = `hsl(${hue}, 65%, 50%)`;
                outer = `hsl(${(hue + 20) % 360}, 60%, 28%)`;
                break;
              case "chanterelle":
                inner = `hsl(${hue}, 95%, 72%)`;
                middle = `hsl(${hue}, 92%, 56%)`;
                outer = `hsl(${(hue - 12 + 360) % 360}, 80%, 34%)`;
                break;
              case "morel":
                inner = `hsl(${hue}, 60%, 56%)`;
                middle = `hsl(${hue}, 55%, 38%)`;
                outer = `hsl(${hue}, 45%, 18%)`;
                break;
              case "violet":
                inner = `hsl(${hue}, 85%, 72%)`;
                middle = `hsl(${hue}, 78%, 50%)`;
                outer = `hsl(${(hue + 16) % 360}, 65%, 28%)`;
                break;
              default:
                inner = "hsl(45, 75%, 96%)";
                middle = "hsl(40, 50%, 84%)";
                outer = "hsl(28, 45%, 56%)";
            }
            return (
              <radialGradient key={`cg-${i}`} id={`capGrad-${i}`} cx="40%" cy="35%" r="65%">
                <stop offset="0%" stopColor={inner} />
                <stop offset="55%" stopColor={middle} />
                <stop offset="100%" stopColor={outer} />
              </radialGradient>
            );
          })}
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#mush-sky)" />

        {/* Distant tree silhouettes */}
        <path d={`M 0 ${height * 0.74}
          L ${width * 0.05} ${height * 0.62}
          L ${width * 0.10} ${height * 0.68}
          L ${width * 0.16} ${height * 0.58}
          L ${width * 0.24} ${height * 0.66}
          L ${width * 0.32} ${height * 0.60}
          L ${width * 0.40} ${height * 0.65}
          L ${width * 0.50} ${height * 0.56}
          L ${width * 0.58} ${height * 0.64}
          L ${width * 0.66} ${height * 0.59}
          L ${width * 0.74} ${height * 0.66}
          L ${width * 0.82} ${height * 0.60}
          L ${width * 0.90} ${height * 0.65}
          L ${width} ${height * 0.62}
          L ${width} ${height * 0.84}
          L 0 ${height * 0.84} Z`}
          fill="rgba(15, 8, 22, 0.85)" />

        {/* Ground */}
        <rect x={0} y={groundY} width={width} height={height - groundY} fill="url(#mush-ground)" />

        {/* Background fairy lights */}
        <g style={{ mixBlendMode: "screen" }}>{fairyNodes}</g>

        {/* Background ferns */}
        <g opacity={0.85}>{fernNodes}</g>

        {/* Foreground fronds */}
        <g opacity={0.75}>{frondNodes}</g>

        {/* Mushrooms (back to front) */}
        {sortedMushrooms.map(({ m, i }) => buildMushroom(m, i))}

        {/* Ground details (in front of stems) */}
        {groundNodes}

        {/* Spore particles */}
        <g style={{ mixBlendMode: "screen" }}>{sporeNodes}</g>

        {/* Onset sparkle */}
        {sparkle > 0.05 && (
          <rect width={width} height={height}
            fill={`hsla(${tintHue}, 90%, 85%, ${sparkle * 0.10})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#mush-vig)" />
      </svg>
    </div>
  );
};
