/**
 * DrumCircle — Community drum circle with seated figures around a central energy mandala.
 * Layer 6, reacts to stemDrumOnset/drumBeat. 7 seated silhouettes in a circle,
 * each with distinct hand drum types (djembe, conga, bongos). Hands alternate on beat.
 * Central mandala pulses with drumBeat, radiating energy rings on hits.
 * Ripple waves from each drummer on hits. Connection arcs show rhythmic interplay.
 *
 * NOT DrummersDuo (Bill & Mickey). This is the community — people sitting
 * cross-legged around a circle playing hand drums together.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FADE_IN = 60;
const NUM_DRUMMERS = 7;
const MAX_RIPPLES = 12;
const RIPPLE_LIFE = 55;
const MANDALA_PETALS = 12;
const MAX_ENERGY_RINGS = 5;
const ENERGY_RING_LIFE = 40;

type DrumType = "djembe" | "conga" | "bongos";

interface Drummer {
  angle: number; radiusJitter: number; scale: number;
  handPhase: number; drumType: DrumType; bobPhase: number; seatStyle: 0 | 1;
}

interface Ripple { birthFrame: number; drummerIdx: number; intensity: number; }
interface Ring { birthFrame: number; intensity: number; }

const hsl = (h: number, s: number, l: number, a = 1) =>
  `hsla(${h}, ${s}%, ${l}%, ${a})`;

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

function genDrummers(seed: number): Drummer[] {
  const rng = seeded(seed);
  const types: DrumType[] = [
    "djembe", "conga", "bongos", "djembe", "conga", "djembe", "bongos",
  ];
  return Array.from({ length: NUM_DRUMMERS }, (_, i) => ({
    angle: (i / NUM_DRUMMERS) * Math.PI * 2 - Math.PI / 2 + (rng() - 0.5) * 0.15,
    radiusJitter: (rng() - 0.5) * 8,
    scale: 0.88 + rng() * 0.24,
    handPhase: rng() * Math.PI * 2,
    drumType: types[i],
    bobPhase: rng() * Math.PI * 2,
    seatStyle: rng() > 0.55 ? 1 : 0,
  }));
}

function drawDrum(
  type: DrumType, s: number,
  h: number, sat: number, lit: number, bp: number,
): React.ReactNode {
  const glow = 0.15 + bp * 0.15;

  if (type === "djembe") {
    // Tall goblet-shaped hand drum
    const w = 14 * s, ht = 22 * s;
    return (
      <g>
        <path
          d={`M ${-w / 2},0 Q ${-w / 2 - 2 * s},${ht * 0.4} ${-w * 0.3},${ht}
              L ${w * 0.3},${ht} Q ${w / 2 + 2 * s},${ht * 0.4} ${w / 2},0 Z`}
          fill={hsl(h - 5, sat - 20, 18, 0.85)}
          stroke={hsl(h, sat, lit, glow)}
          strokeWidth={0.6}
        />
        <ellipse cx={0} cy={0} rx={w / 2} ry={3.5 * s}
          fill={hsl(h + 10, sat - 30, 28, 0.7 + bp * 0.2)}
          stroke={hsl(h, sat, lit + 10, glow + 0.1)} strokeWidth={0.5} />
      </g>
    );
  }

  if (type === "conga") {
    // Barrel-shaped drum with tuning rings
    const w = 12 * s, ht = 20 * s;
    return (
      <g>
        <path
          d={`M ${-w / 2},0 Q ${-w / 2 - 1.5 * s},${ht * 0.5} ${-w / 2},${ht}
              L ${w / 2},${ht} Q ${w / 2 + 1.5 * s},${ht * 0.5} ${w / 2},0 Z`}
          fill={hsl(h + 5, sat - 25, 15, 0.85)}
          stroke={hsl(h, sat, lit, glow)}
          strokeWidth={0.5}
        />
        <ellipse cx={0} cy={0} rx={w / 2} ry={3 * s}
          fill={hsl(h + 15, sat - 35, 30, 0.65 + bp * 0.2)}
          stroke={hsl(h, sat, lit + 10, glow + 0.1)} strokeWidth={0.4} />
        {/* Tuning rings */}
        <ellipse cx={0} cy={ht * 0.3} rx={w / 2 + 0.5 * s} ry={2 * s}
          fill="none" stroke={hsl(h, sat - 10, lit - 10, 0.12)} strokeWidth={0.4} />
        <ellipse cx={0} cy={ht * 0.65} rx={w / 2 + 0.3 * s} ry={2 * s}
          fill="none" stroke={hsl(h, sat - 10, lit - 10, 0.1)} strokeWidth={0.4} />
      </g>
    );
  }

  // Bongos — double small drums side by side
  const w = 7 * s, ht = 12 * s;
  return (
    <g>
      <rect x={-w - s} y={0} width={w} height={ht} rx={2 * s}
        fill={hsl(h - 8, sat - 18, 16, 0.85)}
        stroke={hsl(h, sat, lit, glow)} strokeWidth={0.4} />
      <ellipse cx={-w / 2 - s} cy={0} rx={w / 2} ry={2.5 * s}
        fill={hsl(h + 8, sat - 30, 26, 0.65 + bp * 0.2)}
        stroke={hsl(h, sat, lit + 10, glow + 0.1)} strokeWidth={0.4} />
      <rect x={s} y={s} width={w * 0.85} height={ht * 0.9} rx={2 * s}
        fill={hsl(h - 3, sat - 22, 14, 0.85)}
        stroke={hsl(h, sat, lit, glow)} strokeWidth={0.4} />
      <ellipse cx={s + w * 0.425} cy={s} rx={w * 0.425} ry={2 * s}
        fill={hsl(h + 12, sat - 28, 28, 0.6 + bp * 0.2)}
        stroke={hsl(h, sat, lit + 10, glow + 0.1)} strokeWidth={0.4} />
    </g>
  );
}

