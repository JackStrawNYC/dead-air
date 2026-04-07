/**
 * HotAirBalloons — A+++ pastoral sunrise scene.
 *
 * 7 hot air balloons drift across a layered sunrise sky, each in its own depth
 * plane. Detailed envelopes with gores/seams, hanging baskets with passengers,
 * burner flames, ropes, and tasseled trim. Mountain range below, clouds above,
 * a distant valley stretching to the horizon. Birds wheel between the balloons.
 *
 * Audio reactivity:
 *   slowEnergy   → sky warmth + sun brightness
 *   energy       → balloon scale pulse + burner flame
 *   bass         → cloud churn
 *   beatDecay    → burner flicker
 *   onsetEnvelope→ burner flare burst (ALL balloons)
 *   chromaHue    → sky/balloon palette tint
 *   tempoFactor  → drift speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

interface BalloonData {
  bx: number;        // base x as fraction
  by: number;        // base y as fraction
  scale: number;     // depth scale 0.4-1.0
  driftRate: number;
  hueA: number;
  hueB: number;
  pattern: "stripe" | "diamond" | "swirl" | "triangle";
  passengers: number;
  bobPhase: number;
}

interface CloudData {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  drift: number;
  shade: number;
}

interface BirdData {
  cx: number;
  cy: number;
  radius: number;
  speed: number;
  size: number;
  phase: number;
}

interface MountainPoint {
  x: number;
  y: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const HotAirBalloons: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const balloons = React.useMemo<BalloonData[]>(() => {
    const rng = seeded(73_022_991);
    const layout: BalloonData[] = [
      { bx: 0.18, by: 0.30, scale: 0.95, driftRate: 0.00012, hueA: 12,  hueB: 48,  pattern: "stripe",   passengers: 3, bobPhase: rng() * Math.PI * 2 },
      { bx: 0.50, by: 0.20, scale: 1.05, driftRate: 0.00009, hueA: 280, hueB: 200, pattern: "swirl",    passengers: 4, bobPhase: rng() * Math.PI * 2 },
      { bx: 0.78, by: 0.32, scale: 0.85, driftRate: 0.00014, hueA: 340, hueB: 30,  pattern: "diamond",  passengers: 2, bobPhase: rng() * Math.PI * 2 },
      { bx: 0.34, by: 0.46, scale: 0.65, driftRate: 0.00018, hueA: 110, hueB: 50,  pattern: "triangle", passengers: 2, bobPhase: rng() * Math.PI * 2 },
      { bx: 0.62, by: 0.50, scale: 0.55, driftRate: 0.00020, hueA: 45,  hueB: 200, pattern: "stripe",   passengers: 3, bobPhase: rng() * Math.PI * 2 },
      { bx: 0.10, by: 0.55, scale: 0.45, driftRate: 0.00024, hueA: 180, hueB: 320, pattern: "swirl",    passengers: 1, bobPhase: rng() * Math.PI * 2 },
      { bx: 0.88, by: 0.58, scale: 0.40, driftRate: 0.00026, hueA: 22,  hueB: 280, pattern: "diamond",  passengers: 2, bobPhase: rng() * Math.PI * 2 },
    ];
    return layout;
  }, []);

  const clouds = React.useMemo<CloudData[]>(() => {
    const rng = seeded(48_811_207);
    return Array.from({ length: 11 }, () => ({
      cx: rng(),
      cy: 0.05 + rng() * 0.40,
      rx: 0.10 + rng() * 0.16,
      ry: 0.03 + rng() * 0.05,
      drift: 0.00006 + rng() * 0.00018,
      shade: 0.6 + rng() * 0.35,
    }));
  }, []);

  const birds = React.useMemo<BirdData[]>(() => {
    const rng = seeded(21_998_443);
    return Array.from({ length: 9 }, () => ({
      cx: 0.1 + rng() * 0.8,
      cy: 0.2 + rng() * 0.4,
      radius: 0.04 + rng() * 0.06,
      speed: 0.0014 + rng() * 0.002,
      size: 5 + rng() * 4,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  const mountainsBack = React.useMemo<MountainPoint[]>(() => {
    const rng = seeded(11_445_667);
    return Array.from({ length: 18 }, (_, i) => ({
      x: i / 17,
      y: 0.62 - (Math.sin(i * 0.7) * 0.04 + rng() * 0.04),
    }));
  }, []);

  const mountainsFront = React.useMemo<MountainPoint[]>(() => {
    const rng = seeded(99_445_667);
    return Array.from({ length: 22 }, (_, i) => ({
      x: i / 21,
      y: 0.74 - (Math.sin(i * 1.1) * 0.05 + rng() * 0.05),
    }));
  }, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const energy = snap.energy;
  const bass = snap.bass;
  const slowEnergy = snap.slowEnergy;
  const beatDecay = snap.beatDecay;
  const onsetEnv = snap.onsetEnvelope;
  const chromaHue = snap.chromaHue;

  const sunBright = 0.55 + slowEnergy * 0.45;
  const burnerIntensity = 0.6 + energy * 0.4 + beatDecay * 0.4 + onsetEnv * 0.4;

  const baseHue = 22;
  const tintHue = ((baseHue + (chromaHue - 180) * 0.35) % 360 + 360) % 360;
  const skyTop = `hsl(${(tintHue + 220) % 360}, 55%, 28%)`;
  const skyMid = `hsl(${(tintHue + 30) % 360}, 75%, 50%)`;
  const skyHorizon = `hsl(${(tintHue + 6) % 360}, 90%, 70%)`;
  const skyBottom = `hsl(${(tintHue - 8 + 360) % 360}, 85%, 78%)`;

  const sunX = width * 0.74;
  const sunY = height * 0.50;
  const sunR = Math.min(width, height) * 0.075;

  /* Cloud nodes */
  const cloudNodes = clouds.map((c, i) => {
    const cxN = ((c.cx + frame * c.drift * tempoFactor) % 1.2) - 0.1;
    const churn = 1 + bass * 0.12 + Math.sin(frame * 0.008 + i) * 0.04;
    return (
      <g key={`cl-${i}`}>
        <ellipse
          cx={cxN * width}
          cy={c.cy * height}
          rx={c.rx * width * churn * 1.15}
          ry={c.ry * height * churn * 1.15}
          fill={`rgba(255, 240, 220, ${0.35 * c.shade})`}
        />
        <ellipse
          cx={cxN * width + 12}
          cy={c.cy * height + 4}
          rx={c.rx * width * 0.7 * churn}
          ry={c.ry * height * 0.7 * churn}
          fill={`rgba(255, 250, 235, ${0.55 * c.shade})`}
        />
        <ellipse
          cx={cxN * width - 8}
          cy={c.cy * height - 2}
          rx={c.rx * width * 0.6 * churn}
          ry={c.ry * height * 0.6 * churn}
          fill={`rgba(255, 245, 225, ${0.45 * c.shade})`}
        />
      </g>
    );
  });

  /* Mountain back path */
  const buildMountainPath = (pts: MountainPoint[], baseY: number) => {
    let p = `M 0 ${baseY * height}`;
    for (const pt of pts) {
      p += ` L ${pt.x * width} ${pt.y * height}`;
    }
    p += ` L ${width} ${baseY * height} Z`;
    return p;
  };

  /* Bird nodes */
  const birdNodes = birds.map((b, i) => {
    const t = frame * b.speed + b.phase;
    const bx = b.cx * width + Math.cos(t) * b.radius * width;
    const by = b.cy * height + Math.sin(t * 1.3) * b.radius * height * 0.6;
    const flap = Math.sin(frame * 0.16 + i * 0.7) * 3;
    return (
      <path
        key={`bird-${i}`}
        d={`M ${bx - b.size} ${by + flap}
            Q ${bx - b.size * 0.4} ${by - b.size * 0.5 - flap} ${bx} ${by}
            Q ${bx + b.size * 0.4} ${by - b.size * 0.5 - flap} ${bx + b.size} ${by + flap}`}
        fill="none"
        stroke="rgba(20, 14, 10, 0.78)"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    );
  });

  /* Balloon renderer */
  function renderBalloon(b: BalloonData, idx: number): React.ReactNode {
    const drift = ((frame * b.driftRate * tempoFactor) % 1) * 0.4;
    const bobY = Math.sin(frame * 0.018 + b.bobPhase) * 6;
    const cxN = ((b.bx + drift) % 1.2);
    const cx = cxN * width;
    const cy = b.by * height + bobY;

    const envelopeW = width * 0.18 * b.scale;
    const envelopeH = envelopeW * 1.20;
    const envCx = cx;
    const envCy = cy - envelopeH * 0.10;

    const basketW = envelopeW * 0.30;
    const basketH = envelopeW * 0.16;
    const basketCx = cx;
    const basketCy = cy + envelopeH * 0.62;

    const colorA = `hsl(${b.hueA}, 80%, 58%)`;
    const colorB = `hsl(${b.hueB}, 80%, 60%)`;
    const colorC = `hsl(${(b.hueA + 30) % 360}, 75%, 65%)`;
    const colorRim = `hsl(${b.hueA}, 90%, 78%)`;

    /* Pattern fill */
    let patternFills: React.ReactNode = null;
    if (b.pattern === "stripe") {
      patternFills = Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        const yT = envCy - envelopeH * 0.5 + t * envelopeH * 0.92;
        const widthT = Math.sin(t * Math.PI) * envelopeW * 0.5;
        const fill = i % 2 === 0 ? colorA : colorB;
        return (
          <ellipse
            key={`stripe-${idx}-${i}`}
            cx={envCx}
            cy={yT}
            rx={widthT}
            ry={envelopeH * 0.06}
            fill={fill}
            opacity={0.92}
          />
        );
      });
    } else if (b.pattern === "diamond") {
      patternFills = (
        <>
          {Array.from({ length: 6 }, (_, i) => {
            const t = i / 5;
            const yT = envCy - envelopeH * 0.4 + t * envelopeH * 0.8;
            const wT = Math.sin(t * Math.PI + 0.3) * envelopeW * 0.45;
            return (
              <g key={`diam-${idx}-${i}`}>
                <polygon
                  points={`${envCx},${yT - wT * 0.3} ${envCx + wT},${yT} ${envCx},${yT + wT * 0.3} ${envCx - wT},${yT}`}
                  fill={i % 2 === 0 ? colorA : colorB}
                  opacity={0.9}
                />
              </g>
            );
          })}
        </>
      );
    } else if (b.pattern === "swirl") {
      patternFills = Array.from({ length: 5 }, (_, i) => {
        const a = i * 1.25;
        return (
          <path
            key={`sw-${idx}-${i}`}
            d={`M ${envCx} ${envCy + envelopeH * 0.4}
                Q ${envCx + Math.cos(a) * envelopeW * 0.6} ${envCy + Math.sin(a) * envelopeH * 0.4}
                ${envCx + Math.cos(a + 1) * envelopeW * 0.4} ${envCy - envelopeH * 0.3}`}
            fill="none"
            stroke={i % 2 === 0 ? colorA : colorB}
            strokeWidth={envelopeW * 0.10}
            strokeLinecap="round"
            opacity={0.85}
          />
        );
      });
    } else {
      // triangle
      patternFills = Array.from({ length: 6 }, (_, i) => {
        const t = i / 5;
        const yT = envCy - envelopeH * 0.4 + t * envelopeH * 0.8;
        const wT = Math.sin(t * Math.PI) * envelopeW * 0.45;
        const flip = i % 2 === 0 ? 1 : -1;
        return (
          <polygon
            key={`tri-${idx}-${i}`}
            points={`${envCx - wT},${yT} ${envCx + wT},${yT} ${envCx},${yT + flip * wT * 0.5}`}
            fill={i % 2 === 0 ? colorA : colorB}
            opacity={0.88}
          />
        );
      });
    }

    /* Burner flame */
    const flameH = envelopeW * 0.22 * burnerIntensity;
    const flameW = envelopeW * 0.10;
    const flameCx = cx;
    const flameTopY = envCy + envelopeH * 0.50;
    const flameBotY = flameTopY + flameH;

    /* Ropes from envelope to basket (4 lines) */
    const ropeAttach = envCy + envelopeH * 0.48;
    const ropes = [-0.35, -0.12, 0.12, 0.35].map((dx, i) => (
      <line
        key={`rope-${idx}-${i}`}
        x1={cx + dx * envelopeW}
        y1={ropeAttach}
        x2={basketCx + dx * basketW * 0.9}
        y2={basketCy - basketH * 0.5}
        stroke="rgba(40, 28, 14, 0.85)"
        strokeWidth={0.9}
      />
    ));

    /* Vertical gore lines (envelope panel seams) */
    const goreLines = Array.from({ length: 11 }, (_, i) => {
      const dx = (i - 5) * envelopeW * 0.10;
      const ratio = 1 - Math.abs(dx) / (envelopeW * 0.55);
      const arcX = envCx + dx;
      return (
        <path
          key={`gore-${idx}-${i}`}
          d={`M ${arcX} ${envCy - envelopeH * 0.46 * ratio}
              Q ${envCx + dx * 1.05} ${envCy} ${arcX} ${envCy + envelopeH * 0.50 * ratio}`}
          stroke="rgba(20, 12, 6, 0.35)"
          strokeWidth={0.6}
          fill="none"
        />
      );
    });

    return (
      <g key={`balloon-${idx}`}>
        {/* Envelope shadow */}
        <ellipse
          cx={envCx + 4}
          cy={envCy + 4}
          rx={envelopeW * 0.55}
          ry={envelopeH * 0.50}
          fill="rgba(0, 0, 0, 0.18)"
        />
        {/* Envelope base */}
        <ellipse
          cx={envCx}
          cy={envCy}
          rx={envelopeW * 0.55}
          ry={envelopeH * 0.50}
          fill={colorC}
        />
        {/* Pattern fills */}
        {patternFills}
        {/* Gore lines */}
        {goreLines}
        {/* Top knob/parachute valve */}
        <circle
          cx={envCx}
          cy={envCy - envelopeH * 0.50}
          r={envelopeW * 0.05}
          fill="rgba(40, 28, 14, 0.85)"
        />
        <circle
          cx={envCx}
          cy={envCy - envelopeH * 0.50}
          r={envelopeW * 0.03}
          fill="rgba(220, 200, 160, 0.75)"
        />
        {/* Highlight on side */}
        <ellipse
          cx={envCx - envelopeW * 0.30}
          cy={envCy - envelopeH * 0.10}
          rx={envelopeW * 0.10}
          ry={envelopeH * 0.20}
          fill={colorRim}
          opacity={0.45}
        />
        {/* Bottom rim */}
        <ellipse
          cx={envCx}
          cy={envCy + envelopeH * 0.48}
          rx={envelopeW * 0.30}
          ry={envelopeH * 0.04}
          fill="rgba(20, 12, 6, 0.6)"
        />

        {/* Ropes */}
        {ropes}

        {/* Burner flame (3-layer glow) */}
        <ellipse cx={flameCx} cy={(flameTopY + flameBotY) / 2} rx={flameW * 1.6} ry={flameH * 0.9} fill="rgba(255, 180, 80, 0.3)" />
        <ellipse cx={flameCx} cy={(flameTopY + flameBotY) / 2 - flameH * 0.05} rx={flameW * 1.0} ry={flameH * 0.7} fill="rgba(255, 220, 120, 0.6)" />
        <ellipse cx={flameCx} cy={(flameTopY + flameBotY) / 2 - flameH * 0.10} rx={flameW * 0.5} ry={flameH * 0.45} fill="rgba(255, 250, 220, 0.85)" />

        {/* Basket */}
        <rect
          x={basketCx - basketW * 0.5}
          y={basketCy - basketH * 0.5}
          width={basketW}
          height={basketH}
          fill="rgba(110, 70, 30, 0.95)"
          stroke="rgba(40, 22, 8, 0.95)"
          strokeWidth={1}
        />
        {/* Basket weave horizontal */}
        {Array.from({ length: 4 }, (_, k) => (
          <line
            key={`bw-${idx}-${k}`}
            x1={basketCx - basketW * 0.5}
            y1={basketCy - basketH * 0.5 + (k + 1) * basketH * 0.22}
            x2={basketCx + basketW * 0.5}
            y2={basketCy - basketH * 0.5 + (k + 1) * basketH * 0.22}
            stroke="rgba(60, 36, 14, 0.9)"
            strokeWidth={0.6}
          />
        ))}
        {/* Basket weave vertical */}
        {Array.from({ length: 6 }, (_, k) => (
          <line
            key={`bvg-${idx}-${k}`}
            x1={basketCx - basketW * 0.5 + k * basketW * 0.2}
            y1={basketCy - basketH * 0.5}
            x2={basketCx - basketW * 0.5 + k * basketW * 0.2}
            y2={basketCy + basketH * 0.5}
            stroke="rgba(60, 36, 14, 0.6)"
            strokeWidth={0.5}
          />
        ))}

        {/* Passengers (heads) */}
        {Array.from({ length: b.passengers }, (_, k) => {
          const px = basketCx - basketW * 0.30 + k * (basketW * 0.6 / Math.max(1, b.passengers - 1));
          const py = basketCy - basketH * 0.55 - 4;
          return (
            <g key={`pass-${idx}-${k}`}>
              <circle cx={px} cy={py} r={2 + b.scale * 1.2} fill="rgba(220, 180, 140, 0.95)" />
              <circle cx={px} cy={py} r={2 + b.scale * 1.2} fill="none" stroke="rgba(40, 20, 8, 0.6)" strokeWidth={0.4} />
            </g>
          );
        })}

        {/* Tassel trim */}
        {Array.from({ length: 5 }, (_, k) => (
          <line
            key={`tas-${idx}-${k}`}
            x1={basketCx - basketW * 0.4 + k * basketW * 0.2}
            y1={basketCy + basketH * 0.5}
            x2={basketCx - basketW * 0.4 + k * basketW * 0.2}
            y2={basketCy + basketH * 0.5 + 5}
            stroke="rgba(180, 60, 60, 0.8)"
            strokeWidth={1}
          />
        ))}
      </g>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="hab-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="38%" stopColor={skyMid} />
            <stop offset="68%" stopColor={skyHorizon} />
            <stop offset="100%" stopColor={skyBottom} />
          </linearGradient>
          <radialGradient id="hab-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFAE0" stopOpacity={0.95 * sunBright} />
            <stop offset="40%" stopColor={`hsl(${(tintHue + 18) % 360}, 95%, 70%)`} stopOpacity={0.7 * sunBright} />
            <stop offset="100%" stopColor={`hsl(${tintHue}, 90%, 60%)`} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="hab-mountainBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${(tintHue + 240) % 360}, 35%, 38%)`} />
            <stop offset="100%" stopColor={`hsl(${(tintHue + 240) % 360}, 25%, 22%)`} />
          </linearGradient>
          <linearGradient id="hab-mountainFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${(tintHue + 220) % 360}, 30%, 22%)`} />
            <stop offset="100%" stopColor={`hsl(${(tintHue + 230) % 360}, 25%, 12%)`} />
          </linearGradient>
          <filter id="hab-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* SKY */}
        <rect width={width} height={height} fill="url(#hab-sky)" />

        {/* SUN with halo */}
        <circle cx={sunX} cy={sunY} r={sunR * 4.5} fill="url(#hab-sun)" />
        <circle cx={sunX} cy={sunY} r={sunR * 2.4} fill="url(#hab-sun)" />
        <circle cx={sunX} cy={sunY} r={sunR} fill="#FFF8D8" opacity={0.85 * sunBright} />
        <circle cx={sunX} cy={sunY} r={sunR * 0.55} fill="#FFFFFF" opacity={0.9 * sunBright} />

        {/* SUN RAYS */}
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const inner = sunR * 1.4;
          const outer = sunR * 4.5;
          return (
            <line
              key={`sunray-${i}`}
              x1={sunX + Math.cos(a) * inner}
              y1={sunY + Math.sin(a) * inner}
              x2={sunX + Math.cos(a) * outer}
              y2={sunY + Math.sin(a) * outer}
              stroke={`hsla(${(tintHue + 18) % 360}, 100%, 80%, ${0.4 * sunBright})`}
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}

        {/* CLOUDS BACK LAYER */}
        <g filter="url(#hab-blur)">{cloudNodes.slice(0, 6)}</g>

        {/* MOUNTAINS BACK */}
        <path d={buildMountainPath(mountainsBack, 0.78)} fill="url(#hab-mountainBack)" />

        {/* DISTANT VALLEY MIST */}
        <rect
          x={0}
          y={height * 0.66}
          width={width}
          height={height * 0.10}
          fill={`hsla(${tintHue}, 60%, 78%, 0.35)`}
          filter="url(#hab-blur)"
        />

        {/* MOUNTAINS FRONT */}
        <path d={buildMountainPath(mountainsFront, 0.92)} fill="url(#hab-mountainFront)" />

        {/* GROUND/foreground hills */}
        <path
          d={`M 0 ${height * 0.86}
              Q ${width * 0.25} ${height * 0.82} ${width * 0.5} ${height * 0.85}
              T ${width} ${height * 0.84}
              L ${width} ${height}
              L 0 ${height} Z`}
          fill={`hsl(${(tintHue + 80) % 360}, 35%, 22%)`}
        />

        {/* TREES on foreground hill (silhouette dots) */}
        {Array.from({ length: 24 }, (_, i) => {
          const tx = (i / 23) * width;
          const ty = height * 0.86 - Math.sin(i * 0.6) * 6;
          const th = 8 + Math.sin(i * 1.3) * 4;
          return (
            <g key={`tree-${i}`}>
              <line x1={tx} y1={ty} x2={tx} y2={ty + th} stroke="rgba(20, 14, 8, 0.85)" strokeWidth={1} />
              <ellipse cx={tx} cy={ty - 2} rx={3} ry={5} fill="rgba(20, 36, 14, 0.95)" />
            </g>
          );
        })}

        {/* CLOUDS MID LAYER */}
        <g filter="url(#hab-blur)">{cloudNodes.slice(6)}</g>

        {/* BIRDS */}
        {birdNodes}

        {/* BALLOONS — render back-to-front (smallest first) */}
        {balloons
          .map((b, i) => ({ b, i }))
          .sort((a, z) => a.b.scale - z.b.scale)
          .map(({ b, i }) => renderBalloon(b, i))}

        {/* WARM ATMOSPHERIC TINT WASH */}
        <rect width={width} height={height} fill={`hsla(${tintHue + 14}, 80%, 60%, ${0.05 + slowEnergy * 0.05})`} />

        {/* SUN GLINT/LENS FLARE */}
        <circle cx={sunX} cy={sunY} r={sunR * 0.18} fill="#FFFFFF" opacity={0.95 * sunBright} />
        <ellipse cx={sunX - 60} cy={sunY + 30} rx={20} ry={4} fill="rgba(255, 240, 200, 0.4)" opacity={sunBright * 0.8} />
        <ellipse cx={sunX + 40} cy={sunY + 60} rx={12} ry={3} fill="rgba(255, 240, 200, 0.35)" opacity={sunBright * 0.75} />
      </svg>
    </div>
  );
};
