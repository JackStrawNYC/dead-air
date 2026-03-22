/**
 * StealYourFaceOff -- The Stealie shattering apart and reforming.
 * Energy-reactive: calm = intact, building = vibrating, peak = full shatter.
 * No timer-based cycles -- renders whenever active (rotation engine controls timing).
 * Shatter on high onset, reform magnetically as energy drops.
 * ChromaHue-driven neon palette. Bolt glows with onset flashes.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { seeded } from "../utils/seededRandom";

interface Fragment {
  id: string;
  driftAngle: number;
  driftDistance: number;
  rotSpeed: number;
  rotDir: number;
  scaleJitter: number;
  /** How much this fragment vibrates during build-up */
  vibrateAmp: number;
}

function generateFragments(seed: number): Fragment[] {
  const rng = seeded(seed);
  const ids = [
    "outer-ring",
    "inner-ring",
    "top-half-fill",
    "bottom-half-fill",
    "horizontal-line",
    "bolt-upper",
    "bolt-lower",
    "left-eye",
    "right-eye",
  ];
  return ids.map((id) => ({
    id,
    driftAngle: rng() * Math.PI * 2,
    driftDistance: 100 + rng() * 250,
    rotSpeed: (rng() - 0.5) * 5,
    rotDir: rng() > 0.5 ? 1 : -1,
    scaleJitter: 0.85 + rng() * 0.3,
    vibrateAmp: 1 + rng() * 3,
  }));
}