/** Render shoulder -> elbow -> hand reaching to drum */
function drawArm(
  side: -1 | 1,
  handUp: number,
  hitPunch: number,
  torsoW: number,
  shoulderY: number,
  torsoH: number,
  drumOX: number,
  drumOY: number,
  s: number,
  h: number,
): React.ReactNode {
  const shoulderX = side * (torsoW / 2 - 2 * s);
  const elbowX = shoulderX + side * 5 * s;
  const lift = handUp > 0
    ? -8 * s * handUp - hitPunch * 6 * s * (handUp > 0.5 ? 0 : 1)
    : 0;
  const handY = drumOY - 2 * s + lift;
  const elbowY = shoulderY + torsoH * 0.2 + lift * 0.3;
  const handX = drumOX + side * 3 * s;

  return (
    <g>
      {/* Upper arm */}
      <line x1={shoulderX} y1={shoulderY + 5 * s} x2={elbowX} y2={elbowY}
        stroke={hsl(h, 42, 10, 0.85)} strokeWidth={4.5 * s} strokeLinecap="round" />
      {/* Forearm */}
      <line x1={elbowX} y1={elbowY} x2={handX} y2={handY}
        stroke={hsl(h, 42, 10, 0.85)} strokeWidth={3.5 * s} strokeLinecap="round" />
      {/* Hand */}
      <circle cx={handX} cy={handY} r={2.5 * s} fill={hsl(h, 35, 14, 0.85)} />
    </g>
  );
}

interface Props { frames: EnhancedFrameData[]; }

