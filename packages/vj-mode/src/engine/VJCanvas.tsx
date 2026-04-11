/**
 * VJCanvas — R3F Canvas with useFrame loop driving the audio pipeline.
 * AudioAnalyzer → FeatureExtractor → RollingAudioState → context update.
 */

import React, { useRef, useCallback, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { AudioAnalyzer } from "../audio/AudioAnalyzer";
import { extractFeatures, resetExtractor } from "../audio/FeatureExtractor";
import { BeatDetector } from "../audio/BeatDetector";
import { RollingAudioState } from "../audio/RollingAudioState";
import { VJAudioProvider } from "./VJAudioContext";
import type { SmoothedAudioState } from "../audio/types";
import { useVJStore } from "../state/VJStore";

/** Default SmoothedAudioState for initial render before audio starts */
function defaultState(): SmoothedAudioState {
  return {
    rms: 0, bass: 0, mids: 0, highs: 0, centroid: 0,
    energy: 0, slowEnergy: 0, fastEnergy: 0, fastBass: 0,
    onset: 0, onsetSnap: 0, beatSnap: 0, beatDecay: 0,
    drumOnset: 0, drumBeat: 0, spectralFlux: 0,
    chromaHue: 0, chromaShift: 0, afterglowHue: 0,
    flatness: 0, chroma: new Array(12).fill(0), contrast: new Array(7).fill(0),
    sectionProgress: 0, sectionIndex: 0,
    stemBass: 0, vocalEnergy: 0, vocalPresence: 0, otherEnergy: 0, otherCentroid: 0,
    musicalTime: 0, tempo: 120, isBeat: false,
    climaxPhase: 0, climaxIntensity: 0,
    time: 0, dynamicTime: 0,
    palettePrimary: 210 / 360, paletteSecondary: 270 / 360, paletteSaturation: 1,
    chordIndex: 0, chordConfidence: 0, harmonicTension: 0,
    beatStability: 0, beatConfidence: 0,
    sectionType: "verse",
    jamDensity: 0, isLongJam: false, coherence: 0, isLocked: false,
  };
}

/** Inner component that uses useFrame inside the Canvas */
const AudioLoop: React.FC<{
  analyzer: AudioAnalyzer;
  onStateUpdate: (s: SmoothedAudioState) => void;
}> = ({ analyzer, onStateUpdate }) => {
  const rollingState = useRef(new RollingAudioState());
  const beatDetector = useRef(new BeatDetector(60));
  const startTime = useRef(performance.now());
  const prevTime = useRef(performance.now());

  const store = useVJStore();

  useFrame(() => {
    if (!analyzer.isActive) return;

    const now = performance.now();
    const deltaTime = Math.min((now - prevTime.current) / 1000, 0.1); // cap at 100ms
    const elapsedTime = (now - startTime.current) / 1000;
    prevTime.current = now;

    // Extract raw features from FFT
    const fftData = analyzer.getFrequencyData();
    const raw = extractFeatures(fftData, analyzer.sampleRate);

    // Beat detection
    const beat = beatDetector.current.detect(raw.onset, now);

    // Smooth into state
    const smoothed = rollingState.current.update(raw, beat, deltaTime, elapsedTime);

    // Apply palette from store
    const energyHueShift = smoothed.energy * (30 / 360);
    smoothed.palettePrimary = store.palettePrimary / 360 + energyHueShift;
    smoothed.paletteSecondary = store.paletteSecondary / 360 + energyHueShift;
    smoothed.paletteSaturation = store.paletteSaturation;
    smoothed.jamDensity = store.jamDensity;

    onStateUpdate(smoothed);
  });

  return null;
};

interface VJCanvasProps {
  children: (state: SmoothedAudioState) => React.ReactNode;
  analyzer: AudioAnalyzer;
  resolution?: number;
}

export const VJCanvas: React.FC<VJCanvasProps> = ({
  children,
  analyzer,
  resolution = 1,
}) => {
  const [audioState, setAudioState] = useState<SmoothedAudioState>(defaultState);

  const handleStateUpdate = useCallback((s: SmoothedAudioState) => {
    setAudioState({ ...s });
  }, []);

  useEffect(() => {
    return () => {
      resetExtractor();
    };
  }, []);

  const dpr = Math.min(window.devicePixelRatio * resolution, 1.5);

  return (
    <Canvas
      dpr={dpr}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
        stencil: false,
        depth: false,
      }}
      camera={{ position: [0, 0, 5], fov: 50 }}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <AudioLoop analyzer={analyzer} onStateUpdate={handleStateUpdate} />
      <VJAudioProvider state={audioState}>
        {children(audioState)}
      </VJAudioProvider>
    </Canvas>
  );
};
