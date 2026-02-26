/**
 * TidePool — Circular tide pool viewed from above.
 * Pool is a large circle with rocky edges (irregular border).
 * Inside: small starfish shapes (5-point), sea urchin circles with spines,
 * small anemone circles, and tiny shell spirals. Creatures shift slowly.
 * Blue-green water with caustic light. Energy drives creature movement.
 * Cycle: 70s, 22s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2100; // 70s at 30fps
const DURATION = 660; // 22s visible

type CreatureType = "starfish" | "urchin" | "anemone" | "shell";

interface CreatureData {
  type: CreatureType;
  cx: number; // 0-1 within pool
  cy: number; // 0-1 within pool
  size: number;
  rotation: number;
  color: string;
  driftSpeed: number;
  driftPhase: number;
}

interface CausticData {
  cx: number;
  cy: number;
  size: number;
  phase: number;
  speed: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const TidePool: React.FC<Props> = ({ frames }) => {
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

  const creatures = React.useMemo(() => {
    const rng = seeded(4321);
    const types: CreatureType[] = ["starfish", "urchin", "anemone", "shell"];
    const starColors = ["#E86430", "#D45020", "#C04818", "#F07040"];
    const urchinColors = ["#2A1B3D", "#3D2255", "#1A1030"];
    const anemoneColors = ["#FF6B9D", "#FF85B3", "#E05580"];
    const shellColors = ["#D4B896", "#C4A878", "#E0C8A0"];
    const result: CreatureData[] = [];
    for (let i = 0; i < 16; i++) {
      const type = types[Math.floor(rng() * types.length)];
      let color: string;
      switch (type) {
        case "starfish": color = starColors[Math.floor(rng() * starColors.length)]; break;
        case "urchin": color = urchinColors[Math.floor(rng() * urchinColors.length)]; break;
        case "anemone": color = anemoneColors[Math.floor(rng() * anemoneColors.length)]; break;
        case "shell": color = shellColors[Math.floor(rng() * shellColors.length)]; break;
      }
      // Keep creatures within a circle (use polar coords to avoid clustering at center)
      const angle = rng() * Math.PI * 2;
      const dist = 0.15 + rng() * 0.7; // 15-85% of radius
      result.push({
        type,
        cx: 0.5 + Math.cos(angle) * dist * 0.45,
        cy: 0.5 + Math.sin(angle) * dist * 0.45,
        size: type === "starfish" ? 10 + rng() * 8 :
              type === "urchin" ? 8 + rng() * 6 :
              type === "anemone" ? 6 + rng() * 5 :
              5 + rng() * 4,
        rotation: rng() * 360,
        color,
        driftSpeed: 0.002 + rng() * 0.006,
        driftPhase: rng() * Math.PI * 2,
      });
    }
    return result;
  }, []);

  const caustics = React.useMemo(() => {
    const rng = seeded(5555);
    const result: CausticData[] = [];
    for (let i = 0; i < 12; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * 0.4;
      result.push({
        cx: 0.5 + Math.cos(angle) * dist,
        cy: 0.5 + Math.sin(angle) * dist,
        size: 20 + rng() * 40,
        phase: rng() * Math.PI * 2,
        speed: 0.02 + rng() * 0.04,
      });
    }
    return result;
  }, []);

  const rockyEdge = React.useMemo(() => {
    const rng = seeded(9999);
    const points: string[] = [];
    const numEdgePoints = 36;
    for (let i = 0; i < numEdgePoints; i++) {
      const a = (i / numEdgePoints) * Math.PI * 2;
      const r = 0.46 + (rng() - 0.5) * 0.06; // irregular radius
      const px = 0.5 + Math.cos(a) * r;
      const py = 0.5 + Math.sin(a) * r;
      points.push(`${px},${py}`);
    }
    return points.join(" ");
  }, []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.3, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const poolCx = width * 0.35;
  const poolCy = height * 0.55;
  const poolRadius = Math.min(width, height) * 0.28;

  const movementScale = 0.3 + energy * 2.0;

  // Build starfish SVG path (5-point star)
  const starPath = (cx: number, cy: number, outerR: number, innerR: number): string => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
    }
    return `M${pts.join("L")}Z`;
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity, willChange: "opacity" }}
      >
        <defs>
          <filter id="tidepool-caustic">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="tidepool-clip">
            <polygon
              points={rockyEdge.split(" ").map(p => {
                const [px, py] = p.split(",").map(Number);
                return `${poolCx + (px - 0.5) * poolRadius * 2},${poolCy + (py - 0.5) * poolRadius * 2}`;
              }).join(" ")}
            />
          </clipPath>
          <radialGradient id="tidepool-water" cx="40%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#1A6B6B" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#0D4F4F" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#0A3A3A" stopOpacity="0.6" />
          </radialGradient>
        </defs>

        {/* Rocky outer edge */}
        <polygon
          points={rockyEdge.split(" ").map(p => {
            const [px, py] = p.split(",").map(Number);
            return `${poolCx + (px - 0.5) * poolRadius * 2.15},${poolCy + (py - 0.5) * poolRadius * 2.15}`;
          }).join(" ")}
          fill="#4A3728"
          stroke="#5C4A38"
          strokeWidth={2}
          opacity={0.6}
        />

        {/* Water fill */}
        <g clipPath="url(#tidepool-clip)">
          <circle
            cx={poolCx}
            cy={poolCy}
            r={poolRadius}
            fill="url(#tidepool-water)"
          />

          {/* Caustic light patterns */}
          {caustics.map((c, ci) => {
            const cx = poolCx + (c.cx - 0.5) * poolRadius * 2;
            const cy = poolCy + (c.cy - 0.5) * poolRadius * 2;
            const pulse = Math.sin(frame * c.speed + c.phase) * 0.5 + 0.5;
            const r = c.size * (0.6 + pulse * 0.4);
            const causticOpacity = 0.05 + pulse * 0.08 + energy * 0.04;
            return (
              <ellipse
                key={`caustic-${ci}`}
                cx={cx + Math.sin(frame * 0.01 + c.phase) * 8}
                cy={cy + Math.cos(frame * 0.013 + c.phase) * 6}
                rx={r}
                ry={r * 0.7}
                fill="#66DDCC"
                opacity={causticOpacity}
                filter="url(#tidepool-caustic)"
              />
            );
          })}

          {/* Creatures */}
          {creatures.map((cr, ci) => {
            const driftX = Math.sin(frame * cr.driftSpeed + cr.driftPhase) * 8 * movementScale;
            const driftY = Math.cos(frame * cr.driftSpeed * 0.7 + cr.driftPhase) * 6 * movementScale;
            const cx = poolCx + (cr.cx - 0.5) * poolRadius * 2 + driftX;
            const cy = poolCy + (cr.cy - 0.5) * poolRadius * 2 + driftY;
            const rot = cr.rotation + frame * 0.1 * movementScale;

            switch (cr.type) {
              case "starfish": {
                const path = starPath(0, 0, cr.size, cr.size * 0.4);
                return (
                  <g key={`cr-${ci}`} transform={`translate(${cx},${cy}) rotate(${rot})`}>
                    <path d={path} fill={cr.color} opacity={0.7} />
                    <path d={path} fill="none" stroke="#FFF" strokeWidth={0.5} opacity={0.15} />
                  </g>
                );
              }
              case "urchin": {
                const spines: React.ReactElement[] = [];
                const numSpines = 16;
                for (let si = 0; si < numSpines; si++) {
                  const sa = (si / numSpines) * Math.PI * 2;
                  const spineLen = cr.size * (1.2 + energy * 0.5);
                  spines.push(
                    <line
                      key={`spine-${si}`}
                      x1={Math.cos(sa) * cr.size * 0.5}
                      y1={Math.sin(sa) * cr.size * 0.5}
                      x2={Math.cos(sa) * spineLen}
                      y2={Math.sin(sa) * spineLen}
                      stroke={cr.color}
                      strokeWidth={0.8}
                      opacity={0.6}
                    />
                  );
                }
                return (
                  <g key={`cr-${ci}`} transform={`translate(${cx},${cy}) rotate(${rot})`}>
                    <circle cx={0} cy={0} r={cr.size * 0.5} fill={cr.color} opacity={0.7} />
                    {spines}
                  </g>
                );
              }
              case "anemone": {
                const tentacles: React.ReactElement[] = [];
                const numTentacles = 10;
                for (let ti = 0; ti < numTentacles; ti++) {
                  const ta = (ti / numTentacles) * Math.PI * 2;
                  const wave = Math.sin(frame * 0.05 + ti * 0.5) * 3 * movementScale;
                  const tentLen = cr.size * (0.8 + energy * 0.4);
                  tentacles.push(
                    <line
                      key={`tent-${ti}`}
                      x1={0}
                      y1={0}
                      x2={Math.cos(ta) * tentLen + wave}
                      y2={Math.sin(ta) * tentLen + wave * 0.5}
                      stroke={cr.color}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      opacity={0.6}
                    />
                  );
                }
                return (
                  <g key={`cr-${ci}`} transform={`translate(${cx},${cy})`}>
                    <circle cx={0} cy={0} r={cr.size * 0.3} fill={cr.color} opacity={0.5} />
                    {tentacles}
                  </g>
                );
              }
              case "shell": {
                // Simple spiral approximation
                const spiralPath: string[] = [];
                const turns = 2.5;
                const steps = 20;
                for (let si = 0; si <= steps; si++) {
                  const t = si / steps;
                  const a = t * turns * Math.PI * 2;
                  const r = t * cr.size;
                  const sx = Math.cos(a) * r;
                  const sy = Math.sin(a) * r;
                  spiralPath.push(si === 0 ? `M${sx},${sy}` : `L${sx},${sy}`);
                }
                return (
                  <g key={`cr-${ci}`} transform={`translate(${cx},${cy}) rotate(${rot})`}>
                    <path
                      d={spiralPath.join("")}
                      fill="none"
                      stroke={cr.color}
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      opacity={0.6}
                    />
                  </g>
                );
              }
            }
          })}
        </g>

        {/* Pool rim highlight */}
        <polygon
          points={rockyEdge.split(" ").map(p => {
            const [px, py] = p.split(",").map(Number);
            return `${poolCx + (px - 0.5) * poolRadius * 2},${poolCy + (py - 0.5) * poolRadius * 2}`;
          }).join(" ")}
          fill="none"
          stroke="#8AC"
          strokeWidth={1.5}
          opacity={0.2}
        />
      </svg>
    </div>
  );
};
