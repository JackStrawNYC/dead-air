/**
 * MusicalNotation — Sheet music exploding into flying notes.
 *
 * For "Playing In The Band" — the iconic Dead jam vehicle. Aged cream sheet
 * music in the foreground bears a treble+bass staff, clefs, key/time
 * signatures and a few measures. Quarter, eighth, beamed, sixteenth, half,
 * whole notes, sharps, flats, and treble clefs lift off and tumble outward
 * across the entire frame on Lissajous-like flight paths, each rotating and
 * trailing fading copies, haloed in warm gold/amber tinted by chromaHue.
 *
 * Audio: energy → count + glow; beatDecay/onset → bursts; musicalTime → spawn
 * rate; tempoFactor → flight speed; mids → saturation. Cycle: 60s, 18s on.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE = 1800;
const DURATION = 540;
const MAX_NOTES = 50;
const MIN_NOTES = 30;
const TRAIL_LENGTH = 5;

type GlyphKind =
  | "quarter" | "eighth" | "beamed" | "sixteenth"
  | "half" | "whole" | "sharp" | "flat" | "treble";

interface FlyingNote {
  kind: GlyphKind;
  birthOffset: number;
  spawnX: number; spawnY: number;
  ax: number; ay: number;
  fx: number; fy: number;
  phase: number;
  driftX: number; driftY: number;
  rotSpeed: number; rotPhase: number;
  lifeFrames: number;
  scale: number;
  hueJitter: number;
}

const KIND_POOL: GlyphKind[] = [
  "quarter", "quarter", "eighth", "eighth", "beamed", "beamed",
  "sixteenth", "half", "whole", "sharp", "flat", "treble",
];

function makeNotes(seed: number): FlyingNote[] {
  const rng = seeded(seed);
  return Array.from({ length: MAX_NOTES }, (): FlyingNote => ({
    kind: KIND_POOL[Math.floor(rng() * KIND_POOL.length)],
    birthOffset: rng(),
    spawnX: -120 + rng() * 240,
    spawnY: -60 + rng() * 120,
    ax: 80 + rng() * 220,
    ay: 60 + rng() * 180,
    fx: 0.4 + rng() * 1.6,
    fy: 0.5 + rng() * 1.7,
    phase: rng() * Math.PI * 2,
    driftX: -1 + rng() * 2,
    driftY: -1.6 + rng() * 0.6,
    rotSpeed: -0.04 + rng() * 0.08,
    rotPhase: rng() * Math.PI * 2,
    lifeFrames: 90 + Math.floor(rng() * 110),
    scale: 0.7 + rng() * 0.9,
    hueJitter: -18 + rng() * 36,
  }));
}

interface Props { frames: EnhancedFrameData[] }

export const MusicalNotation: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const cycleIdx = Math.floor(frame / CYCLE);
  const notes = React.useMemo(
    () => makeNotes(cycleIdx * 9173 + 271828),
    [cycleIdx],
  );

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.07], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.55 + snap.energy * 0.35);
  if (masterOpacity < 0.01) return null;

  const noteCount = Math.round(
    interpolate(snap.energy, [0.04, 0.32], [MIN_NOTES, MAX_NOTES], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    }),
  );
  const burstBoost = snap.beatDecay * 0.45 + snap.onsetEnvelope * 0.35;
  const flightSpeed = (0.85 + tempoFactor * 0.55) * (1 + snap.energy * 0.6);
  const baseHue = (38 + snap.chromaHue * 0.18) % 360;
  const saturation = 70 + snap.mids * 45;
  const glowStrength = 0.55 + snap.energy * 0.7 + snap.beatDecay * 0.25;
  const spawnRate = 0.7 + (snap.musicalTime % 1) * 0.6 + snap.onsetEnvelope * 0.8;

  // Page geometry
  const pageW = Math.min(width * 0.55, 1100);
  const pageH = Math.min(height * 0.42, 540);
  const pageCx = width * 0.5;
  const pageCy = height * 0.52;
  const pageLeft = pageCx - pageW / 2;
  const pageTop = pageCy - pageH / 2;
  const trebleY = pageTop + pageH * 0.32;
  const bassY = pageTop + pageH * 0.66;
  const staffSpacing = 9;
  const staffMargin = 60;
  const staffStart = pageLeft + staffMargin;
  const staffEnd = pageLeft + pageW - staffMargin;
  const extLeft = -200;
  const extRight = width + 200;

  // Build staff lines (on-page solid + extended faint to suggest infinite music)
  const staffLines: React.ReactNode[] = [];
  const extLines: React.ReactNode[] = [];
  for (let s = 0; s < 5; s++) {
    const ty = trebleY + s * staffSpacing;
    const by = bassY + s * staffSpacing;
    staffLines.push(
      <line key={`tl-${s}`} x1={staffStart} y1={ty} x2={staffEnd} y2={ty} stroke="rgba(70, 50, 30, 0.75)" strokeWidth={1.1} />,
      <line key={`bl-${s}`} x1={staffStart} y1={by} x2={staffEnd} y2={by} stroke="rgba(70, 50, 30, 0.75)" strokeWidth={1.1} />,
    );
    const extColor = `hsla(${baseHue}, 60%, 55%, 0.18)`;
    extLines.push(
      <line key={`xtl-l-${s}`} x1={extLeft} y1={ty} x2={staffStart} y2={ty} stroke={extColor} strokeWidth={0.8} />,
      <line key={`xtl-r-${s}`} x1={staffEnd} y1={ty} x2={extRight} y2={ty} stroke={extColor} strokeWidth={0.8} />,
      <line key={`xbl-l-${s}`} x1={extLeft} y1={by} x2={staffStart} y2={by} stroke={extColor} strokeWidth={0.8} />,
      <line key={`xbl-r-${s}`} x1={staffEnd} y1={by} x2={extRight} y2={by} stroke={extColor} strokeWidth={0.8} />,
    );
  }

  const barLines: React.ReactNode[] = [];
  for (let m = 0; m <= 4; m++) {
    const bx = staffStart + ((staffEnd - staffStart) / 4) * m;
    const sw = m === 0 || m === 4 ? 1.6 : 0.9;
    barLines.push(
      <line key={`bt-${m}`} x1={bx} y1={trebleY - 2} x2={bx} y2={trebleY + staffSpacing * 4 + 2} stroke="rgba(70, 50, 30, 0.7)" strokeWidth={sw} />,
      <line key={`bb-${m}`} x1={bx} y1={bassY - 2} x2={bx} y2={bassY + staffSpacing * 4 + 2} stroke="rgba(70, 50, 30, 0.7)" strokeWidth={sw} />,
    );
  }

  // Flying notes
  const flyingElems: React.ReactNode[] = [];
  for (let i = 0; i < noteCount; i++) {
    const n = notes[i];
    const t = (frame * 0.012 * flightSpeed * spawnRate + n.birthOffset) % 1;
    const localFrame = t * n.lifeFrames;
    const fadeInLife = Math.min(1, localFrame / 12);
    const fadeOutLife = 1 - Math.max(0, (localFrame - n.lifeFrames * 0.6) / (n.lifeFrames * 0.4));
    const lifeAlpha = Math.max(0, Math.min(fadeInLife, fadeOutLife));
    if (lifeAlpha < 0.02) continue;

    const tt = localFrame * 0.022 * flightSpeed;
    const fx = Math.sin(tt * n.fx + n.phase) * n.ax;
    const fy = Math.cos(tt * n.fy + n.phase * 0.7) * n.ay;
    const linX = n.driftX * localFrame * 0.9 * flightSpeed;
    const linY = n.driftY * localFrame * 1.1 * flightSpeed;
    const px = pageCx + n.spawnX + fx + linX;
    const py = pageCy + n.spawnY + fy + linY;
    if (px < -80 || px > width + 80 || py < -80 || py > height + 80) continue;

    const rotation = (n.rotPhase + localFrame * n.rotSpeed * (1 + burstBoost * 0.6)) * (180 / Math.PI);
    const dx = px - pageCx;
    const dy = py - pageCy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const proximity = Math.exp(-dist / 480);
    const noteGlow = (0.45 + proximity * 0.55) * glowStrength * lifeAlpha;
    const noteHue = (baseHue + n.hueJitter + 360) % 360;
    const fillColor = `hsl(${noteHue}, ${saturation}%, ${58 + proximity * 14}%)`;
    const haloColor = `hsla(${noteHue}, ${saturation}%, ${65 + proximity * 10}%, ${noteGlow})`;

    // Trail of fading copies
    const trail: React.ReactNode[] = [];
    for (let k = 1; k <= TRAIL_LENGTH; k++) {
      const tlocal = Math.max(0, localFrame - k * 3.2);
      const ttt = tlocal * 0.022 * flightSpeed;
      const tfx = Math.sin(ttt * n.fx + n.phase) * n.ax;
      const tfy = Math.cos(ttt * n.fy + n.phase * 0.7) * n.ay;
      const tlinX = n.driftX * tlocal * 0.9 * flightSpeed;
      const tlinY = n.driftY * tlocal * 1.1 * flightSpeed;
      const tx = pageCx + n.spawnX + tfx + tlinX;
      const ty = pageCy + n.spawnY + tfy + tlinY;
      const trailA = lifeAlpha * (1 - k * 0.16);
      if (trailA <= 0.02) continue;
      trail.push(
        <circle key={`tr-${i}-${k}`} cx={tx} cy={ty}
          r={3.4 * n.scale * (1 - k * 0.13)}
          fill={`hsla(${noteHue}, ${saturation}%, 65%, ${trailA * 0.45})`} />,
      );
    }

    flyingElems.push(
      <g key={`tg-${i}`}>{trail}</g>,
      <g key={`fn-${i}`}
        transform={`translate(${px}, ${py}) rotate(${rotation}) scale(${n.scale})`}
        opacity={lifeAlpha}>
        <circle cx={0} cy={0} r={16} fill={haloColor} style={{ filter: "blur(6px)" }} />
        {renderGlyph(n.kind, fillColor)}
      </g>,
    );
  }

  // Anchored notes still on the staff (some lifting)
  const anchorPositions: Array<{ x: number; y: number; kind: GlyphKind }> = [
    { x: staffStart + 70, y: trebleY + staffSpacing * 1, kind: "quarter" },
    { x: staffStart + 110, y: trebleY + staffSpacing * 2, kind: "eighth" },
    { x: staffStart + 150, y: trebleY + staffSpacing * 0, kind: "beamed" },
    { x: staffStart + 215, y: trebleY + staffSpacing * 3, kind: "quarter" },
    { x: staffStart + 260, y: trebleY + staffSpacing * 1.5, kind: "half" },
    { x: staffStart + 320, y: trebleY + staffSpacing * 2.5, kind: "sixteenth" },
    { x: staffStart + 380, y: bassY + staffSpacing * 2, kind: "whole" },
    { x: staffStart + 440, y: bassY + staffSpacing * 1, kind: "quarter" },
    { x: staffStart + 500, y: bassY + staffSpacing * 3, kind: "eighth" },
    { x: staffStart + 560, y: bassY + staffSpacing * 0.5, kind: "half" },
  ];
  const anchored = anchorPositions.map((a, ai) => {
    const liftAmt = (Math.sin(frame * 0.04 + ai * 1.3) + 1) * 0.5;
    const isLifting = ai % 3 === 0;
    const yOff = isLifting ? -liftAmt * 6 - snap.beatDecay * 8 : 0;
    const op = isLifting ? 0.7 + liftAmt * 0.25 : 0.95;
    return (
      <g key={`an-${ai}`} transform={`translate(${a.x}, ${a.y + yOff}) scale(0.9)`} opacity={op}>
        {renderGlyph(a.kind, "rgba(45, 30, 15, 0.92)")}
      </g>
    );
  });

  // Sparkles
  const sparkleCount = Math.round(20 + snap.energy * 30 + snap.beatDecay * 18);
  const sparkles: React.ReactNode[] = [];
  for (let s = 0; s < sparkleCount; s++) {
    const sp = (s * 137.508 + frame * 0.6) % 360;
    const r = 60 + ((s * 53) % 320) + Math.sin(frame * 0.03 + s) * 18;
    const sx = pageCx + Math.cos((sp * Math.PI) / 180) * r;
    const sy = pageCy + Math.sin((sp * Math.PI) / 180) * r * 0.78;
    const twinkle = (Math.sin(frame * 0.18 + s * 1.7) + 1) * 0.5;
    sparkles.push(
      <circle key={`sp-${s}`} cx={sx} cy={sy}
        r={1.1 + twinkle * 1.6}
        fill={`hsla(${baseHue}, 90%, 78%, ${0.35 + twinkle * 0.5})`} />,
    );
  }

  // Page texture mottling (deterministic)
  const texEls: React.ReactNode[] = [];
  for (let k = 0; k < 18; k++) {
    const r1 = ((k * 9301 + 49297) % 233280) / 233280;
    const r2 = ((k * 4391 + 17311) % 233280) / 233280;
    texEls.push(
      <ellipse key={`tx-${k}`}
        cx={pageLeft + r1 * pageW} cy={pageTop + r2 * pageH}
        rx={20 + r1 * 30} ry={12 + r2 * 22}
        fill={`rgba(180, 140, 80, ${0.04 + r1 * 0.05})`} />,
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 14px hsla(${baseHue}, 80%, 50%, ${0.25 + snap.energy * 0.25})) drop-shadow(0 0 32px hsla(${baseHue}, 70%, 40%, 0.18))`,
        }}>
        <defs>
          <radialGradient id="mn-page-grad" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#FBF1D7" />
            <stop offset="60%" stopColor="#F4E5BF" />
            <stop offset="100%" stopColor="#E6D4A2" />
          </radialGradient>
          <radialGradient id="mn-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`hsla(${baseHue}, 80%, 60%, 0.32)`} />
            <stop offset="60%" stopColor={`hsla(${baseHue}, 75%, 45%, 0.12)`} />
            <stop offset="100%" stopColor="hsla(40, 70%, 30%, 0)" />
          </radialGradient>
        </defs>

        {/* Atmospheric golden halo */}
        <ellipse cx={pageCx} cy={pageCy} rx={width * 0.55} ry={height * 0.5} fill="url(#mn-glow)" />

        {/* Extended infinite staff lines */}
        <g>{extLines}</g>

        {/* Page (shadow + body + texture) */}
        <rect x={pageLeft + 6} y={pageTop + 8} width={pageW} height={pageH} rx={6}
          fill="rgba(0, 0, 0, 0.28)" style={{ filter: "blur(8px)" }} />
        <rect x={pageLeft} y={pageTop} width={pageW} height={pageH} rx={4}
          fill="url(#mn-page-grad)" stroke="rgba(120, 90, 50, 0.55)" strokeWidth={1.4} />
        <g>{texEls}</g>

        {/* On-page staff + bars */}
        <g>{staffLines}</g>
        <g>{barLines}</g>

        {/* Treble clef */}
        <g transform={`translate(${staffStart - 22}, ${trebleY + staffSpacing * 2}) scale(1.55)`}>
          {renderGlyph("treble", "rgba(45, 30, 15, 0.92)")}
        </g>
        {/* Bass clef */}
        <g transform={`translate(${staffStart - 22}, ${bassY + staffSpacing * 1.2}) scale(1.4)`}>
          {renderBassClef("rgba(45, 30, 15, 0.92)")}
        </g>

        {/* Time signature 4/4 */}
        <g transform={`translate(${staffStart + 18}, ${trebleY + staffSpacing * 1.5})`}>
          <text fontFamily="serif" fontWeight="bold" fontSize={18} textAnchor="middle" fill="rgba(45, 30, 15, 0.92)">4</text>
          <text fontFamily="serif" fontWeight="bold" fontSize={18} textAnchor="middle" y={16} fill="rgba(45, 30, 15, 0.92)">4</text>
        </g>

        {/* Key signature — 2 sharps (D major) */}
        <g transform={`translate(${staffStart + 36}, ${trebleY})`}>
          <g transform="translate(0, 0) scale(0.55)">{renderGlyph("sharp", "rgba(45, 30, 15, 0.92)")}</g>
          <g transform="translate(8, 12) scale(0.55)">{renderGlyph("sharp", "rgba(45, 30, 15, 0.92)")}</g>
        </g>

        <g>{anchored}</g>
        <g>{flyingElems}</g>
        <g>{sparkles}</g>
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Glyph rendering                                                    */
/* ------------------------------------------------------------------ */