export const DrumCircle: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tf = useTempoFactor();

  const { energy, drumOnset, drumBeat, beatDecay, chromaHue, bass, slowEnergy } = snap;

  const drummers = React.useMemo(() => genDrummers(42), []);
  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  /* ---- Collect ripple events from recent frames ---- */
  const ripples = React.useMemo(() => {
    const out: Ripple[] = [];
    const rng = seeded(7721 + Math.floor(idx / RIPPLE_LIFE));
    for (let f = Math.max(0, idx - RIPPLE_LIFE); f <= idx; f++) {
      const fd = frames[f];
      const onset = fd.stemDrumOnset ?? fd.onset;
      const beat = fd.stemDrumBeat ?? fd.beat;
      if (beat && onset > 0.12) {
        out.push({
          birthFrame: f,
          drummerIdx: Math.floor(rng() * NUM_DRUMMERS),
          intensity: onset,
        });
      }
    }
    return out.slice(-MAX_RIPPLES);
  }, [idx, frames]);

  /* ---- Collect energy ring events (central mandala bursts) ---- */
  const rings = React.useMemo(() => {
    const out: Ring[] = [];
    for (let f = Math.max(0, idx - ENERGY_RING_LIFE); f <= idx; f++) {
      const fd = frames[f];
      const onset = fd.stemDrumOnset ?? fd.onset;
      const beat = fd.stemDrumBeat ?? fd.beat;
      if (beat && onset > 0.2) {
        out.push({ birthFrame: f, intensity: onset });
      }
    }
    return out.slice(-MAX_ENERGY_RINGS);
  }, [idx, frames]);

  /* ---- Gate & opacity ---- */
  const gate = interpolate(energy, [0.03, 0.1], [0, 1], CLAMP);
  if (gate < 0.01) return null;

  const fade = interpolate(frame, [0, FADE_IN], [0, 1], {
    ...CLAMP, easing: Easing.out(Easing.cubic),
  });

  const baseOpacity = interpolate(energy, [0.04, 0.35], [0.18, 0.6], CLAMP);
  const masterOpacity = baseOpacity * gate * fade;
  if (masterOpacity < 0.01) return null;

  /* ---- Colors: warm amber/earth, chromaHue tinted ---- */
  const h = 30 + chromaHue * 0.08;
  const s = 72;
  const l = interpolate(energy, [0.05, 0.4], [38, 58], CLAMP);

  /* ---- Subtle flicker ---- */
  const flicker =
    0.9 + Math.sin(frame * 0.09 * tf + 1.7) * 0.05
        + Math.sin(frame * 0.23 * tf + 3.1) * 0.03;

  /* ---- Layout ---- */
  const cx = width * 0.5;
  const cy = height * 0.52;
  const R = Math.min(width, height) * 0.18;

  /* ---- Breathe with slow energy ---- */
  const breathe = interpolate(slowEnergy, [0.02, 0.25], [0.97, 1.03], CLAMP);

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity * flicker,
          mixBlendMode: "screen",
          transform: `scale(${breathe})`,
          transformOrigin: `${cx}px ${cy}px`,
          willChange: "transform, opacity",
        }}
      >
        <defs>
          <radialGradient id="dc-mandala-glow">
            <stop offset="0%" stopColor={hsl(h, s, l + 20, 0.35 + beatDecay * 0.25)} />
            <stop offset="40%" stopColor={hsl(h, s, l + 10, 0.15 + beatDecay * 0.1)} />
            <stop offset="100%" stopColor={hsl(h, s, l, 0)} />
          </radialGradient>
        </defs>

        {/* ========================================================== */}
        {/*  Connection arcs between drummers (rhythmic interplay)      */}
        {/* ========================================================== */}
        {drummers.map((d1, i) =>
          [(i + 1) % NUM_DRUMMERS, (i + 3) % NUM_DRUMMERS].map((j) => {
            const d2 = drummers[j];
            const x1 = cx + Math.cos(d1.angle) * (R + d1.radiusJitter);
            const y1 = cy + Math.sin(d1.angle) * (R + d1.radiusJitter) * 0.55;
            const x2 = cx + Math.cos(d2.angle) * (R + d2.radiusJitter);
            const y2 = cy + Math.sin(d2.angle) * (R + d2.radiusJitter) * 0.55;

            const phase = Math.sin(frame * 0.04 * tf + i * 1.1 + j * 0.7);
            const arcAlpha = (0.04 + drumBeat * 0.12 + energy * 0.06) * (0.5 + phase * 0.5);
            if (arcAlpha < 0.01) return null;

            // Arc bows inward toward circle center
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            const toCenter = Math.atan2(cy - my, cx - mx);
            const bow = 20 + drumBeat * 15;
            const cpx = mx + Math.cos(toCenter) * bow;
            const cpy = my + Math.sin(toCenter) * bow;

            return (
              <path
                key={`arc-${i}-${j}`}
                d={`M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`}
                fill="none"
                stroke={hsl(h + 15, s - 10, l + 20, arcAlpha)}
                strokeWidth={0.8 + drumBeat * 0.6}
                style={{ filter: `blur(${1.5 + drumBeat}px)` }}
              />
            );
          }),
        )}

        {/* ========================================================== */}
        {/*  Central energy mandala                                     */}
        {/* ========================================================== */}
        <g>
          {/* Ambient radial glow */}
          <circle cx={cx} cy={cy} r={R * 0.45 + energy * 20} fill="url(#dc-mandala-glow)" />

          {/* Rotating mandala petals */}
          {Array.from({ length: MANDALA_PETALS }, (_, i) => {
            const angle = (i / MANDALA_PETALS) * Math.PI * 2 + frame * 0.008 * tf;
            const petalR = 18 + beatDecay * 25 + energy * 15;
            const petalW = 6 + beatDecay * 4;
            const px = cx + Math.cos(angle) * petalR;
            const py = cy + Math.sin(angle) * petalR * 0.55;
            const alpha = 0.08 + beatDecay * 0.2 + drumOnset * 0.15;

            return (
              <ellipse
                key={`petal-${i}`}
                cx={px} cy={py}
                rx={petalW} ry={petalW * 0.4}
                transform={`rotate(${(angle * 180) / Math.PI}, ${px}, ${py})`}
                fill={hsl(h + (i % 3) * 12, s, l + 15, alpha)}
                style={{ filter: `blur(${2 + beatDecay * 2}px)` }}
              />
            );
          })}

          {/* Inner core — bright flash on beat */}
          <circle cx={cx} cy={cy} r={8 + beatDecay * 12}
            fill={hsl(h + 5, s + 10, l + 25, 0.1 + beatDecay * 0.35)}
            style={{ filter: `blur(${4 + beatDecay * 4}px)` }} />

          {/* Dashed sacred-geometry rings */}
          <circle cx={cx} cy={cy} r={22 + energy * 10} fill="none"
            stroke={hsl(h, s, l + 10, 0.08 + beatDecay * 0.12)} strokeWidth={0.8}
            strokeDasharray={`${3 + beatDecay * 4} 5`} style={{ filter: "blur(1px)" }} />
          <circle cx={cx} cy={cy} r={35 + energy * 15} fill="none"
            stroke={hsl(h + 20, s - 15, l + 5, 0.05 + beatDecay * 0.08)} strokeWidth={0.5}
            strokeDasharray={`${2 + beatDecay * 3} 7`} style={{ filter: "blur(1.5px)" }} />
        </g>

        {/* ========================================================== */}
        {/*  Energy rings expanding from center on hits                 */}
        {/* ========================================================== */}
        {rings.map((ring, ri) => {
          const age = idx - ring.birthFrame;
          if (age < 0 || age > ENERGY_RING_LIFE) return null;
          const p = age / ENERGY_RING_LIFE;
          const radius = p * (R * 1.2 + ring.intensity * 40);
          const alpha = interpolate(p, [0, 0.08, 0.5, 1], [0, 0.35, 0.12, 0], CLAMP) * ring.intensity;
          if (alpha < 0.01) return null;

          return (
            <circle
              key={`ering-${ri}-${ring.birthFrame}`}
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={hsl(h + 10, s, l + 15, alpha)}
              strokeWidth={2.5 * (1 - p * 0.7)}
              style={{ filter: `blur(${1 + p * 4}px)` }}
            />
          );
        })}

        {/* ========================================================== */}
        {/*  Ripple waves from individual drummers                      */}
        {/* ========================================================== */}
        {ripples.map((rp, ri) => {
          const age = idx - rp.birthFrame;
          if (age < 0 || age > RIPPLE_LIFE) return null;
          const p = age / RIPPLE_LIFE;

          const d = drummers[rp.drummerIdx];
          const dx = cx + Math.cos(d.angle) * (R + d.radiusJitter);
          const dy = cy + Math.sin(d.angle) * (R + d.radiusJitter) * 0.55;
          const rippleR = p * (35 + rp.intensity * 60);
          const alpha = interpolate(p, [0, 0.1, 0.6, 1], [0, 0.4, 0.15, 0], CLAMP) * rp.intensity;
          if (alpha < 0.01) return null;

          return (
            <g key={`rp-${ri}-${rp.birthFrame}`}>
              <circle cx={dx} cy={dy} r={rippleR} fill="none"
                stroke={hsl(h + 5, s, l + 12, alpha)} strokeWidth={2 * (1 - p * 0.5)}
                style={{ filter: `blur(${0.5 + p * 2.5}px)` }} />
              <circle cx={dx} cy={dy} r={rippleR * 0.55} fill="none"
                stroke={hsl(h + 15, s - 10, l + 20, alpha * 0.45)} strokeWidth={1.2 * (1 - p * 0.4)}
                style={{ filter: `blur(${0.3 + p * 1.5}px)` }} />
            </g>
          );
        })}

        {/* ========================================================== */}
        {/*  Seated drummer figures                                      */}
        {/* ========================================================== */}
        {drummers.map((d, di) => {
          const r = R + d.radiusJitter;
          const dx = cx + Math.cos(d.angle) * r;
          const dy = cy + Math.sin(d.angle) * r * 0.55; // perspective compression
          const sc = d.scale;

          // Facing direction: toward center of circle
          const facingDir = Math.cos(Math.atan2(cy - dy, cx - dx)) > 0 ? 1 : -1;

          // Head bob driven by beat
          const bob = Math.sin(frame * 0.12 * tf + d.bobPhase)
            * (2.5 + drumBeat * 4) * energy;

          // Hand alternation: each drummer has unique phase
          const handCycle = frame * 0.1 * tf + d.handPhase;
          const leftUp = Math.sin(handCycle);
          const rightUp = Math.sin(handCycle + Math.PI);
          const punch = drumOnset * 0.8;

          // Figure dimensions
          const headR = 9 * sc;
          const tH = 28 * sc;  // torso height
          const tW = 24 * sc;  // torso width
          const shY = -tH * 0.45; // shoulder Y
          const hipY = tH * 0.15;

          // Drum position: between crossed legs
          const drumX = (facingDir as number) * 2 * sc;
          const drumY = hipY - 2 * sc;

          // Per-figure warm glow
          const figGlow = 0.04 + drumBeat * 0.06 + energy * 0.03;

          return (
            <g key={`d-${di}`} transform={`translate(${dx}, ${dy})`}>
              {/* Background warmth glow */}
              <circle cx={0} cy={shY} r={35 * sc + energy * 15}
                fill={hsl(h, s - 20, l - 5, figGlow)}
                style={{ filter: `blur(${10 + energy * 5}px)` }} />

              {/* Seated legs */}
              {d.seatStyle === 0 ? (
                <g>
                  {/* Cross-legged: left folded under, right folded over */}
                  <path
                    d={`M ${-tW * 0.3} ${hipY}
                        Q ${-tW * 0.55} ${hipY + 8 * sc} ${-tW * 0.35} ${hipY + 14 * sc}
                        Q ${-tW * 0.1} ${hipY + 18 * sc} ${tW * 0.05} ${hipY + 10 * sc}
                        L ${-tW * 0.05} ${hipY}`}
                    fill={hsl(h, 40, 9, 0.88)} />
                  <path
                    d={`M ${tW * 0.3} ${hipY}
                        Q ${tW * 0.55} ${hipY + 6 * sc} ${tW * 0.4} ${hipY + 13 * sc}
                        Q ${tW * 0.15} ${hipY + 17 * sc} ${-tW * 0.05} ${hipY + 10 * sc}
                        L ${tW * 0.05} ${hipY}`}
                    fill={hsl(h, 40, 7, 0.88)} />
                </g>
              ) : (
                <g>
                  {/* Knees-up cushion: knees visible, feet tucked */}
                  <path
                    d={`M ${-tW * 0.25} ${hipY}
                        L ${-tW * 0.4} ${hipY + 4 * sc}
                        Q ${-tW * 0.45} ${hipY - 6 * sc} ${-tW * 0.25} ${hipY - 8 * sc}
                        Q ${-tW * 0.1} ${hipY - 2 * sc} ${-tW * 0.1} ${hipY}`}
                    fill={hsl(h, 40, 9, 0.88)} />
                  <path
                    d={`M ${tW * 0.25} ${hipY}
                        L ${tW * 0.4} ${hipY + 4 * sc}
                        Q ${tW * 0.45} ${hipY - 5 * sc} ${tW * 0.25} ${hipY - 7 * sc}
                        Q ${tW * 0.1} ${hipY - sc} ${tW * 0.1} ${hipY}`}
                    fill={hsl(h, 40, 7, 0.88)} />
                </g>
              )}

              {/* Drum (between legs) */}
              <g transform={`translate(${drumX}, ${drumY})`}>
                {drawDrum(d.drumType, sc, h, s, l, beatDecay)}
              </g>

              {/* Torso — slightly leaning forward */}
              <path
                d={`M ${-tW / 2} ${shY + 3 * sc}
                    Q ${-tW / 2 - sc} ${shY} ${-tW * 0.35} ${shY}
                    L ${tW * 0.35} ${shY}
                    Q ${tW / 2 + sc} ${shY} ${tW / 2} ${shY + 3 * sc}
                    L ${tW * 0.28} ${hipY}
                    L ${-tW * 0.28} ${hipY} Z`}
                fill={hsl(h, 42, 9, 0.9)}
                stroke={hsl(h, s, l, 0.08)}
                strokeWidth={0.4} />

              {/* Neck */}
              <rect x={-3 * sc} y={shY - 5 * sc} width={6 * sc} height={6 * sc}
                fill={hsl(h, 42, 10, 0.9)} />

              {/* Head with rhythmic bob */}
              <circle cx={0} cy={shY - headR - 5 * sc + bob} r={headR}
                fill={hsl(h, 42, 10, 0.9)}
                stroke={hsl(h, s, l, 0.12)} strokeWidth={0.5} />

              {/* Rim light on head */}
              <circle cx={0} cy={shY - headR - 5 * sc + bob} r={headR + 1.2}
                fill="none"
                stroke={hsl(h, s, l + 10, 0.1 + drumBeat * 0.08)}
                strokeWidth={1}
                style={{ filter: "blur(1.5px)" }} />

              {/* Arms: left hand and right hand alternate on/off drum */}
              {drawArm(-1, leftUp, punch, tW, shY, tH, drumX, drumY, sc, h)}
              {drawArm(1, rightUp, punch, tW, shY, tH, drumX, drumY, sc, h)}
            </g>
          );
        })}

        {/* ========================================================== */}
        {/*  Ambient ground glow under the circle                       */}
        {/* ========================================================== */}
        <ellipse
          cx={cx} cy={cy + R * 0.35}
          rx={R * 1.1} ry={R * 0.2}
          fill={hsl(h, s - 25, l - 15, 0.06 + energy * 0.04)}
          style={{ filter: `blur(${12 + energy * 6}px)` }}
        />

        {/* ========================================================== */}
        {/*  Floating energy motes orbiting between players             */}
        {/* ========================================================== */}
        {Array.from({ length: 10 }, (_, i) => {
          const moteAngle = (i / 10) * Math.PI * 2 + frame * 0.006 * tf;
          const moteR = R * (0.35 + 0.25 * Math.sin(frame * 0.015 * tf + i * 1.4));
          const mx = cx + Math.cos(moteAngle) * moteR;
          const my = cy + Math.sin(moteAngle) * moteR * 0.5;
          const alpha =
            (0.03 + energy * 0.08 + drumBeat * 0.06)
            * (0.5 + 0.5 * Math.sin(frame * 0.05 + i * 2.1));
          if (alpha < 0.01) return null;

          return (
            <circle
              key={`mote-${i}`}
              cx={mx} cy={my}
              r={1.5 + bass * 2}
              fill={hsl(h + i * 8, s, l + 20, alpha)}
              style={{ filter: `blur(${2 + energy * 2}px)` }}
            />
          );
        })}
      </svg>
    </div>
  );
};
