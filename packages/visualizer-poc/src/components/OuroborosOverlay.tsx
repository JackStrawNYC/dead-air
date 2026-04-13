/**
 * OuroborosOverlay — Snake eating its tail drawn as overlapping scales.
 *
 * The circle undulates (radius oscillates with beatDecay along the
 * circumference). Scales shimmer with phase-offset brightness.
 * Slow rotation. Ancient, mystical feel.
 *
 * Audio reactivity:
 *   beatDecay    -> radius undulation
 *   energy       -> scale shimmer brightness
 *   slowEnergy   -> body thickness
 *   bass         -> undulation amplitude
 *   chromaHue    -> scale palette
 *   tempoFactor  -> rotation speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const SCALE_COUNT = 36;

interface Props {
  frames: EnhancedFrameData[];
}

export const OuroborosOverlay: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.40;
  if (masterOpacity < 0.01) return null;

  const baseSize = Math.min(width, height) * 0.55;
  const cx = 200;
  const cy = 200;
  const baseR = 80;

  const hue = snap.chromaHue;
  const rotation = (frame / 30) * 0.5 * tempoFactor;
  const undulationAmp = 4 + snap.bass * 10;
  const undulationFreq = 3; // waves around circumference

  // Scale colors — bronze/copper tones shifted by chroma
  const scaleHue = ((35 + (hue - 180) * 0.12) % 360 + 360) % 360;
  const bodyThick = 10 + snap.slowEnergy * 6;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg
        width={baseSize}
        height={baseSize}
        viewBox="0 0 400 400"
        fill="none"
        style={{ opacity: masterOpacity, transform: `rotate(${rotation}deg)`, willChange: "transform, opacity" }}
      >
        <defs>
          <filter id="ob-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter="url(#ob-glow)">
          {/* Body path — undulating circle */}
          {(() => {
            const pts: string[] = [];
            const segments = 120;
            for (let i = 0; i <= segments; i++) {
              const t = i / segments;
              const angle = t * Math.PI * 2;
              const undulation = Math.sin(angle * undulationFreq + frame * 0.03 * tempoFactor) * undulationAmp * snap.beatDecay;
              const r = baseR + undulation;
              const x = cx + Math.cos(angle) * r;
              const y = cy + Math.sin(angle) * r;
              pts.push(i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `L ${x.toFixed(1)} ${y.toFixed(1)}`);
            }
            return (
              <path
                d={pts.join(" ")}
                stroke={`hsl(${scaleHue}, 35%, 30%)`}
                strokeWidth={bodyThick}
                fill="none"
                strokeLinecap="round"
                opacity={0.6}
              />
            );
          })()}

          {/* Scales — overlapping along the body */}
          {Array.from({ length: SCALE_COUNT }, (_, i) => {
            const t = i / SCALE_COUNT;
            const angle = t * Math.PI * 2;
            const undulation = Math.sin(angle * undulationFreq + frame * 0.03 * tempoFactor) * undulationAmp * snap.beatDecay;
            const r = baseR + undulation;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;

            // Scale size varies slightly
            const scaleR = bodyThick * 0.55;
            const shimmer = 0.4 + Math.sin(frame * 0.05 + i * 0.7) * 0.3 + snap.energy * 0.3;
            const lightness = 35 + shimmer * 20;
            const saturation = 30 + shimmer * 15;

            // Scale as small overlapping arc
            const scaleAngle = (angle * 180) / Math.PI + 90;

            return (
              <g key={`sc-${i}`} transform={`translate(${x.toFixed(1)}, ${y.toFixed(1)}) rotate(${scaleAngle.toFixed(1)})`}>
                <ellipse
                  cx={0}
                  cy={0}
                  rx={scaleR * 0.7}
                  ry={scaleR}
                  fill={`hsl(${scaleHue + (i % 3) * 5}, ${saturation}%, ${lightness}%)`}
                  stroke={`hsl(${scaleHue}, 25%, 22%)`}
                  strokeWidth={0.4}
                  opacity={shimmer}
                />
              </g>
            );
          })}

          {/* Head — slightly larger, at angle 0 */}
          {(() => {
            const headAngle = 0;
            const headR = baseR + Math.sin(headAngle * undulationFreq + frame * 0.03 * tempoFactor) * undulationAmp * snap.beatDecay;
            const hx = cx + Math.cos(headAngle) * headR;
            const hy = cy + Math.sin(headAngle) * headR;
            return (
              <g>
                <ellipse
                  cx={hx}
                  cy={hy}
                  rx={bodyThick * 0.8}
                  ry={bodyThick * 0.6}
                  fill={`hsl(${scaleHue}, 40%, 32%)`}
                  opacity={0.85}
                />
                {/* Eye */}
                <circle cx={hx + 3} cy={hy - 2} r={1.5} fill={`hsl(${scaleHue + 30}, 70%, 60%)`} />
                {/* Jaw opening toward tail */}
                <path
                  d={`M ${hx + bodyThick * 0.6} ${hy - 2} L ${hx + bodyThick * 1.1} ${hy} L ${hx + bodyThick * 0.6} ${hy + 2}`}
                  stroke={`hsl(${scaleHue}, 30%, 25%)`}
                  strokeWidth={0.8}
                  fill="none"
                />
              </g>
            );
          })()}

          {/* Tail taper — at angle just before 2pi */}
          {(() => {
            const tailAngle = Math.PI * 2 - 0.15;
            const tailR = baseR + Math.sin(tailAngle * undulationFreq + frame * 0.03 * tempoFactor) * undulationAmp * snap.beatDecay;
            const tx = cx + Math.cos(tailAngle) * tailR;
            const ty = cy + Math.sin(tailAngle) * tailR;
            return (
              <ellipse
                cx={tx}
                cy={ty}
                rx={bodyThick * 0.3}
                ry={bodyThick * 0.5}
                fill={`hsl(${scaleHue}, 35%, 28%)`}
                opacity={0.7}
                transform={`rotate(-10 ${tx} ${ty})`}
              />
            );
          })()}
        </g>
      </svg>
    </div>
  );
};
