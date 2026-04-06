/**
 * SpeakerStack — A single focused speaker cabinet stack.
 * Layer 4, tier A, tags: intense, dead-culture.
 * Tall vertical stack: amp head on top, 2x3 tweeter cab, 2x2 mid cab, 2x2 sub cab.
 * Each cab: dark tolex body, inner bezel, corner screws, detailed speaker cones.
 * Speaker cones: frame ring, rubber surround, cone body with radial lines,
 *   dust cap with specular highlight.
 * XLR/speaker cables running down the side, ground reflection glow beneath.
 * Bass drives cone excursion + cabinet shake, beatDecay pulses glow,
 *   chromaHue colors, energy drives visibility.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

// ── SPEAKER CONE ────────────────────────────────────────────────
// Frame ring, rubber surround, radial lines, dust cap + specular.

const RADIAL_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const CONE_RINGS = [0.45, 0.6, 0.75];

const SpeakerCone: React.FC<{
  cx: number; cy: number; r: number;
  color: string; glowColor: string;
  excursion: number; brightness: number;
}> = ({ cx, cy, r, color, glowColor, excursion, brightness }) => {
  const coneDepth = r * 0.15 * excursion;
  const dustCapR = r * 0.22;
  const surroundR = r * 0.92;
  const br = brightness;

  return (
    <g>
      {/* Outer frame ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={1.2} opacity={0.5 * br} />
      {/* Rubber surround — thick ridge */}
      <circle cx={cx} cy={cy} r={surroundR} fill="none" stroke={color} strokeWidth={2.5} opacity={0.2 * br} />
      {/* Surround inner shadow */}
      <circle cx={cx} cy={cy} r={surroundR - 1.5} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={0.8} opacity={br} />
      {/* Radial lines — paper cone texture */}
      {RADIAL_ANGLES.map((a) => {
        const rad = (a * Math.PI) / 180;
        return (
          <line key={a}
            x1={cx + Math.cos(rad) * (dustCapR + 1)} y1={cy + Math.sin(rad) * (dustCapR + 1)}
            x2={cx + Math.cos(rad) * (surroundR - 2)} y2={cy + Math.sin(rad) * (surroundR - 2)}
            stroke={color} strokeWidth={0.4} opacity={0.12 * br} />
        );
      })}
      {/* Cone surface fill */}
      <circle cx={cx} cy={cy} r={surroundR - 2}
        fill={`rgba(${20 + excursion * 30},${20 + excursion * 20},${30 + excursion * 20},${0.08 * br})`} />
      {/* Concentric rings — paper texture */}
      {CONE_RINGS.map((f) => (
        <circle key={f} cx={cx} cy={cy} r={surroundR * f} fill="none" stroke={color} strokeWidth={0.3} opacity={0.06 * br} />
      ))}
      {/* Dust cap — pushes out on bass */}
      <circle cx={cx} cy={cy} r={dustCapR + coneDepth} fill={glowColor} opacity={0.25 + excursion * 0.3} />
      <circle cx={cx} cy={cy} r={dustCapR + coneDepth} fill="none" stroke={color} strokeWidth={1} opacity={0.6 * br} />
      {/* Specular highlights */}
      <circle cx={cx - dustCapR * 0.25} cy={cy - dustCapR * 0.25} r={dustCapR * 0.18} fill="white" opacity={0.08 + excursion * 0.14} />
      <circle cx={cx - dustCapR * 0.15} cy={cy - dustCapR * 0.35} r={dustCapR * 0.08} fill="white" opacity={0.04 + excursion * 0.08} />
    </g>
  );
};

// ── SPEAKER CABINET ─────────────────────────────────────────────
// Tolex body, inner bezel, grille, speaker grid, Phillips-head screws.

