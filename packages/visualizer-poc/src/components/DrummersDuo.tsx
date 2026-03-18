/**
 * DrummersDuo — Layer 6 (Character)
 * Bill + Mickey silhouettes. Drumstick motion on uDrumOnset. Cymbal splash on beats.
 * For Drums/Space segments.
 * Tier B | Tags: dead-culture, intense | dutyCycle: 100 | energyBand: mid
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";

const STAGGER_START = 150;

interface Props {
  frames: EnhancedFrameData[];
}

export const DrummersDuo: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const f = frames[idx];
  const energy = f.rms;
  const drumOnset = f.stemDrumOnset ?? f.onset;
  const beat = f.beat;

  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const masterOpacity = interpolate(energy, [0.05, 0.15, 0.35], [0.02, 0.10, 0.07], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * masterFade;

  if (masterOpacity < 0.005) return null;

  // Drumstick angle driven by onset
  const stickAngleBill = -30 + drumOnset * 50 * Math.sin(frame * 0.5);
  const stickAngleMickey = -30 + drumOnset * 50 * Math.cos(frame * 0.5 + 1);

  // Cymbal splash
  let framesSinceBeat = 999;
  for (let i = idx; i >= Math.max(0, idx - 10); i--) {
    if (frames[i].beat || (frames[i].stemDrumBeat)) {
      framesSinceBeat = idx - i;
      break;
    }
  }
  const cymbalFlash = framesSinceBeat < 8 ? Math.exp(-framesSinceBeat * 0.4) : 0;

  // Positions
  const billX = width * 0.38;
  const mickeyX = width * 0.62;
  const drummerY = height * 0.6;

  const hue = 35; // warm amber

  const renderDrummer = (cx: number, stickAngle: number, mirror: boolean) => {
    const scale = mirror ? -1 : 1;
    return (
      <g transform={`translate(${cx}, ${drummerY}) scale(${scale * 0.6}, 0.6)`}>
        {/* Head */}
        <circle cx={0} cy={-80} r={12} fill={`hsla(${hue}, 30%, 50%, 0.6)`} />
        {/* Body */}
        <ellipse cx={0} cy={-50} rx={16} ry={25} fill={`hsla(${hue}, 30%, 45%, 0.5)`} />
        {/* Arm + drumstick */}
        <g transform={`translate(12, -60) rotate(${stickAngle})`}>
          <line x1={0} y1={0} x2={35} y2={-5} stroke={`hsla(${hue}, 30%, 55%, 0.6)`} strokeWidth={4} strokeLinecap="round" />
          {/* Stick */}
          <line x1={30} y1={-5} x2={55} y2={-15} stroke={`hsla(${hue}, 40%, 65%, 0.7)`} strokeWidth={2} strokeLinecap="round" />
        </g>
        {/* Other arm */}
        <g transform={`translate(-12, -60) rotate(${-stickAngle * 0.7})`}>
          <line x1={0} y1={0} x2={-35} y2={-5} stroke={`hsla(${hue}, 30%, 55%, 0.6)`} strokeWidth={4} strokeLinecap="round" />
          <line x1={-30} y1={-5} x2={-55} y2={-15} stroke={`hsla(${hue}, 40%, 65%, 0.7)`} strokeWidth={2} strokeLinecap="round" />
        </g>
        {/* Drum kit outline */}
        <ellipse cx={0} cy={-15} rx={30} ry={12} fill="none" stroke={`hsla(${hue}, 30%, 50%, 0.3)`} strokeWidth={1.5} />
        <ellipse cx={-25} cy={-25} rx={15} ry={8} fill="none" stroke={`hsla(${hue}, 30%, 50%, 0.25)`} strokeWidth={1} />
        <ellipse cx={25} cy={-25} rx={15} ry={8} fill="none" stroke={`hsla(${hue}, 30%, 50%, 0.25)`} strokeWidth={1} />
        {/* Cymbal */}
        <ellipse cx={35} cy={-50} rx={18} ry={4} fill={`hsla(50, 50%, 60%, ${0.15 + cymbalFlash * 0.4})`} />
      </g>
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, mixBlendMode: "screen" }}>
        {/* Cymbal splash circles */}
        {cymbalFlash > 0.05 && (
          <>
            <circle cx={billX + 20} cy={drummerY - 30} r={15 + cymbalFlash * 30} fill="none"
              stroke={`hsla(50, 60%, 70%, ${cymbalFlash * 0.3})`} strokeWidth={1} />
            <circle cx={mickeyX - 20} cy={drummerY - 30} r={15 + cymbalFlash * 30} fill="none"
              stroke={`hsla(50, 60%, 70%, ${cymbalFlash * 0.3})`} strokeWidth={1} />
          </>
        )}
        {/* Bill */}
        {renderDrummer(billX, stickAngleBill, false)}
        {/* Mickey */}
        {renderDrummer(mickeyX, stickAngleMickey, true)}
      </svg>
    </div>
  );
};
