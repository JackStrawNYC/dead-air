/**
 * VJSceneCrossfade — renders two overlapping scene canvases with CSS opacity crossfade.
 * Uses SceneTransitionEngine state to drive opacity values.
 * Integrates AutoTransitionEngine for intelligent scene selection.
 * Respects blackout, freeze, and scene lock from VJStore.
 * Exposes audioState + transition progress for HUD consumption.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { SceneTransitionEngine } from "./SceneTransitionEngine";
import { AutoTransitionEngine } from "./AutoTransitionEngine";
import { VJShowIntelligence } from "./VJShowIntelligence";
import { ShowRecorder, type ShowEvent } from "./ShowRecorder";
import { VJCanvas } from "./VJCanvas";
import { AudioAnalyzer } from "../audio/AudioAnalyzer";
import { VJ_SCENES, type VJSceneEntry } from "../scenes/scene-list";
import { useVJStore } from "../state/VJStore";
import type { VisualMode } from "@visualizer/data/types";
import type { SmoothedAudioState } from "../audio/types";

interface Props {
  analyzer: AudioAnalyzer;
  /** Callback to expose audio state for HUD */
  onAudioState?: (state: SmoothedAudioState) => void;
  /** Callback to expose transition state for HUD */
  onTransitionState?: (progress: number, isTransitioning: boolean) => void;
}

