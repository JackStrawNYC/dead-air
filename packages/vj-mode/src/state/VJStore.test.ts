import { describe, it, expect, beforeEach } from "vitest";
import { useVJStore } from "./VJStore";

describe("VJStore", () => {
  beforeEach(() => {
    // Reset store to defaults
    const store = useVJStore.getState();
    store.setCurrentScene("liquid_light");
    store.setPalettePrimary(210);
    store.setPaletteSecondary(270);
    store.setPaletteSaturation(1);
    store.setJamDensity(0.5);
    store.setTransitionSpeed(2);
    store.setAutoTransition(true);
    store.setResolution(0.5);
  });

  describe("preset banks", () => {
    it("saves and recalls a preset", () => {
      const store = useVJStore.getState();

      // Set up a specific state
      store.setCurrentScene("inferno");
      store.setPalettePrimary(10);
      store.setPaletteSecondary(40);
      store.setPaletteSaturation(0.8);
      store.setJamDensity(0.7);

      // Save to slot 1
      store.savePreset(1);

      // Change state
      store.setCurrentScene("aurora");
      store.setPalettePrimary(180);

      // Recall slot 1
      store.recallPreset(1);

      const state = useVJStore.getState();
      expect(state.currentScene).toBe("inferno");
      expect(state.palettePrimary).toBe(10);
      expect(state.paletteSecondary).toBe(40);
      expect(state.paletteSaturation).toBe(0.8);
      expect(state.jamDensity).toBe(0.7);
    });

    it("recalling empty slot does nothing", () => {
      const store = useVJStore.getState();
      store.setCurrentScene("inferno");

      // Recall empty slot
      store.recallPreset(9);

      expect(useVJStore.getState().currentScene).toBe("inferno");
    });

    it("supports multiple preset slots", () => {
      const store = useVJStore.getState();

      // Save slot 1
      store.setCurrentScene("inferno");
      store.savePreset(1);

      // Save slot 2
      store.setCurrentScene("aurora");
      store.savePreset(2);

      // Recall slot 1
      store.recallPreset(1);
      expect(useVJStore.getState().currentScene).toBe("inferno");

      // Recall slot 2
      store.recallPreset(2);
      expect(useVJStore.getState().currentScene).toBe("aurora");
    });

    it("preset includes all expected fields", () => {
      const store = useVJStore.getState();
      store.setCurrentScene("deep_ocean");
      store.setPalettePrimary(120);
      store.setPaletteSecondary(240);
      store.setPaletteSaturation(0.6);
      store.setJamDensity(0.3);
      store.setTransitionSpeed(4);
      store.setAutoTransition(false);
      store.setResolution(0.75);

      store.savePreset(3);

      const preset = useVJStore.getState().presets[3];
      expect(preset).toBeDefined();
      expect(preset!.currentScene).toBe("deep_ocean");
      expect(preset!.palettePrimary).toBe(120);
      expect(preset!.paletteSecondary).toBe(240);
      expect(preset!.paletteSaturation).toBe(0.6);
      expect(preset!.jamDensity).toBe(0.3);
      expect(preset!.transitionSpeed).toBe(4);
      expect(preset!.autoTransition).toBe(false);
      expect(preset!.resolution).toBe(0.75);
    });
  });

  describe("recording state", () => {
    it("toggles recording state", () => {
      const store = useVJStore.getState();
      expect(store.isRecording).toBe(false);
      store.setIsRecording(true);
      expect(useVJStore.getState().isRecording).toBe(true);
      store.setIsRecording(false);
      expect(useVJStore.getState().isRecording).toBe(false);
    });

    it("toggles playback state", () => {
      const store = useVJStore.getState();
      expect(store.isPlaying).toBe(false);
      store.setIsPlaying(true);
      expect(useVJStore.getState().isPlaying).toBe(true);
    });
  });

  describe("remote control state", () => {
    it("tracks remote connection", () => {
      const store = useVJStore.getState();
      expect(store.remoteConnected).toBe(false);
      store.setRemoteConnected(true);
      expect(useVJStore.getState().remoteConnected).toBe(true);
    });

    it("tracks client count", () => {
      const store = useVJStore.getState();
      store.setRemoteClientCount(3);
      expect(useVJStore.getState().remoteClientCount).toBe(3);
    });
  });
});