function renderGlyph(kind: GlyphKind, color: string): React.ReactNode {
  switch (kind) {
    case "quarter":
      return (
        <g>
          <ellipse cx={0} cy={0} rx={5.2} ry={3.8} fill={color} transform="rotate(-22)" />
          <line x1={4.8} y1={-1.5} x2={4.8} y2={-26} stroke={color} strokeWidth={1.4} />
        </g>
      );
    case "eighth":
      return (
        <g>
          <ellipse cx={0} cy={0} rx={5.2} ry={3.8} fill={color} transform="rotate(-22)" />
          <line x1={4.8} y1={-1.5} x2={4.8} y2={-28} stroke={color} strokeWidth={1.4} />
          <path d="M 4.8 -28 Q 14 -22 11 -12 Q 16 -20 6 -18" fill={color} stroke={color} strokeWidth={0.6} />
        </g>
      );
    case "beamed":
      return (
        <g>
          <ellipse cx={-7} cy={2} rx={5.2} ry={3.8} fill={color} transform="rotate(-22 -7 2)" />
          <ellipse cx={7} cy={-2} rx={5.2} ry={3.8} fill={color} transform="rotate(-22 7 -2)" />
          <line x1={-2.2} y1={0.5} x2={-2.2} y2={-24} stroke={color} strokeWidth={1.4} />
          <line x1={11.8} y1={-3.5} x2={11.8} y2={-26} stroke={color} strokeWidth={1.4} />
          <path d="M -2.2 -24 L 11.8 -26 L 11.8 -22 L -2.2 -20 Z" fill={color} />
        </g>
      );
    case "sixteenth":
      return (
        <g>
          <ellipse cx={0} cy={0} rx={5.2} ry={3.8} fill={color} transform="rotate(-22)" />
          <line x1={4.8} y1={-1.5} x2={4.8} y2={-30} stroke={color} strokeWidth={1.4} />
          <path d="M 4.8 -30 Q 14 -24 11 -14 Q 16 -22 6 -20" fill={color} stroke={color} strokeWidth={0.6} />
          <path d="M 4.8 -22 Q 14 -16 11 -6 Q 16 -14 6 -12" fill={color} stroke={color} strokeWidth={0.6} />
        </g>
      );
    case "half":
      return (
        <g>
          <ellipse cx={0} cy={0} rx={5.2} ry={3.8} fill="none" stroke={color} strokeWidth={1.6} transform="rotate(-22)" />
          <line x1={4.8} y1={-1.5} x2={4.8} y2={-26} stroke={color} strokeWidth={1.4} />
        </g>
      );
    case "whole":
      return <ellipse cx={0} cy={0} rx={5.6} ry={3.6} fill="none" stroke={color} strokeWidth={2} transform="rotate(-12)" />;
    case "sharp":
      return (
        <g>
          <line x1={-5} y1={-9} x2={-5} y2={11} stroke={color} strokeWidth={1.4} />
          <line x1={5} y1={-11} x2={5} y2={9} stroke={color} strokeWidth={1.4} />
          <line x1={-8} y1={-3} x2={8} y2={-6} stroke={color} strokeWidth={2.4} />
          <line x1={-8} y1={5} x2={8} y2={2} stroke={color} strokeWidth={2.4} />
        </g>
      );
    case "flat":
      return (
        <g>
          <line x1={-3} y1={-12} x2={-3} y2={10} stroke={color} strokeWidth={1.4} />
          <path d="M -3 10 Q 8 6 6 -2 Q 4 -8 -3 -2" fill={color} stroke={color} strokeWidth={0.8} />
        </g>
      );
    case "treble":
      return (
        <g>
          <path d="M 2 -20 C 8 -22 10 -14 4 -10 C -4 -6 -6 4 2 8 C 10 12 12 0 4 -2 C -2 -3 -2 6 4 8 C 10 10 8 18 2 18 C -2 18 -3 14 0 12" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <line x1={3} y1={-20} x2={3} y2={22} stroke={color} strokeWidth={1.2} />
          <circle cx={3} cy={22} r={1.8} fill={color} />
        </g>
      );
  }
}

function renderBassClef(color: string): React.ReactNode {
  return (
    <g>
      <path d="M -6 -8 C 4 -12 14 -6 12 4 C 10 14 -2 16 -8 10"
        fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <circle cx={14} cy={-3} r={1.6} fill={color} />
      <circle cx={14} cy={5} r={1.6} fill={color} />
    </g>
  );
}
