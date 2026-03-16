/**
 * VJStore — Zustand store for VJ mode global state.
 * Controls scene, palette, audio source, transition, and performance settings.
 */

import { create } from "zustand";
import type { VisualMode } from "@visualizer/data/types";

export type AudioSource = "mic" | "file";

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
  cyclePresetPalette: () => void;
  nudgePrimaryHue: (delta: number) => void;
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

export const useVJStore = create<VJState>((set) => ({
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
}));
