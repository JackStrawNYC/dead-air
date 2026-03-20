/**
 * CameraMotion — virtual camera wrapper that adds pans/zooms/shakes
 * synced to audio energy.
 *
 * - Base scale 1.04x (always slightly overscaled, cropped by overflow:hidden)
 * - Quiet passages: slow zoom-in to 1.08x
 * - Peak energy: pull-back to 1.03x
 * - Beat hits: ±3px micro-shake with 8-frame exponential decay
 * - Long jams: phase-driven zoom/drift (exploration → build → peak → resolution)
 * - Pure CSS transforms — negligible performance cost
 */

import React from "react";
import { useCurrentFrame } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import type { JamEvolution, JamPhase } from "../utils/jam-evolution";
import { energyGate } from "../utils/math";

interface Props {
  frames: EnhancedFrameData[];
  children: React.ReactNode;
  jamEvolution?: JamEvolution;
  /** Bass energy from AudioSnapshot (0-1) for bass-driven shake scaling */
  bass?: number;
  /** Counterpoint camera freeze — hold transform still when true */
  cameraFreeze?: boolean;
  /** Drums/Space sub-phase for phase-specific camera behavior */
  drumsSpacePhase?: string;
  /** Fast-responding energy (8-frame window) for snappier zoom response */
  fastEnergy?: number;
  /** Vocal presence factor (0-1) for intimate camera during singing */
  vocalPresence?: number;
  /** Whether a solo is detected */
  isSolo?: boolean;
  /** Solo intensity (0-1) for dramatic zoom */
  soloIntensity?: number;
  /** Groove motion multiplier — scales drift amplitude and Hz */
  grooveMotionMult?: number;
  /** Groove pulse multiplier — scales shake intensity */
  groovePulseMult?: number;
  /** Section drift speed multiplier — scales drift amplitude */
  sectionDriftMult?: number;
  /** Camera steadiness from section vocabulary: 0 = handheld chaos, 1 = locked tripod.
   *  Scales shake/jolt amplitude — verses/space steady, jams/solos loose. */
  cameraSteadiness?: number;
  /** Climax camera drama level (0 normal, 0-1 extreme — widens zoom, faster shakes) */
  cameraDrama?: number;
}

const QUIET_SCALE = 1.12;
const PEAK_SCALE = 1.02;
const SHAKE_PX = 15;
const SHAKE_DECAY_FRAMES = 12;
const TILT_DEG = 4.0;         // Max rotational tilt on bass kicks
const TILT_DECAY_FRAMES = 10; // Exponential decay for tilt

/** Phase-driven camera parameters for long jams */
const PHASE_CAMERA: Record<JamPhase, {
  zoomStart: number; zoomEnd: number;
  driftAmp: number; driftHz: number;
}> = {
  exploration: { zoomStart: 1.04, zoomEnd: 1.04, driftAmp: 6, driftHz: 0.03 },
  building:    { zoomStart: 1.04, zoomEnd: 1.07, driftAmp: 4, driftHz: 0.04 },
  peak_space:  { zoomStart: 1.07, zoomEnd: 1.06, driftAmp: 1.5, driftHz: 0.02 },
  resolution:  { zoomStart: 1.06, zoomEnd: 1.03, driftAmp: 5, driftHz: 0.025 },
};

/** Simple seeded hash for deterministic shake direction */
function shakeHash(frame: number): { x: number; y: number } {
  const s = Math.sin(frame * 12.9898 + 78.233) * 43758.5453;
  const x = (s - Math.floor(s)) * 2 - 1;
  const s2 = Math.sin(frame * 78.233 + 12.9898) * 23421.6312;
  const y = (s2 - Math.floor(s2)) * 2 - 1;
  return { x, y };
}

