/**
 * MushroomCluster — 4 art nouveau mushroom silhouettes with spores.
 *
 * Caps are half-ellipses with decorative gill lines. Caps pulse/breathe
 * with slowEnergy. Tiny circles drift upward as spores. Mushrooms grow
 * taller over song progress. Earthy palette tinted by chromaHue.
 *
 * Audio reactivity:
 *   slowEnergy   -> cap breathing
 *   energy       -> spore density/brightness
 *   bass         -> cap width pulse
 *   beatDecay    -> spore burst
 *   chromaHue    -> earthy palette tint
 *   tempoFactor  -> spore drift speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const SPORE_COUNT = 24;

interface Mushroom {
  x: number;
  baseHeight: number;
  capRx: number;
  capRy: number;
  stemWidth: number;
  gillCount: number;
  phase: number;
}

const MUSHROOMS: Mushroom[] = [
  { x: 120, baseHeight: 90, capRx: 40, capRy: 22, stemWidth: 10, gillCount: 7, phase: 0 },
  { x: 200, baseHeight: 120, capRx: 52, capRy: 28, stemWidth: 12, gillCount: 9, phase: 1.2 },
  { x: 270, baseHeight: 75, capRx: 34, capRy: 18, stemWidth: 8, gillCount: 6, phase: 2.4 },
  { x: 330, baseHeight: 100, capRx: 44, capRy: 24, stemWidth: 11, gillCount: 8, phase: 3.6 },
];

interface Props {
  frames: EnhancedFrameData[];
}

export const MushroomCluster: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.45;
  if (masterOpacity < 0.01) return null;

  const baseSize = Math.min(width, height) * 0.6;
  const hue = snap.chromaHue;
  const earthHue = ((30 + (hue - 180) * 0.15) % 360 + 360) % 360;
  const capColor = `hsl(${earthHue}, 40%, 28%)`;
  const capHighlight = `hsl(${earthHue + 10}, 35%, 40%)`;
  const stemColor = `hsl(${earthHue - 10}, 25%, 38%)`;
  const gillColor = `hsla(${earthHue}, 30%, 22%, 0.5)`;
  const sporeColor = `hsla(${earthHue + 20}, 45%, 60%, `;

  // Song progress makes mushrooms grow
  const songProgress = frames.length > 0 ? Math.min(frame / frames.length, 1) : 0;
  const growFactor = 0.7 + songProgress * 0.3;
  const breathe = snap.slowEnergy * 0.15;
  const bassPulse = 1 + snap.bass * 0.08;

  const groundY = 360;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <svg
        width={baseSize}
        height={baseSize}
        viewBox="0 0 450 400"
        fill="none"
        style={{ opacity: masterOpacity, willChange: "opacity" }}
      >
        <defs>
          <filter id="mc-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ground moss line */}
        <ellipse cx={225} cy={groundY + 5} rx={200} ry={8} fill={`hsla(${earthHue + 80}, 30%, 20%, 0.4)`} />

        {MUSHROOMS.map((m, mi) => {
          const h = m.baseHeight * growFactor;
          const capBreath = 1 + Math.sin(frame * 0.02 * tempoFactor + m.phase) * breathe;
          const rx = m.capRx * capBreath * bassPulse;
          const ry = m.capRy * capBreath;
          const stemTop = groundY - h;
          const capCy = stemTop;

          // Stem — slightly tapered bezier
          const stemW = m.stemWidth;
          const stemPath = `M ${m.x - stemW * 0.5} ${groundY}
            Q ${m.x - stemW * 0.6} ${groundY - h * 0.5} ${m.x - stemW * 0.3} ${stemTop + ry * 0.3}
            L ${m.x + stemW * 0.3} ${stemTop + ry * 0.3}
            Q ${m.x + stemW * 0.6} ${groundY - h * 0.5} ${m.x + stemW * 0.5} ${groundY} Z`;

          // Gill lines under cap
          const gills = Array.from({ length: m.gillCount }, (_, gi) => {
            const t = (gi + 1) / (m.gillCount + 1);
            const gx = m.x - rx + t * rx * 2;
            const gy1 = capCy + ry * 0.15;
            const gy2 = capCy + ry * 0.9 * Math.sin(t * Math.PI);
            return `M ${gx} ${gy1} L ${gx} ${gy2}`;
          });

          return (
            <g key={`m-${mi}`}>
              <path d={stemPath} fill={stemColor} opacity={0.85} />
              {/* Cap — half ellipse (top half) */}
              <ellipse cx={m.x} cy={capCy} rx={rx} ry={ry} fill={capColor} />
              {/* Cap highlight arc */}
              <path
                d={`M ${m.x - rx * 0.7} ${capCy - ry * 0.3} Q ${m.x} ${capCy - ry * 1.2} ${m.x + rx * 0.7} ${capCy - ry * 0.3}`}
                stroke={capHighlight}
                strokeWidth={1.5}
                fill="none"
                opacity={0.6}
              />
              {/* Gill lines */}
              {gills.map((g, gi) => (
                <path key={`g-${mi}-${gi}`} d={g} stroke={gillColor} strokeWidth={0.6} fill="none" />
              ))}
              {/* Cap bottom edge */}
              <path
                d={`M ${m.x - rx} ${capCy} Q ${m.x} ${capCy + ry * 0.5} ${m.x + rx} ${capCy}`}
                stroke={gillColor}
                strokeWidth={0.8}
                fill="none"
              />
            </g>
          );
        })}

        {/* Spores drifting upward */}
        <g filter="url(#mc-glow)">
          {Array.from({ length: SPORE_COUNT }, (_, i) => {
            const seed = i * 137.508;
            const baseX = 90 + (seed % 270);
            const speed = 0.003 + (seed % 7) * 0.001;
            const t = ((frame * tempoFactor * speed + (seed % 1000) / 1000) % 1);
            const y = groundY - 50 - t * 280;
            const drift = Math.sin(frame * 0.015 + seed) * 15;
            const x = baseX + drift;
            const size = 0.8 + (seed % 3) * 0.4;
            const fade = (1 - t) * interpolate(snap.energy, [0, 0.3], [0.3, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const burst = snap.beatDecay > 0.3 ? 1.5 : 1;
            return (
              <circle
                key={`sp-${i}`}
                cx={x}
                cy={y}
                r={size * burst}
                fill={`${sporeColor}${(fade * 0.7).toFixed(2)})`}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};
