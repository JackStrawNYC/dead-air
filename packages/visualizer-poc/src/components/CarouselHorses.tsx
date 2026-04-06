/**
 * CarouselHorses — A+++ psychedelic carousel overlay.
 *
 * 6 ornate prancing carousel horses in circular formation viewed from a
 * tilted perspective. Each horse is a detailed silhouette with bridle, mane,
 * arched neck, flowing tail, saddle blanket, and four galloping legs.
 * Carousel structure includes top canopy with scalloped edge, bottom platform,
 * center hub with spokes, and decorative lights pulsing along the canopy.
 *
 * Audio: energy + tempoFactor drive rotation speed, beatDecay drives horse
 * bobbing amplitude, chromaHue tints each horse in spectrum spread, bass
 * drives canopy light pulse intensity, drumOnset adds gallop emphasis.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const NUM_HORSES = 6;
const NUM_CANOPY_LIGHTS = 10;
const NUM_SCALLOPS = 24;

/* ------------------------------------------------------------------ */
/*  Horse silhouette — detailed prancing carousel horse                */
/*  Bounding box: roughly 0,0 to 80,90                                */
/* ------------------------------------------------------------------ */

// Head with bridle, ear, mane tufts, arched neck
const HORSE_HEAD_NECK =
  // Muzzle and jaw
  "M 62 28 C 65 26 68 24 69 21 C 70 18 68 15 65 14 " +
  // Forehead up to ear
  "C 63 13 61 11 60 8 C 59 5 57 3 55 2 " +
  // Ear tip
  "L 53 0 C 52 2 51 4 52 6 " +
  // Poll down back of head
  "C 50 7 48 9 46 12 " +
  // Mane crest (flowing bumps)
  "C 44 14 42 13 40 15 C 38 17 36 16 34 18 C 32 20 30 19 28 21 " +
  // Throat latch / underside of neck
  "C 30 24 32 27 34 30 " +
  // Connect to chest
  "C 36 33 40 35 42 36 " +
  // Bridle noseband
  "M 62 22 L 58 20 M 62 22 L 64 19 " +
  // Bridle cheek piece
  "M 60 14 L 62 20 " +
  // Eye
  "M 61 17 C 62 16.5 62.5 17 61.5 17.5 Z";

// Body with saddle blanket
const HORSE_BODY =
  // Chest to back (topline)
  "M 42 36 C 44 35 46 34 48 34 C 50 34 53 35 55 36 " +
  // Croup curve
  "C 57 37 58 38 57 40 " +
  // Hindquarters
  "C 56 42 54 44 52 46 " +
  // Underside (belly)
  "C 48 47 44 47 40 46 C 38 45 36 44 34 42 " +
  // Connect to chest
  "C 36 40 38 38 42 36 Z " +
  // Saddle blanket outline
  "M 40 35 C 42 33 46 32 50 33 C 52 34 53 35 52 37 " +
  "C 50 38 46 38 42 37 C 40 36 40 35 40 35 Z " +
  // Saddle blanket trim dots
  "M 42 34 L 43 33 M 45 33 L 46 32 M 48 33 L 49 32 M 50 34 L 51 33 " +
  // Saddle pommel and cantle
  "M 42 33 C 41 31 41 30 42 29 M 51 34 C 52 32 52 31 51 30";

// Flowing tail
const HORSE_TAIL =
  "M 57 40 C 60 42 63 45 65 50 C 67 55 66 60 63 64 " +
  "C 61 66 58 67 56 65 C 54 63 55 59 57 55 " +
  "M 57 40 C 61 43 64 48 64 53 " +
  "M 57 40 C 59 44 60 50 58 56";

// Four legs in gallop pose — front pair extended, rear pair pushing
const HORSE_LEGS =
  // Front left (extended forward)
  "M 38 44 C 36 48 33 54 30 60 C 29 63 28 66 27 70 " +
  "C 27 72 28 74 30 74 C 31 74 32 73 32 71 " +
  "L 33 68 C 34 64 36 58 38 52 " +
  // Front right (tucked back, mid-stride)
  "M 40 46 C 41 50 42 55 42 60 C 42 64 41 68 40 72 " +
  "C 40 74 41 75 42 74 C 43 73 43 71 43 68 " +
  "L 43 62 C 43 56 42 50 40 46 " +
  // Rear left (pushing back, extended)
  "M 50 46 C 52 50 55 56 58 62 C 60 66 61 70 62 74 " +
  "C 62 76 61 77 60 76 C 59 75 59 73 59 70 " +
  "L 57 64 C 55 58 52 52 50 46 " +
  // Rear right (forward under body)
  "M 52 46 C 51 50 50 54 48 58 C 47 62 46 66 45 70 " +
  "C 45 72 46 73 47 72 C 48 71 48 69 48 66 " +
  "L 49 60 C 50 54 51 50 52 46 " +
  // Hooves (small horizontal bars)
  "M 28 74 L 32 74 M 40 74 L 43 74 M 60 76 L 63 76 M 45 72 L 48 72";

