/**
 * TaperRigDetail — A+++ Dead-tape culture artifact overlay.
 *
 * Audit gap #2: "Taper Rig Detail — Microphone on boom stand (AKG or
 * Neumann), cables (XLR runs), DAT machine or reel-to-reel, mixer board
 * with faders, headphone amp."
 *
 * Bottom-right corner artifact, ~24% opacity. Recreates the sit-and-tape
 * pit at every Dead show: pair of mics on a boom, cable run to a DAT
 * recorder, level meter showing real-time audio levels (via energy
 * uniform), pair of headphones.
 *
 * Audio reactivity:
 *   energy        → DAT VU meter needle position
 *   bass          → larger needle deflection on bass beats
 *   beatSnap      → record-light flash
 *   recordToggle  → record-light steady glow when "RECORDING"
 *
 * Hand-drawn period accuracy: 1977-era gear (DAT didn't exist yet, but
 * Nakamichi cassette decks + Sony reel-to-reel did). Going with the
 * Nakamichi cassette deck aesthetic which is era-correct and visually
 * iconic — matches what's at most '70s taper sections.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";

// ─── MICROPHONE ON BOOM ──────────────────────────────────────────
// AKG 414 / Neumann KM84 styled cardioid

const TaperMic: React.FC<{
  cx: number;
  cy: number;
  scale: number;
  beatPulse: number;
}> = ({ cx, cy, scale, beatPulse }) => {
  const W = 24 * scale;
  const H = 64 * scale;
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {/* Boom arm — extends down-right from above */}
      <line x1={0} y1={-H * 0.5} x2={W * 1.2} y2={-H * 1.4} stroke="#1a1a1a" strokeWidth={2.2 * scale} strokeLinecap="round" />
      {/* Suspension pivot ring */}
      <circle cx={0} cy={-H * 0.5} r={3 * scale} fill="none" stroke="#5a5a5a" strokeWidth={1} />

      {/* Mic body — capsule grille at top, body below */}
      {/* Body */}
      <rect x={-W / 2} y={-H * 0.3} width={W} height={H * 0.7} rx={2 * scale} fill="#2a2a2c" />
      {/* Body mid-band (gold ring) */}
      <rect x={-W / 2} y={H * 0.05} width={W} height={4 * scale} fill="#a08020" opacity={0.85} />
      {/* Lower screen panel (specs / model number visible at scale) */}
      <rect x={-W / 2 + 2 * scale} y={H * 0.18} width={W - 4 * scale} height={6 * scale} rx={1} fill="#0a0a0a" stroke="#3a3a3a" strokeWidth={0.4} />

      {/* Capsule grille — circular wire mesh at top */}
      <ellipse cx={0} cy={-H * 0.4} rx={W * 0.45} ry={W * 0.35} fill="#1a1a1a" />
      {/* Mesh dots simulating wire grille */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <circle
            key={i}
            cx={Math.cos(a) * W * 0.3}
            cy={-H * 0.4 + Math.sin(a) * W * 0.22}
            r={0.6 * scale}
            fill="#3a3a3a"
          />
        );
      })}
      {/* Vertical mesh lines */}
      {[-1, -0.5, 0, 0.5, 1].map((m, i) => (
        <line
          key={`l${i}`}
          x1={m * W * 0.4}
          y1={-H * 0.5}
          x2={m * W * 0.4}
          y2={-H * 0.3}
          stroke="#5a5a5a"
          strokeWidth={0.4 * scale}
          opacity={0.6}
        />
      ))}

      {/* Cardioid-pattern subtle indicator */}
      <text
        x={0}
        y={H * 0.22}
        fontFamily="monospace"
        fontSize={2.4 * scale}
        fill="#a08020"
        textAnchor="middle"
      >
        AKG 414
      </text>

      {/* Subtle highlight on body edge */}
      <line x1={-W / 2} y1={-H * 0.28} x2={-W / 2} y2={H * 0.36} stroke="#5a5a5a" strokeWidth={0.6 * scale} />

      {/* Recording LED — small red dot, flashes on beat */}
      <circle cx={W * 0.32} cy={-H * 0.18} r={1.6 * scale} fill="#c92020" opacity={0.5 + beatPulse * 0.5} />
      <circle cx={W * 0.32} cy={-H * 0.18} r={3 * scale} fill="#c92020" opacity={beatPulse * 0.4} />
    </g>
  );
};

