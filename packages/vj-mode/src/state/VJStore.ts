/**
 * VJStore — Zustand store for VJ mode global state.
 * Controls scene, palette, audio source, transition, performance settings,
 * preset banks, recording state, and remote control status.
 */

import { create } from "zustand";
import type { VisualMode } from "@visualizer/data/types";

export type AudioSource = "mic" | "file";

/** Snapshot of VJ state that can be saved/recalled as a preset */
export interface PresetBank {
  currentScene: VisualMode;
  palettePrimary: number;
  paletteSecondary: number;
  paletteSaturation: number;
  jamDensity: number;
  transitionSpeed: number;
  autoTransition: boolean;
  resolution: number;
}

interface VJState {
  // Scene
  currentScene: VisualMode;
  autoTransition: boolean;
  transitionSpeed: number; // seconds

  // Palette
  palettePrimary: number;   // 0-360 degrees
  paletteSecondary: number; // 0-360 degrees
  paletteSaturation: number; // 0-1
  jamDensity: number; // 0-1

  // Audio
  audioSource: AudioSource;
  audioFileUrl: string | null;

  // Performance
  resolution: number; // multiplier: 1 = full, 0.5 = half
  showFPS: boolean;

  // UI
  showControls: boolean;
  showHUD: boolean;

  // VJ operator controls
  blackout: boolean;
  freeze: boolean;
  lockedScene: boolean;

  // Preset banks (slots 1-9)
  presets: Record<number, PresetBank | null>;

  // Recording state
  isRecording: boolean;
  isPlaying: boolean;

  // Remote control state
  remoteConnected: boolean;
  remoteClientCount: number;

  // Actions
  setCurrentScene: (scene: VisualMode) => void;
  setAutoTransition: (auto: boolean) => void;
  setTransitionSpeed: (speed: number) => void;
  setPalettePrimary: (hue: number) => void;
  setPaletteSecondary: (hue: number) => void;
  setPaletteSaturation: (sat: number) => void;
  setJamDensity: (density: number) => void;
  setAudioSource: (source: AudioSource) => void;
  setAudioFileUrl: (url: string | null) => void;
  setResolution: (res: number) => void;
  setShowFPS: (show: boolean) => void;
  setShowControls: (show: boolean) => void;
  setShowHUD: (show: boolean) => void;
  setBlackout: (on: boolean) => void;
  setFreeze: (on: boolean) => void;
  setLockedScene: (locked: boolean) => void;
  cyclePresetPalette: () => void;
  nudgePrimaryHue: (delta: number) => void;
  nudgeSaturation: (delta: number) => void;

  // Preset actions
  savePreset: (slot: number) => void;
  recallPreset: (slot: number) => void;

  // Recording actions
  setIsRecording: (recording: boolean) => void;
  setIsPlaying: (playing: boolean) => void;

  // Remote actions
  setRemoteConnected: (connected: boolean) => void;
  setRemoteClientCount: (count: number) => void;
}

// Dead-themed palette presets
const PALETTE_PRESETS = [
  { primary: 210, secondary: 270, name: "Cosmic Blue" },
  { primary: 15, secondary: 45, name: "Sunset Gold" },
  { primary: 120, secondary: 180, name: "Forest Emerald" },
  { primary: 280, secondary: 330, name: "Purple Haze" },
  { primary: 0, secondary: 30, name: "Scarlet Fire" },
  { primary: 180, secondary: 240, name: "Deep Teal" },
  { primary: 45, secondary: 90, name: "Morning Dew" },
  { primary: 330, secondary: 30, name: "Roses" },
];

let presetIndex = 0;

const PRESETS_STORAGE_KEY = "vj-preset-banks";

/** Load presets from localStorage */
function loadPresetsFromStorage(): Record<number, PresetBank | null> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Persist presets to localStorage */
function persistPresetsToStorage(presets: Record<number, PresetBank | null>): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // ignore storage errors
  }
}

