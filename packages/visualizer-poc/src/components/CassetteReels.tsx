/**
 * CassetteReels — A+++ detailed cassette tape overlay.
 *
 * Taper culture homage: a photorealistic SVG cassette tape with full housing,
 * clear window, spinning reels, tape path, label area, screw holes,
 * write-protect tabs, and head gap guides.
 *
 * Audio-reactive: reel speed tied to tempo, bass drives tape flutter,
 * beat decay pulses label glow, chroma hue tints neon outline.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ─── Constants ─── */

const SHELL_W = 320;
const SHELL_H = 202;
const CORNER_R = 10;
const SCREW_R = 4;
const SCREW_INSET = 14;

// Reel geometry
const REEL_CX_L = 102;
const REEL_CX_R = 218;
const REEL_CY = 108;
const REEL_OUTER_R = 36;
const HUB_R = 12;
const SPINDLE_R = 4.5;
const SPOKE_COUNT = 6;

// Tape path
const HEAD_GAP_Y = 156;
const GUIDE_SIZE = 4;

// Window
const WIN_X = 60;
const WIN_Y = 68;
const WIN_W = 200;
const WIN_H = 94;
const WIN_R = 6;

// Label
const LABEL_X = 46;
const LABEL_Y = 14;
const LABEL_W = 228;
const LABEL_H = 48;
const LABEL_R = 3;

/* ─── Sub-components ─── */

/** Screw hole with Phillips cross detail */
const ScrewHole: React.FC<{ cx: number; cy: number }> = ({ cx, cy }) => (
  <g>
    <circle cx={cx} cy={cy} r={SCREW_R} fill="#3a3026" stroke="#5a4a3a" strokeWidth={0.8} />
    <line x1={cx - 2} y1={cy} x2={cx + 2} y2={cy} stroke="#6a5a4a" strokeWidth={0.6} />
    <line x1={cx} y1={cy - 2} x2={cx} y2={cy + 2} stroke="#6a5a4a" strokeWidth={0.6} />
  </g>
);

/** Single tape reel with spokes, hub, and wound tape */
const TapeReel: React.FC<{
  cx: number;
  cy: number;
  rotation: number;
  fillAmount: number;
  wobble: number;
}> = ({ cx, cy, rotation, fillAmount, wobble }) => {
  const tapeR = HUB_R + fillAmount * (REEL_OUTER_R - HUB_R);
  const wobbleX = Math.sin(wobble) * 0.4;
  const wobbleY = Math.cos(wobble * 1.3) * 0.3;

  return (
    <g transform={`translate(${wobbleX} ${wobbleY})`}>
      {/* Wound tape — concentric rings for depth */}
      {tapeR > HUB_R + 2 && (
        <>
          <circle cx={cx} cy={cy} r={tapeR} fill="#1a1410" stroke="#2a2018" strokeWidth={0.5} />
          {/* Tape sheen rings */}
          {[0.3, 0.5, 0.7, 0.85].map((t) => {
            const r = HUB_R + t * (tapeR - HUB_R);
            return (
              <circle
                key={t}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="#3a2a1a"
                strokeWidth={0.3}
                opacity={0.5 + t * 0.3}
              />
            );
          })}
          {/* Subtle highlight on tape edge */}
          <circle cx={cx} cy={cy} r={tapeR - 0.5} fill="none" stroke="#4a3828" strokeWidth={0.4} opacity={0.6} />
        </>
      )}

      {/* Rotating hub group */}
      <g transform={`rotate(${rotation} ${cx} ${cy})`}>
        {/* Hub outer ring */}
        <circle cx={cx} cy={cy} r={HUB_R} fill="#2a2420" stroke="#8a7a68" strokeWidth={1} />

        {/* Hub teeth / grip ridges */}
        {Array.from({ length: 18 }).map((_, i) => {
          const a = (i / 18) * Math.PI * 2;
          const r1 = HUB_R - 1.5;
          const r2 = HUB_R;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * r1}
              y1={cy + Math.sin(a) * r1}
              x2={cx + Math.cos(a) * r2}
              y2={cy + Math.sin(a) * r2}
              stroke="#9a8a78"
              strokeWidth={0.5}
              opacity={0.5}
            />
          );
        })}

        {/* Spokes */}
        {Array.from({ length: SPOKE_COUNT }).map((_, i) => {
          const a = (i / SPOKE_COUNT) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * (SPINDLE_R + 1)}
              y1={cy + Math.sin(a) * (SPINDLE_R + 1)}
              x2={cx + Math.cos(a) * (HUB_R - 2)}
              y2={cy + Math.sin(a) * (HUB_R - 2)}
              stroke="#aaa090"
              strokeWidth={1.2}
              strokeLinecap="round"
            />
          );
        })}

        {/* Spindle hole */}
        <circle cx={cx} cy={cy} r={SPINDLE_R} fill="#0e0c0a" stroke="#6a5a48" strokeWidth={0.8} />
        {/* Inner spindle detail */}
        <circle cx={cx} cy={cy} r={SPINDLE_R - 1.5} fill="none" stroke="#4a3a28" strokeWidth={0.4} />
      </g>
    </g>
  );
};