// Carousel pole through the horse
const POLE_TOP = "M 46 0 L 46 29";
const POLE_BOTTOM = "M 46 38 L 46 90";

interface Props {
  frames: EnhancedFrameData[];
}

export const CarouselHorses: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, chromaHue, beatDecay, bass, drumOnset, fastEnergy } = snap;

  /* ---- deterministic per-horse data ---- */
  const horseData = React.useMemo(() => {
    const rng = seeded(60197708);
    return Array.from({ length: NUM_HORSES }, () => ({
      bobPhase: rng() * Math.PI * 2,
      bobAmp: 10 + rng() * 14,
      bobFreq: 0.035 + rng() * 0.02,
      gallopPhase: rng() * Math.PI * 2,
      gallopFreq: 0.08 + rng() * 0.04,
      hueShift: rng() * 60 - 30, // each horse offset from base
    }));
  }, []);

  /* ---- canopy light phases ---- */
  const lightData = React.useMemo(() => {
    const rng = seeded(80224477);
    return Array.from({ length: NUM_CANOPY_LIGHTS }, () => ({
      phase: rng() * Math.PI * 2,
      speed: 0.04 + rng() * 0.03,
      brightness: 0.5 + rng() * 0.5,
    }));
  }, []);

  /* ---- rotation speed ---- */
  const rotSpeed =
    interpolate(energy, [0.03, 0.35], [0.25, 1.8], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) * tempoFactor;

  const rotAngle = frame * rotSpeed;

  /* ---- carousel geometry ---- */
  const cx = width / 2;
  const cy = height / 2;
  const radiusX = Math.min(width, height) * 0.3;
  const radiusY = radiusX * 0.32; // tilt foreshortening
  const horseBaseScale = Math.min(width, height) / 1200; // responsive

  const baseHue = chromaHue;
  const glowColor = `hsla(${baseHue}, 85%, 55%, 0.35)`;

  /* ---- scalloped canopy edge path ---- */
  const canopyScallops = React.useMemo(() => {
    const canopyRx = radiusX + 30;
    const canopyRy = radiusY + 10;
    const pts: string[] = [];
    for (let i = 0; i <= NUM_SCALLOPS; i++) {
      const t = (i / NUM_SCALLOPS) * Math.PI * 2;
      const scallop = Math.sin(i * Math.PI) * 3; // scallop amplitude
      const px = cx + Math.cos(t) * (canopyRx + scallop);
      const py = cy + Math.sin(t) * (canopyRy + scallop * 0.3);
      pts.push(`${i === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`);
    }
    return pts.join(" ") + " Z";
  }, [cx, cy, radiusX, radiusY]);

  /* ---- sort order: paint back horses first ---- */
  const horseIndices = Array.from({ length: NUM_HORSES }, (_, i) => i);
  const sorted = horseIndices
    .map((i) => {
      const angleRad =
        ((rotAngle + (i / NUM_HORSES) * 360) * Math.PI) / 180;
      return { i, depth: Math.sin(angleRad) };
    })
    .sort((a, b) => a.depth - b.depth);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg
        width={width}
        height={height}
        style={{
          opacity: 0.65,
          filter: `drop-shadow(0 0 12px ${glowColor}) drop-shadow(0 0 28px ${glowColor})`,
        }}
      >
        {/* ============ BOTTOM PLATFORM RING ============ */}
        <ellipse
          cx={cx}
          cy={cy + 6}
          rx={radiusX + 18}
          ry={radiusY + 6}
          fill="none"
          stroke={`hsla(${baseHue + 20}, 50%, 40%, 0.25)`}
          strokeWidth={2.5}
        />
        <ellipse
          cx={cx}
          cy={cy + 6}
          rx={radiusX + 14}
          ry={radiusY + 4.5}
          fill={`hsla(${baseHue + 20}, 40%, 20%, 0.08)`}
          stroke={`hsla(${baseHue + 20}, 50%, 45%, 0.15)`}
          strokeWidth={1}
        />

        {/* ============ CENTER HUB ============ */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={16}
          ry={16 * 0.32}
          fill={`hsla(${baseHue}, 60%, 30%, 0.15)`}
          stroke={`hsla(${baseHue}, 80%, 60%, 0.5)`}
          strokeWidth={2}
        />
        {/* Hub inner dot */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={5}
          ry={5 * 0.32}
          fill={`hsla(${baseHue}, 90%, 70%, 0.6)`}
        />

        {/* ============ SPOKES + HORSES (depth-sorted) ============ */}
        {sorted.map(({ i, depth }) => {
          const hd = horseData[i];
          const angleOffset = (i / NUM_HORSES) * 360;
          const angleRad = ((rotAngle + angleOffset) * Math.PI) / 180;

          // Position on ellipse
          const hx = cx + Math.cos(angleRad) * radiusX;
          const hy = cy + Math.sin(angleRad) * radiusY;

          // Bob on pole — beatDecay drives amplitude
          const bobAmt =
            Math.sin(frame * hd.bobFreq + hd.bobPhase) *
            hd.bobAmp *
            (0.4 + 0.6 * beatDecay);

          // Gallop leg offset — subtle, drumOnset punches it
          const gallopOffset =
            Math.sin(frame * hd.gallopFreq + hd.gallopPhase) *
            2.5 *
            (0.3 + 0.7 * drumOnset);

          // Depth-based scale: back horses smaller
          const depthT = interpolate(depth, [-1, 1], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const depthScale = interpolate(depthT, [0, 1], [0.5, 1.15], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const depthAlpha = interpolate(depthT, [0, 1], [0.25, 1.0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const scale = horseBaseScale * depthScale;

          // Face direction of travel (tangent)
          const facingRight = Math.cos(angleRad + Math.PI / 2) > 0;
          const flipX = facingRight ? 1 : -1;

          // Per-horse color from chromaHue spectrum
          const horseHue = (baseHue + (i / NUM_HORSES) * 60 + hd.hueShift + 360) % 360;
          const lightness = 50 + depthT * 25;
          const saturation = 70 + depthT * 15;
          const strokeColor = `hsla(${horseHue}, ${saturation}%, ${lightness}%, ${depthAlpha})`;
          const fillColor = `hsla(${horseHue}, ${saturation - 10}%, ${lightness - 8}%, ${depthAlpha * 0.12})`;
          const saddleColor = `hsla(${(horseHue + 30) % 360}, ${saturation}%, ${lightness + 5}%, ${depthAlpha * 0.25})`;
          const poleColor = `hsla(${horseHue}, 40%, 65%, ${depthAlpha * 0.5})`;
          const spokeAlpha = depthAlpha * 0.2;
          const tailColor = `hsla(${horseHue}, ${saturation + 5}%, ${lightness + 10}%, ${depthAlpha * 0.7})`;

          // Mane glow during fast energy
          const maneGlow = fastEnergy > 0.3 ? fastEnergy * 0.4 : 0;
          const maneFilter =
            maneGlow > 0
              ? `drop-shadow(0 0 ${3 + maneGlow * 6}px hsla(${horseHue}, 90%, 70%, ${maneGlow}))`
              : "none";

          return (
            <g key={i}>
              {/* Spoke from hub to horse base */}
              <line
                x1={cx}
                y1={cy}
                x2={hx}
                y2={hy + bobAmt * scale}
                stroke={`hsla(${horseHue}, 50%, 50%, ${spokeAlpha})`}
                strokeWidth={1.2}
                strokeDasharray="6 4"
              />

              {/* Horse group */}
              <g
                transform={`translate(${hx}, ${hy + bobAmt * scale}) scale(${scale * flipX}, ${scale})`}
                style={{ transformOrigin: "0 0" }}
              >
                <g transform="translate(-46, -45)" style={{ filter: maneFilter }}>
                  {/* Carousel pole — top (above saddle) */}
                  <path
                    d={POLE_TOP}
                    stroke={poleColor}
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                  />
                  {/* Carousel pole — bottom (below horse) */}
                  <path
                    d={POLE_BOTTOM}
                    stroke={poleColor}
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                  />
                  {/* Pole ornamental finial (top ball) */}
                  <circle
                    cx={46}
                    cy={0}
                    r={3}
                    fill={`hsla(${horseHue}, 70%, 70%, ${depthAlpha * 0.6})`}
                  />

                  {/* Horse body (filled) */}
                  <path
                    d={HORSE_BODY}
                    stroke={strokeColor}
                    strokeWidth={1.4}
                    fill={fillColor}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Saddle blanket overlay */}
                  <path
                    d={
                      "M 40 35 C 42 33 46 32 50 33 C 52 34 53 35 52 37 " +
                      "C 50 38 46 38 42 37 C 40 36 40 35 40 35 Z"
                    }
                    fill={saddleColor}
                    stroke={`hsla(${(horseHue + 30) % 360}, ${saturation}%, ${lightness + 15}%, ${depthAlpha * 0.5})`}
                    strokeWidth={0.8}
                  />

                  {/* Head, neck, bridle */}
                  <path
                    d={HORSE_HEAD_NECK}
                    stroke={strokeColor}
                    strokeWidth={1.4}
                    fill={fillColor}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Tail (flowing, highlighted) */}
                  <path
                    d={HORSE_TAIL}
                    stroke={tailColor}
                    strokeWidth={1.6}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Legs with gallop animation offset */}
                  <g transform={`translate(0, ${gallopOffset})`}>
                    <path
                      d={HORSE_LEGS}
                      stroke={strokeColor}
                      strokeWidth={1.3}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                </g>
              </g>
            </g>
          );
        })}

        {/* ============ TOP CANOPY RING (scalloped) ============ */}
        <path
          d={canopyScallops}
          fill="none"
          stroke={`hsla(${baseHue + 10}, 70%, 55%, 0.3)`}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {/* Inner canopy ring */}
        <ellipse
          cx={cx}
          cy={cy - 3}
          rx={radiusX + 22}
          ry={radiusY + 7}
          fill="none"
          stroke={`hsla(${baseHue + 10}, 60%, 50%, 0.2)`}
          strokeWidth={1.2}
        />

        {/* ============ CANOPY DECORATIVE LIGHTS ============ */}
        {lightData.map((ld, li) => {
          const lt = (li / NUM_CANOPY_LIGHTS) * Math.PI * 2;
          const canopyRx = radiusX + 26;
          const canopyRy = radiusY + 8.5;
          const lx = cx + Math.cos(lt) * canopyRx;
          const ly = cy + Math.sin(lt) * canopyRy;

          // Pulse with bass
          const pulse =
            Math.sin(frame * ld.speed + ld.phase) * 0.3 +
            0.7 +
            bass * 0.5;
          const lightAlpha = interpolate(
            pulse * ld.brightness,
            [0, 1.5],
            [0.15, 0.9],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const lightRadius = 2.5 + bass * 2.5 + pulse * 1.5;

          const lightHue = (baseHue + li * 36 + 360) % 360;

          return (
            <g key={`light-${li}`}>
              {/* Glow halo */}
              <circle
                cx={lx}
                cy={ly}
                r={lightRadius * 2.5}
                fill={`hsla(${lightHue}, 80%, 60%, ${lightAlpha * 0.15})`}
              />
              {/* Core light */}
              <circle
                cx={lx}
                cy={ly}
                r={lightRadius}
                fill={`hsla(${lightHue}, 90%, 75%, ${lightAlpha})`}
              />
            </g>
          );
        })}

        {/* ============ CANOPY CENTER FINIAL ============ */}
        {/* Vertical pole from hub upward */}
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy - radiusY * 0.7}
          stroke={`hsla(${baseHue}, 50%, 55%, 0.3)`}
          strokeWidth={2}
        />
        {/* Top finial ornament */}
        <circle
          cx={cx}
          cy={cy - radiusY * 0.7}
          r={4 + fastEnergy * 3}
          fill={`hsla(${baseHue}, 85%, 65%, ${0.4 + fastEnergy * 0.3})`}
        />
        {/* Finial glow */}
        <circle
          cx={cx}
          cy={cy - radiusY * 0.7}
          r={8 + fastEnergy * 6}
          fill={`hsla(${baseHue}, 85%, 65%, ${0.08 + fastEnergy * 0.12})`}
        />
      </svg>
    </div>
  );
};
