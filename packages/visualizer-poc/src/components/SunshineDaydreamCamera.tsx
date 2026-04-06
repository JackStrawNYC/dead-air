/**
 * SunshineDaydreamCamera — A+++ vintage 16mm film camera overlay.
 *
 * Homage to the Sunshine Daydream documentary (Veneta 8/27/72), filmed by
 * Penelope Spheeris and Sam Field on 16mm. This overlay evokes the act of
 * being filmed: a detailed Bolex-style 16mm camera with rolling reels,
 * a sprocketed film-frame border around the viewport, REC indicator,
 * timecode counter, and warm Kodachrome light leaks.
 *
 * Audio-reactive: reels spin to tempo+energy, REC pulses on beat,
 * bass drives camera body shake, chromaHue tints the warm Kodachrome glow.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ─── Camera body geometry (SVG units) ─── */

const CAM_W = 360;
const CAM_H = 240;
const BODY_R = 14;

// Reels
const REEL_CX_SUPPLY = 110;
const REEL_CX_TAKEUP = 250;
const REEL_CY = 92;
const REEL_OUTER_R = 46;
const REEL_HUB_R = 10;
const REEL_SPINDLE_R = 3.5;
const REEL_SPOKES = 8;

// Lens
const LENS_CX = 180;
const LENS_CY = 178;
const LENS_OUTER_R = 38;
const LENS_INNER_R = 22;
const LENS_HOOD_W = 86;
const LENS_HOOD_H = 30;

/* ─── Sub-components ─── */