/* ─── Main Component ─── */

interface Props {
  frames: EnhancedFrameData[];
}

export const CassetteReels: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const showCtx = useShowContext();
  const audio = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  // ─── Audio-reactive values ───
  const { energy, bass, chromaHue, beatDecay } = audio;

  // ─── Tape progress ───
  const tapeProgress = Math.min(1, frame / Math.max(1, durationInFrames));
  const supplyFill = 1 - tapeProgress * 0.85; // never fully empty
  const takeupFill = 0.08 + tapeProgress * 0.85;

  // ─── Reel rotation ───
  const baseSpeed = 2.0 * tempoFactor;
  const speedBoost = energy * 1.5;
  const rpm = baseSpeed + speedBoost;
  // Supply reel rotates CCW, take-up CW
  // Take-up spins faster as it has less tape (smaller effective radius)
  const supplyRotation = -(frame * rpm);
  const takeupRotation = frame * rpm * (1 + tapeProgress * 0.3);

  // ─── Bass-driven wobble / flutter ───
  const wobblePhase = frame * 0.15;
  const wobbleAmp = bass * 6;

  // ─── Neon glow color from chroma hue ───
  const neonHue = chromaHue ?? 30;
  const neonColor = `hsl(${neonHue}, 85%, 60%)`;
  const neonGlow = `hsl(${neonHue}, 90%, 50%)`;

  // ─── Beat-pulse label glow ───
  const labelGlowIntensity = 0.3 + beatDecay * 0.7;

  // ─── Tape counter ───
  const totalSeconds = Math.floor(frame / fps);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const counter = `${String(mins).padStart(3, "0")}:${String(secs).padStart(2, "0")}`;

  // ─── Show info ───
  const bandName = showCtx?.bandName ?? "GRATEFUL DEAD";
  const venue = showCtx?.venueShort ?? "";
  const dateStr = showCtx?.dateShort ?? "";
  const taper = showCtx?.taperInfo ?? "";

  // ─── Cassette type based on duration ───
  const durationMins = durationInFrames / fps / 60;
  const cassetteType = durationMins > 60 ? "C-120" : durationMins > 30 ? "C-90" : "C-60";

  // ─── REC indicator blink ───
  const recOn = Math.floor(frame / (fps * 0.5)) % 2 === 0;

  // ─── Tape path: supply reel → guide → head → guide → take-up reel ───
  // Tangent points on each reel's tape winding
  const supplyTapeR = HUB_R + supplyFill * (REEL_OUTER_R - HUB_R);
  const takeupTapeR = HUB_R + takeupFill * (REEL_OUTER_R - HUB_R);

  const guideL_X = REEL_CX_L + 10;
  const guideR_X = REEL_CX_R - 10;
  const guideY = HEAD_GAP_Y - 6;

  // SVG path: tape exits supply reel bottom, goes to left guide, across head gap, to right guide, up to take-up reel
  const tapePath = [
    `M ${REEL_CX_L} ${REEL_CY + supplyTapeR}`,
    `L ${guideL_X} ${guideY}`,
    `L ${guideR_X} ${guideY}`,
    `L ${REEL_CX_R} ${REEL_CY + takeupTapeR}`,
  ].join(" ");

  return (
    <div
      style={{
        position: "absolute",
        top: 18,
        right: 18,
        pointerEvents: "none",
        opacity: interpolate(energy, [0, 0.3, 0.8], [0.45, 0.55, 0.65], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        filter: `drop-shadow(0 0 ${4 + beatDecay * 8}px ${neonGlow})`,
        transform: `scale(0.85)`,
        transformOrigin: "top right",
      }}
    >
      <svg
        width={SHELL_W}
        height={SHELL_H}
        viewBox={`0 0 ${SHELL_W} ${SHELL_H}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Shell gradient — warm amber/brown */}
          <linearGradient id="cassette-shell" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6a5438" />
            <stop offset="50%" stopColor="#5a4428" />
            <stop offset="100%" stopColor="#4a3418" />
          </linearGradient>

          {/* Window tint — clear with slight blue-grey */}
          <linearGradient id="cassette-window" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a2030" />
            <stop offset="100%" stopColor="#141820" />
          </linearGradient>

          {/* Label gradient */}
          <linearGradient id="cassette-label" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#e8dcc8" />
            <stop offset="50%" stopColor="#f0e6d4" />
            <stop offset="100%" stopColor="#e0d4be" />
          </linearGradient>

          {/* Neon glow filter */}
          <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={1.5 + beatDecay * 2} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ═══ Outer shell ═══ */}
        <rect
          x={1}
          y={1}
          width={SHELL_W - 2}
          height={SHELL_H - 2}
          rx={CORNER_R}
          ry={CORNER_R}
          fill="url(#cassette-shell)"
          stroke="#7a6a58"
          strokeWidth={1.2}
        />

        {/* Shell inner bevel */}
        <rect
          x={4}
          y={4}
          width={SHELL_W - 8}
          height={SHELL_H - 8}
          rx={CORNER_R - 2}
          ry={CORNER_R - 2}
          fill="none"
          stroke="#8a7a68"
          strokeWidth={0.4}
          opacity={0.5}
        />

        {/* ═══ Screw holes (4 corners) ═══ */}
        <ScrewHole cx={SCREW_INSET} cy={SCREW_INSET} />
        <ScrewHole cx={SHELL_W - SCREW_INSET} cy={SCREW_INSET} />
        <ScrewHole cx={SCREW_INSET} cy={SHELL_H - SCREW_INSET} />
        <ScrewHole cx={SHELL_W - SCREW_INSET} cy={SHELL_H - SCREW_INSET} />

        {/* ═══ Label area ═══ */}
        <rect
          x={LABEL_X}
          y={LABEL_Y}
          width={LABEL_W}
          height={LABEL_H}
          rx={LABEL_R}
          ry={LABEL_R}
          fill="url(#cassette-label)"
          stroke="#c0b098"
          strokeWidth={0.6}
          filter="url(#neon-glow)"
          opacity={labelGlowIntensity}
        />

        {/* Label ruled lines */}
        {[24, 32, 40, 48].map((lineY) => (
          <line
            key={lineY}
            x1={LABEL_X + 8}
            y1={lineY}
            x2={LABEL_X + LABEL_W - 8}
            y2={lineY}
            stroke="#b8a890"
            strokeWidth={0.3}
            opacity={0.5}
          />
        ))}

        {/* Band name — handwritten feel */}
        <text
          x={SHELL_W / 2}
          y={28}
          textAnchor="middle"
          fontFamily="'Courier New', Courier, monospace"
          fontWeight="bold"
          fontSize={10}
          fill="#2a1e10"
          letterSpacing={2}
        >
          {bandName.toUpperCase()}
        </text>

        {/* Venue + date */}
        <text
          x={SHELL_W / 2}
          y={39}
          textAnchor="middle"
          fontFamily="'Courier New', Courier, monospace"
          fontSize={7}
          fill="#4a3a28"
          letterSpacing={0.5}
        >
          {venue && dateStr ? `${venue}  ${dateStr}` : "LIVE"}
        </text>

        {/* Taper credit (if available) */}
        {taper && (
          <text
            x={SHELL_W / 2}
            y={49}
            textAnchor="middle"
            fontFamily="'Courier New', Courier, monospace"
            fontSize={5.5}
            fill="#6a5a48"
            letterSpacing={0.3}
          >
            {`Taped by: ${taper.length > 36 ? taper.slice(0, 33) + "..." : taper}`}
          </text>
        )}

        {/* Cassette type marking */}
        <text
          x={LABEL_X + LABEL_W - 6}
          y={23}
          textAnchor="end"
          fontFamily="'Courier New', Courier, monospace"
          fontWeight="bold"
          fontSize={6}
          fill="#8a7a68"
        >
          {cassetteType}
        </text>

        {/* ═══ Clear window ═══ */}
        <rect
          x={WIN_X}
          y={WIN_Y}
          width={WIN_W}
          height={WIN_H}
          rx={WIN_R}
          ry={WIN_R}
          fill="url(#cassette-window)"
          stroke="#5a5a6a"
          strokeWidth={0.8}
          opacity={0.95}
        />
        {/* Window inner highlight (glass effect) */}
        <rect
          x={WIN_X + 2}
          y={WIN_Y + 2}
          width={WIN_W - 4}
          height={4}
          rx={2}
          fill="#ffffff"
          opacity={0.04}
        />

        {/* ═══ Tape reels inside window ═══ */}

        {/* Reel wells (circular depressions in shell visible through window) */}
        <circle cx={REEL_CX_L} cy={REEL_CY} r={REEL_OUTER_R + 3} fill="none" stroke="#2a2a3a" strokeWidth={0.6} opacity={0.4} />
        <circle cx={REEL_CX_R} cy={REEL_CY} r={REEL_OUTER_R + 3} fill="none" stroke="#2a2a3a" strokeWidth={0.6} opacity={0.4} />

        {/* Supply reel (left — full side, CCW) */}
        <TapeReel
          cx={REEL_CX_L}
          cy={REEL_CY}
          rotation={supplyRotation}
          fillAmount={supplyFill}
          wobble={wobblePhase * wobbleAmp}
        />

        {/* Take-up reel (right — growing, CW) */}
        <TapeReel
          cx={REEL_CX_R}
          cy={REEL_CY}
          rotation={takeupRotation}
          fillAmount={takeupFill}
          wobble={(wobblePhase + Math.PI) * wobbleAmp}
        />

        {/* ═══ Tape path (strip connecting reels through head gap) ═══ */}
        <path
          d={tapePath}
          stroke="#1a1410"
          strokeWidth={1.2}
          fill="none"
          opacity={0.8}
        />
        {/* Tape sheen */}
        <path
          d={tapePath}
          stroke="#3a2a1a"
          strokeWidth={0.4}
          fill="none"
          opacity={0.4}
        />

        {/* ═══ Head gap & guides ═══ */}

        {/* Left guide post */}
        <rect
          x={guideL_X - GUIDE_SIZE / 2}
          y={guideY - GUIDE_SIZE}
          width={GUIDE_SIZE}
          height={GUIDE_SIZE * 2}
          rx={1}
          fill="#5a5a68"
          stroke="#7a7a88"
          strokeWidth={0.4}
        />

        {/* Right guide post */}
        <rect
          x={guideR_X - GUIDE_SIZE / 2}
          y={guideY - GUIDE_SIZE}
          width={GUIDE_SIZE}
          height={GUIDE_SIZE * 2}
          rx={1}
          fill="#5a5a68"
          stroke="#7a7a88"
          strokeWidth={0.4}
        />

        {/* Head gap (center — where the playback/record head sits) */}
        <rect
          x={SHELL_W / 2 - 14}
          y={HEAD_GAP_Y - 4}
          width={28}
          height={6}
          rx={1}
          fill="#3a3a4a"
          stroke="#5a5a6a"
          strokeWidth={0.5}
        />
        {/* Head poles */}
        <circle cx={SHELL_W / 2 - 6} cy={HEAD_GAP_Y - 1} r={1.5} fill="#8a8a98" />
        <circle cx={SHELL_W / 2 + 6} cy={HEAD_GAP_Y - 1} r={1.5} fill="#8a8a98" />

        {/* Pinch roller */}
        <circle cx={SHELL_W / 2 + 22} cy={HEAD_GAP_Y - 1} r={3} fill="#2a2a2a" stroke="#4a4a4a" strokeWidth={0.5} />

        {/* ═══ Write-protect tabs (bottom corners of shell) ═══ */}
        {/* Left tab — present (not broken out) */}
        <rect x={30} y={SHELL_H - 10} width={10} height={6} rx={1} fill="none" stroke="#7a6a58" strokeWidth={0.5} />
        <rect x={31} y={SHELL_H - 9} width={8} height={4} rx={0.5} fill="#5a4a38" opacity={0.7} />
        {/* Right tab — broken out (recorded over) */}
        <rect x={SHELL_W - 40} y={SHELL_H - 10} width={10} height={6} rx={1} fill="none" stroke="#7a6a58" strokeWidth={0.5} />

        {/* ═══ Bottom detail — access holes for head alignment ═══ */}
        <rect x={SHELL_W / 2 - 20} y={SHELL_H - 6} width={40} height={4} rx={2} fill="none" stroke="#6a5a48" strokeWidth={0.4} opacity={0.5} />

        {/* ═══ Neon glow outline ═══ */}
        <rect
          x={1}
          y={1}
          width={SHELL_W - 2}
          height={SHELL_H - 2}
          rx={CORNER_R}
          ry={CORNER_R}
          fill="none"
          stroke={neonColor}
          strokeWidth={1.2}
          opacity={0.3 + beatDecay * 0.4}
          filter="url(#neon-glow)"
        />
      </svg>

      {/* ═══ Counter + REC indicator (below cassette) ═══ */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 3,
          padding: "2px 10px",
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 12,
          color: neonColor,
          letterSpacing: 2,
        }}
      >
        {/* Mechanical counter */}
        <span
          style={{
            background: "rgba(0,0,0,0.5)",
            padding: "1px 6px",
            borderRadius: 2,
            border: `0.5px solid ${neonColor}`,
            opacity: 0.8,
          }}
        >
          {counter}
        </span>

        {/* REC indicator */}
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            opacity: recOn ? 0.9 : 0.15,
            transition: "opacity 0.1s",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#FF1744",
              display: "inline-block",
              boxShadow: recOn ? "0 0 6px #FF1744" : "none",
            }}
          />
          <span style={{ fontSize: 10, fontWeight: "bold" }}>REC</span>
        </span>
      </div>
    </div>
  );
};
