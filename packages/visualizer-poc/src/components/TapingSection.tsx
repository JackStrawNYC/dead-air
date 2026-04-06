/**
 * TapingSection — A+++ reel-to-reel tape deck + condenser microphone.
 * Layer 7, tier A+++, tags: dead-culture, retro, taper.
 *
 * The taping section was sacred ground at Dead shows. Behind the soundboard,
 * a forest of microphone stands, Nakamichi decks whirring, tapers hunched
 * over headphones — preserving the music for eternity. This overlay honors
 * that tradition with obsessive detail.
 *
 * Features:
 * - Reel-to-reel deck: two reels with spoke/hub/wound-tape detail,
 *   tempo-driven rotation (supply CCW, take-up CW), tape path across
 *   head block, VU meters with bouncing needles, transport controls,
 *   branding plate.
 * - Condenser microphone: tall stand with tripod base, cylinder body
 *   with grille detail, shock mount rings, draped XLR cable.
 * - Headphones draped over deck edge.
 * - Audio reactivity: energy drives VU needles (with beat overshoot),
 *   bass drives reel wobble, beatDecay pulses REC indicator,
 *   chromaHue tints neon glow, tempo scales reel rotation.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { useShowContext } from "../data/ShowContext";

/* ═══════════════════════════════════════════════════════════════════════ */
/*  Constants                                                             */
/* ═══════════════════════════════════════════════════════════════════════ */

const VB_W = 440;
const VB_H = 320;

// Deck body
const DECK_X = 10;
const DECK_Y = 10;
const DECK_W = 280;
const DECK_H = 200;
const DECK_R = 8;

// Reels
const REEL_L_CX = 85;
const REEL_R_CX = 215;
const REEL_CY = 72;
const REEL_OUTER_R = 42;
const HUB_R = 13;
const SPINDLE_R = 5;
const SPOKE_COUNT = 6;

// Head block
const HEAD_Y = 145;
const HEAD_W = 60;
const HEAD_H = 10;

// VU meters
const VU_L_CX = 85;
const VU_R_CX = 215;
const VU_CY = 168;
const VU_W = 56;
const VU_H = 28;
const VU_R = 4;
const NEEDLE_LEN = 22;

// Transport controls
const TRANSPORT_Y = 184;
const BTN_R = 5.5;
const BTN_GAP = 18;

// Microphone
const MIC_X = 340;
const MIC_STAND_TOP = 20;
const MIC_STAND_BOTTOM = 290;
const MIC_BODY_R = 9;
const MIC_BODY_H = 32;
const GRILLE_LINES = 8;

/* ═══════════════════════════════════════════════════════════════════════ */
/*  Utilities                                                             */
/* ═══════════════════════════════════════════════════════════════════════ */

