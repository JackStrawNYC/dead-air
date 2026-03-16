/**
 * KeyboardShortcuts — keybinding system for VJ mode.
 * Registers global keyboard listeners and dispatches to store actions.
 */

import { useVJStore } from "../state/VJStore";
import { SCENE_MODES, VJ_SCENES } from "../scenes/scene-list";

/** Keyboard shortcut map */
const SHORTCUTS: Record<string, (store: ReturnType<typeof useVJStore.getState>) => void> = {
  "1": (s) => SCENE_MODES[0] && s.setCurrentScene(SCENE_MODES[0]),
  "2": (s) => SCENE_MODES[1] && s.setCurrentScene(SCENE_MODES[1]),
  "3": (s) => SCENE_MODES[2] && s.setCurrentScene(SCENE_MODES[2]),
  "4": (s) => SCENE_MODES[3] && s.setCurrentScene(SCENE_MODES[3]),
  "5": (s) => SCENE_MODES[4] && s.setCurrentScene(SCENE_MODES[4]),
  "6": (s) => SCENE_MODES[5] && s.setCurrentScene(SCENE_MODES[5]),
  "7": (s) => SCENE_MODES[6] && s.setCurrentScene(SCENE_MODES[6]),
  "8": (s) => SCENE_MODES[7] && s.setCurrentScene(SCENE_MODES[7]),
  "9": (s) => SCENE_MODES[8] && s.setCurrentScene(SCENE_MODES[8]),
  "0": (s) => SCENE_MODES[9] && s.setCurrentScene(SCENE_MODES[9]),
};

/** Initialize keyboard shortcut listeners. Returns cleanup function. */
export function initKeyboardShortcuts(): () => void {
  const handler = (e: KeyboardEvent) => {
    // Don't capture when typing in inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const store = useVJStore.getState();
    const key = e.key;

    // Number keys → scene select
    if (SHORTCUTS[key]) {
      SHORTCUTS[key](store);
      return;
    }

    switch (key) {
      case " ": // Space — trigger manual transition to complement
        e.preventDefault();
        {
          const current = store.currentScene;
          const entry = VJ_SCENES[current];
          if (entry) store.setCurrentScene(entry.complement);
        }
        break;

      case "Tab": // Toggle auto-transition
        e.preventDefault();
        store.setAutoTransition(!store.autoTransition);
        break;

      case "[": // Transition speed -0.5s
        store.setTransitionSpeed(store.transitionSpeed - 0.5);
        break;

      case "]": // Transition speed +0.5s
        store.setTransitionSpeed(store.transitionSpeed + 0.5);
        break;

      case "p":
      case "P":
        store.cyclePresetPalette();
        break;

      case "f":
      case "F":
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
        } else {
          document.exitFullscreen();
        }
        break;

      case "g":
      case "G":
        store.setShowFPS(!store.showFPS);
        break;

      case "m":
      case "M":
        store.setAudioSource(store.audioSource === "mic" ? "file" : "mic");
        break;

      case "ArrowLeft":
        store.nudgePrimaryHue(-10);
        break;

      case "ArrowRight":
        store.nudgePrimaryHue(10);
        break;

      case "Escape":
        store.setShowControls(!store.showControls);
        break;
    }
  };

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