/** Detailed 16mm reel with 8 spokes, hub teeth, wound tape, and edge highlight */
const FilmReel: React.FC<{
  cx: number;
  cy: number;
  rotation: number;
  fillAmount: number;
  shake: number;
}> = ({ cx, cy, rotation, fillAmount, shake }) => {
  const tapeR = REEL_HUB_R + 2 + fillAmount * (REEL_OUTER_R - REEL_HUB_R - 4);
  const sx = Math.sin(shake * 0.7) * 0.4;
  const sy = Math.cos(shake) * 0.3;

  return (
    <g transform={`translate(${sx} ${sy})`}>
      {/* Reel housing well — circular recess in camera body */}
      <circle
        cx={cx}
        cy={cy}
        r={REEL_OUTER_R + 4}
        fill="#0a0806"
        stroke="#3a2a1a"
        strokeWidth={1}
      />
      <circle
        cx={cx}
        cy={cy}
        r={REEL_OUTER_R + 2}
        fill="none"
        stroke="#5a4028"
        strokeWidth={0.5}
        opacity={0.6}
      />

      {/* Outer reel rim (the metal flange) */}
      <circle
        cx={cx}
        cy={cy}
        r={REEL_OUTER_R}
        fill="none"
        stroke="#8a7058"
        strokeWidth={2}
      />
      <circle
        cx={cx}
        cy={cy}
        r={REEL_OUTER_R - 1.5}
        fill="none"
        stroke="#c0a078"
        strokeWidth={0.5}
        opacity={0.5}
      />

      {/* Wound 16mm tape (dark with concentric sheen rings) */}
      {tapeR > REEL_HUB_R + 3 && (
        <>
          <circle cx={cx} cy={cy} r={tapeR} fill="#1a120a" />
          {[0.25, 0.45, 0.62, 0.78, 0.9].map((t) => {
            const r = REEL_HUB_R + 2 + t * (tapeR - REEL_HUB_R - 2);
            return (
              <circle
                key={t}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="#3a2418"
                strokeWidth={0.4}
                opacity={0.55 + t * 0.25}
              />
            );
          })}
          {/* Outer tape edge highlight — catches light */}
          <circle
            cx={cx}
            cy={cy}
            r={tapeR - 0.6}
            fill="none"
            stroke="#5a3c20"
            strokeWidth={0.5}
            opacity={0.7}
          />
        </>
      )}

      {/* Rotating hub + spokes group */}
      <g transform={`rotate(${rotation} ${cx} ${cy})`}>
        {/* Hub disk */}
        <circle
          cx={cx}
          cy={cy}
          r={REEL_HUB_R}
          fill="#2a2018"
          stroke="#a08868"
          strokeWidth={1}
        />

        {/* Hub grip teeth */}
        {Array.from({ length: 16 }).map((_, i) => {
          const a = (i / 16) * Math.PI * 2;
          const r1 = REEL_HUB_R - 1.5;
          const r2 = REEL_HUB_R;
          return (
            <line
              key={`tooth-${i}`}
              x1={cx + Math.cos(a) * r1}
              y1={cy + Math.sin(a) * r1}
              x2={cx + Math.cos(a) * r2}
              y2={cy + Math.sin(a) * r2}
              stroke="#b09878"
              strokeWidth={0.5}
              opacity={0.5}
            />
          );
        })}

        {/* 8 spokes radiating from hub to outer rim */}
        {Array.from({ length: REEL_SPOKES }).map((_, i) => {
          const a = (i / REEL_SPOKES) * Math.PI * 2;
          const r1 = REEL_HUB_R + 0.5;
          const r2 = REEL_OUTER_R - 1;
          return (
            <line
              key={`spoke-${i}`}
              x1={cx + Math.cos(a) * r1}
              y1={cy + Math.sin(a) * r1}
              x2={cx + Math.cos(a) * r2}
              y2={cy + Math.sin(a) * r2}
              stroke="#b89870"
              strokeWidth={1.4}
              strokeLinecap="round"
              opacity={0.85}
            />
          );
        })}

        {/* Spoke shadows (offset slightly) */}
        {Array.from({ length: REEL_SPOKES }).map((_, i) => {
          const a = (i / REEL_SPOKES) * Math.PI * 2;
          const r1 = REEL_HUB_R + 0.5;
          const r2 = REEL_OUTER_R - 1;
          return (
            <line
              key={`spoke-shadow-${i}`}
              x1={cx + Math.cos(a) * r1 + 0.4}
              y1={cy + Math.sin(a) * r1 + 0.4}
              x2={cx + Math.cos(a) * r2 + 0.4}
              y2={cy + Math.sin(a) * r2 + 0.4}
              stroke="#1a1208"
              strokeWidth={0.6}
              opacity={0.5}
            />
          );
        })}

        {/* Central spindle hole */}
        <circle
          cx={cx}
          cy={cy}
          r={REEL_SPINDLE_R}
          fill="#070503"
          stroke="#7a6248"
          strokeWidth={0.6}
        />
        <circle
          cx={cx}
          cy={cy}
          r={REEL_SPINDLE_R - 1.2}
          fill="none"
          stroke="#3a2818"
          strokeWidth={0.3}
        />
      </g>
    </g>
  );
};