export const useVJStore = create<VJState>((set, get) => ({
  // Scene defaults
  currentScene: "liquid_light",
  autoTransition: true,
  transitionSpeed: 2,

  // Palette defaults (Cosmic Blue)
  palettePrimary: 210,
  paletteSecondary: 270,
  paletteSaturation: 1,
  jamDensity: 0.5,

  // Audio defaults
  audioSource: "mic",
  audioFileUrl: null,

  // Performance defaults
  resolution: 0.5, // half-res for 60fps
  showFPS: false,

  // UI defaults
  showControls: true,
  showHUD: false,

  // VJ operator defaults
  blackout: false,
  freeze: false,
  lockedScene: false,

  // Preset banks
  presets: loadPresetsFromStorage(),

  // Recording state
  isRecording: false,
  isPlaying: false,

  // Remote control state
  remoteConnected: false,
  remoteClientCount: 0,

  // Actions
  setCurrentScene: (scene) => set({ currentScene: scene }),
  setAutoTransition: (auto) => set({ autoTransition: auto }),
  setTransitionSpeed: (speed) => set({ transitionSpeed: Math.max(0.5, Math.min(10, speed)) }),
  setPalettePrimary: (hue) => set({ palettePrimary: ((hue % 360) + 360) % 360 }),
  setPaletteSecondary: (hue) => set({ paletteSecondary: ((hue % 360) + 360) % 360 }),
  setPaletteSaturation: (sat) => set({ paletteSaturation: Math.max(0, Math.min(1, sat)) }),
  setJamDensity: (density) => set({ jamDensity: Math.max(0, Math.min(1, density)) }),
  setAudioSource: (source) => set({ audioSource: source }),
  setAudioFileUrl: (url) => set({ audioFileUrl: url }),
  setResolution: (res) => set({ resolution: Math.max(0.25, Math.min(1, res)) }),
  setShowFPS: (show) => set({ showFPS: show }),
  setShowControls: (show) => set({ showControls: show }),
  setShowHUD: (show) => set({ showHUD: show }),
  setBlackout: (on) => set({ blackout: on }),
  setFreeze: (on) => set({ freeze: on }),
  setLockedScene: (locked) => set({ lockedScene: locked }),
  cyclePresetPalette: () => {
    presetIndex = (presetIndex + 1) % PALETTE_PRESETS.length;
    const preset = PALETTE_PRESETS[presetIndex];
    set({ palettePrimary: preset.primary, paletteSecondary: preset.secondary });
  },
  nudgePrimaryHue: (delta) =>
    set((s) => ({
      palettePrimary: ((s.palettePrimary + delta) % 360 + 360) % 360,
      paletteSecondary: ((s.paletteSecondary + delta) % 360 + 360) % 360,
    })),
  nudgeSaturation: (delta) =>
    set((s) => ({
      paletteSaturation: Math.max(0, Math.min(1, s.paletteSaturation + delta)),
    })),

  // Preset actions
  savePreset: (slot) => {
    const s = get();
    const preset: PresetBank = {
      currentScene: s.currentScene,
      palettePrimary: s.palettePrimary,
      paletteSecondary: s.paletteSecondary,
      paletteSaturation: s.paletteSaturation,
      jamDensity: s.jamDensity,
      transitionSpeed: s.transitionSpeed,
      autoTransition: s.autoTransition,
      resolution: s.resolution,
    };
    const presets = { ...s.presets, [slot]: preset };
    persistPresetsToStorage(presets);
    set({ presets });
  },

  recallPreset: (slot) => {
    const s = get();
    const preset = s.presets[slot];
    if (!preset) return;
    set({
      currentScene: preset.currentScene,
      palettePrimary: preset.palettePrimary,
      paletteSecondary: preset.paletteSecondary,
      paletteSaturation: preset.paletteSaturation,
      jamDensity: preset.jamDensity,
      transitionSpeed: preset.transitionSpeed,
      autoTransition: preset.autoTransition,
      resolution: preset.resolution,
    });
  },

  // Recording actions
  setIsRecording: (recording) => set({ isRecording: recording }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),

  // Remote actions
  setRemoteConnected: (connected) => set({ remoteConnected: connected }),
  setRemoteClientCount: (count) => set({ remoteClientCount: count }),
}));