const Cabinet: React.FC<{
  x: number; y: number; w: number; h: number;
  color: string; glowColor: string;
  bass: number; beatDecay: number; brightness: number;
  rows: number; cols: number;
}> = ({ x, y, w, h, color, glowColor, bass, beatDecay, brightness: br, rows, cols }) => {
  const padX = 8, padY = 8;
  const innerW = w - padX * 2, innerH = h - padY * 2;
  const coneR = Math.min(innerW / (cols * 2), innerH / (rows * 2)) * 0.85;
  const excursion = bass * 0.6 + beatDecay * 0.4;
  const screws: [number, number][] = [[x+6,y+6],[x+w-6,y+6],[x+6,y+h-6],[x+w-6,y+h-6]];

  return (
    <g>
      {/* Cabinet body */}
      <rect x={x} y={y} width={w} height={h} rx={3} fill="rgba(8,8,12,0.85)" stroke={color} strokeWidth={1.5} opacity={0.7 * br} />
      {/* Inner bezel */}
      <rect x={x+4} y={y+4} width={w-8} height={h-8} rx={2} fill="none" stroke={color} strokeWidth={0.6} opacity={0.25 * br} />
      {/* Tolex texture — horizontal */}
      {Array.from({ length: Math.floor(h / 6) }, (_, i) => (
        <line key={`h${i}`} x1={x+5} y1={y+5+i*6} x2={x+w-5} y2={y+5+i*6} stroke={color} strokeWidth={0.3} opacity={0.035 * br} />
      ))}
      {/* Tolex texture — vertical cross-hatch */}
      {Array.from({ length: Math.floor(w / 10) }, (_, i) => (
        <line key={`v${i}`} x1={x+5+i*10} y1={y+5} x2={x+5+i*10} y2={y+h-5} stroke={color} strokeWidth={0.2} opacity={0.02 * br} />
      ))}
      {/* Grille cloth region */}
      <rect x={x+padX-2} y={y+padY-2} width={innerW+4} height={innerH+4} rx={2} fill="rgba(0,0,0,0.15)" stroke={color} strokeWidth={0.3} opacity={0.3 * br} />
      {/* Speaker cones */}
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => (
          <SpeakerCone key={`${row}-${col}`}
            cx={x + padX + (col + 0.5) * (innerW / cols)}
            cy={y + padY + (row + 0.5) * (innerH / rows)}
            r={coneR} color={color} glowColor={glowColor} excursion={excursion} brightness={br} />
        ))
      )}
      {/* Phillips-head corner screws */}
      {screws.map(([sx, sy], i) => (
        <g key={`s${i}`}>
          <circle cx={sx} cy={sy} r={2.2} fill={color} opacity={0.25 * br} />
          <circle cx={sx} cy={sy} r={2.2} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={0.5} />
          <line x1={sx-1.2} y1={sy} x2={sx+1.2} y2={sy} stroke="black" strokeWidth={0.5} opacity={0.4} />
          <line x1={sx} y1={sy-1.2} x2={sx} y2={sy+1.2} stroke="black" strokeWidth={0.5} opacity={0.4} />
        </g>
      ))}
    </g>
  );
};

// ── AMP HEAD ────────────────────────────────────────────────────
// Knobs, indicator LEDs, vent slots, brand text.

