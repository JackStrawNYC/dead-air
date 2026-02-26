/**
 * Chameleon — A stylized chameleon perched on a branch whose body color shifts
 * based on chroma (pitch class) data. The independently rotating eye scans the
 * scene. Tongue flicks outward on beat accents — a rapid extension and retraction.
 * Curled tail unfurls slightly with energy. Rich gradient body.
 * Cycle: 70s (2100 frames), 20s (600 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 2100;   // 70s
const DURATION = 600;  // 20s

interface Props {
  frames: EnhancedFrameData[];
}

export const Chameleon: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  /* deterministic position (no useMemo needed for static seed) */
  const rng = React.useMemo(() => {
    const r = mulberry32(449922);
    return { posY: 0.5 + r() * 0.25, side: r() > 0.5 ? 1 : -1 };
  }, []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.7;
  if (masterOpacity < 0.01) return null;

  const frameData = frames[idx];
  const chroma = frameData?.chroma ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const isBeat = frameData?.beat ?? false;

  /* color from chroma — find dominant pitch class, map to hue */
  let maxChroma = 0;
  let maxChromaIdx = 0;
  for (let c = 0; c < 12; c++) {
    if (chroma[c] > maxChroma) {
      maxChroma = chroma[c];
      maxChromaIdx = c;
    }
  }
  const hue = (maxChromaIdx * 30 + frame * 0.3) % 360;
  const sat = 50 + maxChroma * 40;
  const bodyColor = `hsl(${hue}, ${sat}%, 40%)`;
  const bodyLight = `hsl(${hue}, ${sat}%, 55%)`;
  const bodyDark = `hsl(${hue}, ${sat}%, 25%)`;

  /* positioning */
  const isLeft = rng.side < 0;
  const cx = isLeft ? width * 0.12 : width * 0.88;
  const cy = rng.posY * height;
  const flip = isLeft ? 1 : -1;
  const scale = 1.8;

  /* eye scanning */
  const eyeAngle = Math.sin(frame * 0.02) * 30;

  /* tongue flick on beat */
  const tongueExtend = isBeat
    ? interpolate(cycleFrame % 10, [0, 3, 10], [0, 1, 0], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      })
    : 0;
  const tongueLen = tongueExtend * 80 * scale;

  /* tail curl: more energy = less curl (unfurls) */
  const tailCurl = 1.2 - energy * 0.5;

  /* breathing/sway */
  const breathe = Math.sin(frame * 0.03) * 2;

  /* branch */
  const branchY = cy + 28 * scale;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <linearGradient id="cham-body" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={bodyLight} />
            <stop offset="50%" stopColor={bodyColor} />
            <stop offset="100%" stopColor={bodyDark} />
          </linearGradient>
          <radialGradient id="cham-eye" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFD700" />
            <stop offset="60%" stopColor="#FF8C00" />
            <stop offset="100%" stopColor="#222" />
          </radialGradient>
        </defs>

        {/* branch */}
        <line
          x1={cx - flip * 120 * scale} y1={branchY}
          x2={cx + flip * 60 * scale} y2={branchY + 3}
          stroke="#5D4037" strokeWidth={6 * scale} strokeLinecap="round"
        />
        {/* branch texture */}
        <line
          x1={cx - flip * 100 * scale} y1={branchY - 1}
          x2={cx + flip * 40 * scale} y2={branchY + 1}
          stroke="#795548" strokeWidth={1.5 * scale} strokeLinecap="round" opacity={0.4}
        />

        <g transform={`translate(${cx}, ${cy + breathe}) scale(${flip * scale}, ${scale})`}>
          {/* tail (curled spiral) */}
          {(() => {
            const tailSegs = 20;
            const points: string[] = [];
            for (let ti = 0; ti <= tailSegs; ti++) {
              const t = ti / tailSegs;
              const angle = t * Math.PI * tailCurl * 2;
              const radius = 18 - t * 14;
              const tx = -30 - t * 15 + Math.cos(angle) * radius;
              const ty = 8 + Math.sin(angle) * radius;
              points.push(ti === 0 ? `M ${tx} ${ty}` : `L ${tx} ${ty}`);
            }
            return (
              <path d={points.join(" ")} fill="none" stroke={bodyDark}
                strokeWidth={4} strokeLinecap="round" />
            );
          })()}

          {/* body */}
          <ellipse cx={0} cy={5} rx={22} ry={14} fill="url(#cham-body)" />

          {/* body ridge (dorsal crest) */}
          <path d="M -15 -6 Q -8 -14, 0 -8 Q 8 -3, 18 -5"
            fill="none" stroke={bodyDark} strokeWidth={2.5} strokeLinecap="round" opacity={0.5} />

          {/* front leg gripping branch */}
          <line x1={8} y1={12} x2={12} y2={22} stroke={bodyDark} strokeWidth={3} strokeLinecap="round" />
          <line x1={12} y1={22} x2={15} y2={20} stroke={bodyDark} strokeWidth={2} strokeLinecap="round" />
          {/* back leg */}
          <line x1={-10} y1={14} x2={-12} y2={22} stroke={bodyDark} strokeWidth={3} strokeLinecap="round" />
          <line x1={-12} y1={22} x2={-15} y2={20} stroke={bodyDark} strokeWidth={2} strokeLinecap="round" />

          {/* head */}
          <ellipse cx={20} cy={0} rx={12} ry={10} fill="url(#cham-body)" />
          {/* casque (helmet crest) */}
          <path d="M 18 -8 Q 22 -16, 28 -10 Q 30 -6, 26 -4"
            fill={bodyColor} stroke={bodyDark} strokeWidth={1} />

          {/* eye turret */}
          <circle cx={24} cy={-2} r={7} fill={bodyLight} stroke={bodyDark} strokeWidth={1} />
          <g transform={`rotate(${eyeAngle}, 24, -2)`}>
            <circle cx={24} cy={-2} r={5} fill="url(#cham-eye)" />
            <circle cx={24.5} cy={-2.5} r={2} fill="#111" />
          </g>

          {/* mouth line */}
          <path d="M 30 3 Q 28 5, 24 4" fill="none" stroke={bodyDark} strokeWidth={1} opacity={0.6} />

          {/* tongue */}
          {tongueLen > 1 && (
            <g>
              <line x1={30} y1={3} x2={30 + tongueLen} y2={3 - tongueLen * 0.15}
                stroke="#FF3366" strokeWidth={2} strokeLinecap="round" />
              {/* sticky tip */}
              <circle cx={30 + tongueLen} cy={3 - tongueLen * 0.15} r={3} fill="#FF3366" />
            </g>
          )}

          {/* body pattern spots */}
          <circle cx={-5} cy={2} r={3} fill={bodyLight} opacity={0.3} />
          <circle cx={8} cy={6} r={2.5} fill={bodyLight} opacity={0.25} />
          <circle cx={-12} cy={8} r={2} fill={bodyLight} opacity={0.2} />
        </g>
      </svg>
    </div>
  );
};
