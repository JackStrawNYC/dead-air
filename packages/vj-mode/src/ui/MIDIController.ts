/**
 * MIDIController — maps MIDI CC messages to VJ parameters.
 * Uses the Web MIDI API. Connects to the first available MIDI input.
 *
 * Default CC mapping (customizable):
 *   CC 1  (Mod Wheel)  → Jam Density (0-1)
 *   CC 2  (Breath)     → Palette Primary Hue (0-360)
 *   CC 3               → Palette Secondary Hue (0-360)
 *   CC 4               → Palette Saturation (0-1)
 *   CC 7  (Volume)     → Transition Speed (0.5-10s)
 *   CC 14              → Next Scene (value > 64 triggers)
 *   CC 15              → Cycle Palette Preset (value > 64 triggers)
 *   CC 64 (Sustain)    → Toggle Auto-Transition
 */

import { useVJStore } from "../state/VJStore";
import { VJ_SCENE_LIST, VJ_SCENES } from "../scenes/scene-list";

export interface MIDICCMapping {
  cc: number;
  action: "jamDensity" | "palettePrimary" | "paletteSecondary" | "paletteSaturation" | "transitionSpeed" | "nextScene" | "cyclePalette" | "toggleAutoTransition" | "resolution" | "blackout" | "freeze" | "toggleBloom" | "cycleGrain" | "toggleCRT" | "bloomThreshold" | "feedbackDecay" | "cycleTransitionMode" | "toggleFlare" | "toggleAnaglyph";
}

const DEFAULT_MAPPINGS: MIDICCMapping[] = [
  { cc: 1, action: "jamDensity" },
  { cc: 2, action: "palettePrimary" },
  { cc: 3, action: "paletteSecondary" },
  { cc: 4, action: "paletteSaturation" },
  { cc: 7, action: "transitionSpeed" },
  { cc: 9, action: "resolution" },
  { cc: 10, action: "blackout" },
  { cc: 11, action: "freeze" },
  { cc: 14, action: "nextScene" },
  { cc: 15, action: "cyclePalette" },
  { cc: 16, action: "toggleBloom" },
  { cc: 17, action: "cycleGrain" },
  { cc: 18, action: "toggleCRT" },
  { cc: 19, action: "bloomThreshold" },
  { cc: 20, action: "feedbackDecay" },
  { cc: 21, action: "cycleTransitionMode" },
  { cc: 22, action: "toggleFlare" },
  { cc: 23, action: "toggleAnaglyph" },
  { cc: 64, action: "toggleAutoTransition" },
];

let midiAccess: MIDIAccess | null = null;
let currentMappings: MIDICCMapping[] = DEFAULT_MAPPINGS;
let sceneIndex = 0;
let cleanup: (() => void) | null = null;

function handleMIDIMessage(event: MIDIMessageEvent): void {
  const data = event.data;
  if (!data || data.length < 3) return;

  const status = data[0] & 0xf0;
  const store = useVJStore.getState();

  // Handle Note On messages → flash transition to complement
  if (status === 0x90 && data[2] > 0) {
    const current = store.currentScene;
    const entry = VJ_SCENES[current];
    if (entry) {
      store.setCurrentScene(entry.complement);
    }
    return;
  }

  if (status !== 0xb0) return; // Only handle CC messages beyond this point

  const cc = data[1];
  const value = data[2]; // 0-127
  const normalized = value / 127; // 0-1

  const mapping = currentMappings.find((m) => m.cc === cc);
  if (!mapping) return;

  switch (mapping.action) {
    case "jamDensity":
      store.setJamDensity(normalized);
      break;
    case "palettePrimary":
      store.setPalettePrimary(normalized * 360);
      break;
    case "paletteSecondary":
      store.setPaletteSecondary(normalized * 360);
      break;
    case "paletteSaturation":
      store.setPaletteSaturation(normalized);
      break;
    case "transitionSpeed":
      store.setTransitionSpeed(0.5 + normalized * 9.5); // 0.5-10s
      break;
    case "nextScene":
      if (value > 64) {
        sceneIndex = (sceneIndex + 1) % VJ_SCENE_LIST.length;
        store.setCurrentScene(VJ_SCENE_LIST[sceneIndex].mode);
      }
      break;
    case "cyclePalette":
      if (value > 64) {
        store.cyclePresetPalette();
      }
      break;
    case "toggleAutoTransition":
      if (value > 64) {
        store.setAutoTransition(!store.autoTransition);
      }
      break;
    case "resolution":
      store.setResolution(0.25 + normalized * 0.75); // 0.25-1.0
      break;
    case "blackout":
      if (value > 64) {
        store.setBlackout(!store.blackout);
      }
      break;
    case "freeze":
      if (value > 64) {
        store.setFreeze(!store.freeze);
      }
      break;
    case "toggleBloom":
      if (value > 64) {
        store.setFxBloom(!store.fxBloom);
      }
      break;
    case "cycleGrain":
      if (value > 64) {
        store.cycleGrainStrength();
      }
      break;
    case "toggleCRT":
      if (value > 64) {
        store.setFxCRT(!store.fxCRT);
      }
      break;
    case "bloomThreshold":
      store.setFxBloomThreshold(normalized);
      break;
    case "feedbackDecay":
      store.setFxFeedbackDecay(0.8 + normalized * 0.2); // 0.80-1.00
      break;
    case "cycleTransitionMode":
      if (value > 64) {
        store.cycleTransitionMode();
      }
      break;
    case "toggleFlare":
      if (value > 64) {
        store.setFxFlare(!store.fxFlare);
      }
      break;
    case "toggleAnaglyph":
      if (value > 64) {
        store.setFxAnaglyph(!store.fxAnaglyph);
      }
      break;
  }
}

function connectInputs(access: MIDIAccess): void {
  for (const input of access.inputs.values()) {
    input.onmidimessage = handleMIDIMessage;
  }
}

/**
 * Initialize MIDI controller support.
 * Returns a cleanup function to disconnect.
 * Resolves to true if MIDI is available, false otherwise.
 */
export async function initMIDI(mappings?: MIDICCMapping[]): Promise<boolean> {
  if (mappings) currentMappings = mappings;

  if (!navigator.requestMIDIAccess) {
    return false;
  }

  try {
    midiAccess = await navigator.requestMIDIAccess();
    connectInputs(midiAccess);

    // Listen for hot-plugged devices
    midiAccess.onstatechange = () => {
      if (midiAccess) connectInputs(midiAccess);
    };

    cleanup = () => {
      if (midiAccess) {
        for (const input of midiAccess.inputs.values()) {
          input.onmidimessage = null;
        }
        midiAccess.onstatechange = null;
        midiAccess = null;
      }
    };

    return true;
  } catch {
    return false;
  }
}

/** Disconnect all MIDI inputs. */
export function disposeMIDI(): void {
  cleanup?.();
  cleanup = null;
}

/** Get the current CC mappings. */
export function getMIDIMappings(): MIDICCMapping[] {
  return [...currentMappings];
}

/** Update CC mappings at runtime. */
export function setMIDIMappings(mappings: MIDICCMapping[]): void {
  currentMappings = mappings;
}

/** Check if MIDI is connected and active. */
export function isMIDIActive(): boolean {
  return midiAccess !== null;
}