export const CameraMotion: React.FC<Props> = ({ frames, children, jamEvolution, bass, cameraFreeze, drumsSpacePhase, fastEnergy, vocalPresence, isSolo, soloIntensity, grooveMotionMult = 1, groovePulseMult = 1, sectionDriftMult = 1, cameraSteadiness = 0.5, cameraDrama = 0 }) => {
  const frozenTransform = React.useRef({ scale: 1.04, totalX: 0, totalY: 0, tilt: 0 });
  const frame = useCurrentFrame();
  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Smoothed energy for zoom (rolling 90-frame window)
  let energySum = 0;
  let count = 0;
  for (let i = Math.max(0, idx - 45); i <= Math.min(frames.length - 1, idx + 45); i++) {
    energySum += frames[i].rms;
    count++;
  }
  const smoothEnergy = count > 0 ? energySum / count : 0;
  const egate = energyGate(smoothEnergy);

  // Energy-based zoom: blend fastEnergy for snappier zoom snap
  const blendedEnergy = smoothEnergy + (fastEnergy ?? 0) * 0.3;
  const energyT = Math.min(1, blendedEnergy * 5);
  const energyScale = QUIET_SCALE + (PEAK_SCALE - QUIET_SCALE) * energyT;

  // Determine final scale and drift
  let scale: number;
  let driftX = 0;
  let driftY = 0;

  if (jamEvolution && jamEvolution.isLongJam) {
    // Phase-driven camera for long jams: 60% phase zoom + 40% energy zoom
    const phaseParams = PHASE_CAMERA[jamEvolution.phase];
    const phaseProgress = jamEvolution.phaseProgress;
    const phaseZoom = phaseParams.zoomStart + (phaseParams.zoomEnd - phaseParams.zoomStart) * phaseProgress;
    scale = phaseZoom * 0.6 + energyScale * 0.4;

    // Sinusoidal lateral drift — energy-gated: near-still in silence
    // grooveMotionMult + sectionDriftMult amplify drift amplitude and frequency
    const time = frame / 30; // seconds
    const driftGate = 0.05 + 0.95 * egate;
    const combinedDriftMult = grooveMotionMult * sectionDriftMult;
    driftX = Math.sin(time * phaseParams.driftHz * grooveMotionMult * Math.PI * 2) * phaseParams.driftAmp * combinedDriftMult * driftGate;
    driftY = Math.cos(time * phaseParams.driftHz * grooveMotionMult * Math.PI * 2 * 0.7 + 1.3) * phaseParams.driftAmp * 0.6 * combinedDriftMult * driftGate;
  } else {
    // Short songs: existing energy-only behavior
    scale = energyScale;
  }

  // Climax camera drama: widen zoom and amplify drift during peak moments
  scale = scale + cameraDrama * 0.06; // up to +6% zoom at peak drama
  driftX *= 1 + cameraDrama * 0.5;
  driftY *= 1 + cameraDrama * 0.5;

  // Micro-shake on beat hits (prefer stemDrumBeat when available)
  let shakeX = 0;
  let shakeY = 0;
  for (let ago = 0; ago < SHAKE_DECAY_FRAMES; ago++) {
    const checkIdx = idx - ago;
    if (checkIdx < 0) break;
    const f = frames[checkIdx];
    const hasBeat = (f.stemDrumBeat != null ? f.stemDrumBeat : f.beat) && (f.stemDrumOnset ?? f.onset) > 0.25;
    if (hasBeat) {
      const decay = Math.exp(-ago * 0.7);
      const dir = shakeHash(checkIdx);
      shakeX += dir.x * SHAKE_PX * decay * egate;
      shakeY += dir.y * SHAKE_PX * decay * egate;
      break; // use the most recent beat
    }
  }

  // Apply groovePulseMult to beat shake
  shakeX *= groovePulseMult;
  shakeY *= groovePulseMult;

  // Climax drama amplifies shake by up to 100%
  shakeX *= 1 + cameraDrama * 1.0;
  shakeY *= 1 + cameraDrama * 1.0;

  // Apply section-vocabulary camera steadiness: 1.0 = tripod (20% shake), 0.0 = handheld (100%)
  const steadinessDampen = 1 - cameraSteadiness * 0.8;
  shakeX *= steadinessDampen;
  shakeY *= steadinessDampen;

  // Onset jolt: sharp camera punch on transient attacks (prefer stemDrumOnset when available)
  const ONSET_JOLT_PX = 8;
  const ONSET_JOLT_DECAY = 8;
  for (let ago = 0; ago < ONSET_JOLT_DECAY; ago++) {
    const checkIdx = idx - ago;
    if (checkIdx < 0) break;
    const f = frames[checkIdx];
    const onsetVal = f.stemDrumOnset ?? f.onset;
    if (onsetVal > 0.5) {
      const decay = Math.exp(-ago * 1.2);
      const dir = shakeHash(checkIdx + 9973);
      shakeX += dir.x * ONSET_JOLT_PX * onsetVal * decay * egate;
      shakeY += dir.y * ONSET_JOLT_PX * onsetVal * decay * egate;
      break;
    }
  }

  // Rotational tilt on bass kicks: ±2deg with fast decay
  // Scans backward for the most recent strong bass hit and applies
  // a decaying tilt in a deterministic direction
  let tiltDeg = 0;
  for (let ago = 0; ago < TILT_DECAY_FRAMES; ago++) {
    const checkIdx = idx - ago;
    if (checkIdx < 0) break;
    const f = frames[checkIdx];
    const bassHit = (f.stemDrumOnset ?? f.onset) > 0.4 && (f.sub + f.low) > 0.3;
    if (bassHit) {
      const decay = Math.exp(-ago * 0.8);
      const dir = shakeHash(checkIdx + 7777);
      tiltDeg = dir.x * TILT_DEG * decay * egate;
      break;
    }
  }

  // Bass-driven continuous micro-sway (energy-gated: true stillness in silence)
  const bassGate = egate;
  const bassAmp = (bass ?? 0) * 12.0 * bassGate;
  const bassT = frame / 30;
  shakeX += Math.sin(bassT * 3.7) * bassAmp * 0.5;
  shakeY += Math.cos(bassT * 2.3) * bassAmp * 0.3;

  // Drums/Space phase-specific camera overrides
  if (drumsSpacePhase === "space_ambient") {
    // Near-zero shake, very slow drift, intimate zoom
    shakeX *= 0.1;
    shakeY *= 0.1;
    const slowDrift = 0.5; // px/s
    driftX = Math.sin(bassT * 0.02 * Math.PI * 2) * slowDrift;
    driftY = Math.cos(bassT * 0.02 * Math.PI * 2 * 0.7) * slowDrift * 0.6;
    scale = 1.02; // intimate zoom
  } else if (drumsSpacePhase === "drums_tribal") {
    // Amplified shake for primal energy
    shakeX *= 1.5;
    shakeY *= 1.5;
  }

  // Vocal intimacy: reduce shake 40%, gentle 1% zoom in during singing
  if (vocalPresence && vocalPresence > 0.3) {
    const vocalFactor = Math.min(1, vocalPresence);
    shakeX *= 1 - vocalFactor * 0.4;
    shakeY *= 1 - vocalFactor * 0.4;
    scale *= 1 + vocalFactor * 0.01; // gentle zoom in
  }

  // Solo zoom: dramatic slow push during solos (up to 1.5% zoom)
  if (isSolo && soloIntensity && soloIntensity > 0) {
    scale *= 1 + soloIntensity * 0.015;
  }

  let totalX = shakeX + driftX;
  let totalY = shakeY + driftY;

  // Camera freeze: hold previous frame's transform during counterpoint freeze
  if (cameraFreeze) {
    scale = frozenTransform.current.scale;
    totalX = frozenTransform.current.totalX;
    totalY = frozenTransform.current.totalY;
    tiltDeg = frozenTransform.current.tilt;
  } else {
    frozenTransform.current = { scale, totalX, totalY, tilt: tiltDeg };
  }

  // Edge DOF blur: subtle blur at edges during energy peaks
  // Creates a depth-of-field feel — center stays sharp, edges soften
  const dofBlur = Math.min(3, blendedEnergy * 8); // 0-3px blur at edges

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${scale.toFixed(4)}) translate(${totalX.toFixed(2)}px, ${totalY.toFixed(2)}px) rotate(${tiltDeg.toFixed(3)}deg)`,
          willChange: "transform",
        }}
      >
        {children}
      </div>
      {/* Edge DOF vignette: radial blur at screen edges during peaks */}
      {dofBlur > 0.2 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backdropFilter: `blur(${dofBlur.toFixed(1)}px)`,
            WebkitBackdropFilter: `blur(${dofBlur.toFixed(1)}px)`,
            maskImage: "radial-gradient(ellipse 60% 60% at 50% 50%, transparent 50%, black 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 60% 60% at 50% 50%, transparent 50%, black 100%)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};
