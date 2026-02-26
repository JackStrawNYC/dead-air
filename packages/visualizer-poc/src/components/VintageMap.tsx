/**
 * VintageMap -- Old parchment map with coastline outlines, compass rose,
 * and "here be dragons" style decorative elements. Map scrolls/pans slowly.
 * Dotted route lines trace paths. Sea monster silhouettes in ocean areas.
 * Aged cream/brown parchment color with dark ink lines.
 * Energy drives pan speed. Cycle: 75s, 22s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useShowContext } from "../data/ShowContext";

const CYCLE = 2250; // 75 seconds at 30fps
const DURATION = 660; // 22 seconds visible

// Pre-generate coastline paths
function generateCoastline(rng: () => number, startX: number, startY: number, segments: number, scale: number): string {
  let d = `M ${startX} ${startY}`;
  let x = startX;
  let y = startY;
  for (let i = 0; i < segments; i++) {
    const dx = (rng() - 0.3) * scale;
    const dy = (rng() - 0.5) * scale * 0.6;
    const cx1 = x + dx * 0.3 + (rng() - 0.5) * scale * 0.3;
    const cy1 = y + dy * 0.3 + (rng() - 0.5) * scale * 0.3;
    x += dx;
    y += dy;
    d += ` Q ${cx1} ${cy1} ${x} ${y}`;
  }
  return d;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const VintageMap: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Pre-generate map features
  const mapData = React.useMemo(() => {
    const rng = seeded(ctx?.showSeed ?? 77050803);
    const mapW = width * 1.6;
    const mapH = height * 1.4;

    // Generate coastlines
    const coastlines: string[] = [];
    coastlines.push(generateCoastline(rng, mapW * 0.1, mapH * 0.3, 18, 50));
    coastlines.push(generateCoastline(rng, mapW * 0.05, mapH * 0.6, 22, 45));
    coastlines.push(generateCoastline(rng, mapW * 0.6, mapH * 0.15, 15, 55));
    coastlines.push(generateCoastline(rng, mapW * 0.55, mapH * 0.75, 20, 48));

    // Island shapes
    const islands: { cx: number; cy: number; rx: number; ry: number; rot: number }[] = [];
    for (let i = 0; i < 5; i++) {
      islands.push({
        cx: mapW * 0.2 + rng() * mapW * 0.6,
        cy: mapH * 0.2 + rng() * mapH * 0.6,
        rx: 15 + rng() * 30,
        ry: 10 + rng() * 20,
        rot: rng() * 360,
      });
    }

    // Route dotted paths
    const routes: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 0; i < 3; i++) {
      routes.push({
        x1: mapW * 0.1 + rng() * mapW * 0.3,
        y1: mapH * 0.2 + rng() * mapH * 0.6,
        x2: mapW * 0.5 + rng() * mapW * 0.4,
        y2: mapH * 0.1 + rng() * mapH * 0.7,
      });
    }

    // Sea monster positions
    const monsters: { x: number; y: number; scale: number; flip: boolean }[] = [];
    for (let i = 0; i < 3; i++) {
      monsters.push({
        x: mapW * 0.15 + rng() * mapW * 0.7,
        y: mapH * 0.25 + rng() * mapH * 0.5,
        scale: 0.6 + rng() * 0.8,
        flip: rng() > 0.5,
      });
    }

    // Compass rose position
    const compassX = mapW * 0.78;
    const compassY = mapH * 0.22;

    return { mapW, mapH, coastlines, islands, routes, monsters, compassX, compassY };
  }, [width, height, ctx?.showSeed]);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Pan speed driven by energy
  const panSpeed = interpolate(energy, [0.03, 0.3], [0.3, 1.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const panX = -(mapData.mapW - width) * 0.25 + Math.sin(cycleFrame * 0.003 * panSpeed) * (mapData.mapW - width) * 0.25;
  const panY = -(mapData.mapH - height) * 0.25 + Math.cos(cycleFrame * 0.002 * panSpeed) * (mapData.mapH - height) * 0.2;

  const inkColor = "#3E2723";
  const lightInk = "#5D4037";
  const faintInk = "#8D6E63";

  const glowSize = interpolate(energy, [0.03, 0.3], [1, 5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Route trace animation
  const routeTraceLen = interpolate(progress, [0.05, 0.7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px rgba(139, 90, 43, 0.4))`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${panX}, ${panY})`}>
          {/* Parchment background */}
          <rect
            x={0}
            y={0}
            width={mapData.mapW}
            height={mapData.mapH}
            fill="#F5E6C8"
            opacity={0.15}
          />
          {/* Aged edges */}
          <rect
            x={5}
            y={5}
            width={mapData.mapW - 10}
            height={mapData.mapH - 10}
            fill="none"
            stroke={faintInk}
            strokeWidth={2}
            opacity={0.2}
            rx={4}
          />

          {/* Grid lines (latitude/longitude) */}
          {Array.from({ length: 8 }).map((_, gi) => (
            <line
              key={`hgrid-${gi}`}
              x1={20}
              y1={mapData.mapH * 0.1 + gi * mapData.mapH * 0.1}
              x2={mapData.mapW - 20}
              y2={mapData.mapH * 0.1 + gi * mapData.mapH * 0.1}
              stroke={faintInk}
              strokeWidth={0.3}
              opacity={0.15}
            />
          ))}
          {Array.from({ length: 10 }).map((_, gi) => (
            <line
              key={`vgrid-${gi}`}
              x1={mapData.mapW * 0.1 + gi * mapData.mapW * 0.08}
              y1={20}
              x2={mapData.mapW * 0.1 + gi * mapData.mapW * 0.08}
              y2={mapData.mapH - 20}
              stroke={faintInk}
              strokeWidth={0.3}
              opacity={0.15}
            />
          ))}

          {/* Coastlines */}
          {mapData.coastlines.map((path, ci) => (
            <path
              key={`coast-${ci}`}
              d={path}
              fill="none"
              stroke={inkColor}
              strokeWidth={1.8}
              opacity={0.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* Islands */}
          {mapData.islands.map((isl, ii) => (
            <ellipse
              key={`island-${ii}`}
              cx={isl.cx}
              cy={isl.cy}
              rx={isl.rx}
              ry={isl.ry}
              fill={lightInk}
              opacity={0.15}
              stroke={inkColor}
              strokeWidth={1}
              transform={`rotate(${isl.rot}, ${isl.cx}, ${isl.cy})`}
            />
          ))}

          {/* Route lines (dotted, animated trace) */}
          {mapData.routes.map((route, ri) => {
            const mx = (route.x1 + route.x2) / 2 + 40;
            const my = (route.y1 + route.y2) / 2 - 30;
            const pathD = `M ${route.x1} ${route.y1} Q ${mx} ${my} ${route.x2} ${route.y2}`;
            const totalLen = 600; // approximate
            const dashLen = totalLen * routeTraceLen;
            return (
              <path
                key={`route-${ri}`}
                d={pathD}
                fill="none"
                stroke="#8B0000"
                strokeWidth={1.2}
                strokeDasharray={`${dashLen} ${totalLen}`}
                opacity={0.35}
                strokeLinecap="round"
              />
            );
          })}

          {/* Sea monsters */}
          {mapData.monsters.map((m, mi) => {
            const sc = m.scale * 25;
            const flipX = m.flip ? -1 : 1;
            return (
              <g key={`monster-${mi}`} transform={`translate(${m.x}, ${m.y}) scale(${flipX * m.scale}, ${m.scale})`}>
                {/* Serpent body */}
                <path
                  d={`M 0 0 Q ${sc * 0.4} ${-sc * 0.5} ${sc * 0.8} ${-sc * 0.2} Q ${sc * 1.2} ${sc * 0.1} ${sc * 1.5} ${-sc * 0.3} Q ${sc * 1.8} ${-sc * 0.6} ${sc * 2} ${-sc * 0.2}`}
                  fill="none"
                  stroke={inkColor}
                  strokeWidth={2}
                  opacity={0.2}
                  strokeLinecap="round"
                />
                {/* Head */}
                <circle cx={0} cy={0} r={sc * 0.15} fill={inkColor} opacity={0.15} />
              </g>
            );
          })}

          {/* Compass rose */}
          <g transform={`translate(${mapData.compassX}, ${mapData.compassY})`}>
            <circle cx={0} cy={0} r={35} fill="none" stroke={inkColor} strokeWidth={1} opacity={0.3} />
            <circle cx={0} cy={0} r={30} fill="none" stroke={inkColor} strokeWidth={0.5} opacity={0.2} />
            {/* Cardinal points */}
            {["N", "E", "S", "W"].map((dir, di) => {
              const angle = (di * 90 - 90) * Math.PI / 180;
              const tipR = 28;
              const tipX = Math.cos(angle) * tipR;
              const tipY = Math.sin(angle) * tipR;
              const leftA = angle - 0.25;
              const rightA = angle + 0.25;
              const baseR = 8;
              return (
                <g key={`cdir-${di}`}>
                  <polygon
                    points={`${tipX},${tipY} ${Math.cos(leftA) * baseR},${Math.sin(leftA) * baseR} 0,0 ${Math.cos(rightA) * baseR},${Math.sin(rightA) * baseR}`}
                    fill={inkColor}
                    opacity={0.25}
                  />
                  <text
                    x={Math.cos(angle) * 42}
                    y={Math.sin(angle) * 42}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={inkColor}
                    fontSize={10}
                    fontFamily="serif"
                    fontWeight="bold"
                    opacity={0.4}
                  >
                    {dir}
                  </text>
                </g>
              );
            })}
          </g>

          {/* "Here Be Dragons" text */}
          <text
            x={mapData.mapW * 0.35}
            y={mapData.mapH * 0.82}
            textAnchor="middle"
            fill={faintInk}
            fontSize={14}
            fontFamily="serif"
            fontStyle="italic"
            opacity={0.2}
            letterSpacing={2}
          >
            Here Be Dragons
          </text>

          {/* Decorative cartouche (title area) */}
          <rect
            x={mapData.mapW * 0.05}
            y={mapData.mapH * 0.05}
            width={180}
            height={60}
            rx={4}
            fill="none"
            stroke={inkColor}
            strokeWidth={1.5}
            opacity={0.2}
          />
          <text
            x={mapData.mapW * 0.05 + 90}
            y={mapData.mapH * 0.05 + 25}
            textAnchor="middle"
            fill={inkColor}
            fontSize={11}
            fontFamily="serif"
            fontWeight="bold"
            opacity={0.3}
            letterSpacing={1.5}
          >
            TERRA INCOGNITA
          </text>
          <text
            x={mapData.mapW * 0.05 + 90}
            y={mapData.mapH * 0.05 + 42}
            textAnchor="middle"
            fill={lightInk}
            fontSize={8}
            fontFamily="serif"
            fontStyle="italic"
            opacity={0.25}
          >
            Anno Domini MDLXXVII
          </text>
        </g>
      </svg>
    </div>
  );
};