export const VJSceneCrossfade: React.FC<Props> = ({ analyzer, onAudioState, onTransitionState }) => {
  const store = useVJStore();
  const engine = useRef(new SceneTransitionEngine(store.currentScene));
  const showIntelligence = useRef(new VJShowIntelligence());
  const recorder = useRef(new ShowRecorder());
  const lastRecording = useRef<ReturnType<ShowRecorder["stopRecording"]> | null>(null);
  const autoEngine = useRef<AutoTransitionEngine>(null!);
  if (!autoEngine.current) {
    autoEngine.current = new AutoTransitionEngine();
    autoEngine.current.setShowIntelligence(showIntelligence.current);
  }
  const [transitionState, setTransitionState] = useState(engine.current.state);
  const frozenTimeRef = useRef<number | null>(null);

  // Handle manual scene changes from store
  useEffect(() => {
    const scene = store.currentScene;
    if (scene !== engine.current.state.currentScene && !engine.current.state.isTransitioning) {
      engine.current.triggerTransition(scene, store.transitionSpeed);
      autoEngine.current.recordScene(scene);
      showIntelligence.current.recordSceneUsage(scene);
    }
  }, [store.currentScene, store.transitionSpeed]);

  // ShowRecorder — start/stop recording and playback based on store flags
  useEffect(() => {
    if (store.isRecording && !recorder.current.isRecording) {
      recorder.current.startRecording();
    } else if (!store.isRecording && recorder.current.isRecording) {
      lastRecording.current = recorder.current.stopRecording();
    }
  }, [store.isRecording]);

  useEffect(() => {
    if (store.isPlaying && lastRecording.current && !recorder.current.isPlaying) {
      const dispatch = (event: ShowEvent) => {
        const s = useVJStore.getState();
        switch (event.type) {
          case "scene_change":
            s.setCurrentScene(event.payload.scene as VisualMode);
            break;
          case "palette_change":
            if (event.payload.primary != null) s.setPalettePrimary(event.payload.primary as number);
            if (event.payload.secondary != null) s.setPaletteSecondary(event.payload.secondary as number);
            break;
          case "blackout":
            s.setBlackout(event.payload.value as boolean);
            break;
          case "freeze":
            s.setFreeze(event.payload.value as boolean);
            break;
          case "preset_recall":
            s.recallPreset(event.payload.slot as number);
            break;
          case "auto_transition_toggle":
            s.setAutoTransition(event.payload.value as boolean);
            break;
          case "lock_scene":
            s.setLockedScene(event.payload.value as boolean);
            break;
        }
      };
      recorder.current.startPlayback(lastRecording.current, dispatch);
    } else if (!store.isPlaying && recorder.current.isPlaying) {
      recorder.current.stopPlayback();
    }
  }, [store.isPlaying]);

  // Capture state changes as show events while recording
  useEffect(() => {
    if (!store.isRecording) return;
    const unsub = useVJStore.subscribe((state, prev) => {
      if (!recorder.current.isRecording) return;
      if (state.currentScene !== prev.currentScene) {
        recorder.current.recordEvent("scene_change", { scene: state.currentScene });
      }
      if (state.palettePrimary !== prev.palettePrimary || state.paletteSecondary !== prev.paletteSecondary) {
        recorder.current.recordEvent("palette_change", {
          primary: state.palettePrimary, secondary: state.paletteSecondary,
        });
      }
      if (state.blackout !== prev.blackout) {
        recorder.current.recordEvent("blackout", { value: state.blackout });
      }
      if (state.freeze !== prev.freeze) {
        recorder.current.recordEvent("freeze", { value: state.freeze });
      }
      if (state.autoTransition !== prev.autoTransition) {
        recorder.current.recordEvent("auto_transition_toggle", { value: state.autoTransition });
      }
      if (state.lockedScene !== prev.lockedScene) {
        recorder.current.recordEvent("lock_scene", { value: state.lockedScene });
      }
    });
    return unsub;
  }, [store.isRecording]);

  const handleStateUpdate = useCallback((audioState: SmoothedAudioState) => {
    // Expose audio state for HUD
    onAudioState?.(audioState);

    // Auto-transition via intelligent engine (skip if locked or frozen)
    if (store.autoTransition && !store.lockedScene && !store.freeze) {
      const now = performance.now() / 1000;
      const decision = autoEngine.current.evaluate({
        energy: audioState.energy,
        bass: audioState.bass,
        onset: audioState.onset,
        tempo: audioState.tempo,
        harmonicTension: audioState.harmonicTension,
        climaxPhase: audioState.climaxPhase,
        beatSnap: audioState.beatSnap,
      }, now);

      if (decision) {
        // Operator transitionMode override: if store has a non-default mode, use it
        const operatorMode = useVJStore.getState().transitionMode;
        const effectiveMode = operatorMode !== "linear" ? operatorMode : decision.transitionMode;
        engine.current.triggerTransition(
          decision.nextScene,
          decision.duration,
          effectiveMode,
          decision.beatDuration,
        );
        showIntelligence.current.recordSceneUsage(decision.nextScene);
        store.setCurrentScene(decision.nextScene);
      }
    }

    // Pass beat data to transition engine
    const isBeat = audioState.beatSnap > 0.8;
    engine.current.update(0, audioState.musicalTime, isBeat, audioState.tempo);
  }, [store, onAudioState]);

  // Animation loop for transition engine
  useEffect(() => {
    let prevTime = performance.now();
    let rafId: number;

    const tick = () => {
      const now = performance.now();
      const dt = (now - prevTime) / 1000;
      prevTime = now;

      // For linear mode, advance time-based progress here
      // Beat-synced modes are updated via handleStateUpdate with beat data
      if (engine.current.state.mode === "linear") {
        engine.current.update(dt);
      }

      const state = { ...engine.current.state };
      setTransitionState(state);
      onTransitionState?.(state.progress, state.isTransitioning);

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [onTransitionState]);

  const currentEntry = VJ_SCENES[transitionState.currentScene];
  const nextEntry = transitionState.nextScene ? VJ_SCENES[transitionState.nextScene] : null;

  // Blackout: render solid black
  if (store.blackout) {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }} />
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Current scene */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: transitionState.isTransitioning ? 1 - transitionState.progress : 1,
          transition: "opacity 0.05s linear",
        }}
      >
        <VJCanvas analyzer={analyzer} resolution={store.resolution}>
          {(state) => {
            if (!store.freeze) handleStateUpdate(state);
            return currentEntry ? <currentEntry.Component /> : null;
          }}
        </VJCanvas>
      </div>

      {/* Next scene (during crossfade) */}
      {transitionState.isTransitioning && nextEntry && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: transitionState.progress,
            transition: "opacity 0.05s linear",
          }}
        >
          <VJCanvas analyzer={analyzer} resolution={store.resolution}>
            {() => <nextEntry.Component />}
          </VJCanvas>
        </div>
      )}
    </div>
  );
};
