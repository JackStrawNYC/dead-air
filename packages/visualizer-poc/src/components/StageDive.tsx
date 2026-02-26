/**
 * StageDive — Stylized figure arcing through air on energy peaks.
 * When energy spikes above threshold, a stick-figure silhouette launches from
 * one side of the frame in a parabolic arc. Below, a row of upraised hands
 * (the crowd catching). Figure is dark with neon outline. Hands wave with
 * energy. Max 2 concurrent divers. Deterministic spawn on energy peaks.
 * Cycle: every 70s (2100 frames) for 18s (540 frames).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DiverData {
  startX: number;
  vx: number;
  vy: number;
  scale: number;
  glowHue: number;
  lifetime: number;
  fromLeft: boolean;
}

interface DiverEvent {
  frame: number;
  diver: DiverData;
}

interface HandData {
  x: number;
  waveFreq: number;
  wavePhase: number;
  height: number;
  hue: number;
}

const CHECK_INTERVAL = 15;
const RMS_THRESHOLD = 0.28;
const MAX_CONCURRENT = 2;
const GRAVITY = 0.06;
const DIVER_LIFETIME = 90;

// Cycle: every 70s (2100 frames) for 18s (540 frames)
const CYCLE_PERIOD = 2100;
const SHOW_DURATION = 540;
const FADE_FRAMES = 45;

const NUM_HANDS = 18;

function generateHands(seed: number): HandData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_HANDS }, () => ({
    x: 0.05 + rng() * 0.9,
    waveFreq: 0.03 + rng() * 0.05,
    wavePhase: rng() * Math.PI * 2,
    height: 20 + rng() * 25,
    hue: rng() * 360,
  }));
}

function precomputeDivers(
  frames: EnhancedFrameData[],
  masterSeed: number,
): DiverEvent[] {
  const rng = seeded(masterSeed);
  const events: DiverEvent[] = [];

  for (let f = 0; f < frames.length; f += CHECK_INTERVAL) {
    const cyclePos = f % CYCLE_PERIOD;
    if (cyclePos >= SHOW_DURATION) continue;

    if (frames[f].rms > RMS_THRESHOLD) {
      const active = events.filter((e) => f - e.frame < DIVER_LIFETIME);
      if (active.length >= MAX_CONCURRENT) continue;

      const fromLeft = rng() > 0.5;
      events.push({
        frame: f,
        diver: {
          startX: fromLeft ? 0.05 : 0.95,
          vx: fromLeft ? 3 + rng() * 3 : -(3 + rng() * 3),
          vy: -(5 + rng() * 4),
          scale: 0.8 + rng() * 0.4,
          glowHue: rng() * 360,
          lifetime: DIVER_LIFETIME,
          fromLeft,
        },
      });
    }
  }

  return events;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const StageDive: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const diverEvents = React.useMemo(
    () => precomputeDivers(frames, (ctx?.showSeed ?? 19770508)),
    [frames, ctx?.showSeed],
  );

  const hands = React.useMemo(() => generateHands(19770509), []);

  // Cycle fade
  const cyclePos = frame % CYCLE_PERIOD;
  const inShowWindow = cyclePos < SHOW_DURATION;

  const showFadeIn = interpolate(cyclePos, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const showFadeOut = interpolate(
    cyclePos,
    [SHOW_DURATION - FADE_FRAMES, SHOW_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) },
  );
  const showEnvelope = Math.min(showFadeIn, showFadeOut);
  const cycleOpacity = inShowWindow ? showEnvelope : 0;

  // Active divers
  const activeDivers = diverEvents.filter(
    (e) => frame >= e.frame && frame < e.frame + e.diver.lifetime,
  );

  // Show hands whenever in show window with energy
  const handOpacity = interpolate(energy, [0.08, 0.2], [0.2, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (cycleOpacity < 0.01) return null;
  if (activeDivers.length === 0 && handOpacity < 0.05) return null;

  const baseY = height * 0.82;

  // Hand wave intensity from energy
  const waveIntensity = interpolate(energy, [0.1, 0.4], [3, 15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: cycleOpacity }}>
        {/* Crowd hands along bottom */}
        {hands.map((hand, i) => {
          const hx = hand.x * width;
          const wave = Math.sin(frame * hand.waveFreq + hand.wavePhase) * waveIntensity;
          const handY = baseY + 15;
          const tipY = handY - hand.height - wave;
          const glowColor = `hsla(${hand.hue}, 70%, 55%, ${handOpacity * 0.6})`;

          return (
            <g key={`hand-${i}`}>
              {/* Arm */}
              <line
                x1={hx}
                y1={handY + 30}
                x2={hx + wave * 0.3}
                y2={tipY}
                stroke="rgba(10, 10, 15, 0.7)"
                strokeWidth={4}
                strokeLinecap="round"
              />
              {/* Hand (open palm) */}
              <circle
                cx={hx + wave * 0.3}
                cy={tipY}
                r={5}
                fill="rgba(10, 10, 15, 0.7)"
                stroke={glowColor}
                strokeWidth={0.8}
              />
              {/* Fingers (3 small lines) */}
              <line x1={hx + wave * 0.3 - 3} y1={tipY} x2={hx + wave * 0.3 - 5} y2={tipY - 6} stroke={glowColor} strokeWidth={1} strokeLinecap="round" />
              <line x1={hx + wave * 0.3} y1={tipY - 2} x2={hx + wave * 0.3} y2={tipY - 9} stroke={glowColor} strokeWidth={1} strokeLinecap="round" />
              <line x1={hx + wave * 0.3 + 3} y1={tipY} x2={hx + wave * 0.3 + 5} y2={tipY - 6} stroke={glowColor} strokeWidth={1} strokeLinecap="round" />
            </g>
          );
        })}

        {/* Divers */}
        {activeDivers.map((event, di) => {
          const age = frame - event.frame;
          const diver = event.diver;

          // Position
          const px = diver.startX * width + diver.vx * age;
          const py = baseY - 40 + diver.vy * age + 0.5 * GRAVITY * age * age;

          // Rotation (body tilts forward in arc)
          const bodyAngle = Math.atan2(
            diver.vy + GRAVITY * age,
            diver.vx,
          ) * (180 / Math.PI);

          // Fade
          const lifeProgress = age / diver.lifetime;
          const alpha = interpolate(lifeProgress, [0, 0.1, 0.7, 1], [0.3, 1, 0.8, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          if (alpha < 0.02) return null;

          const s = diver.scale;
          const glowColor = `hsla(${diver.glowHue}, 80%, 60%, ${alpha * 0.7})`;
          const bodyColor = `rgba(10, 10, 15, ${alpha * 0.9})`;

          return (
            <g
              key={`diver-${event.frame}-${di}`}
              transform={`translate(${px}, ${py}) rotate(${bodyAngle + (diver.fromLeft ? -20 : 200)}) scale(${s})`}
            >
              {/* Head */}
              <circle cx={0} cy={-25} r={7} fill={bodyColor} stroke={glowColor} strokeWidth={1.5} />
              {/* Torso */}
              <line x1={0} y1={-18} x2={0} y2={5} stroke={bodyColor} strokeWidth={5} />
              <line x1={0} y1={-18} x2={0} y2={5} stroke={glowColor} strokeWidth={1.5} />
              {/* Arms (spread out, superman pose) */}
              <line x1={0} y1={-14} x2={-18} y2={-8} stroke={bodyColor} strokeWidth={4} strokeLinecap="round" />
              <line x1={0} y1={-14} x2={-18} y2={-8} stroke={glowColor} strokeWidth={1} strokeLinecap="round" />
              <line x1={0} y1={-14} x2={18} y2={-8} stroke={bodyColor} strokeWidth={4} strokeLinecap="round" />
              <line x1={0} y1={-14} x2={18} y2={-8} stroke={glowColor} strokeWidth={1} strokeLinecap="round" />
              {/* Legs */}
              <line x1={0} y1={5} x2={-10} y2={20} stroke={bodyColor} strokeWidth={4} strokeLinecap="round" />
              <line x1={0} y1={5} x2={-10} y2={20} stroke={glowColor} strokeWidth={1} strokeLinecap="round" />
              <line x1={0} y1={5} x2={10} y2={20} stroke={bodyColor} strokeWidth={4} strokeLinecap="round" />
              <line x1={0} y1={5} x2={10} y2={20} stroke={glowColor} strokeWidth={1} strokeLinecap="round" />
              {/* Glow aura */}
              <circle cx={0} cy={-5} r={25} fill={`hsla(${diver.glowHue}, 80%, 60%, ${alpha * 0.1})`} style={{ filter: `blur(8px)` }} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
