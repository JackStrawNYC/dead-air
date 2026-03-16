/**
 * VJSceneCrossfade — renders two overlapping scene canvases with CSS opacity crossfade.
 * Uses SceneTransitionEngine state to drive opacity values.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { SceneTransitionEngine } from "./SceneTransitionEngine";
import { VJCanvas } from "./VJCanvas";
import { AudioAnalyzer } from "../audio/AudioAnalyzer";
import { VJ_SCENES, type VJSceneEntry } from "../scenes/scene-list";
import { useVJStore } from "../state/VJStore";
import { TRANSITION_AFFINITY } from "../scenes/transition-affinity";
import type { VisualMode } from "@visualizer/data/types";
import type { SmoothedAudioState } from "../audio/types";

interface Props {
  analyzer: AudioAnalyzer;
}

export const VJSceneCrossfade: React.FC<Props> = ({ analyzer }) => {
  const store = useVJStore();
  const engine = useRef(new SceneTransitionEngine(store.currentScene));
  const [transitionState, setTransitionState] = useState(engine.current.state);
  const lastAutoTransition = useRef(0);
  const prevEnergy = useRef(0);

  // Handle manual scene changes from store
  useEffect(() => {
    const scene = store.currentScene;
    if (scene !== engine.current.state.currentScene && !engine.current.state.isTransitioning) {
      engine.current.triggerTransition(scene, store.transitionSpeed);
    }
  }, [store.currentScene, store.transitionSpeed]);

  const handleStateUpdate = useCallback((audioState: SmoothedAudioState) => {
    // Auto-transition logic
    if (store.autoTransition) {
      const now = performance.now() / 1000;
      const timeSinceLastTransition = now - lastAutoTransition.current;

      // Trigger on energy crossing threshold (quiet→loud or vice versa)
      const energyCrossing =
        (prevEnergy.current < 0.4 && audioState.energy > 0.5) ||
        (prevEnergy.current > 0.5 && audioState.energy < 0.3);

      if (energyCrossing && timeSinceLastTransition > 15) {
        const current = engine.current.state.currentScene;
        const affinities = TRANSITION_AFFINITY[current] ?? [];
        if (affinities.length > 0) {
          const next = affinities[Math.floor(Math.random() * affinities.length)];
          engine.current.triggerTransition(next, store.transitionSpeed);
          store.setCurrentScene(next);
          lastAutoTransition.current = now;
        }
      }
      prevEnergy.current = audioState.energy;
    }
  }, [store]);

  // Animation loop for transition engine
  useEffect(() => {
    let prevTime = performance.now();
    let rafId: number;

    const tick = () => {
      const now = performance.now();
      const dt = (now - prevTime) / 1000;
      prevTime = now;

      engine.current.update(dt);
      setTransitionState({ ...engine.current.state });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const currentEntry = VJ_SCENES[transitionState.currentScene];
  const nextEntry = transitionState.nextScene ? VJ_SCENES[transitionState.nextScene] : null;

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
            handleStateUpdate(state);
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
