/**
 * Scorpion — 1-2 stylized scorpion silhouettes positioned at screen edges.
 * The curved tail (metasoma + telson) curls and strikes on beat accents.
 * Pincers open/close with energy. Body segments shift slightly.
 * Dark silhouette with subtle amber highlights.
 * Cycle: 80s (2400 frames), 22s (660 frames) visible.
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

const CYCLE = 2400;   // 80s
const DURATION = 660;  // 22s
const NUM_SCORPIONS = 2;

interface ScorpionData {
  anchorX: number;   // 0-1
  anchorY: number;   // 0-1
  scale: number;
  flipX: number;     // 1 or -1
  tailPhaseOff: number;
  pincerPhaseOff: number;
}

function generate(seed: number): ScorpionData[] {
  const rng = mulberry32(seed);
  return Array.from({ length: NUM_SCORPIONS }, (_, i) => ({
    anchorX: i === 0 ? 0.12 + rng() * 0.1 : 0.78 + rng() * 0.1,
    anchorY: 0.75 + rng() * 0.15,
    scale: 0.8 + rng() * 0.5,
    flipX: i === 0 ? 1 : -1,
    tailPhaseOff: rng() * Math.PI * 2,
    pincerPhaseOff: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Scorpion: React.FC<Props> = ({ frames }) => {
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

  const scorpions = React.useMemo(() => generate(771199), []);

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
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.65;
  if (masterOpacity < 0.01) return null;

  const isBeat = frames[idx]?.beat ?? false;
  const onsetStrength = frames[idx]?.onset ?? 0;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <linearGradient id="scorp-body" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2A1A0A" />
            <stop offset="60%" stopColor="#1A0F05" />
            <stop offset="100%" stopColor="#0D0803" />
          </linearGradient>
          <linearGradient id="scorp-highlight" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#D4A050" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#2A1A0A" stopOpacity={0} />
          </linearGradient>
        </defs>
        {scorpions.map((sc, si) => {
          const cx = sc.anchorX * width;
          const cy = sc.anchorY * height;
          const s = 50 * sc.scale;

          /* tail curl driven by beat accents */
          const tailStrike = isBeat ? 0.5 : 0;
          const baseTailCurl = Math.sin(frame * 0.03 + sc.tailPhaseOff) * 0.3 + energy * 0.4 + tailStrike;
          const tailCurl = Math.min(baseTailCurl, 1.2);

          /* pincer open/close */
          const pincerOpen = 0.2 + Math.sin(frame * 0.04 + sc.pincerPhaseOff) * 0.15 + onsetStrength * 0.4;

          /* body sway */
          const bodySway = Math.sin(frame * 0.015 + sc.tailPhaseOff) * 3;

          /* tail: 5 segments curving over the body */
          const tailSegments = 5;
          const tailPoints: Array<{ x: number; y: number }> = [];
          for (let ti = 0; ti <= tailSegments; ti++) {
            const t = ti / tailSegments;
            const angle = -Math.PI * 0.3 - t * Math.PI * (0.5 + tailCurl * 0.6);
            const dist = s * (0.5 + t * 1.2);
            tailPoints.push({
              x: cx + Math.cos(angle) * dist * sc.flipX + bodySway,
              y: cy + Math.sin(angle) * dist,
            });
          }

          /* build tail path */
          let tailPath = `M ${tailPoints[0].x} ${tailPoints[0].y}`;
          for (let ti = 1; ti < tailPoints.length; ti++) {
            tailPath += ` L ${tailPoints[ti].x} ${tailPoints[ti].y}`;
          }

          /* stinger at tail tip */
          const tip = tailPoints[tailPoints.length - 1];
          const prev = tailPoints[tailPoints.length - 2];
          const stingerAngle = Math.atan2(tip.y - prev.y, tip.x - prev.x);

          return (
            <g key={si}>
              {/* legs (4 pairs) */}
              {[-1.2, -0.4, 0.4, 1.2].map((legOff, li) => {
                const legBase = { x: cx + legOff * s * 0.25 * sc.flipX + bodySway, y: cy };
                const legWalk = Math.sin(frame * 0.08 + li * 1.2) * 3;
                return (
                  <React.Fragment key={`leg-${li}`}>
                    <line x1={legBase.x} y1={legBase.y}
                      x2={legBase.x + sc.flipX * s * 0.4} y2={legBase.y + s * 0.25 + legWalk}
                      stroke="#1A0F05" strokeWidth={2} strokeLinecap="round" />
                    <line x1={legBase.x} y1={legBase.y}
                      x2={legBase.x - sc.flipX * s * 0.35} y2={legBase.y + s * 0.22 - legWalk}
                      stroke="#1A0F05" strokeWidth={2} strokeLinecap="round" />
                  </React.Fragment>
                );
              })}
              {/* body (prosoma + mesosoma) */}
              <ellipse cx={cx + bodySway} cy={cy} rx={s * 0.45} ry={s * 0.22}
                fill="url(#scorp-body)" stroke="#3A2A15" strokeWidth={1} />
              <ellipse cx={cx + bodySway} cy={cy} rx={s * 0.45} ry={s * 0.22}
                fill="url(#scorp-highlight)" />
              {/* tail (metasoma) */}
              <path d={tailPath} fill="none" stroke="url(#scorp-body)" strokeWidth={s * 0.12}
                strokeLinecap="round" strokeLinejoin="round" />
              {/* tail amber highlight */}
              <path d={tailPath} fill="none" stroke="#D4A050" strokeWidth={s * 0.04}
                strokeLinecap="round" opacity={0.25} />
              {/* stinger (telson) */}
              <line
                x1={tip.x} y1={tip.y}
                x2={tip.x + Math.cos(stingerAngle) * s * 0.2}
                y2={tip.y + Math.sin(stingerAngle) * s * 0.2}
                stroke="#AA3300" strokeWidth={3} strokeLinecap="round"
              />
              <circle
                cx={tip.x + Math.cos(stingerAngle) * s * 0.22}
                cy={tip.y + Math.sin(stingerAngle) * s * 0.22}
                r={2.5} fill="#CC4400"
              />
              {/* pincers (pedipalps) */}
              {[1, -1].map((side) => {
                const pincerBaseX = cx + sc.flipX * s * 0.45 + bodySway;
                const pincerBaseY = cy + side * s * 0.12;
                const armEndX = pincerBaseX + sc.flipX * s * 0.6;
                const armEndY = pincerBaseY + side * s * 0.15;
                const openAngle = pincerOpen * side * 0.4;
                const clawLen = s * 0.2;
                return (
                  <g key={`pincer-${side}`}>
                    {/* arm */}
                    <line x1={pincerBaseX} y1={pincerBaseY}
                      x2={armEndX} y2={armEndY}
                      stroke="#1A0F05" strokeWidth={3} strokeLinecap="round" />
                    {/* upper claw */}
                    <line x1={armEndX} y1={armEndY}
                      x2={armEndX + Math.cos(openAngle) * clawLen * sc.flipX}
                      y2={armEndY - Math.sin(Math.abs(openAngle)) * clawLen}
                      stroke="#1A0F05" strokeWidth={2.5} strokeLinecap="round" />
                    {/* lower claw */}
                    <line x1={armEndX} y1={armEndY}
                      x2={armEndX + Math.cos(-openAngle) * clawLen * sc.flipX}
                      y2={armEndY + Math.sin(Math.abs(openAngle)) * clawLen}
                      stroke="#1A0F05" strokeWidth={2.5} strokeLinecap="round" />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