/** Lens barrel with focus rings, aperture marks, and reflective glass */
const LensBarrel: React.FC<{ recPulse: number }> = ({ recPulse }) => (
  <g>
    {/* Lens hood (rectangular shade) */}
    <rect
      x={LENS_CX - LENS_HOOD_W / 2}
      y={LENS_CY - LENS_HOOD_H / 2 - 6}
      width={LENS_HOOD_W}
      height={LENS_HOOD_H}
      rx={4}
      fill="#1a1410"
      stroke="#4a3828"
      strokeWidth={1}
    />
    <rect
      x={LENS_CX - LENS_HOOD_W / 2 + 3}
      y={LENS_CY - LENS_HOOD_H / 2 - 4}
      width={LENS_HOOD_W - 6}
      height={LENS_HOOD_H - 6}
      rx={2}
      fill="none"
      stroke="#2a1e14"
      strokeWidth={0.6}
    />

    {/* Outer barrel ring (metal) */}
    <circle
      cx={LENS_CX}
      cy={LENS_CY}
      r={LENS_OUTER_R}
      fill="#2a2218"
      stroke="#a08868"
      strokeWidth={1.4}
    />
    {/* Focus ring (knurled) */}
    <circle
      cx={LENS_CX}
      cy={LENS_CY}
      r={LENS_OUTER_R - 4}
      fill="none"
      stroke="#8a7258"
      strokeWidth={2}
    />
    {/* Knurl marks around focus ring */}
    {Array.from({ length: 36 }).map((_, i) => {
      const a = (i / 36) * Math.PI * 2;
      const r1 = LENS_OUTER_R - 5;
      const r2 = LENS_OUTER_R - 3;
      return (
        <line
          key={`knurl-${i}`}
          x1={LENS_CX + Math.cos(a) * r1}
          y1={LENS_CY + Math.sin(a) * r1}
          x2={LENS_CX + Math.cos(a) * r2}
          y2={LENS_CY + Math.sin(a) * r2}
          stroke="#5a4028"
          strokeWidth={0.5}
          opacity={0.7}
        />
      );
    })}

    {/* Aperture markings (f-stop numbers around outer ring) */}
    {["1.4", "2", "2.8", "4", "5.6", "8", "11", "16"].map((f, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = LENS_OUTER_R + 5;
      return (
        <text
          key={`fstop-${i}`}
          x={LENS_CX + Math.cos(a) * r}
          y={LENS_CY + Math.sin(a) * r + 1.5}
          textAnchor="middle"
          fontFamily="'Courier New', monospace"
          fontSize={4}
          fill="#c0a878"
          opacity={0.8}
        >
          {f}
        </text>
      );
    })}

    {/* Inner glass element */}
    <circle
      cx={LENS_CX}
      cy={LENS_CY}
      r={LENS_INNER_R}
      fill="#0a0a14"
      stroke="#1a1a28"
      strokeWidth={1}
    />
    {/* Lens glass tint (anti-reflective coating shimmer) */}
    <circle
      cx={LENS_CX}
      cy={LENS_CY}
      r={LENS_INNER_R - 1}
      fill="#08101c"
      opacity={0.9}
    />
    {/* Specular highlight */}
    <ellipse
      cx={LENS_CX - 6}
      cy={LENS_CY - 8}
      rx={6}
      ry={3}
      fill="#ffffff"
      opacity={0.18 + recPulse * 0.12}
    />
    <ellipse
      cx={LENS_CX + 8}
      cy={LENS_CY + 6}
      rx={2}
      ry={1.2}
      fill="#ffffff"
      opacity={0.12}
    />
    {/* Inner aperture iris */}
    <circle
      cx={LENS_CX}
      cy={LENS_CY}
      r={6}
      fill="none"
      stroke="#2a2a3a"
      strokeWidth={0.6}
    />
    <circle cx={LENS_CX} cy={LENS_CY} r={2.5} fill="#020205" />
  </g>
);

/* ─── Main Component ─── */

interface Props {
  frames: EnhancedFrameData[];
}