// ─── XLR CABLE ───────────────────────────────────────────────────
// Curved cable run from mic to mixer

const XLRCable: React.FC<{
  x1: number; y1: number;
  x2: number; y2: number;
  sag: number;
}> = ({ x1, y1, x2, y2, sag }) => {
  // Bezier control point that creates a hanging-cable arc
  const midX = (x1 + x2) / 2;
  const midY = Math.max(y1, y2) + sag;
  return (
    <g>
      {/* Outer black cable */}
      <path d={`M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`} fill="none" stroke="#0a0a0a" strokeWidth={2.4} strokeLinecap="round" />
      {/* Highlight on top */}
      <path d={`M ${x1} ${y1} Q ${midX} ${midY - 0.6} ${x2} ${y2}`} fill="none" stroke="#3a3a3a" strokeWidth={0.6} strokeLinecap="round" opacity={0.65} />
    </g>
  );
};

// ─── NAKAMICHI 1977-ERA CASSETTE DECK ─────────────────────────────

const CassetteDeck: React.FC<{
  cx: number;
  cy: number;
  vuLevel: number;     // 0..1 from energy
  vuSpike: number;     // 0..1 from bass
  recordOn: number;    // 0..1 record indicator
  beatPulse: number;
}> = ({ cx, cy, vuLevel, vuSpike, recordOn, beatPulse }) => {
  const W = 220;
  const H = 75;
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {/* Drop shadow */}
      <rect x={-W / 2 + 3} y={-H / 2 + 3} width={W} height={H} rx={4} fill="rgba(0,0,0,0.4)" />

      {/* Body — brushed silver chassis */}
      <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={4} fill="#bdbdbe" />
      {/* Bottom darker strip */}
      <rect x={-W / 2} y={H / 2 - 14} width={W} height={14} fill="#7a7a7c" />

      {/* Brand label */}
      <text x={-W / 2 + 10} y={-H / 2 + 14} fontFamily="Helvetica, sans-serif" fontSize={8} fill="#1a1a1a" fontWeight="bold">NAKAMICHI</text>
      <text x={-W / 2 + 10} y={-H / 2 + 22} fontFamily="Helvetica, sans-serif" fontSize={5.5} fill="#5a5a5a">700 Three Head Cassette Deck</text>

      {/* Tape window — visible cassette */}
      <rect x={-W / 2 + 18} y={-H / 2 + 28} width={70} height={28} rx={2} fill="#1a1a1a" stroke="#3a3a3a" strokeWidth={0.8} />
      {/* Cassette inside */}
      <rect x={-W / 2 + 22} y={-H / 2 + 32} width={62} height={20} rx={1} fill="#0a0a0a" />
      {/* Cassette reels */}
      <circle cx={-W / 2 + 35} cy={-H / 2 + 42} r={4.5} fill="#2a2a2c" />
      <circle cx={-W / 2 + 35} cy={-H / 2 + 42} r={2.5} fill="#5a5a5a" />
      <circle cx={-W / 2 + 71} cy={-H / 2 + 42} r={4.5} fill="#2a2a2c" />
      <circle cx={-W / 2 + 71} cy={-H / 2 + 42} r={2.5} fill="#5a5a5a" />
      {/* Tape spans */}
      <line x1={-W / 2 + 39} y1={-H / 2 + 42} x2={-W / 2 + 67} y2={-H / 2 + 42} stroke="#3a3a3a" strokeWidth={1.2} />
      {/* Cassette label */}
      <rect x={-W / 2 + 24} y={-H / 2 + 48} width={58} height={4} fill="#e0d8b0" />
      <text x={-W / 2 + 53} y={-H / 2 + 51.6} fontFamily="monospace" fontSize={2.8} fill="#1a1a1a" textAnchor="middle">MAXELL XLII 90</text>

      {/* VU meters — twin needle gauges */}
      {[0, 1].map((idx) => {
        const meterCx = -W / 2 + 110 + idx * 36;
        const meterCy = -H / 2 + 28;
        const level = vuLevel + (idx === 0 ? vuSpike * 0.15 : -vuSpike * 0.08);
        const needleAngle = -60 + Math.min(120, level * 130);
        const needleRad = (needleAngle * Math.PI) / 180;
        return (
          <g key={idx}>
            {/* Meter bezel */}
            <rect x={meterCx - 14} y={meterCy - 8} width={28} height={22} rx={1.5} fill="#0a0a0a" />
            {/* Inner panel */}
            <rect x={meterCx - 12} y={meterCy - 6} width={24} height={18} rx={1} fill="#dcd5a0" />
            {/* Scale tick marks */}
            {[-50, -30, -10, 0, 3].map((db, i) => {
              const a = (-60 + (i / 4) * 120) * Math.PI / 180;
              const r = 9;
              return (
                <line
                  key={i}
                  x1={meterCx + Math.cos(a) * r * 0.65}
                  y1={meterCy + 6 + Math.sin(a) * r * 0.65}
                  x2={meterCx + Math.cos(a) * r * 0.85}
                  y2={meterCy + 6 + Math.sin(a) * r * 0.85}
                  stroke={db >= 0 ? "#c92020" : "#1a1a1a"}
                  strokeWidth={0.7}
                />
              );
            })}
            {/* Needle */}
            <line
              x1={meterCx}
              y1={meterCy + 6}
              x2={meterCx + Math.cos(needleRad) * 9}
              y2={meterCy + 6 + Math.sin(needleRad) * 9}
              stroke="#c92020"
              strokeWidth={1.2}
              strokeLinecap="round"
            />
            <circle cx={meterCx} cy={meterCy + 6} r={1.2} fill="#1a1a1a" />
            {/* "VU" label */}
            <text x={meterCx} y={meterCy + 14} fontFamily="Helvetica, sans-serif" fontSize={3} fill="#5a3030" textAnchor="middle">{idx === 0 ? "L" : "R"}</text>
          </g>
        );
      })}

      {/* Bottom — transport buttons */}
      {["⏮", "⏵", "⏸", "⏹", "⏺"].map((label, i) => (
        <g key={i}>
          <rect x={-W / 2 + 12 + i * 14} y={H / 2 - 11} width={11} height={8} rx={1} fill="#1a1a1a" stroke="#5a5a5a" strokeWidth={0.4} />
          {label === "⏺" && (
            <circle
              cx={-W / 2 + 17.5 + i * 14}
              cy={H / 2 - 7}
              r={2.2}
              fill="#c92020"
              opacity={0.7 + recordOn * 0.3}
            />
          )}
        </g>
      ))}

      {/* Headphone jack + level knob */}
      <circle cx={W / 2 - 30} cy={H / 2 - 7} r={3} fill="#1a1a1a" />
      <circle cx={W / 2 - 30} cy={H / 2 - 7} r={1.2} fill="#5a5a5a" />
      <circle cx={W / 2 - 14} cy={H / 2 - 7} r={4} fill="#3a3a3a" stroke="#1a1a1a" strokeWidth={0.6} />
      <line x1={W / 2 - 14} y1={H / 2 - 7} x2={W / 2 - 14 + 3} y2={H / 2 - 9.5} stroke="#dcd5a0" strokeWidth={0.8} />

      {/* Recording indicator big LED top-right corner */}
      <circle
        cx={W / 2 - 12}
        cy={-H / 2 + 12}
        r={3}
        fill="#c92020"
        opacity={0.5 + beatPulse * 0.4}
      />
      <text
        x={W / 2 - 12}
        y={-H / 2 + 22}
        fontFamily="monospace"
        fontSize={3.5}
        fill="#5a3030"
        textAnchor="middle"
        fontWeight="bold"
      >
        REC
      </text>
    </g>
  );
};