/** Onset peak tracker — detects when to trigger shatter */
function computeShatterState(
  energy: number,
  onsetEnvelope: number,
  fastEnergy: number,
): { shatterProgress: number; isBuilding: boolean } {
  // Three zones:
  // Calm (energy < 0.15): intact stealie
  // Building (0.15 < energy < 0.4): vibrating fragments
  // Peak (energy > 0.4 OR high onset): full shatter

  const peakSignal = Math.max(
    interpolate(energy, [0.3, 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(onsetEnvelope, [0.4, 0.9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(fastEnergy, [0.35, 0.65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );

  const isBuilding = energy > 0.12 && peakSignal < 0.5;

  return {
    shatterProgress: peakSignal,
    isBuilding,
  };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const StealYourFaceOff: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);

  const fragments = React.useMemo(() => generateFragments(19_770_508), []);

  const { energy, onsetEnvelope, fastEnergy, chromaHue, beatDecay } = snap;

  const { shatterProgress, isBuilding } = computeShatterState(energy, onsetEnvelope, fastEnergy);

  // Master opacity — always visible when rotation engine renders us, dimmer when very quiet
  const masterOpacity = interpolate(energy, [0.02, 0.1, 0.3], [0.5, 0.75, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cx = width / 2;
  const cy = height / 2;
  const baseSize = Math.min(width, height) * 0.25;

  // ChromaHue-driven neon palette
  const hue = chromaHue;
  const mainColor = `hsl(${hue}, 100%, 65%)`;
  const boltColor = `hsl(${(hue + 120) % 360}, 100%, 70%)`;
  const accentColor = `hsl(${(hue + 240) % 360}, 90%, 60%)`;
  const glowColor = `hsla(${hue}, 100%, 70%, 0.6)`;
  const boltGlowColor = `hsla(${(hue + 120) % 360}, 100%, 75%, 0.8)`;

  // Bolt onset flash intensity
  const boltFlash = interpolate(onsetEnvelope, [0.2, 0.8], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Render a fragment with energy-reactive transforms
  const renderFragment = (fragIdx: number, children: React.ReactNode) => {
    const frag = fragments[fragIdx];

    // Direct energy-driven drift distance (no 5s averaging)
    const drift = shatterProgress;

    // Magnetic reform: ease-in cubic for the pull-back feel
    const magneticDrift = drift < 0.5
      ? drift * 2  // linear push out
      : Easing.out(Easing.cubic)(drift); // smooth settle at full shatter

    const dx = Math.cos(frag.driftAngle) * frag.driftDistance * magneticDrift;
    const dy = Math.sin(frag.driftAngle) * frag.driftDistance * magneticDrift;
    const rot = drift * frag.rotSpeed * 180 * frag.rotDir;
    const scale = 1 + (frag.scaleJitter - 1) * drift;

    // Vibration during build-up — fragments jitter in place
    let vibeX = 0;
    let vibeY = 0;
    if (isBuilding && drift < 0.3) {
      const vibeIntensity = interpolate(energy, [0.12, 0.35], [0, 1], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });
      vibeX = Math.sin(frame * 0.8 + fragIdx * 2.1) * frag.vibrateAmp * vibeIntensity;
      vibeY = Math.cos(frame * 0.9 + fragIdx * 1.7) * frag.vibrateAmp * vibeIntensity;
    }

    return (
      <g
        key={frag.id}
        transform={`translate(${dx + vibeX}, ${dy + vibeY}) rotate(${rot}) scale(${scale})`}
        style={{
          transition: drift < 0.1 ? "transform 0.15s ease-out" : undefined,
        }}
      >
        {children}
      </g>
    );
  };

  // Whole-stealie breathing scale when calm
  const breathe = shatterProgress < 0.1
    ? 1 + Math.sin(frame * 0.03) * 0.015 + beatDecay * 0.02
    : 1;

  // Glow intensity scales with energy
  const glowRadius1 = 10 + energy * 15 + boltFlash * 8;
  const glowRadius2 = 20 + energy * 30 + boltFlash * 16;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <g
          transform={`translate(${cx}, ${cy}) scale(${(baseSize / 100) * breathe})`}
          style={{
            filter: `drop-shadow(0 0 ${glowRadius1}px ${glowColor}) drop-shadow(0 0 ${glowRadius2}px ${glowColor})`,
          }}
        >
          {/* Fragment 0: Outer ring */}
          {renderFragment(0, (
            <circle cx={0} cy={0} r={94} fill="none" stroke={mainColor} strokeWidth={5} />
          ))}

          {/* Fragment 1: Inner ring */}
          {renderFragment(1, (
            <circle cx={0} cy={0} r={88} fill="none" stroke={mainColor} strokeWidth={1.5} opacity={0.5} />
          ))}

          {/* Fragment 2: Top half fill (skull dome) */}
          {renderFragment(2, (
            <path
              d="M -88 0 A 88 88 0 0 1 88 0 L -88 0 Z"
              fill={accentColor}
              opacity={0.12 + energy * 0.08}
            />
          ))}

          {/* Fragment 3: Bottom half fill */}
          {renderFragment(3, (
            <path
              d="M -88 0 A 88 88 0 0 0 88 0 L -88 0 Z"
              fill={mainColor}
              opacity={0.06 + energy * 0.06}
            />
          ))}

          {/* Fragment 4: Horizontal line */}
          {renderFragment(4, (
            <line x1={-94} y1={0} x2={94} y2={0} stroke={mainColor} strokeWidth={3} />
          ))}

          {/* Fragment 5: Upper lightning bolt — glows with onset */}
          {renderFragment(5, (
            <g style={{
              filter: boltFlash > 0.1
                ? `drop-shadow(0 0 ${8 + boltFlash * 20}px ${boltGlowColor})`
                : undefined,
            }}>
              <polygon
                points="0,-88 -12,-18 8,-18"
                fill={boltColor}
                opacity={0.8 + boltFlash * 0.2}
              />
            </g>
          ))}

          {/* Fragment 6: Lower lightning bolt — glows with onset */}
          {renderFragment(6, (
            <g style={{
              filter: boltFlash > 0.1
                ? `drop-shadow(0 0 ${8 + boltFlash * 20}px ${boltGlowColor})`
                : undefined,
            }}>
              <polygon
                points="-22,88 18,5 -4,5"
                fill={boltColor}
                opacity={0.8 + boltFlash * 0.2}
              />
            </g>
          ))}

          {/* Fragment 7: Left eye */}
          {renderFragment(7, (
            <>
              <circle cx={-32} cy={-24} r={18} fill="none" stroke={mainColor} strokeWidth={3} />
              <circle cx={-32} cy={-24} r={8} fill={mainColor} opacity={0.2 + energy * 0.15} />
            </>
          ))}

          {/* Fragment 8: Right eye */}
          {renderFragment(8, (
            <>
              <circle cx={32} cy={-24} r={18} fill="none" stroke={mainColor} strokeWidth={3} />
              <circle cx={32} cy={-24} r={8} fill={mainColor} opacity={0.2 + energy * 0.15} />
            </>
          ))}

          {/* Center bolt glow flash on strong onsets */}
          {boltFlash > 0.3 && (
            <ellipse
              cx={0} cy={0} rx={20 + boltFlash * 15} ry={60 + boltFlash * 20}
              fill={boltGlowColor}
              opacity={boltFlash * 0.15}
            />
          )}
        </g>
      </svg>
    </div>
  );
};