const AmpHead: React.FC<{
  x: number; y: number; w: number; h: number;
  color: string; energy: number; beatDecay: number; brightness: number;
}> = ({ x, y, w, h, color, energy, beatDecay, brightness: br }) => {
  const knobCount = 6;
  const knobSpacing = (w - 20) / (knobCount - 1);
  const ledOn = energy > 0.15, clipLed = energy > 0.7;
  const ampScrews: [number, number][] = [[x+4,y+4],[x+w-4,y+4],[x+4,y+h-4],[x+w-4,y+h-4]];

  return (
    <g>
      {/* Amp body */}
      <rect x={x} y={y} width={w} height={h} rx={2} fill="rgba(12,12,16,0.9)" stroke={color} strokeWidth={1.2} opacity={0.7 * br} />
      {/* Face plate */}
      <rect x={x+3} y={y+3} width={w-6} height={h-6} rx={1.5} fill="none" stroke={color} strokeWidth={0.4} opacity={0.2 * br} />
      {/* Vent slots */}
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={`v${i}`} x={x+12+i*((w-24)/7)} y={y+2} width={4} height={1.2} rx={0.6}
          fill="rgba(0,0,0,0.5)" stroke={color} strokeWidth={0.2} opacity={0.15 * br} />
      ))}
      {/* Knobs */}
      {Array.from({ length: knobCount }, (_, i) => {
        const kx = x + 10 + i * knobSpacing, ky = y + h * 0.55;
        const rad = ((-120 + i * 40 + energy * 30) * Math.PI) / 180;
        return (
          <g key={`k${i}`}>
            <circle cx={kx} cy={ky} r={3.5} fill="rgba(30,30,35,0.9)" stroke={color} strokeWidth={0.6} opacity={0.5 * br} />
            <circle cx={kx} cy={ky} r={2.8} fill="rgba(20,20,25,0.9)" stroke={color} strokeWidth={0.3} opacity={0.4 * br} />
            <line x1={kx} y1={ky} x2={kx+Math.cos(rad)*2.8} y2={ky+Math.sin(rad)*2.8} stroke="white" strokeWidth={0.6} opacity={0.35 * br} />
          </g>
        );
      })}
      {/* Power LED — green */}
      <circle cx={x+w-12} cy={y+h*0.35} r={1.5} fill={ledOn ? "#00ff44" : "#113311"} opacity={ledOn ? 0.6+beatDecay*0.3 : 0.15} />
      {ledOn && <circle cx={x+w-12} cy={y+h*0.35} r={3} fill="#00ff44" opacity={0.1+beatDecay*0.1} />}
      {/* Clip LED — red */}
      <circle cx={x+w-20} cy={y+h*0.35} r={1.5} fill={clipLed ? "#ff2200" : "#331111"} opacity={clipLed ? 0.6+beatDecay*0.4 : 0.1} />
      {clipLed && <circle cx={x+w-20} cy={y+h*0.35} r={3} fill="#ff2200" opacity={0.1+beatDecay*0.15} />}
      {/* Brand text */}
      <text x={x+14} y={y+h*0.38} fontSize={4} fill={color} opacity={0.2 * br}
        fontFamily="'Georgia', serif" fontWeight="bold" letterSpacing={1.5}>DEAD AIR</text>
      {/* Corner screws */}
      {ampScrews.map(([sx, sy], i) => (
        <g key={`as${i}`}>
          <circle cx={sx} cy={sy} r={1.5} fill={color} opacity={0.2 * br} />
          <line x1={sx-0.8} y1={sy} x2={sx+0.8} y2={sy} stroke="black" strokeWidth={0.4} opacity={0.3} />
        </g>
      ))}
    </g>
  );
};

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props { frames: EnhancedFrameData[] }