// ─── HEADPHONES ──────────────────────────────────────────────────

const Headphones: React.FC<{ cx: number; cy: number }> = ({ cx, cy }) => (
  <g transform={`translate(${cx} ${cy})`}>
    {/* Drop shadow */}
    <ellipse cx={2} cy={20} rx={32} ry={4} fill="rgba(0,0,0,0.4)" />
    {/* Headband — curved arc */}
    <path
      d="M -28 -8 Q 0 -28 28 -8"
      fill="none"
      stroke="#1a1a1a"
      strokeWidth={4}
      strokeLinecap="round"
    />
    {/* Inner padding visible on band */}
    <path
      d="M -25 -7 Q 0 -22 25 -7"
      fill="none"
      stroke="#5a3a20"
      strokeWidth={1.2}
      opacity={0.7}
    />

    {/* Left earcup */}
    <ellipse cx={-28} cy={4} rx={11} ry={13} fill="#1a1a1a" />
    <ellipse cx={-28} cy={4} rx={8} ry={10} fill="#0a0a0a" />
    <ellipse cx={-28} cy={4} rx={5} ry={7} fill="#3a3a3a" />
    {/* Brand letters */}
    <text x={-28} y={6} fontFamily="Helvetica, sans-serif" fontSize={4} fill="#a08020" textAnchor="middle" fontWeight="bold">SONY</text>

    {/* Right earcup */}
    <ellipse cx={28} cy={4} rx={11} ry={13} fill="#1a1a1a" />
    <ellipse cx={28} cy={4} rx={8} ry={10} fill="#0a0a0a" />
    <ellipse cx={28} cy={4} rx={5} ry={7} fill="#3a3a3a" />
    <text x={28} y={6} fontFamily="Helvetica, sans-serif" fontSize={4} fill="#a08020" textAnchor="middle" fontWeight="bold">SONY</text>

    {/* Cable from right earcup down */}
    <path d="M 28 17 Q 30 25 32 35" fill="none" stroke="#0a0a0a" strokeWidth={1.4} />
  </g>
);

