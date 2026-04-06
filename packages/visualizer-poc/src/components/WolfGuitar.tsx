/**
 * WolfGuitar — Jerry Garcia's "Wolf" guitar (Doug Irwin, 1973-1979).
 *
 * The guitar before Tiger. Distinctive features:
 *  - Single-cutaway solid body (vs Tiger's double cutaway)
 *  - Wolf head inlay on the upper bout (the namesake)
 *  - Peace symbol inlay near the bridge pickup
 *  - 2 humbuckers with 12 pole pieces each
 *  - Floating bridge with individual saddles and a separate tailpiece
 *  - Doug Irwin custom headstock with truss rod cover
 *  - Subtle horizontal wood grain across the body
 *  - 6 strings vibrating with mid-band amplitude modulation
 *
 * Audio reactivity:
 *  - mids → string vibration amplitude
 *  - otherEnergy → overall visibility boost
 *  - chromaHue → rim glow + wolf inlay glow color
 *  - beatDecay → pickup glow pulse
 *  - bass → knob shimmer
 *  - onsetEnvelope → outer glow flash
 *  - tempoFactor → vibration frequency scaling
 *
 * Continuous rendering — visibility controlled by overlay rotation engine.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Color utilities                                                    */
/* ------------------------------------------------------------------ */

function hueToHex(h: number, s = 0.85, l = 0.6): string {
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

function hueToRgba(h: number, a: number, s = 0.85, l = 0.6): string {
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
  return `rgba(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)},${a})`;
}

/* ------------------------------------------------------------------ */
/*  Geometry constants                                                 */
/* ------------------------------------------------------------------ */

const STRING_COUNT = 6;
const STRING_SPACING = 5.6;
const STRING_BASE_Y = 138;

// Wolf had a different fret marker layout — single dots at 3,5,7,9 and double at 12,
// matching standard, but the inlays were mother-of-pearl diamond/oval shapes.
const SINGLE_FRET_X = [186, 204, 220, 234];
const DOUBLE_FRET_X = 248;

// Pole pieces — 6 per row, 2 rows per humbucker (12 total dots per pickup)
const POLE_PIECE_SPACING = 4.8;

interface Props {
  frames: EnhancedFrameData[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const WolfGuitar: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const {
    energy,
    mids: midEnergy,
    chromaHue: chromaHueDeg,
    beatDecay,
    onsetEnvelope,
    otherEnergy,
    bass,
    highs,
  } = snap;

  // Convert 0-360 hue to 0-1
  const chromaHue = chromaHueDeg / 360;

  /* -- Energy gating -- */
  const energyGate = interpolate(energy, [0.05, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const otherBoost = interpolate(otherEnergy ?? 0, [0.05, 0.32], [0, 0.32], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = energyGate * (0.48 + otherBoost);
  if (opacity < 0.01) return null;

  /* -- Animation parameters -- */
  const breathe = interpolate(energy, [0.05, 0.3], [0.95, 1.07], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Wolf rotates slightly slower than Tiger — lower-key vibe
  const rotation = (frame / 30) * 1.4 * tempoFactor;

  /* -- Color palette derived from chroma hue -- */
  // Wolf had a darker maple body — base it on a slightly cooler hue offset
  const bodyColor = hueToHex(chromaHue + 0.02, 0.62, 0.5);
  const bodyDark = hueToHex(chromaHue, 0.55, 0.3);
  const woodGrainColor = hueToRgba(chromaHue + 0.04, 0.18, 0.55, 0.35);
  const glowColor = hueToHex(chromaHue + 0.08, 0.92, 0.66);
  const stringColor = hueToHex(chromaHue + 0.18, 0.45, 0.78);
  const accentColor = hueToHex(chromaHue + 0.32, 0.6, 0.55);
  const wolfInlayColor = hueToHex(chromaHue + 0.12, 0.85, 0.7);
  const pearlColor = hueToRgba(chromaHue + 0.55, 0.55, 0.2, 0.85);
  const rimColor = hueToRgba(chromaHue + 0.1, 0.4 + beatDecay * 0.32);
  const fretColor = hueToRgba(chromaHue + 0.2, 0.28, 0.4, 0.65);

  /* -- String vibration amplitude from mids -- */
  const vibAmp = interpolate(midEnergy, [0.02, 0.4], [0.3, 3.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* -- Outer glow from energy + onset flash + beat pulse -- */
  const baseGlow = interpolate(energy, [0.05, 0.3], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowRadius = baseGlow + onsetEnvelope * 8 + beatDecay * 6;

  /* -- SVG sizing -- */
  const svgScale = Math.min(width, height) * 0.48;

  /* ================================================================ */
  /*  Build vibrating string paths                                     */
  /* ================================================================ */
  const stringPaths: string[] = [];
  for (let si = 0; si < STRING_COUNT; si++) {
    const y = STRING_BASE_Y + si * STRING_SPACING;
    const freq = 3.5 + si * 0.9;
    const amp = vibAmp * (0.7 + si * 0.18);
    const points: string[] = [];
    // String runs from tailpiece anchor (x=70) through bridge (x=86) to nut (x=262)
    for (let x = 86; x <= 262; x += 2) {
      const t = (x - 86) / 176;
      const env = Math.sin(t * Math.PI);
      const dy =
        Math.sin(frame * 0.28 * freq * tempoFactor + x * 0.06 + si * 1.3) *
        amp *
        env;
      points.push(`${x},${(y + dy).toFixed(2)}`);
    }
    stringPaths.push(points.join(" "));
  }

  /* ================================================================ */
  /*  Wood grain — subtle horizontal lines across the body             */
  /* ================================================================ */
  const woodGrainLines: React.ReactNode[] = [];
  for (let i = 0; i < 9; i++) {
    const gy = 102 + i * 11.5;
    // Slight curvature so grains follow the body contour
    const curve = Math.sin(i * 0.7) * 1.8;
    woodGrainLines.push(
      <path
        key={`grain-${i}`}
        d={`M 50,${gy.toFixed(1)} Q 90,${(gy + curve).toFixed(1)} 130,${(gy - curve * 0.6).toFixed(1)}`}
        stroke={woodGrainColor}
        strokeWidth={0.55 + (i % 3) * 0.2}
        fill="none"
        strokeLinecap="round"
      />,
    );
  }

  /* ================================================================ */
  /*  Pickup pole pieces — 6 per row, 2 rows per humbucker            */
  /* ================================================================ */
  const renderPolePieces = (cx: number, cy: number) => {
    const pieces: React.ReactNode[] = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 6; col++) {
        pieces.push(
          <circle
            key={`pp-${cx}-${row}-${col}`}
            cx={cx - 12 + col * POLE_PIECE_SPACING}
            cy={cy - 2 + row * 4.5}
            r="1.2"
            fill={accentColor}
            opacity={0.6 + midEnergy * 0.3}
          />,
        );
      }
    }
    return pieces;
  };

  /* ================================================================ */
  /*  Bridge saddles — 6 individual                                    */
  /* ================================================================ */
  const bridgeSaddles: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const sy = STRING_BASE_Y + i * STRING_SPACING;
    bridgeSaddles.push(
      <rect
        key={`saddle-${i}`}
        x={82}
        y={sy - 1.5}
        width={5}
        height={3}
        rx={0.5}
        fill={accentColor}
        opacity={0.55}
      />,
    );
  }

  /* ================================================================ */
  /*  Tuning pegs — 3 per side of headstock                           */
  /* ================================================================ */
  const tuningPegs: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const pegX = i < 3 ? 282 : 286;
    const pegY = i < 3 ? 132 + i * 8 : 132 + (i - 3) * 8;
    tuningPegs.push(
      <g key={`peg-${i}`}>
        {/* Peg shaft */}
        <rect
          x={pegX - 1}
          y={pegY - 1.5}
          width={8}
          height={3}
          rx={1}
          fill={bodyDark}
          opacity={0.6}
        />
        {/* Peg button (pearloid) */}
        <circle
          cx={pegX + 8}
          cy={pegY}
          r="2.6"
          fill={accentColor}
          opacity={0.55}
          stroke={bodyDark}
          strokeWidth={0.5}
        />
        <circle
          cx={pegX + 8}
          cy={pegY}
          r="1.4"
          fill={pearlColor}
          opacity={0.5}
        />
      </g>,
    );
  }

  /* ================================================================ */
  /*  Fret lines along the neck                                        */
  /* ================================================================ */
  const fretLines: React.ReactNode[] = [];
  const fretPositions = [170, 178, 186, 194, 204, 212, 220, 228, 234, 240, 248, 254, 260];
  for (let i = 0; i < fretPositions.length; i++) {
    const fx = fretPositions[i];
    fretLines.push(
      <line
        key={`fret-${i}`}
        x1={fx}
        y1={STRING_BASE_Y - 3}
        x2={fx}
        y2={STRING_BASE_Y + 5 * STRING_SPACING + 3}
        stroke={fretColor}
        strokeWidth={0.8}
      />,
    );
  }

  /* ================================================================ */
  /*  Knobs — Wolf had 4 (2 vol + 2 tone)                             */
  /* ================================================================ */
  const knobRadius = 3.4;
  const knobPositions = [
    { cx: 60, cy: 178, label: "vol1" },
    { cx: 72, cy: 188, label: "vol2" },
    { cx: 86, cy: 195, label: "tone1" },
    { cx: 100, cy: 196, label: "tone2" },
  ];

  const knobShimmer = interpolate(bass, [0.05, 0.3], [0.3, 0.72], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Highs-driven pickup glow (Wolf's clean treble bite)
  const pickupGlow = interpolate(highs, [0.05, 0.25], [0, 3.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Beat-decay-driven pickup edge pulse
  const pickupBeatPulse = 0.4 + beatDecay * 0.5;

  // Wolf inlay glow modulation — chromaHue tinted, energy + beat pulsed
  const wolfGlowRadius = 2 + beatDecay * 4 + onsetEnvelope * 3;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          transform: `rotate(${rotation}deg) scale(${breathe})`,
          opacity,
          filter: [
            `drop-shadow(0 0 ${glowRadius}px ${bodyColor})`,
            `drop-shadow(0 0 ${glowRadius * 1.8}px ${glowColor})`,
            `drop-shadow(0 0 ${glowRadius * 0.5}px ${rimColor})`,
          ].join(" "),
          willChange: "transform, opacity, filter",
        }}
      >
        <svg
          width={svgScale}
          height={svgScale * 0.6}
          viewBox="0 0 320 200"
          fill="none"
        >
          {/* ======================================================= */}
          {/*  GUITAR BODY — single-cutaway Wolf shape                 */}
          {/* ======================================================= */}
          {/*
              Wolf has a single cutaway on the upper-treble side
              (toward the neck) and a more rounded, asymmetric lower
              bout. We outline a teardrop-with-horn silhouette.
          */}
          <path
            d={[
              // Upper bout, rounded shoulder (bass side)
              "M 100,94",
              "C 84,90 66,96 54,108",
              // Bass side curve down to lower bout
              "C 42,122 38,142 42,160",
              // Bottom of body (rounded)
              "C 46,178 60,194 80,200",
              "C 100,206 122,202 134,192",
              // Lower-treble bout
              "C 144,182 148,168 146,154",
              // Single cutaway entry (treble horn neck-ward)
              "C 144,142 142,130 144,120",
              // Cutaway notch — tapers in toward neck
              "C 146,112 144,104 138,100",
              // Upper bout right closing
              "C 132,96 120,93 113,93",
              "Z",
            ].join(" ")}
            fill={bodyColor}
            opacity={0.32}
            stroke={bodyColor}
            strokeWidth={2}
          />

          {/* Rim lighting — beat-reactive */}
          <path
            d={[
              "M 100,94",
              "C 84,90 66,96 54,108",
              "C 42,122 38,142 42,160",
              "C 46,178 60,194 80,200",
              "C 100,206 122,202 134,192",
              "C 144,182 148,168 146,154",
              "C 144,142 142,130 144,120",
              "C 146,112 144,104 138,100",
              "C 132,96 120,93 113,93",
              "Z",
            ].join(" ")}
            fill="none"
            stroke={rimColor}
            strokeWidth={1.5 + beatDecay * 1.6}
          />

          {/* ======================================================= */}
          {/*  WOOD GRAIN — subtle horizontal flow                     */}
          {/* ======================================================= */}
          {woodGrainLines}

          {/* Body inner shadow / depth */}
          <path
            d={[
              "M 60,118",
              "C 50,140 50,168 64,184",
              "C 84,196 110,196 124,182",
              "C 134,168 138,148 134,128",
              "C 122,116 100,112 84,114",
              "C 72,116 64,118 60,118",
              "Z",
            ].join(" ")}
            fill={bodyDark}
            opacity={0.12}
          />

          {/* ======================================================= */}
          {/*  WOLF HEAD INLAY — upper bout                            */}
          {/* ======================================================= */}
          {/*
              Small stylized wolf head silhouette. Composed of:
              - rounded skull
              - two pointed triangular ears
              - snout extending forward
              - two eye dots
              Positioned on the upper bass bout above the pickups.
          */}
          <g
            style={{
              filter: `drop-shadow(0 0 ${wolfGlowRadius}px ${wolfInlayColor})`,
            }}
          >
            {/* Skull / head outline */}
            <path
              d={[
                "M 70,108",
                "L 68,103",  // left ear base
                "L 71,99",   // left ear tip
                "L 74,103",  // left ear inner
                "L 78,101",  // top of head between ears
                "L 81,99",   // right ear inner
                "L 84,98",   // right ear tip
                "L 86,103",  // right ear base
                "C 88,107 89,112 87,116",  // right side of head
                "L 91,118",  // snout top
                "L 92,121",  // snout tip
                "L 88,121",  // snout bottom
                "L 86,119",  // jaw notch
                "C 80,121 73,120 70,116",  // left side of jaw
                "C 67,113 67,110 70,108",  // close to start
                "Z",
              ].join(" ")}
              fill={wolfInlayColor}
              opacity={0.78}
              stroke={pearlColor}
              strokeWidth={0.45}
            />
            {/* Inner ear shading */}
            <path
              d="M 70,103 L 71,100 L 73,103 Z"
              fill={bodyDark}
              opacity={0.5}
            />
            <path
              d="M 82,103 L 84,99 L 85,103 Z"
              fill={bodyDark}
              opacity={0.5}
            />
            {/* Eye */}
            <circle cx={78} cy={110} r={0.9} fill={bodyDark} opacity={0.85} />
            {/* Nose */}
            <circle cx={91} cy={119.5} r={0.7} fill={bodyDark} opacity={0.85} />
          </g>

          {/* ======================================================= */}
          {/*  PEACE SYMBOL INLAY — between pickups                    */}
          {/* ======================================================= */}
          <g opacity={0.7}>
            <circle
              cx={111}
              cy={144}
              r={4.2}
              fill="none"
              stroke={pearlColor}
              strokeWidth={0.7}
            />
            {/* Vertical stem */}
            <line
              x1={111}
              y1={140}
              x2={111}
              y2={148}
              stroke={pearlColor}
              strokeWidth={0.7}
            />
            {/* Two diagonal arms */}
            <line
              x1={111}
              y1={144}
              x2={108}
              y2={147}
              stroke={pearlColor}
              strokeWidth={0.7}
            />
            <line
              x1={111}
              y1={144}
              x2={114}
              y2={147}
              stroke={pearlColor}
              strokeWidth={0.7}
            />
          </g>

          {/* ======================================================= */}
          {/*  PICKUPS — 2 humbuckers with pole pieces                 */}
          {/* ======================================================= */}
          {/* Neck pickup */}
          <rect
            x={96}
            y={128}
            width={30}
            height={10}
            rx={2}
            fill={bodyDark}
            opacity={0.5}
            style={{
              filter:
                pickupGlow > 0.5
                  ? `drop-shadow(0 0 ${pickupGlow}px ${glowColor})`
                  : undefined,
            }}
          />
          <rect
            x={97}
            y={129}
            width={28}
            height={8}
            rx={1.5}
            fill="none"
            stroke={accentColor}
            strokeWidth={0.4}
            opacity={pickupBeatPulse}
          />
          {renderPolePieces(111, 133)}

          {/* Bridge pickup */}
          <rect
            x={96}
            y={150}
            width={30}
            height={10}
            rx={2}
            fill={bodyDark}
            opacity={0.5}
            style={{
              filter:
                pickupGlow > 0.5
                  ? `drop-shadow(0 0 ${pickupGlow}px ${glowColor})`
                  : undefined,
            }}
          />
          <rect
            x={97}
            y={151}
            width={28}
            height={8}
            rx={1.5}
            fill="none"
            stroke={accentColor}
            strokeWidth={0.4}
            opacity={pickupBeatPulse}
          />
          {renderPolePieces(111, 155)}

          {/* Pickup toggle switch */}
          <line
            x1={132}
            y1={128}
            x2={132}
            y2={140}
            stroke={accentColor}
            strokeWidth={1.2}
            opacity={0.55}
          />
          <circle cx={132} cy={129} r={1.9} fill={accentColor} opacity={0.65} />
          <circle cx={132} cy={129} r={0.8} fill={pearlColor} opacity={0.6} />

          {/* ======================================================= */}
          {/*  BRIDGE + TAILPIECE                                      */}
          {/* ======================================================= */}
          {/* Wolf had a separate bridge/tailpiece system: floating
              bridge with individual saddles forward of a stoptail-style
              tailpiece. Render the bridge plate, saddles, then a
              distinct rectangular tailpiece with an angled escape
              for the strings. */}

          {/* Bridge plate */}
          <rect
            x={80}
            y={STRING_BASE_Y - 5}
            width={8}
            height={STRING_SPACING * 5 + 10}
            rx={1}
            fill={bodyDark}
            opacity={0.4}
          />
          {bridgeSaddles}

          {/* Tailpiece — Wolf style: blocky stoptail with through-holes */}
          <rect
            x={66}
            y={STRING_BASE_Y - 4}
            width={8}
            height={STRING_SPACING * 5 + 8}
            rx={1.5}
            fill={bodyDark}
            opacity={0.42}
            stroke={accentColor}
            strokeWidth={0.4}
          />
          {/* Tailpiece string-through holes */}
          {Array.from({ length: 6 }).map((_, i) => (
            <circle
              key={`tail-hole-${i}`}
              cx={70}
              cy={STRING_BASE_Y + i * STRING_SPACING}
              r={0.9}
              fill={accentColor}
              opacity={0.7}
            />
          ))}

          {/* ======================================================= */}
          {/*  KNOBS (2 Volume + 2 Tone)                               */}
          {/* ======================================================= */}
          {knobPositions.map((knob) => (
            <g key={knob.label}>
              {/* Knob body */}
              <circle
                cx={knob.cx}
                cy={knob.cy}
                r={knobRadius}
                fill={bodyDark}
                opacity={0.42 + knobShimmer * 0.22}
                stroke={accentColor}
                strokeWidth={0.6}
              />
              {/* Knob indicator line */}
              <line
                x1={knob.cx}
                y1={knob.cy}
                x2={knob.cx}
                y2={knob.cy - knobRadius + 0.8}
                stroke={accentColor}
                strokeWidth={0.6}
                opacity={0.55}
              />
              {/* Knob ring detail */}
              <circle
                cx={knob.cx}
                cy={knob.cy}
                r={knobRadius - 1}
                fill="none"
                stroke={accentColor}
                strokeWidth={0.3}
                opacity={0.35}
              />
              {/* Pearloid cap center */}
              <circle
                cx={knob.cx}
                cy={knob.cy}
                r={knobRadius - 2}
                fill={pearlColor}
                opacity={0.4}
              />
            </g>
          ))}

          {/* Output jack */}
          <circle cx={52} cy={170} r={2.6} fill={bodyDark} opacity={0.45} />
          <circle
            cx={52}
            cy={170}
            r={1.5}
            fill="none"
            stroke={accentColor}
            strokeWidth={0.5}
            opacity={0.5}
          />
          <circle cx={52} cy={170} r={0.6} fill={accentColor} opacity={0.55} />

          {/* ======================================================= */}
          {/*  NECK + FRETBOARD                                        */}
          {/* ======================================================= */}
          {/* Neck back (lighter wood) */}
          <rect
            x={148}
            y={STRING_BASE_Y - 7}
            width={120}
            height={STRING_SPACING * 5 + 14}
            rx={2}
            fill={bodyColor}
            opacity={0.22}
            stroke={bodyColor}
            strokeWidth={0.8}
          />

          {/* Fretboard — darker rosewood */}
          <rect
            x={155}
            y={STRING_BASE_Y - 4}
            width={108}
            height={STRING_SPACING * 5 + 8}
            rx={1.5}
            fill={bodyDark}
            opacity={0.22}
          />

          {/* Fret wire lines */}
          {fretLines}

          {/* ----- Mother-of-pearl fret markers ----- */}
          {/* Wolf used distinctive ovular pearl inlays. Render them
              as small ellipses with subtle chromatic glow. */}
          {SINGLE_FRET_X.map((fx) => (
            <g key={`fmark-${fx}`}>
              <ellipse
                cx={fx}
                cy={STRING_BASE_Y + 2.5 * STRING_SPACING}
                rx={2.0}
                ry={1.4}
                fill={pearlColor}
                opacity={0.6}
              />
              <ellipse
                cx={fx}
                cy={STRING_BASE_Y + 2.5 * STRING_SPACING}
                rx={1.0}
                ry={0.6}
                fill={wolfInlayColor}
                opacity={0.55}
              />
            </g>
          ))}

          {/* Double-dot 12th fret (oval pearls) */}
          <ellipse
            cx={DOUBLE_FRET_X}
            cy={STRING_BASE_Y + 1.2 * STRING_SPACING}
            rx={2.0}
            ry={1.4}
            fill={pearlColor}
            opacity={0.65}
          />
          <ellipse
            cx={DOUBLE_FRET_X}
            cy={STRING_BASE_Y + 3.8 * STRING_SPACING}
            rx={2.0}
            ry={1.4}
            fill={pearlColor}
            opacity={0.65}
          />

          {/* Nut */}
          <rect
            x={262}
            y={STRING_BASE_Y - 4}
            width={2.5}
            height={STRING_SPACING * 5 + 8}
            rx={0.5}
            fill={accentColor}
            opacity={0.5}
          />

          {/* ======================================================= */}
          {/*  HEADSTOCK — Doug Irwin custom shape                     */}
          {/* ======================================================= */}
          {/*
              Doug Irwin's custom headstock for Wolf was an asymmetric
              "open book" silhouette — narrower at the nut, flaring
              outward toward the tip with a slight dropoff on the
              treble side. Render with two paths for face + edge.
          */}
          <path
            d={[
              "M 265,130",
              "L 273,124",
              "C 280,118 290,116 297,121",
              "L 301,127",
              "C 304,132 304,138 302,144",
              "L 302,150",
              "C 304,156 304,162 301,167",
              "L 297,172",
              "C 290,177 280,175 273,170",
              "L 265,164",
              "Z",
            ].join(" ")}
            fill={bodyColor}
            opacity={0.3}
            stroke={bodyColor}
            strokeWidth={1.2}
          />

          {/* Headstock face (lighter inner panel) */}
          <path
            d={[
              "M 268,133",
              "L 275,128",
              "C 282,123 290,123 295,127",
              "L 298,131",
              "C 300,136 300,140 299,144",
              "L 299,150",
              "C 300,154 300,158 298,162",
              "L 295,165",
              "C 290,168 282,168 275,164",
              "L 268,159",
              "Z",
            ].join(" ")}
            fill={bodyColor}
            opacity={0.12}
          />

          {/* Truss rod cover — small bell-shaped plate near nut */}
          <path
            d={[
              "M 267,142",
              "L 271,140",
              "C 273,140 273,144 273,146",
              "L 273,150",
              "C 273,152 273,154 271,154",
              "L 267,152",
              "Z",
            ].join(" ")}
            fill={bodyDark}
            opacity={0.55}
            stroke={accentColor}
            strokeWidth={0.4}
          />
          {/* Truss rod cover screws */}
          <circle cx={269} cy={143} r={0.5} fill={accentColor} opacity={0.7} />
          <circle cx={269} cy={151} r={0.5} fill={accentColor} opacity={0.7} />

          {/* Tuning pegs — 3 per side */}
          {tuningPegs}

          {/* String trees (2 small guides on headstock) */}
          <rect
            x={272}
            y={137}
            width={3}
            height={1.5}
            rx={0.5}
            fill={accentColor}
            opacity={0.5}
          />
          <rect
            x={272}
            y={153}
            width={3}
            height={1.5}
            rx={0.5}
            fill={accentColor}
            opacity={0.5}
          />

          {/* ======================================================= */}
          {/*  VIBRATING STRINGS                                       */}
          {/* ======================================================= */}
          {stringPaths.map((path, si) => {
            const thickness = 0.6 + si * 0.18;
            const stringGlow = 1.5 + midEnergy * 4;
            const stringOpacity = 0.5 + midEnergy * 0.4;
            return (
              <polyline
                key={`str-${si}`}
                points={path}
                stroke={stringColor}
                strokeWidth={thickness}
                fill="none"
                opacity={stringOpacity}
                style={{
                  filter: `drop-shadow(0 0 ${stringGlow}px ${stringColor})`,
                }}
              />
            );
          })}

          {/* String anchor points at the bridge */}
          {Array.from({ length: 6 }).map((_, i) => (
            <circle
              key={`anchor-b-${i}`}
              cx={86}
              cy={STRING_BASE_Y + i * STRING_SPACING}
              r={0.85}
              fill={stringColor}
              opacity={0.55}
            />
          ))}

          {/* String anchor points at the nut */}
          {Array.from({ length: 6 }).map((_, i) => (
            <circle
              key={`anchor-n-${i}`}
              cx={262}
              cy={STRING_BASE_Y + i * STRING_SPACING}
              r={0.7}
              fill={stringColor}
              opacity={0.45}
            />
          ))}
        </svg>
      </div>
    </div>
  );
};