export const SunshineDaydreamCamera: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { fps, width: vw, height: vh, durationInFrames } = useVideoConfig();
  const audio = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  // ─── Audio-reactive values ───
  const energy = audio.energy ?? 0;
  const bass = audio.bass ?? 0;
  const beatDecay = audio.beatDecay ?? 0;
  const chromaHue = audio.chromaHue ?? 30;

  // ─── Reel rotation (supply CCW, take-up CW) ───
  const baseSpeed = 2.4 * tempoFactor;
  const speedBoost = energy * 1.8;
  const rpm = baseSpeed + speedBoost;
  const supplyRotation = -(frame * rpm);
  const takeupRotation = frame * rpm;

  // ─── Tape transfer over song duration ───
  const tapeProgress = Math.min(1, frame / Math.max(1, durationInFrames));
  const supplyFill = 1 - tapeProgress * 0.78;
  const takeupFill = 0.12 + tapeProgress * 0.78;

  // ─── Bass camera shake ───
  const shakePhase = frame * 0.18;
  const shakeAmp = bass * 4.5;
  const shakeX = Math.sin(shakePhase) * shakeAmp * 0.8;
  const shakeY = Math.cos(shakePhase * 1.3) * shakeAmp * 0.6;

  // ─── Warm Kodachrome tint (chromaHue-modulated, anchored warm) ───
  // Push toward warm amber (~30) regardless of chroma — only allow ±25 swing
  const warmHue = 30 + Math.sin((chromaHue / 360) * Math.PI * 2) * 25;
  const warmTint = `hsla(${warmHue}, 85%, 62%, 0.18)`;
  const lightLeakColor = `hsla(${warmHue + 15}, 95%, 65%, 0.55)`;
  const lightLeakColor2 = `hsla(${warmHue - 10}, 90%, 70%, 0.45)`;

  // ─── REC blink (twice per second) ───
  const recOn = Math.floor(frame / (fps * 0.5)) % 2 === 0;
  const recPulse = recOn ? 0.6 + beatDecay * 0.4 : 0.05;

  // ─── Timecode HH:MM:SS:FF ───
  const totalFrames = frame;
  const ff = totalFrames % Math.round(fps);
  const totalSecs = Math.floor(totalFrames / fps);
  const ss = totalSecs % 60;
  const mm = Math.floor(totalSecs / 60) % 60;
  const hh = Math.floor(totalSecs / 3600);
  const timecode =
    `${String(hh).padStart(2, "0")}:` +
    `${String(mm).padStart(2, "0")}:` +
    `${String(ss).padStart(2, "0")}:` +
    `${String(ff).padStart(2, "0")}`;

  // ─── Sprocket hole layout for film-frame border ───
  // Holes spaced along top + bottom edges
  const sprocketCount = 28;
  const sprocketW = 22;
  const sprocketH = 14;
  const sprocketStripH = 36;

  // ─── Light leak drift across screen (slow horizontal motion) ───
  const leakOffset = ((frame * 0.4) % (vw + 400)) - 200;
  const leakOffset2 = ((frame * 0.25 + 300) % (vw + 400)) - 200;

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* FILM FRAME BORDER — sprocket holes + warm Kodachrome tint    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        {/* Warm Kodachrome wash over entire viewport */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at center, transparent 55%, ${warmTint} 100%)`,
            mixBlendMode: "screen",
            opacity: 0.55 + beatDecay * 0.15,
          }}
        />

        {/* Top sprocket strip */}
        <svg
          width={vw}
          height={sprocketStripH}
          viewBox={`0 0 ${vw} ${sprocketStripH}`}
          style={{ position: "absolute", top: 0, left: 0, opacity: 0.78 }}
        >
          <rect x={0} y={0} width={vw} height={sprocketStripH} fill="#0a0604" />
          <rect
            x={0}
            y={sprocketStripH - 1}
            width={vw}
            height={1}
            fill="#3a2418"
          />
          {Array.from({ length: sprocketCount }).map((_, i) => {
            const x = (i + 0.5) * (vw / sprocketCount) - sprocketW / 2;
            return (
              <rect
                key={`top-spr-${i}`}
                x={x}
                y={(sprocketStripH - sprocketH) / 2}
                width={sprocketW}
                height={sprocketH}
                rx={2}
                fill="#080604"
                stroke="#2a1c10"
                strokeWidth={0.6}
              />
            );
          })}
          {/* Edge code along top */}
          <text
            x={vw / 2}
            y={sprocketStripH - 4}
            textAnchor="middle"
            fontFamily="'Courier New', monospace"
            fontSize={6}
            fill="#8a6840"
            letterSpacing={2}
            opacity={0.85}
          >
            KODAK 7222 DOUBLE-X • SUNSHINE DAYDREAM • VENETA 8/27/72
          </text>
        </svg>

        {/* Bottom sprocket strip */}
        <svg
          width={vw}
          height={sprocketStripH}
          viewBox={`0 0 ${vw} ${sprocketStripH}`}
          style={{ position: "absolute", bottom: 0, left: 0, opacity: 0.78 }}
        >
          <rect x={0} y={0} width={vw} height={sprocketStripH} fill="#0a0604" />
          <rect x={0} y={0} width={vw} height={1} fill="#3a2418" />
          {Array.from({ length: sprocketCount }).map((_, i) => {
            const x = (i + 0.5) * (vw / sprocketCount) - sprocketW / 2;
            return (
              <rect
                key={`bot-spr-${i}`}
                x={x}
                y={(sprocketStripH - sprocketH) / 2}
                width={sprocketW}
                height={sprocketH}
                rx={2}
                fill="#080604"
                stroke="#2a1c10"
                strokeWidth={0.6}
              />
            );
          })}
          {/* Edge frame number */}
          <text
            x={20}
            y={10}
            fontFamily="'Courier New', monospace"
            fontSize={6}
            fill="#8a6840"
            letterSpacing={1.5}
            opacity={0.85}
          >
            {`FRAME ${String(frame).padStart(6, "0")}  •  16MM  •  24FPS XFER`}
          </text>
        </svg>

        {/* Light leak streak 1 — diagonal warm streak */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: leakOffset,
            width: 280,
            height: vh,
            background: `linear-gradient(115deg, transparent 38%, ${lightLeakColor} 50%, transparent 62%)`,
            mixBlendMode: "screen",
            opacity: 0.55 + beatDecay * 0.25,
            filter: "blur(8px)",
          }}
        />
        {/* Light leak streak 2 — softer secondary */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: leakOffset2,
            width: 200,
            height: vh,
            background: `linear-gradient(95deg, transparent 40%, ${lightLeakColor2} 50%, transparent 60%)`,
            mixBlendMode: "screen",
            opacity: 0.35 + bass * 0.2,
            filter: "blur(12px)",
          }}
        />

        {/* Vignette darkening at corners (suggests projection) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.45) 100%)",
            mixBlendMode: "multiply",
          }}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* CAMERA BODY — top-right corner, with shake                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "absolute",
          top: 60,
          right: 28,
          pointerEvents: "none",
          zIndex: 2,
          transform: `translate(${shakeX}px, ${shakeY}px) scale(0.78)`,
          transformOrigin: "top right",
          opacity: interpolate(energy, [0, 0.3, 0.8], [0.55, 0.7, 0.82], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          filter: `drop-shadow(0 6px 14px rgba(0,0,0,0.7))`,
        }}
      >
        <svg
          width={CAM_W}
          height={CAM_H}
          viewBox={`0 0 ${CAM_W} ${CAM_H}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Camera body gradient — black/grey metal */}
            <linearGradient id="cam-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3a3028" />
              <stop offset="50%" stopColor="#2a2018" />
              <stop offset="100%" stopColor="#1a140e" />
            </linearGradient>

            {/* Body bevel highlight */}
            <linearGradient id="cam-highlight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7a6850" stopOpacity="0.6" />
              <stop offset="40%" stopColor="#7a6850" stopOpacity="0" />
            </linearGradient>

            {/* Brand badge gradient */}
            <linearGradient id="cam-badge" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d8c89c" />
              <stop offset="100%" stopColor="#a08868" />
            </linearGradient>
          </defs>

          {/* ═══ Camera body ═══ */}
          <rect
            x={4}
            y={4}
            width={CAM_W - 8}
            height={CAM_H - 8}
            rx={BODY_R}
            ry={BODY_R}
            fill="url(#cam-body)"
            stroke="#5a4830"
            strokeWidth={1.4}
          />
          {/* Inner bevel */}
          <rect
            x={8}
            y={8}
            width={CAM_W - 16}
            height={CAM_H - 16}
            rx={BODY_R - 2}
            ry={BODY_R - 2}
            fill="url(#cam-highlight)"
            opacity={0.4}
          />
          {/* Edge stitching detail (rivets along top) */}
          {Array.from({ length: 9 }).map((_, i) => (
            <circle
              key={`rivet-${i}`}
              cx={20 + i * 40}
              cy={14}
              r={1.2}
              fill="#6a5840"
              stroke="#1a1208"
              strokeWidth={0.3}
            />
          ))}

          {/* ═══ Brand badge "BOLEX" ═══ */}
          <rect
            x={CAM_W / 2 - 32}
            y={20}
            width={64}
            height={14}
            rx={2}
            fill="url(#cam-badge)"
            stroke="#5a4828"
            strokeWidth={0.6}
          />
          <text
            x={CAM_W / 2}
            y={30}
            textAnchor="middle"
            fontFamily="'Times New Roman', serif"
            fontWeight="bold"
            fontSize={9}
            fill="#1a1208"
            letterSpacing={2}
          >
            BOLEX
          </text>
          <text
            x={CAM_W / 2}
            y={42}
            textAnchor="middle"
            fontFamily="'Courier New', monospace"
            fontSize={5}
            fill="#a08868"
            letterSpacing={1}
          >
            H16 REFLEX • 16mm
          </text>

          {/* ═══ Two reels (supply left, take-up right) ═══ */}
          <FilmReel
            cx={REEL_CX_SUPPLY}
            cy={REEL_CY}
            rotation={supplyRotation}
            fillAmount={supplyFill}
            shake={shakePhase}
          />
          <FilmReel
            cx={REEL_CX_TAKEUP}
            cy={REEL_CY}
            rotation={takeupRotation}
            fillAmount={takeupFill}
            shake={shakePhase + Math.PI}
          />

          {/* Tape strand connecting the two reel tops (feed path) */}
          <path
            d={`M ${REEL_CX_SUPPLY} ${REEL_CY - REEL_OUTER_R - 1}
                Q ${(REEL_CX_SUPPLY + REEL_CX_TAKEUP) / 2} ${REEL_CY - REEL_OUTER_R - 14}
                ${REEL_CX_TAKEUP} ${REEL_CY - REEL_OUTER_R - 1}`}
            fill="none"
            stroke="#1a1208"
            strokeWidth={1.2}
            opacity={0.7}
          />

          {/* ═══ Lens barrel ═══ */}
          <LensBarrel recPulse={recPulse} />

          {/* ═══ Viewfinder eyepiece (top-right of body) ═══ */}
          <rect
            x={CAM_W - 70}
            y={48}
            width={50}
            height={22}
            rx={4}
            fill="#1a1208"
            stroke="#5a4830"
            strokeWidth={1}
          />
          <circle
            cx={CAM_W - 28}
            cy={59}
            r={7}
            fill="#080604"
            stroke="#7a6248"
            strokeWidth={1}
          />
          <circle cx={CAM_W - 28} cy={59} r={4} fill="#0a1018" />
          <circle
            cx={CAM_W - 30}
            cy={57}
            r={1.2}
            fill="#ffffff"
            opacity={0.4}
          />
          <text
            x={CAM_W - 60}
            y={62}
            fontFamily="'Courier New', monospace"
            fontSize={5}
            fill="#8a7258"
          >
            REFLEX
          </text>

          {/* ═══ Recording trigger handle (bottom-right) ═══ */}
          <rect
            x={CAM_W - 48}
            y={CAM_H - 60}
            width={28}
            height={42}
            rx={3}
            fill="#1a1208"
            stroke="#4a3828"
            strokeWidth={1}
          />
          <rect
            x={CAM_W - 44}
            y={CAM_H - 56}
            width={20}
            height={6}
            rx={1}
            fill="#7a1a0a"
            stroke="#3a0804"
            strokeWidth={0.5}
          />
          <text
            x={CAM_W - 34}
            y={CAM_H - 51}
            textAnchor="middle"
            fontFamily="'Courier New', monospace"
            fontWeight="bold"
            fontSize={4}
            fill="#f0e0c0"
          >
            REC
          </text>
          {/* Trigger ridges */}
          {[0, 1, 2, 3].map((i) => (
            <line
              key={`trigger-ridge-${i}`}
              x1={CAM_W - 44}
              y1={CAM_H - 42 + i * 5}
              x2={CAM_W - 24}
              y2={CAM_H - 42 + i * 5}
              stroke="#3a2818"
              strokeWidth={0.6}
            />
          ))}

          {/* ═══ Knobs and dials (left side — speed selector + footage counter) ═══ */}
          {/* Speed dial */}
          <circle
            cx={32}
            cy={CAM_H - 50}
            r={14}
            fill="#1a1208"
            stroke="#7a6248"
            strokeWidth={1.2}
          />
          {/* Speed dial tick marks */}
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
            const r1 = 10;
            const r2 = 13;
            return (
              <line
                key={`speed-tick-${i}`}
                x1={32 + Math.cos(a) * r1}
                y1={CAM_H - 50 + Math.sin(a) * r1}
                x2={32 + Math.cos(a) * r2}
                y2={CAM_H - 50 + Math.sin(a) * r2}
                stroke="#a08868"
                strokeWidth={0.6}
              />
            );
          })}
          {/* Speed dial pointer */}
          <line
            x1={32}
            y1={CAM_H - 50}
            x2={32 + Math.cos(rpm * 0.05) * 8}
            y2={CAM_H - 50 + Math.sin(rpm * 0.05) * 8}
            stroke="#f0c060"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <circle cx={32} cy={CAM_H - 50} r={2} fill="#5a4828" />
          <text
            x={32}
            y={CAM_H - 28}
            textAnchor="middle"
            fontFamily="'Courier New', monospace"
            fontSize={5}
            fill="#a08868"
          >
            FPS
          </text>

          {/* Footage counter dial */}
          <rect
            x={56}
            y={CAM_H - 60}
            width={32}
            height={22}
            rx={2}
            fill="#080604"
            stroke="#5a4828"
            strokeWidth={0.8}
          />
          <text
            x={72}
            y={CAM_H - 46}
            textAnchor="middle"
            fontFamily="'Courier New', monospace"
            fontWeight="bold"
            fontSize={9}
            fill="#f0c060"
            letterSpacing={1}
          >
            {String(Math.floor(frame * 0.4) % 1000).padStart(3, "0")}
          </text>
          <text
            x={72}
            y={CAM_H - 30}
            textAnchor="middle"
            fontFamily="'Courier New', monospace"
            fontSize={4}
            fill="#7a6248"
          >
            FT COUNT
          </text>
        </svg>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* REC INDICATOR + TIMECODE — bottom-left of viewport            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "absolute",
          bottom: 56,
          left: 32,
          pointerEvents: "none",
          zIndex: 3,
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: "'Courier New', Courier, monospace",
        }}
      >
        {/* Blinking REC dot */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "5px 10px",
            background: "rgba(0,0,0,0.55)",
            borderRadius: 3,
            border: `0.5px solid rgba(240, 192, 96, 0.4)`,
          }}
        >
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: "50%",
              background: "#ff1f1f",
              opacity: recPulse,
              boxShadow: recOn
                ? `0 0 ${6 + beatDecay * 10}px #ff1f1f, 0 0 ${12 + beatDecay * 14}px #ff4040`
                : "none",
              transition: "opacity 0.05s",
            }}
          />
          <span
            style={{
              color: "#ff4040",
              fontSize: 13,
              fontWeight: "bold",
              letterSpacing: 2,
              opacity: recOn ? 0.95 : 0.35,
              textShadow: recOn ? "0 0 4px rgba(255,40,40,0.7)" : "none",
            }}
          >
            REC
          </span>
        </div>

        {/* Timecode counter */}
        <div
          style={{
            padding: "5px 12px",
            background: "rgba(0,0,0,0.55)",
            borderRadius: 3,
            border: `0.5px solid rgba(240, 192, 96, 0.4)`,
            color: "#f0c060",
            fontSize: 14,
            fontWeight: "bold",
            letterSpacing: 2,
            textShadow: "0 0 3px rgba(240,192,96,0.5)",
          }}
        >
          {timecode}
        </div>

        {/* Format tag */}
        <div
          style={{
            padding: "5px 10px",
            background: "rgba(0,0,0,0.55)",
            borderRadius: 3,
            border: `0.5px solid rgba(240, 192, 96, 0.3)`,
            color: "#a08868",
            fontSize: 10,
            letterSpacing: 1.5,
          }}
        >
          16MM • K7222
        </div>
      </div>
    </>
  );
};
