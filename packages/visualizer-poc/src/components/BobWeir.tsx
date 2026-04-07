/**
 * BobWeir — A+++ overlay: Bob Weir on stage with his ES-335.
 * Full concert scene rendered in SVG: stage floor with reflection, audience
 * silhouettes, spotlight cone with dust motes, monitor wedges, mic stand,
 * amp stack, cable, and Bob himself in his cowboy hat and vest holding the
 * ES-335 (with f-holes, headstock, neck, tailpiece, vibrating strings).
 *
 * Audio reactivity:
 *   slowEnergy → spotlight warmth + dust mote density
 *   energy → audience hands raised, glow brightness
 *   bass → amp stack rumble (subtle vertical jitter)
 *   beatDecay → strum amplitude pulse
 *   onsetEnvelope → flash highlights on guitar body
 *   chromaHue → amber/warm palette tint
 *   tempoFactor → strum oscillation speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const DUST_COUNT = 70;
const AUDIENCE_COUNT = 32;
const HAND_COUNT = 14;

interface DustMote { x: number; y: number; r: number; speed: number; phase: number; drift: number; }
interface AudienceHead { x: number; w: number; h: number; tilt: number; }
interface RaisedHand { x: number; baseY: number; sway: number; phase: number; }

function buildDust(): DustMote[] {
  const rng = seeded(48_223_911);
  return Array.from({ length: DUST_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.6 + rng() * 1.6,
    speed: 0.0006 + rng() * 0.0018,
    phase: rng() * Math.PI * 2,
    drift: 4 + rng() * 14,
  }));
}

function buildAudience(): AudienceHead[] {
  const rng = seeded(33_881_207);
  return Array.from({ length: AUDIENCE_COUNT }, () => ({
    x: rng(),
    w: 14 + rng() * 22,
    h: 18 + rng() * 26,
    tilt: (rng() - 0.5) * 0.18,
  }));
}

function buildHands(): RaisedHand[] {
  const rng = seeded(71_902_443);
  return Array.from({ length: HAND_COUNT }, () => ({
    x: 0.05 + rng() * 0.9,
    baseY: 0.86 + rng() * 0.06,
    sway: 0.005 + rng() * 0.012,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const BobWeir: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const dustMotes = React.useMemo(buildDust, []);
  const audience = React.useMemo(buildAudience, []);
  const hands = React.useMemo(buildHands, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives
  const spotWarmth = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.05], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const crowdEnergy = interpolate(snap.energy, [0.02, 0.30], [0.4, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ampRumble = interpolate(snap.bass, [0.0, 0.7], [0.0, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const strumPulse = 1 + snap.beatDecay * 0.42;
  const flashHit = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Amber base hue, modulated by chromaHue
  const baseHue = 38;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const tintLight = 64 + spotWarmth * 16;
  const tintColor = `hsl(${tintHue}, 78%, ${tintLight}%)`;
  const tintCore = `hsl(${tintHue}, 92%, ${Math.min(96, tintLight + 20)}%)`;
  const tintDeep = `hsl(${(tintHue + 14) % 360}, 60%, 28%)`;

  // Geometry
  const cx = width * 0.5;
  const stageY = height * 0.74;
  const horizonY = height * 0.50;
  const bobX = cx;
  const bobBaseY = stageY - 12;
  const ampX = width * 0.78;

  const skyTop = `hsl(${(tintHue + 200) % 360}, 36%, 4%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 28%, 7%)`;
  const stageColor = `hsl(${(tintHue + 30) % 360}, 18%, 11%)`;

  // Dust mote nodes
  const dustNodes = dustMotes.map((d, i) => {
    const t = frame * d.speed * tempoFactor + d.phase;
    const px = (d.x + Math.sin(t * 1.3) * 0.04) * width;
    const py = (d.y * 0.55 + Math.sin(t * 0.7) * 0.02) * height;
    const flicker = 0.5 + Math.sin(t * 2.4) * 0.4;
    return (
      <circle key={`dust-${i}`} cx={px} cy={py} r={d.r * (0.7 + spotWarmth * 0.5)}
        fill={tintCore} opacity={0.35 * flicker * spotWarmth} />
    );
  });

  // Audience heads (foreground silhouette row)
  const audienceNodes = audience.map((a, i) => {
    const ax = a.x * width;
    const ay = height * 0.92;
    return (
      <g key={`aud-${i}`} transform={`rotate(${a.tilt * 12}, ${ax}, ${ay})`}>
        <path d={`M ${ax - a.w * 0.9} ${ay + a.h * 0.6} Q ${ax} ${ay + a.h * 0.2} ${ax + a.w * 0.9} ${ay + a.h * 0.6} L ${ax + a.w * 1.1} ${height} L ${ax - a.w * 1.1} ${height} Z`}
          fill="rgba(2, 2, 6, 0.92)" />
        <ellipse cx={ax} cy={ay} rx={a.w * 0.55} ry={a.h * 0.55} fill="rgba(4, 4, 10, 0.96)" />
        <path d={`M ${ax - a.w * 0.5} ${ay - a.h * 0.2} Q ${ax} ${ay - a.h * 0.6} ${ax + a.w * 0.5} ${ay - a.h * 0.2}`}
          fill="none" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.4} />
      </g>
    );
  });

  // Raised hands (energy-gated)
  const handNodes = hands.map((h, i) => {
    const handHeight = crowdEnergy * (0.04 + (i % 3) * 0.012);
    const sway = Math.sin(frame * h.sway + h.phase) * 4;
    const hx = h.x * width + sway;
    const hy = (h.baseY - handHeight) * height;
    const armBaseY = h.baseY * height + 14;
    return (
      <g key={`hand-${i}`} opacity={crowdEnergy * 0.85}>
        <line x1={hx} y1={armBaseY} x2={hx} y2={hy + 8} stroke="rgba(2, 2, 6, 0.95)" strokeWidth={3} strokeLinecap="round" />
        <ellipse cx={hx} cy={hy + 4} rx={3.4} ry={5} fill="rgba(2, 2, 6, 0.95)" />
        <line x1={hx - 2} y1={hy + 4} x2={hx - 3} y2={hy - 2} stroke="rgba(2, 2, 6, 0.95)" strokeWidth={1.4} strokeLinecap="round" />
        <line x1={hx} y1={hy + 2} x2={hx} y2={hy - 4} stroke="rgba(2, 2, 6, 0.95)" strokeWidth={1.4} strokeLinecap="round" />
        <line x1={hx + 2} y1={hy + 4} x2={hx + 3} y2={hy - 2} stroke="rgba(2, 2, 6, 0.95)" strokeWidth={1.4} strokeLinecap="round" />
      </g>
    );
  });

  // Spotlight cone
  const spotTopX = cx;
  const spotTopY = 0;
  const spotBaseY = stageY - 8;
  const spotHalfW = width * 0.22;
  const spotPath = `M ${spotTopX - 28} ${spotTopY} L ${spotTopX + 28} ${spotTopY} L ${spotTopX + spotHalfW} ${spotBaseY} L ${spotTopX - spotHalfW} ${spotBaseY} Z`;

  // Bob silhouette geometry
  const bobBodyH = 130;
  const torsoTopY = bobBaseY - bobBodyH;
  const headR = 18;
  const headCY = torsoTopY - headR + 4;
  const strumOffset = Math.sin(frame * 0.18 * tempoFactor) * 4 * strumPulse;

  // ES-335 guitar (held diagonally)
  const guitarBodyCX = bobX + 22;
  const guitarBodyCY = bobBaseY - 60;
  const guitarRotate = -22;

  // String vibration
  const stringVib = (s: number) => Math.sin(frame * 0.7 * tempoFactor + s * 1.2) * (1.5 + snap.beatDecay * 2.5);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="bw-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={tintDeep} />
          </linearGradient>
          <linearGradient id="bw-stage" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stageColor} />
            <stop offset="100%" stopColor="rgba(2, 2, 6, 0.98)" />
          </linearGradient>
          <linearGradient id="bw-spot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.55} />
            <stop offset="55%" stopColor={tintColor} stopOpacity={0.18} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </linearGradient>
          <radialGradient id="bw-halo">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.85} />
            <stop offset="60%" stopColor={tintColor} stopOpacity={0.18} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="bw-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>
          <linearGradient id="bw-hatBrim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a0f06" />
            <stop offset="100%" stopColor="#0a0502" />
          </linearGradient>
          <linearGradient id="bw-vest" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1c1208" />
            <stop offset="100%" stopColor="#0a0602" />
          </linearGradient>
          <linearGradient id="bw-jeans" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f1320" />
            <stop offset="100%" stopColor="#040610" />
          </linearGradient>
          <linearGradient id="bw-guitarBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3c1808" />
            <stop offset="50%" stopColor="#7a3a0e" />
            <stop offset="100%" stopColor="#2a0f04" />
          </linearGradient>
          <linearGradient id="bw-amp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f0b06" />
            <stop offset="100%" stopColor="#040201" />
          </linearGradient>
          <filter id="bw-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Sky / arena background */}
        <rect width={width} height={height} fill="url(#bw-sky)" />

        {/* Distant stage trusses (silhouette) */}
        <rect x={width * 0.05} y={height * 0.08} width={width * 0.9} height={6} fill="rgba(0, 0, 0, 0.85)" />
        <rect x={width * 0.05} y={height * 0.08} width={6} height={height * 0.42} fill="rgba(0, 0, 0, 0.85)" />
        <rect x={width * 0.95 - 6} y={height * 0.08} width={6} height={height * 0.42} fill="rgba(0, 0, 0, 0.85)" />
        {[0.18, 0.30, 0.42, 0.58, 0.70, 0.82].map((px, i) => (
          <g key={`fix-${i}`}>
            <line x1={width * px} y1={height * 0.085} x2={width * px} y2={height * 0.13} stroke="rgba(0, 0, 0, 0.9)" strokeWidth={2} />
            <rect x={width * px - 6} y={height * 0.13} width={12} height={8} fill="rgba(0, 0, 0, 0.95)" />
            <circle cx={width * px} cy={height * 0.14} r={3} fill={tintCore} opacity={0.6 * spotWarmth} />
          </g>
        ))}

        {/* Stage backdrop / curtain */}
        <rect x={0} y={horizonY} width={width} height={stageY - horizonY} fill="rgba(8, 6, 12, 0.85)" />
        {Array.from({ length: 18 }).map((_, i) => (
          <line key={`fold-${i}`} x1={(i / 18) * width} y1={horizonY} x2={(i / 18) * width + 8} y2={stageY}
            stroke="rgba(0, 0, 0, 0.55)" strokeWidth={1.2} />
        ))}

        {/* Spotlight cone (volumetric) */}
        <path d={spotPath} fill="url(#bw-spot)" style={{ mixBlendMode: "screen" }} />
        <path d={`M ${spotTopX - 14} ${spotTopY} L ${spotTopX + 14} ${spotTopY} L ${spotTopX + spotHalfW * 0.55} ${spotBaseY} L ${spotTopX - spotHalfW * 0.55} ${spotBaseY} Z`}
          fill={tintCore} opacity={0.18 * spotWarmth} style={{ mixBlendMode: "screen" }} />

        {/* Stage floor */}
        <rect x={0} y={stageY} width={width} height={height - stageY} fill="url(#bw-stage)" />
        <rect x={0} y={stageY - 1} width={width} height={2} fill={tintColor} opacity={0.32 * spotWarmth} />
        {Array.from({ length: 14 }).map((_, i) => (
          <line key={`plank-${i}`} x1={0} y1={stageY + 8 + i * 12} x2={width} y2={stageY + 8 + i * 12}
            stroke="rgba(0, 0, 0, 0.45)" strokeWidth={0.6} />
        ))}

        {/* Stage reflection of Bob (subtle blur) */}
        <g opacity={0.18 * spotWarmth}>
          <ellipse cx={bobX} cy={stageY + 40} rx={42} ry={20} fill="rgba(2, 2, 6, 0.6)" filter="url(#bw-blur)" />
        </g>

        {/* Amp stack stage right */}
        <g transform={`translate(${ampX} ${stageY - 220}) translate(0 ${ampRumble * 1.2 * Math.sin(frame * 0.5)})`}>
          <rect x={-58} y={0} width={116} height={90} fill="url(#bw-amp)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.5} />
          <rect x={-50} y={8} width={100} height={74} fill="none" stroke="rgba(60, 50, 40, 0.45)" strokeWidth={0.8} />
          {Array.from({ length: 6 }).map((_, r) =>
            Array.from({ length: 7 }).map((_, c) => (
              <circle key={`g-${r}-${c}`} cx={-44 + c * 14} cy={14 + r * 12} r={1.4} fill="rgba(40, 32, 22, 0.55)" />
            )),
          )}
          <rect x={-12} y={64} width={24} height={6} fill="rgba(20, 14, 8, 0.85)" />
          <line x1={-10} y1={67} x2={10} y2={67} stroke={tintCore} strokeWidth={0.6} opacity={0.55} />

          <rect x={-62} y={94} width={124} height={120} fill="url(#bw-amp)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.5} />
          <rect x={-54} y={102} width={108} height={104} fill="none" stroke="rgba(60, 50, 40, 0.45)" strokeWidth={0.8} />
          {[-30, 30].map((dx) => (
            <g key={`spk-${dx}`}>
              <circle cx={dx} cy={130} r={20} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(60, 50, 40, 0.55)" strokeWidth={0.8} />
              <circle cx={dx} cy={130} r={16} fill="none" stroke="rgba(40, 32, 22, 0.55)" strokeWidth={0.6} />
              <circle cx={dx} cy={130} r={5 + ampRumble * 0.8} fill="rgba(20, 14, 8, 0.95)" />
              <circle cx={dx} cy={130} r={2} fill={tintCore} opacity={0.5 * ampRumble} />
              <circle cx={dx} cy={180} r={20} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(60, 50, 40, 0.55)" strokeWidth={0.8} />
              <circle cx={dx} cy={180} r={16} fill="none" stroke="rgba(40, 32, 22, 0.55)" strokeWidth={0.6} />
              <circle cx={dx} cy={180} r={5 + ampRumble * 0.8} fill="rgba(20, 14, 8, 0.95)" />
              <circle cx={dx} cy={180} r={2} fill={tintCore} opacity={0.5 * ampRumble} />
            </g>
          ))}
          <ellipse cx={0} cy={156} rx={70} ry={18} fill={tintCore} opacity={0.10 + ampRumble * 0.10} filter="url(#bw-blur)" />
        </g>

        {/* Cable from Bob to amp */}
        <path d={`M ${bobX + 18} ${bobBaseY - 50} Q ${(bobX + ampX) / 2} ${stageY + 18} ${ampX - 40} ${stageY - 110}`}
          stroke="rgba(0, 0, 0, 0.95)" strokeWidth={2.2} fill="none" />
        <path d={`M ${bobX + 18} ${bobBaseY - 50} Q ${(bobX + ampX) / 2} ${stageY + 18} ${ampX - 40} ${stageY - 110}`}
          stroke="rgba(50, 40, 30, 0.55)" strokeWidth={0.7} fill="none" />

        {/* Monitor wedge in front of Bob */}
        <g transform={`translate(${bobX} ${stageY + 22})`}>
          <path d="M -42 0 L 42 0 L 32 24 L -32 24 Z" fill="rgba(6, 4, 10, 0.95)" stroke="rgba(40, 30, 20, 0.7)" strokeWidth={1.2} />
          <ellipse cx={-14} cy={12} rx={9} ry={6} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(60, 50, 40, 0.55)" strokeWidth={0.5} />
          <ellipse cx={14} cy={12} rx={9} ry={6} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(60, 50, 40, 0.55)" strokeWidth={0.5} />
          <circle cx={-14} cy={12} r={2} fill={tintCore} opacity={0.4} />
          <circle cx={14} cy={12} r={2} fill={tintCore} opacity={0.4} />
        </g>

        {/* Mic stand to Bob's left */}
        <g transform={`translate(${bobX - 60} ${bobBaseY - 100})`}>
          <ellipse cx={0} cy={108} rx={18} ry={3} fill="rgba(2, 2, 6, 0.95)" />
          <line x1={0} y1={106} x2={0} y2={4} stroke="rgba(20, 18, 14, 0.95)" strokeWidth={2.2} />
          <line x1={0} y1={4} x2={20} y2={-4} stroke="rgba(20, 18, 14, 0.95)" strokeWidth={2.2} />
          <ellipse cx={24} cy={-6} rx={5} ry={9} fill="rgba(8, 6, 12, 0.98)" stroke="rgba(40, 32, 22, 0.7)" strokeWidth={0.8} />
          <ellipse cx={24} cy={-10} rx={5} ry={4} fill="rgba(60, 50, 40, 0.55)" />
          <path d="M 0 108 Q -10 116 -22 120" stroke="rgba(0, 0, 0, 0.95)" strokeWidth={1.6} fill="none" />
        </g>

        {/* Bob's silhouette */}
        <g>
          {/* Legs */}
          <path d={`M ${bobX - 14} ${bobBaseY - 60} L ${bobX - 18} ${bobBaseY} L ${bobX - 8} ${bobBaseY} L ${bobX - 4} ${bobBaseY - 60} Z`}
            fill="url(#bw-jeans)" />
          <path d={`M ${bobX + 4} ${bobBaseY - 60} L ${bobX + 8} ${bobBaseY} L ${bobX + 18} ${bobBaseY} L ${bobX + 14} ${bobBaseY - 60} Z`}
            fill="url(#bw-jeans)" />
          <rect x={bobX - 22} y={bobBaseY - 64} width={44} height={5} fill="rgba(40, 26, 12, 0.95)" />
          <rect x={bobX - 3} y={bobBaseY - 64} width={6} height={5} fill={tintCore} opacity={0.6} />

          {/* Torso (vest) */}
          <path d={`M ${bobX - 28} ${torsoTopY + 12} Q ${bobX - 32} ${bobBaseY - 80} ${bobX - 22} ${bobBaseY - 60} L ${bobX + 22} ${bobBaseY - 60} Q ${bobX + 32} ${bobBaseY - 80} ${bobX + 28} ${torsoTopY + 12} Q ${bobX} ${torsoTopY + 4} ${bobX - 28} ${torsoTopY + 12} Z`}
            fill="url(#bw-vest)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1} />
          <line x1={bobX} y1={torsoTopY + 8} x2={bobX} y2={bobBaseY - 64} stroke="rgba(0, 0, 0, 1)" strokeWidth={1.2} />
          <path d={`M ${bobX - 14} ${torsoTopY + 14} Q ${bobX} ${torsoTopY + 8} ${bobX + 14} ${torsoTopY + 14} L ${bobX + 12} ${bobBaseY - 64} L ${bobX - 12} ${bobBaseY - 64} Z`}
            fill="rgba(80, 60, 30, 0.55)" />

          {/* Arms */}
          <path d={`M ${bobX - 26} ${torsoTopY + 18} Q ${bobX - 50} ${bobBaseY - 80} ${bobX - 38} ${bobBaseY - 50}`}
            stroke="rgba(80, 60, 30, 0.65)" strokeWidth={9} fill="none" strokeLinecap="round" />
          <path d={`M ${bobX + 26} ${torsoTopY + 18} Q ${bobX + 36 + strumOffset} ${bobBaseY - 80} ${bobX + 28 + strumOffset} ${bobBaseY - 56}`}
            stroke="rgba(80, 60, 30, 0.65)" strokeWidth={9} fill="none" strokeLinecap="round" />

          {/* Head */}
          <ellipse cx={bobX} cy={headCY} rx={headR * 0.85} ry={headR} fill="rgba(60, 38, 18, 0.92)" />
          <path d={`M ${bobX - headR + 2} ${headCY} Q ${bobX - headR - 4} ${headCY + 14} ${bobX - headR - 2} ${headCY + 22} Q ${bobX} ${headCY + 18} ${bobX + headR + 2} ${headCY + 22} Q ${bobX + headR + 4} ${headCY + 14} ${bobX + headR - 2} ${headCY}`}
            fill="rgba(20, 12, 4, 0.95)" />
          <path d={`M ${bobX - 10} ${headCY + 6} Q ${bobX} ${headCY + 16} ${bobX + 10} ${headCY + 6}`}
            fill="rgba(20, 12, 4, 0.85)" />

          {/* Cowboy hat */}
          <ellipse cx={bobX} cy={headCY - headR + 4} rx={headR + 14} ry={5} fill="url(#bw-hatBrim)" />
          <path d={`M ${bobX - headR - 2} ${headCY - headR + 2} Q ${bobX - headR - 4} ${headCY - headR - 12} ${bobX} ${headCY - headR - 14} Q ${bobX + headR + 4} ${headCY - headR - 12} ${bobX + headR + 2} ${headCY - headR + 2} Z`}
            fill="rgba(18, 10, 4, 0.98)" />
          <ellipse cx={bobX} cy={headCY - headR - 4} rx={headR - 2} ry={3} fill="rgba(40, 26, 12, 0.7)" />
          <rect x={bobX - headR - 1} y={headCY - headR + 1} width={(headR + 1) * 2} height={2.5} fill="rgba(80, 60, 30, 0.85)" />
        </g>

        {/* ES-335 guitar */}
        <g transform={`rotate(${guitarRotate}, ${guitarBodyCX}, ${guitarBodyCY})`}>
          <ellipse cx={guitarBodyCX} cy={guitarBodyCY} rx={48} ry={36} fill="url(#bw-guitarBody)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.4} />
          <ellipse cx={guitarBodyCX} cy={guitarBodyCY} rx={45} ry={33} fill="none" stroke="rgba(220, 180, 100, 0.45)" strokeWidth={0.8} />
          {/* F-holes */}
          <path d={`M ${guitarBodyCX - 22} ${guitarBodyCY - 14} Q ${guitarBodyCX - 26} ${guitarBodyCY - 6} ${guitarBodyCX - 22} ${guitarBodyCY + 4} Q ${guitarBodyCX - 18} ${guitarBodyCY + 12} ${guitarBodyCX - 22} ${guitarBodyCY + 18}`}
            stroke="rgba(0, 0, 0, 1)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
          <path d={`M ${guitarBodyCX + 22} ${guitarBodyCY - 14} Q ${guitarBodyCX + 26} ${guitarBodyCY - 6} ${guitarBodyCX + 22} ${guitarBodyCY + 4} Q ${guitarBodyCX + 18} ${guitarBodyCY + 12} ${guitarBodyCX + 22} ${guitarBodyCY + 18}`}
            stroke="rgba(0, 0, 0, 1)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
          {/* Pickguard */}
          <path d={`M ${guitarBodyCX - 4} ${guitarBodyCY - 8} L ${guitarBodyCX + 14} ${guitarBodyCY - 4} L ${guitarBodyCX + 16} ${guitarBodyCY + 14} L ${guitarBodyCX - 6} ${guitarBodyCY + 12} Z`}
            fill="rgba(0, 0, 0, 0.85)" stroke="rgba(180, 140, 60, 0.45)" strokeWidth={0.5} />
          {/* Pickups (2 humbuckers) */}
          <rect x={guitarBodyCX - 4} y={guitarBodyCY - 6} width={18} height={6} rx={1} fill="rgba(60, 50, 40, 0.95)" />
          <rect x={guitarBodyCX - 4} y={guitarBodyCY + 4} width={18} height={6} rx={1} fill="rgba(60, 50, 40, 0.95)" />
          {Array.from({ length: 6 }).map((_, i) => (
            <circle key={`pole-n-${i}`} cx={guitarBodyCX - 2 + i * 3} cy={guitarBodyCY - 3} r={0.7} fill="rgba(180, 160, 120, 0.8)" />
          ))}
          {Array.from({ length: 6 }).map((_, i) => (
            <circle key={`pole-b-${i}`} cx={guitarBodyCX - 2 + i * 3} cy={guitarBodyCY + 7} r={0.7} fill="rgba(180, 160, 120, 0.8)" />
          ))}
          {/* Tailpiece */}
          <rect x={guitarBodyCX + 18} y={guitarBodyCY - 6} width={4} height={20} fill="rgba(180, 160, 120, 0.85)" />
          <rect x={guitarBodyCX + 14} y={guitarBodyCY - 7} width={3} height={22} fill="rgba(140, 120, 80, 0.85)" />
          {/* Knobs */}
          <circle cx={guitarBodyCX + 8} cy={guitarBodyCY + 22} r={2.2} fill="rgba(200, 170, 100, 0.85)" />
          <circle cx={guitarBodyCX + 16} cy={guitarBodyCY + 22} r={2.2} fill="rgba(200, 170, 100, 0.85)" />
          <circle cx={guitarBodyCX + 8} cy={guitarBodyCY + 28} r={2.2} fill="rgba(200, 170, 100, 0.85)" />
          <circle cx={guitarBodyCX + 16} cy={guitarBodyCY + 28} r={2.2} fill="rgba(200, 170, 100, 0.85)" />
          <circle cx={guitarBodyCX - 2} cy={guitarBodyCY - 18} r={1.5} fill="rgba(220, 200, 140, 0.85)" />

          {/* Neck */}
          <rect x={guitarBodyCX - 110} y={guitarBodyCY - 4} width={68} height={8} fill="rgba(60, 36, 14, 0.98)" stroke="rgba(0, 0, 0, 1)" strokeWidth={0.8} />
          {Array.from({ length: 14 }).map((_, i) => (
            <line key={`fret-${i}`} x1={guitarBodyCX - 108 + i * 5} y1={guitarBodyCY - 4} x2={guitarBodyCX - 108 + i * 5} y2={guitarBodyCY + 4}
              stroke="rgba(220, 200, 140, 0.65)" strokeWidth={0.5} />
          ))}
          <circle cx={guitarBodyCX - 86} cy={guitarBodyCY} r={0.9} fill="rgba(220, 200, 140, 0.85)" />
          <circle cx={guitarBodyCX - 76} cy={guitarBodyCY} r={0.9} fill="rgba(220, 200, 140, 0.85)" />
          <circle cx={guitarBodyCX - 66} cy={guitarBodyCY} r={0.9} fill="rgba(220, 200, 140, 0.85)" />
          <circle cx={guitarBodyCX - 56} cy={guitarBodyCY} r={0.9} fill="rgba(220, 200, 140, 0.85)" />

          {/* Strings (vibrating) */}
          {Array.from({ length: 6 }).map((_, i) => {
            const y = guitarBodyCY - 3 + i * 1.2;
            return (
              <line key={`s-${i}`} x1={guitarBodyCX - 110} y1={y + stringVib(i)} x2={guitarBodyCX + 18} y2={y}
                stroke="rgba(220, 200, 140, 0.7)" strokeWidth={0.4 + i * 0.05} />
            );
          })}

          {/* Headstock */}
          <path d={`M ${guitarBodyCX - 116} ${guitarBodyCY - 8} L ${guitarBodyCX - 138} ${guitarBodyCY - 14} L ${guitarBodyCX - 142} ${guitarBodyCY + 6} L ${guitarBodyCX - 116} ${guitarBodyCY + 8} Z`}
            fill="rgba(40, 24, 8, 0.98)" stroke="rgba(0, 0, 0, 1)" strokeWidth={0.8} />
          {Array.from({ length: 6 }).map((_, i) => {
            const tx = guitarBodyCX - 120 - (i % 3) * 6;
            const ty = guitarBodyCY - 12 + Math.floor(i / 3) * 16;
            return <circle key={`tuner-${i}`} cx={tx} cy={ty} r={1.6} fill="rgba(180, 160, 120, 0.85)" />;
          })}
        </g>

        {/* Spotlight halo on Bob */}
        <circle cx={bobX} cy={bobBaseY - 80} r={150 * (0.85 + spotWarmth * 0.3) * strumPulse}
          fill="url(#bw-halo)" style={{ mixBlendMode: "screen" }} />

        {/* Onset flash on guitar body */}
        {flashHit > 0 && (
          <ellipse cx={guitarBodyCX} cy={guitarBodyCY} rx={60} ry={42}
            fill={tintCore} opacity={flashHit * 0.45} style={{ mixBlendMode: "screen" }} />
        )}

        {/* Audience silhouettes */}
        <g>{audienceNodes}</g>
        <g>{handNodes}</g>

        {/* Dust motes */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes}</g>

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#bw-vig)" />
      </svg>
    </div>
  );
};