export const SpeakerStack: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, bass, chromaHue, beatDecay } = snap;

  const opacity = interpolate(energy, [0.02, 0.3], [0.25, 0.65], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const brightness = interpolate(energy, [0.1, 0.4], [0.4, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const color = `hsl(${chromaHue}, 70%, ${45 + beatDecay * 10}%)`;
  const glowColor = `hsl(${chromaHue}, 80%, ${55 + beatDecay * 15}%)`;

  // Cabinet vibration on bass hits
  const shakeX = Math.sin(frame * 0.8 * tempoFactor) * bass * 1.2 + Math.sin(frame * 1.7 * tempoFactor) * beatDecay * 0.5;
  const shakeY = Math.cos(frame * 0.6 * tempoFactor) * bass * 0.6;
  const glowSpread = 6 + bass * 14 + beatDecay * 8;
  const outerGlow = 15 + energy * 25;
  const stackFilter = `drop-shadow(0 0 ${glowSpread}px ${glowColor}) drop-shadow(0 0 ${outerGlow}px hsl(${chromaHue}, 60%, 35%))`;

  // Stack layout — viewBox 0 0 120 260, bottom to top: sub, mid, tweeter, amp
  const vbW = 120, vbH = 260, cabW = 100, cabX = (vbW - cabW) / 2;
  const subH = 70, midH = 65, tweetH = 50, ampH = 28, gap = 3;
  const subY = vbH - subH - 12;
  const midY = subY - midH - gap;
  const tweetY = midY - tweetH - gap;
  const ampY = tweetY - ampH - gap;
  const cableX = cabX + cabW + 5;
  const cableTop = ampY + ampH * 0.5, cableBot = subY + subH - 5;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ opacity, filter: stackFilter, willChange: "transform, opacity, filter", transform: `translate(${shakeX}px, ${shakeY}px)` }}>
        <svg width={width * 0.28} height={height * 0.7} viewBox={`0 0 ${vbW} ${vbH}`} fill="none">
          <defs>
            <linearGradient id="stack-ground-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={glowColor} stopOpacity={0.5} />
              <stop offset="100%" stopColor={glowColor} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="cable-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#222" /><stop offset="50%" stopColor="#111" /><stop offset="100%" stopColor="#222" />
            </linearGradient>
          </defs>

          {/* Shadow behind entire stack — depth against background */}
          <rect
            x={cabX + 3} y={ampY + 3}
            width={cabW} height={subY + subH - ampY}
            rx={3} fill="black" opacity={0.2 * brightness}
          />

          {/* Ground reflection glow — wide spread beneath the stack */}
          <ellipse
            cx={vbW / 2} cy={subY + subH + 4}
            rx={cabW * 0.7} ry={8}
            fill={glowColor} opacity={0.12 * brightness}
          />
          <rect x={cabX-15} y={subY+subH} width={cabW+30} height={16} fill="url(#stack-ground-glow)" opacity={0.4 * brightness} />
          <line x1={cabX-10} y1={subY+subH+1} x2={cabX+cabW+10} y2={subY+subH+1} stroke={glowColor} strokeWidth={0.6} opacity={0.15 * brightness} />

          {/* Bottom cab: 2x2 subwoofers (full bass excursion) */}
          <Cabinet x={cabX} y={subY} w={cabW} h={subH} color={color} glowColor={glowColor}
            bass={bass} beatDecay={beatDecay} brightness={brightness} rows={2} cols={2} />
          {/* Sub cab bass port — rectangular vent at bottom center */}
          <rect
            x={cabX + cabW * 0.35} y={subY + subH - 10}
            width={cabW * 0.3} height={5} rx={2}
            fill="#050505" stroke={color} strokeWidth={0.4} opacity={0.3 * brightness}
          />
          {/* Bass port inner shadow */}
          <rect
            x={cabX + cabW * 0.35 + 1} y={subY + subH - 9}
            width={cabW * 0.3 - 2} height={3} rx={1}
            fill="black" opacity={0.4 * brightness}
          />

          {/* Inter-cabinet seam: sub to mid */}
          <line x1={cabX+2} y1={midY+midH+1} x2={cabX+cabW-2} y2={midY+midH+1}
            stroke="black" strokeWidth={1.5} opacity={0.25 * brightness} />
          <line x1={cabX+2} y1={midY+midH+2} x2={cabX+cabW-2} y2={midY+midH+2}
            stroke={color} strokeWidth={0.3} opacity={0.08 * brightness} />

          {/* Middle cab: 2x2 mid-range */}
          <Cabinet x={cabX} y={midY} w={cabW} h={midH} color={color} glowColor={glowColor}
            bass={bass * 0.45} beatDecay={beatDecay} brightness={brightness * 0.92} rows={2} cols={2} />

          {/* Inter-cabinet seam: mid to tweeter */}
          <line x1={cabX+2} y1={tweetY+tweetH+1} x2={cabX+cabW-2} y2={tweetY+tweetH+1}
            stroke="black" strokeWidth={1.5} opacity={0.25 * brightness} />
          <line x1={cabX+2} y1={tweetY+tweetH+2} x2={cabX+cabW-2} y2={tweetY+tweetH+2}
            stroke={color} strokeWidth={0.3} opacity={0.08 * brightness} />

          {/* Top cab: 2x3 tweeters (minimal bass response) */}
          <Cabinet x={cabX} y={tweetY} w={cabW} h={tweetH} color={color} glowColor={glowColor}
            bass={bass * 0.15} beatDecay={beatDecay} brightness={brightness * 0.8} rows={2} cols={3} />

          {/* Tweeter cab badge — small brand plate */}
          <rect
            x={cabX + cabW * 0.3} y={tweetY + 2}
            width={cabW * 0.4} height={3} rx={1}
            fill="rgba(30,30,35,0.7)" stroke={color} strokeWidth={0.3} opacity={0.2 * brightness}
          />
          <text
            x={cabX + cabW * 0.5} y={tweetY + 4.2}
            textAnchor="middle" fontSize={2.5} fill={color} opacity={0.15 * brightness}
            fontFamily="'Georgia', serif" letterSpacing={0.8}
          >DEAD AIR</text>

          {/* Amp head on top */}
          <AmpHead x={cabX+2} y={ampY} w={cabW-4} h={ampH} color={color}
            energy={energy} beatDecay={beatDecay} brightness={brightness * 0.85} />

          {/* Inter-cabinet seam: tweeter to amp */}
          <line x1={cabX+4} y1={ampY+ampH+1} x2={cabX+cabW-4} y2={ampY+ampH+1}
            stroke="black" strokeWidth={1} opacity={0.2 * brightness} />

          {/* XLR/speaker cables running down right side */}
          <path d={`M${cableX} ${cableTop} C${cableX+3} ${cableTop+30},${cableX-2} ${cableBot-40},${cableX+1} ${cableBot}`}
            stroke="url(#cable-grad)" strokeWidth={2.5} fill="none" opacity={0.35 * brightness} strokeLinecap="round" />
          <path d={`M${cableX+0.5} ${cableTop} C${cableX+3.5} ${cableTop+30},${cableX-1.5} ${cableBot-40},${cableX+1.5} ${cableBot}`}
            stroke={color} strokeWidth={0.4} fill="none" opacity={0.08 * brightness} strokeLinecap="round" />
          <path d={`M${cableX+3} ${cableTop+5} C${cableX+7} ${cableTop+40},${cableX+1} ${cableBot-30},${cableX+4} ${cableBot-3}`}
            stroke="#1a1a1a" strokeWidth={2} fill="none" opacity={0.3 * brightness} strokeLinecap="round" />
          {/* Third cable — power cable (thinner, runs to floor) */}
          <path d={`M${cableX+6} ${cableTop+10} C${cableX+10} ${cableTop+50},${cableX+4} ${cableBot-20},${cableX+7} ${cableBot+8}`}
            stroke="#0a0a0a" strokeWidth={1.5} fill="none" opacity={0.25 * brightness} strokeLinecap="round" />
          {/* Cable connectors — XLR barrels at top and bottom */}
          <rect x={cableX-2} y={cableTop-2} width={5} height={4} rx={1} fill="#222" stroke={color} strokeWidth={0.4} opacity={0.3 * brightness} />
          <circle cx={cableX+0.5} cy={cableTop} r={1} fill={color} opacity={0.1 * brightness} />
          <rect x={cableX-1} y={cableBot-1} width={5} height={4} rx={1} fill="#222" stroke={color} strokeWidth={0.4} opacity={0.3 * brightness} />
          <circle cx={cableX+1.5} cy={cableBot+1} r={1} fill={color} opacity={0.1 * brightness} />

          {/* Rubber feet under sub cab */}
          {[cabX+8, cabX+cabW-8].map((fx, i) => (
            <g key={`foot${i}`}>
              <rect x={fx-3} y={subY+subH-1} width={6} height={3} rx={1}
                fill="rgba(20,20,22,0.9)" stroke={color} strokeWidth={0.3} opacity={0.2 * brightness} />
              <line x1={fx-2} y1={subY+subH+2} x2={fx+2} y2={subY+subH+2}
                stroke="rgba(0,0,0,0.5)" strokeWidth={0.5} />
            </g>
          ))}

          {/* Side handles on each cab */}
          {[subY, midY, tweetY].map((top, i) => (
            <g key={`h${i}`}>
              <rect x={cabX-3} y={top+8} width={3} height={12} rx={1.5} fill="rgba(40,40,45,0.6)" stroke={color} strokeWidth={0.4} opacity={0.2 * brightness} />
              <rect x={cabX+cabW} y={top+8} width={3} height={12} rx={1.5} fill="rgba(40,40,45,0.6)" stroke={color} strokeWidth={0.4} opacity={0.2 * brightness} />
            </g>
          ))}

          {/* Edge ambient light — faint halo from stage lighting */}
          <rect x={cabX-8} y={ampY} width={4} height={subY+subH-ampY} fill={glowColor} opacity={0.03 * brightness} rx={2} />
          <rect x={cabX+cabW+4} y={ampY} width={4} height={subY+subH-ampY} fill={glowColor} opacity={0.03 * brightness} rx={2} />
        </svg>
      </div>
    </div>
  );
};
