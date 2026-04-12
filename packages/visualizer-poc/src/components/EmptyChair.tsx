/**
 * EmptyChair — Solitary stage overlay for "He's Gone".
 *
 * A wooden folding chair sits alone beneath a single volumetric spotlight.
 * A mic stand waits, an acoustic guitar leans against the chair, sheet
 * music sits unread on a stand behind. Footprints fade into the wings.
 *
 * Audio: slowEnergy→spot intensity, beatDecay→pulse, chromaHue→warm tint,
 * vocalEnergy→mic-stand memory glow, energy→dust mote density,
 * tempoFactor→subtle drift. Melancholic, monochromatic warm palette.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const FADE_IN_FRAMES = 90;
const FADE_OUT_FRAMES = 90;
const MAX_OPACITY = 0.85;

interface Props {
  frames: EnhancedFrameData[];
}

interface DustMote {
  baseX: number;
  baseY: number;
  radius: number;
  drift: number;
  phase: number;
  brightness: number;
}

interface Footprint {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  fade: number;
  side: 0 | 1;
}

interface PlankRow {
  y: number;
  height: number;
  scale: number;
  shade: number;
  knots: Array<{ x: number; r: number }>;
}

export const EmptyChair: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  // ---------- Audio drives ----------
  const slowEnergy = snap.slowEnergy ?? 0;
  const energy = snap.energy ?? 0;
  const chromaHue = snap.chromaHue ?? 30;
  const beatDecay = snap.beatDecay ?? 0;
  const vocalEnergy = snap.vocalEnergy ?? 0;

  const spotIntensity = interpolate(slowEnergy, [0, 0.35], [0.55, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const beatPulse = 1 + beatDecay * 0.12;
  const hue = 28 + ((chromaHue % 360) / 360) * 16;
  const micGlow = interpolate(vocalEnergy, [0, 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dustDensity = interpolate(energy, [0, 0.5], [0.4, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ---------- Master fades ----------
  const fadeIn = interpolate(frame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [frames.length - FADE_OUT_FRAMES, frames.length],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const masterOpacity = MAX_OPACITY * fadeIn * fadeOut;
  if (masterOpacity < 0.01) return null;

  // ---------- Stage geometry ----------
  const stageCenterX = width * 0.5;
  const chairCenterX = width * 0.5 + 6;
  const chairBaseY = height * 0.66;
  const stageHorizonY = height * 0.55;
  const chairAngle = -8;

  const rng = React.useMemo(() => seeded(0xc4a17), []);

  const planks: PlankRow[] = React.useMemo(() => {
    const rows: PlankRow[] = [];
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const ph = 18 + Math.pow(t, 1.6) * 60;
      const py = stageHorizonY + Math.pow(t, 1.4) * (height - stageHorizonY);
      const knots = Array.from({ length: 1 + Math.floor(rng() * 2) }, () => ({
        x: rng(),
        r: 1.5 + rng() * 2.2,
      }));
      rows.push({ y: py, height: ph, scale: 0.6 + t * 0.6, shade: rng() * 0.15, knots });
    }
    return rows;
  }, [rng, height, stageHorizonY]);

  const motes: DustMote[] = React.useMemo(
    () =>
      Array.from({ length: 42 }, () => ({
        baseX: (rng() - 0.5) * 2,
        baseY: rng(),
        radius: 0.4 + rng() * 1.2,
        drift: rng() * 100,
        phase: rng() * Math.PI * 2,
        brightness: 0.25 + rng() * 0.55,
      })),
    [rng],
  );

  const footprints: Footprint[] = React.useMemo(() => {
    const arr: Footprint[] = [];
    const startX = chairCenterX + 70;
    const startY = chairBaseY + 70;
    const endX = width * 0.92;
    const endY = stageHorizonY + 14;
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const arc = Math.sin(t * Math.PI) * 18;
      arr.push({
        x: startX + (endX - startX) * t,
        y: startY + (endY - startY) * t - arc,
        rotation: -22 + t * 18 + (i % 2 === 0 ? -3 : 3),
        scale: 1 - t * 0.55,
        fade: Math.pow(1 - t, 1.4) * 0.65,
        side: (i % 2) as 0 | 1,
      });
    }
    return arr;
  }, [chairCenterX, chairBaseY, width, stageHorizonY]);

  const driftPhase = frame * 0.005 * tempoFactor;

  // ---------- Color tokens ----------
  const warmHi = `hsla(${hue}, 70%, 78%, `;
  const warmMid = `hsla(${hue}, 55%, 52%, `;
  const warmLow = `hsla(${hue - 4}, 45%, 28%, `;
  const stageDark = `hsla(${hue - 10}, 25%, 7%, `;
  const stageMid = `hsla(${hue - 8}, 30%, 14%, `;
  const stageWarm = `hsla(${hue - 6}, 35%, 22%, `;
  const wood = `hsla(${hue - 14}, 40%, 18%, `;
  const woodHi = `hsla(${hue - 10}, 45%, 36%, `;
  const woodLow = `hsla(${hue - 14}, 38%, 9%, `;

  // Spotlight cone geometry
  const spotOriginX = chairCenterX - 22;
  const spotOriginY = -40;
  const spotBaseY = chairBaseY + 96;
  const spotTopHW = 24;
  const spotBaseHW = 220;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: masterOpacity }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        <defs>
          <radialGradient id="ec-bg" cx="50%" cy="55%" r="80%">
            <stop offset="0%" stopColor={`${stageMid}0.55)`} />
            <stop offset="55%" stopColor={`${stageDark}0.85)`} />
            <stop offset="100%" stopColor={`${stageDark}0.98)`} />
          </radialGradient>
          <linearGradient id="ec-cone" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={`${warmHi}0)`} />
            <stop offset="20%" stopColor={`${warmHi}${0.18 * spotIntensity})`} />
            <stop offset="60%" stopColor={`${warmMid}${0.22 * spotIntensity})`} />
            <stop offset="100%" stopColor={`${warmLow}${0.05 * spotIntensity})`} />
          </linearGradient>
          <radialGradient id="ec-pool" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`${warmHi}${0.55 * spotIntensity})`} />
            <stop offset="45%" stopColor={`${warmMid}${0.32 * spotIntensity})`} />
            <stop offset="100%" stopColor={`${warmLow}0)`} />
          </radialGradient>
          <linearGradient id="ec-wood" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={`${woodLow}0.95)`} />
            <stop offset="50%" stopColor={`${wood}0.95)`} />
            <stop offset="100%" stopColor={`${woodHi}0.85)`} />
          </linearGradient>
          <linearGradient id="ec-curtain-l" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={`${stageDark}0.95)`} />
            <stop offset="100%" stopColor={`${stageDark}0)`} />
          </linearGradient>
          <linearGradient id="ec-curtain-r" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={`${stageDark}0)`} />
            <stop offset="100%" stopColor={`${stageDark}0.95)`} />
          </linearGradient>
          <radialGradient id="ec-mic-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`${warmHi}${0.55 * micGlow})`} />
            <stop offset="100%" stopColor={`${warmHi}0)`} />
          </radialGradient>
          <radialGradient id="ec-vignette" cx="50%" cy="50%" r="75%">
            <stop offset="60%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>
          <filter id="ec-haze" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="ec-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
          <clipPath id="ec-cone-clip">
            <polygon
              points={`${spotOriginX - spotTopHW},${spotOriginY} ${spotOriginX + spotTopHW},${spotOriginY} ${chairCenterX + spotBaseHW},${spotBaseY} ${chairCenterX - spotBaseHW},${spotBaseY}`}
            />
          </clipPath>
        </defs>

        {/* Background darkness */}
        <rect width={width} height={height} fill="url(#ec-bg)" />

        {/* Wooden plank stage in perspective */}
        {planks.map((p, i) => {
          const pw = width * 0.96 * p.scale + 60;
          const px = stageCenterX - pw / 2;
          const sh = 0.35 + p.shade;
          return (
            <g key={`pl-${i}`}>
              <rect x={px} y={p.y} width={pw} height={p.height} fill={`${wood}${sh})`} />
              <line x1={px} y1={p.y} x2={px + pw} y2={p.y} stroke={`${woodHi}${0.18 + sh * 0.1})`} strokeWidth={0.8} />
              <line x1={px} y1={p.y + p.height} x2={px + pw} y2={p.y + p.height} stroke={`${woodLow}0.7)`} strokeWidth={1.2} />
              {p.knots.map((k, ki) => (
                <ellipse key={`k-${i}-${ki}`} cx={px + k.x * pw} cy={p.y + p.height * 0.5} rx={k.r} ry={k.r * 0.55} fill={`${woodLow}0.65)`} />
              ))}
            </g>
          );
        })}
        <line x1={stageCenterX - width * 0.08} y1={stageHorizonY} x2={stageCenterX - width * 0.18} y2={height} stroke={`${woodLow}0.6)`} strokeWidth={1} />
        <line x1={stageCenterX + width * 0.08} y1={stageHorizonY} x2={stageCenterX + width * 0.18} y2={height} stroke={`${woodLow}0.6)`} strokeWidth={1} />

        {/* Footprints fading away */}
        {footprints.map((fp, i) => (
          <g key={`fp-${i}`} transform={`translate(${fp.x}, ${fp.y}) rotate(${fp.rotation}) scale(${fp.scale})`} opacity={fp.fade}>
            <ellipse cx={0} cy={0} rx={9} ry={5} fill={`${woodLow}0.85)`} />
            <ellipse cx={fp.side === 0 ? -2 : 2} cy={-7} rx={4} ry={2.5} fill={`${woodLow}0.7)`} />
          </g>
        ))}

        {/* Pool of light on the stage floor */}
        <ellipse cx={chairCenterX} cy={chairBaseY + 78} rx={170} ry={42} fill="url(#ec-pool)" style={{ filter: "url(#ec-soft)" }} />

        {/* Volumetric spotlight cone */}
        <polygon
          points={`${spotOriginX - spotTopHW},${spotOriginY} ${spotOriginX + spotTopHW},${spotOriginY} ${chairCenterX + spotBaseHW},${spotBaseY} ${chairCenterX - spotBaseHW},${spotBaseY}`}
          fill="url(#ec-cone)"
          opacity={0.85 * beatPulse}
          style={{ mixBlendMode: "screen" }}
        />
        <polygon
          points={`${spotOriginX - spotTopHW * 0.4},${spotOriginY} ${spotOriginX + spotTopHW * 0.4},${spotOriginY} ${chairCenterX + spotBaseHW * 0.45},${spotBaseY} ${chairCenterX - spotBaseHW * 0.45},${spotBaseY}`}
          fill={`${warmHi}${0.12 * spotIntensity * beatPulse})`}
          style={{ mixBlendMode: "screen", filter: "url(#ec-soft)" }}
        />

        {/* Dust motes inside the cone */}
        <g clipPath="url(#ec-cone-clip)">
          {motes.map((m, i) => {
            const t = (m.baseY + driftPhase + m.drift * 0.02) % 1;
            const coneY = spotOriginY + t * (spotBaseY - spotOriginY);
            const halfWAt = spotTopHW + t * (spotBaseHW - spotTopHW);
            const sway = Math.sin(frame * 0.012 + m.phase) * 8;
            const coneCx = spotOriginX + (chairCenterX - spotOriginX) * t + sway;
            const cx = coneCx + m.baseX * halfWAt * 0.85;
            const op = m.brightness * dustDensity * spotIntensity * 0.7;
            return <circle key={`m-${i}`} cx={cx} cy={coneY} r={m.radius} fill={`${warmHi}${op})`} />;
          })}
        </g>

        {/* Sheet music stand behind chair */}
        <g transform={`translate(${chairCenterX - 110}, ${chairBaseY - 30})`} opacity={0.85}>
          <line x1={0} y1={0} x2={-12} y2={70} stroke={`${stageWarm}0.95)`} strokeWidth={2.2} />
          <line x1={0} y1={0} x2={12} y2={70} stroke={`${stageWarm}0.95)`} strokeWidth={2.2} />
          <line x1={0} y1={0} x2={0} y2={70} stroke={`${stageWarm}0.95)`} strokeWidth={2.2} />
          <line x1={0} y1={0} x2={0} y2={-78} stroke={`${stageWarm}0.95)`} strokeWidth={2.4} />
          <rect x={-26} y={-92} width={52} height={4} fill={`${stageWarm}0.95)`} />
          <rect x={-22} y={-128} width={44} height={36} fill={`hsla(${hue + 8}, 25%, 78%, 0.55)`} stroke={`${woodLow}0.6)`} strokeWidth={0.6} transform="rotate(-3, 0, -110)" />
          {[0, 1, 2, 3, 4].map((s) => (
            <line key={`st-${s}`} x1={-18} y1={-122 + s * 5} x2={18} y2={-122 + s * 5} stroke={`${woodLow}0.7)`} strokeWidth={0.4} transform="rotate(-3, 0, -110)" />
          ))}
        </g>

        {/* Microphone stand (with vocal-memory glow) */}
        <g transform={`translate(${chairCenterX - 78}, ${chairBaseY + 40})`}>
          {micGlow > 0.02 && (
            <circle cx={0} cy={-150} r={28} fill="url(#ec-mic-glow)" style={{ filter: "url(#ec-soft)" }} />
          )}
          <ellipse cx={0} cy={0} rx={20} ry={4} fill={`${stageWarm}0.85)`} />
          <line x1={-16} y1={-2} x2={0} y2={-8} stroke={`${stageWarm}0.95)`} strokeWidth={2} />
          <line x1={16} y1={-2} x2={0} y2={-8} stroke={`${stageWarm}0.95)`} strokeWidth={2} />
          <line x1={0} y1={2} x2={0} y2={-8} stroke={`${stageWarm}0.95)`} strokeWidth={2} />
          <line x1={0} y1={-8} x2={0} y2={-150} stroke={`${stageWarm}0.95)`} strokeWidth={2.6} />
          <circle cx={0} cy={-150} r={3} fill={`${woodHi}0.9)`} />
          <line x1={0} y1={-150} x2={26} y2={-158} stroke={`${stageWarm}0.95)`} strokeWidth={2.2} />
          <ellipse cx={28} cy={-159} rx={4} ry={6} fill={`${woodLow}0.95)`} stroke={`${warmMid}${0.25 + micGlow * 0.6})`} strokeWidth={1} transform="rotate(15, 28, -159)" />
        </g>

        {/* Empty wooden chair (slight 3D angle) */}
        <g transform={`translate(${chairCenterX}, ${chairBaseY}) rotate(${chairAngle})`}>
          <ellipse cx={4} cy={86} rx={56} ry={9} fill={`${stageDark}0.85)`} style={{ filter: "url(#ec-soft)" }} />
          <rect x={-30} y={-4} width={5} height={92} fill="url(#ec-wood)" />
          <rect x={20} y={-8} width={5} height={96} fill="url(#ec-wood)" />
          <rect x={-38} y={6} width={6} height={88} fill="url(#ec-wood)" />
          <rect x={28} y={2} width={6} height={92} fill="url(#ec-wood)" />
          <rect x={-36} y={48} width={68} height={2.5} fill={`${woodLow}0.92)`} />
          <rect x={-32} y={70} width={62} height={2} fill={`${woodLow}0.85)`} />
          <polygon points="-40,8 34,4 36,18 -42,22" fill="url(#ec-wood)" stroke={`${woodLow}0.95)`} strokeWidth={1} />
          <line x1={-40} y1={8} x2={34} y2={4} stroke={`${woodHi}0.7)`} strokeWidth={1} />
          <polygon points="-42,22 36,18 36,26 -42,30" fill={`${woodLow}0.95)`} />
          <rect x={-32} y={-72} width={4} height={80} fill="url(#ec-wood)" />
          <rect x={24} y={-76} width={4} height={84} fill="url(#ec-wood)" />
          <polygon points="-34,-78 30,-82 32,-72 -32,-68" fill="url(#ec-wood)" stroke={`${woodLow}0.9)`} strokeWidth={0.8} />
          <polygon points="-30,-46 26,-50 28,-40 -30,-36" fill={`${wood}0.9)`} stroke={`${woodLow}0.7)`} strokeWidth={0.5} />
          <polygon points="-30,-22 26,-26 28,-16 -30,-12" fill={`${wood}0.9)`} stroke={`${woodLow}0.7)`} strokeWidth={0.5} />
          {[0, 1, 2, 3, 4].map((g) => (
            <line key={`gr-${g}`} x1={-38 + g * 2} y1={10 + g * 2.5} x2={32 + g * 0.5} y2={6 + g * 2.5} stroke={`${woodLow}${0.25 + g * 0.04})`} strokeWidth={0.4} />
          ))}
        </g>

        {/* Acoustic guitar leaning against chair */}
        <g transform={`translate(${chairCenterX + 40}, ${chairBaseY + 20}) rotate(-22)`}>
          <ellipse cx={0} cy={28} rx={26} ry={32} fill={`hsla(${hue - 12}, 50%, 22%, 0.95)`} stroke={`${woodLow}0.95)`} strokeWidth={1} />
          <ellipse cx={0} cy={-8} rx={20} ry={24} fill={`hsla(${hue - 12}, 50%, 22%, 0.95)`} stroke={`${woodLow}0.95)`} strokeWidth={1} />
          <ellipse cx={0} cy={10} rx={16} ry={6} fill={`hsla(${hue - 12}, 50%, 22%, 0.95)`} />
          <circle cx={0} cy={20} r={8} fill={`${stageDark}0.98)`} stroke={`${woodHi}0.5)`} strokeWidth={0.6} />
          <circle cx={0} cy={20} r={9.6} fill="none" stroke={`${woodHi}0.4)`} strokeWidth={0.4} />
          <rect x={-9} y={36} width={18} height={3} fill={`${woodLow}0.95)`} />
          <path d="M -22 28 Q -10 50 16 38" fill="none" stroke={`${woodHi}0.35)`} strokeWidth={0.8} />
          <rect x={-3} y={-90} width={6} height={60} fill={`hsla(${hue - 14}, 45%, 18%, 0.95)`} stroke={`${woodLow}0.9)`} strokeWidth={0.4} />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((f) => (
            <line key={`fr-${f}`} x1={-3} y1={-30 - f * 7} x2={3} y2={-30 - f * 7} stroke={`${woodHi}0.5)`} strokeWidth={0.5} />
          ))}
          <polygon points="-5,-90 5,-90 6,-100 -6,-100" fill={`hsla(${hue - 14}, 45%, 16%, 0.95)`} stroke={`${woodLow}0.9)`} strokeWidth={0.5} />
          {[0, 1, 2].map((p) => (
            <circle key={`pg-${p}`} cx={-7} cy={-92 - p * 2.5} r={1} fill={`${woodHi}0.7)`} />
          ))}
          {[0, 1, 2, 3, 4, 5].map((s) => {
            const off = -2.2 + s * 0.88;
            return <line key={`str-${s}`} x1={off} y1={-88} x2={off} y2={36} stroke={`hsla(${hue + 8}, 30%, 70%, 0.35)`} strokeWidth={0.3} />;
          })}
        </g>

        {/* Atmospheric haze */}
        <ellipse cx={chairCenterX} cy={chairBaseY - 40} rx={width * 0.5} ry={120} fill={`${warmMid}${0.06 + slowEnergy * 0.04})`} style={{ filter: "url(#ec-haze)", mixBlendMode: "screen" }} />
        <ellipse cx={chairCenterX + 30} cy={chairBaseY + 50} rx={width * 0.35} ry={70} fill={`${warmHi}${0.04 + slowEnergy * 0.03})`} style={{ filter: "url(#ec-haze)", mixBlendMode: "screen" }} />

        {/* Curtain hints at edges */}
        <rect x={0} y={0} width={width * 0.14} height={height} fill="url(#ec-curtain-l)" />
        <rect x={width * 0.86} y={0} width={width * 0.14} height={height} fill="url(#ec-curtain-r)" />

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#ec-vignette)" />
      </svg>
    </div>
  );
};

export default EmptyChair;
