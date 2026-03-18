/**
 * KeyboardShortcuts — keybinding system for VJ mode.
 * Registers global keyboard listeners and dispatches to store actions.
 *
 * Key bindings:
 *   1-0        → Scenes 1-10
 *   Q/W/E/R/T/Y/U/I/O → Scenes 11-19
 *   Space      → Transition to complement
 *   Shift+Space → Flash transition (instant swap)
 *   Tab        → Toggle auto-transition
 *   [ / ]      → Transition speed -/+0.5s
 *   P          → Cycle palette preset
 *   F          → Toggle fullscreen
 *   G          → Toggle FPS counter
 *   H          → Toggle HUD
 *   M          → Switch audio source
 *   B          → Blackout toggle
 *   N          → Freeze toggle
 *   L          → Lock scene (prevent auto-transition)
 *   , / .      → Resolution down/up
 *   ArrowLeft/Right → Hue ±10°
 *   ArrowUp/Down → Saturation ±0.05
 *   Escape     → Toggle control panel
 *   Shift+1-9  → Recall preset bank
 *   Ctrl+Shift+1-9 → Save preset bank
 *   R          → Toggle recording
 *   Shift+R    → Toggle playback (if recording exists)
 *   C          → Toggle remote control
 *   X          → Toggle FX panel
 *   D          → Toggle bloom
 *   V          → Cycle grain strength (N→L→M→H)
 *   Shift+T    → Cycle transition mode (linear→beat_synced→beat_pumped)
 */

import { useVJStore } from "../state/VJStore";
import { SCENE_MODES, VJ_SCENES } from "../scenes/scene-list";

/** Scene select keys for positions 11-19 */
const EXTENDED_SCENE_KEYS = ["q", "w", "e", "t", "y", "u", "i", "o"];

/** Preset slot numbers (1-9) */
const PRESET_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Initialize keyboard shortcut listeners. Returns cleanup function. */
export function initKeyboardShortcuts(): () => void {
  const handler = (e: KeyboardEvent) => {
    // Don't capture when typing in inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const store = useVJStore.getState();
    const key = e.key;
    const lower = key.toLowerCase();

    // Ctrl+Shift+1-9: Save preset bank
    if (e.ctrlKey && e.shiftKey && PRESET_KEYS.includes(key)) {
      const slot = parseInt(key, 10);
      store.savePreset(slot);
      return;
    }

    // Shift+1-9: Recall preset bank (check before bare number keys)
    if (e.shiftKey && !e.ctrlKey && PRESET_KEYS.includes(key)) {
      const slot = parseInt(key, 10);
      store.recallPreset(slot);
      return;
    }

    // Number keys → scene select (1-10) — only without modifiers
    if (!e.shiftKey && !e.ctrlKey && !e.altKey) {
      const numIdx = "1234567890".indexOf(key);
      if (numIdx >= 0 && SCENE_MODES[numIdx]) {
        store.setCurrentScene(SCENE_MODES[numIdx]);
        return;
      }
    }

    // Extended scene keys Q-O → scenes 11-19 (skip R — it's recording)
    const extIdx = EXTENDED_SCENE_KEYS.indexOf(lower);
    if (extIdx >= 0 && !e.shiftKey && !e.ctrlKey) {
      const sceneIdx = 10 + extIdx;
      if (SCENE_MODES[sceneIdx]) {
        store.setCurrentScene(SCENE_MODES[sceneIdx]);
      }
      return;
    }

    switch (key) {
      case " ": // Space — trigger manual transition to complement
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Space: Flash transition (instant swap to complement)
          const current = store.currentScene;
          const entry = VJ_SCENES[current];
          if (entry) {
            store.setCurrentScene(entry.complement);
          }
        } else {
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

      case "h":
      case "H":
        store.setShowHUD(!store.showHUD);
        break;

      case "m":
      case "M":
        store.setAudioSource(store.audioSource === "mic" ? "file" : "mic");
        break;

      case "b":
      case "B":
        store.setBlackout(!store.blackout);
        break;

      case "n":
      case "N":
        store.setFreeze(!store.freeze);
        break;

      case "l":
      case "L":
        store.setLockedScene(!store.lockedScene);
        break;

      case "r":
        // R: toggle recording
        if (!e.shiftKey) {
          store.setIsRecording(!store.isRecording);
        }
        break;

      case "R":
        // Shift+R: toggle playback
        if (e.shiftKey) {
          store.setIsPlaying(!store.isPlaying);
        }
        break;

      case "T":
        // Shift+T: cycle transition mode
        if (e.shiftKey) {
          store.cycleTransitionMode();
        }
        break;

      case "x":
      case "X":
        // X: toggle FX panel
        store.setShowFXPanel(!store.showFXPanel);
        break;

      case "d":
        // D: toggle bloom
        if (!e.shiftKey) {
          store.setFxBloom(!store.fxBloom);
        }
        break;

      case "v":
        // V: cycle grain strength
        if (!e.shiftKey) {
          store.cycleGrainStrength();
        }
        break;

      case ",": // Resolution down
        store.setResolution(store.resolution - 0.125);
        break;

      case ".": // Resolution up
        store.setResolution(store.resolution + 0.125);
        break;

      case "ArrowLeft":
        store.nudgePrimaryHue(-10);
        break;

      case "ArrowRight":
        store.nudgePrimaryHue(10);
        break;

      case "ArrowUp":
        e.preventDefault();
        store.nudgeSaturation(0.05);
        break;

      case "ArrowDown":
        e.preventDefault();
        store.nudgeSaturation(-0.05);
        break;

      case "Escape":
        store.setShowControls(!store.showControls);
        break;
    }
  };

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
