/**
 * CampfireCircle — intimate acoustic campfire with seated silhouettes.
 * Layer 6, tier B, tags: dead-culture, contemplative.
 *
 * A+++ rewrite: stone fire pit ring, 6 organic bezier flame tongues with
 * bright inner cores + cooler outer edges, glowing coal bed, 14 rising ember
 * particles with glow trails, 3 smoke wisps, 8 seated silhouette figures
 * (some holding acoustic guitars), warm firelight pool, full audio reactivity.
 *
 * Represents the intimate acoustic Dead — unplugged, Garcia/Grisman, lot scene.
 * Position: bottom center. Low-energy overlay (opacity 0.10-0.30).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Color utilities                                                    */
/* ------------------------------------------------------------------ */

/** Map 0-1 hue + saturation + lightness to an RGB hex string */
function hslToHex(h: number, s = 0.85, l = 0.6): string {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) {
    r = c;
    g = x;
  } else if (sector === 1) {
    r = x;
    g = c;
  } else if (sector === 2) {
    g = c;
    b = x;
  } else if (sector === 3) {
    g = x;
    b = c;
  } else if (sector === 4) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Deterministic pseudo-random from seed */
function sRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const CampfireCircle: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const bass = snap.bass;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Low-energy overlay: opacity 0.10-0.30
  const opacity = interpolate(energy, [0.02, 0.3], [0.1, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fire flicker scale driven by energy and beat
  const fireScale = interpolate(energy, [0.0, 0.4], [0.85, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Breathe with slowEnergy
  const breathe = interpolate(slowEnergy, [0.02, 0.25], [0.95, 1.05], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fire glow radius
  const glowRadius = interpolate(energy, [0.05, 0.3], [6, 22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Warm amber palette, tinted slightly by chromaHue
  const fireOuter = hslToHex(0.06 + chromaHue * 0.04, 0.9, 0.55); // orange
  const fireDeep = hslToHex(0.04 + chromaHue * 0.03, 0.92, 0.45); // deep amber
  const fireYellow = hslToHex(0.11 + chromaHue * 0.04, 0.88, 0.6); // yellow-orange
  const fireCore = hslToHex(0.13 + chromaHue * 0.02, 0.7, 0.82); // yellow-white core
  const emberColor = hslToHex(0.03 + chromaHue * 0.02, 0.95, 0.5); // deep red-orange
  const coalGlow = hslToHex(0.02 + chromaHue * 0.01, 0.9, 0.35); // dark red coal
  const smokeColor = "#8a7a6a";

  /* ---------------------------------------------------------------- */
  /*  Flicker offsets — 6 independent channels                        */
  /* ---------------------------------------------------------------- */
  const t = frame * tempoFactor;
  const flk = (freq: number, phase: number) =>
    Math.sin(t * freq + phase) + beatDecay * 0.6;
  const f0 = flk(0.15, 0.0) * 4;
  const f1 = flk(0.12, 1.2) * 5;
  const f2 = flk(0.18, 2.5) * 3;
  const f3 = flk(0.10, 0.7) * 4;
  const f4 = flk(0.14, 3.8) * 3.5;
  const f5 = flk(0.11, 5.1) * 4.5;

  /* ---------------------------------------------------------------- */
  /*  Stone ring — 9 irregular stones                                  */
  /* ---------------------------------------------------------------- */
  const stones: React.ReactNode[] = [];
  const stoneCount = 9;
  for (let i = 0; i < stoneCount; i++) {
    const angle = (i / stoneCount) * Math.PI * 2 - Math.PI * 0.5;
    const rBase = 17;
    const rVar = sRand(i * 7 + 3) * 3 - 1.5;
    const sx = 100 + Math.cos(angle) * (rBase + rVar);
    const sy = 162 + Math.sin(angle) * (rBase + rVar) * 0.3;
    const rw = 3.5 + sRand(i * 13 + 1) * 2.5;
    const rh = 2.2 + sRand(i * 17 + 5) * 1.2;
    const rot = sRand(i * 23 + 11) * 30 - 15;
    const shade = 0.22 + sRand(i * 31 + 7) * 0.12;
    stones.push(
      <ellipse
        key={`stone-${i}`}
        cx={sx}
        cy={sy}
        rx={rw}
        ry={rh}
        transform={`rotate(${rot} ${sx} ${sy})`}
        fill={`rgba(${Math.round(shade * 255)},${Math.round(shade * 220)},${Math.round(shade * 180)},0.85)`}
        stroke={`rgba(${Math.round(shade * 180)},${Math.round(shade * 150)},${Math.round(shade * 120)},0.4)`}
        strokeWidth="0.4"
      />,
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Coal bed glow — radial gradient at fire base                     */
  /* ---------------------------------------------------------------- */
  const coalPulse = 0.5 + energy * 0.3 + beatDecay * 0.2;

  /* ---------------------------------------------------------------- */
  /*  Flame tongues — 6 organic bezier shapes with core+outer          */
  /* ---------------------------------------------------------------- */
  const eH = energy * 10; // energy-driven height boost

  const flameData: {
    outer: string;
    core: string;
    outerFill: string;
    coreFill: string;
    coreOpacity: number;
  }[] = [
    // Flame 0 — center tall
    {
      outer: `M 0,0 C ${-4 + f0 * 0.4},${-12 - eH} ${-2 + f1 * 0.3},${-28 - eH * 1.3} ${f0 * 0.5},${-34 - eH * 1.5} C ${3 + f2 * 0.2},${-22 - eH} ${2 + f3 * 0.2},${-10 - eH * 0.5} 0,0`,
      core: `M 0,-1 C ${-1.5 + f0 * 0.15},${-10 - eH * 0.6} ${-0.5 + f1 * 0.1},${-20 - eH * 0.8} ${f0 * 0.2},${-26 - eH} C ${1.5 + f2 * 0.1},${-15 - eH * 0.5} ${1 + f3 * 0.1},${-7 - eH * 0.3} 0,-1`,
      outerFill: fireOuter,
      coreFill: fireCore,
      coreOpacity: 0.7 + beatDecay * 0.3,
    },
    // Flame 1 — left leaning
    {
      outer: `M -4,0 C ${-10 + f1 * 0.4},${-10 - eH * 0.7} ${-8 + f2 * 0.3},${-22 - eH} ${-5 + f3 * 0.4},${-28 - eH * 1.2} C ${-2 + f0 * 0.2},${-16 - eH * 0.6} ${-1 + f1 * 0.15},${-6 - eH * 0.3} -4,0`,
      core: `M -4,-1 C ${-7 + f1 * 0.2},${-8 - eH * 0.4} ${-6 + f2 * 0.15},${-16 - eH * 0.6} ${-4.5 + f3 * 0.2},${-20 - eH * 0.7} C ${-2.5 + f0 * 0.1},${-11 - eH * 0.4} ${-2 + f1 * 0.1},${-5 - eH * 0.2} -4,-1`,
      outerFill: fireDeep,
      coreFill: fireCore,
      coreOpacity: 0.6 + beatDecay * 0.25,
    },
    // Flame 2 — right leaning
    {
      outer: `M 4,0 C ${9 + f2 * 0.4},${-9 - eH * 0.6} ${7 + f3 * 0.35},${-20 - eH * 0.9} ${5 + f4 * 0.4},${-26 - eH * 1.1} C ${3 + f1 * 0.2},${-14 - eH * 0.5} ${2 + f0 * 0.15},${-5 - eH * 0.25} 4,0`,
      core: `M 4,-1 C ${7 + f2 * 0.2},${-7 - eH * 0.35} ${6 + f3 * 0.18},${-14 - eH * 0.5} ${4.8 + f4 * 0.2},${-18 - eH * 0.6} C ${3 + f1 * 0.1},${-10 - eH * 0.3} ${2.5 + f0 * 0.1},${-4 - eH * 0.15} 4,-1`,
      outerFill: fireYellow,
      coreFill: fireCore,
      coreOpacity: 0.65 + beatDecay * 0.25,
    },
    // Flame 3 — far left small
    {
      outer: `M -7,0 C ${-12 + f3 * 0.3},${-7 - eH * 0.4} ${-10 + f4 * 0.25},${-15 - eH * 0.6} ${-7 + f5 * 0.3},${-19 - eH * 0.7} C ${-5 + f2 * 0.15},${-10 - eH * 0.3} ${-5 + f0 * 0.1},${-4 - eH * 0.15} -7,0`,
      core: `M -7,-1 C ${-9.5 + f3 * 0.15},${-5 - eH * 0.2} ${-8.5 + f4 * 0.12},${-10 - eH * 0.3} ${-7 + f5 * 0.15},${-13 - eH * 0.4} C ${-5.5 + f2 * 0.08},${-7 - eH * 0.2} ${-5.8 + f0 * 0.06},${-3 - eH * 0.1} -7,-1`,
      outerFill: fireDeep,
      coreFill: "#ffe8b0",
      coreOpacity: 0.55 + beatDecay * 0.2,
    },
    // Flame 4 — far right small
    {
      outer: `M 7,0 C ${11 + f4 * 0.3},${-6 - eH * 0.35} ${10 + f5 * 0.25},${-14 - eH * 0.55} ${7.5 + f0 * 0.3},${-18 - eH * 0.65} C ${5.5 + f3 * 0.15},${-9 - eH * 0.3} ${5 + f1 * 0.1},${-3 - eH * 0.12} 7,0`,
      core: `M 7,-1 C ${9.5 + f4 * 0.15},${-4.5 - eH * 0.2} ${8.8 + f5 * 0.12},${-9.5 - eH * 0.3} ${7.3 + f0 * 0.15},${-12 - eH * 0.35} C ${5.8 + f3 * 0.08},${-6.5 - eH * 0.18} ${5.5 + f1 * 0.06},${-2.5 - eH * 0.08} 7,-1`,
      outerFill: fireOuter,
      coreFill: "#ffe8b0",
      coreOpacity: 0.55 + beatDecay * 0.2,
    },
    // Flame 5 — wispy center-right
    {
      outer: `M 2,0 C ${6 + f5 * 0.35},${-8 - eH * 0.5} ${4 + f0 * 0.3},${-18 - eH * 0.8} ${2 + f1 * 0.35},${-24 - eH} C ${0 + f4 * 0.15},${-13 - eH * 0.45} ${1 + f2 * 0.1},${-5 - eH * 0.2} 2,0`,
      core: `M 2,-1 C ${4 + f5 * 0.18},${-6 - eH * 0.3} ${3 + f0 * 0.15},${-13 - eH * 0.45} ${2 + f1 * 0.18},${-17 - eH * 0.55} C ${1 + f4 * 0.08},${-9 - eH * 0.25} ${1.5 + f2 * 0.06},${-4 - eH * 0.12} 2,-1`,
      outerFill: fireYellow,
      coreFill: fireCore,
      coreOpacity: 0.6 + beatDecay * 0.25,
    },
  ];

  const flameElements: React.ReactNode[] = flameData.map((fl, i) => (
    <g key={`flame-${i}`}>
      <path d={fl.outer} fill={fl.outerFill} opacity={0.85} />
      <path d={fl.core} fill={fl.coreFill} opacity={fl.coreOpacity} />
    </g>
  ));

  /* ---------------------------------------------------------------- */
  /*  Embers — 14 rising particles with glow                          */
  /* ---------------------------------------------------------------- */
  const emberCount = 14;
  const embers: React.ReactNode[] = [];
  for (let i = 0; i < emberCount; i++) {
    const seed = sRand(i * 37 + 19);
    const speed = 0.3 + seed * 0.25;
    const phase = seed * 60;
    const maxRise = 90 + seed * 30;
    const yOffset = ((frame * speed * tempoFactor + phase) % maxRise);
    const xStart = (seed - 0.5) * 14; // spread around fire center
    const xDrift = Math.sin(frame * 0.04 * tempoFactor + i * 1.7) * (6 + seed * 8);
    const progress = yOffset / maxRise;
    const emberOpacity =
      interpolate(
        progress,
        [0, 0.1, 0.7, 1.0],
        [0, 0.9, 0.35, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      ) *
      (0.5 + energy * 0.5) *
      (0.7 + bass * 0.3);
    const emberSize = interpolate(progress, [0, 0.3, 1], [1.6, 1.2, 0.5], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    embers.push(
      <g key={`ember-${i}`}>
        {/* Glow trail */}
        <circle
          cx={100 + xStart + xDrift}
          cy={155 - yOffset}
          r={emberSize * 2.5}
          fill={emberColor}
          opacity={emberOpacity * 0.25}
          filter="url(#emberGlow)"
        />
        {/* Bright core */}
        <circle
          cx={100 + xStart + xDrift}
          cy={155 - yOffset}
          r={emberSize}
          fill={emberColor}
          opacity={emberOpacity}
        />
        {/* Hot center dot */}
        <circle
          cx={100 + xStart + xDrift}
          cy={155 - yOffset}
          r={emberSize * 0.4}
          fill="#ffe080"
          opacity={emberOpacity * 0.8}
        />
      </g>,
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Smoke wisps — 3 thin bezier paths rising above flames            */
  /* ---------------------------------------------------------------- */
  const smokeWisps: React.ReactNode[] = [];
  for (let i = 0; i < 3; i++) {
    const seed = sRand(i * 53 + 41);
    const xBase = 96 + i * 4 + (seed - 0.5) * 6;
    const drift = Math.sin(frame * 0.03 * tempoFactor + i * 2.1) * 8;
    const drift2 = Math.cos(frame * 0.025 * tempoFactor + i * 3.4) * 5;
    const smokeY = -40 - energy * 12;
    const smokeOpacity =
      interpolate(energy, [0.02, 0.2], [0.04, 0.12], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }) + slowEnergy * 0.04;

    smokeWisps.push(
      <path
        key={`smoke-${i}`}
        d={`M ${xBase},${155 + smokeY * 0.3} C ${xBase + drift * 0.5},${140 + smokeY * 0.5} ${xBase + drift},${120 + smokeY * 0.7} ${xBase + drift + drift2},${100 + smokeY}`}
        stroke={smokeColor}
        strokeWidth={1.2 + seed * 0.8}
        fill="none"
        opacity={smokeOpacity}
        strokeLinecap="round"
        filter="url(#smokeBlur)"
      />,
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Seated silhouettes — 8 figures, some with guitars                */
  /* ---------------------------------------------------------------- */
  const figureCount = 8;
  const silhouettes: React.ReactNode[] = [];

  // Which figures hold guitars (indices)
  const guitarHolders = new Set([1, 3, 6]);

  for (let i = 0; i < figureCount; i++) {
    const angle = (i / figureCount) * Math.PI * 2 - Math.PI * 0.45;
    const radius = 42 + sRand(i * 11 + 2) * 5;
    const sx = 100 + Math.cos(angle) * radius;
    const sy = 161 + Math.sin(angle) * radius * 0.3;

    // Gentle lean/sway toward fire
    const lean = Math.sin(frame * 0.02 * tempoFactor + i * 1.8) * 1.2;
    // Firelight highlight on fire-facing side
    const fireAngle = Math.atan2(162 - sy, 100 - sx);
    const highlightX = sx + Math.cos(fireAngle) * 3;
    const highlightY = sy - 7 + Math.sin(fireAngle) * 2;
    const highlightOpacity = interpolate(energy, [0.02, 0.25], [0.08, 0.25], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    const hasGuitar = guitarHolders.has(i);

    // Body scale (perspective: further = smaller)
    const depth = 1 - Math.abs(Math.sin(angle)) * 0.15;

    silhouettes.push(
      <g
        key={`figure-${i}`}
        opacity={0.72}
        transform={`translate(${lean}, 0)`}
      >
        {/* Seated body — proper curved silhouette */}
        {/* Torso */}
        <path
          d={`M ${sx},${sy - 5} C ${sx - 3 * depth},${sy - 8 * depth} ${sx - 2 * depth},${sy - 13 * depth} ${sx},${sy - 14 * depth} C ${sx + 2 * depth},${sy - 13 * depth} ${sx + 3 * depth},${sy - 8 * depth} ${sx},${sy - 5}`}
          fill="#1a1a1a"
        />
        {/* Shoulders (wider ellipse) */}
        <ellipse
          cx={sx}
          cy={sy - 10 * depth}
          rx={5 * depth}
          ry={1.8 * depth}
          fill="#1a1a1a"
        />
        {/* Head */}
        <circle
          cx={sx}
          cy={sy - 16 * depth}
          r={3 * depth}
          fill="#1a1a1a"
        />
        {/* Seated legs — folded/crossed curves */}
        <path
          d={`M ${sx - 3},${sy - 5} Q ${sx - 7 * depth},${sy - 1} ${sx - 8 * depth},${sy + 2} Q ${sx - 6 * depth},${sy + 4} ${sx - 3 * depth},${sy + 3}`}
          fill="#1a1a1a"
        />
        <path
          d={`M ${sx + 3},${sy - 5} Q ${sx + 6 * depth},${sy - 1} ${sx + 7 * depth},${sy + 2} Q ${sx + 5 * depth},${sy + 4} ${sx + 2 * depth},${sy + 3}`}
          fill="#1a1a1a"
        />

        {/* Arms */}
        {hasGuitar ? (
          <>
            {/* Guitar body — small ellipse on lap */}
            <ellipse
              cx={sx + 4 * Math.cos(angle) * depth}
              cy={sy - 4 * depth}
              rx={4.5 * depth}
              ry={2.5 * depth}
              fill="#2a2218"
              transform={`rotate(${-15 + lean * 2} ${sx + 4 * Math.cos(angle) * depth} ${sy - 4 * depth})`}
            />
            {/* Guitar neck */}
            <line
              x1={sx + 4 * Math.cos(angle) * depth - 3 * depth}
              y1={sy - 5 * depth}
              x2={sx + 4 * Math.cos(angle) * depth - 10 * depth}
              y2={sy - 12 * depth}
              stroke="#2a2218"
              strokeWidth={1 * depth}
              strokeLinecap="round"
            />
            {/* Fretting arm */}
            <path
              d={`M ${sx - 4 * depth},${sy - 9 * depth} Q ${sx - 6 * depth},${sy - 7 * depth} ${sx + 4 * Math.cos(angle) * depth - 7 * depth},${sy - 10 * depth}`}
              stroke="#1a1a1a"
              strokeWidth={1.5 * depth}
              fill="none"
              strokeLinecap="round"
            />
            {/* Strumming arm */}
            <path
              d={`M ${sx + 4 * depth},${sy - 9 * depth} Q ${sx + 5 * depth},${sy - 6 * depth} ${sx + 4 * Math.cos(angle) * depth + 1},${sy - 4 * depth}`}
              stroke="#1a1a1a"
              strokeWidth={1.5 * depth}
              fill="none"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            {/* Resting arms — one on knee, one at side */}
            <path
              d={`M ${sx - 4 * depth},${sy - 9 * depth} Q ${sx - 6 * depth},${sy - 5 * depth} ${sx - 7 * depth},${sy}`}
              stroke="#1a1a1a"
              strokeWidth={1.4 * depth}
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={`M ${sx + 4 * depth},${sy - 9 * depth} Q ${sx + 5 * depth},${sy - 6 * depth} ${sx + 5 * depth},${sy - 2 * depth}`}
              stroke="#1a1a1a"
              strokeWidth={1.4 * depth}
              fill="none"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Warm firelight highlight on fire-facing side */}
        <circle
          cx={highlightX}
          cy={highlightY}
          r={5 * depth}
          fill={fireOuter}
          opacity={highlightOpacity}
          filter="url(#fireHighlight)"
        />
      </g>,
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Warm light pool radiating from fire                              */
  /* ---------------------------------------------------------------- */
  const lightPoolRadius = 55 + energy * 20 + slowEnergy * 10;

  const baseSize = Math.min(width, height) * 0.38;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: height * 0.04,
      }}
    >
      <div
        style={{
          transform: `scale(${breathe})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${fireOuter})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <svg
          width={baseSize}
          height={baseSize * 0.8}
          viewBox="0 0 200 200"
          fill="none"
        >
          <defs>
            {/* Ember glow filter */}
            <filter id="emberGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="1.5" />
            </filter>
            {/* Smoke blur filter */}
            <filter id="smokeBlur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" />
            </filter>
            {/* Firelight highlight blur */}
            <filter id="fireHighlight" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
            {/* Warm radial light pool gradient */}
            <radialGradient id="lightPool" cx="50%" cy="80%" r="50%">
              <stop
                offset="0%"
                stopColor={fireOuter}
                stopOpacity={0.18 + energy * 0.1}
              />
              <stop
                offset="40%"
                stopColor={fireDeep}
                stopOpacity={0.08 + energy * 0.04}
              />
              <stop offset="100%" stopColor={fireDeep} stopOpacity="0" />
            </radialGradient>
            {/* Coal bed gradient */}
            <radialGradient id="coalBed" cx="50%" cy="50%" r="50%">
              <stop
                offset="0%"
                stopColor={fireCore}
                stopOpacity={0.6 * coalPulse}
              />
              <stop
                offset="35%"
                stopColor={coalGlow}
                stopOpacity={0.45 * coalPulse}
              />
              <stop
                offset="70%"
                stopColor={coalGlow}
                stopOpacity={0.15 * coalPulse}
              />
              <stop offset="100%" stopColor={coalGlow} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Warm light pool on ground */}
          <ellipse
            cx="100"
            cy="165"
            rx={lightPoolRadius}
            ry={lightPoolRadius * 0.28}
            fill="url(#lightPool)"
          />

          {/* Seated silhouettes (behind fire) — those in back half */}
          {silhouettes.filter((_, i) => {
            const angle = (i / figureCount) * Math.PI * 2 - Math.PI * 0.45;
            return Math.sin(angle) < -0.1; // above center = behind fire
          })}

          {/* Stone ring */}
          {stones}

          {/* Coal bed glow at fire base */}
          <ellipse
            cx="100"
            cy="159"
            rx={13 + energy * 3}
            ry={4.5 + energy * 1}
            fill="url(#coalBed)"
          />
          {/* Coal texture — small dark spots */}
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const cx = 94 + sRand(i * 67 + 33) * 12;
            const cy = 157 + sRand(i * 41 + 17) * 4;
            return (
              <circle
                key={`coal-${i}`}
                cx={cx}
                cy={cy}
                r={0.8 + sRand(i * 29 + 7) * 1}
                fill={coalGlow}
                opacity={0.3 + beatDecay * 0.3 + sRand(i * 19 + 3) * 0.2}
              />
            );
          })}

          {/* Fire glow on ground */}
          <ellipse
            cx="100"
            cy="161"
            rx={22 + energy * 10}
            ry={6 + energy * 2.5}
            fill={fireOuter}
            opacity={0.12 + energy * 0.1}
            filter="url(#fireHighlight)"
          />

          {/* Flame tongues */}
          <g transform={`translate(100, 158) scale(${fireScale})`}>
            {flameElements}
          </g>

          {/* Smoke wisps above flames */}
          {smokeWisps}

          {/* Embers */}
          {embers}

          {/* Seated silhouettes (in front of fire) — those in front half */}
          {silhouettes.filter((_, i) => {
            const angle = (i / figureCount) * Math.PI * 2 - Math.PI * 0.45;
            return Math.sin(angle) >= -0.1; // below center = in front
          })}
        </svg>
      </div>
    </div>
  );
};