// ─── MIXER STRIP — small mini-mixer detail ───────────────────────

const MixerStrip: React.FC<{
  cx: number;
  cy: number;
  faderL: number;
  faderR: number;
}> = ({ cx, cy, faderL, faderR }) => {
  const W = 70;
  const H = 80;
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={3} fill="#bdbdbe" stroke="#5a5a5a" strokeWidth={0.6} />
      {/* Brand */}
      <text x={0} y={-H / 2 + 9} fontFamily="Helvetica, sans-serif" fontSize={5} fill="#1a1a1a" textAnchor="middle" fontWeight="bold">SHURE M67</text>

      {/* Two fader strips */}
      {[-1, 1].map((s, i) => {
        const x = s * 16;
        const fader = i === 0 ? faderL : faderR;
        // Fader-bar travel: top -22, bottom +22, position from level
        const knobY = 22 - fader * 44;
        return (
          <g key={i}>
            {/* Slot */}
            <rect x={x - 1} y={-22} width={2} height={48} fill="#0a0a0a" rx={1} />
            {/* Knob */}
            <rect x={x - 6} y={knobY - 3} width={12} height={6} rx={1} fill="#3a3a3a" stroke="#1a1a1a" strokeWidth={0.4} />
            <line x1={x - 5} y1={knobY} x2={x + 5} y2={knobY} stroke="#dcd5a0" strokeWidth={0.7} />
            {/* Channel label */}
            <text x={x} y={H / 2 - 7} fontFamily="monospace" fontSize={4.5} fill="#1a1a1a" textAnchor="middle">CH{i + 1}</text>
            {/* Tick marks */}
            {[-22, -11, 0, 11, 22].map((y) => (
              <line key={y} x1={x + (s * 8)} y1={y} x2={x + (s * 11)} y2={y} stroke="#3a3a3a" strokeWidth={0.4} />
            ))}
          </g>
        );
      })}

      {/* Master out indicator (small jewel light) */}
      <circle cx={0} cy={-H / 2 + 30} r={1.4} fill="#a0c020" />
    </g>
  );
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const TaperRigDetail: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const audio = useAudioSnapshot(frames);

  const energy = Math.min(1, audio?.energy ?? 0);
  const bass = Math.min(1, audio?.bass ?? 0);
  // Beat-pulse proxy from drum onset
  const beatPulse = Math.min(1, audio?.drumOnset ?? 0);

  // VU meter responds quickly; smooth a bit so it doesn't snap
  const vuLevel = 0.25 + energy * 0.65;
  const vuSpike = bass * 0.35;

  // Faders track mixed output proxy (energy + a bit of bass pumping)
  const faderL = 0.55 + Math.sin(frame * 0.04) * 0.05 + energy * 0.25;
  const faderR = 0.58 + Math.cos(frame * 0.04 + 0.5) * 0.05 + energy * 0.22;

  // Layout: bottom-right corner — taper section is always tucked away
  // Anchor base is the corner; everything offsets up/left from there.
  const anchorX = width - 280;
  const anchorY = height - 130;

  // Mic position (high) → cable arc → cassette deck (mid) → headphones beside
  const micX = anchorX + 30;
  const micY = anchorY - 60;
  const deckX = anchorX + 110;
  const deckY = anchorY + 5;
  const mixerX = anchorX + 230;
  const mixerY = anchorY - 5;
  const phonesX = anchorX + 80;
  const phonesY = anchorY + 80;

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.26 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        {/* Sub-corner haze — warm-cool venue under-stage light */}
        <radialGradient id="taperHaze" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="rgba(180,150,100,0.25)" />
          <stop offset="100%" stopColor="rgba(180,150,100,0)" />
        </radialGradient>
        <ellipse cx={anchorX + 130} cy={anchorY + 30} rx={220} ry={110} fill="url(#taperHaze)" />

        {/* Cable from mic to mixer top-right input */}
        <XLRCable x1={micX + 10} y1={micY + 12} x2={mixerX - 28} y2={mixerY - 22} sag={20} />
        {/* Cable from mixer to deck */}
        <XLRCable x1={mixerX - 28} y1={mixerY + 18} x2={deckX + 80} y2={deckY - 28} sag={18} />
        {/* Headphone cable to deck */}
        <XLRCable x1={deckX + 75} y1={deckY + 28} x2={phonesX + 30} y2={phonesY - 6} sag={10} />

        {/* Mic (positioned above the deck, boom going up off-frame) */}
        <TaperMic cx={micX} cy={micY} scale={1.1} beatPulse={beatPulse} />

        {/* Cassette deck */}
        <CassetteDeck
          cx={deckX}
          cy={deckY}
          vuLevel={vuLevel}
          vuSpike={vuSpike}
          recordOn={1.0}
          beatPulse={beatPulse}
        />

        {/* Mixer (small) */}
        <MixerStrip cx={mixerX} cy={mixerY} faderL={faderL} faderR={faderR} />

        {/* Headphones */}
        <Headphones cx={phonesX} cy={phonesY} />

        {/* Tape-trader's setlist scrap visible at corner — a hint */}
        <g transform={`translate(${anchorX - 30} ${anchorY - 10}) rotate(-4)`}>
          <rect x={-12} y={-18} width={48} height={26} fill="#f0e6b0" stroke="#5a3a18" strokeWidth={0.6} />
          {/* Hand-scrawled lines */}
          {[
            { y: -12, t: "Promised >" },
            { y: -7, t: "TLEO" },
            { y: -2, t: "M&MU" },
            { y: 3, t: "Half-Step" },
          ].map((s, i) => (
            <text key={i} x={-9} y={s.y} fontFamily="Georgia, serif" fontSize={3.2} fill="#3a1a0a" fontStyle="italic">
              {s.t}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
};