/** Map 0-1 hue + saturation/lightness to CSS hsl string */
function hueToHSL(h: number, s = 85, l = 60): string {
  return `hsl(${((h % 360) + 360) % 360}, ${s}%, ${l}%)`;
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  Sub-components                                                        */
/* ═══════════════════════════════════════════════════════════════════════ */

/** Single tape reel with wound tape, hub, spokes, spindle */
const TapeReel: React.FC<{
  cx: number;
  cy: number;
  rotation: number;
  fillAmount: number;
  wobble: number;
  neonColor: string;
}> = ({ cx, cy, rotation, fillAmount, wobble, neonColor }) => {
  const tapeR = HUB_R + fillAmount * (REEL_OUTER_R - HUB_R);
  const wobbleX = Math.sin(wobble) * 0.5;
  const wobbleY = Math.cos(wobble * 1.3) * 0.4;

  return (
    <g transform={`translate(${wobbleX} ${wobbleY})`}>
      {/* Reel flange — outer ring */}
      <circle
        cx={cx}
        cy={cy}
        r={REEL_OUTER_R}
        fill="none"
        stroke="#5a5a68"
        strokeWidth={1.5}
        opacity={0.6}
      />
      <circle
        cx={cx}
        cy={cy}
        r={REEL_OUTER_R - 1}
        fill="none"
        stroke="#4a4a58"
        strokeWidth={0.4}
        opacity={0.3}
      />

      {/* Wound tape — concentric rings for depth */}
      {tapeR > HUB_R + 2 && (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={tapeR}
            fill="#1a1410"
            stroke="#2a2018"
            strokeWidth={0.5}
          />
          {/* Tape sheen rings — the subtle gloss of wound tape */}
          {[0.2, 0.35, 0.5, 0.65, 0.8, 0.92].map((t) => {
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
                opacity={0.35 + t * 0.35}
              />
            );
          })}
          {/* Tape edge highlight */}
          <circle
            cx={cx}
            cy={cy}
            r={tapeR - 0.5}
            fill="none"
            stroke="#4a3828"
            strokeWidth={0.4}
            opacity={0.5}
          />
        </>
      )}

      {/* Rotating hub assembly */}
      <g transform={`rotate(${rotation} ${cx} ${cy})`}>
        {/* Hub outer ring */}
        <circle
          cx={cx}
          cy={cy}
          r={HUB_R}
          fill="#2a2420"
          stroke="#8a7a68"
          strokeWidth={1}
        />

        {/* Hub grip ridges */}
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2;
          const r1 = HUB_R - 1.8;
          const r2 = HUB_R;
          return (
            <line
              key={`grip-${i}`}
              x1={cx + Math.cos(a) * r1}
              y1={cy + Math.sin(a) * r1}
              x2={cx + Math.cos(a) * r2}
              y2={cy + Math.sin(a) * r2}
              stroke="#9a8a78"
              strokeWidth={0.4}
              opacity={0.45}
            />
          );
        })}

        {/* Spokes */}
        {Array.from({ length: SPOKE_COUNT }).map((_, i) => {
          const a = (i / SPOKE_COUNT) * Math.PI * 2;
          return (
            <line
              key={`spoke-${i}`}
              x1={cx + Math.cos(a) * (SPINDLE_R + 1)}
              y1={cy + Math.sin(a) * (SPINDLE_R + 1)}
              x2={cx + Math.cos(a) * (HUB_R - 2)}
              y2={cy + Math.sin(a) * (HUB_R - 2)}
              stroke="#bab0a0"
              strokeWidth={1.3}
              strokeLinecap="round"
            />
          );
        })}

        {/* Spindle hole */}
        <circle
          cx={cx}
          cy={cy}
          r={SPINDLE_R}
          fill="#0e0c0a"
          stroke="#6a5a48"
          strokeWidth={0.8}
        />
        <circle
          cx={cx}
          cy={cy}
          r={SPINDLE_R - 1.8}
          fill="none"
          stroke="#4a3a28"
          strokeWidth={0.4}
        />
      </g>

      {/* Subtle neon rim on flange */}
      <circle
        cx={cx}
        cy={cy}
        r={REEL_OUTER_R + 0.5}
        fill="none"
        stroke={neonColor}
        strokeWidth={0.6}
        opacity={0.15}
      />
    </g>
  );
};

