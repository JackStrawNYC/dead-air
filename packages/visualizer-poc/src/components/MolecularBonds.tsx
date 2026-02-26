/**
 * MolecularBonds — 8-15 atom nodes connected by bonds (lines).
 * Atoms are circles with electron shell rings. Bonds stretch and vibrate.
 * The molecular structure rotates slowly. Atoms glow with element colors
 * (oxygen blue, carbon gray, nitrogen purple). Bond vibration frequency
 * tied to energy. Neon/scientific aesthetic.
 * Cycle: 60s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1800;    // 60 seconds at 30fps
const DURATION = 540;  // 18 seconds
const NUM_ATOMS = 12;

// Element colors
const ELEMENT_COLORS = [
  { name: "oxygen", fill: "#4FC3F7", glow: "#03A9F4", shell: "#29B6F6" },
  { name: "carbon", fill: "#BDBDBD", glow: "#9E9E9E", shell: "#E0E0E0" },
  { name: "nitrogen", fill: "#CE93D8", glow: "#AB47BC", shell: "#BA68C8" },
  { name: "hydrogen", fill: "#F5F5F5", glow: "#E0E0E0", shell: "#FAFAFA" },
  { name: "sulfur", fill: "#FFF176", glow: "#FDD835", shell: "#FFEE58" },
  { name: "phosphorus", fill: "#FF8A65", glow: "#FF5722", shell: "#FF7043" },
];

interface AtomData {
  x: number;         // position relative to center (-1 to 1)
  y: number;
  radius: number;    // 8-20
  elementIdx: number;
  shells: number;    // 1-3 electron shells
  shellSpeed: number;
  shellPhase: number;
  bonds: number[];   // indices of connected atoms
}

interface MoleculeData {
  atoms: AtomData[];
}

function generateMolecule(seed: number): MoleculeData {
  const rng = seeded(seed);
  const atoms: AtomData[] = [];

  for (let i = 0; i < NUM_ATOMS; i++) {
    // Place atoms in a rough cluster
    const angle = (i / NUM_ATOMS) * Math.PI * 2 + (rng() - 0.5) * 0.8;
    const dist = 60 + rng() * 120;
    atoms.push({
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      radius: 10 + rng() * 12,
      elementIdx: Math.floor(rng() * ELEMENT_COLORS.length),
      shells: 1 + Math.floor(rng() * 3),
      shellSpeed: 0.01 + rng() * 0.02,
      shellPhase: rng() * Math.PI * 2,
      bonds: [],
    });
  }

  // Create bonds -- connect nearby atoms (each atom has 1-3 bonds)
  for (let i = 0; i < NUM_ATOMS; i++) {
    const maxBonds = 1 + Math.floor(rng() * 3);
    // Find closest atoms not yet bonded
    const distances: { idx: number; dist: number }[] = [];
    for (let j = 0; j < NUM_ATOMS; j++) {
      if (i === j) continue;
      const dx = atoms[i].x - atoms[j].x;
      const dy = atoms[i].y - atoms[j].y;
      distances.push({ idx: j, dist: Math.sqrt(dx * dx + dy * dy) });
    }
    distances.sort((a, b) => a.dist - b.dist);

    let bondsAdded = 0;
    for (const d of distances) {
      if (bondsAdded >= maxBonds) break;
      if (atoms[i].bonds.includes(d.idx)) continue;
      if (atoms[d.idx].bonds.length >= 3) continue;
      atoms[i].bonds.push(d.idx);
      atoms[d.idx].bonds.push(i);
      bondsAdded++;
    }
  }

  return { atoms };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const MolecularBonds: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const molecule = React.useMemo(() => generateMolecule(2468_1977), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.7;

  // Slow rotation of entire structure
  const rotation = frame * 0.15;

  // Center of screen
  const cx = width / 2;
  const cy = height / 2;

  // Rotate atoms
  const cosR = Math.cos(rotation * Math.PI / 180);
  const sinR = Math.sin(rotation * Math.PI / 180);

  const rotatedPositions = molecule.atoms.map((atom) => ({
    x: cx + atom.x * cosR - atom.y * sinR,
    y: cy + atom.x * sinR + atom.y * cosR,
  }));

  // Track which bonds we've drawn to avoid duplicates
  const drawnBonds = new Set<string>();

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="mol-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Bonds */}
        {molecule.atoms.map((atom, ai) =>
          atom.bonds.map((bi) => {
            const bondKey = `${Math.min(ai, bi)}-${Math.max(ai, bi)}`;
            if (drawnBonds.has(bondKey)) return null;
            drawnBonds.add(bondKey);

            const a = rotatedPositions[ai];
            const b = rotatedPositions[bi];

            // Bond vibration perpendicular to bond direction
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / (len || 1);
            const ny = dx / (len || 1);
            const vibAmp = energy * 5;
            const vibOffset = Math.sin(frame * (0.1 + energy * 0.15) + ai * 2.3) * vibAmp;

            const midX = (a.x + b.x) / 2 + nx * vibOffset;
            const midY = (a.y + b.y) / 2 + ny * vibOffset;

            const bondColor = ELEMENT_COLORS[atom.elementIdx].glow;

            return (
              <g key={`bond-${bondKey}`}>
                <path
                  d={`M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`}
                  fill="none"
                  stroke={bondColor}
                  strokeWidth={2}
                  opacity={0.5}
                  filter="url(#mol-glow)"
                />
                {/* Glow version */}
                <path
                  d={`M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`}
                  fill="none"
                  stroke={bondColor}
                  strokeWidth={4}
                  opacity={0.15}
                />
              </g>
            );
          })
        )}

        {/* Atoms */}
        {molecule.atoms.map((atom, ai) => {
          const pos = rotatedPositions[ai];
          const el = ELEMENT_COLORS[atom.elementIdx];

          return (
            <g key={`atom-${ai}`} filter="url(#mol-glow)">
              {/* Electron shells */}
              {Array.from({ length: atom.shells }, (_, si) => {
                const shellR = atom.radius + 8 + si * 10;
                const dashLen = 4 + si * 2;
                const dashOffset = frame * atom.shellSpeed * (si + 1) * 30 + atom.shellPhase * 100;
                return (
                  <circle
                    key={`shell-${si}`}
                    cx={pos.x}
                    cy={pos.y}
                    r={shellR}
                    fill="none"
                    stroke={el.shell}
                    strokeWidth={0.8}
                    opacity={0.3 - si * 0.08}
                    strokeDasharray={`${dashLen} ${dashLen * 2}`}
                    strokeDashoffset={dashOffset}
                  />
                );
              })}
              {/* Outer glow */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={atom.radius * 1.5}
                fill={el.glow}
                opacity={0.1 + energy * 0.1}
              />
              {/* Core */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={atom.radius}
                fill={el.fill}
                opacity={0.7}
              />
              {/* Inner highlight */}
              <circle
                cx={pos.x - atom.radius * 0.25}
                cy={pos.y - atom.radius * 0.25}
                r={atom.radius * 0.4}
                fill="white"
                opacity={0.15}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