/** VU meter with arc scale, needle, and RMS zone coloring */
const VUMeter: React.FC<{
  cx: number;
  cy: number;
  level: number; // 0-1
  beatBoost: number;
  neonColor: string;
}> = ({ cx, cy, level, beatBoost, neonColor }) => {
  // Needle angle: -50deg (silence) to +50deg (full)
  // Add slight overshoot on beats
  const rawAngle = -50 + level * 100;
  const overshoot = beatBoost * 12;
  const needleAngle = Math.min(55, rawAngle + overshoot);

  const needleRad = (needleAngle * Math.PI) / 180;
  const pivotY = cy + VU_H / 2 - 3;
  const needleTipX = cx + Math.sin(needleRad) * NEEDLE_LEN;
  const needleTipY = pivotY - Math.cos(needleRad) * NEEDLE_LEN;

  // Scale markings
  const scaleMarks = 11;
  const scaleR = NEEDLE_LEN + 1;

  return (
    <g>
      {/* Meter face background */}
      <rect
        x={cx - VU_W / 2}
        y={cy - VU_H / 2}
        width={VU_W}
        height={VU_H}
        rx={VU_R}
        fill="#1a1a20"
        stroke="#5a5a68"
        strokeWidth={0.8}
      />
      {/* Meter face inner glow */}
      <rect
        x={cx - VU_W / 2 + 2}
        y={cy - VU_H / 2 + 2}
        width={VU_W - 4}
        height={VU_H - 4}
        rx={VU_R - 1}
        fill="#0f0f14"
        stroke="none"
      />

      {/* Scale arc markings */}
      {Array.from({ length: scaleMarks }).map((_, i) => {
        const t = i / (scaleMarks - 1);
        const angle = (-50 + t * 100) * (Math.PI / 180);
        const inner = scaleR - 4;
        const outer = scaleR - 1;
        const x1 = cx + Math.sin(angle) * inner;
        const y1 = pivotY - Math.cos(angle) * inner;
        const x2 = cx + Math.sin(angle) * outer;
        const y2 = pivotY - Math.cos(angle) * outer;
        // Red zone for top 30%
        const markColor = t > 0.7 ? "#cc3333" : "#8a8a98";
        return (
          <line
            key={`mark-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={markColor}
            strokeWidth={t > 0.7 ? 0.8 : 0.5}
            opacity={0.7}
          />
        );
      })}

      {/* "VU" label */}
      <text
        x={cx}
        y={cy - VU_H / 2 + 9}
        textAnchor="middle"
        fontFamily="'Courier New', monospace"
        fontSize={4.5}
        fill="#6a6a78"
        letterSpacing={1}
      >
        VU
      </text>

      {/* Needle */}
      <line
        x1={cx}
        y1={pivotY}
        x2={needleTipX}
        y2={needleTipY}
        stroke={level > 0.75 ? "#cc3333" : neonColor}
        strokeWidth={0.8}
        strokeLinecap="round"
      />
      {/* Needle pivot */}
      <circle cx={cx} cy={pivotY} r={1.5} fill="#8a8a98" />

      {/* dB markings: -20, -10, -7, -5, -3, 0, +3 */}
      {[
        { label: "-20", t: 0 },
        { label: "-7", t: 0.35 },
        { label: "-3", t: 0.55 },
        { label: "0", t: 0.7 },
        { label: "+3", t: 0.85 },
      ].map(({ label, t }) => {
        const angle = (-50 + t * 100) * (Math.PI / 180);
        const labelR = scaleR + 1;
        return (
          <text
            key={label}
            x={cx + Math.sin(angle) * labelR}
            y={pivotY - Math.cos(angle) * labelR + 1}
            textAnchor="middle"
            fontFamily="'Courier New', monospace"
            fontSize={3}
            fill={t > 0.7 ? "#cc3333" : "#6a6a78"}
          >
            {label}
          </text>
        );
      })}
    </g>
  );
};

/** Transport control button */
const TransportButton: React.FC<{
  cx: number;
  cy: number;
  symbol: React.ReactNode;
  active?: boolean;
  neonColor: string;
}> = ({ cx, cy, symbol, active, neonColor }) => (
  <g>
    <circle
      cx={cx}
      cy={cy}
      r={BTN_R}
      fill={active ? "#2a2228" : "#1a1a20"}
      stroke={active ? neonColor : "#5a5a68"}
      strokeWidth={active ? 1 : 0.6}
    />
    {active && (
      <circle
        cx={cx}
        cy={cy}
        r={BTN_R + 1}
        fill="none"
        stroke={neonColor}
        strokeWidth={0.4}
        opacity={0.4}
      />
    )}
    {symbol}
  </g>
);

/* ═══════════════════════════════════════════════════════════════════════ */
/*  Main Component                                                        */
/* ═══════════════════════════════════════════════════════════════════════ */

interface Props {
  frames: EnhancedFrameData[];
}

export const TapingSection: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const showCtx = useShowContext();
  const audio = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  // ─── Audio-reactive values ───
  const { energy, bass, mids, highs, beatDecay, chromaHue, fastEnergy } = audio;

  // ─── Tape progress ───
  const tapeProgress = Math.min(1, frame / Math.max(1, durationInFrames));
  const supplyFill = 1 - tapeProgress * 0.85;
  const takeupFill = 0.08 + tapeProgress * 0.85;

  // ─── Reel rotation (tempo-scaled) ───
  const baseSpeed = 2.2 * tempoFactor;
  const speedBoost = energy * 1.8;
  const rpm = baseSpeed + speedBoost;
  const supplyRotation = -(frame * rpm);
  const takeupRotation = frame * rpm * (1 + tapeProgress * 0.3);

  // ─── Bass-driven reel wobble ───
  const wobblePhase = frame * 0.12;
  const wobbleAmp = bass * 5;

  // ─── Neon glow from chromaHue ───
  const neonHue = chromaHue ?? 30;
  const neonColor = hueToHSL(neonHue, 85, 60);
  const neonGlow = hueToHSL(neonHue, 90, 50);
  const neonDim = hueToHSL(neonHue, 60, 30);

  // ─── VU meter levels (L=bass+mids, R=highs+energy) with beat overshoot ───
  const vuLeft = Math.min(1, (bass * 0.6 + mids * 0.4) * 1.3);
  const vuRight = Math.min(1, (highs * 0.5 + energy * 0.5) * 1.3);

  // ─── REC indicator blink (driven by beatDecay) ───
  const recPulse = beatDecay > 0.3;

  // ─── Tape counter ───
  const totalSeconds = Math.floor(frame / fps);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const counter = `${String(mins).padStart(3, "0")}:${String(secs).padStart(2, "0")}`;

  // ─── Show info ───
  const taperInfo = showCtx?.taperInfo ?? "";

  // ─── Tape path geometry ───
  const supplyTapeR = HUB_R + supplyFill * (REEL_OUTER_R - HUB_R);
  const takeupTapeR = HUB_R + takeupFill * (REEL_OUTER_R - HUB_R);
  const guideL_X = REEL_L_CX + 16;
  const guideR_X = REEL_R_CX - 16;
  const guideY = HEAD_Y - 8;

  const tapePath = [
    `M ${REEL_L_CX} ${REEL_CY + supplyTapeR}`,
    `Q ${REEL_L_CX + 8} ${guideY + 4} ${guideL_X} ${guideY}`,
    `L ${guideR_X} ${guideY}`,
    `Q ${REEL_R_CX - 8} ${guideY + 4} ${REEL_R_CX} ${REEL_CY + takeupTapeR}`,
  ].join(" ");

  // ─── Microphone cable drape (catenary-ish) ───
  const cableDroop = 240 + Math.sin(frame * 0.03) * 4;

  // ─── Opacity: subtle presence ───
  const opacity = interpolate(energy, [0.02, 0.4, 0.9], [0.18, 0.38, 0.48], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ─── Mic body subtle bass pulse ───
  const micPulse = 1 + bass * 0.06;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-end",
        padding: 20,
      }}
    >
      <div
        style={{
          opacity,
          willChange: "transform, opacity",
          filter: `drop-shadow(0 0 ${3 + beatDecay * 6}px ${neonGlow})`,
          transform: "scale(0.78)",
          transformOrigin: "bottom right",
        }}
      >
        <svg
          width={VB_W}
          height={VB_H}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Deck body gradient — brushed aluminium */}
            <linearGradient id="ts-deck-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3a3a44" />
              <stop offset="40%" stopColor="#2e2e38" />
              <stop offset="100%" stopColor="#22222c" />
            </linearGradient>

            {/* Deck faceplate — darker inset area */}
            <linearGradient id="ts-faceplate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a1a24" />
              <stop offset="100%" stopColor="#141418" />
            </linearGradient>

            {/* VU meter face */}
            <linearGradient id="ts-vu-face" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#faf5e8" />
              <stop offset="100%" stopColor="#e8e0d0" />
            </linearGradient>

            {/* Mic body metallic */}
            <linearGradient id="ts-mic-body" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#5a5a68" />
              <stop offset="30%" stopColor="#8a8a98" />
              <stop offset="50%" stopColor="#a0a0b0" />
              <stop offset="70%" stopColor="#8a8a98" />
              <stop offset="100%" stopColor="#5a5a68" />
            </linearGradient>

            {/* Neon glow filter */}
            <filter id="ts-neon" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation={1.2 + beatDecay * 1.5}
                result="blur"
              />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ═══════════════════════════════════════════════════════════ */}
          {/*  REEL-TO-REEL TAPE DECK                                    */}
          {/* ═══════════════════════════════════════════════════════════ */}

          {/* Deck body — main housing */}
          <rect
            x={DECK_X}
            y={DECK_Y}
            width={DECK_W}
            height={DECK_H}
            rx={DECK_R}
            fill="url(#ts-deck-body)"
            stroke="#5a5a68"
            strokeWidth={1}
          />
          {/* Inner bevel */}
          <rect
            x={DECK_X + 3}
            y={DECK_Y + 3}
            width={DECK_W - 6}
            height={DECK_H - 6}
            rx={DECK_R - 2}
            fill="none"
            stroke="#4a4a58"
            strokeWidth={0.4}
            opacity={0.4}
          />

          {/* Ventilation slots along top */}
          {Array.from({ length: 8 }).map((_, i) => {
            const slotX = DECK_X + 40 + i * 26;
            return (
              <rect
                key={`vent-${i}`}
                x={slotX}
                y={DECK_Y + 4}
                width={14}
                height={1.5}
                rx={0.75}
                fill="#1a1a22"
                opacity={0.4}
              />
            );
          })}

          {/* ─── Branding plate ─── */}
          <rect
            x={DECK_X + DECK_W / 2 - 40}
            y={DECK_Y + 15}
            width={80}
            height={12}
            rx={2}
            fill="#2a2a34"
            stroke="#6a6a78"
            strokeWidth={0.4}
          />
          <text
            x={DECK_X + DECK_W / 2}
            y={DECK_Y + 23.5}
            textAnchor="middle"
            fontFamily="'Courier New', monospace"
            fontWeight="bold"
            fontSize={6}
            fill="#9a9aa8"
            letterSpacing={3}
          >
            NAKAMICHI
          </text>

          {/* ─── Reel wells (recessed circles) ─── */}
          <circle
            cx={REEL_L_CX}
            cy={REEL_CY}
            r={REEL_OUTER_R + 5}
            fill="#18181e"
            stroke="#3a3a48"
            strokeWidth={0.6}
          />
          <circle
            cx={REEL_R_CX}
            cy={REEL_CY}
            r={REEL_OUTER_R + 5}
            fill="#18181e"
            stroke="#3a3a48"
            strokeWidth={0.6}
          />

          {/* ─── Tape Reels ─── */}
          <TapeReel
            cx={REEL_L_CX}
            cy={REEL_CY}
            rotation={supplyRotation}
            fillAmount={supplyFill}
            wobble={wobblePhase * wobbleAmp}
            neonColor={neonColor}
          />
          <TapeReel
            cx={REEL_R_CX}
            cy={REEL_CY}
            rotation={takeupRotation}
            fillAmount={takeupFill}
            wobble={(wobblePhase + Math.PI) * wobbleAmp}
            neonColor={neonColor}
          />

          {/* ─── Tape path (supply → guides → head → guides → take-up) ─── */}
          <path d={tapePath} stroke="#1a1410" strokeWidth={1.4} fill="none" opacity={0.8} />
          <path d={tapePath} stroke="#3a2a1a" strokeWidth={0.4} fill="none" opacity={0.35} />

          {/* Guide posts */}
          {[guideL_X, guideR_X].map((gx) => (
            <g key={gx}>
              <rect
                x={gx - 2}
                y={guideY - 4}
                width={4}
                height={8}
                rx={1}
                fill="#5a5a68"
                stroke="#7a7a88"
                strokeWidth={0.4}
              />
              <circle cx={gx} cy={guideY} r={1} fill="#8a8a98" />
            </g>
          ))}

          {/* ─── Head block ─── */}
          <rect
            x={DECK_X + DECK_W / 2 - HEAD_W / 2}
            y={HEAD_Y}
            width={HEAD_W}
            height={HEAD_H}
            rx={2}
            fill="#2a2a34"
            stroke="#5a5a68"
            strokeWidth={0.6}
          />
          {/* Head poles (erase / record / play) */}
          {[-14, 0, 14].map((dx) => (
            <circle
              key={dx}
              cx={DECK_X + DECK_W / 2 + dx}
              cy={HEAD_Y + HEAD_H / 2}
              r={2}
              fill="#8a8a98"
              stroke="#aaaa"
              strokeWidth={0.3}
            />
          ))}
          {/* Pinch roller */}
          <circle
            cx={DECK_X + DECK_W / 2 + 28}
            cy={HEAD_Y + HEAD_H / 2}
            r={4}
            fill="#1a1a1a"
            stroke="#4a4a4a"
            strokeWidth={0.5}
          />

          {/* ═══ VU Meters ═══ */}
          <VUMeter
            cx={VU_L_CX}
            cy={VU_CY}
            level={vuLeft}
            beatBoost={fastEnergy * 0.5}
            neonColor={neonColor}
          />
          <VUMeter
            cx={VU_R_CX}
            cy={VU_CY}
            level={vuRight}
            beatBoost={fastEnergy * 0.5}
            neonColor={neonColor}
          />
          {/* L / R labels */}
          <text
            x={VU_L_CX}
            y={VU_CY + VU_H / 2 + 7}
            textAnchor="middle"
            fontFamily="'Courier New', monospace"
            fontSize={4}
            fill="#6a6a78"
          >
            L
          </text>
          <text
            x={VU_R_CX}
            y={VU_CY + VU_H / 2 + 7}
            textAnchor="middle"
            fontFamily="'Courier New', monospace"
            fontSize={4}
            fill="#6a6a78"
          >
            R
          </text>

          {/* ═══ Transport Controls ═══ */}
          {(() => {
            const centerX = DECK_X + DECK_W / 2;
            const buttons = [
              // Rewind: two left triangles
              {
                dx: -2 * BTN_GAP,
                active: false,
                sym: (
                  <g>
                    <polygon
                      points={`${centerX - 2 * BTN_GAP - 2},${TRANSPORT_Y} ${centerX - 2 * BTN_GAP + 2},${TRANSPORT_Y - 2.5} ${centerX - 2 * BTN_GAP + 2},${TRANSPORT_Y + 2.5}`}
                      fill="#8a8a98"
                    />
                    <polygon
                      points={`${centerX - 2 * BTN_GAP + 1},${TRANSPORT_Y} ${centerX - 2 * BTN_GAP + 5},${TRANSPORT_Y - 2.5} ${centerX - 2 * BTN_GAP + 5},${TRANSPORT_Y + 2.5}`}
                      fill="#8a8a98"
                    />
                  </g>
                ),
              },
              // Stop: square
              {
                dx: -BTN_GAP,
                active: false,
                sym: (
                  <rect
                    x={centerX - BTN_GAP - 2.5}
                    y={TRANSPORT_Y - 2.5}
                    width={5}
                    height={5}
                    rx={0.5}
                    fill="#8a8a98"
                  />
                ),
              },
              // Play: right triangle
              {
                dx: 0,
                active: true,
                sym: (
                  <polygon
                    points={`${centerX - 2},${TRANSPORT_Y - 3} ${centerX - 2},${TRANSPORT_Y + 3} ${centerX + 3},${TRANSPORT_Y}`}
                    fill={neonColor}
                  />
                ),
              },
              // Record: filled circle (red)
              {
                dx: BTN_GAP,
                active: true,
                sym: (
                  <circle
                    cx={centerX + BTN_GAP}
                    cy={TRANSPORT_Y}
                    r={3}
                    fill="#cc3333"
                    opacity={recPulse ? 1 : 0.3}
                  />
                ),
              },
              // Fast-forward: two right triangles
              {
                dx: 2 * BTN_GAP,
                active: false,
                sym: (
                  <g>
                    <polygon
                      points={`${centerX + 2 * BTN_GAP - 5},${TRANSPORT_Y - 2.5} ${centerX + 2 * BTN_GAP - 5},${TRANSPORT_Y + 2.5} ${centerX + 2 * BTN_GAP - 1},${TRANSPORT_Y}`}
                      fill="#8a8a98"
                    />
                    <polygon
                      points={`${centerX + 2 * BTN_GAP - 2},${TRANSPORT_Y - 2.5} ${centerX + 2 * BTN_GAP - 2},${TRANSPORT_Y + 2.5} ${centerX + 2 * BTN_GAP + 2},${TRANSPORT_Y}`}
                      fill="#8a8a98"
                    />
                  </g>
                ),
              },
            ];

            return buttons.map((btn, i) => (
              <TransportButton
                key={i}
                cx={centerX + btn.dx}
                cy={TRANSPORT_Y}
                symbol={btn.sym}
                active={btn.active}
                neonColor={neonColor}
              />
            ));
          })()}

          {/* ─── Counter display ─── */}
          <rect
            x={DECK_X + 20}
            y={TRANSPORT_Y - 8}
            width={42}
            height={14}
            rx={2}
            fill="#0a0a10"
            stroke="#4a4a58"
            strokeWidth={0.5}
          />
          <text
            x={DECK_X + 41}
            y={TRANSPORT_Y + 2}
            textAnchor="middle"
            fontFamily="'Courier New', monospace"
            fontSize={7}
            fill={neonColor}
            letterSpacing={1.5}
            opacity={0.9}
          >
            {counter}
          </text>

          {/* ─── REC indicator ─── */}
          <circle
            cx={DECK_X + DECK_W - 28}
            cy={TRANSPORT_Y}
            r={3}
            fill={recPulse ? "#FF1744" : "#4a1a1a"}
            opacity={recPulse ? 0.9 + beatDecay * 0.1 : 0.3}
          />
          {recPulse && (
            <circle
              cx={DECK_X + DECK_W - 28}
              cy={TRANSPORT_Y}
              r={5}
              fill="none"
              stroke="#FF1744"
              strokeWidth={0.5}
              opacity={0.3 + beatDecay * 0.4}
            />
          )}
          <text
            x={DECK_X + DECK_W - 18}
            y={TRANSPORT_Y + 2.5}
            fontFamily="'Courier New', monospace"
            fontWeight="bold"
            fontSize={5}
            fill={recPulse ? "#FF1744" : "#6a3a3a"}
            opacity={recPulse ? 0.9 : 0.4}
          >
            REC
          </text>

          {/* ─── Neon glow outline on deck ─── */}
          <rect
            x={DECK_X}
            y={DECK_Y}
            width={DECK_W}
            height={DECK_H}
            rx={DECK_R}
            fill="none"
            stroke={neonColor}
            strokeWidth={1}
            opacity={0.2 + beatDecay * 0.3}
            filter="url(#ts-neon)"
          />

          {/* ─── Taper credit on deck ─── */}
          {taperInfo && (
            <text
              x={DECK_X + DECK_W / 2}
              y={DECK_Y + DECK_H - 5}
              textAnchor="middle"
              fontFamily="'Courier New', monospace"
              fontSize={4}
              fill="#5a5a68"
              letterSpacing={0.3}
              opacity={0.6}
            >
              {taperInfo.length > 40
                ? taperInfo.slice(0, 37) + "..."
                : taperInfo}
            </text>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/*  HEADPHONES (draped over deck top-right corner)             */}
          {/* ═══════════════════════════════════════════════════════════ */}
          <g opacity={0.55}>
            {/* Headband arc */}
            <path
              d={`M ${DECK_X + DECK_W - 30} ${DECK_Y - 2} Q ${DECK_X + DECK_W - 10} ${DECK_Y - 18} ${DECK_X + DECK_W + 10} ${DECK_Y + 5}`}
              stroke="#4a4a58"
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
            />
            {/* Headband padding */}
            <path
              d={`M ${DECK_X + DECK_W - 22} ${DECK_Y - 8} Q ${DECK_X + DECK_W - 10} ${DECK_Y - 16} ${DECK_X + DECK_W + 2} ${DECK_Y - 2}`}
              stroke="#5a5a68"
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              opacity={0.5}
            />
            {/* Left ear cup */}
            <ellipse
              cx={DECK_X + DECK_W - 30}
              cy={DECK_Y + 4}
              rx={7}
              ry={9}
              fill="#2a2a34"
              stroke="#5a5a68"
              strokeWidth={0.8}
            />
            <ellipse
              cx={DECK_X + DECK_W - 30}
              cy={DECK_Y + 4}
              rx={4}
              ry={6}
              fill="#1a1a22"
              stroke="#3a3a48"
              strokeWidth={0.4}
            />
            {/* Right ear cup */}
            <ellipse
              cx={DECK_X + DECK_W + 10}
              cy={DECK_Y + 12}
              rx={7}
              ry={9}
              fill="#2a2a34"
              stroke="#5a5a68"
              strokeWidth={0.8}
            />
            <ellipse
              cx={DECK_X + DECK_W + 10}
              cy={DECK_Y + 12}
              rx={4}
              ry={6}
              fill="#1a1a22"
              stroke="#3a3a48"
              strokeWidth={0.4}
            />
          </g>

          {/* ═══════════════════════════════════════════════════════════ */}
          {/*  CONDENSER MICROPHONE ON STAND                              */}
          {/* ═══════════════════════════════════════════════════════════ */}

          {/* ─── Tripod base ─── */}
          {/* Center post base */}
          <circle
            cx={MIC_X}
            cy={MIC_STAND_BOTTOM + 5}
            r={3}
            fill="#3a3a44"
            stroke="#5a5a68"
            strokeWidth={0.5}
          />
          {/* Three legs spread out */}
          {[-1, 0, 1].map((dir) => {
            const legEndX = MIC_X + dir * 28;
            const legEndY = MIC_STAND_BOTTOM + 18;
            return (
              <g key={`leg-${dir}`}>
                <line
                  x1={MIC_X}
                  y1={MIC_STAND_BOTTOM + 5}
                  x2={legEndX}
                  y2={legEndY}
                  stroke="#5a5a68"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
                {/* Rubber foot */}
                <circle
                  cx={legEndX}
                  cy={legEndY}
                  r={2}
                  fill="#2a2a34"
                  stroke="#4a4a58"
                  strokeWidth={0.4}
                />
              </g>
            );
          })}

          {/* ─── Stand pole ─── */}
          <line
            x1={MIC_X}
            y1={MIC_STAND_TOP + MIC_BODY_H + 30}
            x2={MIC_X}
            y2={MIC_STAND_BOTTOM + 5}
            stroke="#6a6a78"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {/* Height adjustment collar */}
          <rect
            x={MIC_X - 3}
            y={MIC_STAND_BOTTOM - 60}
            width={6}
            height={10}
            rx={1}
            fill="#4a4a58"
            stroke="#7a7a88"
            strokeWidth={0.4}
          />
          {/* Collar thumb screw */}
          <circle
            cx={MIC_X + 4}
            cy={MIC_STAND_BOTTOM - 55}
            r={2}
            fill="#5a5a68"
            stroke="#8a8a98"
            strokeWidth={0.3}
          />

          {/* ─── Shock mount ─── */}
          <g transform={`translate(${MIC_X}, ${MIC_STAND_TOP + MIC_BODY_H + 18})`}>
            {/* Mount bracket connecting stand to cradle */}
            <rect
              x={-2}
              y={0}
              width={4}
              height={12}
              rx={1}
              fill="#5a5a68"
              stroke="#7a7a88"
              strokeWidth={0.4}
            />
            {/* Outer cradle ring */}
            <ellipse
              cx={0}
              cy={-4}
              rx={MIC_BODY_R + 5}
              ry={MIC_BODY_R + 3}
              fill="none"
              stroke="#5a5a68"
              strokeWidth={1.2}
            />
            {/* Elastic bands (4 crossing) */}
            {[0, 1, 2, 3].map((i) => {
              const angle = (i / 4) * Math.PI * 2 + 0.4;
              const outerR = MIC_BODY_R + 4;
              const innerR = MIC_BODY_R - 1;
              return (
                <line
                  key={`elastic-${i}`}
                  x1={Math.cos(angle) * outerR}
                  y1={-4 + Math.sin(angle) * (outerR - 2)}
                  x2={Math.cos(angle + Math.PI) * innerR}
                  y2={-4 + Math.sin(angle + Math.PI) * (innerR - 2)}
                  stroke="#8a7a68"
                  strokeWidth={0.5}
                  opacity={0.6}
                />
              );
            })}
          </g>

          {/* ─── Microphone body (condenser cylinder) ─── */}
          <g
            transform={`translate(${MIC_X}, ${MIC_STAND_TOP + MIC_BODY_H / 2}) scale(${micPulse})`}
            style={{ transformOrigin: `${MIC_X}px ${MIC_STAND_TOP + MIC_BODY_H / 2}px` }}
          >
            {/* Main body cylinder */}
            <rect
              x={-MIC_BODY_R}
              y={-MIC_BODY_H / 2 + 8}
              width={MIC_BODY_R * 2}
              height={MIC_BODY_H - 8}
              rx={MIC_BODY_R}
              fill="url(#ts-mic-body)"
              stroke="#8a8a98"
              strokeWidth={0.6}
            />

            {/* Grille head (top capsule area) */}
            <rect
              x={-MIC_BODY_R}
              y={-MIC_BODY_H / 2}
              width={MIC_BODY_R * 2}
              height={16}
              rx={MIC_BODY_R}
              fill="#4a4a58"
              stroke="#7a7a88"
              strokeWidth={0.6}
            />

            {/* Grille mesh lines */}
            {Array.from({ length: GRILLE_LINES }).map((_, i) => {
              const gy =
                -MIC_BODY_H / 2 + 2 + (i / (GRILLE_LINES - 1)) * 12;
              const halfW =
                MIC_BODY_R *
                Math.sin(
                  Math.acos(
                    Math.abs(gy - (-MIC_BODY_H / 2 + 8)) / MIC_BODY_R
                  ) || Math.PI / 2
                );
              const clampedW = Math.min(halfW, MIC_BODY_R - 1.5);
              return (
                <line
                  key={`grille-${i}`}
                  x1={-clampedW}
                  y1={gy}
                  x2={clampedW}
                  y2={gy}
                  stroke="#6a6a78"
                  strokeWidth={0.4}
                  opacity={0.5}
                />
              );
            })}

            {/* Body ring detail (where grille meets body) */}
            <line
              x1={-MIC_BODY_R + 1}
              y1={-MIC_BODY_H / 2 + 14}
              x2={MIC_BODY_R - 1}
              y2={-MIC_BODY_H / 2 + 14}
              stroke="#9a9aa8"
              strokeWidth={0.6}
              opacity={0.6}
            />

            {/* Polar pattern switch (small dot) */}
            <circle
              cx={MIC_BODY_R - 2}
              cy={4}
              r={1.2}
              fill="#3a3a44"
              stroke="#6a6a78"
              strokeWidth={0.3}
            />

            {/* Neon glow on mic capsule — audio reactive */}
            <rect
              x={-MIC_BODY_R - 0.5}
              y={-MIC_BODY_H / 2 - 0.5}
              width={MIC_BODY_R * 2 + 1}
              height={17}
              rx={MIC_BODY_R + 0.5}
              fill="none"
              stroke={neonColor}
              strokeWidth={0.8}
              opacity={0.15 + energy * 0.25}
              filter="url(#ts-neon)"
            />
          </g>

          {/* ─── XLR cable draping down ─── */}
          <path
            d={`M ${MIC_X} ${MIC_STAND_TOP + MIC_BODY_H + 22} Q ${MIC_X - 18} ${cableDroop} ${MIC_X - 8} ${MIC_STAND_BOTTOM + 10}`}
            stroke="#2a2a34"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            opacity={0.5}
          />
          {/* Cable sheen */}
          <path
            d={`M ${MIC_X} ${MIC_STAND_TOP + MIC_BODY_H + 22} Q ${MIC_X - 18} ${cableDroop} ${MIC_X - 8} ${MIC_STAND_BOTTOM + 10}`}
            stroke="#4a4a58"
            strokeWidth={0.6}
            fill="none"
            strokeLinecap="round"
            opacity={0.3}
          />
          {/* XLR connector at bottom */}
          <circle
            cx={MIC_X - 8}
            cy={MIC_STAND_BOTTOM + 12}
            r={3}
            fill="#3a3a44"
            stroke="#5a5a68"
            strokeWidth={0.5}
          />
          {/* XLR pin holes */}
          {[0, 1, 2].map((i) => {
            const a = ((i / 3) * Math.PI * 2) - Math.PI / 2;
            return (
              <circle
                key={`xlr-${i}`}
                cx={MIC_X - 8 + Math.cos(a) * 1.5}
                cy={MIC_STAND_BOTTOM + 12 + Math.sin(a) * 1.5}
                r={0.5}
                fill="#1a1a22"
              />
            );
          })}

          {/* ─── Mic stand neon accent ─── */}
          <line
            x1={MIC_X}
            y1={MIC_STAND_TOP + MIC_BODY_H + 30}
            x2={MIC_X}
            y2={MIC_STAND_BOTTOM + 5}
            stroke={neonColor}
            strokeWidth={0.6}
            opacity={0.1 + beatDecay * 0.15}
            filter="url(#ts-neon)"
          />
        </svg>
      </div>
    </div>
  );
};
